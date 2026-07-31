// Per-prompt recall and the UserPromptSubmit hook.
//
// The pure half — field extraction, filenames, the turn record, the rendered
// block — runs anywhere. The hook half needs the real model, because the whole
// question this slice answers is whether a *question* clears the gate against a
// stored *statement*, and a fake vector cannot exercise a cosine gate at all.
//
// The store is seeded through addMemory() rather than raw SQL for the same
// reason: the rows have to carry real embeddings from the shipped model, or the
// vector leg is measuring noise.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { withDb } from '../../src/db.mjs';
import { modelCached } from '../../src/embed.mjs';
import { resolvePaths } from '../../src/paths.mjs';
import {
  MAX_PROMPT_CHARS,
  PROMPT_FIELDS,
  TURN_TTL_MS,
  markInjected,
  promptText,
  readTurn,
  recordTurn,
  renderRecall,
  safeSessionId,
  sweepTurns,
  turnFile,
  turnsDir,
} from '../../src/recall.mjs';
import { search } from '../../src/search.mjs';
import { addMemory } from '../../src/write.mjs';

const paths = resolvePaths();
const HOOK = join(paths.pluginRoot, 'hooks', 'prompt-recall.mjs');
const needsModel = { skip: modelCached(paths) ? false : "model not cached — run 'mem warm'" };
const PROJECT = 'test/recall-project';
const NOW = 1_750_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

const scratch = mkdtempSync(join(tmpdir(), 'mem-recall-test-'));
after(() => rmSync(scratch, { recursive: true, force: true }));

let n = 0;

/**
 * A database of our own, with the real dataDir intact — dependency resolution
 * walks up from `dataDir`, so a temp one would find no turso at all.
 */
const scratchDb = () => ({ ...paths, dbPath: join(scratch, `recall-${n++}.db`) });

/** A data dir of our own, for the tests that write files rather than rows. */
const scratchDir = () => {
  const dir = join(scratch, `data-${n++}`);
  return { ...paths, dataDir: dir, dbPath: join(dir, 'mem.db') };
};

/** A row shaped enough for the renderer. */
const row = (over = {}) => ({
  id: 1, uid: 'u', kind: 'preference', scope: 'global', project_key: null,
  text: 'always use pnpm', why: null, pinned: 0, similarity: 0.9, coverage: 0,
  created_at: NOW - DAY, updated_at: NOW - DAY,
  ...over,
});

describe('promptText', () => {
  // Three field names are in circulation and this build cannot tell which the
  // installed harness sends. Betting on one is a hook that never fires.
  it('reads every field name the harness might use', () => {
    for (const field of PROMPT_FIELDS) {
      assert.equal(promptText({ [field]: 'which package manager?' }), 'which package manager?');
    }
    assert.ok(PROMPT_FIELDS.includes('prompt'), 'the documented name');
    assert.ok(PROMPT_FIELDS.includes('user_message'), "PLAN's name, and this slice's verify command");
  });

  it('prefers the fields in declared order', () => {
    const event = Object.fromEntries(PROMPT_FIELDS.map((f) => [f, f]));
    assert.equal(promptText(event), PROMPT_FIELDS[0]);
  });

  it('treats a blank or absent prompt as nothing to do', () => {
    for (const event of [{}, null, undefined, 'nope', { prompt: '' }, { prompt: '   \n ' }, { prompt: 42 }]) {
      assert.equal(promptText(event), '', `${JSON.stringify(event)} should yield nothing`);
    }
  });

  it('trims, and caps what gets embedded', () => {
    assert.equal(promptText({ prompt: '  pnpm  ' }), 'pnpm');
    const huge = promptText({ prompt: 'x'.repeat(50_000) });
    assert.equal(huge.length, MAX_PROMPT_CHARS);
  });
});

describe('turn record filenames', () => {
  it('reduces a session id to something that can only be a filename', () => {
    assert.equal(safeSessionId('abc-123_XYZ'), 'abc-123_XYZ');
    assert.equal(safeSessionId('../../etc/passwd'), 'etcpasswd');
    assert.equal(safeSessionId('..'), null, 'a traversal must not survive as dots');
    assert.equal(safeSessionId('///'), null);
    assert.equal(safeSessionId(''), null);
    assert.equal(safeSessionId(undefined), null);
    assert.equal(safeSessionId('a'.repeat(500)).length, 128);
  });

  it('keeps the file inside the turns directory', () => {
    const p = scratchDir();
    assert.equal(turnFile(p, 'sess-1'), join(turnsDir(p), 'sess-1.json'));
    assert.equal(turnFile(p, '../escape'), join(turnsDir(p), 'escape.json'));
    assert.equal(turnFile(p, ''), null);
  });
});

