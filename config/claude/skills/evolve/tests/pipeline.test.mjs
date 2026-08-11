// End to end, against a real transcript file on disk.
//
// The detectors are tested next door; this file tests the machinery that decides
// whether anybody hears about them. Three properties matter more than the rest,
// and all three are about *not* speaking:
//
//   incremental        a turn that added nothing must cost nothing and change
//                      nothing, because the Stop hook runs after every turn
//   the gate           a score under the threshold, a session too short, or a
//                      cooldown still running all mean silence
//   declined is final  once the user says no, that finding may never again
//                      contribute to a score — not reduced, removed
//
// The transcript here is written in the shape Claude Code actually appends: one
// JSON object per line, tool_use in an assistant message, tool_result in the
// following user message.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, appendFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = mkdtempSync(join(tmpdir(), 'evolve-test-'));
process.env.EVOLVE_HOME = join(root, 'state');

const store = await import('../scripts/lib/store.mjs');
const review = await import('../scripts/lib/review.mjs');

const p = store.paths();
const now = Date.now();

// ── a transcript, one line at a time ────────────────────────────────────────

let seq = 0;
const line = (o) => `${JSON.stringify(o)}\n`;
const assistant = (id, name, input) =>
  line({ type: 'assistant', uuid: `a${(seq += 1)}`, message: { role: 'assistant', content: [{ type: 'tool_use', id, name, input }] } });
const toolResult = (id, isError, content) =>
  line({ type: 'user', uuid: `u${(seq += 1)}`, toolUseResult: content, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content, is_error: isError }] } });
const human = (text) =>
  line({ type: 'user', uuid: `h${(seq += 1)}`, promptSource: 'typed', origin: { kind: 'human' }, message: { role: 'user', content: text } });
const turn = () => line({ type: 'system', subtype: 'turn_duration', durationMs: 4000 });

/**
 * One failed build followed by the command that worked — score 3.0 on its own —
 * inside a session long enough to be taken seriously. The three prompts are not
 * decoration: they are what clears `tooYoung`, and a session that never reaches it
 * is correctly ignored no matter what it contains.
 */
function frictionSession(file) {
  writeFileSync(file, '');
  appendFileSync(file, human('build the thing'));
  appendFileSync(file, assistant('t1', 'Bash', { command: 'pnpm build' }));
  appendFileSync(file, toolResult('t1', true, 'ERR_PNPM_NO_SCRIPT  Missing script: "build"'));
  appendFileSync(file, assistant('t2', 'Bash', { command: 'pnpm run build:app' }));
  appendFileSync(file, toolResult('t2', false, 'Built in 4.2s'));
  appendFileSync(file, human('now run the tests'));
  appendFileSync(file, human('and commit it'));
  for (let i = 0; i < 5; i += 1) appendFileSync(file, turn());
}

const project = join(root, 'proj');
mkdirSync(project, { recursive: true });

test('observe reads only what is new', () => {
  const file = join(root, 's1.jsonl');
  frictionSession(file);

  const first = review.observe(p, { sessionId: 's1', transcriptPath: file, cwd: project, now });
  assert.ok(first.newEntries > 0);
  assert.equal(first.facts.attempts.length, 2);
  assert.equal(first.facts.prompts, 3);
  assert.equal(first.facts.toolCalls, 2);
  const offset = first.offset;

  // Nothing appended: no new entries, no double counting, offset unmoved.
  const second = review.observe(p, { sessionId: 's1', transcriptPath: file, cwd: project, now });
  assert.equal(second.newEntries, 0);
  assert.equal(second.offset, offset);
  assert.equal(second.facts.attempts.length, 2);

  // Appending is picked up, and only the appended part.
  appendFileSync(file, assistant('t3', 'Bash', { command: 'pnpm test' }));
  appendFileSync(file, toolResult('t3', false, 'ok'));
  const third = review.observe(p, { sessionId: 's1', transcriptPath: file, cwd: project, now });
  assert.equal(third.newEntries, 2);
  assert.equal(third.facts.attempts.length, 3);
});

test('a half-written line waits for its newline', () => {
  const file = join(root, 'partial.jsonl');
  writeFileSync(file, '');
  appendFileSync(file, assistant('t1', 'Bash', { command: 'pnpm build' }));
  appendFileSync(file, '{"type":"user","message":{"role":"user","content":[{"type":"too'); // still streaming

  const s = review.observe(p, { sessionId: 'partial', transcriptPath: file, cwd: project, now });
  assert.equal(s.newEntries, 1, 'the complete line only');

  appendFileSync(file, 'l_result","tool_use_id":"t1","is_error":true}]}}\n');
  const after = review.observe(p, { sessionId: 'partial', transcriptPath: file, cwd: project, now });
  assert.equal(after.newEntries, 1, 'the rest of the line, once it is whole');
});

test('the gate holds until there is enough to say', () => {
  const file = join(root, 's2.jsonl');
  frictionSession(file);
  const state = review.observe(p, { sessionId: 's2', transcriptPath: file, cwd: project, now });

  // 3.0 for the corrected command, under the 4.0 gate: a single stumble in a
  // session is not worth interrupting for.
  const a = review.assess(p, state, { now, docs: [] });
  assert.equal(a.score, 3);
  assert.equal(a.fire, false);
  assert.match(a.reason, /under/);

  // A session that has barely started never speaks, whatever it found.
  const young = { ...state, facts: { ...state.facts, prompts: 1, toolCalls: 2 } };
  const held = review.assess(p, young, { now, docs: [], });
  assert.equal(held.fire, false);
  assert.match(held.reason, /too young/);

  // Unattended tool work counts as activity too: a long autonomous run has
  // exchanged one message and still learned plenty.
  assert.equal(review.tooYoung({ prompts: 1, toolCalls: 40 }), false);
});

