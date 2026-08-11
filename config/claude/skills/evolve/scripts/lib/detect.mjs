// What friction looks like in a transcript.
//
// Two halves, deliberately split:
//
//   accumulate(facts, events)  — cheap, incremental, runs in the Stop hook after
//                                every turn. Counts things. Judges nothing.
//   signals(facts, context)    — pure, re-runnable, derives the interesting
//                                claims from the counts whenever anybody asks.
//
// The split is what makes the hook affordable and the report honest. The hook
// pays for a few object updates per turn; the interpretation — thresholds,
// weights, which document should change — happens once, at the moment a nudge or
// a report is produced, from facts that were never thrown away. Change a
// threshold and every past session re-reads correctly, because nothing was
// decided at write time.
//
// A signal is a claim with evidence attached, and its `fingerprint` is its
// identity across sessions: stable, readable (they end up in a ledger the user
// reads), and derived only from the thing itself — never from a timestamp or a
// session id. `pnpm build failed then succeeded` is the same friction on Tuesday
// as it was on Monday, and the ledger is what stops it being proposed twice.
//
// Weights are in "how much does this justify interrupting the user" units, and
// the gate in the Stop hook sums them. The ordering matters more than the
// absolute numbers: a documented command that no longer works (4.0) is worth
// interrupting for on its own; a file read three times (0.8) never is.

/**
 * Shape of the accumulator on disk. Bump this whenever a field changes meaning;
 * `observe` throws away state from any other version rather than folding new
 * events into counts that were built by different rules. It must be read from
 * here and never written as a literal anywhere else — a mismatch does not error,
 * it silently resets the session on every single turn.
 */
export const FACTS_VERSION = 3;

/** A fresh, empty accumulator. Serialised as-is into the session state file. */
export function newFacts(meta = {}) {
  return {
    version: FACTS_VERSION,
    cwd: meta.cwd ?? null,
    sessionId: meta.sessionId ?? null,
    startedAt: meta.now ?? null,
    updatedAt: meta.now ?? null,
    // How far along the session is, measured two ways that are always present in
    // a transcript. `turn_duration` system entries would be the natural answer and
    // are not usable: some sessions emit none at all, and a gate built on them
    // silently never opens.
    prompts: 0,
    toolCalls: 0,
    /** Turns over five minutes of wall clock, when the harness reports durations
     *  at all. Never gates anything — only sharpens findings that already exist. */
    slowTurns: 0,
    // tool_use id → {name, cmd} for calls whose result has not arrived yet.
    pending: {},
    cmds: {}, // command key → {fails:[{cmd,err}], oks:[cmd], n}
    // Every shell attempt in order. The aggregate above cannot see the shape that
    // matters most — one command failing and a *different* one succeeding right
    // after — because the two have different keys by definition. This is how
    // "wrong command, then the right one" is recognised at all.
    attempts: [],
    editFails: {}, // file → count
    reads: {}, // file → count
    greps: {}, // pattern → count
    toolErrors: {}, // tool name → [message]
    hookErrors: [],
    permDenied: 0,
    lookups: [], // WebSearch/WebFetch subjects
    corrections: [], // what the user pushed back with
  };
}

/** Cap on how many tool calls may be waiting for a result before the oldest are
 *  forgotten. Interrupted turns leave calls unanswered forever. */
const PENDING_CAP = 250;

/** How many shell attempts to keep in order. Enough to span a long debugging
 *  session; small enough that the state file stays a few kilobytes. */
const ATTEMPT_LOG = 150;

/** How far after a failure to look for the command that worked instead. Beyond
 *  this the two are unrelated pieces of work that merely happened in sequence. */
const FIX_WINDOW = 8;

/**
 * Fold new events into the facts. Mutates and returns `facts`.
 */
