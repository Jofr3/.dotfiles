// The judge — PLAN's tier 2, "batches ~20 pairs per LLM call (`claude -p`,
// structured output) and classifies each".
//
// NOT ONE TEST HERE SPAWNS `claude`. That is the point of the module's shape: the
// judge is a pure prompt-builder and a pure reply-parser with one spawn between
// them, so everything worth asserting is assertable without a network, an API key
// or a model's cooperation. The two tests that DO spawn use `node -e` as a stand-in
// binary, because the parts worth proving about the subprocess — that the prompt
// really goes down stdin, that a non-zero exit is reported, that a hung child is
// killed — are properties of this file and not of the model.
//
// The assertions cluster around the failures that are silent: a reply that skips a
// pair, a reply about a pair nobody asked about, an envelope shape that changed
// under us. Each of those, absorbed quietly, ends with a real contradiction cached
// as settled and never shown to anyone again.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  JUDGE_BATCH,
  JUDGE_SCHEMA,
  JudgeError,
  batchPairs,
  buildPrompt,
  claudeArgs,
  collectVerdicts,
  extractPayload,
  judgeBatch,
  judgePairs,
  normaliseLabel,
  pairLabel,
  renderPair,
  runClaude,
} from '../../src/judge.mjs';
import { VERDICTS, pairKey } from '../../src/pairs.mjs';

const NOW = 1_750_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

/** `assert.throws` does not hand the error back, and the error IS the assertion. */
function caught(fn) {
  try {
    fn();
  } catch (err) {
    return err;
  }
  return assert.fail('expected a throw');
}

let n = 100;
/** A pair in the shape detectPairs hands back — both rows whole. */
function pair(aText, bText, extra = {}) {
  const a = n++;
  const b = n++;
  const row = (id, text, over = {}) => ({
    id,
    uid: `uid-${id}`,
    kind: 'preference',
    text,
    why: null,
    pinned: 0,
    salience: 0.5,
    confidence: 0.5,
    created_at: NOW - 30 * DAY,
    updated_at: NOW - 30 * DAY,
    consolidated_at: null,
    ...over,
  });
  return {
    key: pairKey(a, b),
    a,
    b,
    similarity: 0.91,
    scope: 'project',
    project_key: 'test/judge',
    rows: [row(a, aText, extra.a ?? {}), row(b, bText, extra.b ?? {})],
    ...extra.pair,
  };
}

const envelope = (verdicts) =>
  JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: JSON.stringify({ verdicts }) });

/** A fake `run`: answers every pair in the batch with one class. */
const answering = (classOf, { code = 0, stderr = '' } = {}) => {
  const calls = [];
  const run = async (prompt) => {
    calls.push(prompt);
    // The contract the prompt states: the bracketed id on each pair's first line
    // is the key the answer comes back under. Parsed out of the prompt rather
    // than taken from the batch, so this fake fails the same way a model would
    // if buildPrompt ever stopped printing an id the answer can name.
    const keys = [...prompt.matchAll(/^\[(\d+-\d+)\]\s/gm)].map((m) => m[1]);
    return {
      code,
      stderr,
      ms: 1,
      stdout: envelope(
        keys.map((key) => ({ pair: key, class: classOf(key), why: 'because', general: 'neither' })),
      ),
    };
  };
  run.calls = calls;
  return run;
};

