// The echo heuristic, `mem touch`, and the Stop hook.
//
// Nothing here needs the embedding model: the Stop path never embeds, and the
// rows it counts are seeded with a two-element vector through raw SQL. That is
// deliberate — this is the one signal that has to keep working on a machine where
// retrieval itself cannot run, and a test suite that skipped without the model
// would not notice it breaking.
//
// The heuristic's failure modes are asymmetric and the cases below are chosen
// around that: a missed echo costs a memory decaying on schedule, a false one
// keeps a memory alive that nobody used and exempts it from archiving forever. So
// the negative cases (the reply that only repeats the prompt, the second Stop for
// one turn) carry more weight here than the positive one.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { withDb } from '../../src/db.mjs';
import { halflifeDays } from '../../src/decay.mjs';
import {
  ECHO_FRAMING,
  ECHO_MIN_MATCHED,
  MAX_REPLY_CHARS,
  REPLY_FIELDS,
  distinctive,
  evidenceTokens,
  markUseful,
  replyText,
  scoreEcho,
  scoreTurn,
  touch,
  transcriptReply,
} from '../../src/echo.mjs';
import { resolvePaths } from '../../src/paths.mjs';
import { consumeTurn, readTurn, recordTurn, renderRecall } from '../../src/recall.mjs';

const paths = resolvePaths();
const HOOK = join(paths.pluginRoot, 'hooks', 'stop-echo.mjs');
const CLI = join(paths.pluginRoot, 'bin', 'mem');
const NOW = 1_750_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

const PNPM = 'always use pnpm to install dependencies';
const VITEST = 'prefer Vitest over Jest for unit tests';
const FLAKES = 'deploy with nix flakes from the repository root';

const scratch = mkdtempSync(join(tmpdir(), 'mem-echo-test-'));
after(() => rmSync(scratch, { recursive: true, force: true }));

let n = 0;

/** A database of our own, with the real dataDir intact so deps still resolve. */
const scratchDb = () => ({ ...paths, dbPath: join(scratch, `echo-${n++}.db`) });

/** A data dir of our own, for the tests that write files rather than rows. */
const scratchDir = () => {
  const dir = join(scratch, `data-${n++}`);
  return { ...paths, dataDir: dir, dbPath: join(dir, 'mem.db') };
};

const db = (dbPaths) => ({ paths: dbPaths, env: { MEM_NO_INSTALL: '1' } });

/** Rows with real columns and a placeholder vector — nothing here computes distance. */
const seed = (dbPaths, texts) =>
  withDb(async (conn) => {
    for (const [i, text] of texts.entries()) {
      await conn.run(
        `INSERT INTO memories (id, uid, kind, scope, text, emb, emb_model, emb_dim,
                               created_at, updated_at, useful_count, injected_count)
         VALUES (?, ?, 'preference', 'global', ?, vector32('[1,2]'), 'x', 2, ?, ?, 0, 3)`,
        i + 1, `uid-${i + 1}`, text, NOW - 10 * DAY, NOW - 10 * DAY,
      );
    }
  }, db(dbPaths));

const rows = (dbPaths) =>
  withDb((conn) => conn.all('SELECT * FROM memories ORDER BY id'), db(dbPaths));

describe('distinctive tokens', () => {
  it('keeps what a reply could only have got from the memory', () => {
    assert.deepEqual([...distinctive(PNPM)], ['always', 'pnpm', 'install', 'dependencies']);
  });

  it('shares the retrieval leg\'s tokenisation, so both mean one thing by "token"', () => {
    assert.deepEqual([...distinctive('MEM_PROJECT_KEY and pnpm-lock.yaml')], [
      'mem', 'project', 'key', 'pnpm', 'lock', 'yaml',
    ]);
    assert.deepEqual([...distinctive('getUserById')], ['getuserbyid'], 'camelCase stays one token');
  });

  it('has nothing to say about a sentence made entirely of stopwords', () => {
    assert.deepEqual([...distinctive('and then it was all of them')], []);
    assert.deepEqual([...distinctive('')], []);
    assert.deepEqual([...distinctive(null)], []);
  });
});

