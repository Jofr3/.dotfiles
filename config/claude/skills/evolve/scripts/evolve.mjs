#!/usr/bin/env node
// evolve — the command line the skill reads, and the one you can read yourself.
//
//   evolve report [--fresh] [--force] [--json]     what this session has taught
//   evolve history [--days 14] [--all] [--json]    what keeps happening
//   evolve ledger [--status s] [--json]            what has already been decided
//   evolve decide <fingerprint> <applied|declined|deferred> [--note …] [--path …]
//   evolve sweep                                   drop stale state
//   evolve doctor                                  paths, thresholds, wiring
//
// `report` is the live session; `history` is the case for a bigger change. A
// finding that appears in one session is a note to write down. The same
// fingerprint across four sessions is the argument for a skill, and `history` is
// what makes that argument out loud instead of from memory.
//
// Nothing here edits a document. Deciding what to change and writing it is the
// skill's job, with the user in the loop; this program only observes, remembers
// verdicts, and refuses to repeat itself.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import * as store from './lib/store.mjs';
import * as review from './lib/review.mjs';
import { newFacts, accumulate, signals as deriveSignals } from './lib/detect.mjs';
import { readTail, events } from './lib/transcript.mjs';

const argv = process.argv.slice(2);
const cmd = argv[0] ?? 'report';
const flags = parseFlags(argv.slice(1));
const p = store.paths();
const now = Date.now();

try {
  switch (cmd) {
    case 'report':
      await report();
      break;
    case 'history':
      await history();
      break;
    case 'ledger':
      ledger();
      break;
    case 'decide':
      decide();
      break;
    case 'sweep':
      out(store.sweep(p, now), (r) => `dropped ${r.sessions} session file(s), ${r.proposals} stale entr(ies)`);
      break;
    case 'doctor':
      doctor();
      break;
    case 'help':
    case '--help':
    case '-h':
      usage();
      break;
    default:
      fail(`unknown command: ${cmd}`);
  }
} catch (err) {
  fail(err?.stack ?? String(err));
}

// ── report ──────────────────────────────────────────────────────────────────

async function report() {
  const cwd = flags.cwd ?? process.cwd();
  const transcript = flags.transcript
    ? review.absolute(flags.transcript)
    : review.findTranscript({ cwd, sessionId: flags.session });
  if (!transcript) return fail(`no transcript found for ${cwd}`);

  const sessionId = flags.session ?? review.sessionIdFromPath(transcript);

  // --fresh re-reads the whole transcript from byte zero. The Stop hook has
  // usually done this incrementally already, but a manual run in a session that
  // started before the hook existed has nothing accumulated.
  if (flags.fresh) store.writeSession(p, sessionId, { offset: 0, nudges: 0, lastNudgeAt: 0, facts: newFacts({ cwd, sessionId, now }) });

  const state = review.observe(p, { sessionId, transcriptPath: transcript, cwd, now });
  if (!state) return fail(`could not read ${transcript}`);

  const a = review.assess(p, state, { now, force: flags.force });

  if (flags.json) return console.log(JSON.stringify({ sessionId, cwd, transcript, ...a, facts: state.facts }, null, 2));

  const f = state.facts;
  console.log(`# evolve — session report`);
  console.log(`\n${f.prompts} prompt(s), ${f.toolCalls} tool calls · ${cwd}`);
  console.log(`score ${a.score} (gate ${review.gate.threshold}) · ${a.fire ? 'worth raising' : `holding: ${a.reason}`}`);

  if (a.signals.length === 0) {
    console.log('\nNo friction detected. Nothing to propose.');
    return;
  }

  console.log(`\n## Findings\n`);
  for (const s of a.signals) console.log(renderSignal(s));

  const quiet = a.signals.filter((s) => !s.counts);
  if (quiet.length > 0) {
    console.log(
      `\n${quiet.length} finding(s) above are already settled in the ledger (${[...new Set(quiet.map((s) => s.status))].join(', ')}) — do not re-propose them.`,
    );
  }
  console.log(`\nRun \`evolve history\` to see which of these keep coming back.`);
}