describe('the ask', () => {
  it('puts every pair in the prompt, keyed by the id the answer must use', () => {
    const batch = [pair('use pnpm', 'use pnpm always'), pair('deploy fridays', 'deploy on fridays')];
    const prompt = buildPrompt(batch, { now: NOW });

    for (const p of batch) {
      assert.ok(prompt.includes(`[${pairLabel(p)}]`), `prompt is missing [${pairLabel(p)}]`);
      for (const row of p.rows) assert.ok(prompt.includes(row.text), `prompt is missing ${row.text}`);
    }
    assert.ok(prompt.includes('2 pairs'));
  });

  it('does not put the `pair:` cache key where an answer key belongs', () => {
    // MEASURED, NOT STYLE. Asked about `pair:1:2`, a live judge answered `"1:2"`
    // — every verdict correct and every one of them dropped as an answer about a
    // pair nobody asked about. A colon-bearing id at the start of a line reads as
    // a label, so the id that goes over the wire has no prefix and no colon.
    const p = pair('a', 'b');
    const prompt = buildPrompt([p], { now: NOW });
    assert.ok(!prompt.includes(p.key), 'the prompt still carries the pair: cache key');
    assert.match(prompt, /^\[\d+-\d+\]/m);
  });

  it('says which side is older and nothing about pins or confidence', () => {
    const p = pair('old fact', 'new fact', {
      a: { created_at: NOW - 400 * DAY, pinned: 1, confidence: 0.95 },
      b: { created_at: NOW - DAY, confidence: 0.2 },
    });
    const rendered = renderPair(p, { now: NOW });

    // The judge needs the order — `contradiction` is meaningless without it.
    assert.match(rendered, /old fact/);
    assert.match(rendered, /the older/);
    assert.equal(rendered.split('the older').length - 1, 1, 'exactly one side is the older one');
    // And must not be told what the guard will decide: a model that knows one side
    // is pinned can pre-empt the guard by softening the verdict.
    assert.doesNotMatch(rendered, /pinned/i);
    assert.doesNotMatch(rendered, /confidence/i);
  });

  it('clips a long memory rather than sending a wall of text', () => {
    const long = 'x'.repeat(4000);
    const rendered = renderPair(pair(long, 'short'), { now: NOW });
    assert.ok(rendered.length < 2000, `rendered ${rendered.length} chars`);
    assert.ok(rendered.includes('…'));
  });

  it('refuses to build an empty prompt', () => {
    assert.throws(() => buildPrompt([]), /at least one pair/);
  });

  it('splits into batches of ~20, PLAN\'s LLM-call unit', () => {
    const many = Array.from({ length: 45 }, (_, i) => pair(`a${i}`, `b${i}`));
    assert.deepEqual(batchPairs(many, JUDGE_BATCH).map((b) => b.length), [20, 20, 5]);
    assert.deepEqual(batchPairs(many.slice(0, 3), 20).map((b) => b.length), [3]);
    assert.deepEqual(batchPairs([], 20), []);
  });
});

describe('the flags', () => {
  it('asks for structured output, no tools, and a model that can be overridden', () => {
    const args = claudeArgs({ model: 'haiku' });
    assert.ok(args.includes('-p'));
    assert.deepEqual(args.slice(args.indexOf('--model'), args.indexOf('--model') + 2), ['--model', 'haiku']);
    assert.deepEqual(
      args.slice(args.indexOf('--output-format'), args.indexOf('--output-format') + 2),
      ['--output-format', 'json'],
    );
    // A judge reads untrusted text captured off a terminal. It gets no tools.
    assert.deepEqual(args.slice(args.indexOf('--tools'), args.indexOf('--tools') + 2), ['--tools', '']);

    const schema = JSON.parse(args[args.indexOf('--json-schema') + 1]);
    assert.deepEqual(schema, JUDGE_SCHEMA);
  });

  it('constrains the class to exactly PLAN\'s five, with no `format` anywhere', () => {
    const item = JUDGE_SCHEMA.properties.verdicts.items;
    assert.deepEqual(item.properties.class.enum, VERDICTS);
    assert.equal(item.additionalProperties, false);
    assert.deepEqual(item.required, ['pair', 'class', 'why', 'general']);

    // `--json-schema` used to reject schemas using `format` and fall back to
    // UNSTRUCTURED output, which reads like a bad model rather than a bad flag.
    const walk = (node) => {
      if (!node || typeof node !== 'object') return;
      assert.ok(!Object.hasOwn(node, 'format'), 'schema uses the `format` keyword');
      for (const value of Object.values(node)) walk(value);
    };
    walk(JUDGE_SCHEMA);
  });
});

describe('the answer', () => {
  const verdicts = [{ pair: 'pair:1:2', class: 'duplicate', why: 'same', general: 'neither' }];

  it('reads the structured object out of every envelope shape the CLI has used', () => {
    // result as a JSON string (what --output-format json does today)…
    assert.deepEqual(extractPayload(envelope(verdicts)).verdicts, verdicts);
    // …the same value as an object beside it…
    assert.deepEqual(
      extractPayload(JSON.stringify({ result: 'ignored', structured_output: { verdicts } })).verdicts,
      verdicts,
    );
    assert.deepEqual(
      extractPayload(JSON.stringify({ structuredOutput: { verdicts } })).verdicts,
      verdicts,
    );
    // …the bare object, if the envelope ever goes away…
    assert.deepEqual(extractPayload(JSON.stringify({ verdicts })).verdicts, verdicts);
    // …and fenced, which is what an unstructured fallback looks like.
    assert.deepEqual(
      extractPayload(JSON.stringify({ result: '```json\n' + JSON.stringify({ verdicts }) + '\n```' })).verdicts,
      verdicts,
    );
  });

  it('surfaces the CLI\'s own error instead of reporting no verdicts', () => {
    const err = caught(() => extractPayload(JSON.stringify({ is_error: true, result: 'usage limit reached' })));
    assert.ok(err instanceof JudgeError);
    assert.equal(err.code, 'MEM_JUDGE_REFUSED');
    assert.match(err.message, /usage limit reached/);
  });

  it('names the shape it could not read', () => {
    assert.equal(caught(() => extractPayload('')).code, 'MEM_JUDGE_EMPTY');
    assert.equal(caught(() => extractPayload('I cannot do that')).code, 'MEM_JUDGE_BAD_JSON');
    assert.equal(caught(() => extractPayload('{"result":"{}"}')).code, 'MEM_JUDGE_NO_VERDICTS');
  });
});

