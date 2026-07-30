// `mem reembed` — the migration a model swap turns into.
//
// The scenario under test is the one slice 1.6 actually created: a store whose
// rows were embedded by all-MiniLM-L6-v2 and a plugin that now pins gte-small.
// Those rows are invisible to search until rewritten, because retrieval filters
// on emb_model rather than comparing vectors across two spaces — so the failure
// mode being guarded is silent, not loud, and worth a test.
//
// Rows are seeded through SQL with a synthetic vector and a stale stamp, so the
// selection, transaction and reporting all run without the model. The one test
// that needs real vectors says so and skips without the cache.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';

import { withDb } from '../../src/db.mjs';
import { EMB_DIM, EMB_MODEL, cosine, embed, modelCached } from '../../src/embed.mjs';
import { resolvePaths } from '../../src/paths.mjs';
import { findStale, findTombstoned, reembedStale, stampCounts } from '../../src/reembed.mjs';

const paths = resolvePaths();
const needsModel = { skip: modelCached(paths) ? false : `model not cached — run 'mem warm'` };

const scratch = mkdtempSync(join(tmpdir(), 'mem-reembed-test-'));
after(() => rmSync(scratch, { recursive: true, force: true }));

let n = 0;
const scratchPaths = () => ({ ...paths, dbPath: join(scratch, `reembed-${n++}.db`) });

/** The stamp these rows are pretending to carry: the model slice 1.6 replaced. */
const OLD_MODEL = 'Xenova/all-MiniLM-L6-v2@q8';

function fakeVector(seed) {
  const v = new Float32Array(EMB_DIM);
  for (let i = 0; i < EMB_DIM; i += 1) v[i] = Math.sin(seed * (i + 1));
  return Buffer.from(v.buffer);
}

const INSERT = `INSERT INTO memories (uid, kind, scope, project_key, text, emb, emb_model, emb_dim,
                                      status, created_at, updated_at)
                VALUES (?, 'fact', 'global', NULL, ?, vector32(?), ?, ?, 'active', 1, 1)`;

/**
 * A row the pruning ladder tombstoned: text and stamp intact, vector gone. The
 * NULL is a literal because `vector32(NULL)` throws, and this insert is only legal
 * at all since the schema v2 rebuild in slice 5a.3.
 */
const TOMBSTONE_INSERT = `INSERT INTO memories (uid, kind, scope, project_key, text, emb, emb_model, emb_dim,
                                                status, created_at, updated_at)
                          VALUES (?, 'fact', 'global', NULL, ?, NULL, ?, ?, ?, 1, 1)`;

/**
 * A store with `stale` rows stamped with the old model and `fresh` rows already
 * on the current one — the realistic mid-migration shape, not an all-or-nothing
 * one, because the interesting bug is re-embedding rows that did not need it.
 *
 * Tombstoned rows were the gap here from slice 1.6 until 5a.3: reembed.mjs has
 * always skipped `emb IS NULL` because pruning drops those vectors deliberately,
 * but schema v1's `emb BLOB NOT NULL` made such a row impossible to insert, so
 * the guard could not be tested. The v2 rebuild closed that, and the tombstone
 * tests below are what the guard had been waiting for.
 */
async function seedStore(conn, { stale = 3, fresh = 0 } = {}) {
  for (let i = 0; i < stale; i += 1) {
    await conn.run(INSERT, `stale-${i}`, `stale memory number ${i}`, fakeVector(i + 1), OLD_MODEL, 384);
  }
  for (let i = 0; i < fresh; i += 1) {
    await conn.run(INSERT, `fresh-${i}`, `fresh memory number ${i}`, fakeVector(100 + i), EMB_MODEL, EMB_DIM);
  }
}

const withStore = (opts, fn) =>
  withDb(async (conn) => {
    await seedStore(conn, opts);
    return fn(conn);
  }, { paths: scratchPaths() });

const allRows = (conn) => conn.all('SELECT * FROM memories ORDER BY id');