export function accumulate(facts, evs, now = Date.now()) {
  for (const ev of evs) {
    switch (ev.kind) {
      case 'turn': {
        // Five minutes of wall clock on one turn is either a long build or a long
        // struggle. On its own it means nothing; it only ever scales a signal that
        // already exists.
        if (ev.ms > 5 * 60 * 1000) facts.slowTurns += 1;
        break;
      }
      case 'prompt': {
        facts.prompts += 1;
        const c = correction(ev.text);
        if (c) facts.corrections.push(c);
        break;
      }
      case 'tool': {
        facts.toolCalls += 1;
        const name = ev.name;
        const input = ev.input ?? {};

        if (name === 'Bash' && typeof input.command === 'string') {
          facts.pending[ev.id] = { name, cmd: input.command.slice(0, 600) };
        } else if (name === 'Read' && typeof input.file_path === 'string') {
          bump(facts.reads, short(input.file_path));
          facts.pending[ev.id] = { name, file: short(input.file_path) };
        } else if ((name === 'Grep' || name === 'Glob') && typeof input.pattern === 'string') {
          bump(facts.greps, input.pattern.slice(0, 120));
          facts.pending[ev.id] = { name };
        } else if (name === 'Edit' || name === 'Write' || name === 'NotebookEdit') {
          facts.pending[ev.id] = { name, file: short(input.file_path ?? input.notebook_path ?? '') };
        } else if (name === 'WebSearch' || name === 'WebFetch') {
          const subject = String(input.query ?? input.prompt ?? input.url ?? '').slice(0, 160);
          if (subject) facts.lookups.push(subject);
          facts.pending[ev.id] = { name };
        } else {
          facts.pending[ev.id] = { name };
        }

        // Bound the map. Tool calls whose results never arrived (interrupted
        // turns, killed sessions) would otherwise accumulate forever.
        const ids = Object.keys(facts.pending);
        if (ids.length > PENDING_CAP) {
          for (const id of ids.slice(0, ids.length - PENDING_CAP)) delete facts.pending[id];
        }
        break;
      }
      case 'result': {
        const call = facts.pending[ev.id];
        delete facts.pending[ev.id];
        if (!call) break;

        if (call.name === 'Bash' && call.cmd) {
          const key = commandKey(call.cmd);
          if (key) {
            const rec = (facts.cmds[key] ??= { fails: [], oks: [], n: 0 });
            rec.n += 1;
            if (ev.isError) {
              if (rec.fails.length < 4) rec.fails.push({ cmd: call.cmd, err: decisiveLine(ev.text) });
            } else if (rec.oks.length < 4) rec.oks.push(call.cmd);

            facts.attempts.push({
              k: key,
              bin: key.split(' ')[0],
              cmd: call.cmd.slice(0, 300),
              ok: !ev.isError,
              err: ev.isError ? decisiveLine(ev.text) : null,
            });
            if (facts.attempts.length > ATTEMPT_LOG) facts.attempts.splice(0, facts.attempts.length - ATTEMPT_LOG);
          }
        }

        if (!ev.isError) break;

        if (denied(ev.text)) {
          facts.permDenied += 1;
          break;
        }
        if ((call.name === 'Edit' || call.name === 'NotebookEdit') && call.file) {
          bump(facts.editFails, call.file);
          break;
        }
        if (call.name === 'Skill' || call.name.startsWith('mcp__')) {
          const list = (facts.toolErrors[call.name] ??= []);
          if (list.length < 4) list.push(decisiveLine(ev.text));
        }
        break;
      }
      case 'hook-error': {
        if (facts.hookErrors.length < 6) {
          facts.hookErrors.push(String(JSON.stringify(ev.detail)).slice(0, 300));
        }
        break;
      }
    }
  }
  facts.updatedAt = now;
  return facts;
}

/**
 * Derive the claims worth acting on.
 *
 * `context.docs` is the project's own documentation, already read — see
 * `loadDocs`. It is what turns "a command failed" into the much better "a command
 * this repo documents no longer works", so passing it is worth the file reads.
 */