describe('the turn record', () => {
  it('round-trips what was injected', () => {
    const p = scratchDir();
    const file = recordTurn(p, {
      sessionId: 'sess-a',
      prompt: 'which package manager?',
      results: [row({ id: 4, uid: 'uid-4', similarity: 0.87, coverage: 0.5 })],
      now: NOW,
      projectKey: PROJECT,
      cwd: '/tmp/x',
    });
    assert.ok(existsSync(file));

    const record = readTurn(p, 'sess-a', { now: NOW });
    assert.equal(record.session_id, 'sess-a');
    assert.equal(record.at, NOW);
    assert.equal(record.project_key, PROJECT);
    assert.equal(record.prompt, 'which package manager?');
    assert.deepEqual(record.injected, [
      { id: 4, uid: 'uid-4', text: 'always use pnpm', similarity: 0.87, coverage: 0.5 },
    ]);
  });

  // "This turn injected nothing" is the answer the echo heuristic needs most
  // often, and it is not the same answer as "no record".
  it('records an empty turn rather than leaving the last one to be misread', () => {
    const p = scratchDir();
    recordTurn(p, { sessionId: 's', results: [row({ id: 1 })], now: NOW - 60_000 });
    recordTurn(p, { sessionId: 's', prompt: 'unrelated', results: [], now: NOW });

    const record = readTurn(p, 's', { now: NOW });
    assert.deepEqual(record.injected, []);
    assert.equal(record.at, NOW);
  });

  it('writes nothing when the payload had no session id', () => {
    const p = scratchDir();
    assert.equal(recordTurn(p, { sessionId: undefined, results: [] }), null);
    assert.equal(existsSync(turnsDir(p)), false, 'no id, no directory');
  });

  it('refuses to hand back a record older than the caller asked for', () => {
    const p = scratchDir();
    recordTurn(p, { sessionId: 's', results: [row()], now: NOW - 2 * DAY });
    assert.equal(readTurn(p, 's', { now: NOW }), null, 'a day-old record is not this turn');
    assert.ok(readTurn(p, 's', { now: NOW, maxAge: 3 * DAY }), 'still there when asked for');
  });

  it('fails open on a record it cannot parse', () => {
    const p = scratchDir();
    const file = recordTurn(p, { sessionId: 's', results: [], now: NOW });
    writeFileSync(file, '{ truncated');
    assert.equal(readTurn(p, 's', { now: NOW }), null);
  });

  it('has nothing to say about a session it never saw', () => {
    assert.equal(readTurn(scratchDir(), 'never'), null);
  });

  it('sweeps abandoned records and keeps live ones', () => {
    const p = scratchDir();
    const stale = recordTurn(p, { sessionId: 'gone', results: [], now: NOW });
    const live = recordTurn(p, { sessionId: 'here', results: [], now: NOW });
    // mtime is what the sweep reads, so age the file rather than the record.
    const old = (Date.now() - 3 * TURN_TTL_MS) / 1000;
    utimesSync(stale, old, old);

    assert.equal(sweepTurns(p), 1);
    assert.equal(existsSync(stale), false);
    assert.equal(existsSync(live), true);
  });

  it('is a no-op when there is no turns directory at all', () => {
    assert.equal(sweepTurns(scratchDir()), 0);
  });
});

