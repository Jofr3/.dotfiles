// The capture gate — PLAN "Capture gate".
//
// The gate is a regex, so most of this file is a corpus rather than a unit test:
// the only interesting question about a regex gate is what it fires on and what it
// does not, and that question is answered by examples or not at all. Three corpora
// do the measuring — stated preferences that must fire, ordinary working prompts
// that must not, and the 52 recall questions in build/harness.json, which are all
// negatives by construction because they are questions.
//
// The hook half needs neither the model nor a store, which is the point of it:
// the gate has to work on a machine where retrieval cannot run, because that is
// the machine with nothing stored yet.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';

import {
  CUES,
  MAX_GATE_CHARS,
  captureBlock,
  captureCue,
  captureMatch,
  renderCapture,
} from '../../src/capture.mjs';
import { resolvePaths } from '../../src/paths.mjs';

const paths = resolvePaths();
const HOOK = join(paths.pluginRoot, 'hooks', 'prompt-recall.mjs');

/**
 * Stated preferences. One per shape PLAN's vocabulary is meant to catch, so a
 * miss here names the cue that regressed rather than just lowering a score.
 */
const STATED = [
  'always use pnpm here',
  'never force push to main',
  'from now on run the tests before you commit',
  'I prefer vitest over jest',
  'my preference is 2-space indent',
  'use ripgrep instead of grep',
  "let's go with postgres for this",
  'actually, I switched to bun',
  'no, we moved auth to Clerk last month',
  'nope, that is wrong — the deploy is on Vercel now',
  "don't add comments to every line",
  'don’t add comments to every line',
  'stop using barrel files',
  'stop doing that in this repo',
  'I use fish, not bash',
  'we use conventional commits in this repo',
  'remember that the staging db is read-only',
];

/**
 * Ordinary work. Every fire here is a false one, and it is charged against every
 * prompt of that shape forever — a cue word cannot be un-shipped cheaply.
 */
const ORDINARY = [
  'how do I install dependencies?',
  'what is the capital of France?',
  'yes, please do that',
  'run the tests',
  'fix the failing test in build/tests/db.test.mjs',
  'what do we use for unit tests?',
  'which package manager should I use here?',
  'why does this test fail?',
  'explain this function',
  'add a --json flag to the list command',
  'commit this',
  'can you read src/search.mjs',
  'what did the last slice change?',
  'is there a way to speed this up?',
  'summarise the diff',
  'how do I stop the server?',
  'do you remember what I asked for?',
  'there is no config file in this repo',
  'no idea why the build broke',
  'no need to add a test for that',
  // Kept in the corpus although it fires, the way slice 3.3 kept its two genuine
  // false positives: a negative set with the known leak removed measures the
  // annotation instead of the gate.
  'what do you prefer?',
];

const fired = (prompts) => prompts.filter((p) => captureCue(p) !== null);