describe('evidence tokens', () => {
  // The whole precision argument: words the user just typed would appear in the
  // reply whether or not the memory was ever injected.
  it('drops every word the prompt already contained', () => {
    assert.deepEqual(evidenceTokens(PNPM, 'how do I install dependencies?'), ['pnpm']);
  });

  it('drops prompt stopwords too — the subtraction is over the raw prompt', () => {
    assert.deepEqual(evidenceTokens('always use pnpm', 'is pnpm always right'), []);
  });

  // A reply is full of "always" and "actually" for reasons that have nothing to do
  // with memory, and at a one-token bar that would count as an echo every turn.
  it('drops the words every stated preference is phrased in', () => {
    assert.deepEqual(evidenceTokens(PNPM), ['pnpm', 'install', 'dependencies']);
    assert.deepEqual(evidenceTokens('never use yarn, always prefer pnpm instead'), ['yarn', 'pnpm']);
    for (const word of ECHO_FRAMING) {
      assert.deepEqual(evidenceTokens(`${word} deploy on Fridays`), ['deploy', 'fridays'], word);
    }
  });

  it('keeps the domain words a real echo is made of', () => {
    for (const word of ['lockfile', 'deploy', 'rebase', 'pnpm', 'flakes', 'vitest']) {
      assert.ok(evidenceTokens(word).includes(word), `${word} must stay evidence`);
    }
  });
});

describe('scoreEcho', () => {
  const check = (label, { text = PNPM, prompt, reply, echo }) =>
    it(label, () => {
      const result = scoreEcho(text, { prompt, reply });
      assert.equal(
        result.echo,
        echo,
        `${label}: coverage ${result.coverage.toFixed(2)}, matched [${result.matched}] of [${result.evidence}]`,
      );
    });

  check('counts a reply that names the memory\'s own distinctive word', {
    prompt: 'how do I install dependencies?',
    reply: 'Run `pnpm install` — this repo uses pnpm, so the lockfile stays consistent.',
    echo: true,
  });

  // The case the first draft of this rule got wrong. It came from a smoke run
  // against a real store, not from here, which is why it is written out in full:
  // this is the plugin's canonical memory, its canonical question, and the answer
  // anybody would give. A rule needing two evidence tokens scored it 1 of 4.
  check('counts the canonical memory on the one word a reply would ever carry', {
    text: 'always use pnpm to install dependencies, never npm',
    prompt: 'how do I install the dependencies here?',
    reply: 'Run `pnpm install` — this project is on pnpm, so the lockfile stays put.',
    echo: true,
  });

  // The one that matters. Every word of this reply came from the question.
  check('does not count a reply that merely repeats the prompt', {
    prompt: 'how do I install dependencies?',
    reply: 'You can install the dependencies with the usual command for this project.',
    echo: false,
  });

  check('does not count a reply that contradicts the memory', {
    prompt: 'how do I install dependencies?',
    reply: 'Run `npm install` and commit the lockfile.',
    echo: false,
  });

  check('counts a longer memory on the word that carries it', {
    text: VITEST,
    prompt: 'what test runner should I use here?',
    reply: "I'll write it with Vitest, since you prefer it over the alternatives.",
    echo: true,
  });

  // The accepted noise, written down so it is a decision and not an oversight: at
  // a one-token bar an incidental word out of a long memory does count. It is a
  // memory that already cleared the similarity gate against this prompt, which is
  // most of why the coincidence is rarer than it looks.
  check('counts an incidental word out of a long memory — the noise PLAN accepts', {
    text: VITEST,
    prompt: 'what should I do about the flaky suite?',
    reply: 'The unit under test is racing with the fixture teardown.',
    echo: true,
  });

  // Framing is what keeps that bar from firing on every turn.
  check('does not count a reply that only shares the memory\'s modality', {
    text: 'always deploy from the release branch',
    prompt: 'can I merge this?',
    reply: 'Yes, always — actually, rebase it first and never force-push after review.',
    echo: false,
  });

  check('has nothing to count when the memory adds nothing to the prompt', {
    text: 'always use pnpm',
    prompt: 'should I always use pnpm?',
    reply: 'Yes — always use pnpm.',
    echo: false,
  });

  check('counts nothing against a reply that never came', { prompt: 'x', reply: '', echo: false });

  it('reports the working, not just the verdict', () => {
    const r = scoreEcho(PNPM, { prompt: 'how do I install dependencies?', reply: 'use pnpm' });
    assert.deepEqual(r.evidence, ['pnpm']);
    assert.deepEqual(r.matched, ['pnpm']);
    assert.equal(r.coverage, 1);
    assert.equal(ECHO_MIN_MATCHED, 1);
  });

  // Coverage is reported, not thresholded — it is what tells a debug line "one
  // word in passing" from "the model restated the whole memory".
  it('reports coverage over the whole evidence, however long', () => {
    const long = 'alpha bravo charlie delta foxtrot golf hotel india';
    assert.equal(scoreEcho(long, { reply: 'alpha and bravo' }).coverage, 0.25);
    assert.equal(scoreEcho(long, { reply: long }).coverage, 1);
  });

  it('is not fooled by a non-string reply', () => {
    for (const reply of [null, undefined, 42, {}, []]) {
      assert.equal(scoreEcho(PNPM, { reply }).echo, false, `reply ${JSON.stringify(reply)}`);
    }
  });

  it('stops reading a very long reply, and says so by missing the tail', () => {
    const reply = `${'filler word here. '.repeat(3000)}pnpm`;
    assert.ok(reply.length > MAX_REPLY_CHARS);
    assert.equal(scoreEcho(PNPM, { reply }).matched.length, 0);
    assert.equal(scoreEcho(PNPM, { reply, max: reply.length }).matched.length, 1, 'the cap is what hid it');
  });
});

