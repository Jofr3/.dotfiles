---
name: evolve
description: >
  Turn friction from the current session into a durable improvement to the setup —
  a note in CLAUDE.md, a fix to a stale doc, a new or edited skill, a plugin bug,
  a permissions entry — and record the verdict so nothing is ever proposed twice.
  Invoke when an `<evolve-observation>` block appears in context; when the user
  types /evolve or asks "what did we learn", "should we write this down",
  "capture this in CLAUDE.md", "improve your own setup", "why did that take so
  long"; or when a command needed several attempts, a documented command turned
  out to be wrong, the user had to correct course, or the same friction is
  recognised from earlier sessions. Also use to audit whether existing skills,
  docs or CLAUDE.md sections have gone stale and should be edited or deleted.
version: 1.0.0
---

# Evolve

A session that struggled and then succeeded knows something the setup does not. This
skill is how that knowledge gets out of the transcript and into a file that will still
be there next month — and, just as often, how a piece of documentation that has started
lying gets deleted.

A Stop hook watches every turn and scores the friction; when the score clears a gate and
a cooldown has passed, the next prompt arrives carrying an `<evolve-observation>` block.
That block is the automatic entry point. `/evolve` is the manual one, and it works at any
time regardless of the gate.

**The bias is silence.** Most sessions have some friction and almost none of it is worth
a permanent change. Proposing a change nobody wanted is worse than missing one: it costs
the user's attention now, and every future session pays to read whatever got written.

## Workflow

1. **Answer the user first.** An observation is background. Never open a reply with it,
   never let it displace the actual request. Raise it at the end, in two or three lines.

2. **Get the evidence.** The nudge is a summary; the report is the case.
   ```sh
   node ~/.claude/skills/evolve/scripts/evolve.mjs report          # this session
   node ~/.claude/skills/evolve/scripts/evolve.mjs history         # what keeps recurring
   ```
   Add `--fresh` if the session predates the hook, `--force` to score a quiet session
   anyway. `history --all` crosses projects. Use `report --json` when you want the raw
   facts rather than the rendered case.

3. **Apply the bar** (below). Usually the answer is "none of these". That is a complete
   and correct outcome — record it and move on.

4. **Read the target file before proposing anything.** Non-negotiable. Half of all
   candidate findings die here, because the thing is already documented and the real
   problem was that nobody read it — or because the section that needs fixing says
   something subtly different from what you assumed.

5. **Propose at most two changes, as a concrete diff.** Show the exact lines. Name the
   file. Say in one sentence what friction it prevents. Then ask. Never write to
   CLAUDE.md, a doc, a skill, or settings.json without approval in the same turn.

6. **Record the verdict, always.** This is what stops the skill nagging.
   ```sh
   evolve decide "<fingerprint>" applied  --path CLAUDE.md --note "documented the build alias"
   evolve decide "<fingerprint>" declined --note "one-off, the flag was mistyped"
   evolve decide "<fingerprint>" deferred --days 7
   ```
   `declined` is permanent: the finding stops contributing to any future score at all.
   Use it freely — including for everything you chose not to raise.

## The bar

Propose a change only when **all five** hold:

1. **It will happen again.** Either the ledger already shows it in 2+ sessions, or the
   cause is structural (a build alias, a required env var, a non-obvious layout) and
   certain to recur. One stumble is not a pattern.
2. **Writing it down would have prevented it.** Test this honestly. A command that
   failed because of a typo, a flaky network, or a file that was not read carefully
   enough is not a documentation gap — no note would have changed the outcome.
3. **It is not already written down.** You have read the file by now (step 4).
4. **It is durable.** True next month, not just for this task. A one-off instruction
   belongs in the conversation, not in a file.
5. **It earns its tokens.** Every line in CLAUDE.md is read by every future session in
   that project. If it saves less than it costs to read, it is a net loss.

Never propose: generic advice ("write tests", "handle errors"), anything the code makes
obvious, style rules the user has not expressed, restating a tool's own error message, or
a note about a mistake that was yours rather than the setup's.

