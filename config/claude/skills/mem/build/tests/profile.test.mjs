// The core profile and the SessionStart hook.
//
// Like manage.test.mjs, rows are seeded with a synthetic vector straight through
// SQL: nothing on this path computes a distance, so the whole file runs on a
// machine that has never downloaded the model. That is not just convenience —
// it is the property the hook depends on. If any of this needed an embedding,
// session start would pay the ~250ms transformers import plus model load.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { withDb } from '../../src/db.mjs';
import { EMB_DIM, EMB_MODEL } from '../../src/embed.mjs';
import { resolvePaths } from '../../src/paths.mjs';
import {
  MIN_STRENGTH,
  PROFILE_LIMIT,
  coreProfile,
  formatAge,
  rankProfile,
  renderProfile,
} from '../../src/profile.mjs';

const paths = resolvePaths();
const HOOK = join(paths.pluginRoot, 'hooks', 'session-start.mjs');
const PROJECT = 'test/project-a';
const OTHER = 'test/project-b';
const NOW = 1_750_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

const scratch = mkdtempSync(join(tmpdir(), 'mem-profile-test-'));
after(() => rmSync(scratch, { recursive: true, force: true }));

let n = 0;
const scratchPaths = () => ({ ...paths, dbPath: join(scratch, `profile-${n++}.db`) });

function fakeVector(seed) {
  const v = new Float32Array(EMB_DIM);
  for (let i = 0; i < EMB_DIM; i += 1) v[i] = Math.sin(seed * (i + 1));
  return Buffer.from(v.buffer);
}