describe('scoreTurn', () => {
  const record = {
    prompt: 'how do I install dependencies?',
    injected: [
      { id: 1, uid: 'uid-1', text: PNPM },
      { id: 2, uid: 'uid-2', text: VITEST },
    ],
  };

  it('counts every memory the reply echoed, not just the best one', () => {
    const { echoed } = scoreTurn(record, 'Use pnpm, and write the test in Vitest as you prefer.');
    assert.deepEqual(echoed.map((s) => s.id), [1, 2]);
  });

  it('keeps the rows that did not echo, so "injected three, used none" stays visible', () => {
    const { scored, echoed } = scoreTurn(record, 'Run `pnpm install`.');
    assert.equal(scored.length, 2);
    assert.deepEqual(echoed.map((s) => s.id), [1]);
    assert.equal(scored[1].echo, false);
  });

  it('has nothing to do with an empty or missing record', () => {
    for (const r of [null, undefined, {}, { injected: [] }, { injected: 'nope' }]) {
      assert.deepEqual(scoreTurn(r, 'anything').echoed, []);
    }
  });

  it('refuses to count a row with no usable id', () => {
    const { echoed } = scoreTurn({ prompt: '', injected: [{ id: null, text: PNPM }] }, 'pnpm always');
    assert.deepEqual(echoed, []);
  });
});

describe('replyText', () => {
  it('reads every field name the harness might use', () => {
    for (const field of REPLY_FIELDS) assert.equal(replyText({ [field]: 'hello' }), 'hello');
    assert.equal(REPLY_FIELDS[0], 'last_assistant_message', 'the documented name comes first');
  });

  it('treats a blank or absent reply as nothing to compare', () => {
    for (const event of [{}, null, 'nope', { last_assistant_message: '' }, { last_assistant_message: 7 }]) {
      assert.equal(replyText(event), '');
    }
  });

  it('caps what gets tokenised', () => {
    assert.equal(replyText({ last_assistant_message: 'x'.repeat(50_000) }).length, MAX_REPLY_CHARS);
  });
});