function renderSignal(s) {
  const tags = [
    `\`${s.fingerprint}\``,
    `weight ${s.weight}`,
    s.recurring ? `**seen in ${s.sessions} sessions**` : null,
    s.status !== 'new' && s.status !== 'seen' ? `ledger: ${s.status}` : null,
    s.regressed ? '**regressed after a fix**' : null,
    s.counts ? null : 'not counted',
  ].filter(Boolean);
  const target =
    s.target?.kind === 'doc-fix'
      ? `fix or delete the stale part of ${s.target.rel}`
      : s.target?.kind === 'project-note'
        ? "a short note in the project's CLAUDE.md"
        : s.target?.kind === 'plugin-bug'
          ? `a bug in ${s.target.tool ?? 'a plugin/hook'}`
          : s.target?.kind === 'settings'
            ? 'a permissions entry in settings.json'
            : 'judgment required — decide where this belongs';
  return [`### ${s.title}`, tags.join(' · '), '', s.detail, '', `→ candidate: ${target}`, ''].join('\n');
}

// ── history ─────────────────────────────────────────────────────────────────

async function history() {
  const days = Number(flags.days ?? 14);
  const cwd = flags.cwd ?? process.cwd();
  const root = review.projectsRoot();
  const since = now - days * 86_400_000;

  const files = [];
  const { readdirSync, statSync } = await import('node:fs');
  // One project by default — resolved by walking up from cwd, so a subdirectory
  // still finds its project's sessions. `--all` crosses every project.
  const dirs = flags.all
    ? safeList(readdirSync, root).map((d) => join(root, d))
    : [review.projectDir(cwd, root)].filter(Boolean);
  if (dirs.length === 0) return fail(`no recorded sessions for ${cwd}`);
  for (const dir of dirs) {
    const d = dir.split('/').pop();
    for (const name of safeList(readdirSync, dir)) {
      if (!name.endsWith('.jsonl')) continue;
      const file = join(dir, name);
      try {
        const st = statSync(file);
        if (st.mtimeMs >= since) files.push({ file, project: d, mtime: st.mtimeMs, size: st.size });
      } catch {}
    }
  }
  files.sort((a, b) => b.mtime - a.mtime);
  const scanned = files.slice(0, Number(flags.limit ?? 30));

  const agg = new Map();
  for (const { file, project } of scanned) {
    const sessionId = review.sessionIdFromPath(file);
    const projectCwd = flags.all ? null : cwd;
    const facts = newFacts({ cwd: projectCwd, sessionId, now });
    const { entries } = readTail(file, 0);
    accumulate(facts, events(entries), now);
    const sigs = deriveSignals(facts, { docs: projectCwd ? review.loadDocs(projectCwd) : [] });
    if (sigs.length > 0) store.recordSeen(p, sigs, sessionId, now);
    for (const s of sigs) {
      const rec = agg.get(s.fingerprint) ?? { ...s, sessions: new Set(), projects: new Set() };
      rec.sessions.add(sessionId);
      rec.projects.add(project);
      rec.title = s.title;
      agg.set(s.fingerprint, rec);
    }
  }

  const l = store.readLedger(p);
  const rows = [...agg.values()]
    .map((r) => ({
      fingerprint: r.fingerprint,
      signal: r.id,
      title: r.title,
      detail: r.detail,
      sessions: r.sessions.size,
      projects: [...r.projects].length,
      status: store.verdict(l, r.fingerprint, now).status,
      weight: r.weight,
    }))
    .sort((a, b) => b.sessions - a.sessions || b.weight - a.weight);

  if (flags.json) return console.log(JSON.stringify({ days, scanned: scanned.length, rows }, null, 2));

  console.log(`# evolve — ${days}-day history (${scanned.length} session(s) scanned)\n`);
  const recurring = rows.filter((r) => r.sessions >= 2);
  if (recurring.length === 0) {
    console.log('Nothing has recurred across sessions. Anything found today is a one-off so far.');
  } else {
    console.log(`## Recurring — the case for a real change\n`);
    for (const r of recurring) {
      console.log(`- **${r.title}** — ${r.sessions} sessions · \`${r.fingerprint}\` · ledger: ${r.status}`);
    }
    console.log(
      `\nA finding in 3+ sessions has outgrown a note: consider a skill, a script, or a fix to the tool itself.`,
    );
  }
  const once = rows.filter((r) => r.sessions < 2);
  if (once.length > 0) console.log(`\n${once.length} one-off finding(s) not listed.`);
}

// ── ledger ──────────────────────────────────────────────────────────────────

