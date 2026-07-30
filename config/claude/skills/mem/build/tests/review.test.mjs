// The review queue — list, promote, edit, discard.
//
// Almost all of it runs without the embedding model, and that is a property
// worth holding onto: triage is the one thing a user does when they have just
// noticed the store is full of junk, and it must not depend on a 23 MB download.
// The duplicate detection is included in "almost all" — it compares vectors the
// rows already carry — so the fixtures below hand-build near-parallel vectors and
// never call the model. Only editing the *text* re-embeds, and that one test
// skips when the model is not cached, as write.test.mjs does.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { withDb } from '../../src/db.mjs';
import { EMB_DIM, EMB_MODEL, embed, modelCached } from '../../src/embed.mjs';
import { forgetMemory, listMemories, memoryEvents, SORTS } from '../../src/manage.mjs';
import { resolvePaths } from '../../src/paths.mjs';
import {
  FLAG_THRESHOLD,
  MERGE_THRESHOLD,
  discard,
  edit,
  nearestActive,
  promote,
  resolveItem,
  reviewQueue,
  SOURCES,
  sourceFor,
} from '../../src/review.mjs';
import { DEDUP_THRESHOLD } from '../../src/write.mjs';

const paths = resolvePaths();
const scratch = mkdtempSync(join(tmpdir(), 'mem-review-test-'));
after(() => rmSync(scratch, { recursive: true, force: true }));

let n = 0;
const scratchPaths = () => ({ ...paths, dbPath: join(scratch, `review-${n++}.db`) });
const ENV = { MEM_PROJECT_KEY: 'test/project-a' };
const NOW = 1_750_000_000_000;
const DAY = 24 * 60 * 60 * 1000;
const needsModel = { skip: modelCached(paths) ? false : `model not cached — run 'mem warm'` };

/** A deterministic stand-in embedding; different seeds are near-orthogonal. */
function basis(seed) {
  const v = new Float32Array(EMB_DIM);
  for (let i = 0; i < EMB_DIM; i += 1) v[i] = Math.sin(seed * (i + 1));
  return v;
}

const blob = (v) => Buffer.from(v.buffer.slice(v.byteOffset, v.byteOffset + v.byteLength));

/**
 * A vector `eps` of the way from one basis toward another. eps = 0.2 lands
 * around cosine 0.98 — comfortably a restatement — and eps = 1 lands at 0.7,
 * comfortably not one. The tests assert the resulting similarity rather than
 * trusting the arithmetic.
 */
function near(seed, other, eps) {
  const a = basis(seed);
  const b = basis(other);
  const v = new Float32Array(EMB_DIM);
  for (let i = 0; i < EMB_DIM; i += 1) v[i] = a[i] + eps * b[i];
  return blob(v);
}

const fakeVector = (seed) => blob(basis(seed));