describe('transcriptReply', () => {
  const transcript = (entries) => {
    const file = join(scratch, `transcript-${n++}.jsonl`);
    writeFileSync(file, `${entries.map((e) => JSON.stringify(e)).join('\n')}\n`);
    return file;
  };

  const assistant = (text, over = {}) => ({
    type: 'assistant',
    message: { role: 'assistant', content: [{ type: 'text', text }] },
    ...over,
  });

  it('finds the newest assistant message', () => {
    const file = transcript([
      assistant('an older answer'),
      { type: 'user', message: { role: 'user', content: 'and then?' } },
      assistant('the newest answer'),
    ]);
    assert.equal(transcriptReply(file), 'the newest answer');
  });

  // A subagent never saw the injected block, so its words cannot be an echo of it.
  it('skips a sidechain reply', () => {
    const file = transcript([assistant('the real answer'), assistant('a subagent', { isSidechain: true })]);
    assert.equal(transcriptReply(file), 'the real answer');
  });

  it('joins the text parts and ignores tool calls', () => {
    const file = transcript([
      {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [
            { type: 'text', text: 'first' },
            { type: 'tool_use', name: 'Bash', input: { command: 'pnpm install' } },
            { type: 'text', text: 'second' },
          ],
        },
      },
    ]);
    assert.equal(transcriptReply(file), 'first\nsecond');
  });

  it('reads only the tail, and survives the half line that leaves', () => {
    const file = transcript([
      assistant('buried at the start'),
      ...Array.from({ length: 400 }, (_, i) => assistant(`padding ${i} ${'x'.repeat(2000)}`)),
    ]);
    assert.match(transcriptReply(file, { tail: 4096 }), /^padding 399 /);
    assert.equal(transcriptReply(file, { tail: 10 }), '', 'a tail too small to hold a record finds nothing');
  });

  it('returns nothing rather than throwing on anything it cannot read', () => {
    assert.equal(transcriptReply(join(scratch, 'no-such-file.jsonl')), '');
    assert.equal(transcriptReply(''), '');
    assert.equal(transcriptReply(undefined), '');
    assert.equal(transcriptReply(transcript([{ type: 'user', message: { role: 'user', content: 'hi' } }])), '');

    const broken = join(scratch, `broken-${n++}.jsonl`);
    writeFileSync(broken, '{ not json\n\n{"type":"assistant"\n');
    assert.equal(transcriptReply(broken), '');
  });
});

describe('consumeTurn', () => {
  // Lives in recall.mjs with the rest of the turn-record format, but it exists for
  // this hook: a second Stop against one turn would bump the counter twice, and the
  // counter feeds the halflife.
  it('hands the record over once and never again', () => {
    const p = scratchDir();
    recordTurn(p, { sessionId: 's', prompt: 'p', results: [{ id: 1, text: PNPM }], now: NOW });

    const first = consumeTurn(p, 's', { now: NOW });
    assert.equal(first.injected.length, 1);
    assert.equal(consumeTurn(p, 's', { now: NOW }), null, 'a second Stop must count nothing');
  });

  it('leaves the record readable after consuming it', () => {
    const p = scratchDir();
    recordTurn(p, { sessionId: 's', results: [], now: NOW });
    consumeTurn(p, 's', { now: NOW });

    const record = readTurn(p, 's', { now: NOW });
    assert.equal(record.scored_at, NOW, 'the stamp is the receipt, and debugging wants it');
    assert.deepEqual(record.injected, []);
  });

  it('a new prompt makes a new turn, which is scoreable again', () => {
    const p = scratchDir();
    recordTurn(p, { sessionId: 's', results: [{ id: 1, text: PNPM }], now: NOW });
    consumeTurn(p, 's', { now: NOW });
    recordTurn(p, { sessionId: 's', results: [{ id: 2, text: VITEST }], now: NOW + 60_000 });

    assert.equal(consumeTurn(p, 's', { now: NOW + 60_000 }).injected[0].id, 2);
  });

  it('has nothing to hand over for a session it never saw', () => {
    assert.equal(consumeTurn(scratchDir(), 'never'), null);
  });
});