describe('the id the answer comes back under', () => {
  it('accepts every way a model reformats the id it was given', () => {
    // Tolerant about the form. All of these were seen or are one edit away from
    // what was seen: `1:2` (the live failure), `[1-2]` (told to copy "the
    // bracketed id", one run in five copied the brackets too).
    for (const form of ['1-2', '1:2', '[1-2]', 'pair:1:2', 'pair 1-2', ' #1 - #2 ', '2-1', '1_2', '1.2']) {
      assert.equal(normaliseLabel(form), '1-2', `did not recognise ${JSON.stringify(form)}`);
    }
  });

  it('refuses anything that is not two ids', () => {
    for (const form of ['', null, undefined, 'first', '1', '1-2-3', 'a-b', '1-']) {
      assert.equal(normaliseLabel(form), null, `wrongly accepted ${JSON.stringify(form)}`);
    }
  });

  it('is still strict about WHICH pair, however the id was written', () => {
    // The whole point of being lenient here is formatting. A verdict about two
    // memories that are not in the batch is still dropped, whatever it is called.
    const batch = [pair('a', 'b')];
    const [p] = batch;
    const answered = collectVerdicts(
      {
        verdicts: [
          { pair: `[${p.a}:${p.b}]`, class: 'duplicate', why: 'w', general: 'neither' },
          { pair: '4242-4243', class: 'contradiction', why: 'w', general: 'a' },
        ],
      },
      batch,
    );
    assert.deepEqual([...answered.verdicts.keys()], [p.key]);
    assert.deepEqual(answered.unknown, [{ pair: '4242-4243', class: 'contradiction' }]);
  });

  it('labels a pair by its two ids and nothing else', () => {
    const p = pair('a', 'b');
    assert.equal(pairLabel(p), `${p.a}-${p.b}`);
    assert.equal(normaliseLabel(pairLabel(p)), pairLabel(p));
    // The cache key round-trips too — that is what makes the old prompt's answers
    // (and a hand-typed id) still readable.
    assert.equal(normaliseLabel(p.key), pairLabel(p));
  });
});

describe('checking the answer against the question', () => {
  const batch = [pair('a', 'b'), pair('c', 'd')];
  const [one, two] = batch.map((p) => p.key);

  it('reports a pair the model skipped instead of defaulting it', () => {
    const got = collectVerdicts(
      { verdicts: [{ pair: one, class: 'duplicate', why: 'w', general: 'neither' }] },
      batch,
    );
    assert.deepEqual([...got.verdicts.keys()], [one]);
    // NOT `unrelated`: that verdict is cached forever, so a default would bury the
    // unjudged pair permanently.
    assert.deepEqual(got.missing, [two]);
  });

  it('drops an answer about a pair nobody asked about', () => {
    const got = collectVerdicts(
      {
        verdicts: [
          { pair: 'pair:9998:9999', class: 'contradiction', why: 'w', general: 'a' },
          { pair: one, class: 'unrelated', why: 'w', general: 'neither' },
        ],
      },
      batch,
    );
    assert.deepEqual(got.unknown, [{ pair: 'pair:9998:9999', class: 'contradiction' }]);
    assert.deepEqual([...got.verdicts.keys()], [one]);
  });

  it('drops a class that is not one of the five', () => {
    const got = collectVerdicts({ verdicts: [{ pair: one, class: 'maybe', why: 'w', general: 'a' }] }, batch);
    assert.deepEqual(got.invalid, [{ pair: one, class: 'maybe' }]);
    assert.equal(got.verdicts.size, 0);
    assert.deepEqual(got.missing, [one, two]);
  });

  it('keeps the first verdict when a pair is answered twice', () => {
    const got = collectVerdicts(
      {
        verdicts: [
          { pair: one, class: 'refinement', why: 'first', general: 'a' },
          { pair: one, class: 'contradiction', why: 'second', general: 'b' },
        ],
      },
      batch,
    );
    assert.equal(got.verdicts.get(one).class, 'refinement');
    assert.equal(got.verdicts.get(one).general, 'a');
  });

  it('keeps `general` only when it names a side', () => {
    const got = collectVerdicts(
      {
        verdicts: [
          { pair: one, class: 'refinement', why: 'w', general: 'neither' },
          { pair: two, class: 'refinement', why: 'w', general: 'b' },
        ],
      },
      batch,
    );
    assert.equal(got.verdicts.get(one).general, null);
    assert.equal(got.verdicts.get(two).general, 'b');
  });
});

