// Re-embed rows carrying a stale model stamp.
//
// Every row records the emb_model and emb_dim its vector was produced with, and
// retrieval filters on both (search.mjs: `AND emb_model = ? AND emb_dim = ?`).
// That is deliberate — a cosine between vectors from two different models is a
// number with no meaning, so mixing them would silently rank badly rather than
// fail. The cost of that safety is that changing the pinned model in embed.mjs
// makes every existing row invisible until it is rewritten. This is the rewrite.
//
// Slice 1.6 swapped all-MiniLM-L6-v2 for gte-small, which is exactly the event
// the per-row stamp was designed for: a migration, not a rebuild from scratch.
//
// Scope, deliberately narrow: text in, vector out, stamp updated. No dedup (two
// rows that only look like duplicates under the new model are a consolidation
// question, not a re-embed one), no status changes, no timestamp churn —
// updated_at is left alone because re-embedding is not an edit to the memory,
// and decay reads that column.

import { withDb } from './db.mjs';
import { EMB_DIM, EMB_MODEL, embedMany, vectorBlob } from './embed.mjs';
import { resolvePaths } from './paths.mjs';

/** Matches transfer.mjs — the batch size PLAN measured at 43ms for 32. */
export const EMBED_BATCH = 32;

const SELECT_STALE = `SELECT id, uid, text, emb_model, emb_dim
                        FROM memories
                       WHERE emb IS NOT NULL
                         AND (emb_model IS NOT ? OR emb_dim IS NOT ?)
                       ORDER BY id`;

const UPDATE_ROW = `UPDATE memories
                       SET emb = vector32(?), emb_model = ?, emb_dim = ?
                     WHERE id = ?`;

/**
 * Rows whose vector was made by a different model than the one pinned now.
 *
 * `IS NOT` rather than `!=` so a NULL stamp counts as stale: SQL's three-valued
 * logic would drop those rows from a `!=` comparison, and a row with a vector
 * but no stamp is precisely the kind of thing worth repairing.
 *
 * Tombstoned rows (emb IS NULL) are skipped rather than filled in. Pruning
 * dropped those vectors on purpose to bound file growth, and quietly
 * resurrecting them here would undo that decision on the next model swap.
 */
export async function findStale(conn, { embModel = EMB_MODEL, embDim = EMB_DIM } = {}) {
  return conn.all(SELECT_STALE, embModel, embDim);
}

/** What the store looks like right now, grouped by stamp — what `--dry-run` reports. */
export async function stampCounts(conn) {
  return conn.all(
    `SELECT emb_model, emb_dim, count(*) AS n,
            sum(CASE WHEN emb IS NULL THEN 1 ELSE 0 END) AS tombstoned
       FROM memories
      GROUP BY emb_model, emb_dim
      ORDER BY n DESC`,
  );
}

/**
 * Rewrite the vectors of every stale row.
 *
 * One transaction: a half-migrated store is one where some memories are
 * retrievable and some are not, with nothing recording which. Failing back to
 * the old stamps is recoverable — the user re-runs — so the whole thing commits
 * or none of it does.
 *
 * These are UPDATEs, so they escape the insert pathology slice 1.5 found (the
 * `superseded_by INTEGER REFERENCES memories(id)` self-reference makes every
 * INSERT cost O(rows) with foreign_keys ON). Measured on the 200-row seed:
 * a full re-embed is under a second, dominated by the forward passes.
 */
export async function reembedStale(
  conn,
  { paths = resolvePaths(), env = process.env, dryRun = false, batch = EMBED_BATCH, onProgress } = {},
) {
  const before = await stampCounts(conn);
  const stale = await findStale(conn);

  const report = {
    model: EMB_MODEL,
    dim: EMB_DIM,
    total: (await conn.get('SELECT count(*) AS n FROM memories'))?.n ?? 0,
    stale: stale.length,
    reembedded: 0,
    batches: 0,
    dryRun,
    before,
    after: before,
  };

  if (stale.length === 0 || dryRun) return report;

  // Embed outside the transaction: the forward passes are the slow part and
  // holding a write lock across them would block every other mem process for
  // the duration, for no benefit — the vectors do not depend on the database.
  const vectors = [];
  for (let i = 0; i < stale.length; i += batch) {
    const slice = stale.slice(i, i + batch);
    vectors.push(...(await embedMany(slice.map((r) => r.text), { paths, env, role: 'passage' })));
    report.batches += 1;
    onProgress?.({ done: Math.min(i + batch, stale.length), total: stale.length });
  }

  const apply = conn.transactionAsync(async (tx) => {
    for (let i = 0; i < stale.length; i += 1) {
      await tx.run(UPDATE_ROW, vectorBlob(vectors[i]), EMB_MODEL, EMB_DIM, stale[i].id);
    }
  });
  await apply.immediate();

  report.reembedded = stale.length;
  report.after = await stampCounts(conn);
  return report;
}

/** Module-level entry point, matching the shape of manage.mjs's wrappers. */
export async function reembed({ conn, paths, env = process.env, ...opts } = {}) {
  const run = (c) => reembedStale(c, { ...opts, paths, env });
  return conn ? run(conn) : withDb(run, { paths, env });
}
