// The write path. Validation and merge policy are pure and always run; the
// dedup tests need the real cached model (`mem warm`) and skip without it,
// because a fake embedding cannot exercise a 0.93 similarity threshold.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';

import { withDb } from '../../src/db.mjs';
import { EMB_DIM, EMB_MODEL, embed, modelCached, vectorBlob } from '../../src/embed.mjs';
import { resolvePaths } from '../../src/paths.mjs';
import {
  CONFIDENCE_BUMP,
  DEDUP_THRESHOLD,
  DEFAULT_CONFIDENCE,
  MAX_TEXT,
  addMemory,
  bumpConfidence,
  mergePlan,
  nearestInScope,
  normaliseInput,
  normaliseText,
} from '../../src/write.mjs';

const paths = resolvePaths();
const needsModel = { skip: modelCached(paths) ? false : `model not cached — run 'mem warm'` };

const scratch = mkdtempSync(join(tmpdir(), 'mem-write-test-'));
after(() => rmSync(scratch, { recursive: true, force: true }));

let n = 0;
/** A fresh database file; deps and the model still come from the real dataDir. */
const scratchPaths = () => ({ ...paths, dbPath: join(scratch, `write-${n++}.db`) });

/** Never let an ambient MEM_PROJECT_KEY or MEM_ALLOW_SECRETS green a test. */
const ENV = { MEM_PROJECT_KEY: 'test/project-a' };

const add = (input, opts = {}) =>
  addMemory(input, { paths: opts.paths ?? scratchPaths(), env: ENV, ...opts });

// Measured against the real model (gte-small@q8), and a useful calibration of
// how tight 0.93 is: the pair below scores 0.976 and merges, while "always use
// pnpm to install dependencies" against the terser "always use pnpm, never npm"
// scores 0.927 and stays two memories. An unrelated fact sits at 0.741 — note
// how high that floor is, which is why 0.93 means something quite different
// under this model than it did under all-MiniLM (see slice 1.6 in PLAN.md).
const PNPM = 'always use pnpm to install dependencies';
const PNPM_LONGER = 'always use pnpm to install dependencies, never npm';
const UNRELATED = 'the staging database is reset every Monday';

const rows = (conn) => conn.all('SELECT * FROM memories ORDER BY id');
const events = (conn) => conn.all('SELECT * FROM memory_events ORDER BY id');

describe('normaliseText', () => {
  it('collapses a fact onto one line', () => {
    assert.equal(normaliseText('  use   pnpm,\n  never npm  '), 'use pnpm, never npm');
    assert.equal(normaliseText(''), '');
    assert.equal(normaliseText(undefined), '');
  });
});

describe('normaliseInput', () => {
  it('applies the documented defaults', () => {
    const out = normaliseInput({ text: 'use pnpm' });
    assert.equal(out.kind, 'fact');
    assert.equal(out.status, 'active');
    assert.equal(out.sourceKind, 'user');
    assert.equal(out.salience, 0.5);
    assert.equal(out.confidence, 0.5);
    assert.equal(out.pinned, 0);
    assert.equal(out.why, null);
    assert.equal(out.expiresAt, null);
    assert.deepEqual(out.explicit, { salience: false, confidence: false });
  });

  it('records which optional numbers the caller actually gave', () => {
    const out = normaliseInput({ text: 'x', salience: 0.9 });
    assert.deepEqual(out.explicit, { salience: true, confidence: false });
    assert.equal(out.salience, 0.9);
  });

  it('refuses an empty memory', () => {
    for (const text of ['', '   ', '\n\t', undefined, null, 42]) {
      assert.throws(() => normaliseInput({ text }), /empty memory/, `accepted ${JSON.stringify(text)}`);
    }
  });

  it('caps text at one fact and points at --why', () => {
    assert.throws(() => normaliseInput({ text: 'x'.repeat(MAX_TEXT + 1) }), /--why/);
    assert.doesNotThrow(() => normaliseInput({ text: 'x'.repeat(MAX_TEXT) }));
  });

  it('rejects values outside the closed vocabularies', () => {
    assert.throws(() => normaliseInput({ text: 'x', kind: 'opinion' }), /Unknown kind/);
    assert.throws(() => normaliseInput({ text: 'x', sourceKind: 'robot' }), /Unknown source/);
  });

  // Reaching 'archived' or 'superseded' is the outcome of a decision (pruning,
  // consolidation); an add that could name them would forge that decision.
  it('refuses to write a lifecycle-only status', () => {
    assert.throws(() => normaliseInput({ text: 'x', status: 'archived' }), /Unknown status/);
    assert.throws(() => normaliseInput({ text: 'x', status: 'superseded' }), /Unknown status/);
    for (const status of ['staged', 'active']) {
      assert.equal(normaliseInput({ text: 'x', status }).status, status);
    }
  });

  it('rejects out-of-range weights', () => {
    for (const bad of [-0.1, 1.5, NaN, 'high']) {
      assert.throws(() => normaliseInput({ text: 'x', salience: bad }), /between 0 and 1/);
      assert.throws(() => normaliseInput({ text: 'x', confidence: bad }), /between 0 and 1/);
    }
  });

  it('rejects a nonsense expiry', () => {
    assert.throws(() => normaliseInput({ text: 'x', expiresAt: -1 }), /epoch-millisecond/);
    assert.throws(() => normaliseInput({ text: 'x', expiresAt: 1.5 }), /epoch-millisecond/);
  });
});