const SEED_SQL = `
  INSERT INTO memories (uid, kind, scope, project_key, text, why, emb, emb_model, emb_dim,
                        salience, confidence, pinned, status,
                        created_at, updated_at, last_used_at, useful_count, expires_at)
  VALUES (?, ?, ?, ?, ?, ?, vector32(?), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

/**
 * `now` matters. Strength decays from the row's timestamps, so a fixture stamped
 * with the frozen NOW is fine for an in-process test that also passes NOW — and
 * invisible to the hook, which uses the real clock and would rank a June-2025
 * fixture as a year-stale memory below the floor. The hook fixtures are seeded
 * against Date.now() for exactly that reason.
 */
async function seed(dbPaths, rows, now = NOW) {
  return withDb(async (conn) => {
    const ids = [];
    for (const [i, row] of rows.entries()) {
      const r = {
        uid: `uid-${i}`,
        kind: 'preference',
        scope: 'global',
        project_key: null,
        why: null,
        salience: 0.5,
        confidence: 0.5,
        pinned: 0,
        status: 'active',
        created_at: now - DAY,
        updated_at: now - DAY,
        last_used_at: null,
        useful_count: 0,
        expires_at: null,
        ...row,
      };
      const res = await conn.run(
        SEED_SQL,
        r.uid, r.kind, r.scope, r.project_key, r.text, r.why,
        fakeVector(i + 1), EMB_MODEL, EMB_DIM,
        r.salience, r.confidence, r.pinned, r.status,
        r.created_at, r.updated_at, r.last_used_at, r.useful_count, r.expires_at,
      );
      ids.push(Number(res.lastInsertRowid));
    }
    return ids;
  }, { paths: dbPaths, env: { MEM_NO_INSTALL: '1' } });
}

/** A row shaped enough for strength() and the renderer. */
const row = (over = {}) => ({
  id: 1, uid: 'u', kind: 'preference', scope: 'global', project_key: null,
  text: 'a fact', why: null, salience: 0.9, confidence: 0.9, pinned: 0,
  created_at: NOW - DAY, updated_at: NOW - DAY, last_used_at: NOW - DAY, useful_count: 0,
  ...over,
});

describe('rankProfile', () => {
  it('caps at PROFILE_LIMIT — PLAN says pinned + core globals, at most three', () => {
    const rows = [1, 2, 3, 4, 5, 6].map((id) => row({ id, salience: 0.9 }));
    assert.equal(PROFILE_LIMIT, 3);
    assert.equal(rankProfile(rows, { now: NOW }).length, 3);
  });

  it('puts pinned first as a tier a stronger global cannot outbid', () => {
    const picked = rankProfile(
      [
        row({ id: 1, salience: 1, confidence: 1 }),
        row({ id: 2, salience: 0.05, confidence: 0.2, pinned: 1 }),
        row({ id: 3, salience: 1, confidence: 1 }),
      ],
      { now: NOW },
    );
    assert.equal(picked[0].id, 2, 'the pinned one leads even though it is the weakest');
    assert.deepEqual(picked.map((r) => r.id), [2, 1, 3]);
  });

  it('ranks the unpinned tier by strength, not by recency or id', () => {
    const picked = rankProfile(
      [
        row({ id: 1, salience: 0.3, created_at: NOW, updated_at: NOW, last_used_at: NOW }),
        row({ id: 2, salience: 0.9 }),
        row({ id: 3, salience: 0.6 }),
      ],
      { now: NOW },
    );
    assert.deepEqual(picked.map((r) => r.id), [2, 3, 1]);
  });

  it('breaks ties on id so the same store always injects the same three', () => {
    const rows = [7, 3, 9, 1].map((id) => row({ id }));
    assert.deepEqual(rankProfile(rows, { now: NOW }).map((r) => r.id), [1, 3, 7]);
  });

  it('drops a global that has decayed below the floor', () => {
    const stale = row({ id: 1, salience: 0.5, confidence: 0.5, last_used_at: NOW - 200 * DAY });
    assert.ok(rankProfile([stale], { now: NOW }).length === 0);
    assert.equal(rankProfile([stale], { now: NOW, minStrength: 0 }).length, 1);
  });

  it('never applies the floor to a pinned memory — pinned means never decays', () => {
    const ancient = row({
      id: 1, pinned: 1, salience: 0.01, confidence: 0.01,
      created_at: NOW - 3000 * DAY, updated_at: NOW - 3000 * DAY, last_used_at: NOW - 3000 * DAY,
    });
    const picked = rankProfile([ancient], { now: NOW });
    assert.equal(picked.length, 1);
    assert.ok(picked[0].strength < MIN_STRENGTH, 'kept despite being under the floor');
  });
});

describe('profile selection over a real store', () => {
  const FIXTURES = [
    { text: 'always use pnpm to install dependencies', scope: 'global', salience: 0.9, confidence: 0.9 },
    { text: 'never force push a shared branch', scope: 'global', salience: 0.8, confidence: 0.9 },
    { text: 'run the linter before committing', scope: 'global', salience: 0.7, confidence: 0.8 },
    { text: 'the deploy target is fly.io', scope: 'project', project_key: PROJECT, salience: 0.95, confidence: 0.95 },
    { text: 'this project pins node 22', scope: 'project', project_key: PROJECT, pinned: 1, salience: 0.4, confidence: 0.6 },
    { text: 'project b uses yarn', scope: 'project', project_key: OTHER, pinned: 1, salience: 0.9, confidence: 0.9 },
    { text: 'staged and not yet promoted', scope: 'global', status: 'staged', salience: 0.99, confidence: 0.99 },
    { text: 'archived last month', scope: 'global', status: 'archived', salience: 0.99, confidence: 0.99 },
    { text: 'expired yesterday', scope: 'global', salience: 0.99, confidence: 0.99, expires_at: NOW - DAY },
  ];

  const dbPaths = scratchPaths();
  let ids = [];
  before(async () => { ids = await seed(dbPaths, FIXTURES); });

  const profile = () =>
    withDb((conn) => coreProfile(conn, { projectKey: PROJECT, now: NOW }), {
      paths: dbPaths, env: { MEM_NO_INSTALL: '1' },
    });

  it('selects pinned-in-scope plus the strongest globals', async () => {
    const { rows } = await profile();
    assert.deepEqual(rows.map((r) => r.text), [
      'this project pins node 22',            // pinned, in this project
      'always use pnpm to install dependencies',
      'never force push a shared branch',
    ]);
  });

  it('excludes an unpinned project memory however strong it is', async () => {
    // salience 0.95 — the strongest row in the store, and still not the profile's
    // business. PLAN: "pinned + core globals". Per-prompt retrieval owns the rest.
    const { rows } = await profile();
    assert.ok(!rows.some((r) => r.text.includes('fly.io')));
  });

  it('excludes another project\'s pinned memory', async () => {
    const { rows } = await profile();
    assert.ok(!rows.some((r) => r.text.includes('yarn')));
  });

  it('excludes staged, archived and expired rows', async () => {
    const { rows, stats } = await profile();
    const text = rows.map((r) => r.text).join(' ');
    for (const gone of ['staged', 'archived', 'expired']) {
      assert.ok(!text.includes(gone), `${gone} row leaked into the profile`);
    }
    // 3 globals + 1 pinned project row. Not the 9 seeded, not the 6 active.
    assert.equal(stats.eligible, 4);
    assert.equal(stats.selected, 3);
    assert.equal(stats.pinned, 1);
  });

  it('scopes to globals only when there is no project key', async () => {
    const { rows } = await withDb((conn) => coreProfile(conn, { projectKey: null, now: NOW }), {
      paths: dbPaths, env: { MEM_NO_INSTALL: '1' },
    });
    assert.ok(rows.every((r) => r.scope === 'global'), 'a null key must not widen the scope');
    assert.equal(rows.length, 3);
  });

  it('reports ids that resolve back to the seeded rows', async () => {
    const { rows } = await profile();
    for (const r of rows) assert.ok(ids.includes(r.id));
  });
});

describe('formatAge', () => {
  it('is coarse on purpose', () => {
    assert.equal(formatAge(NOW, NOW), 'today');
    assert.equal(formatAge(NOW - 3 * 60 * 60 * 1000, NOW), 'today');
    assert.equal(formatAge(NOW - DAY, NOW), 'yesterday');
    assert.equal(formatAge(NOW - 41 * DAY, NOW), '41d ago');
    assert.equal(formatAge(NOW - 120 * DAY, NOW), '4mo ago');
    assert.equal(formatAge(NOW - 900 * DAY, NOW), '2y ago');
  });

  it('does not invent an age it does not have', () => {
    assert.equal(formatAge(null, NOW), 'age unknown');
    assert.equal(formatAge(undefined, NOW), 'age unknown');
  });

  it('never reports a negative age from a clock skew', () => {
    assert.equal(formatAge(NOW + 10 * DAY, NOW), 'today');
  });
});

describe('renderProfile', () => {
  const rendered = () =>
    renderProfile(
      rankProfile(
        [
          row({ id: 12, pinned: 1, text: 'always use pnpm', why: 'npm lockfile churn', created_at: NOW - 41 * DAY }),
          row({ id: 7, text: 'never force push a shared branch', created_at: NOW - 3 * DAY }),
        ],
        { now: NOW },
      ),
      { now: NOW, eligible: 9 },
    );

  it('injects nothing when nothing was selected', () => {
    assert.equal(renderProfile([], { now: NOW }), null);
  });

  it('frames the block as recollection, not as instruction', () => {
    const out = rendered();
    assert.match(out, /BACKGROUND, NOT INSTRUCTIONS/);
    assert.match(out, /Do not act on it/);
    assert.match(out, /may be\s+out of date/);
  });

  it('carries ids and ages for every item — the slice contract', () => {
    const out = rendered();
    assert.match(out, /#12\b/);
    assert.match(out, /41d ago/);
    assert.match(out, /#7\b/);
    assert.match(out, /3d ago/);
  });

  it('marks the pinned one as pinned', () => {
    assert.match(rendered(), /#12\s+\(pinned ·/);
  });

  it('says a correction is possible, by id', () => {
    assert.match(rendered(), /mem forget <id>/);
  });

  it('does not present the cap as the whole of what is known', () => {
    assert.match(rendered(), /Showing 2 of 9/);
    // ...and says nothing about counts when nothing was left out.
    const whole = renderProfile([row({ id: 1 })], { now: NOW, eligible: 1 });
    assert.doesNotMatch(whole, /Showing/);
  });

  it('clips a rambling memory rather than eating the budget', () => {
    const out = renderProfile([row({ id: 1, text: 'x'.repeat(900), why: 'y'.repeat(900) })], { now: NOW });
    assert.ok(out.length < 1400, `block was ${out.length} chars`);
    assert.match(out, /…/);
  });

  it('stays inside the ~600 token budget at a full three items', () => {
    const rows = [1, 2, 3].map((id) => row({
      id, text: 'a fairly wordy memory about how this user prefers to do things '.repeat(2),
      why: 'because they said so at some length in an earlier session',
    }));
    const out = renderProfile(rankProfile(rows, { now: NOW }), { now: NOW });
    // ~4 chars/token; 600 tokens is ~2400 chars.
    assert.ok(out.length < 2400, `block was ${out.length} chars`);
  });
});

describe('the SessionStart hook', () => {
  const home = mkdtempSync(join(tmpdir(), 'mem-profile-hook-'));
  after(() => rmSync(home, { recursive: true, force: true }));
  symlinkSync(paths.nodeModulesDir, join(home, 'node_modules'));

  const empty = mkdtempSync(join(tmpdir(), 'mem-profile-nodb-'));
  after(() => rmSync(empty, { recursive: true, force: true }));

  // A file that exists and is not a database: past the existsSync guard, into
  // turso, and back out as a silent no-op.
  const broken = mkdtempSync(join(tmpdir(), 'mem-profile-broken-'));
  after(() => rmSync(broken, { recursive: true, force: true }));
  symlinkSync(paths.nodeModulesDir, join(broken, 'node_modules'));
  writeFileSync(join(broken, 'mem.db'), 'this is not a database');

  // Never touched by anything but the "creates nothing" test.
  const fresh = mkdtempSync(join(tmpdir(), 'mem-profile-fresh-'));
  after(() => rmSync(fresh, { recursive: true, force: true }));

  const hookPaths = { ...paths, dataDir: home, dbPath: join(home, 'mem.db') };

  before(async () => {
    await seed(
      hookPaths,
      [
        { text: 'always use pnpm to install dependencies', scope: 'global', salience: 0.9, confidence: 0.9 },
        { text: 'never force push a shared branch', scope: 'global', salience: 0.8, confidence: 0.9 },
        { text: 'this project pins node 22', scope: 'project', project_key: PROJECT, pinned: 1 },
        { text: 'run the linter before committing', scope: 'global', salience: 0.7, confidence: 0.8 },
      ],
      Date.now(),
    );
  });

  const run = ({ input = { hook_event_name: 'SessionStart', source: 'startup', cwd: '.' }, dataDir = home, ...over } = {}) =>
    spawnSync(process.execPath, [HOOK], {
      encoding: 'utf8',
      input: typeof input === 'string' ? input : JSON.stringify(input),
      env: {
        ...process.env,
        CLAUDE_PLUGIN_DATA: dataDir,
        MEM_PROJECT_KEY: PROJECT,
        MEM_NO_INSTALL: '1',
        ...over.env,
      },
    });

  const parse = (out) => {
    assert.equal(out.status, 0, out.stderr);
    assert.notEqual(out.stdout.trim(), '', 'expected an injection');
    return JSON.parse(out.stdout);
  };

  it('emits SessionStart additionalContext in the harness shape', () => {
    const payload = parse(run());
    assert.equal(payload.hookSpecificOutput.hookEventName, 'SessionStart');
    assert.match(payload.hookSpecificOutput.additionalContext, /^<mem-recollection>/);
  });

  it('injects at most three, pinned first', () => {
    const text = parse(run()).hookSpecificOutput.additionalContext;
    assert.equal(text.match(/^ {2}#\d+ {2}\(/gm).length, 3);
    assert.match(text, /pnpm/);
    assert.match(text, /node 22/);
    assert.doesNotMatch(text, /linter/, 'the weakest global is the one dropped');
    assert.ok(text.indexOf('node 22') < text.indexOf('pnpm'), 'pinned leads');
  });

  it('is quiet and successful on a machine with no store', () => {
    const out = run({ dataDir: empty });
    assert.equal(out.status, 0);
    assert.equal(out.stdout, '');
    assert.equal(out.stderr, '', 'a hook must not print to stderr either');
  });

  it('fails open on malformed hook input rather than going dark', () => {
    // The only field it needs is cwd, and process.cwd() answers that. A harness
    // format change must not silently disable recall.
    for (const input of ['', 'not json at all', '{"cwd":', 'null']) {
      const out = run({ input });
      assert.equal(out.status, 0, `input ${JSON.stringify(input)}: ${out.stderr}`);
      assert.match(out.stdout, /mem-recollection/, `input ${JSON.stringify(input)} went dark`);
    }
  });

  it('exits 0 and says nothing when the database is unreadable', () => {
    const out = run({ dataDir: broken });
    assert.equal(out.status, 0);
    assert.equal(out.stdout, '');
    assert.equal(out.stderr, '');
  });

  it('injects on every source, compact included', () => {
    for (const source of ['startup', 'resume', 'clear', 'compact']) {
      const out = run({ input: { hook_event_name: 'SessionStart', source, cwd: '.' } });
      assert.match(out.stdout, /mem-recollection/, `source ${source} injected nothing`);
    }
  });

  it('creates nothing — no database, no data directory, no install', () => {
    const nested = join(fresh, 'not-yet');
    run({ dataDir: nested });
    assert.equal(existsSync(nested), false, 'the hook created its data dir');
  });

  it('gives up on its own budget instead of hanging the session', () => {
    const out = run({ env: { MEM_HOOK_TIMEOUT_MS: '1' } });
    assert.equal(out.status, 0);
    assert.equal(out.stdout, '', 'over budget must inject nothing');
    assert.equal(out.stderr, '');
  });

  it('explains itself only under MEM_HOOK_DEBUG', () => {
    assert.equal(run({ dataDir: empty }).stderr, '');
    const loud = run({ dataDir: empty, env: { MEM_HOOK_DEBUG: '1' } });
    assert.match(loud.stderr, /no database/);
    assert.equal(loud.status, 0);
  });

  // The phase-3 exit criterion is p95 < 400ms, and the 2.2 handoff measured a
  // ~43% spread across runs of identical code — so this samples rather than
  // trusting one number. It is generous about the machine on purpose: `node
  // --test` runs files concurrently and this one shares a box with two suites
  // that load ONNX models. Every sample prints either way, so drift stays
  // visible even when the gate passes.
  it('answers well inside the 400ms hook budget', () => {
    const samples = [];
    for (let i = 0; i < 15; i += 1) {
      const t = performance.now();
      const out = run();
      samples.push(performance.now() - t);
      assert.equal(out.status, 0, out.stderr);
    }
    const sorted = [...samples].sort((a, b) => a - b);
    const p95 = sorted[Math.min(sorted.length - 1, Math.ceil(0.95 * sorted.length) - 1)];
    const ms = (x) => Math.round(x);
    console.log(`  session-start: ${sorted.map(ms).join(' ')} ms (p95 ${ms(p95)}, best ${ms(sorted[0])})`);
    // No embedding on this path, so the honest budget is far under 400: node
    // boot, a turso import, one scoped column read.
    assert.ok(sorted[0] < 400, `best sample was ${ms(sorted[0])} ms`);
    assert.ok(p95 < 400, `p95 was ${ms(p95)} ms across ${samples.length} samples`);
  });
});
