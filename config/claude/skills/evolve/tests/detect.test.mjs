// node --test skills/evolve/tests/
//
// These cover the two places where a mistake is expensive rather than merely
// wrong. `commandKey` decides what counts as "the same command", so a bug there
// either hides a real retry loop or invents one out of two unrelated invocations.
// `correction` decides that the user was unhappy, and a false positive there is
// the skill telling somebody they made a mistake they did not make.
//
// The NOISY_BINARIES cases are the ones worth keeping forever: `grep` exiting 1
// on no matches is reported as a tool error, and before it was filtered every
// session looked like a catastrophe.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { commandKey, correction, decisiveLine, newFacts, accumulate, signals } from '../scripts/lib/detect.mjs';

test('commandKey: identity survives how it was invoked', () => {
  const same = [
    ['pnpm build', 'pnpm build'],
    ['cd apps/web && pnpm build --filter x', 'pnpm build'],
    ['PNPM_HOME=/x pnpm run build', 'pnpm run build'],
    ['sudo nix build .#foo', 'nix build'],
    ['cargo test -- --nocapture', 'cargo test'],
    ['cargo build 2>&1 | rg error', 'cargo build'],
    ['npm run test:unit 2>&1 | tail -20', 'npm run test:unit'],
    ['/usr/bin/pnpm i', 'pnpm i'],
    ['make -j8 build', 'make build'],
    ['docker compose up -d', 'docker compose up'],
    ['cd /x && npm ci && npm test', 'npm ci'],
    ['nix flake check .#', 'nix flake check'],
    ['bun x tsc --noEmit', 'bun x tsc'],
    ['pytest tests/unit -x', 'pytest'],
    // A runner's script is part of the identity: two different scripts are two
    // different commands, and `node` alone would say nothing.
    ['node scripts/foo.mjs --json > /tmp/a.json', 'node foo.mjs'],
    ['bash scripts/deploy.sh prod', 'bash deploy.sh prod'],
  ];
  for (const [input, want] of same) assert.equal(commandKey(input), want, input);
});

test('commandKey: nothing documentable, nothing recorded', () => {
  // Every one of these exits non-zero in ordinary use. Treating them as failures
  // is what a naive version of this does, and it is unusable.
  for (const input of [
    'grep -r foo .',
    'rg -n pattern src/',
    'find . -name x',
    'ls -la /nope | head -3',
    'test -f x && echo y',
    'cd /tmp',
    'echo hi',
    'cat missing.txt',
    'which pnpm',
  ]) {
    assert.equal(commandKey(input), null, input);
  }
});

test('correction: hits real pushback', () => {
  for (const t of [
    'no, thats not what i asked',
    'No. use bun instead',
    'that is wrong',
    'nope',
    'why did you delete the tests?',
    'still failing with the same error',
    'undo that',
    'i said use pnpm',
    'you forgot the migration',
  ]) {
    assert.ok(correction(t), t);
  }
});

test('correction: ignores ordinary requests', () => {
  // Precision matters more than recall here — see the note in detect.mjs.
  for (const t of [
    'now add a test for the parser',
    'can you also handle nulls?',
    'stop the server when done',
    'does the build still work?',
    'nothing else, thanks',
    'note that we use bun',
    'no idea why that happens, investigate',
    'no need to run the tests',
    '<task-notification>done</task-notification>',
  ]) {
    assert.equal(correction(t), null, t);
  }
});

test('decisiveLine picks the error, not the first line', () => {
  assert.equal(
    decisiveLine('Compiling foo\nwarning: unused\nerror[E0432]: unresolved import `bar`\n  --> src/a.rs:1'),
    'error[E0432]: unresolved import `bar`',
  );
  assert.equal(decisiveLine(''), 'failed with no output');
});

// ── signals ────────────────────────────────────────────────────────────────

/** The event stream for one command: called, then answered. */
const call = (id, cmd) => ({ kind: 'tool', id, name: 'Bash', input: { command: cmd } });
const result = (id, isError, text = '') => ({ kind: 'result', id, isError, text });
const turns = (n) => Array.from({ length: n }, () => ({ kind: 'turn', ms: 1000 }));