describe('findStale', () => {
  it('selects rows stamped with another model and leaves current ones alone', async () => {
    await withStore({ stale: 3, fresh: 2 }, async (conn) => {
      const stale = await findStale(conn);
      assert.equal(stale.length, 3);
      assert.deepEqual(stale.map((r) => r.uid).sort(), ['stale-0', 'stale-1', 'stale-2']);
    });
  });

  // A differing dimension is a different vector space just as surely as a
  // differing name, and 768d models were on the table in slice 1.6.
  it('treats a matching name at the wrong dimension as stale', async () => {
    await withStore({ stale: 0 }, async (conn) => {
      await conn.run(INSERT, 'wide', 'stored by a 768d build', fakeVector(3), EMB_MODEL, 768);
      const stale = await findStale(conn);
      assert.deepEqual(stale.map((r) => r.uid), ['wide']);
    });
  });

  // Waiting since slice 1.6 for a schema that could hold the row. Pruning dropped
  // that vector on purpose to bound file growth, and quietly refilling it on the
  // next model swap would undo the decision behind the user's back.
  it('skips a tombstoned row even when its stamp is stale', async () => {
    await withStore({ stale: 1 }, async (conn) => {
      await conn.run(TOMBSTONE_INSERT, 'tomb', 'archived long ago, vector dropped', OLD_MODEL, 384, 'archived');
      const stale = await findStale(conn);
      assert.deepEqual(stale.map((r) => r.uid), ['stale-0']);
    });
  });
});

// PLAN rung 3 is only reversible if there is a way back: "Restoring requires
// re-embedding, which is 11ms." `mem forget --restore` puts the status back but
// cannot embed (manage.mjs is model-free on purpose), so the row lands active with
// no vector — findable lexically, invisible to the vector leg. This closes it.
describe('findTombstoned', () => {
  it('finds a restored tombstone and leaves the still-archived ones alone', async () => {
    await withStore({ stale: 0 }, async (conn) => {
      await conn.run(TOMBSTONE_INSERT, 'still-archived', 'nobody restored this', EMB_MODEL, EMB_DIM, 'archived');
      await conn.run(TOMBSTONE_INSERT, 'restored', 'somebody restored this', EMB_MODEL, EMB_DIM, 'active');
      await conn.run(TOMBSTONE_INSERT, 'restored-staged', 'and this went back to the queue', EMB_MODEL, EMB_DIM, 'staged');

      const found = await findTombstoned(conn);
      assert.deepEqual(found.map((r) => r.uid), ['restored', 'restored-staged']);
    });
  });

  it('is what --tombstoned adds to the work list, and nothing else', async () => {
    await withStore({ stale: 2 }, async (conn) => {
      await conn.run(TOMBSTONE_INSERT, 'restored', 'back in retrieval with no vector', EMB_MODEL, EMB_DIM, 'active');
      await conn.run(TOMBSTONE_INSERT, 'archived', 'left alone', EMB_MODEL, EMB_DIM, 'archived');

      const without = await reembedStale(conn, { paths, dryRun: true });
      assert.equal(without.stale, 2);
      assert.equal(without.restored, 0);
      assert.equal(without.pending, 2);

      const with_ = await reembedStale(conn, { paths, dryRun: true, tombstoned: true });
      assert.equal(with_.stale, 2);
      assert.equal(with_.restored, 1);
      assert.equal(with_.pending, 3);
    });
  });

  it('refills the restored row for real, so it is findable by vector again', { ...needsModel }, async () => {
    await withStore({ stale: 0 }, async (conn) => {
      await conn.run(
        TOMBSTONE_INSERT, 'restored', 'never force push a branch somebody else is working on',
        EMB_MODEL, EMB_DIM, 'active',
      );
      await conn.run(TOMBSTONE_INSERT, 'archived', 'stays empty', EMB_MODEL, EMB_DIM, 'archived');

      const report = await reembedStale(conn, { paths, tombstoned: true });
      assert.equal(report.reembedded, 1);

      const rows = await conn.all('SELECT uid, emb IS NULL AS empty FROM memories ORDER BY uid');
      assert.deepEqual(rows, [
        { uid: 'archived', empty: 1 },
        { uid: 'restored', empty: 0 },
      ]);
      assert.deepEqual(await findTombstoned(conn), []);

      // And the refilled vector is the one this model makes for that text.
      const vector = await embed('never force push a branch somebody else is working on', { paths });
      const hit = await conn.get(
        "SELECT vector_distance_cos(emb, vector32(?)) AS dist FROM memories WHERE uid = 'restored'",
        Buffer.from(Float32Array.from(vector).buffer),
      );
      assert.ok(1 - hit.dist > 0.99, `similarity ${1 - hit.dist}`);
    });
  });
});