describe('markInjected', () => {
  const seed = (dbPaths) =>
    withDb(async (conn) => {
      for (const id of [1, 2, 3]) {
        await conn.run(
          `INSERT INTO memories (id, uid, kind, scope, text, emb, emb_model, emb_dim,
                                 created_at, updated_at, last_used_at, useful_count)
           VALUES (?, ?, 'preference', 'global', ?, vector32('[1,2]'), 'x', 2, ?, ?, ?, 0)`,
          id, `uid-${id}`, `memory ${id}`, NOW - 10 * DAY, NOW - 10 * DAY, NOW - 10 * DAY,
        );
      }
    }, { paths: dbPaths, env: { MEM_NO_INSTALL: '1' } });

  const read = (dbPaths) =>
    withDb((conn) => conn.all('SELECT * FROM memories ORDER BY id'), {
      paths: dbPaths, env: { MEM_NO_INSTALL: '1' },
    });

  it('counts only the rows that were injected, and counts them once', async () => {
    const p = scratchDb();
    await seed(p);
    await withDb((conn) => markInjected(conn, [1, 3, 3], { now: NOW }), {
      paths: p, env: { MEM_NO_INSTALL: '1' },
    });

    const rows = await read(p);
    assert.deepEqual(rows.map((r) => r.injected_count), [1, 0, 1]);
    assert.deepEqual(rows.map((r) => r.last_injected_at), [NOW, null, NOW]);
  });

  it('accumulates across turns', async () => {
    const p = scratchDb();
    await seed(p);
    await withDb(async (conn) => {
      await markInjected(conn, [2], { now: NOW });
      await markInjected(conn, [2], { now: NOW + 1000 });
      assert.equal(await markInjected(conn, [2], { now: NOW + 2000 }), 1, 'reports rows changed');
    }, { paths: p, env: { MEM_NO_INSTALL: '1' } });

    const rows = await read(p);
    assert.equal(rows[1].injected_count, 3);
    assert.equal(rows[1].last_injected_at, NOW + 2000);
  });

  // PLAN: injected_count and useful_count are split precisely so that being
  // surfaced is not evidence of being useful. retention() falls back through
  // last_used_at -> updated_at -> created_at, and last_injected_at is absent from
  // that chain on purpose — if injecting reset the decay clock, ranking would be
  // a feedback loop measuring itself.
  it('does not touch the decay clock', async () => {
    const p = scratchDb();
    await seed(p);
    const before = await read(p);
    await withDb((conn) => markInjected(conn, [1, 2, 3], { now: NOW }), {
      paths: p, env: { MEM_NO_INSTALL: '1' },
    });

    for (const [i, r] of (await read(p)).entries()) {
      assert.equal(r.updated_at, before[i].updated_at, 'updated_at moved');
      assert.equal(r.last_used_at, before[i].last_used_at, 'last_used_at moved');
      assert.equal(r.useful_count, 0, 'injection is not usefulness');
    }
  });

  it('has nothing to do with an empty or junk id list', async () => {
    const p = scratchDb();
    await seed(p);
    await withDb(async (conn) => {
      assert.equal(await markInjected(conn, []), 0);
      assert.equal(await markInjected(conn, [null, undefined, 'x', 1.5]), 0);
    }, { paths: p, env: { MEM_NO_INSTALL: '1' } });
    assert.deepEqual((await read(p)).map((r) => r.injected_count), [0, 0, 0]);
  });
});