describe('bumpConfidence', () => {
  it('saturates instead of accumulating', () => {
    let c = DEFAULT_CONFIDENCE;
    let previous = -1;
    for (let i = 0; i < 50; i += 1) {
      c = bumpConfidence(c);
      assert.ok(c > previous, 'must be strictly increasing');
      assert.ok(c <= 1, `escaped the ceiling at step ${i}: ${c}`);
      previous = c;
    }
    assert.ok(c > 0.99, 'fifty confirmations should get close to certain');
    assert.equal(bumpConfidence(1), 1);
    assert.equal(bumpConfidence(0.5), 0.5 + 0.5 * CONFIDENCE_BUMP);
  });
});

describe('mergePlan', () => {
  const stored = {
    text: 'use pnpm',
    why: null,
    salience: 0.5,
    confidence: 0.5,
    pinned: 0,
  };
  const incoming = (over = {}) => ({
    text: 'use pnpm',
    why: null,
    salience: 0.5,
    confidence: 0.5,
    pinned: 0,
    explicit: { salience: false, confidence: false },
    ...over,
  });
  const field = (changes, name) => changes.find((c) => c.field === name);

  it('always bumps confidence — a repeat is evidence', () => {
    const changes = mergePlan(stored, incoming());
    assert.deepEqual(field(changes, 'confidence'), {
      field: 'confidence',
      from: 0.5,
      to: bumpConfidence(0.5),
    });
  });

  it('takes the longer text and leaves the shorter one alone', () => {
    const longer = mergePlan(stored, incoming({ text: 'use pnpm, never npm or yarn' }));
    assert.equal(field(longer, 'text').to, 'use pnpm, never npm or yarn');

    const shorter = mergePlan({ ...stored, text: 'use pnpm, never npm' }, incoming({ text: 'pnpm' }));
    assert.equal(field(shorter, 'text'), undefined, 'must not lose the more specific wording');
  });

  it('fills an absent why and prefers the longer one', () => {
    assert.equal(field(mergePlan(stored, incoming({ why: 'faster' })), 'why').to, 'faster');
    assert.equal(
      field(mergePlan({ ...stored, why: 'because it is faster' }, incoming({ why: 'faster' })), 'why'),
      undefined,
    );
  });

  it('raises salience only when the caller asked for it', () => {
    const implicit = mergePlan({ ...stored, salience: 0.2 }, incoming({ salience: 0.5 }));
    assert.equal(field(implicit, 'salience'), undefined, 'a default must not overwrite a chosen value');

    const explicit = mergePlan(
      { ...stored, salience: 0.2 },
      incoming({ salience: 0.9, explicit: { salience: true, confidence: false } }),
    );
    assert.equal(field(explicit, 'salience').to, 0.9);

    const lower = mergePlan(
      { ...stored, salience: 0.9 },
      incoming({ salience: 0.1, explicit: { salience: true, confidence: false } }),
    );
    assert.equal(field(lower, 'salience'), undefined, 'a merge never demotes');
  });

  it('never lets a re-add unpin, and pins when asked', () => {
    assert.equal(field(mergePlan({ ...stored, pinned: 1 }, incoming()), 'pinned'), undefined);
    assert.equal(field(mergePlan(stored, incoming({ pinned: 1 })), 'pinned').to, 1);
  });

  it('can decide nothing changed at all', () => {
    const saturated = { ...stored, confidence: 1 };
    assert.deepEqual(mergePlan(saturated, incoming({ confidence: 1 })), []);
  });
});