test('the same finding in a second session clears the gate', () => {
  const file = join(root, 's3.jsonl');
  frictionSession(file);
  const state = review.observe(p, { sessionId: 's3', transcriptPath: file, cwd: project, now });

  // s1 and s2 already recorded this fingerprint. Recurrence is what promotes it:
  // 3.0 × 1.5 clears 4.0, and the report will say "seen in N sessions".
  const a = review.assess(p, state, { now, docs: [] });
  const fix = a.signals.find((s) => s.id === 'corrected-command');
  assert.ok(fix.recurring, 'expected recurrence across sessions');
  assert.ok(fix.sessions >= 2);
  assert.equal(a.score, 4.5);
  assert.equal(a.fire, true, a.reason);
});

test('cooldown and the per-session cap both silence it', () => {
  const file = join(root, 's4.jsonl');
  frictionSession(file);
  const state = review.observe(p, { sessionId: 's4', transcriptPath: file, cwd: project, now });

  const spoken = { ...state, nudges: 1 };
  assert.match(review.assess(p, spoken, { now, docs: [] }).reason, /already spoke/);

  store.markNudged(p, project, now - 60_000); // one minute ago
  const cooling = review.assess(p, state, { now, docs: [] });
  assert.equal(cooling.fire, false);
  assert.match(cooling.reason, /cooling down/);

  // ...and an explicit ask overrides all of it, because /evolve is the user's
  // decision, not the gate's.
  assert.equal(review.assess(p, state, { now, docs: [], force: true }).fire, true);
});

test('declined is final: it stops counting at all', () => {
  const file = join(root, 's5.jsonl');
  frictionSession(file);
  const state = review.observe(p, { sessionId: 's5', transcriptPath: file, cwd: project, now });

  const before = review.assess(p, state, { now: now + 5 * 3_600_000, docs: [] });
  assert.ok(before.score > 0);
  const fp = before.signals.find((s) => s.id === 'corrected-command').fingerprint;

  store.decide(p, fp, 'declined', { note: 'intentional, the alias is deprecated' });

  const after = review.assess(p, state, { now: now + 5 * 3_600_000, docs: [] });
  const s = after.signals.find((x) => x.fingerprint === fp);
  assert.equal(s.status, 'declined');
  assert.equal(s.counts, false, 'a declined finding must not contribute to the score');
  assert.equal(after.score, 0);
  assert.equal(after.fire, false);
  // Still visible in a report, so `/evolve` can explain why it is being ignored.
  assert.ok(after.signals.length > 0);
});

test('deferred comes back when the defer expires', () => {
  const file = join(root, 's6.jsonl');
  frictionSession(file);
  const state = review.observe(p, { sessionId: 's6', transcriptPath: file, cwd: project, now });
  const fp = 'fix:pnpm build -> pnpm run build:app';

  store.decide(p, fp, 'deferred', { days: 3 }, now);
  assert.equal(review.assess(p, state, { now, docs: [] }).signals.find((s) => s.fingerprint === fp).counts, false);

  const later = now + 4 * 86_400_000;
  const back = review.assess(p, state, { now: later, docs: [] }).signals.find((s) => s.fingerprint === fp);
  assert.equal(back.counts, true, 'a defer is not a decline');
});

test('applying a fix does not un-apply itself later in the same session', () => {
  // The failure that prompted the fix stays in this session's facts for as long as
  // the session runs. Without the session recorded on the decision, the next Stop
  // hook reads that same evidence as "the fix did not work".
  const file = join(root, 's7.jsonl');
  frictionSession(file);
  const state = review.observe(p, { sessionId: 's7', transcriptPath: file, cwd: project, now });
  const fp = 'fix:pnpm build -> pnpm run build:app';

  store.decide(p, fp, 'applied', { session: 's7', appliedTo: 'CLAUDE.md' }, now);

  // Half an hour later, same session, same facts.
  const later = now + 30 * 60_000;
  const same = review.assess(p, state, { now: later, docs: [] }).signals.find((s) => s.fingerprint === fp);
  assert.equal(same.regressed, false);
  assert.equal(same.counts, false, 'the session that applied the fix must stay quiet about it');

  // A different session hitting it again is a real regression, and counts.
  const other = join(root, 's8.jsonl');
  frictionSession(other);
  const s8 = review.observe(p, { sessionId: 's8', transcriptPath: other, cwd: project, now: later });
  const back = review.assess(p, s8, { now: later, docs: [] }).signals.find((s) => s.fingerprint === fp);
  assert.equal(back.regressed, true);
  assert.equal(back.counts, true, 'a fix that did not hold is worth raising again');
});

test('a nudge is delivered exactly once', () => {
  store.armNudge(p, 'sX', { at: now, signals: [{ fingerprint: 'f', title: 't' }] });
  assert.ok(store.takeNudge(p, 'sX'));
  assert.equal(store.takeNudge(p, 'sX'), null);
});

test('the ledger survives a stale in-memory copy', () => {
  // Two writers, the second holding a ledger loaded before the first wrote. The
  // re-read inside updateLedger is what keeps the first decision.
  store.decide(p, 'a:one', 'applied', {});
  const stale = store.readLedger(p);
  store.decide(p, 'a:two', 'declined', {});
  assert.ok(stale.proposals['a:one']);
  const fresh = store.readLedger(p);
  assert.ok(fresh.proposals['a:one'], 'first decision must survive');
  assert.ok(fresh.proposals['a:two'], 'second decision must survive');
});