**Durable *user* preferences go to mem, not to a file.** "Always use bun", "never commit
without asking" — those are `mem:remember`, and writing them into a project CLAUDE.md is
the wrong home for them.

## Where the change belongs

| What was found | Where it goes |
|---|---|
| A documented command that failed (`doc-stale:…`) | **Fix or delete the wrong lines** in that exact file. Never append a correction beside a falsehood. |
| Wrong command, then the right one (`fix:…`) | Project `CLAUDE.md` — the command, and the one it is mistaken for |
| Same command failed then worked (`retry:…`) | Project `CLAUDE.md`, if the difference was non-obvious |
| Failed and never worked (`dead-end:…`) | Usually nothing yet — one more session decides it |
| The user corrected course (`correction:…`) | Depends entirely on what was corrected. A preference → mem. A repo fact → CLAUDE.md. A misread instruction → fix the instruction's wording |
| Repeated searching for the same thing (`search-churn:…`) | One line in CLAUDE.md saying where that thing lives |
| A file read four times (`reread:…`) | Weak. Sometimes a pointer; more often nothing |
| An MCP or Skill tool erroring (`tool-error:…`) | A **bug in that plugin's code** — these are local and editable under `~/.claude/skills/`. Read the failing script |
| A hook failing (`hook-error:…`) | Same: fix the hook, or unwire it from `settings.json` |
| Repeated permission prompts (`permission-friction`) | An allowlist entry in `settings.json`, or hand off to the `fewer-permission-prompts` skill |
| Several web lookups to answer one question | If the answer is durable and project-specific, `docs/`. If it is a repeatable procedure, a skill |

**Escalation ladder.** Same finding, more sessions, bigger response:

- **1 session** — nothing, unless it is a documented command that broke.
- **2 sessions** — a note, in the smallest file that covers it.
- **3+ sessions** — a note is not working. Propose a **skill**, a script that removes the
  problem, or a fix to the tool itself. Say plainly that the earlier note failed.

**Deletion is a first-class outcome.** Propose removing: a section contradicted by what
actually happened; instructions for a command, path, or flag that no longer exists; a
skill whose description never matches when it should fire; anything duplicated in two
files where the copies have drifted. A CLAUDE.md that has grown to hundreds of lines of
half-true prose is a live cost to every session in that repo.

## Writing the change

For a CLAUDE.md note: **five lines maximum**, imperative, the exact command in
backticks, and the failure it prevents. Put it under a heading that already exists.

```md
## Commands
- Build with `pnpm run build:app`. Plain `pnpm build` is not a script and fails.
```

No preamble, no rationale paragraph, no "as of 2026". If it needs more than five lines it
belongs in `docs/` with one line in CLAUDE.md pointing at it.

For a new skill, read `references/targets.md` — a skill is a bigger commitment than a
note and it has its own bar, starting with a description that actually triggers.

## References

- `references/signals.md` — every detector, what it means, its false-positive traps, and
  the environment variables that tune the gate.
- `references/targets.md` — how to write each kind of change: CLAUDE.md, docs, a new
  skill, a plugin fix, settings, and how to decide something should be deleted.

## Tuning and turning it off

`EVOLVE_DISABLE=1` silences both hooks. The gate is set by `EVOLVE_THRESHOLD` (default
4.0), `EVOLVE_COOLDOWN_MIN` (240), `EVOLVE_MIN_TOOL_CALLS` (12), `EVOLVE_MIN_PROMPTS`
(3), `EVOLVE_MAX_PER_SESSION` (1) and `EVOLVE_HARD_THRESHOLD` (10). `EVOLVE_DEBUG=1`
makes each hook explain on stderr why it stayed quiet.

If the user says the nudges are too frequent, raise the threshold or the cooldown rather
than promising to be more careful — the gate is the mechanism, not your judgement.

State lives in `~/.claude/evolve/` (`ledger.json` is meant to be read and hand-edited;
deleting an entry makes that finding proposable again). `evolve doctor` shows paths,
thresholds and whether the hooks are wired.

The test suite runs with the glob, not the directory — `node --test <dir>` fails on this
Node build:

```sh
node --test "$HOME/.claude/skills/evolve/tests/*.test.mjs"
```