test('the wrong command followed by the right one is the headline finding', () => {
  const f = newFacts({ cwd: '/tmp/x' });
  accumulate(f, [
    call('a', 'pnpm build'),
    result('a', true, 'error: missing script "build"'),
    call('b', 'pnpm run build:web'),
    result('b', false, 'done'),
    ...turns(5),
  ]);
  const s = signals(f, { docs: [] });
  const fix = s.find((x) => x.id === 'corrected-command');
  assert.ok(fix, 'expected a corrected-command signal');
  assert.equal(fix.fingerprint, 'fix:pnpm build -> pnpm run build:web');
  assert.match(fix.detail, /missing script/);
  assert.match(fix.detail, /pnpm run build:web/);
});

test('the same command failing then working is a retry loop', () => {
  const f = newFacts({ cwd: '/tmp/x' });
  accumulate(f, [
    call('a', 'pnpm build'),
    result('a', true, 'ERR_PNPM_NO_SCRIPT'),
    call('b', 'pnpm build --filter web'),
    result('b', false, 'ok'),
    ...turns(5),
  ]);
  const s = signals(f, { docs: [] });
  assert.equal(s[0].id, 'retry-loop');
  assert.equal(s[0].fingerprint, 'retry:pnpm build');
});

test('an unrelated success is not a fix', () => {
  const f = newFacts({ cwd: '/tmp/x' });
  accumulate(f, [
    call('a', 'pnpm build'),
    result('a', true, 'boom'),
    call('b', 'git status'),
    result('b', false, 'clean'),
    ...turns(5),
  ]);
  // One failure, never repeated, never fixed: nothing worth anyone's attention.
  assert.deepEqual(signals(f, { docs: [] }), []);
});

test('a documented command failing once is already enough', () => {
  const f = newFacts({ cwd: '/tmp/x' });
  accumulate(f, [call('a', 'pnpm build'), result('a', true, 'error: missing script "build"'), ...turns(5)]);
  const docs = [
    { path: '/tmp/x/CLAUDE.md', rel: 'CLAUDE.md', text: '## Commands\n\nBuild with `pnpm build --filter web`.\n' },
  ];
  const s = signals(f, { docs });
  assert.equal(s[0].id, 'documented-command-failed');
  assert.equal(s[0].target.kind, 'doc-fix');
  assert.equal(s[0].target.rel, 'CLAUDE.md');
  assert.ok(s[0].weight >= 4, 'a broken documented command must clear the gate alone');
  // Without the document there is no claim to make: one stumble is not a lesson.
  assert.deepEqual(signals(f, { docs: [] }), []);
});

test('a documented command is reported once, not twice', () => {
  const f = newFacts({ cwd: '/tmp/x' });
  accumulate(f, [
    call('a', 'pnpm build'),
    result('a', true, 'error: missing script "build"'),
    call('b', 'pnpm run build:web'),
    result('b', false, 'ok'),
    ...turns(5),
  ]);
  const docs = [{ path: '/tmp/x/CLAUDE.md', rel: 'CLAUDE.md', text: 'Build with `pnpm build`.\n' }];
  const s = signals(f, { docs });
  assert.equal(s.length, 1);
  assert.equal(s[0].id, 'documented-command-failed');
  assert.match(s[0].detail, /What worked instead/);
});

test('grep exiting 1 produces no signal at all', () => {
  const f = newFacts({ cwd: '/tmp/x' });
  accumulate(f, [
    call('a', 'rg TODO src/'),
    result('a', true, 'Exit code 1'),
    call('b', 'grep -r nope .'),
    result('b', true, 'Exit code 1'),
    ...turns(6),
  ]);
  assert.deepEqual(signals(f, { docs: [] }), []);
});

test('weak signals stay under the gate on their own', () => {
  const f = newFacts({ cwd: '/tmp/x' });
  accumulate(f, [
    { kind: 'tool', id: 'r1', name: 'Read', input: { file_path: '/tmp/x/src/big.ts' } },
    { kind: 'tool', id: 'r2', name: 'Read', input: { file_path: '/tmp/x/src/big.ts' } },
    { kind: 'tool', id: 'r3', name: 'Read', input: { file_path: '/tmp/x/src/big.ts' } },
    { kind: 'tool', id: 'r4', name: 'Read', input: { file_path: '/tmp/x/src/big.ts' } },
    ...turns(5),
  ]);
  const s = signals(f, { docs: [] });
  assert.equal(s.length, 1);
  assert.equal(s[0].id, 'reread');
  assert.ok(s.reduce((a, x) => a + x.weight, 0) < 4, 'a re-read alone must never trip the gate');
});