export function signals(facts, context = {}) {
  const docs = context.docs ?? [];
  const out = [];

  // Keys already explained by a stronger finding. A command that is documented
  // and broken should be reported once, as a documentation bug — not again as a
  // retry loop that happens to involve the same command.
  const claimed = new Set();

  // Worked out once and used by two branches below: the failure→fix pairs carry
  // the only record of what the right command turned out to be when the fix was a
  // different command rather than the same one with better arguments.
  const fixes = fixPairs(facts.attempts);
  const fixByKey = new Map(fixes.map((f) => [f.from.k, f]));

  // 1. Documented and broken. The strongest thing this skill can find: the repo
  //    tells you to run something that does not work, so the fix is an edit or a
  //    deletion at a known location rather than a guess about where a note goes.
  for (const [key, rec] of Object.entries(facts.cmds)) {
    if (rec.fails.length === 0) continue;
    const documented = docs.find((d) => mentions(d.text, key));
    if (!documented) continue;
    const fail = rec.fails[0];
    claimed.add(key);
    const worked = rec.oks[0] ?? fixByKey.get(key)?.to.cmd ?? null;
    out.push({
      id: 'documented-command-failed',
      weight: 4.0,
      fingerprint: `doc-stale:${documented.rel}:${key}`,
      title: `\`${key}\` is documented in ${documented.rel} but failed here`,
      detail:
        `Ran \`${trim(fail.cmd, 160)}\` → ${fail.err}` +
        (worked ? `\nWhat worked instead: \`${trim(worked, 160)}\`` : ''),
      target: { kind: 'doc-fix', path: documented.path, rel: documented.rel },
    });
  }

  // 2. Failed, then something close to it worked. This is the shape that turns
  //    into the most useful kind of note — "to build this, run Y, not X" — and it
  //    is only visible in the ordered log, because X and Y are different commands.
  for (const fix of fixes) {
    if (claimed.has(fix.from.k)) continue;
    claimed.add(fix.from.k);
    const same = fix.from.k === fix.to.k;
    out.push({
      id: same ? 'retry-loop' : 'corrected-command',
      weight: 3.0,
      fingerprint: same ? `retry:${fix.from.k}` : `fix:${fix.from.k} -> ${fix.to.k}`,
      title: same
        ? `\`${fix.from.k}\` only worked on the second attempt`
        : `\`${fix.from.k}\` failed; \`${fix.to.k}\` is what actually works`,
      detail:
        `Failed: \`${trim(fix.from.cmd, 160)}\`\n  → ${fix.from.err}\n` + `Worked: \`${trim(fix.to.cmd, 160)}\``,
      target: { kind: 'project-note' },
    });
  }

  // 3. Failed and stayed failed. Weaker, because nothing here says what the right
  //    answer was — but twice in one session is still worth someone knowing.
  for (const [key, rec] of Object.entries(facts.cmds)) {
    if (claimed.has(key) || rec.oks.length > 0 || rec.fails.length < 2) continue;
    out.push({
      id: 'dead-end',
      weight: 2.0,
      fingerprint: `dead-end:${key}`,
      title: `\`${key}\` failed ${rec.fails.length}× and never succeeded`,
      detail: rec.fails.map((f) => `\`${trim(f.cmd, 120)}\` → ${f.err}`).join('\n'),
      target: { kind: 'project-note' },
    });
  }

  for (const c of dedupe(facts.corrections)) {
    out.push({
      id: 'user-correction',
      weight: 2.5,
      fingerprint: `correction:${c.slug}`,
      title: 'The user had to correct course',
      detail: `They said: "${trim(c.text, 220)}"`,
      // A correction says something was assumed that should have been known.
      // Which document that belongs in depends entirely on what was corrected,
      // so this one always goes to judgment.
      target: { kind: 'judge' },
    });
  }

  for (const [tool, msgs] of Object.entries(facts.toolErrors)) {
    if (msgs.length < 2 && !/^mcp__/.test(tool)) continue;
    out.push({
      id: 'tool-error',
      weight: 2.0,
      fingerprint: `tool-error:${tool}:${slug(msgs[0])}`,
      title: `\`${tool}\` errored ${msgs.length}×`,
      detail: msgs.join('\n'),
      target: { kind: 'plugin-bug', tool },
    });
  }

  if (facts.hookErrors.length > 0) {
    out.push({
      id: 'hook-error',
      weight: 2.5,
      fingerprint: `hook-error:${slug(facts.hookErrors[0])}`,
      title: `A hook failed ${facts.hookErrors.length}× this session`,
      detail: facts.hookErrors.join('\n'),
      target: { kind: 'plugin-bug' },
    });
  }

  for (const [file, n] of Object.entries(facts.editFails)) {
    if (n < 2) continue;
    out.push({
      id: 'edit-thrash',
      weight: 1.0,
      fingerprint: `edit-thrash:${file}`,
      title: `${n} edits to ${file} failed before landing`,
      detail: 'Repeated failed edits usually mean the file was not understood before it was changed.',
      target: { kind: 'judge' },
    });
  }

  const churn = Object.entries(facts.greps).filter(([, n]) => n >= 3);
  if (churn.length > 0) {
    out.push({
      id: 'search-churn',
      weight: 1.0,
      fingerprint: `search-churn:${slug(churn.map(([p]) => p).sort().join('|'))}`,
      title: `Searched for the same thing repeatedly (${churn.map(([p, n]) => `"${trim(p, 40)}" ×${n}`).join(', ')})`,
      detail: 'Hunting for the same symbol several times is a "where does X live" gap.',
      target: { kind: 'project-note' },
    });
  }

  const reread = Object.entries(facts.reads).filter(([, n]) => n >= 4);
  for (const [file, n] of reread) {
    out.push({
      id: 'reread',
      weight: 0.8,
      fingerprint: `reread:${file}`,
      title: `${file} was read ${n}× in one session`,
      detail: 'A file consulted this often is either central enough to summarise, or too big to hold.',
      target: { kind: 'judge' },
    });
  }

  if (facts.permDenied >= 2) {
    out.push({
      id: 'permission-friction',
      weight: 1.0,
      fingerprint: 'permission-friction',
      title: `${facts.permDenied} tool calls were blocked on permission`,
      detail: 'Repeated prompts for the same safe operations are an allowlist gap in settings.json.',
      target: { kind: 'settings' },
    });
  }

  if (facts.lookups.length >= 3) {
    out.push({
      id: 'knowledge-lookup',
      weight: 1.2,
      fingerprint: `lookup:${slug(facts.lookups.slice(0, 3).join('|'))}`,
      title: `${facts.lookups.length} web lookups to answer one question`,
      detail: facts.lookups.slice(0, 5).join('\n'),
      target: { kind: 'judge' },
    });
  }

  // Long turns do not create a finding, they only sharpen the ones already
  // found: a session that also spent real time struggling is a stronger case.
  if (facts.slowTurns >= 2) for (const s of out) s.weight *= 1.15;

  return out.sort((a, b) => b.weight - a.weight);
}