describe('captureCue', () => {
  it('fires on every shape of stated preference in the corpus', () => {
    const missed = STATED.filter((p) => captureCue(p) === null);
    assert.deepEqual(missed, [], `${missed.length} of ${STATED.length} stated preferences went dark`);
  });

  // Not zero: "what do you prefer?" fires, and `prefer` is left unnarrowed on
  // purpose (see CUES). The bound is what keeps a future cue word from being added
  // without anyone noticing what it costs on ordinary prompts.
  it('stays quiet on ordinary working prompts', () => {
    const hits = fired(ORDINARY);
    console.log(`  capture gate: ${hits.length}/${ORDINARY.length} ordinary prompts fired ${JSON.stringify(hits)}`);
    assert.ok(hits.length <= 1, `${hits.length} false fires: ${JSON.stringify(hits)}`);
  });

  // The tuning corpus is 52 prompts written as *questions* against the seeded
  // store, so it is a free negative set an order of magnitude larger than the one
  // above — and one nobody wrote with this gate in mind.
  it('stays quiet on the 52 recall prompts in the tuning harness', () => {
    const file = join(paths.pluginRoot, 'build', 'harness.json');
    const cases = JSON.parse(readFileSync(file, 'utf8')).cases;
    assert.ok(cases.length > 20, 'harness.json looks empty — regenerate it');
    const hits = fired(cases.map((c) => c.prompt));
    console.log(`  capture gate: ${hits.length}/${cases.length} harness prompts fired ${JSON.stringify(hits)}`);
    assert.ok(hits.length <= 2, `${hits.length} of ${cases.length} questions fired: ${JSON.stringify(hits)}`);
  });

  it('distinguishes stating a habit from asking about one', () => {
    assert.equal(captureCue('we use bun for scripts'), 'habit');
    assert.equal(captureCue('should we use bun for scripts?'), null);
    assert.equal(captureCue('remember to run the migration first'), 'explicit');
    assert.equal(captureCue('can you remember to run the migration first'), null);
  });

  it('wants an activity after "stop", not a server', () => {
    assert.equal(captureCue('stop reformatting the whole file'), 'correction');
    assert.equal(captureCue('stop the dev server on port 3000'), null);
  });

  it('takes "no" as an answer only at the start of a sentence, and commatted', () => {
    assert.equal(captureCue('no, use the async version'), 'correction');
    assert.equal(captureCue('I did that. no, it still fails'), 'correction');
    assert.equal(captureCue('there is no way to do that here'), null);
    assert.equal(captureCue('no idea why this fails'), null, 'an ordinary opening, not a correction');
  });

  it('names the first cue that matched, and quotes it', () => {
    const hit = captureBlock('from now on I use fish');
    assert.equal(hit.cue, 'standing');
    assert.equal(hit.match, 'from now on');
    assert.equal(captureMatch('I prefer fish', 'preference'), 'prefer');
    assert.equal(captureMatch('I prefer fish', 'habit'), null, 'a cue that did not match has no quote');
  });

  it('returns null rather than throwing on anything that is not text', () => {
    for (const input of ['', null, undefined, 42, {}, []]) {
      assert.equal(captureCue(input), null, `input ${JSON.stringify(input)}`);
      assert.equal(captureBlock(input), null);
    }
  });

  // Same head recall embeds, same accepted loss: a preference stated after a huge
  // paste is not seen. The test exists so the loss stays a decision.
  it('reads only the head of a giant prompt, and survives one', () => {
    const filler = 'x '.repeat(MAX_GATE_CHARS);
    assert.equal(captureCue(`${filler}always use pnpm`), null, 'past the cut, deliberately');
    assert.equal(captureCue(`always use pnpm ${filler}`), 'standing');
    assert.equal(captureCue('lorem ipsum '.repeat(20_000)), null);
  });

  // PLAN: "pure-JS regex, target <20ms, no LLM". Three orders of magnitude of
  // headroom, on a corpus that includes a full-length prompt, so the assertion can
  // afford to be the budget itself rather than a proxy for it.
  it('costs a rounding error against the 20ms budget', () => {
    const corpus = [...STATED, ...ORDINARY, 'lorem ipsum '.repeat(400).slice(0, MAX_GATE_CHARS)];
    for (let w = 0; w < 50; w += 1) for (const p of corpus) captureCue(p);

    let worst = 0;
    const t = performance.now();
    const rounds = 200;
    for (let i = 0; i < rounds; i += 1) {
      for (const p of corpus) {
        const s = performance.now();
        captureCue(p);
        worst = Math.max(worst, performance.now() - s);
      }
    }
    const mean = ((performance.now() - t) / (rounds * corpus.length)) * 1000;
    console.log(`  capture gate: ${mean.toFixed(2)}us mean, worst single call ${worst.toFixed(3)}ms`);
    assert.ok(worst < 20, `worst single call was ${worst.toFixed(3)}ms`);
    assert.ok(mean < 500, `mean was ${mean.toFixed(2)}us per prompt`);
  });
});

describe('the injected block', () => {
  const block = renderCapture({ match: 'always' });

  it('is a block of its own, not a recollection', () => {
    assert.match(block, /^<mem-capture-cue>/);
    assert.match(block, /<\/mem-capture-cue>$/);
    assert.doesNotMatch(block, /mem-recollection/);
  });

  it('says what to do, with the flag that makes it safe to do unasked', () => {
    assert.match(block, /mem:remember/);
    assert.match(block, /--staged/);
    // Where a staged memory goes, or "never recalled until promoted" reads as
    // "never recalled".
    assert.match(block, /\/mem:review/);
  });

  // The gate is wrong often — that is the deal that makes it free — so the block
  // has to give the model an exit, or it will invent a preference to store.
  it('admits it may be nothing and gives an explicit way out', () => {
    assert.match(block, /regex/i);
    assert.match(block, /ignore this block/i);
    assert.match(block, /durable|still be true/i);
    assert.match(block, /"always"/, 'quotes the phrase that fired');
  });

  it('is short enough to sit on every matching prompt', () => {
    assert.ok(block.length < 900, `block is ${block.length} chars`);
  });

  it('quotes nothing rather than "null" when there is no match to quote', () => {
    assert.doesNotMatch(renderCapture(), /null|undefined/);
  });
});

