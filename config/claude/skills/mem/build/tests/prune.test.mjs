// The pruning ladder, rungs 2 and 3.
//
// PLAN: "a false-positive prune is an *invisible* failure. You never notice the
// memory that should have been there." So most of this file is about what does
// NOT get archived — a memory that decayed but proved useful once, one written
// last week, a pinned one, a scope whose parent directory is also missing — and
// each of those is a separate test rather than a clause in one, because a
// conjunction that quietly loses a term still passes a test that only checks the
// happy path.
//
// Nothing here loads the embedding model: rows are seeded through SQL with a
// synthetic vector, the way manage.test.mjs and decay.test.mjs do. The ladder is
// pure SQL over columns and must keep working on a machine that has never run
// `mem warm`.

import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';

import { withDb } from '../../src/db.mjs';
import { DAY_MS } from '../../src/decay.mjs';
import { EMB_DIM, EMB_MODEL } from '../../src/embed.mjs';
import { EVENT_ARCHIVED, memoryEvents, showMemory } from '../../src/manage.mjs';
import { resolvePaths } from '../../src/paths.mjs';
import {
  APPLY_LIMIT,
  ARCHIVE_MIN_AGE_DAYS,
  ARCHIVE_STRENGTH,
  DEAD_SCOPE_GRACE_DAYS,
  DEAD_SCOPE_PREFIX,
  EVENT_SCOPE_FLAGGED,
  EVENT_SCOPE_REVIVED,
  EVENT_TOMBSTONED,
  REASON_DEAD_SCOPE,
  REASON_EXPIRED,
  REASON_STALE,
  RULES,
  TOMBSTONE_AFTER_DAYS,
  applyPlan,
  deadScopePlan,
  plan,
  prune,
  readFlags,
  scopeLiveness,
  staleDue,
  tombstoneDue,
  ttlDue,
} from '../../src/prune.mjs';

const paths = resolvePaths();
const scratch = mkdtempSync(join(tmpdir(), 'mem-prune-test-'));
after(() => rmSync(scratch, { recursive: true, force: true }));

let n = 0;
const scratchPaths = () => ({ ...paths, dbPath: join(scratch, `prune-${n++}.db`) });
const ENV = { MEM_PROJECT_KEY: 'test/prune' };
const NOW = 1_750_000_000_000;
const DAY = DAY_MS;

function fakeVector(seed) {
  const v = new Float32Array(EMB_DIM);
  for (let i = 0; i < EMB_DIM; i += 1) v[i] = Math.sin(seed * (i + 1));
  return Buffer.from(v.buffer);
}