describe('reembedStale', () => {
  it('rewrites the stale rows and restamps them', { ...needsModel }, async () => {
    await withStore({ stale: 3, fresh: 2 }, async (conn) => {
      const before = await allRows(conn);
      const report = await reembedStale(conn, { paths });

      assert.equal(report.stale, 3);
      assert.equal(report.reembedded, 3);
      assert.equal(report.total, 5);

      const after = await allRows(conn);
      assert.equal(after.filter((r) => r.emb_model === EMB_MODEL).length, 5);
      assert.equal(after.filter((r) => r.emb_dim === EMB_DIM).length, 5);
      assert.equal(await findStale(conn).then((r) => r.length), 0);

      // The rewritten vectors are the real thing, not a copy of the old blob.
      const changed = after.find((r) => r.uid === 'stale-0');
      const original = before.find((r) => r.uid === 'stale-0');
      assert.notDeepEqual(Buffer.from(changed.emb), Buffer.from(original.emb));

      // ...and specifically, the vector this model produces for that text.
      // 0.99 rather than 0.999: reembed batches (embedMany) and this check
      // embeds one at a time, and embed.mjs documents the q8 kernel as
      // batch-size sensitive to about that much. Anything near 1.0 proves the
      // text was really re-encoded; the residue is quantisation, not a bug.
      const expected = await embed(changed.text, { paths });
      const blob = Buffer.from(changed.emb);
      const stored = new Float32Array(blob.buffer, blob.byteOffset, EMB_DIM);
      assert.ok(cosine(expected, stored) > 0.99, `stored vector is not this model's output`);
    });
  });

  it('leaves rows that were already current byte for byte', { ...needsModel }, async () => {
    await withStore({ stale: 1, fresh: 2 }, async (conn) => {
      const before = await allRows(conn);
      await reembedStale(conn, { paths });
      const after = await allRows(conn);

      for (const uid of ['fresh-0', 'fresh-1']) {
        const a = before.find((r) => r.uid === uid);
        const b = after.find((r) => r.uid === uid);
        assert.deepEqual(Buffer.from(b.emb), Buffer.from(a.emb), `${uid} was rewritten needlessly`);
      }
    });
  });

  // Re-embedding is not an edit to the memory. decay reads updated_at, so
  // touching it here would silently make every memory look freshly restated.
  it('does not disturb text, status or timestamps', { ...needsModel }, async () => {
    await withStore({ stale: 2 }, async (conn) => {
      const before = await allRows(conn);
      await reembedStale(conn, { paths });
      const after = await allRows(conn);

      for (let i = 0; i < before.length; i += 1) {
        for (const col of ['uid', 'text', 'status', 'kind', 'created_at', 'updated_at']) {
          assert.equal(after[i][col], before[i][col], `${col} changed`);
        }
      }
    });
  });

  it('reports without writing under dryRun', async () => {
    await withStore({ stale: 3, fresh: 1 }, async (conn) => {
      const before = await allRows(conn);
      const report = await reembedStale(conn, { paths, dryRun: true });

      assert.equal(report.dryRun, true);
      assert.equal(report.stale, 3);
      assert.equal(report.reembedded, 0);
      assert.deepEqual(await allRows(conn), before);
    });
  });

  it('is a no-op on a store that is already current', async () => {
    await withStore({ stale: 0, fresh: 3 }, async (conn) => {
      const report = await reembedStale(conn, { paths });
      assert.equal(report.stale, 0);
      assert.equal(report.reembedded, 0);
      assert.equal(report.batches, 0);
    });
  });

  it('is idempotent — a second run finds nothing to do', { ...needsModel }, async () => {
    await withStore({ stale: 2 }, async (conn) => {
      await reembedStale(conn, { paths });
      const second = await reembedStale(conn, { paths });
      assert.equal(second.stale, 0);
      assert.equal(second.reembedded, 0);
    });
  });

  it('crosses batch boundaries', { ...needsModel }, async () => {
    await withStore({ stale: 7 }, async (conn) => {
      const report = await reembedStale(conn, { paths, batch: 3 });
      assert.equal(report.reembedded, 7);
      assert.equal(report.batches, 3);
      assert.equal(await findStale(conn).then((r) => r.length), 0);
    });
  });

  it('reports progress as it goes', { ...needsModel }, async () => {
    await withStore({ stale: 5 }, async (conn) => {
      const seen = [];
      await reembedStale(conn, { paths, batch: 2, onProgress: (p) => seen.push(p) });
      assert.deepEqual(seen, [
        { done: 2, total: 5 },
        { done: 4, total: 5 },
        { done: 5, total: 5 },
      ]);
    });
  });
});