/**
 * Failures that were followed by a fix.
 *
 * For each failed attempt, look ahead a few attempts for one that succeeded and
 * ran the *same binary* — `pnpm build` failing and `pnpm run build:web` working is
 * one episode with a lesson in it, while `pnpm build` failing and `git status`
 * working is two unrelated events. Only the first fix per failing key is kept:
 * the point is the correction, not how many times it was rehearsed.
 */
function fixPairs(attempts = []) {
  const out = [];
  const done = new Set();
  for (let i = 0; i < attempts.length; i += 1) {
    const from = attempts[i];
    if (from.ok || done.has(from.k)) continue;
    for (let j = i + 1; j < attempts.length && j <= i + FIX_WINDOW; j += 1) {
      const to = attempts[j];
      if (!to.ok || to.bin !== from.bin) continue;
      done.add(from.k);
      out.push({ from, to });
      break;
    }
  }
  return out;
}

// ── command keys ────────────────────────────────────────────────────────────

/**
 * Commands whose failure means nothing.
 *
 * This list is load-bearing, and the reason is `grep`: a search that matches
 * nothing exits 1, the Bash tool reports any non-zero exit as an error, and
 * without this every session would look like a session full of broken commands.
 * The same is true of `test`, `diff`, `ls` on a path that might not exist, and
 * every other tool where "no" is an answer rather than a fault. Nothing on this
 * list is a build, a test, or anything a project would document, so nothing on it
 * can teach us something worth writing down.
 */