const SEED_SQL = `
  INSERT INTO memories (uid, kind, scope, project_key, text, why, emb, emb_model, emb_dim,
                        salience, confidence, pinned, status, source_kind, source_session,
                        created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, vector32(?), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

async function seed(dbPaths, rows) {
  return withDb(async (conn) => {
    const ids = [];
    for (const [i, row] of rows.entries()) {
      const r = {
        uid: `uid-${i}`,
        kind: 'preference',
        scope: 'project',
        project_key: 'test/project-a',
        why: null,
        salience: 0.5,
        confidence: 0.5,
        pinned: 0,
        status: 'active',
        source_kind: 'user',
        source_session: null,
        created_at: NOW - DAY,
        updated_at: NOW - DAY,
        emb: fakeVector(i + 1),
        emb_model: EMB_MODEL,
        emb_dim: EMB_DIM,
        ...row,
      };
      if (r.scope === 'global') r.project_key = null;
      const info = await conn.run(
        SEED_SQL,
        r.uid, r.kind, r.scope, r.project_key, r.text, r.why,
        r.emb, r.emb_model, r.emb_dim,
        r.salience, r.confidence, r.pinned, r.status, r.source_kind, r.source_session,
        r.created_at, r.updated_at,
      );
      ids.push(info.lastInsertRowid);
    }
    return ids;
  }, { paths: dbPaths, env: ENV });
}

const open = (dbPaths, fn) => withDb(fn, { paths: dbPaths, env: ENV });

// #1 active, #2 staged and near-identical to it, #3 staged and unrelated,
// #4 staged and global, #5 archived, #6 staged in another project.
const FIXTURES = [
  { uid: 'aaaa1111-0000-4000-8000-000000000001', text: 'always use pnpm to install dependencies', emb: fakeVector(1) },
  {
    uid: 'bbbb2222-0000-4000-8000-000000000002',
    text: 'in this repo use pnpm and never npm, it is the only supported installer',
    status: 'staged', source_kind: 'auto', source_session: 'sess-1',
    emb: near(1, 7, 0.2), created_at: NOW - 3 * DAY, updated_at: NOW - 3 * DAY,
  },
  {
    uid: 'cccc3333-0000-4000-8000-000000000003',
    text: 'deploys go out from main on Thursdays', status: 'staged', source_kind: 'auto',
    emb: fakeVector(3), created_at: NOW - 2 * DAY, updated_at: NOW - 2 * DAY,
  },
  {
    uid: 'dddd4444-0000-4000-8000-000000000004',
    text: 'I prefer terse commit messages', scope: 'global', status: 'staged',
    emb: fakeVector(4), created_at: NOW - DAY,
  },
  { uid: 'eeee5555-0000-4000-8000-000000000005', text: 'the old staging box is gone', status: 'archived' },
  {
    uid: 'ffff6666-0000-4000-8000-000000000006',
    text: 'the api package uses yarn', status: 'staged', project_key: 'test/project-b',
    emb: fakeVector(6), created_at: NOW - 10 * DAY,
  },
];

const readOnly = scratchPaths();
const seeded = await seed(readOnly, FIXTURES);
const idOf = (i) => seeded[i];

describe('nearestActive', () => {
  it('finds the active memory a staged capture restates', async () => {
    await open(readOnly, async (conn) => {
      const staged = await conn.get('SELECT * FROM memories WHERE id = ?', idOf(1));
      const hit = await nearestActive(conn, staged);
      assert.equal(hit.id, idOf(0));
      assert.ok(hit.similarity >= MERGE_THRESHOLD, `similarity was ${hit.similarity}`);
    });
  });

  // The threshold is the write path's, deliberately: promoting is the moment the
  // staged row enters retrieval, so it is the moment `mem add`'s dedup rule has
  // to apply. Two numbers for one question would drift apart.
  it('is the same threshold mem add dedups on', () => {
    assert.equal(MERGE_THRESHOLD, DEDUP_THRESHOLD);
  });

  it('says nothing about a capture that restates nothing', async () => {
    await open(readOnly, async (conn) => {
      const staged = await conn.get('SELECT * FROM memories WHERE id = ?', idOf(2));
      assert.equal(await nearestActive(conn, staged), null);
    });
  });

  // gte-small puts real restatements at 0.94–0.97 and unrelated facts at 0.77,
  // but "always use pnpm to install dependencies" against "in this repo use pnpm
  // and never npm…" measures 0.922 — the same fact, one point below the merge
  // line. Merging those automatically is what the threshold exists to prevent;
  // saying nothing about them in the surface whose job is "should this join the
  // store?" leaves the only person who can tell without the evidence.
  it('flags a near neighbour it would not merge, and marks the difference', async () => {
    assert.ok(FLAG_THRESHOLD < MERGE_THRESHOLD);
    const dbPaths = scratchPaths();
    const ids = await seed(dbPaths, [
      { uid: 'n-1', text: 'always use pnpm to install dependencies', emb: fakeVector(1) },
      { uid: 'n-2', text: 'in this repo use pnpm and never npm', status: 'staged', emb: near(1, 7, 0.42) },
    ]);
    await open(dbPaths, async (conn) => {
      const staged = await conn.get('SELECT * FROM memories WHERE id = ?', ids[1]);
      const hit = await nearestActive(conn, staged);
      assert.ok(
        hit.similarity > FLAG_THRESHOLD && hit.similarity < MERGE_THRESHOLD,
        `fixture sits at ${hit.similarity}, not between the two thresholds`,
      );

      const { items } = await reviewQueue(conn, { now: NOW });
      assert.equal(items[0].duplicate.id, ids[0]);
      assert.equal(items[0].duplicate.merges, false);
    });

    // …and promoting it leaves both, because 0.93 is where acting starts.
    const [result] = await promote([ids[1]], { paths: dbPaths, env: ENV, now: NOW });
    assert.equal(result.action, 'promoted');
  });

  // Merging a project capture into a global memory would silently widen the
  // memory's blast radius to every other repo — write.mjs refuses it for the same
  // reason, and the queue must not offer it either.
  it('never crosses a scope or a project boundary', async () => {
    const dbPaths = scratchPaths();
    const ids = await seed(dbPaths, [
      { uid: 'g-1', text: 'global twin', scope: 'global', emb: fakeVector(1) },
      { uid: 'b-1', text: 'other project twin', project_key: 'test/project-b', emb: fakeVector(1) },
      { uid: 's-1', text: 'staged here', status: 'staged', emb: near(1, 7, 0.2) },
    ]);
    await open(dbPaths, async (conn) => {
      const staged = await conn.get('SELECT * FROM memories WHERE id = ?', ids[2]);
      assert.equal(await nearestActive(conn, staged), null);
    });
  });

  // A distance between two vector spaces is a number with no meaning.
  it('ignores rows embedded by another model', async () => {
    const dbPaths = scratchPaths();
    const ids = await seed(dbPaths, [
      { uid: 'old-1', text: 'twin from the old model', emb_model: 'Xenova/all-MiniLM-L6-v2@q8', emb: fakeVector(1) },
      { uid: 'st-1', text: 'staged', status: 'staged', emb: near(1, 7, 0.2) },
    ]);
    await open(dbPaths, async (conn) => {
      const staged = await conn.get('SELECT * FROM memories WHERE id = ?', ids[1]);
      assert.equal(await nearestActive(conn, staged), null);
    });
  });
});

describe('the queue', () => {
  it('holds staged items and nothing else', async () => {
    await open(readOnly, async (conn) => {
      const { items, total, totals } = await reviewQueue(conn, { now: NOW });
      assert.equal(total, 4);
      assert.deepEqual(totals, { 'staged-memory': 4 });
      assert.deepEqual(
        items.map((i) => i.memory.uid).sort(),
        [FIXTURES[1].uid, FIXTURES[2].uid, FIXTURES[3].uid, FIXTURES[5].uid],
      );
      assert.ok(items.every((i) => i.memory.status === 'staged'));
    });
  });

  // A queue is drained from the front. Newest-first would leave the item that has
  // been waiting longest permanently below the fold.
  it('is oldest first', async () => {
    await open(readOnly, async (conn) => {
      const { items } = await reviewQueue(conn, { now: NOW });
      const when = items.map((i) => i.when);
      assert.deepEqual(when, [...when].sort((a, b) => a - b));
      assert.equal(items[0].memory.uid, FIXTURES[5].uid, '10 days old, and in another project');
    });
  });

  it('flags the items that restate a memory already stored', async () => {
    await open(readOnly, async (conn) => {
      const { items } = await reviewQueue(conn, { now: NOW });
      const byUid = Object.fromEntries(items.map((i) => [i.memory.uid, i]));
      assert.equal(byUid[FIXTURES[1].uid].duplicate.id, idOf(0));
      assert.ok(byUid[FIXTURES[1].uid].duplicate.similarity > 0.93);
      assert.equal(byUid[FIXTURES[1].uid].duplicate.merges, true);
      assert.equal(byUid[FIXTURES[2].uid].duplicate, null);
    });
  });

  it('reports the total so a paged queue cannot pretend to be the whole queue', async () => {
    await open(readOnly, async (conn) => {
      const { items, total } = await reviewQueue(conn, { now: NOW, limit: 2 });
      assert.equal(items.length, 2);
      assert.equal(total, 4);
    });
  });

  // Every item is plain data: --json prints the whole of it, and the handler is
  // looked up from `type`. This is what lets slice 5b add proposals as a second
  // source without touching the CLI or the skill.
  it('is a list of sources, and items carry no live objects', async () => {
    await open(readOnly, async (conn) => {
      const { items } = await reviewQueue(conn, { now: NOW });
      for (const item of items) {
        assert.deepEqual(JSON.parse(JSON.stringify(item)).ref, item.ref);
        assert.equal(sourceFor(item), SOURCES[0]);
        assert.deepEqual(item.actions, ['promote', 'edit', 'discard']);
      }
      assert.equal(SOURCES.length, 1, 'phase 5b adds the second one');
    });
  });
});

describe('resolveItem', () => {
  it('takes an id, a uid or a prefix', async () => {
    await open(readOnly, async (conn) => {
      assert.equal((await resolveItem(conn, idOf(2))).memory.uid, FIXTURES[2].uid);
      assert.equal((await resolveItem(conn, FIXTURES[2].uid)).memory.id, idOf(2));
      assert.equal((await resolveItem(conn, 'cccc3333')).memory.id, idOf(2));
    });
  });

  // "It exists and is not in the queue" is an answer, not a miss — and it points
  // at the command that does work on it, rather than leaving the user to guess.
  it('refuses a memory that is not staged, and says what to use instead', async () => {
    await open(readOnly, async (conn) => {
      await assert.rejects(() => resolveItem(conn, idOf(0)), (err) => {
        assert.equal(err.code, 'MEM_NOT_QUEUED');
        assert.match(err.message, /is active, not staged/);
        assert.match(err.message, /mem forget/);
        return true;
      });
      await assert.rejects(() => resolveItem(conn, idOf(4)), /is archived, not staged/);
    });
  });

  it('reports a miss rather than returning nothing', async () => {
    await open(readOnly, async (conn) => {
      await assert.rejects(() => resolveItem(conn, 9999), (err) => {
        assert.equal(err.code, 'MEM_NOT_FOUND');
        return true;
      });
    });
  });
});

describe('promote', () => {
  it('makes a staged capture active and recallable', async () => {
    const dbPaths = scratchPaths();
    const ids = await seed(dbPaths, [
      { uid: 'p-1', text: 'deploys go out from main on Thursdays', status: 'staged', emb: fakeVector(3) },
    ]);
    const [result] = await promote([ids[0]], { paths: dbPaths, env: ENV, now: NOW });
    assert.equal(result.action, 'promoted');
    assert.equal(result.to, 'active');
    assert.equal(result.into, null);

    await open(dbPaths, async (conn) => {
      const row = await conn.get('SELECT * FROM memories WHERE id = ?', ids[0]);
      assert.equal(row.status, 'active');
      // An unused memory decays from updated_at, so promoting must not date the
      // memory from the review instead of from the moment it was said.
      assert.equal(row.updated_at, NOW - DAY);

      const [event] = await memoryEvents(conn, ids[0]);
      assert.equal(event.event, 'promoted');
      assert.equal(event.detail.previous.status, 'staged');
      assert.equal(event.detail.via, 'review');
    });
  });

  // PLAN countermeasure #3: near-duplicates update, they don't accumulate. `mem
  // add` cannot have done this already — it dedups within the staged rows only —
  // so promotion is where it has to happen or five paraphrases of one fact end up
  // competing for the same recall budget.
  it('merges a restatement into the memory it restates', async () => {
    const dbPaths = scratchPaths();
    const ids = await seed(dbPaths, FIXTURES);
    const [result] = await promote([ids[1]], { paths: dbPaths, env: ENV, now: NOW });

    assert.equal(result.action, 'merged');
    assert.equal(result.into.id, ids[0]);
    assert.ok(result.similarity >= MERGE_THRESHOLD);
    // What the survivor says *now* — a merge can rewrite it, and reporting the
    // pre-merge wording would show a memory that no longer exists.
    assert.equal(result.into.text, FIXTURES[1].text);

    await open(dbPaths, async (conn) => {
      const target = await conn.get('SELECT * FROM memories WHERE id = ?', ids[0]);
      const staged = await conn.get('SELECT * FROM memories WHERE id = ?', ids[1]);

      // Longest text wins, exactly as a merge on the write path does.
      assert.equal(target.text, FIXTURES[1].text);
      assert.ok(target.confidence > 0.5, 'a restatement is evidence for the fact');
      assert.equal(target.updated_at, NOW);

      // The capture is not deleted: it happened, and the log has to say where it
      // went.
      assert.equal(staged.status, 'superseded');
      assert.equal(staged.superseded_by, ids[0]);

      const [onTarget] = await memoryEvents(conn, ids[0]);
      assert.equal(onTarget.event, 'merged');
      assert.equal(onTarget.detail.via, 'review');
      assert.ok(onTarget.detail.changes.some((c) => c.field === 'text'));

      const [onStaged] = await memoryEvents(conn, ids[1]);
      assert.equal(onStaged.detail.merged_into, ids[0]);
    });
  });

  it('carries the new wording\'s embedding across on a merge', async () => {
    const dbPaths = scratchPaths();
    const ids = await seed(dbPaths, FIXTURES);
    const before = await open(dbPaths, (conn) =>
      conn.get('SELECT emb FROM memories WHERE id = ?', ids[1]),
    );
    await promote([ids[1]], { paths: dbPaths, env: ENV, now: NOW });
    const after = await open(dbPaths, (conn) =>
      conn.get('SELECT emb FROM memories WHERE id = ?', ids[0]),
    );
    assert.deepEqual(Buffer.from(after.emb), Buffer.from(before.emb));
  });

  it('promotes without merging when told to', async () => {
    const dbPaths = scratchPaths();
    const ids = await seed(dbPaths, FIXTURES);
    const [result] = await promote([ids[1]], { paths: dbPaths, env: ENV, now: NOW, merge: false });
    assert.equal(result.action, 'promoted');
    // The runner-up is recorded anyway, so a store that starts accumulating
    // near-copies has the evidence for why.
    await open(dbPaths, async (conn) => {
      const [event] = await memoryEvents(conn, ids[1]);
      assert.equal(event.detail.nearest.id, ids[0]);
    });
  });

  it('takes a batch, and rolls the whole batch back if one ref is wrong', async () => {
    const dbPaths = scratchPaths();
    const ids = await seed(dbPaths, FIXTURES);

    const done = await promote([ids[2], ids[3]], { paths: dbPaths, env: ENV, now: NOW });
    assert.equal(done.length, 2);

    const fresh = scratchPaths();
    const other = await seed(fresh, FIXTURES);
    await assert.rejects(() => promote([other[2], other[4]], { paths: fresh, env: ENV, now: NOW }));
    await open(fresh, async (conn) => {
      const row = await conn.get('SELECT status FROM memories WHERE id = ?', other[2]);
      assert.equal(row.status, 'staged', 'the good half of a bad batch must not land');
    });
  });
});

