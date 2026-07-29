#!/usr/bin/env node
// Headless build loop: one fresh `claude -p` session per slice.
//
// Context isolation is structural — each slice is a separate process and session, so
// nothing crosses between them except STATE.json.
//
// The interesting part is failure triage. "The slice didn't finish" has several causes
// that need opposite responses, and treating them alike either burns your quota retrying
// something that can't work, or gives up on something that just needed to wait:
//
//   limit       usage/rate limit    -> WAIT and retry (resuming the session, not restarting)
//   transient   529/500/overloaded  -> exponential backoff, retry
//   oversized   ran out of turns    -> BLOCK; the slice needs splitting, retrying repeats it
//   permission  tool was denied     -> BLOCK; a retry denies again
//   incomplete  verify never passed -> STOP; needs a human
//
// Usage:
//   node loop.mjs [--max N] [--budget USD] [--dry] [--limit-wait-max SECONDS]
//                 [--fallback-model m1,m2]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const BUILD_DIR = path.dirname(fileURLToPath(import.meta.url));
const STATE_PATH = path.join(BUILD_DIR, 'STATE.json');
const LOGS = path.join(BUILD_DIR, 'logs');
const STOP_FILE = path.join(BUILD_DIR, 'STOP');

const flag = (n, d = null) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : d;
};
const has = (n) => process.argv.includes(`--${n}`);

const MAX_SLICES     = Number(flag('max', 99));
const BUDGET_USD     = Number(flag('budget', 0)) || Infinity;
const DRY            = has('dry');
const LIMIT_WAIT_MAX = Number(flag('limit-wait-max', 6 * 3600));   // give up waiting after 6h
const LIMIT_POLL     = Number(flag('limit-poll', 600));            // re-probe every 10 min
const MAX_TRANSIENT  = 5;
const FALLBACK       = flag('fallback-model');

// Everything the 23 verify commands and `mem-build done` need, and nothing else.
// Pipelines are covered: `echo '{...}' | node hooks/x.mjs` passes under Bash(node:*).
const ALLOWED_TOOLS = flag('allowed-tools',
  'Read Write Edit Glob Grep Bash(node:*) Bash(npm:*) Bash(chmod:*) Bash(test:*) Bash(mkdir:*) Bash(ls:*) Bash(cat:*)');

const readState  = () => JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
const writeState = (s) => {
  const tmp = `${STATE_PATH}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(s, null, 2)}\n`);
  fs.renameSync(tmp, STATE_PATH);
};
const nextSlice = (s) => s.slices.find((x) => x.status === 'todo' || x.status === 'in_progress');
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const hhmm = (s) => (s >= 3600 ? `${(s / 3600).toFixed(1)}h` : `${Math.round(s / 60)}m`);
const log = (m) => process.stdout.write(`${m}\n`);

function classify({ result, code, stderr = '' }) {
  const status = result?.api_error_status;

  // Only ever regex the assistant's text and stderr — never the raw result JSON. Every
  // result envelope carries an `api_error_status` key, so matching /api_error/ against the
  // raw log is true on every single run and silently collapses all triage into "transient".
  const text = `${result?.result ?? ''}\n${stderr}`;

  // Structured signals first: they are unambiguous, and a session can report subtype
  // "success" while having been denied every tool it needed.
  if (result?.permission_denials?.length) return 'permission';
  if (status === 429) return 'limit';
  if ([500, 502, 503, 504, 529].includes(status)) return 'transient';
  if (result?.subtype === 'error_max_turns') return 'oversized';

  if (/usage limit|rate.?limit|quota (exceeded|reached)/i.test(text)) return 'limit';
  if (/\boverloaded\b|ECONNRESET|ETIMEDOUT|socket hang up/i.test(text)) return 'transient';
  if (/context (window )?(exceeded|limit)|prompt is too long/i.test(text)) return 'oversized';

  if (code !== 0) return 'transient';   // unknown non-zero: retryable once, budget caps it
  return 'incomplete';
}

