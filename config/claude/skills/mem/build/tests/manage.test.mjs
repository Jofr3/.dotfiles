// list / show / forget / pin.
//
// None of this needs the embedding model, and the fixtures prove it: rows are
// seeded with a synthetic vector straight through SQL, so the whole file runs on
// a machine that has never run `mem warm`. That is a property worth keeping —
// inspecting and curating the store must not depend on a 23 MB download.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { withDb } from '../../src/db.mjs';
import { EMB_DIM, EMB_MODEL } from '../../src/embed.mjs';
import {
  LIST_LIMIT,
  MIN_UID_PREFIX,
  buildFilter,
  decorate,
  forget,
  forgetMemory,
  list,
  listMemories,
  memoryEvents,
  pin,
  resolveRef,
  setPinned,
  show,
  showMemory,
} from '../../src/manage.mjs';
import { resolvePaths } from '../../src/paths.mjs';

const paths = resolvePaths();
const scratch = mkdtempSync(join(tmpdir(), 'mem-manage-test-'));
after(() => rmSync(scratch, { recursive: true, force: true }));

let n = 0;
const scratchPaths = () => ({ ...paths, dbPath: join(scratch, `manage-${n++}.db`) });
const ENV = { MEM_PROJECT_KEY: 'test/project-a' };
const NOW = 1_750_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

/**
 * A stand-in embedding. Nothing in manage.mjs computes a distance, so the only
 * thing that matters is that the blob is a real vector32 of the right width.
 */
function fakeVector(seed) {
  const v = new Float32Array(EMB_DIM);
  for (let i = 0; i < EMB_DIM; i += 1) v[i] = Math.sin(seed * (i + 1));
  return Buffer.from(v.buffer);
}