describe('addMemory', needsModel, () => {
  it('creates a row carrying every field and one created event', async () => {
    const dbPaths = scratchPaths();
    const now = 1750000000000;
    const result = await add(
      { text: PNPM, why: 'npm lockfiles keep conflicting', kind: 'preference' },
      { paths: dbPaths, now },
    );

    assert.equal(result.action, 'created');
    assert.equal(result.similarity, null, 'an empty store has no runner-up');
    assert.equal(result.scopeSource, 'env');

    await withDb(async (conn) => {
      const [row] = await rows(conn);
      assert.equal(row.text, PNPM);
      assert.equal(row.why, 'npm lockfiles keep conflicting');
      assert.equal(row.kind, 'preference');
      assert.equal(row.scope, 'project');
      assert.equal(row.project_key, 'test/project-a');
      assert.equal(row.status, 'active');
      assert.equal(row.source_kind, 'user');
      assert.equal(row.emb_model, EMB_MODEL);
      assert.equal(row.emb_dim, EMB_DIM);
      assert.equal(row.created_at, now);
      assert.equal(row.updated_at, now);
      assert.ok(row.uid && row.uid.length >= 32, 'needs a stable uid for export/import');

      const [event] = await events(conn);
      assert.equal(event.memory_id, row.id);
      assert.equal(event.event, 'created');
      assert.equal(event.at, now);
      const detail = JSON.parse(event.detail);
      assert.equal(detail.uid, row.uid);
      assert.equal(detail.scope_source, 'env');
      assert.equal(detail.nearest, null);
    }, { paths: dbPaths, env: ENV });
  });

  it('stores a global memory with a NULL project_key', async () => {
    const dbPaths = scratchPaths();
    const result = await add({ text: 'I prefer terse commit messages', scope: 'global' }, { paths: dbPaths });
    assert.equal(result.row.scope, 'global');
    assert.equal(result.row.project_key, null);
    assert.equal(result.scopeSource, 'global');
  });

  it('merges a re-phrased duplicate instead of accumulating', async () => {
    const dbPaths = scratchPaths();
    const first = await add({ text: PNPM }, { paths: dbPaths, now: 1000 });
    const second = await add(
      { text: PNPM_LONGER },
      { paths: dbPaths, now: 2000 },
    );

    assert.equal(second.action, 'merged');
    assert.equal(second.row.id, first.row.id);
    assert.ok(second.similarity >= DEDUP_THRESHOLD, `similarity was ${second.similarity}`);

    await withDb(async (conn) => {
      const all = await rows(conn);
      assert.equal(all.length, 1, 'a near-duplicate must not become a second row');

      const row = all[0];
      assert.equal(row.text, PNPM_LONGER, 'longer wording wins');
      assert.equal(row.confidence, bumpConfidence(DEFAULT_CONFIDENCE));
      assert.equal(row.created_at, 1000, 'the memory is as old as its first sighting');
      assert.equal(row.updated_at, 2000);

      const log = await events(conn);
      assert.deepEqual(log.map((e) => e.event), ['created', 'merged']);

      // Reversibility: the event alone must be enough to put the row back.
      const detail = JSON.parse(log[1].detail);
      assert.ok(detail.similarity >= DEDUP_THRESHOLD);
      assert.equal(detail.previous.updated_at, 1000);
      const before = Object.fromEntries(detail.changes.map((c) => [c.field, c.from]));
      assert.equal(before.text, PNPM);
      assert.equal(before.confidence, DEFAULT_CONFIDENCE);
    }, { paths: dbPaths, env: ENV });
  });

  // Keeping the old vector beside new wording would leave the row unfindable
  // by the phrasing it now stores.
  it('re-embeds when the merge rewrites the text', async () => {
    const dbPaths = scratchPaths();
    await add({ text: PNPM }, { paths: dbPaths });
    assert.equal((await add({ text: PNPM_LONGER }, { paths: dbPaths })).action, 'merged');

    await withDb(async (conn) => {
      const wanted = await embed(PNPM_LONGER, { offline: true });
      const row = await conn.get(
        'SELECT vector_distance_cos(emb, vector32(?)) AS dist FROM memories',
        vectorBlob(wanted),
      );
      assert.ok(row.dist < 1e-6, `stored vector still matches the old wording (dist ${row.dist})`);
    }, { paths: dbPaths, env: ENV });
  });

  it('keeps an unrelated fact separate and records the runner-up', async () => {
    const dbPaths = scratchPaths();
    await add({ text: PNPM }, { paths: dbPaths });
    const second = await add({ text: UNRELATED }, { paths: dbPaths });

    assert.equal(second.action, 'created');
    assert.ok(second.similarity < DEDUP_THRESHOLD);

    await withDb(async (conn) => {
      assert.equal((await rows(conn)).length, 2);
      const log = await events(conn);
      const detail = JSON.parse(log.at(-1).detail);
      assert.ok(detail.nearest, 'the near-miss is the evidence for retuning the threshold');
      assert.equal(detail.nearest.similarity, second.similarity);
    }, { paths: dbPaths, env: ENV });
  });

  // Merging a project fact into a global one would silently widen it to every
  // other repo — the opposite of PLAN's hard scoping.
  it('never merges across scopes or projects', async () => {
    const dbPaths = scratchPaths();
    const text = PNPM;
    await add({ text }, { paths: dbPaths });
    const global = await add({ text, scope: 'global' }, { paths: dbPaths });
    const other = await add({ text }, { paths: dbPaths, env: { MEM_PROJECT_KEY: 'test/project-b' } });

    assert.equal(global.action, 'created');
    assert.equal(other.action, 'created');
    await withDb(async (conn) => {
      assert.equal((await rows(conn)).length, 3);
    }, { paths: dbPaths, env: ENV });
  });

  // An auto-capture must not quietly bump the confidence of a memory a human
  // already reviewed; it queues as its own staged row where it can be seen.
  it('dedups within a status, not across the review boundary', async () => {
    const dbPaths = scratchPaths();
    const text = PNPM;
    await add({ text }, { paths: dbPaths });
    const staged = await add({ text, status: 'staged', sourceKind: 'auto' }, { paths: dbPaths });
    const again = await add({ text, status: 'staged', sourceKind: 'auto' }, { paths: dbPaths });

    assert.equal(staged.action, 'created');
    assert.equal(again.action, 'merged', 'repeat captures should still collapse into each other');
    await withDb(async (conn) => {
      const all = await rows(conn);
      assert.deepEqual(all.map((r) => r.status), ['active', 'staged']);
    }, { paths: dbPaths, env: ENV });
  });

  it('honours dedup:false and a custom threshold', async () => {
    const dbPaths = scratchPaths();
    const text = PNPM;
    await add({ text }, { paths: dbPaths });
    assert.equal((await add({ text }, { paths: dbPaths, dedup: false })).action, 'created');

    // Tightening the threshold turns the same merge back into an insert.
    assert.equal((await add({ text: PNPM_LONGER }, { paths: dbPaths, threshold: 0.999 })).action, 'created');
    assert.equal((await add({ text: PNPM_LONGER }, { paths: dbPaths })).action, 'merged');
  });

  it('rejects a credential before it reaches the model or the database', async () => {
    const dbPaths = scratchPaths();
    await add({ text: 'a real memory' }, { paths: dbPaths });

    await assert.rejects(
      () => add({ text: 'the deploy key is sk-abcdef0123456789abcdef' }, { paths: dbPaths }),
      (err) => {
        assert.equal(err.code, 'MEM_SECRET_DETECTED');
        assert.ok(err.findings.length > 0);
        return true;
      },
    );
    await assert.rejects(
      () => add({ text: 'the deploy key lives in 1password', why: 'ghp_' + 'a'.repeat(36) }, { paths: dbPaths }),
      /credential/i,
    );

    await withDb(async (conn) => {
      const all = await rows(conn);
      assert.equal(all.length, 1, 'a rejected write must leave nothing behind');
      assert.equal((await events(conn)).length, 1);
    }, { paths: dbPaths, env: ENV });
  });

  it('accepts a caller-supplied uid once and only once', async () => {
    const dbPaths = scratchPaths();
    await add({ text: 'imported fact one', uid: 'fixed-uid', sourceKind: 'import' }, { paths: dbPaths });
    assert.equal((await withDb((c) => c.get('SELECT uid FROM memories'), { paths: dbPaths, env: ENV })).uid, 'fixed-uid');

    await assert.rejects(
      () => add({ text: 'a completely different fact about tuesdays', uid: 'fixed-uid' }, { paths: dbPaths }),
      (err) => err.code === 'MEM_DUPLICATE_UID',
    );
  });

  it('writes exactly one event per mutation', async () => {
    const dbPaths = scratchPaths();
    await add({ text: PNPM }, { paths: dbPaths });
    await add({ text: 'always use pnpm to install dependencies everywhere' }, { paths: dbPaths });
    await add({ text: UNRELATED }, { paths: dbPaths });

    await withDb(async (conn) => {
      const log = await events(conn);
      assert.deepEqual(log.map((e) => e.event), ['created', 'merged', 'created']);
      for (const event of log) {
        assert.ok(event.memory_id > 0);
        assert.doesNotThrow(() => JSON.parse(event.detail));
      }
    }, { paths: dbPaths, env: ENV });
  });
});