describe('markUseful', () => {
  it('counts the row and restarts its decay clock', async () => {
    const p = scratchDb();
    await seed(p, [PNPM, VITEST, FLAKES]);
    await withDb((conn) => markUseful(conn, [1, 3, 3], { now: NOW }), db(p));

    const after = await rows(p);
    assert.deepEqual(after.map((r) => r.useful_count), [1, 0, 1]);
    assert.deepEqual(after.map((r) => r.last_used_at), [NOW, null, NOW]);
  });

  // The count is an input to the decay model, not a statistic: this is the effect.
  it('lengthens the halflife it feeds', async () => {
    const p = scratchDb();
    await seed(p, [PNPM]);
    await withDb(async (conn) => {
      for (let i = 0; i < 5; i += 1) await markUseful(conn, [1], { now: NOW + i });
    }, db(p));

    const [row] = await rows(p);
    assert.equal(row.useful_count, 5);
    assert.ok(halflifeDays(row.useful_count) > 85, `halflife was ${halflifeDays(row.useful_count)}`);
  });

  it('never drags the decay clock backwards', async () => {
    const p = scratchDb();
    await seed(p, [PNPM]);
    await withDb(async (conn) => {
      await markUseful(conn, [1], { now: NOW });
      await markUseful(conn, [1], { now: NOW - 5 * DAY });
    }, db(p));

    const [row] = await rows(p);
    assert.equal(row.last_used_at, NOW, 'a late hook with an old clock must not un-use a memory');
    assert.equal(row.useful_count, 2, 'the count still moved — only the clock is monotonic');
  });

  it('leaves injection accounting and the write clock alone', async () => {
    const p = scratchDb();
    await seed(p, [PNPM]);
    const before = await rows(p);
    await withDb((conn) => markUseful(conn, [1], { now: NOW }), db(p));

    const [row] = await rows(p);
    assert.equal(row.injected_count, before[0].injected_count, 'usefulness is not injection');
    assert.equal(row.updated_at, before[0].updated_at, 'nothing about the memory changed');
  });

  it('has nothing to do with an empty or junk id list', async () => {
    const p = scratchDb();
    await seed(p, [PNPM]);
    await withDb(async (conn) => {
      assert.equal(await markUseful(conn, []), 0);
      assert.equal(await markUseful(conn, [null, undefined, 'x', 1.5]), 0);
    }, db(p));
    assert.deepEqual((await rows(p)).map((r) => r.useful_count), [0]);
  });
});