const NOISY_BINARIES = new Set(
  ('grep rg ag ack find fd fdfind ls cat bat head tail sed awk echo printf test which type command whereis stat wc ' +
    'diff cmp sort uniq tr cut dirname basename readlink realpath du df tree file sleep true false xargs tee ' +
    'ps pgrep pkill kill jq yq column paste seq date pwd whoami hostname uname env export source alias unset ' +
    'mkdir touch rm cp mv chmod chown ln clear less more open')
    .split(' '),
);

/** Binaries whose first argument is a script path, and therefore part of the
 *  command's identity: `node build.mjs` is not the same command as `node dev.mjs`. */
const RUNNERS = /^(node|nodejs|bun|bunx|deno|python|python3|py|uv|ruby|perl|php|bash|sh|zsh|fish|tsx|ts-node|npx|pnpx)$/;

/** Shell built-ins that set up a command rather than being one. A segment
 *  starting with these is skipped so the next segment gets its turn. */
const SETUP = /^(cd|pushd|popd|export|source|\.|set|shopt|eval)$/;

/**
 * The identity of a command, ignoring how it happened to be invoked.
 *
 * `cd apps/web && pnpm build --filter x 2>&1 | tail` and `pnpm build` are the
 * same intent, and treating them as one is what lets a failure and the later
 * success be recognised as a single episode. Kept to three tokens: enough to
 * separate `cargo build` from `cargo test`, not enough to be defeated by an
 * argument.
 *
 * Returns null when the command is not the sort of thing that could ever become
 * a line of documentation — a search, a redirect, a `cd`, a generated one-liner.
 */
export function commandKey(command) {
  // Each segment of a chain gets a turn, because the interesting command is
  // rarely the first: in `cd apps/web && pnpm build` the `cd` is scaffolding.
  for (const segment of String(command).split(/\s*(?:\|\||&&|;|\|)\s*/)) {
    const key = segmentKey(segment);
    if (key) return key;
  }
  return null;
}

function segmentKey(segment) {
  const s = String(segment)
    .replace(/\s*\d?>[>&]?\s*\S+/g, ' ') // > out, 2>&1, >> log
    .replace(/\s*<\s*\S+/g, ' ')
    .trim();
  if (s === '') return null;

  const tokens = s.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) ?? [];
  const out = [];

  for (let t of tokens) {
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(t)) continue; // FOO=bar prefix
    if (t.startsWith('-')) {
      // A short flag (`-j8`, `-la`) stands alone, so skipping it is safe and
      // `make -j8 build` keeps its subcommand. A long flag may take a separate
      // value — `pnpm build --filter web` — and there is no way to tell from here,
      // so collection stops rather than mistake `web` for a subcommand.
      if (/^-[A-Za-z]+\d*$/.test(t)) continue;
      break;
    }
    t = t.replace(/^['"]|['"]$/g, '');
    if (t === '') continue;

    if (out.length === 0) {
      // `sudo`, `time` and friends wrap the real command; keep looking.
      if (/^(sudo|doas|env|time|nice|nohup|exec|command|watch)$/.test(t)) continue;
      const bin = t.split('/').pop(); // /usr/bin/pnpm → pnpm
      if (SETUP.test(bin) || NOISY_BINARIES.has(bin)) return null;
      if (bin.length > 40 || !/^[A-Za-z0-9][\w.@:+-]*$/.test(bin)) return null;
      out.push(bin);
      continue;
    }

    if (RUNNERS.test(out[0]) && out.length === 1) {
      // The script being run is the command. Its directory is not.
      out.push(t.split('/').pop());
      continue;
    }
    // Subcommands only. A path, a URL or a glob is an argument, and folding those
    // into the key would make every invocation unique.
    if (t.includes('/') || !/^[A-Za-z][A-Za-z0-9._:@-]*$/.test(t)) break;
    out.push(t);
    if (out.length === 3) break;
  }

  return out.length > 0 ? out.join(' ') : null;
}