const SEED_SQL = `
  INSERT INTO memories (uid, kind, scope, project_key, text, why, emb, emb_model, emb_dim,
                        salience, confidence, pinned, status, source_kind,
                        created_at, updated_at, last_used_at, useful_count,
                        injected_count, expires_at)
  VALUES (?, ?, ?, ?, ?, ?, ${'vector32(?)'}, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

/** Seed rows without touching the model, and hand back their ids. */
async function seed(dbPaths, rows) {
  return withDb(async (conn) => {
    const ids = [];
    for (const [i, row] of rows.entries()) {
      const r = {
        uid: `uid-${i}`,
        kind: 'fact',
        scope: 'project',
        project_key: 'test/project-a',
        why: null,
        salience: 0.5,
        confidence: 0.5,
        pinned: 0,
        status: 'active',
        source_kind: 'user',
        created_at: NOW - DAY,
        updated_at: NOW - DAY,
        last_used_at: null,
        useful_count: 0,
        injected_count: 0,
        expires_at: null,
        emb: fakeVector(i + 1),
        ...row,
      };
      if (r.scope === 'global') r.project_key = null;
      const info = await conn.run(
        SEED_SQL,
        r.uid, r.kind, r.scope, r.project_key, r.text, r.why,
        r.emb, EMB_MODEL, EMB_DIM,
        r.salience, r.confidence, r.pinned, r.status, r.source_kind,
        r.created_at, r.updated_at, r.last_used_at, r.useful_count,
        r.injected_count, r.expires_at,
      );
      ids.push(info.lastInsertRowid);
    }
    return ids;
  }, { paths: dbPaths, env: ENV });
}

const FIXTURES = [
  { uid: 'aaaa1111-0000-4000-8000-000000000001', text: 'always use pnpm to install dependencies', kind: 'preference' },
  { uid: 'aaaa2222-0000-4000-8000-000000000002', text: 'prefer Vitest over Jest for unit tests', updated_at: NOW - 40 * DAY },
  { uid: 'bbbb3333-0000-4000-8000-000000000003', text: 'I prefer terse commit messages', scope: 'global', pinned: 1 },
  { uid: 'cccc4444-0000-4000-8000-000000000004', text: 'the old staging box is gone', status: 'archived' },
  { uid: 'dddd5555-0000-4000-8000-000000000005', text: 'this sprint ends on Friday', expires_at: NOW - DAY },
  { uid: 'eeee6666-0000-4000-8000-000000000006', text: 'auto-captured, not reviewed yet', status: 'staged' },
];

/** One seeded store, reused by every read-only test below. */
const readOnly = scratchPaths();
const seeded = await seed(readOnly, FIXTURES);

const open = (dbPaths, fn) => withDb(fn, { paths: dbPaths, env: ENV });

describe('buildFilter', () => {
  it('filters nothing by default', () => {
    assert.deepEqual(buildFilter(), { sql: '1', params: [] });
  });

  it('builds status and kind sets', () => {
    const { sql, params } = buildFilter({ statuses: ['active', 'staged'], kinds: ['fact'] });
    assert.equal(sql, 'status IN (?, ?) AND kind IN (?)');
    assert.deepEqual(params, ['active', 'staged', 'fact']);
  });

  // A typo'd filter that silently matches nothing is the quiet failure this
  // codebase keeps refusing to have.
  it('rejects a status or kind that does not exist', () => {
    assert.throws(() => buildFilter({ statuses: ['activ'] }), /Unknown status 'activ'/);
    assert.throws(() => buildFilter({ kinds: ['preferences'] }), /Unknown kind/);
    assert.throws(() => buildFilter({ scope: 'mine' }), /Unknown scope/);
  });

  it('distinguishes the three scopes', () => {
    assert.match(buildFilter({ scope: 'project', projectKey: 'k' }).sql, /scope = 'global' OR project_key/);
    assert.match(buildFilter({ scope: 'project-only', projectKey: 'k' }).sql, /scope = 'project' AND project_key/);
    assert.equal(buildFilter({ scope: 'global' }).sql, "scope = 'global'");
    assert.deepEqual(buildFilter({ scope: 'project', projectKey: 'k' }).params, ['k']);
  });

  it('filters on pinned without a parameter', () => {
    assert.equal(buildFilter({ pinned: true }).sql, 'pinned = 1');
    assert.equal(buildFilter({ pinned: false }).sql, 'pinned = 0');
  });
});

describe('decorate', () => {
  it('marks a memory whose TTL has passed', () => {
    const base = { salience: 1, confidence: 1, pinned: 0, useful_count: 0, updated_at: NOW };
    assert.equal(decorate({ ...base, expires_at: NOW - 1 }, NOW).expired, true);
    assert.equal(decorate({ ...base, expires_at: NOW + DAY }, NOW).expired, false);
    assert.equal(decorate({ ...base, expires_at: null }, NOW).expired, false);
  });

  it('carries the strength retrieval would rank on', () => {
    const row = { salience: 0.5, confidence: 0.5, pinned: 1, useful_count: 0, updated_at: 0 };
    assert.equal(decorate(row, NOW).strength, 0.25, 'pinned means retention 1');
  });
});

describe('resolveRef', () => {
  it('finds a memory by id, #id, uid and uid prefix', async () => {
    await open(readOnly, async (conn) => {
      assert.equal((await resolveRef(conn, seeded[0])).uid, FIXTURES[0].uid);
      assert.equal((await resolveRef(conn, `#${seeded[0]}`)).uid, FIXTURES[0].uid);
      assert.equal((await resolveRef(conn, FIXTURES[0].uid)).id, seeded[0]);
      assert.equal((await resolveRef(conn, 'bbbb')).uid, FIXTURES[2].uid);
    });
  });

  // Picking the first match would eventually archive the wrong memory, and the
  // person who typed the prefix would never find out.
  it('refuses an ambiguous prefix and names the candidates', async () => {
    await open(readOnly, async (conn) => {
      await assert.rejects(() => resolveRef(conn, 'aaaa'), (err) => {
        assert.equal(err.code, 'MEM_AMBIGUOUS_REF');
        assert.match(err.message, /matches 2 memories/);
        assert.match(err.message, new RegExp(FIXTURES[0].uid));
        return true;
      });
    });
  });

  it('refuses a prefix too short to mean anything', async () => {
    await open(readOnly, async (conn) => {
      await assert.rejects(() => resolveRef(conn, 'ab'), /at least 4 characters/);
      assert.equal(MIN_UID_PREFIX, 4);
    });
  });

  it('reports a miss rather than returning nothing', async () => {
    await open(readOnly, async (conn) => {
      await assert.rejects(() => resolveRef(conn, 9999), /No memory #9999/);
      await assert.rejects(() => resolveRef(conn, 'ffffffff'), /No memory matching/);
      await assert.rejects(() => resolveRef(conn, '  '), /Which memory/);
    });
  });

  // A ref of digits is always an id: uids are UUIDs, so the namespaces cannot
  // overlap and the rule needs no disambiguation.
  it('treats a numeric ref as an id, never as a uid', async () => {
    const dbPaths = scratchPaths();
    const [id] = await seed(dbPaths, [{ uid: '12345678-0000-4000-8000-00000000000a', text: 'numeric uid lookalike' }]);
    await open(dbPaths, async (conn) => {
      assert.equal((await resolveRef(conn, id)).id, id);
      await assert.rejects(() => resolveRef(conn, 999), /No memory #999/);
      // '1234' is the first four characters of that uid and is still read as an
      // id, because the rule has to be decidable without a database round-trip.
      await assert.rejects(() => resolveRef(conn, '1234'), /No memory #1234/);
      assert.equal((await resolveRef(conn, '12345678-0000')).id, id, 'a non-numeric prefix resolves');
    });
  });
});

describe('listMemories', () => {
  it('defaults to nothing filtered and reports the total', async () => {
    await open(readOnly, async (conn) => {
      const { rows, total } = await listMemories(conn, { now: NOW });
      assert.equal(total, FIXTURES.length);
      assert.equal(rows.length, FIXTURES.length);
    });
  });

  it('scopes the way retrieval does when asked', async () => {
    await open(readOnly, async (conn) => {
      const union = await listMemories(conn, { scope: 'project', projectKey: 'test/project-a', now: NOW });
      assert.equal(union.total, FIXTURES.length);

      const elsewhere = await listMemories(conn, { scope: 'project', projectKey: 'test/project-b', now: NOW });
      assert.equal(elsewhere.total, 1, 'another project sees only the global');

      const globals = await listMemories(conn, { scope: 'global', now: NOW });
      assert.equal(globals.total, 1);

      const only = await listMemories(conn, { scope: 'project-only', projectKey: 'test/project-a', now: NOW });
      assert.equal(only.total, FIXTURES.length - 1);
    });
  });

  // Retrieval hides expired and archived rows on purpose. The inspection surface
  // must not hide them too, or the store becomes the black box PLAN's plain-text
  // export exists to prevent — it marks them instead.
  it('shows what retrieval hides, marked rather than dropped', async () => {
    await open(readOnly, async (conn) => {
      const { rows } = await listMemories(conn, { now: NOW });
      const expired = rows.find((r) => r.uid === FIXTURES[4].uid);
      assert.equal(expired.expired, true);
      assert.equal(expired.status, 'active', 'expiry is a read-time guard, not a status');

      const archived = rows.find((r) => r.uid === FIXTURES[3].uid);
      assert.equal(archived.status, 'archived');
    });
  });

  it('filters by status, kind and pinned', async () => {
    await open(readOnly, async (conn) => {
      assert.equal((await listMemories(conn, { statuses: ['active'], now: NOW })).total, 4);
      assert.equal((await listMemories(conn, { statuses: ['staged'], now: NOW })).total, 1);
      assert.equal((await listMemories(conn, { kinds: ['preference'], now: NOW })).total, 1);
      assert.equal((await listMemories(conn, { pinned: true, now: NOW })).total, 1);
    });
  });

  it('sorts by recency, id and strength', async () => {
    await open(readOnly, async (conn) => {
      const updated = await listMemories(conn, { sort: 'updated', statuses: ['active'], now: NOW });
      assert.equal(updated.rows.at(-1).uid, FIXTURES[1].uid, '40 days stale sorts last');

      const byId = await listMemories(conn, { sort: 'id', now: NOW });
      assert.deepEqual(byId.rows.map((r) => r.id), [...seeded].reverse());

      const strong = await listMemories(conn, { sort: 'strength', statuses: ['active'], now: NOW });
      assert.equal(strong.rows[0].pinned, 1, 'a pinned memory never decays, so it leads');
      const scores = strong.rows.map((r) => r.strength);
      assert.deepEqual(scores, [...scores].sort((a, b) => b - a));
    });
  });

  it('pages with limit and offset', async () => {
    await open(readOnly, async (conn) => {
      const page = await listMemories(conn, { sort: 'id', limit: 2, offset: 1, now: NOW });
      assert.equal(page.rows.length, 2);
      assert.equal(page.total, FIXTURES.length, 'total counts the filter, not the page');
      const all = await listMemories(conn, { sort: 'id', now: NOW });
      assert.deepEqual(page.rows.map((r) => r.id), all.rows.slice(1, 3).map((r) => r.id));

      const strengthPage = await listMemories(conn, { sort: 'strength', limit: 2, offset: 1, now: NOW });
      assert.equal(strengthPage.rows.length, 2, 'the JS sort pages too');
    });
  });

  it('rejects a sort it cannot do', async () => {
    await open(readOnly, async (conn) => {
      await assert.rejects(() => listMemories(conn, { sort: 'relevance' }), /Unknown sort/);
    });
  });

  it('defaults to one screenful', () => {
    assert.equal(LIST_LIMIT, 20);
  });
});

describe('showMemory', () => {
  it('returns the row with its audit log', async () => {
    const dbPaths = scratchPaths();
    const [id] = await seed(dbPaths, [{ text: 'show me' }]);
    await open(dbPaths, async (conn) => {
      await setPinned(conn, id, true, { now: NOW });
      const { memory, events } = await showMemory(conn, id, { now: NOW });
      assert.equal(memory.text, 'show me');
      assert.equal(memory.embedded, 1);
      assert.equal(typeof memory.strength, 'number');
      assert.equal(events.length, 1);
      assert.equal(events[0].event, 'pinned');
      assert.deepEqual(events[0].detail, { previous: { pinned: 0 } });
    });
  });

  it('can be asked for no events at all', async () => {
    await open(readOnly, async (conn) => {
      assert.deepEqual((await showMemory(conn, seeded[0], { events: 0 })).events, []);
    });
  });
});

describe('forgetMemory', () => {
  it('archives rather than deletes, and says how to undo it', async () => {
    const dbPaths = scratchPaths();
    const [id] = await seed(dbPaths, [{ text: 'archive me' }]);

    await open(dbPaths, async (conn) => {
      const result = await forgetMemory(conn, id, { now: NOW });
      assert.equal(result.action, 'archived');
      assert.equal(result.from, 'active');

      const row = await conn.get('SELECT status, text, updated_at FROM memories WHERE id = ?', id);
      assert.equal(row.status, 'archived');
      assert.equal(row.text, 'archive me', 'the row survives');
      assert.equal(row.updated_at, NOW - DAY, 'archiving must not reset the decay clock');

      const [event] = await memoryEvents(conn, id);
      assert.equal(event.event, 'archived');
      assert.deepEqual(event.detail.previous, { status: 'active' });
    });
  });

  // Restoring a staged auto-capture to 'active' would promote something nobody
  // reviewed straight into retrieval, which is what staging exists to prevent.
  it('restores to the status the memory was archived from', async () => {
    const dbPaths = scratchPaths();
    const [active, staged] = await seed(dbPaths, [
      { uid: 'r1', text: 'was active' },
      { uid: 'r2', text: 'was staged', status: 'staged' },
    ]);

    await open(dbPaths, async (conn) => {
      for (const id of [active, staged]) await forgetMemory(conn, id, { now: NOW });

      assert.equal((await forgetMemory(conn, active, { restore: true, now: NOW })).to, 'active');
      assert.equal((await forgetMemory(conn, staged, { restore: true, now: NOW })).to, 'staged');

      const rows = await conn.all('SELECT id, status FROM memories ORDER BY id');
      assert.deepEqual(rows.map((r) => r.status), ['active', 'staged']);
    });
  });

  it('refuses to restore something that is not archived', async () => {
    await open(readOnly, async (conn) => {
      await assert.rejects(() => forgetMemory(conn, seeded[0], { restore: true }), /not archived/);
      await assert.rejects(() => forgetMemory(conn, seeded[3]), /already archived/);
      await assert.rejects(
        () => forgetMemory(conn, seeded[0], { restore: true, hard: true }),
        /contradict/,
      );
    });
  });

  // PLAN: pinned memories are exempt from every automatic action. A typo'd id is
  // close enough to automatic.
  it('will not forget a pinned memory without --force', async () => {
    const dbPaths = scratchPaths();
    const [id] = await seed(dbPaths, [{ text: 'load-bearing', pinned: 1 }]);

    await open(dbPaths, async (conn) => {
      await assert.rejects(() => forgetMemory(conn, id, { now: NOW }), (err) => {
        assert.equal(err.code, 'MEM_PINNED');
        return true;
      });
      assert.equal((await conn.get('SELECT status FROM memories WHERE id = ?', id)).status, 'active');

      const forced = await forgetMemory(conn, id, { force: true, now: NOW });
      assert.equal(forced.action, 'archived');
    });
  });

  // Rung 4 of the ladder, and the only irreversible one. Leaving the text behind
  // in the audit log would make "purge" a lie.
  it('purges the row, its events and its links under --hard', async () => {
    const dbPaths = scratchPaths();
    const [id, other] = await seed(dbPaths, [
      { uid: 'p1', text: 'a secret I regret storing' },
      { uid: 'p2', text: 'the newer version' },
    ]);

    await open(dbPaths, async (conn) => {
      await conn.run('UPDATE memories SET superseded_by = ? WHERE id = ?', id, other);
      await conn.run("INSERT INTO memory_links (src, dst, rel) VALUES (?, ?, 'related')", other, id);
      await setPinned(conn, id, true, { now: NOW });
      await setPinned(conn, id, false, { now: NOW });

      const result = await forgetMemory(conn, id, { hard: true, now: NOW });
      assert.equal(result.action, 'purged');
      assert.equal(result.eventsDeleted, 2);

      assert.equal(await conn.get('SELECT id FROM memories WHERE id = ?', id), undefined);
      assert.deepEqual(await memoryEvents(conn, id), []);
      assert.equal((await conn.get('SELECT count(*) AS n FROM memory_links')).n, 0);
      assert.equal(
        (await conn.get('SELECT superseded_by FROM memories WHERE id = ?', other)).superseded_by,
        null,
        'a dangling pointer would break the next write',
      );

      const [purge] = await conn.all("SELECT * FROM memory_events WHERE event = 'purged'");
      assert.equal(purge.memory_id, null);
      const detail = JSON.parse(purge.detail);
      assert.equal(detail.uid, 'p1');
      assert.equal(detail.events_deleted, 2);
      assert.equal(
        JSON.stringify(detail).includes('regret'),
        false,
        'a purge that keeps the text is not a purge',
      );
    });
  });
});

describe('setPinned', () => {
  it('pins, unpins and stays quiet when nothing changes', async () => {
    const dbPaths = scratchPaths();
    const [id] = await seed(dbPaths, [{ text: 'pin me' }]);

    await open(dbPaths, async (conn) => {
      assert.equal((await setPinned(conn, id, true, { now: NOW })).changed, true);
      const again = await setPinned(conn, id, true, { now: NOW });
      assert.equal(again.changed, false);
      assert.equal(again.eventId, null, 'the log records decisions, not repetitions');

      assert.equal((await setPinned(conn, id, false, { now: NOW })).changed, true);
      assert.equal((await conn.get('SELECT pinned FROM memories WHERE id = ?', id)).pinned, 0);
      assert.deepEqual(
        (await memoryEvents(conn, id)).map((e) => e.event),
        ['unpinned', 'pinned'],
      );
    });
  });

  // Unpinning must not look like a fresh restatement, or a memory nobody has
  // touched in months would come back at full strength.
  it('leaves updated_at alone', async () => {
    const dbPaths = scratchPaths();
    const [id] = await seed(dbPaths, [{ text: 'old but pinned', updated_at: NOW - 200 * DAY }]);
    await open(dbPaths, async (conn) => {
      await setPinned(conn, id, true, { now: NOW });
      await setPinned(conn, id, false, { now: NOW });
      assert.equal((await conn.get('SELECT updated_at FROM memories WHERE id = ?', id)).updated_at, NOW - 200 * DAY);
    });
  });
});

describe('batch operations', () => {
  it('forgets and pins several memories atomically', async () => {
    const dbPaths = scratchPaths();
    const ids = await seed(dbPaths, [
      { uid: 'b1', text: 'one' },
      { uid: 'b2', text: 'two' },
      { uid: 'b3', text: 'three' },
    ]);

    const pinned = await pin(ids.slice(0, 2), true, { paths: dbPaths, env: ENV });
    assert.deepEqual(pinned.map((r) => r.pinned), [1, 1]);

    const forgotten = await forget([ids[2]], { paths: dbPaths, env: ENV, now: NOW });
    assert.equal(forgotten[0].action, 'archived');

    // The third ref is bad, so none of the batch may land.
    await assert.rejects(
      () => forget([ids[0], 9999], { paths: dbPaths, env: ENV, force: true }),
      /No memory #9999/,
    );
    const { rows } = await list({ paths: dbPaths, env: ENV, statuses: ['active'], now: NOW });
    assert.deepEqual(rows.map((r) => r.text).sort(), ['one', 'two']);
  });

  it('opens the database itself when handed no connection', async () => {
    const { memory } = await show(seeded[0], { paths: readOnly, env: ENV });
    assert.equal(memory.uid, FIXTURES[0].uid);
  });
});

describe('mem list | show | forget | pin', () => {
  const home = mkdtempSync(join(tmpdir(), 'mem-manage-cli-'));
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

  it('lists the active memories in this scope', () => {
    const out = cli('list');
    assert.equal(out.status, 0, out.stderr);
    assert.match(out.stdout, /always use pnpm to install dependencies/);
    assert.doesNotMatch(out.stdout, /auto-captured/, 'staged is not active');
    assert.doesNotMatch(out.stdout, /the old staging box/, 'archived is not active');
    assert.match(out.stdout, /4 memories\./);
  });

  it('marks pinned and expired rows rather than hiding them', () => {
    const out = cli('list');
    assert.match(out.stdout, /pinned.*I prefer terse commit messages/);
    assert.match(out.stdout, /expired.*this sprint ends on Friday/);
  });

  it('filters, sorts and pages', () => {
    assert.match(cli('list', '--status', 'staged').stdout, /auto-captured/);
    assert.match(cli('list', '--status', 'archived,staged').stdout, /the old staging box/);
    assert.match(cli('list', '--global').stdout, /1 memory\./);
    assert.match(cli('list', '--pinned').stdout, /terse commit/);

    const paged = cli('list', '--limit', '2', '--json');
    assert.equal(JSON.parse(paged.stdout).count, 2);
    assert.equal(JSON.parse(paged.stdout).total, 4);
    assert.match(cli('list', '--limit', '2').stdout, /2 of 4/);

    const sorted = JSON.parse(cli('list', '--sort', 'strength', '--json').stdout);
    assert.equal(sorted.memories[0].pinned, 1);
  });

  it('rejects an unknown filter instead of matching nothing', () => {
    const bad = cli('list', '--status', 'activ');
    assert.equal(bad.status, 1);
    assert.match(bad.stderr, /Unknown status 'activ'/);
    assert.match(cli('list', 'pnpm').stderr, /did you mean 'mem search'/);
    assert.match(cli('list', '--global', '--all').stderr, /contradict/);
  });

  it('shows one memory in full, with its history', () => {
    const out = cli('show', String(ids[0]));
    assert.equal(out.status, 0, out.stderr);
    assert.match(out.stdout, new RegExp(`#${ids[0]} {2}${FIXTURES[0].uid}`));
    assert.match(out.stdout, /strength\s+0\.\d+/);
    assert.match(out.stdout, /scope\s+project test\/project-a/);
    assert.match(out.stdout, /expires\s+never/);

    const json = JSON.parse(cli('show', FIXTURES[0].uid, '--json').stdout);
    assert.equal(json.memories[0].memory.uid, FIXTURES[0].uid);
    assert.equal(json.memories[0].memory.emb, undefined);
  });

  it('exits 1 on a reference that resolves to nothing', () => {
    const out = cli('show', '9999');
    assert.equal(out.status, 1);
    assert.match(out.stderr, /No memory #9999/);
    assert.match(cli('show').stderr, /which memory/);
  });

  it('archives, restores and purges', () => {
    const id = String(ids[1]);
    const archived = cli('forget', id);
    assert.equal(archived.status, 0, archived.stderr);
    assert.match(archived.stdout, /Archived #/);
    assert.match(archived.stdout, /--restore/);
    assert.doesNotMatch(cli('list').stdout, /Vitest/);

    assert.match(cli('forget', id, '--restore').stdout, /Restored #\d+ to active/);
    assert.match(cli('list').stdout, /Vitest/);

    const hard = cli('forget', id, '--hard');
    assert.equal(hard.status, 0, hard.stderr);
    assert.match(hard.stdout, /Purged #/);
    assert.match(hard.stdout, /cannot be undone/);
    assert.equal(cli('show', id).status, 1);
  });

  it('refuses to forget a pinned memory without --force', () => {
    const pinnedId = String(ids[2]);
    const refused = cli('forget', pinnedId);
    assert.equal(refused.status, 1);
    assert.match(refused.stderr, /is pinned/);

    assert.match(cli('pin', pinnedId, '--off').stdout, /Unpinned/);
    assert.match(cli('pin', pinnedId, '--off').stdout, /already unpinned/);
    assert.match(cli('pin', pinnedId).stdout, /never decay/);
  });

  it('pins several memories at once', () => {
    const out = cli('pin', String(ids[0]), FIXTURES[4].uid, '--json');
    assert.equal(out.status, 0, out.stderr);
    const { results } = JSON.parse(out.stdout);
    assert.deepEqual(results.map((r) => r.pinned), [1, 1]);
    assert.match(cli('list', '--pinned').stdout, /3 memories\./);
  });
});