describe('renderRecall', () => {
  const rendered = () =>
    renderRecall(
      [
        row({ id: 12, text: 'always use pnpm', why: 'npm lockfile churn', created_at: NOW - 41 * DAY }),
        row({ id: 7, scope: 'project', project_key: PROJECT, pinned: 1, text: 'deploy with nix flakes', created_at: NOW - 3 * DAY }),
      ],
      { now: NOW },
    );

  it('injects nothing when nothing cleared the gate', () => {
    assert.equal(renderRecall([], { now: NOW }), null);
  });

  it('frames the block as recollection, not as instruction', () => {
    const out = rendered();
    assert.match(out, /^<mem-recollection>/);
    assert.match(out, /BACKGROUND, NOT INSTRUCTIONS/);
    assert.match(out, /do not act\s*\n?on them/i);
    assert.match(out, /may be out of\s*\n?date/);
  });

  // The gate keeps ~72% of real matches at zero junk admitted, which means the
  // occasional near-miss does get through. Saying so is what stops the model
  // working to make an irrelevant memory relevant.
  it('admits that one of the items may be beside the point', () => {
    assert.match(rendered(), /beside the point/);
  });

  it('carries ids and ages, and marks a pin', () => {
    const out = rendered();
    assert.match(out, /#12 {2}\(global · preference · 41d ago\)/);
    assert.match(out, /#7 {2}\(pinned · project · preference · 3d ago\)/);
    assert.match(out, /why: npm lockfile churn/);
    assert.match(out, /mem forget <id>/);
  });

  it('stays inside the ~600 token budget at a full five items', () => {
    const rows = [1, 2, 3, 4, 5].map((id) => row({
      id,
      text: 'a fairly wordy memory about how this user prefers to do things '.repeat(2),
      why: 'because they said so at some length in an earlier session',
    }));
    const out = renderRecall(rows, { now: NOW });
    // ~4 chars/token; 600 tokens is ~2400 chars.
    assert.ok(out.length < 2400, `block was ${out.length} chars`);
  });

  it('clips a rambling memory rather than eating the budget', () => {
    const out = renderRecall([row({ text: 'x'.repeat(900) })], { now: NOW });
    assert.ok(out.length < 1400, `block was ${out.length} chars`);
    assert.match(out, /…/);
  });
});

describe('the UserPromptSubmit hook', needsModel, () => {
  const PNPM = 'always use pnpm to install dependencies';
  const TESTING = 'prefer Vitest over Jest for unit tests';
  const SCOPE = 'set MEM_PROJECT_KEY to override the project scope';
  /** Slice 4.1: what the capture gate writes. It must never come back out. */
  const STAGED = 'the release train leaves on Thursday afternoons';

  const INSTALL_QUERY = 'how do I install dependencies?';
  const UNRELATED_QUERY = 'what is the capital of France?';

  const home = mkdtempSync(join(tmpdir(), 'mem-recall-hook-'));
  after(() => rmSync(home, { recursive: true, force: true }));
  symlinkSync(paths.nodeModulesDir, join(home, 'node_modules'));
  symlinkSync(paths.modelsDir, join(home, 'models'));

  const empty = mkdtempSync(join(tmpdir(), 'mem-recall-nodb-'));
  after(() => rmSync(empty, { recursive: true, force: true }));

  const hookPaths = { ...paths, dataDir: home, dbPath: join(home, 'mem.db') };

  before(async () => {
    for (const text of [PNPM, TESTING, SCOPE]) {
      await addMemory({ text }, { paths: hookPaths, env: { MEM_PROJECT_KEY: PROJECT } });
    }
    await addMemory({ text: STAGED, status: 'staged' }, { paths: hookPaths, env: { MEM_PROJECT_KEY: PROJECT } });
  });

  const run = ({ prompt = INSTALL_QUERY, field = 'user_message', session = null, dataDir = home, input, env } = {}) =>
    spawnSync(process.execPath, [HOOK], {
      encoding: 'utf8',
      input:
        input !== undefined
          ? input
          : JSON.stringify({
              hook_event_name: 'UserPromptSubmit',
              cwd: '.',
              ...(session ? { session_id: session } : {}),
              [field]: prompt,
            }),
      env: {
        ...process.env,
        CLAUDE_PLUGIN_DATA: dataDir,
        MEM_PROJECT_KEY: PROJECT,
        MEM_NO_INSTALL: '1',
        ...env,
      },
    });

  const injected = (out) => {
    assert.equal(out.status, 0, out.stderr);
    assert.notEqual(out.stdout.trim(), '', 'expected an injection');
    const payload = JSON.parse(out.stdout);
    assert.equal(payload.hookSpecificOutput.hookEventName, 'UserPromptSubmit');
    return payload.hookSpecificOutput.additionalContext;
  };

  const counts = () =>
    withDb((conn) => conn.all('SELECT text, injected_count, last_injected_at FROM memories ORDER BY id'), {
      paths: hookPaths, env: { MEM_NO_INSTALL: '1' },
    });

  it('injects the memory the prompt is actually about', () => {
    const block = injected(run());
    assert.match(block, /^<mem-recollection>/);
    assert.match(block, new RegExp(PNPM));
    assert.doesNotMatch(block, /Vitest/, 'a different question must not drag the whole store in');
  });

  it('reads the prompt under any of the field names the harness might use', () => {
    for (const field of PROMPT_FIELDS) {
      assert.match(injected(run({ field })), new RegExp(PNPM), `field ${field} went dark`);
    }
  });

  // PLAN phase 3: "injects nothing on prompts unrelated to any stored memory —
  // this is the test that matters most."
  it('says nothing at all on a prompt unrelated to anything stored', () => {
    const out = run({ prompt: UNRELATED_QUERY });
    assert.equal(out.status, 0);
    assert.equal(out.stdout, '', 'stdout is injected verbatim on this event — it must stay empty');
    assert.equal(out.stderr, '');
  });

  // Slice 4.1. Staging is where the capture gate's writes land, and "a staged
  // memory is never recalled until it is promoted" is the whole safety argument for
  // capturing without asking — so the exclusion is asserted on the hook, not only
  // on searchScoped. The prompt is the memory's own text, so the test cannot pass
  // merely because the gate did not clear; the control proves the row is reachable
  // when something asks for it by status.
  it('never injects a staged memory, though it is there to be found', async () => {
    const out = run({ prompt: STAGED });
    assert.equal(out.status, 0, out.stderr);
    assert.equal(out.stdout, '', 'a staged memory reached context');

    const reachable = await search(STAGED, {
      paths: hookPaths,
      env: { MEM_PROJECT_KEY: PROJECT, MEM_NO_INSTALL: '1' },
      projectKey: PROJECT,
      statuses: ['staged'],
    });
    assert.equal(reachable[0]?.text, STAGED, 'the control failed — the row is not retrievable at all');
  });

  // Recall and capture are independent halves of one event and a prompt can be
  // both: a preference stated in words the store already half-knows. Order is
  // asserted because the recollection is background about the store and the cue is
  // a question about the message, which the model should read last.
  it('injects a recollection and a capture cue together, in that order', () => {
    const block = injected(run({ prompt: 'always use pnpm to install dependencies in this repo' }));
    assert.match(block, new RegExp(PNPM));
    assert.ok(
      block.indexOf('<mem-recollection>') < block.indexOf('<mem-capture-cue>'),
      'the capture cue should come last',
    );
    // Not `--staged`: the cue names staging without naming a surface's flag, so
    // it reads correctly whether the write goes through the CLI or the tool.
    assert.match(block, /staged/);
  });

  // Conversational filler is a good share of real turns, and a sentence with no
  // content word has nothing to retrieve on. Skipping it also skips the model
  // load, which is the expensive part.
  it('does not even load the model for an all-stopword prompt', () => {
    const out = run({ prompt: 'yes, please do that', env: { MEM_HOOK_DEBUG: '1' } });
    assert.equal(out.stdout, '');
    assert.match(out.stderr, /no distinctive terms/);
  });

  it('counts an injection, once per turn, and only for what it injected', async () => {
    const before = await counts();
    const startedAt = Date.now();
    assert.match(injected(run()), new RegExp(PNPM));
    injected(run());
    const after = await counts();

    const delta = (text) => {
      const b = before.find((r) => r.text === text);
      const a = after.find((r) => r.text === text);
      return a.injected_count - b.injected_count;
    };
    assert.equal(delta(PNPM), 2, 'two turns, two injections');
    assert.equal(delta(TESTING), 0, 'a memory that was not injected must not be counted');
    assert.ok(
      after.find((r) => r.text === PNPM).last_injected_at >= startedAt,
      'last_injected_at should be stamped with this turn',
    );
  });

  it('does not count a turn that injected nothing', async () => {
    const before = await counts();
    run({ prompt: UNRELATED_QUERY });
    assert.deepEqual((await counts()).map((r) => r.injected_count), before.map((r) => r.injected_count));
  });

  it('leaves the Stop hook a record of what it injected', () => {
    const session = 'hook-session-1';
    injected(run({ session }));

    const record = readTurn(hookPaths, session);
    assert.ok(record, 'no turn record was written');
    assert.equal(record.prompt, INSTALL_QUERY);
    assert.equal(record.project_key, PROJECT);
    assert.equal(record.injected.length, 1);
    assert.equal(record.injected[0].text, PNPM);
    assert.ok(record.injected[0].id > 0);
    assert.ok(record.injected[0].similarity > 0.8, 'the score that got it through');
  });

  it('records the empty turn too, so a stale one cannot be read as current', () => {
    const session = 'hook-session-2';
    injected(run({ session }));
    run({ session, prompt: UNRELATED_QUERY });

    const record = readTurn(hookPaths, session);
    assert.deepEqual(record.injected, [], 'the second turn injected nothing and says so');
  });

  it('keeps no turn record when the payload carries no session id', () => {
    injected(run());
    assert.equal(
      existsSync(join(turnsDir(hookPaths), 'null.json')),
      false,
      'a missing session id must not become a filename',
    );
  });

  it('is quiet and successful on a machine with no store, and creates nothing', () => {
    const nested = join(empty, 'not-yet');
    const out = run({ dataDir: nested });
    assert.equal(out.status, 0);
    assert.equal(out.stdout, '');
    assert.equal(out.stderr, '');
    assert.equal(existsSync(nested), false, 'the hook created its data dir');
  });

  it('exits quietly on a payload it cannot use', () => {
    for (const input of ['', 'not json at all', '{"cwd":', 'null', '{}', '{"prompt":""}']) {
      const out = run({ input });
      assert.equal(out.status, 0, `input ${JSON.stringify(input)}: ${out.stderr}`);
      assert.equal(out.stdout, '', `input ${JSON.stringify(input)} injected something`);
      assert.equal(out.stderr, '');
    }
  });

  it('gives up on its own budget instead of delaying the prompt', () => {
    const out = run({ env: { MEM_HOOK_TIMEOUT_MS: '1' } });
    assert.equal(out.status, 0);
    assert.equal(out.stdout, '');
    assert.equal(out.stderr, '');
  });

  it('explains itself only under MEM_HOOK_DEBUG', () => {
    assert.equal(run({ prompt: UNRELATED_QUERY }).stderr, '');
    const loud = run({ prompt: UNRELATED_QUERY, env: { MEM_HOOK_DEBUG: '1' } });
    assert.match(loud.stderr, /nothing cleared the gate/);
    assert.equal(loud.status, 0);
  });

  // The accounting exists for the injection, not the other way round: if the
  // counters cannot be written, the user still gets their memory.
  it('still injects when the store cannot be written to', { skip: process.getuid?.() === 0 && 'root can write anything' }, async () => {
    const readonly = mkdtempSync(join(tmpdir(), 'mem-recall-ro-'));
    after(() => {
      chmodSync(join(readonly, 'mem.db'), 0o644);
      rmSync(readonly, { recursive: true, force: true });
    });
    symlinkSync(paths.nodeModulesDir, join(readonly, 'node_modules'));
    symlinkSync(paths.modelsDir, join(readonly, 'models'));

    const roPaths = { ...paths, dataDir: readonly, dbPath: join(readonly, 'mem.db') };
    await addMemory({ text: PNPM }, { paths: roPaths, env: { MEM_PROJECT_KEY: PROJECT } });
    chmodSync(roPaths.dbPath, 0o444);

    const block = injected(run({ dataDir: readonly }));
    assert.match(block, new RegExp(PNPM));
  });

  // PLAN's phase-3 exit criterion is p95 < 400ms, and slice 3.3 owns measuring it
  // properly — `mem tune` reports p95 from a run that is not competing with a test
  // suite. This assertion is deliberately looser, because it cannot be both tight
  // and honest: measured on this machine, 9 spawns of this hook come in at
  //
  //   p95 367ms, best 343ms   with this file alone
  //   p95 499ms, best 406ms   with the whole suite running concurrently
  //
  // and the suite is the environment this test lives in. Every sample prints, so
  // drift stays visible even though the gate is a tripwire rather than the budget.
  it('pays the cold model load once per prompt and stays in the same order of magnitude', () => {
    const samples = [];
    for (let i = 0; i < 9; i += 1) {
      const t = performance.now();
      const out = run();
      samples.push(performance.now() - t);
      assert.equal(out.status, 0, out.stderr);
    }
    const sorted = [...samples].sort((a, b) => a - b);
    const p95 = sorted[Math.min(sorted.length - 1, Math.ceil(0.95 * sorted.length) - 1)];
    const ms = (x) => Math.round(x);
    console.log(`  prompt-recall: ${sorted.map(ms).join(' ')} ms (p95 ${ms(p95)}, best ${ms(sorted[0])})`);
    assert.ok(sorted[0] < 700, `best sample was ${ms(sorted[0])} ms — the cold path regressed`);
    assert.ok(p95 < 1200, `p95 was ${ms(p95)} ms across ${samples.length} samples`);
  });
});