describe('the gate in the hook', () => {
  const scratch = mkdtempSync(join(tmpdir(), 'mem-capture-hook-'));
  after(() => rmSync(scratch, { recursive: true, force: true }));

  /**
   * A data dir with nothing in it: no database, no node_modules, no model. The
   * hook's retrieval half refuses to start here, which is exactly the condition
   * this half has to survive — and it makes the test fast, since nothing loads
   * turso or onnx.
   */
  const bare = join(scratch, 'no-store');

  const run = (prompt, env = {}) =>
    spawnSync(process.execPath, [HOOK], {
      encoding: 'utf8',
      input: JSON.stringify({ hook_event_name: 'UserPromptSubmit', cwd: '.', prompt }),
      env: { ...process.env, CLAUDE_PLUGIN_DATA: bare, MEM_NO_INSTALL: '1', ...env },
    });

  const context = (out) => {
    assert.equal(out.status, 0, out.stderr);
    assert.notEqual(out.stdout.trim(), '', 'expected an injection');
    const payload = JSON.parse(out.stdout);
    assert.equal(payload.hookSpecificOutput.hookEventName, 'UserPromptSubmit');
    return payload.hookSpecificOutput.additionalContext;
  };

  it('fires with no database, no dependencies and no model', () => {
    const block = context(run('from now on use pnpm here'));
    assert.match(block, /^<mem-capture-cue>/);
    assert.doesNotMatch(block, /mem-recollection/, 'there is nothing to recall on this machine');
  });

  it('creates nothing while doing it', () => {
    run('always use pnpm here');
    assert.equal(existsSync(bare), false, 'the hook bootstrapped a data dir');
  });

  it('still says nothing on a prompt with no cue', () => {
    const out = run('how do I install dependencies?');
    assert.equal(out.status, 0);
    assert.equal(out.stdout, '', 'stdout is injected verbatim on this event — it must stay empty');
    assert.equal(out.stderr, '');
  });

  // A correction is frequently made of nothing but stopwords ("no, don't do
  // that"), which is a prompt retrieval refuses outright — it has nothing to
  // retrieve *on*. The gate runs before any of that for exactly this case.
  it('fires on a correction that has nothing to retrieve on', () => {
    const out = run("no, don't do that", { MEM_HOOK_DEBUG: '1' });
    assert.match(context(out), /^<mem-capture-cue>/);
    assert.match(out.stderr, /capture cue 'correction'/);
    assert.match(out.stderr, /no database|no distinctive terms/, 'retrieval still gave up');
  });

  it('survives the watchdog, which retrieval does not', () => {
    assert.match(context(run('always use pnpm here', { MEM_HOOK_TIMEOUT_MS: '1' })), /^<mem-capture-cue>/);
  });

  it('explains the cue only under MEM_HOOK_DEBUG', () => {
    assert.equal(run('always use pnpm here').stderr, '');
    assert.match(run('always use pnpm here', { MEM_HOOK_DEBUG: '1' }).stderr, /capture cue 'standing'/);
  });

  it('has nothing to say about a payload carrying no prompt', () => {
    for (const input of ['', 'not json', '{}', '{"prompt":""}']) {
      const out = spawnSync(process.execPath, [HOOK], {
        encoding: 'utf8',
        input,
        env: { ...process.env, CLAUDE_PLUGIN_DATA: bare, MEM_NO_INSTALL: '1' },
      });
      assert.equal(out.status, 0, `input ${JSON.stringify(input)}: ${out.stderr}`);
      assert.equal(out.stdout, '', `input ${JSON.stringify(input)} injected something`);
    }
  });
});

describe('CUES', () => {
  it('covers PLAN\'s vocabulary, one cue at a time', () => {
    // PLAN's list, verbatim, each in the smallest sentence that carries it. If a
    // narrowing ever swallows one of these, this is where it shows up.
    const vocabulary = {
      always: 'always run the linter',
      never: 'never commit to main',
      'from now on': 'from now on ask first',
      prefer: 'I prefer tabs',
      instead: 'use bun instead',
      actually: 'actually that is wrong',
      "don't": "don't reformat it",
      stop: 'stop reformatting it',
      'I use': 'I use zsh',
      'we use': 'we use pnpm',
      "let's go with": "let's go with option B",
      remember: 'remember the db is read-only',
      'no, …': 'no, use the other one',
    };
    for (const [item, prompt] of Object.entries(vocabulary)) {
      assert.notEqual(captureCue(prompt), null, `PLAN's "${item}" no longer fires (${prompt})`);
    }
  });

  it('is a list of named, case-insensitive, linear patterns', () => {
    assert.ok(CUES.length >= 5);
    for (const { cue, re } of CUES) {
      assert.equal(typeof cue, 'string');
      assert.ok(re.flags.includes('i'), `${cue} is case-sensitive`);
      assert.equal(re.global, false, `${cue} is global — lastIndex would make test() stateful`);
    }
  });

  it('is stateless across calls', () => {
    // A /g or /y flag anywhere in CUES makes the second call on the same prompt
    // disagree with the first, which would be a gate that fires every other turn.
    for (const p of STATED) assert.equal(captureCue(p), captureCue(p));
  });
});