describe('mem touch', () => {
  it('counts by id, by uid and by uid prefix', async () => {
    const p = scratchDb();
    await seed(p, [PNPM, VITEST, FLAKES]);
    const results = await touch(['#1', 'uid-2', 'uid-3'], { ...db(p), now: NOW });

    assert.deepEqual(results.map((r) => r.id), [1, 2, 3]);
    assert.deepEqual((await rows(p)).map((r) => r.useful_count), [1, 1, 1]);
  });

  it('reports the halflife, which is what actually changed', async () => {
    const p = scratchDb();
    await seed(p, [PNPM]);
    const [result] = await touch(['1'], { ...db(p), now: NOW });

    assert.equal(result.useful_count, 1);
    assert.equal(result.was.useful_count, 0);
    assert.equal(result.was.halflife_days, 30);
    assert.ok(result.halflife_days > 45, `halflife was ${result.halflife_days}`);
    assert.equal(result.last_used_at, NOW);
  });

  it('counts one memory once however many times it is named', async () => {
    const p = scratchDb();
    await seed(p, [PNPM]);
    await touch(['1', '#1', 'uid-1'], { ...db(p), now: NOW });
    assert.equal((await rows(p))[0].useful_count, 1);
  });

  it('counts nothing at all when one ref does not resolve', async () => {
    const p = scratchDb();
    await seed(p, [PNPM, VITEST]);
    await assert.rejects(() => touch(['1', '#404'], { ...db(p), now: NOW }), /No memory #404/);
    assert.deepEqual((await rows(p)).map((r) => r.useful_count), [0, 0], 'the batch is all or nothing');
  });
});

describe('the recall block', () => {
  // PLAN's second signal is the block naming the ids and asking for the ones that
  // were acted on. Slice 3.2 left the line out because the command did not exist;
  // it exists now, so the line does too.
  it('offers the explicit signal alongside the correction handle', () => {
    const block = renderRecall(
      [{ id: 12, text: PNPM, kind: 'preference', scope: 'global', created_at: NOW - DAY }],
      { now: NOW },
    );
    assert.match(block, /mem touch <id>/);
    assert.match(block, /mem forget <id>/);
  });
});

describe('the Stop hook', () => {
  const home = mkdtempSync(join(tmpdir(), 'mem-echo-hook-'));
  after(() => rmSync(home, { recursive: true, force: true }));
  symlinkSync(paths.nodeModulesDir, join(home, 'node_modules'));

  const empty = mkdtempSync(join(tmpdir(), 'mem-echo-nodb-'));
  after(() => rmSync(empty, { recursive: true, force: true }));

  const hookPaths = { ...paths, dataDir: home, dbPath: join(home, 'mem.db') };

  before(() => seed(hookPaths, [PNPM, VITEST, FLAKES]));

  /** Leave behind exactly what prompt-recall.mjs would have left. */
  const injected = (session, ids, prompt) =>
    recordTurn(hookPaths, {
      sessionId: session,
      prompt,
      results: ids.map((id) => ({ id, uid: `uid-${id}`, text: [PNPM, VITEST, FLAKES][id - 1] })),
      now: Date.now(),
    });

  const run = ({ session, reply, dataDir = home, input, env = {}, ...rest } = {}) =>
    spawnSync(process.execPath, [HOOK], {
      encoding: 'utf8',
      input:
        input !== undefined
          ? input
          : JSON.stringify({
              hook_event_name: 'Stop',
              cwd: '.',
              stop_hook_active: false,
              ...(session === null ? {} : { session_id: session }),
              ...(reply === undefined ? {} : { last_assistant_message: reply }),
              ...rest,
            }),
      env: { ...process.env, CLAUDE_PLUGIN_DATA: dataDir, MEM_NO_INSTALL: '1', ...env },
    });

  /** Every run, without exception: silent, successful, and nothing on stdout. */
  const quiet = (out) => {
    assert.equal(out.status, 0, out.stderr);
    assert.equal(out.stdout, '', 'a Stop hook that writes to stdout can block the turn');
    return out;
  };

  const counts = async () => Object.fromEntries((await rows(hookPaths)).map((r) => [r.id, r]));

  it('counts the memory the reply actually used', async () => {
    injected('echo-1', [1], 'how do I install dependencies?');
    const startedAt = Date.now();
    quiet(run({ session: 'echo-1', reply: 'Run `pnpm install` — this repo is on pnpm.' }));

    const after = await counts();
    assert.equal(after[1].useful_count, 1);
    assert.ok(after[1].last_used_at >= startedAt, 'the decay clock restarts from this turn');
    assert.equal(after[2].useful_count, 0, 'a memory that was not injected must not be counted');
  });

  it('counts nothing when the reply only gave the prompt back', async () => {
    injected('echo-2', [3], 'how does deployment work here?');
    quiet(run({ session: 'echo-2', reply: 'Deployment works the way it is already set up here.' }));
    assert.equal((await counts())[3].useful_count, 0);
  });

  it('counts one turn once, however many times Stop fires', async () => {
    injected('echo-3', [2], 'what should I write the test with?');
    const reply = "I'll use Vitest, since you prefer it.";
    quiet(run({ session: 'echo-3', reply }));
    quiet(run({ session: 'echo-3', reply }));
    assert.equal((await counts())[2].useful_count, 1);
  });

  it('counts only the injected memories the reply echoed', async () => {
    injected('echo-4', [1, 3], 'how do I ship this?');
    quiet(run({ session: 'echo-4', reply: 'Build the nix flakes output and deploy that.' }));

    const after = await counts();
    assert.equal(after[3].useful_count, 1);
    assert.equal(after[1].useful_count, 1, 'unchanged from the first test — this turn added nothing');
  });

  it('falls back to the transcript when the payload carries no reply', async () => {
    injected('echo-5', [3], 'how does deployment work here?');
    const transcript = join(scratch, 'stop-transcript.jsonl');
    writeFileSync(
      transcript,
      `${JSON.stringify({
        type: 'assistant',
        message: { role: 'assistant', content: [{ type: 'text', text: 'It goes out through the nix flakes.' }] },
      })}\n`,
    );

    quiet(run({ session: 'echo-5', transcript_path: transcript }));
    assert.equal((await counts())[3].useful_count, 2);
  });

  it('does nothing for a turn that injected nothing', async () => {
    recordTurn(hookPaths, { sessionId: 'echo-6', prompt: 'unrelated', results: [], now: Date.now() });
    const before = await counts();
    quiet(run({ session: 'echo-6', reply: 'pnpm vitest flakes always prefer deploy' }));

    const after = await counts();
    assert.deepEqual(
      Object.values(after).map((r) => r.useful_count),
      Object.values(before).map((r) => r.useful_count),
      'a reply full of memory words counts nothing if nothing was injected',
    );
  });

  it('does nothing for a session with no record at all', () => {
    quiet(run({ session: 'never-seen', reply: 'pnpm pnpm pnpm' }));
  });

  it('exits quietly on a payload it cannot use', () => {
    for (const input of ['', 'not json', '{"session_id":', 'null', '{}', '{"session_id":""}']) {
      const out = quiet(run({ input }));
      assert.equal(out.stderr, '', `input ${JSON.stringify(input)} said something`);
    }
  });

  it('is quiet on a machine with no store, and creates nothing', () => {
    const nested = join(empty, 'not-yet');
    mkdirSync(join(nested, 'turns'), { recursive: true });
    // A record with no database behind it: the hook must still not build one.
    recordTurn({ ...paths, dataDir: nested }, {
      sessionId: 'orphan',
      prompt: 'how do I install dependencies?',
      results: [{ id: 1, uid: 'uid-1', text: PNPM }],
      now: Date.now(),
    });

    quiet(run({ session: 'orphan', reply: 'Use pnpm.', dataDir: nested, env: { MEM_HOOK_DEBUG: '1' } }));
    assert.equal(existsSync(join(nested, 'mem.db')), false, 'the hook created a database');
  });

  it('explains itself only under MEM_HOOK_DEBUG', async () => {
    injected('echo-7', [1], 'how do I install dependencies?');
    assert.equal(run({ session: 'echo-7', reply: 'Use pnpm.' }).stderr, '');

    injected('echo-8', [1], 'how do I install dependencies?');
    const loud = quiet(run({ session: 'echo-8', reply: 'Use pnpm.', env: { MEM_HOOK_DEBUG: '1' } }));
    assert.match(loud.stderr, /#1 echo/, 'the token working is the only way to debug a missed echo');
    assert.match(loud.stderr, /counted 1 of 1/);
  });

  it('gives up on its own budget instead of delaying the end of the turn', () => {
    injected('echo-9', [1], 'how do I install dependencies?');
    quiet(run({ session: 'echo-9', reply: 'Use pnpm.', env: { MEM_HOOK_TIMEOUT_MS: '1' } }));
  });

  it('stays well inside the hook budget on the path that writes', () => {
    const samples = [];
    for (let i = 0; i < 5; i += 1) {
      injected(`echo-timing-${i}`, [1], 'how do I install dependencies?');
      const t = performance.now();
      quiet(run({ session: `echo-timing-${i}`, reply: 'Run `pnpm install`.' }));
      samples.push(performance.now() - t);
    }
    const sorted = [...samples].sort((a, b) => a - b);
    console.log(`  stop-echo: ${sorted.map((x) => Math.round(x)).join(' ')} ms`);
    assert.ok(sorted[0] < 700, `best sample was ${Math.round(sorted[0])} ms — the write path regressed`);
  });
});

describe('the mem touch command', () => {
  const home = mkdtempSync(join(tmpdir(), 'mem-echo-cli-'));
  after(() => rmSync(home, { recursive: true, force: true }));
  symlinkSync(paths.nodeModulesDir, join(home, 'node_modules'));

  const cliPaths = { ...paths, dataDir: home, dbPath: join(home, 'mem.db') };
  before(() => seed(cliPaths, [PNPM]));

  const mem = (args) =>
    spawnSync(process.execPath, [CLI, ...args], {
      encoding: 'utf8',
      env: { ...process.env, CLAUDE_PLUGIN_DATA: home, MEM_NO_INSTALL: '1' },
    });

  it('counts a memory and says what that did to its halflife', async () => {
    const out = mem(['touch', '1']);
    assert.equal(out.status, 0, out.stderr);
    assert.match(out.stdout, /Counted #1 as useful 1×/);
    assert.match(out.stdout, /30d → 4[0-9]d/);
    assert.equal((await rows(cliPaths))[0].useful_count, 1);
  });

  it('refuses a reference it cannot resolve, and says which', () => {
    const out = mem(['touch', '#404']);
    assert.equal(out.status, 1);
    assert.match(out.stderr, /mem touch: No memory #404/);
  });

  it('asks for a reference rather than guessing', () => {
    const out = mem(['touch']);
    assert.equal(out.status, 1);
    assert.match(out.stderr, /which memory/i);
  });
});