describe('discard', () => {
  it('archives the capture rather than deleting it', async () => {
    const dbPaths = scratchPaths();
    const ids = await seed(dbPaths, FIXTURES);
    const [result] = await discard([ids[2]], {
      paths: dbPaths, env: ENV, now: NOW, reason: 'not durable',
    });
    assert.equal(result.action, 'archived');
    assert.equal(result.from, 'staged');

    await open(dbPaths, async (conn) => {
      const row = await conn.get('SELECT status FROM memories WHERE id = ?', ids[2]);
      assert.equal(row.status, 'archived');
      const [event] = await memoryEvents(conn, ids[2]);
      // PLAN calls a review rejection the strongest negative signal there is;
      // phase 5a's feedback pass finds them by this marker.
      assert.equal(event.detail.via, 'review');
      assert.equal(event.detail.reason, 'not durable');
    });
  });

  // The one that would bite silently: `mem forget --restore` reads the archive
  // event to decide what to restore *to*. A rejection that restored to 'active'
  // would promote something nobody reviewed, which is the whole thing staging
  // exists to prevent.
  it('un-discards back into the queue, not into retrieval', async () => {
    const dbPaths = scratchPaths();
    const ids = await seed(dbPaths, FIXTURES);
    await discard([ids[2]], { paths: dbPaths, env: ENV, now: NOW });
    await open(dbPaths, async (conn) => {
      const restored = await forgetMemory(conn, ids[2], { restore: true, now: NOW });
      assert.equal(restored.to, 'staged');
      const { total } = await reviewQueue(conn, { now: NOW });
      assert.equal(total, 4);
    });
  });
});