/** The one line of an error output worth quoting. */
export function decisiveLine(text) {
  const lines = String(text)
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '');
  if (lines.length === 0) return 'failed with no output';
  const hit = lines.find((l) =>
    /(^|\W)(error|fatal|failed|failure|cannot|can't|not found|no such|unknown|undefined|refused|denied|timed out|unrecognized|invalid|missing)(\W|$)/i.test(
      l,
    ),
  );
  return trim(hit ?? lines[0], 200);
}

// ── user corrections ────────────────────────────────────────────────────────

/**
 * Does this prompt read as the user putting work back on the rails?
 *
 * Tuned for precision, not recall. A false positive here is a nudge about
 * friction that never happened, which is exactly the way this skill loses the
 * user's trust; a false negative just means one session's lesson goes unlearned.
 * So: the openers only count at the very start of a prompt, and the phrases are
 * ones nobody writes about anything else.
 */
export function correction(text) {
  const t = String(text).trim();
  if (t === '' || t.length > 2000) return null;
  if (t.startsWith('<')) return null; // harness envelope, not a person

  // `stop` is deliberately absent from the openers: "stop the server when you're
  // done" is a task, not a complaint. It only counts inside the phrase list below,
  // where it has an object that makes the intent unambiguous.
  // A bare "no" is a rejection; "no idea", "no need", "no rush" are not. The
  // lookahead is the difference between a signal and an insult to the user's
  // actual message.
  const opener =
    /^(no+[,.!]|no+\s+(?!idea|clue|need|problem|worries|rush|hurry|matter|more|longer|one|thanks|way\b)|nope|nah|wrong[,.!\s]|undo\b|revert\b)/i;
  const phrase =
    /\b(that'?s (not right|not what|wrong)|that (is|was) (wrong|not right|not what)|not what i (asked|wanted|meant|said)|i (already )?(said|told you)|you (broke|forgot|ignored|missed)|don'?t do that|stop (doing|changing|adding) that|why did you (do|change|delete|remove)|read it again|i asked for)\b/i;
  const persistent = /\b(still|again)\b[^.]{0,60}\b(broken|failing|fails|failed|wrong|error|not work)/i;

  if (!opener.test(t) && !phrase.test(t) && !persistent.test(t)) return null;
  return { text: t.slice(0, 400), slug: slug(t.slice(0, 120)) };
}

// ── small helpers ───────────────────────────────────────────────────────────

const bump = (obj, k) => {
  if (k) obj[k] = (obj[k] ?? 0) + 1;
};

const trim = (s, n) => {
  const t = String(s).replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

/** Last two path segments — enough to recognise a file, short enough to read. */
function short(p) {
  const parts = String(p).split('/').filter(Boolean);
  return parts.slice(-2).join('/');
}

export function slug(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

function dedupe(items) {
  const seen = new Set();
  const out = [];
  for (const i of items) {
    if (seen.has(i.slug)) continue;
    seen.add(i.slug);
    out.push(i);
  }
  return out;
}

/** Does a document actually tell you to run this command? Matched on the tokens
 *  of the key in order, so `pnpm build` is found in `pnpm build --filter web`. */
function mentions(text, key) {
  const parts = key.split(' ').map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(`\\b${parts.join('[\\s\\\\]+')}\\b`).test(text);
}

function denied(text) {
  return /(permission|not allowed|user (has )?(denied|rejected)|requested permissions|declined)/i.test(
    String(text).slice(0, 400),
  );
}