describe('stampCounts', () => {
  it('groups the store by the space its vectors live in', async () => {
    await withStore({ stale: 3, fresh: 2 }, async (conn) => {
      const counts = await stampCounts(conn);
      const old = counts.find((c) => c.emb_model === OLD_MODEL);
      const current = counts.find((c) => c.emb_model === EMB_MODEL);

      assert.equal(old.n, 3);
      assert.equal(old.tombstoned, 0);
      assert.equal(current.n, 2);
      assert.equal(current.tombstoned, 0);
    });
  });
});

// --------------------------------------------------------------------- CLI --

const CLI = join(paths.pluginRoot, 'bin', 'mem');

/**
 * A data directory of its own, with the real deps and model cache symlinked in
 * — same trick seed.mjs uses, so the CLI runs offline without a download.
 */
function cliDataDir() {
  const home = mkdtempSync(join(scratch, 'data-'));
  for (const name of ['node_modules', 'models']) {
    try {
      symlinkSync(join(paths.dataDir, name), join(home, name));
    } catch {
      /* absent is fine; the test that needs it skips */
    }
  }
  return home;
}

function cli(dataDir, ...args) {
  return spawnSync(process.execPath, [CLI, ...args], {
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_PLUGIN_DATA: dataDir, MEM_PROJECT_KEY: 'test/reembed' },
  });
}

describe('mem reembed', () => {
  it('says so when there is nothing to do', { ...needsModel }, async () => {
    const dataDir = cliDataDir();
    let out = cli(dataDir, 'add', 'always use pnpm to install dependencies');
    assert.equal(out.status, 0, out.stderr);

    out = cli(dataDir, 'reembed');
    assert.equal(out.status, 0, out.stderr);
    assert.match(out.stdout, /already embedded with/);
    assert.match(out.stdout, new RegExp(EMB_MODEL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  });

  it('migrates a store left behind by the old model', { ...needsModel }, async () => {
    const dataDir = cliDataDir();
    let out = cli(dataDir, 'add', 'the staging database is reset every Monday morning');
    assert.equal(out.status, 0, out.stderr);

    // Rewind the stamp: exactly what a plugin upgrade leaves behind.
    await withDb(async (conn) => {
      await conn.run('UPDATE memories SET emb_model = ?, emb_dim = 384', OLD_MODEL);
    }, { paths: { ...paths, dataDir, dbPath: join(dataDir, 'mem.db') } });

    // The row is now invisible: retrieval refuses to compare across spaces.
    out = cli(dataDir, 'search', 'when is the staging database wiped?');
    assert.equal(out.status, 0, out.stderr);
    assert.match(out.stdout, /Nothing relevant/);

    out = cli(dataDir, 'reembed', '--dry-run', '--json');
    assert.equal(out.status, 0, out.stderr);
    let report = JSON.parse(out.stdout);
    assert.equal(report.stale, 1);
    assert.equal(report.reembedded, 0);

    out = cli(dataDir, 'reembed', '--json');
    assert.equal(out.status, 0, out.stderr);
    report = JSON.parse(out.stdout);
    assert.equal(report.stale, 1);
    assert.equal(report.reembedded, 1);
    assert.equal(report.model, EMB_MODEL);
    assert.equal(report.dim, EMB_DIM);

    // ...and it is retrievable again. This is the whole point of the command.
    out = cli(dataDir, 'search', 'when is the staging database wiped?');
    assert.equal(out.status, 0, out.stderr);
    assert.match(out.stdout, /staging database is reset every Monday morning/);
  });
});