describe('edit', () => {
  it('fixes the fields that need no new embedding', async () => {
    const dbPaths = scratchPaths();
    const ids = await seed(dbPaths, FIXTURES);
    const { edit: result } = await edit(
      ids[2],
      { why: 'said on 2026-07-30', kind: 'decision', salience: 0.9 },
      { paths: dbPaths, env: ENV, now: NOW },
    );
    assert.deepEqual(result.changes.map((c) => c.field).sort(), ['kind', 'salience', 'why']);

    await open(dbPaths, async (conn) => {
      const row = await conn.get('SELECT * FROM memories WHERE id = ?', ids[2]);
      assert.equal(row.kind, 'decision');
      assert.equal(row.why, 'said on 2026-07-30');
      assert.equal(row.salience, 0.9);
      assert.equal(row.status, 'staged', 'editing is not accepting');
      // An edit *is* a restatement by a human, unlike promote and discard.
      assert.equal(row.updated_at, NOW);
      const [event] = await memoryEvents(conn, ids[2]);
      assert.equal(event.event, 'edited');
    });
  });

  it('moves a capture to global scope', async () => {
    const dbPaths = scratchPaths();
    const ids = await seed(dbPaths, FIXTURES);
    await edit(ids[2], { scope: 'global' }, { paths: dbPaths, env: ENV, now: NOW });
    await open(dbPaths, async (conn) => {
      const row = await conn.get('SELECT scope, project_key FROM memories WHERE id = ?', ids[2]);
      assert.equal(row.scope, 'global');
      assert.equal(row.project_key, null);
    });
  });

  it('refuses an edit that changes nothing, and names the fields it takes', async () => {
    const dbPaths = scratchPaths();
    const ids = await seed(dbPaths, FIXTURES);
    await assert.rejects(
      () => edit(ids[2], { kind: FIXTURES[2].kind ?? 'preference' }, { paths: dbPaths, env: ENV, now: NOW }),
      /Nothing to change.*--text/s,
    );
    await assert.rejects(
      () => edit(ids[2], { kind: 'preferences' }, { paths: dbPaths, env: ENV, now: NOW }),
      /Unknown kind/,
    );
  });

  it('refuses a credential before it ever reaches a vector', async () => {
    const dbPaths = scratchPaths();
    const ids = await seed(dbPaths, FIXTURES);
    await assert.rejects(
      () =>
        edit(
          ids[2],
          { text: 'the token is ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789' },
          { paths: dbPaths, env: ENV, now: NOW },
        ),
      (err) => {
        assert.equal(err.code, 'MEM_SECRET_DETECTED');
        return true;
      },
    );
  });

  it('re-embeds when the text changes', needsModel, async () => {
    const dbPaths = scratchPaths();
    const ids = await seed(dbPaths, FIXTURES);
    const text = 'deploy from main every Thursday';
    const { edit: result } = await edit(ids[2], { text }, { paths: dbPaths, env: ENV, now: NOW });
    assert.equal(result.text, text);

    const wanted = await embed(text, { offline: true });
    await open(dbPaths, async (conn) => {
      const row = await conn.get(
        'SELECT text, emb_model, vector_distance_cos(emb, vector32(?)) AS dist FROM memories WHERE id = ?',
        Buffer.from(wanted.buffer),
        ids[2],
      );
      assert.equal(row.text, text);
      assert.equal(row.emb_model, EMB_MODEL);
      assert.ok(row.dist < 1e-5, `the stored vector is the new text's (dist ${row.dist})`);
    });
  });

  // The common triage move. Two commands means the second one gets forgotten,
  // and a queue with edited-but-unpromoted items in it is a queue nobody trusts.
  it('accepts in the same breath when asked', async () => {
    const dbPaths = scratchPaths();
    const ids = await seed(dbPaths, FIXTURES);
    const result = await edit(
      ids[2],
      { kind: 'decision' },
      { paths: dbPaths, env: ENV, now: NOW, promote: true },
    );
    assert.equal(result.promote.action, 'promoted');
    await open(dbPaths, async (conn) => {
      const row = await conn.get('SELECT status, kind FROM memories WHERE id = ?', ids[2]);
      assert.deepEqual([row.status, row.kind], ['active', 'decision']);
    });
  });
});