function runSlice(slice, state) {
  fs.mkdirSync(LOGS, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const logFile = path.join(LOGS, `slice-${slice.id}-${stamp}.json`);

  // acceptEdits auto-accepts file writes but NOT Bash, and every slice's verify command —
  // plus `mem-build done` itself — is a shell command. Without this allowlist a slice does
  // the work and then has no way to land it: 13 denials, ledger never advances, and the
  // loop retries something that can never succeed. Narrow allowlist beats bypassPermissions.
  const args = [
    '-p', '--permission-mode', 'acceptEdits', '--output-format', 'json',
    '--allowedTools', ALLOWED_TOOLS,
  ];
  if (FALLBACK) args.push('--fallback-model', FALLBACK);

  // Resume rather than restart when a previous attempt was cut off mid-slice: the files it
  // already wrote are on disk, and replaying the prompt cold makes the model rediscover them.
  let prompt;
  if (slice.session_id) {
    args.push('--resume', slice.session_id);
    log(`    resuming session ${slice.session_id.slice(0, 8)}…`);
    prompt = 'Continue where you left off. Some of this slice may already be done — check the '
      + 'filesystem before rewriting anything.';
  } else {
    const p = spawnSync(process.execPath, [path.join(BUILD_DIR, 'mem-build'), 'prompt'], { encoding: 'utf8' });
    if (p.status !== 0 || !p.stdout?.trim()) throw new Error('could not build slice prompt');
    prompt = p.stdout;
  }

  // The prompt goes on stdin, never as a positional argument. `--allowedTools` is variadic
  // (`<tools...>`), so a trailing positional gets swallowed as another tool name and claude
  // exits with "Input must be provided". stdin sidesteps every such ordering hazard.
  const r = spawnSync('claude', args, {
    cwd: state.root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, input: prompt,
  });
  const stdout = r.stdout ?? '';
  const stderr = r.stderr ?? '';
  fs.writeFileSync(logFile, `${stdout}\n${stderr}`);

  let result = null;
  try { result = JSON.parse(stdout); } catch { /* not JSON: fall back to text signals */ }
  // When stdout isn't parseable JSON it is itself an error message, so it counts as text.
  return { result, code: r.status ?? 1, stderr: result ? stderr : `${stdout}\n${stderr}`, logFile };
}

// ── main ────────────────────────────────────────────────────────────────────────────────
let spent = 0;
let transientStreak = 0;
let limitWaited = 0;

for (let i = 1; i <= MAX_SLICES; i++) {
  if (fs.existsSync(STOP_FILE)) { fs.unlinkSync(STOP_FILE); log('==> STOP file present, halting.'); break; }

  const state = readState();
  if (state.slices.some((s) => s.status === 'blocked')) {
    log('==> A slice is blocked. Resolve it, then `mem-build reset <id>`.');
    break;
  }
  const slice = nextSlice(state);
  if (!slice) { log('==> All slices complete.'); break; }

  if (spent >= BUDGET_USD) { log(`==> Budget reached ($${spent.toFixed(2)}). Stopping.`); break; }

  log('');
  log('='.repeat(62));
  log(`  slice ${slice.id} — ${slice.title}   (iteration ${i}/${MAX_SLICES})`);
  if (BUDGET_USD !== Infinity) log(`  spent $${spent.toFixed(2)} of $${BUDGET_USD.toFixed(2)}`);
  log('='.repeat(62));

  if (DRY) {
    log(spawnSync(process.execPath, [path.join(BUILD_DIR, 'mem-build'), 'prompt'], { encoding: 'utf8' }).stdout);
    log('--- dry run, nothing executed ---');
    break;
  }

  const run = runSlice(slice, state);
  spent += run.result?.total_cost_usd ?? 0;
  if (run.result) {
    log(`    turns=${run.result.num_turns ?? '?'} `
      + `cost=$${(run.result.total_cost_usd ?? 0).toFixed(3)} `
      + `${((run.result.duration_ms ?? 0) / 1000).toFixed(0)}s`);
  }

  // Did the ledger advance? That, not the exit code, is the definition of done —
  // `mem-build done` only advances after re-running the slice's verify command itself.
  const after = readState();
  if (nextSlice(after)?.id !== slice.id) {
    log(`==> ✔ slice ${slice.id} complete`);
    transientStreak = 0;
    limitWaited = 0;
    if (after.slices.find((s) => s.id === slice.id)?.session_id) {
      const st = readState();
      delete st.slices.find((s) => s.id === slice.id).session_id;
      writeState(st);
    }
    continue;
  }

  // Remember the session so a retry resumes instead of restarting.
  if (run.result?.session_id) {
    const st = readState();
    st.slices.find((s) => s.id === slice.id).session_id = run.result.session_id;
    writeState(st);
  }

  const kind = classify(run);

  if (kind === 'limit') {
    if (limitWaited >= LIMIT_WAIT_MAX) {
      log(`==> Still rate-limited after ${hhmm(limitWaited)}. Giving up; re-run when it clears.`);
      break;
    }
    log(`==> Usage limit hit. Waiting ${hhmm(LIMIT_POLL)} then resuming slice ${slice.id}.`);
    log(`    (waited ${hhmm(limitWaited)} of ${hhmm(LIMIT_WAIT_MAX)} max — Ctrl-C is safe, `
      + 'state is on disk and the session resumes.)');
    sleep(LIMIT_POLL * 1000);
    limitWaited += LIMIT_POLL;
    i--;                       // a wait is not an attempt
    continue;
  }

  if (kind === 'transient') {
    transientStreak++;
    if (transientStreak > MAX_TRANSIENT) {
      log(`==> ${MAX_TRANSIENT} consecutive API errors. Stopping. Log: ${run.logFile}`);
      break;
    }
    const back = Math.min(30 * 2 ** (transientStreak - 1), 480);
    log(`==> API error (attempt ${transientStreak}/${MAX_TRANSIENT}). Retrying in ${back}s.`);
    sleep(back * 1000);
    i--;
    continue;
  }

  if (kind === 'oversized' || kind === 'permission') {
    const note = kind === 'oversized'
      ? 'Ran out of turns / context. This slice is too big — split it in STATE.json before retrying.'
      : `Tool permission denied: ${(run.result.permission_denials || []).map((d) => d.tool_name).join(', ')}`;
    spawnSync(process.execPath, [path.join(BUILD_DIR, 'mem-build'), 'fail', '--note', note], { stdio: 'inherit' });
    log(`    log: ${run.logFile}`);
    break;
  }

  log(`==> Slice ${slice.id} did not complete and verify never passed.`);
  log(`    Log: ${run.logFile}`);
  log('    Not retrying automatically — inspect, fix, re-run.');
  process.exitCode = 1;
  break;
}

spawnSync(process.execPath, [path.join(BUILD_DIR, 'mem-build'), 'status'], { stdio: 'inherit' });
if (spent) log(`\ntotal spent this run: $${spent.toFixed(2)}`);