describe('one batch, end to end', () => {
  it('judges a batch through an injected runner', async () => {
    const batch = [pair('use pnpm', 'use pnpm, never npm'), pair('x', 'y')];
    const run = answering(() => 'refinement');
    const got = await judgeBatch(batch, { now: NOW, run });

    assert.equal(run.calls.length, 1);
    assert.equal(got.verdicts.size, 2);
    assert.deepEqual(got.missing, []);
    assert.equal(got.verdicts.get(batch[0].key).class, 'refinement');
  });

  it('reports the exit code when a failed call printed nothing readable', async () => {
    const run = async () => ({ code: 1, stdout: '', stderr: 'boom', ms: 1 });
    const err = await judgeBatch([pair('a', 'b')], { run }).then(
      () => null,
      (e) => e,
    );
    assert.equal(err.code, 'MEM_JUDGE_EXIT');
    assert.match(err.message, /boom/);
  });

  it('prefers the envelope\'s own message over the exit code', async () => {
    const run = async () => ({
      code: 1,
      stdout: JSON.stringify({ is_error: true, result: 'credit balance too low' }),
      stderr: '',
      ms: 1,
    });
    const err = await judgeBatch([pair('a', 'b')], { run }).then(
      () => null,
      (e) => e,
    );
    assert.equal(err.code, 'MEM_JUDGE_REFUSED');
    assert.match(err.message, /credit balance/);
  });
});

describe('every batch', () => {
  it('keeps the judgements from the batches that worked', async () => {
    const pairs = Array.from({ length: 5 }, (_, i) => pair(`a${i}`, `b${i}`));
    let call = 0;
    const run = async (prompt) => {
      call += 1;
      if (call === 1) throw new JudgeError('the judge did not answer within 1 ms.', 'MEM_JUDGE_TIMEOUT');
      return answering(() => 'unrelated')(prompt);
    };

    const got = await judgePairs(pairs, { batchSize: 2, run, now: NOW });
    assert.equal(got.batches, 3);
    assert.equal(got.calls, 3);
    // One dead call costs its own two pairs and nothing else…
    assert.equal(got.judged, 3);
    assert.equal(got.errors.length, 1);
    assert.equal(got.errors[0].code, 'MEM_JUDGE_TIMEOUT');
    // …and those two are named, because the caller must not stamp over them.
    assert.deepEqual(got.unjudged.sort(), [pairs[0].key, pairs[1].key].sort());
  });

  it('answers an empty backlog without calling anything', async () => {
    let called = false;
    const got = await judgePairs([], {
      run: async () => {
        called = true;
      },
    });
    assert.equal(called, false);
    assert.equal(got.calls, 0);
    assert.equal(got.judged, 0);
  });
});

describe('the subprocess', () => {
  it('sends the prompt on stdin and reads the reply back', async () => {
    // `node -e` stands in for `claude -p`: what is being tested is this file's
    // plumbing, and a real judge would test the model instead.
    const script =
      'let s = ""; process.stdin.on("data", (d) => (s += d)); ' +
      'process.stdin.on("end", () => console.log(JSON.stringify({ result: JSON.stringify(' +
      '{ verdicts: [{ pair: (s.match(/^\\[(\\d+-\\d+)\\]/m) || ["", ""])[1], class: "unrelated", why: "w", general: "neither" }] }) })));';

    const p = pair('a', 'b');
    const got = await judgeBatch([p], {
      now: NOW,
      run: (prompt, opts) => runClaude(prompt, { ...opts, bin: process.execPath, args: ['-e', script] }),
    });
    assert.equal(got.verdicts.get(p.key)?.class, 'unrelated', 'the prompt did not reach stdin');
    assert.equal(got.code, 0);
  });

  it('kills a judge that never answers', async () => {
    const err = await runClaude('hello', {
      bin: process.execPath,
      args: ['-e', 'setTimeout(() => {}, 60000)'],
      timeoutMs: 150,
    }).then(
      () => null,
      (e) => e,
    );
    assert.equal(err.code, 'MEM_JUDGE_TIMEOUT');
  });

  it('says so when the binary is not there', async () => {
    const err = await runClaude('hello', { bin: '/nonexistent/claude-judge', args: [] }).then(
      () => null,
      (e) => e,
    );
    assert.equal(err.code, 'MEM_JUDGE_SPAWN');
  });

  it('refuses to spawn at all under MEM_NO_LLM=1', () => {
    const err = caught(() => runClaude('hello', { env: { MEM_NO_LLM: '1' } }));
    assert.ok(err instanceof JudgeError);
    assert.equal(err.code, 'MEM_NO_LLM');
  });
});