describe('mem list --sort oldest', () => {
  it('exists, because the queue is drained from the front', async () => {
    assert.ok(SORTS.includes('oldest'));
    await open(readOnly, async (conn) => {
      const { rows } = await listMemories(conn, { statuses: ['staged'], sort: 'oldest', now: NOW });
      const created = rows.map((r) => r.created_at);
      assert.deepEqual(created, [...created].sort((a, b) => a - b));
    });
  });
});

describe('mem review', () => {
  const home = mkdtempSync(join(tmpdir(), 'mem-review-cli-'));
  after(() => rmSync(home, { recursive: true, force: true }));
  symlinkSync(paths.nodeModulesDir, join(home, 'node_modules'));

  const cliPaths = { ...paths, dataDir: home, dbPath: join(home, 'mem.db') };
  let ids = [];
  before(async () => {
    ids = await seed(cliPaths, FIXTURES);
  });

  const cli = (...argv) =>
    spawnSync(process.execPath, [join(paths.pluginRoot, 'bin', 'mem'), ...argv], {
      encoding: 'utf8',
      env: {
        ...process.env,
        CLAUDE_PLUGIN_DATA: home,
        MEM_PROJECT_KEY: 'test/project-a',
        MEM_NO_INSTALL: '1',
      },
    });

  it('lists every project, because a queue that hides items never gets cleared', () => {
    const out = cli('review');
    assert.equal(out.status, 0, out.stderr);
    assert.match(out.stdout, /the api package uses yarn/, 'another project, still queued');
    assert.match(out.stdout, /4 awaiting review/);
    assert.doesNotMatch(out.stdout, /the old staging box/, 'archived is not queued');
  });

  it('shows the duplicate a capture would merge into', () => {
    const out = cli('review');
    assert.match(out.stdout, new RegExp(`#${ids[0]} 0\\.9\\d merge`));
    assert.match(out.stdout, /would merge into it/);
  });

  it('says what the three verbs are', () => {
    const out = cli('review');
    assert.match(out.stdout, /mem review promote/);
    assert.match(out.stdout, /mem review edit/);
    assert.match(out.stdout, /mem review discard/);
  });

  it('emits the whole item as JSON', () => {
    const out = cli('review', '--json');
    const parsed = JSON.parse(out.stdout);
    assert.equal(parsed.total, 4);
    assert.deepEqual(parsed.totals, { 'staged-memory': 4 });
    assert.equal(parsed.items[0].type, 'staged-memory');
    assert.ok(parsed.items.every((i) => i.memory.emb === undefined), 'no vector blobs');
  });

  it('narrows to one scope on request', () => {
    const parsed = JSON.parse(cli('review', '--global', '--json').stdout);
    assert.equal(parsed.total, 1);
    assert.match(parsed.items[0].summary, /terse commit messages/);
  });

  it('promotes, discards and edits from the command line', () => {
    const promoted = cli('review', 'promote', String(ids[3]));
    assert.equal(promoted.status, 0, promoted.stderr);
    assert.match(promoted.stdout, /Promoted/);

    const edited = cli('review', 'edit', String(ids[2]), '--kind', 'decision', '--promote');
    assert.equal(edited.status, 0, edited.stderr);
    assert.match(edited.stdout, /Edited/);
    assert.match(edited.stdout, /Promoted/);

    const discarded = cli('review', 'discard', String(ids[5]), '--reason', 'wrong repo');
    assert.equal(discarded.status, 0, discarded.stderr);
    assert.match(discarded.stdout, /mem forget .* --restore/);

    const merged = cli('review', 'promote', String(ids[1]));
    assert.equal(merged.status, 0, merged.stderr);
    assert.match(merged.stdout, new RegExp(`into #${ids[0]}`));
    assert.match(merged.stdout, /rather than adding a second copy/);

    assert.match(cli('review').stdout, /Nothing to review/);
  });

  it('refuses a verb it does not have and an item it cannot act on', () => {
    const bad = cli('review', 'approve', '1');
    assert.equal(bad.status, 1);
    assert.match(bad.stderr, /unknown verb 'approve'/);
    assert.match(cli('review', 'promote').stderr, /which item/);
    assert.match(cli('review', 'promote', String(ids[0])).stderr, /not staged/);
    assert.match(cli('review', 'edit', String(ids[0]), '--text', 'x').stderr, /not staged/);
  });
});
