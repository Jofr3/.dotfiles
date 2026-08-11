#!/usr/bin/env node
// UserPromptSubmit — deliver a nudge the Stop hook armed, at most one, exactly
// once, and only when there is one waiting.
//
// This hook is the mouth and stop-observe.mjs is the eyes. It does no detection,
// reads no transcript and makes no judgement: it looks for a single small file
// under pending/, and if it is there, hands its contents to the model as context
// attached to whatever the user just typed. The overwhelming majority of prompts
// find no file and cost one failed stat.
//
// Why this event and not Stop: a proposal arriving mid-work is an interruption,
// and a Stop hook cannot inject context without also seizing control of the turn.
// Arriving with the user's next message, the suggestion is something the model
// can raise *after* answering — which is exactly the instruction the payload
// carries.
//
// Two rules that keep it from becoming noise:
//
//   Delivered once. takeNudge() reads and unlinks in one step, so a crash after
//   this point loses the nudge rather than repeating it. That is the right trade:
//   the friction will recur, and when it does the ledger will know it recurred.
//
//   Never louder than the prompt it rides on. The text below tells the model to
//   answer the user first and keep the proposal to a couple of lines. A skill
//   that derails the request it arrived with does not get to make a second
//   suggestion.
//
// For UserPromptSubmit the harness treats bare stdout as context to inject, so
// every write here goes through emit() and a stray console.log would be a prompt
// injection rather than a cosmetic bug.
//
// EVOLVE_DISABLE=1 turns it off. EVOLVE_DEBUG=1 explains a silent exit.

import { readFileSync } from 'node:fs';

const BUDGET_MS = Number(process.env.EVOLVE_HOOK_TIMEOUT_MS) || 1500;

const debug = (why) => {
  if (process.env.EVOLVE_DEBUG) process.stderr.write(`evolve nudge: ${why}\n`);
};

function done(why) {
  debug(why);
  process.exit(0);
}

function emit(additionalContext) {
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext } }));
  process.exit(0);
}

function readEvent() {
  try {
    if (process.stdin.isTTY) return {};
    return JSON.parse(readFileSync(0, 'utf8')) ?? {};
  } catch {
    return {};
  }
}

/**
 * The injected block.
 *
 * Written as a briefing, not an order: it says what was observed, where the
 * detail lives, and what good judgement looks like — including permission to
 * conclude that none of it is worth the user's attention. The skill file is the
 * long version; this is the part that has to survive being read in the middle of
 * somebody else's question.
 */
function render(payload) {
  const lines = payload.signals.map((s) => {
    const marks = [
      s.recurring ? `seen in ${s.sessions} sessions` : null,
      s.regressed ? 'came back after a fix' : null,
    ]
      .filter(Boolean)
      .join(', ');
    return `- ${s.title}${marks ? ` (${marks})` : ''}\n  \`${s.fingerprint}\``;
  });

  return `<evolve-observation>
This session accumulated friction that may be worth writing down somewhere permanent
(score ${payload.score}). What was detected:

${lines.join('\n')}

Answer the user's message first — this is background, not their request. Then, if and
only if you judge at least one of these genuinely valuable to fix, invoke the \`evolve\`
skill and follow it: get the full evidence with \`evolve report\`, propose at most two
concrete changes, and record the verdict in the ledger. Recurring findings are the ones
worth raising; a single stumble usually is not.

Saying nothing is a correct outcome and needs no explanation. If you do stay silent,
mark them so they are not raised again:
\`node ~/.claude/skills/evolve/scripts/evolve.mjs decide <fingerprint> declined --note "…"\`
</evolve-observation>`;
}

async function main() {
  if (process.env.EVOLVE_DISABLE) return done('disabled by EVOLVE_DISABLE');

  const event = readEvent();
  const sessionId = event.session_id ?? event.sessionId;
  if (typeof sessionId !== 'string' || sessionId === '') return done('no session id in the payload');

  const store = await import('../scripts/lib/store.mjs');
  const payload = store.takeNudge(store.paths(), sessionId);
  if (!payload || !Array.isArray(payload.signals) || payload.signals.length === 0) return done('nothing armed');

  return emit(render(payload));
}

const watchdog = setTimeout(() => done(`over budget (${BUDGET_MS}ms)`), BUDGET_MS);
watchdog.unref?.();

main().then(
  () => {
    clearTimeout(watchdog);
    process.exit(0);
  },
  (err) => done(err?.message ?? String(err)),
);