function ledger() {
  const l = store.readLedger(p);
  const rows = Object.entries(l.proposals)
    .map(([fingerprint, rec]) => ({ fingerprint, ...rec, sessions: rec.sessions?.length ?? 0 }))
    .filter((r) => !flags.status || r.status === flags.status)
    .sort((a, b) => (b.lastSeen ?? 0) - (a.lastSeen ?? 0));

  if (flags.json) return console.log(JSON.stringify({ proposals: rows, projects: l.projects }, null, 2));
  if (rows.length === 0) return console.log('ledger is empty');
  for (const r of rows) {
    const when = r.lastSeen ? new Date(r.lastSeen).toISOString().slice(0, 16).replace('T', ' ') : '—';
    console.log(`${(r.status ?? 'seen').padEnd(9)} ${String(r.sessions).padStart(2)}s  ${when}  ${r.fingerprint}`);
    if (r.note) console.log(`          note: ${r.note}`);
    if (r.appliedTo) console.log(`          applied to: ${r.appliedTo}`);
  }
}

function decide() {
  const fingerprint = argv[1];
  const status = argv[2];
  if (!fingerprint || !['applied', 'declined', 'deferred'].includes(status)) {
    return fail('usage: evolve decide <fingerprint> <applied|declined|deferred> [--note …] [--path …] [--days N]');
  }
  // The session the decision was made in, so the rest of it does not mistake its
  // own accumulated evidence for the fix having failed. Best effort: the caller
  // may pass it, otherwise it is the newest transcript for this directory.
  const session =
    flags.session ??
    review.sessionIdFromPath(review.findTranscript({ cwd: flags.cwd ?? process.cwd() }) ?? '') ??
    undefined;

  const rec = store.decide(
    p,
    fingerprint,
    status,
    { note: flags.note, appliedTo: flags.path, session, days: flags.days ? Number(flags.days) : undefined },
    now,
  );
  out({ fingerprint, ...rec }, () => `${fingerprint} → ${status}`);
}

// ── doctor ──────────────────────────────────────────────────────────────────

function doctor() {
  const settingsPath = join(process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude'), 'settings.json');
  let wired = { stop: false, prompt: false };
  try {
    const s = readFileSync(settingsPath, 'utf8');
    wired = { stop: /evolve\/hooks\/stop-observe\.mjs/.test(s), prompt: /evolve\/hooks\/prompt-nudge\.mjs/.test(s) };
  } catch {}

  const l = store.readLedger(p);
  const counts = {};
  for (const rec of Object.values(l.proposals)) counts[rec.status ?? 'seen'] = (counts[rec.status ?? 'seen'] ?? 0) + 1;

  const info = {
    home: p.home,
    ledger: p.ledger,
    gate: review.gate,
    hooks: wired,
    ledgerCounts: counts,
    transcript: review.findTranscript({ cwd: flags.cwd ?? process.cwd() }),
  };
  if (flags.json) return console.log(JSON.stringify(info, null, 2));
  console.log(`state       ${info.home}`);
  console.log(
    `gate        threshold ${info.gate.threshold} · cooldown ${info.gate.cooldownMs / 60000}min · ` +
      `floor ${info.gate.minToolCalls} tool calls or ${info.gate.minPrompts} prompts · ` +
      `max ${info.gate.maxPerSession}/session`,
  );
  console.log(`hooks       Stop: ${wired.stop ? 'wired' : 'MISSING'} · UserPromptSubmit: ${wired.prompt ? 'wired' : 'MISSING'}`);
  console.log(`ledger      ${Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(' ') || 'empty'}`);
  console.log(`transcript  ${info.transcript ?? 'not found'}`);
}

// ── plumbing ────────────────────────────────────────────────────────────────

function parseFlags(args) {
  const f = {};
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = args[i + 1];
    if (next === undefined || next.startsWith('--')) f[key] = true;
    else {
      f[key] = next;
      i += 1;
    }
  }
  return f;
}

function safeList(readdirSync, dir) {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

function out(value, human) {
  console.log(flags.json ? JSON.stringify(value, null, 2) : human(value));
}

function usage() {
  console.log(
    `evolve — session self-improvement observer

  report [--fresh] [--force] [--json] [--session ID] [--cwd DIR]
  history [--days N] [--all] [--limit N] [--json]
  ledger [--status seen|applied|declined|deferred] [--json]
  decide <fingerprint> <applied|declined|deferred> [--note TEXT] [--path FILE] [--days N]
  sweep
  doctor [--json]`,
  );
}

function fail(msg) {
  process.stderr.write(`evolve: ${msg}\n`);
  process.exitCode = 1;
}