const SEED_SQL = `
  INSERT INTO memories (uid, kind, scope, project_key, text, emb, emb_model, emb_dim,
                        salience, confidence, pinned, status,
                        created_at, updated_at, last_used_at, useful_count,
                        injected_count, expires_at)
  VALUES (?, 'fact', ?, ?, ?, ${'vector32(?)'}, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

/**
 * Seed rows and hand back their ids. `archivedAt` writes the `archived` event the
 * tombstone rung reads its clock from — the row itself records no such date on
 * purpose (manage.mjs leaves updated_at alone when archiving).
 */
async function seed(dbPaths, rows) {
  return withDb(async (conn) => {
    const ids = [];
    for (const [i, row] of rows.entries()) {
      const r = {
        uid: `uid-${i}`,
        scope: 'project',
        project_key: 'test/prune',
        text: `memory ${i}`,
        salience: 0.5,
        confidence: 0.5,
        pinned: 0,
        status: 'active',
        created_at: NOW - 200 * DAY,
        updated_at: NOW - 200 * DAY,
        last_used_at: null,
        useful_count: 0,
        injected_count: 0,
        expires_at: null,
        emb: fakeVector(i + 1),
        archivedAt: null,
        ...row,
      };
      if (r.scope === 'global') r.project_key = null;
      const info = await conn.run(
        SEED_SQL,
        r.uid, r.scope, r.project_key, r.text, r.emb, EMB_MODEL, EMB_DIM,
        r.salience, r.confidence, r.pinned, r.status,
        r.created_at, r.updated_at, r.last_used_at, r.useful_count,
        r.injected_count, r.expires_at,
      );
      const id = info.lastInsertRowid;
      if (r.archivedAt !== null) {
        await conn.run(
          'INSERT INTO memory_events (memory_id, event, detail, at) VALUES (?, ?, ?, ?)',
          id, EVENT_ARCHIVED, JSON.stringify({ previous: { status: 'active' } }), r.archivedAt,
        );
      }
      if (r.emb === null) await conn.run('UPDATE memories SET emb = NULL WHERE id = ?', id);
      ids.push(id);
    }
    return ids;
  }, { paths: dbPaths, env: ENV });
}

const run = (dbPaths, fn) => withDb(fn, { paths: dbPaths, env: ENV });

// A row the stale rule reaches: 200 days old, never used, never useful, so
// strength = 0.5 x exp(-ln2 x 200/30) x 0.5 = 0.0025.
const STALE = {};

describe('the stale rule', () => {
  it('is the conjunction PLAN states, not any one of its terms', async () => {
    const dbPaths = scratchPaths();
    await seed(dbPaths, [
      { uid: 'stale', ...STALE },
      // Each of these fails exactly one term.
      { uid: 'useful', useful_count: 1, last_used_at: NOW - 200 * DAY },
      { uid: 'young', created_at: NOW - 10 * DAY, updated_at: NOW - 10 * DAY },
      { uid: 'strong', salience: 1, confidence: 1, last_used_at: NOW - DAY },
      { uid: 'pinned', pinned: 1 },
      { uid: 'archived', status: 'archived' },
      { uid: 'staged', status: 'staged' },
    ]);

    await run(dbPaths, async (conn) => {
      const due = await staleDue(conn, { now: NOW });
      assert.deepEqual(due.map((r) => r.uid), ['stale']);
      assert.ok(due[0].strength < ARCHIVE_STRENGTH, `strength ${due[0].strength}`);
      assert.ok(due[0].age_days > ARCHIVE_MIN_AGE_DAYS, `age ${due[0].age_days}`);
    });
  });

  // The echo heuristic (slice 5a.2) is the only thing that writes useful_count,
  // and it was allowed to be noisy precisely because its noise spares memories
  // rather than archiving them. This is the test that makes that true.
  it('never reaches a memory that echoed even once, however stale', async () => {
    const dbPaths = scratchPaths();
    await seed(dbPaths, [
      { uid: 'echoed-once', useful_count: 1, created_at: NOW - 5000 * DAY, updated_at: NOW - 5000 * DAY,
        last_used_at: NOW - 5000 * DAY },
    ]);
    await run(dbPaths, async (conn) => {
      assert.deepEqual(await staleDue(conn, { now: NOW }), []);
    });
  });

  it('takes overrides so the rule can be tightened without editing the module', async () => {
    const dbPaths = scratchPaths();
    await seed(dbPaths, [{ uid: 'middling', salience: 1, confidence: 1, created_at: NOW - 70 * DAY, updated_at: NOW - 70 * DAY }]);
    await run(dbPaths, async (conn) => {
      // strength here is exp(-ln2 x 70/30) = 0.20, above the shipped 0.15.
      assert.deepEqual(await staleDue(conn, { now: NOW }), []);
      const looser = await staleDue(conn, { now: NOW, strength: 0.5 });
      assert.deepEqual(looser.map((r) => r.uid), ['middling']);
      assert.deepEqual(await staleDue(conn, { now: NOW, strength: 0.5, minAgeDays: 90 }), []);
    });
  });
});

describe('TTL expiry', () => {
  it('takes active rows past their expires_at and leaves the rest', async () => {
    const dbPaths = scratchPaths();
    await seed(dbPaths, [
      { uid: 'expired', expires_at: NOW - DAY, created_at: NOW - 2 * DAY, updated_at: NOW - 2 * DAY },
      { uid: 'expires-later', expires_at: NOW + DAY, created_at: NOW - 2 * DAY, updated_at: NOW - 2 * DAY },
      { uid: 'no-ttl', created_at: NOW - 2 * DAY, updated_at: NOW - 2 * DAY },
      { uid: 'expired-pinned', pinned: 1, expires_at: NOW - DAY },
      // Archiving a staged row out from under the reviewer would empty the review
      // queue by timeout, so the rung is deliberately active-only.
      { uid: 'expired-staged', status: 'staged', expires_at: NOW - DAY },
    ]);
    await run(dbPaths, async (conn) => {
      assert.deepEqual((await ttlDue(conn, { now: NOW })).map((r) => r.uid), ['expired']);
    });
  });

  it('expires a young row the stale rule could never reach', async () => {
    const dbPaths = scratchPaths();
    await seed(dbPaths, [
      { uid: 'fresh-but-expired', salience: 1, confidence: 1, expires_at: NOW - 1,
        created_at: NOW - 60_000, updated_at: NOW - 60_000 },
    ]);
    await run(dbPaths, async (conn) => {
      assert.deepEqual((await staleDue(conn, { now: NOW })).map((r) => r.uid), []);
      assert.deepEqual((await ttlDue(conn, { now: NOW })).map((r) => r.uid), ['fresh-but-expired']);
    });
  });
});

describe('scopeLiveness', () => {
  it('never condemns a git-remote key — it cannot be checked offline', () => {
    const r = scopeLiveness('github.com/acme/web');
    assert.equal(r.state, 'unknown');
    assert.match(r.why, /remote/);
  });

  it('calls an existing directory live', () => {
    assert.equal(scopeLiveness(scratch).state, 'live');
  });

  it('calls a missing directory dead when its parent is still there', () => {
    const gone = join(scratch, 'deleted-repo');
    const r = scopeLiveness(gone);
    assert.equal(r.state, 'dead');
    assert.match(r.why, /still there/);
  });

  // THE UNMOUNTED-VOLUME GUARD. If $HOME is not mounted, every path key looks
  // deleted at once and ninety days later the store archives itself. "Deleted"
  // and "not currently visible" are indistinguishable from here, so the answer
  // has to be 'unknown'.
  it('refuses to guess when the parent is gone too', () => {
    const r = scopeLiveness('/no-such-volume-here/some/repo');
    assert.equal(r.state, 'unknown');
    assert.match(r.why, /cannot tell deleted from unmounted/);
  });

  it('handles the degenerate keys without throwing', () => {
    assert.equal(scopeLiveness(null).state, 'unknown');
    assert.equal(scopeLiveness('').state, 'unknown');
    assert.equal(scopeLiveness('/').state, 'live');
  });
});

describe('dead scopes', () => {
  const dead = () => join(scratch, `gone-${n}`);

  it('flags first and archives nothing on the run that flags', async () => {
    const dbPaths = scratchPaths();
    const key = dead();
    await seed(dbPaths, [
      { uid: 'in-dead-scope', project_key: key, salience: 1, confidence: 1, last_used_at: NOW },
    ]);

    await run(dbPaths, async (conn) => {
      const planned = await plan(conn, { now: NOW });
      const entry = planned.scopes.find((s) => s.project_key === key);
      assert.equal(entry.action, 'flag');
      assert.equal(planned.counts['dead-scope'], 0, 'the flagging run must archive nothing');

      await applyPlan(conn, planned);
      const flags = await readFlags(conn);
      assert.equal(flags.get(key).flaggedAt, NOW);
      const stored = await conn.get('SELECT v FROM meta WHERE k = ?', `${DEAD_SCOPE_PREFIX}${key}`);
      assert.match(stored.v, /flagged_at/);

      const events = await conn.all('SELECT event, detail FROM memory_events WHERE memory_id IS NULL');
      assert.equal(events.length, 1);
      assert.equal(events[0].event, EVENT_SCOPE_FLAGGED);
      assert.match(events[0].detail, new RegExp(key.replaceAll('/', '\\/')));

      assert.equal((await conn.get("SELECT count(*) AS n FROM memories WHERE status = 'active'")).n, 1);
    });
  });

  it('waits out the grace period, then archives', async () => {
    const dbPaths = scratchPaths();
    const key = dead();
    await seed(dbPaths, [{ uid: 'doomed', project_key: key, salience: 1, confidence: 1, last_used_at: NOW }]);

    await run(dbPaths, async (conn) => {
      await applyPlan(conn, await plan(conn, { now: NOW }));

      const midway = NOW + (DEAD_SCOPE_GRACE_DAYS - 1) * DAY;
      const waiting = await deadScopePlan(conn, { now: midway });
      assert.equal(waiting.find((s) => s.project_key === key).action, 'wait');
      assert.equal(waiting.find((s) => s.project_key === key).days_left, 1);
      assert.equal((await plan(conn, { now: midway })).counts['dead-scope'], 0);

      const after = NOW + (DEAD_SCOPE_GRACE_DAYS + 1) * DAY;
      const due = await plan(conn, { now: after });
      assert.equal(due.counts['dead-scope'], 1);
      await applyPlan(conn, due);

      const row = await conn.get("SELECT status FROM memories WHERE uid = 'doomed'");
      assert.equal(row.status, 'archived');
      const events = await memoryEvents(conn, 1);
      assert.equal(events[0].event, EVENT_ARCHIVED);
      assert.equal(events[0].detail.reason, REASON_DEAD_SCOPE);
    });
  });

  it('drops the flag when the directory comes back', async () => {
    const dbPaths = scratchPaths();
    const key = join(scratch, 'revivable');
    await seed(dbPaths, [{ uid: 'lucky', project_key: key, salience: 1, confidence: 1, last_used_at: NOW }]);

    await run(dbPaths, async (conn) => {
      await applyPlan(conn, await plan(conn, { now: NOW }));
      assert.equal((await readFlags(conn)).size, 1);

      mkdirSync(key, { recursive: true });
      const revived = await deadScopePlan(conn, { now: NOW + DAY });
      assert.equal(revived.find((s) => s.project_key === key).action, 'revive');

      await applyPlan(conn, await plan(conn, { now: NOW + DAY }));
      assert.equal((await readFlags(conn)).size, 0, 'the flag must not outlive the reason for it');
      const events = await conn.all(
        'SELECT event FROM memory_events WHERE memory_id IS NULL ORDER BY id',
      );
      assert.deepEqual(events.map((e) => e.event), [EVENT_SCOPE_FLAGGED, EVENT_SCOPE_REVIVED]);

      // And the grace clock restarts rather than resuming, if it dies again.
      rmSync(key, { recursive: true, force: true });
      const again = await deadScopePlan(conn, { now: NOW + 2 * DAY });
      assert.equal(again.find((s) => s.project_key === key).action, 'flag');
    });
  });

  it('leaves pinned rows in a dead scope alone', async () => {
    const dbPaths = scratchPaths();
    const key = dead();
    // Fresh and useful, so only the dead-scope rung can reach either of them —
    // otherwise the stale rule archives the unpinned one on the flagging run and
    // this test passes for the wrong reason.
    const alive = { salience: 1, confidence: 1, last_used_at: NOW, useful_count: 3 };
    await seed(dbPaths, [
      { uid: 'pinned-in-dead-scope', project_key: key, pinned: 1, ...alive },
      { uid: 'normal-in-dead-scope', project_key: key, ...alive },
    ]);
    await run(dbPaths, async (conn) => {
      await applyPlan(conn, await plan(conn, { now: NOW }));
      const after = NOW + (DEAD_SCOPE_GRACE_DAYS + 1) * DAY;
      const due = await plan(conn, { now: after, rules: ['dead-scope'] });
      assert.deepEqual(due.archive.find((b) => b.rule === 'dead-scope').rows.map((r) => r.uid), [
        'normal-in-dead-scope',
      ]);
    });
  });

  it('never flags a global memory — globals have no project to lose', async () => {
    const dbPaths = scratchPaths();
    await seed(dbPaths, [{ uid: 'global-one', scope: 'global' }]);
    await run(dbPaths, async (conn) => {
      assert.deepEqual(await deadScopePlan(conn, { now: NOW }), []);
    });
  });
});

describe('tombstoning', () => {
  it('reads its clock from the archived event, not from the row', async () => {
    const dbPaths = scratchPaths();
    await seed(dbPaths, [
      { uid: 'long-archived', status: 'archived', archivedAt: NOW - (TOMBSTONE_AFTER_DAYS + 5) * DAY,
        // updated_at is RECENT, which is the trap: manage.mjs deliberately leaves
        // that column alone when archiving, so a rule reading it would be wrong
        // in both directions.
        updated_at: NOW - DAY },
      { uid: 'recently-archived', status: 'archived', archivedAt: NOW - 10 * DAY },
      { uid: 'still-active', status: 'active' },
      { uid: 'archived-pinned', status: 'archived', pinned: 1, archivedAt: NOW - 500 * DAY },
    ]);

    await run(dbPaths, async (conn) => {
      const due = await tombstoneDue(conn, { now: NOW });
      assert.deepEqual(due.map((r) => r.uid), ['long-archived']);
      assert.ok(due[0].archived_days_ago > TOMBSTONE_AFTER_DAYS);
    });
  });

  it('falls back to the row when there is no archived event, as an import has none', async () => {
    const dbPaths = scratchPaths();
    await seed(dbPaths, [
      { uid: 'imported-archived', status: 'archived', updated_at: NOW - 400 * DAY, created_at: NOW - 400 * DAY },
    ]);
    await run(dbPaths, async (conn) => {
      assert.deepEqual((await tombstoneDue(conn, { now: NOW })).map((r) => r.uid), ['imported-archived']);
    });
  });

  it('drops the vector, keeps everything else, and records what to re-embed', async () => {
    const dbPaths = scratchPaths();
    const [id] = await seed(dbPaths, [
      { uid: 'goner', status: 'archived', text: 'never force push a shared branch',
        archivedAt: NOW - 400 * DAY },
    ]);

    await run(dbPaths, async (conn) => {
      const planned = await plan(conn, { now: NOW });
      const applied = await applyPlan(conn, planned);
      assert.equal(applied.tombstoned.length, 1);

      const row = await conn.get(
        'SELECT text, status, emb IS NULL AS empty, emb_model, emb_dim FROM memories WHERE id = ?',
        id,
      );
      assert.equal(row.empty, 1);
      assert.equal(row.text, 'never force push a shared branch', 'the text is what makes it reversible');
      assert.equal(row.status, 'archived', 'tombstoning is not a status change');
      assert.equal(row.emb_model, EMB_MODEL, 'the stamp stays so a re-embed knows the space');

      const events = await memoryEvents(conn, id);
      assert.equal(events[0].event, EVENT_TOMBSTONED);
      assert.deepEqual(events[0].detail.previous, { emb_model: EMB_MODEL, emb_dim: EMB_DIM, embedded: true });
    });
  });

  it('never tombstones a row this same run archived', async () => {
    const dbPaths = scratchPaths();
    await seed(dbPaths, [{ uid: 'about-to-be-archived', ...STALE }]);
    await run(dbPaths, async (conn) => {
      const planned = await plan(conn, { now: NOW });
      assert.equal(planned.counts.stale, 1);
      assert.equal(planned.counts.tombstoned, 0);

      await applyPlan(conn, planned);
      // Archived a moment ago, so still nothing to tombstone.
      assert.equal((await plan(conn, { now: NOW })).counts.tombstoned, 0);
      const later = await plan(conn, { now: NOW + (TOMBSTONE_AFTER_DAYS + 1) * DAY });
      assert.equal(later.counts.tombstoned, 1);
    });
  });
});

describe('plan', () => {
  it('gives each row to exactly one rung, reasons before statistics', async () => {
    const dbPaths = scratchPaths();
    await seed(dbPaths, [
      // Both stale AND expired: the human's TTL is the reason that gets recorded.
      { uid: 'both', expires_at: NOW - DAY, ...STALE },
      { uid: 'just-stale', ...STALE },
    ]);
    await run(dbPaths, async (conn) => {
      const planned = await plan(conn, { now: NOW });
      const bucket = (rule) => planned.archive.find((b) => b.rule === rule).rows.map((r) => r.uid);
      assert.deepEqual(bucket('expired'), ['both']);
      assert.deepEqual(bucket('stale'), ['just-stale']);
      assert.equal(planned.counts.archived, 2);
    });
  });

  it('honours --rule and reports the rules it ran', async () => {
    const dbPaths = scratchPaths();
    await seed(dbPaths, [{ uid: 'expired', expires_at: NOW - DAY }, { uid: 'stale', ...STALE }]);
    await run(dbPaths, async (conn) => {
      const only = await plan(conn, { now: NOW, rules: ['expired'] });
      assert.deepEqual(only.rules, ['expired']);
      assert.deepEqual(only.archive.map((b) => b.rule), ['expired']);
      assert.equal(only.counts.stale, 0);
      assert.deepEqual(RULES, ['expired', 'dead-scope', 'stale', 'tombstone']);
    });
  });

  it('says so when a rung hits its row budget', async () => {
    const dbPaths = scratchPaths();
    await seed(dbPaths, [{ uid: 'a', ...STALE }, { uid: 'b', ...STALE }, { uid: 'c', ...STALE }]);
    await run(dbPaths, async (conn) => {
      const capped = await plan(conn, { now: NOW, limit: 2 });
      assert.equal(capped.counts.stale, 2);
      assert.deepEqual(capped.truncated, ['stale']);
      assert.deepEqual((await plan(conn, { now: NOW })).truncated, []);
      assert.equal(APPLY_LIMIT, 2000);
    });
  });

  it('reads nothing into the store — a plan is not an action', async () => {
    const dbPaths = scratchPaths();
    await seed(dbPaths, [{ uid: 'stale', ...STALE }]);
    await run(dbPaths, async (conn) => {
      await plan(conn, { now: NOW });
      await plan(conn, { now: NOW });
      assert.equal((await conn.get("SELECT count(*) AS n FROM memories WHERE status = 'active'")).n, 1);
      assert.equal((await conn.get('SELECT count(*) AS n FROM memory_events')).n, 0);
    });
  });
});

describe('applyPlan', () => {
  it('leaves the review queue alone — a staged row is not the ladder\'s business', async () => {
    const dbPaths = scratchPaths();
    await seed(dbPaths, [
      { uid: 'old-staged', status: 'staged', expires_at: NOW - DAY, created_at: NOW - 500 * DAY,
        updated_at: NOW - 500 * DAY },
    ]);
    await run(dbPaths, async (conn) => {
      assert.equal((await plan(conn, { now: NOW })).counts.archived, 0);
    });
  });

  it('archives with the same event a hand `mem forget` writes, so restore is one path', async () => {
    const dbPaths2 = scratchPaths();
    const [id2] = await seed(dbPaths2, [{ uid: 'stale-active', ...STALE }]);
    await run(dbPaths2, async (conn) => {
      const applied = await applyPlan(conn, await plan(conn, { now: NOW }));
      assert.equal(applied.archived.stale.length, 1);
      assert.equal(applied.archived.stale[0].reason, REASON_STALE);

      const { memory, events } = await showMemory(conn, String(id2), { now: NOW });
      assert.equal(memory.status, 'archived');
      assert.equal(events[0].event, EVENT_ARCHIVED);
      assert.equal(events[0].detail.via, 'prune');
      assert.deepEqual(events[0].detail.previous, { status: 'active' });
      // The evidence for the decision, so "why is this archived" survives the
      // strength moving on.
      assert.ok(events[0].detail.at_decision.strength < ARCHIVE_STRENGTH);
      assert.equal(events[0].detail.at_decision.useful_count, 0);
      assert.equal(events[0].detail.run_id, null, 'slice 5a.4 owns the run id');
    });
  });

  it('leaves updated_at alone, so archive-then-restore does not reset the decay clock', async () => {
    const dbPaths = scratchPaths();
    const written = NOW - 200 * DAY;
    const [id] = await seed(dbPaths, [{ uid: 'stale', updated_at: written, created_at: written }]);
    await run(dbPaths, async (conn) => {
      await applyPlan(conn, await plan(conn, { now: NOW }));
      const row = await conn.get('SELECT updated_at, created_at FROM memories WHERE id = ?', id);
      assert.equal(row.updated_at, written);
      assert.equal(row.created_at, written);
    });
  });

  it('threads a run id into every event when given one', async () => {
    const dbPaths = scratchPaths();
    const key = join(scratch, 'gone-runid');
    await seed(dbPaths, [
      { uid: 'stale', ...STALE },
      { uid: 'tomb', status: 'archived', archivedAt: NOW - 400 * DAY },
      { uid: 'dead-scope', project_key: key },
    ]);
    await run(dbPaths, async (conn) => {
      // The seeded `archived` event predates the run and carries no run id, which
      // is correct — so the assertion is over what this run wrote, not the log.
      const before = (await conn.get('SELECT coalesce(max(id), 0) AS id FROM memory_events')).id;
      await applyPlan(conn, await plan(conn, { now: NOW }), { runId: 'run-abc' });

      const details = (await conn.all('SELECT detail FROM memory_events WHERE id > ?', before))
        .map((r) => JSON.parse(r.detail));
      assert.ok(details.length >= 3, `only ${details.length} events written`);
      assert.ok(details.every((d) => d.run_id === 'run-abc'), JSON.stringify(details));
    });
  });
});

describe('prune()', () => {
  it('is a dry run unless told otherwise', async () => {
    const dbPaths = scratchPaths();
    await seed(dbPaths, [{ uid: 'stale', ...STALE }]);

    const dry = await prune({ paths: dbPaths, env: ENV, now: NOW });
    assert.equal(dry.dryRun, true);
    assert.equal(dry.applied, null);
    assert.equal(dry.counts.stale, 1);

    await run(dbPaths, async (conn) => {
      assert.equal((await conn.get("SELECT status FROM memories WHERE uid = 'stale'")).status, 'active');
    });

    const wet = await prune({ paths: dbPaths, env: ENV, now: NOW, apply: true });
    assert.equal(wet.dryRun, false);
    assert.equal(wet.applied.archived.stale.length, 1);

    await run(dbPaths, async (conn) => {
      assert.equal((await conn.get("SELECT status FROM memories WHERE uid = 'stale'")).status, 'archived');
    });
  });

  it('is idempotent — a second apply finds nothing left to do', async () => {
    const dbPaths = scratchPaths();
    await seed(dbPaths, [
      { uid: 'stale', ...STALE },
      { uid: 'expired', expires_at: NOW - DAY },
      { uid: 'tomb', status: 'archived', archivedAt: NOW - 400 * DAY },
    ]);
    const first = await prune({ paths: dbPaths, env: ENV, now: NOW, apply: true });
    assert.equal(first.counts.archived, 2);
    assert.equal(first.counts.tombstoned, 1);

    const second = await prune({ paths: dbPaths, env: ENV, now: NOW, apply: true });
    assert.equal(second.counts.archived, 0);
    assert.equal(second.counts.tombstoned, 0);
  });

  // The whole rung-2 claim in one assertion: retrieval cost tracks *active* rows.
  it('drops the active count and nothing else', async () => {
    const dbPaths = scratchPaths();
    const rows = [];
    for (let i = 0; i < 20; i += 1) rows.push({ uid: `s-${i}`, ...STALE });
    for (let i = 0; i < 5; i += 1) rows.push({ uid: `keep-${i}`, useful_count: 2, last_used_at: NOW });
    await seed(dbPaths, rows);

    await prune({ paths: dbPaths, env: ENV, now: NOW, apply: true });
    await run(dbPaths, async (conn) => {
      const counts = await conn.all('SELECT status, count(*) AS n FROM memories GROUP BY status');
      const by = Object.fromEntries(counts.map((c) => [c.status, c.n]));
      assert.equal(by.active, 5);
      assert.equal(by.archived, 20);
      assert.equal((await conn.get('SELECT count(*) AS n FROM memories')).n, 25, 'nothing is deleted');
    });
  });

  it('and none of it touches a pinned memory', async () => {
    const dbPaths = scratchPaths();
    const key = join(scratch, 'gone-pinned');
    await seed(dbPaths, [
      { uid: 'p-stale', pinned: 1, ...STALE },
      { uid: 'p-expired', pinned: 1, expires_at: NOW - DAY },
      { uid: 'p-archived', pinned: 1, status: 'archived', archivedAt: NOW - 800 * DAY },
      { uid: 'p-dead-scope', pinned: 1, project_key: key },
    ]);

    // Flag the scope, wait it out, then run everything.
    await prune({ paths: dbPaths, env: ENV, now: NOW, apply: true });
    const after = NOW + (DEAD_SCOPE_GRACE_DAYS + 1) * DAY;
    const result = await prune({ paths: dbPaths, env: ENV, now: after, apply: true });

    assert.equal(result.counts.archived, 0);
    assert.equal(result.counts.tombstoned, 0);
    await run(dbPaths, async (conn) => {
      const rows = await conn.all('SELECT uid, status, emb IS NULL AS empty FROM memories ORDER BY uid');
      assert.deepEqual(rows, [
        { uid: 'p-archived', status: 'archived', empty: 0 },
        { uid: 'p-dead-scope', status: 'active', empty: 0 },
        { uid: 'p-expired', status: 'active', empty: 0 },
        { uid: 'p-stale', status: 'active', empty: 0 },
      ]);
    });
  });

  it('reports REASON_* strings the audit log can be read back by', () => {
    assert.deepEqual([REASON_EXPIRED, REASON_DEAD_SCOPE, REASON_STALE], ['expired', 'dead-scope', 'stale']);
  });
});