describe('nearestInScope', needsModel, () => {
  it('ignores rows embedded by a different model', async () => {
    const dbPaths = scratchPaths();
    await add({ text: PNPM }, { paths: dbPaths });
    const vector = await embed(PNPM, { offline: true });

    await withDb(async (conn) => {
      const same = await nearestInScope(conn, vector, { scope: 'project', projectKey: 'test/project-a' });
      assert.ok(same.similarity > 0.999);

      const other = await nearestInScope(conn, vector, {
        scope: 'project',
        projectKey: 'test/project-a',
        embModel: 'some/other-model@q8',
      });
      assert.equal(other, null, 'a distance between two vector spaces is meaningless');
    }, { paths: dbPaths, env: ENV });
  });

  it('returns null for an empty scope', async () => {
    const dbPaths = scratchPaths();
    const vector = await embed('anything', { offline: true });
    await withDb(async (conn) => {
      assert.equal(await nearestInScope(conn, vector, { scope: 'global' }), null);
      assert.equal(await nearestInScope(conn, vector, { scope: 'global', statuses: [] }), null);
    }, { paths: dbPaths, env: ENV });
  });
});

describe('mem add', needsModel, () => {
  // A real data dir, so the CLI resolves its own paths the way a user's would;
  // deps and the model are symlinked in rather than re-downloaded.
  const home = mkdtempSync(join(tmpdir(), 'mem-cli-test-'));
  after(() => rmSync(home, { recursive: true, force: true }));
  symlinkSync(paths.nodeModulesDir, join(home, 'node_modules'));
  symlinkSync(paths.modelsDir, join(home, 'models'));

  const run = (...argv) =>
    spawnSync(process.execPath, [join(paths.pluginRoot, 'bin', 'mem'), 'add', ...argv], {
      encoding: 'utf8',
      env: {
        ...process.env,
        CLAUDE_PLUGIN_DATA: home,
        MEM_PROJECT_KEY: 'test/cli',
        MEM_NO_INSTALL: '1',
        MEM_ALLOW_SECRETS: '',
      },
    });

  it('stores a fact and reports where it landed', () => {
    const out = run(PNPM, '--why', 'npm lockfiles conflict', '--kind', 'preference');
    assert.equal(out.status, 0, out.stderr);
    assert.match(out.stdout, /^Added #\d+ · preference · active · project test\/cli \(env\)/);
    assert.match(out.stdout, new RegExp(PNPM));
  });

  it('joins loose words so quoting is optional', () => {
    const out = run('the', 'kitchen', 'tap', 'is', 'dripping');
    assert.equal(out.status, 0, out.stderr);
    assert.match(out.stdout, /the kitchen tap is dripping/);
  });

  it('merges on a second sighting and names what changed', () => {
    const out = run(PNPM_LONGER);
    assert.equal(out.status, 0, out.stderr);
    assert.match(out.stdout, /^Merged into #\d+ · 0\.9\d\d similar/);
    assert.match(out.stdout, /text, confidence 0\.50 → 0\.6\d/);
  });

  it('emits JSON without the embedding blob', () => {
    const out = run('deploy with nix flakes', '--json', '--global');
    assert.equal(out.status, 0, out.stderr);
    const parsed = JSON.parse(out.stdout);
    assert.equal(parsed.action, 'created');
    assert.equal(parsed.memory.scope, 'global');
    assert.equal(parsed.memory.project_key, null);
    assert.equal(parsed.memory.emb, undefined, '1.5 KB of float noise has no business in --json');
    assert.ok(parsed.eventId > 0);
  });

  it('exits 2 on a credential so a hook can tell it from a crash', () => {
    const out = run('the api token is ghp_' + 'b'.repeat(36));
    assert.equal(out.status, 2);
    assert.match(out.stderr, /GitHub token/);
    assert.equal(out.stdout, '');
  });

  it('refuses an unknown flag rather than storing it as text', () => {
    const out = run('use pnpm', '--whi', 'typo');
    assert.equal(out.status, 1);
    assert.match(out.stderr, /unknown option '--whi'/);
  });

  it('refuses contradictory scope flags and empty text', () => {
    assert.match(run('x', '--global', '--project').stderr, /contradict/);
    assert.match(run('--global').stderr, /nothing to store/);
    assert.equal(run('--global').status, 1);
  });
});
