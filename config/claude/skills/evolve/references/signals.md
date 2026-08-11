# The signals, and what they are worth

Every finding comes from `scripts/lib/detect.mjs`, carries a weight, and has a
**fingerprint** — a stable, readable identity like `fix:pnpm build -> pnpm run build:app`.
The fingerprint is what the ledger remembers, so the same friction is recognised across
sessions and a decline lasts forever.

The Stop hook sums the weights of everything not already settled. At 4.0 it speaks.

| Signal | Weight | Means | Trap |
|---|---|---|---|
| `documented-command-failed` | 4.0 | A command written down in `CLAUDE.md`, `AGENTS.md` or `docs/` failed when run | The doc may be right and the invocation wrong — read the surrounding lines before calling it stale. It may also be conditional ("after `nix develop`") |
| `corrected-command` | 3.0 | One command failed, a different one with the same binary worked right after | The second command may be a different job that merely followed, not a correction. Check the two are really the same intent |
| `retry-loop` | 3.0 | The same command failed, then succeeded with different arguments | Sometimes the first run legitimately fails (a fresh clone with no `node_modules`). That is a setup step, not a wrong command |
| `user-correction` | 2.5 | The user pushed back: "no…", "that's wrong", "i said…", "still failing" | Tuned for precision and still fallible. Read what they actually said before treating it as a lesson |
| `hook-error` | 2.5 | A configured hook failed during the session | Almost always a real bug and worth fixing, because a broken hook fails silently forever |
| `dead-end` | 2.0 | A command failed twice and never worked | Nothing here says what the right answer is, so there may be nothing to write yet |
| `tool-error` | 2.0 | An MCP tool or `Skill` invocation errored | Distinguish a bug in the plugin from being called wrong. Both are fixable; they are fixed in different places |
| `knowledge-lookup` | 1.2 | Three or more web lookups to settle one question | Only worth capturing if the answer is durable *and* project-specific. General knowledge does not belong in a repo |
| `edit-thrash` | 1.0 | Two or more failed edits to one file | Usually says the file was not read carefully — a process problem, not a documentation gap |
| `search-churn` | 1.0 | The same search pattern run three or more times | Genuine "where does X live" gaps hide here, but so does ordinary exploration |
| `permission-friction` | 1.0 | Two or more calls blocked on permission | The `fewer-permission-prompts` skill does this job properly |
| `reread` | 0.8 | One file read four or more times | Weakest signal. Rarely actionable on its own |

Two modifiers apply on top:

- **Recurrence, ×1.5** — the fingerprint has been seen in two or more distinct *sessions*.
  Counted per session, never per occurrence: the same command failing eight times in one
  afternoon is one bad afternoon, while once a week for three weeks is a missing document.
- **Regression, ×1.2** — the fingerprint was marked `applied` and has come back. The note
  that was written did not work, which is more interesting than a fresh finding, not less.

A session with several slow turns (over five minutes) scales every finding by 1.15, when
the harness reports durations at all — some sessions emit none.

## What is deliberately not detected

- **`grep`, `rg`, `find`, `test`, `ls`, `diff` and friends failing.** Non-zero exit is an
  ordinary answer for these, and the Bash tool reports it as an error. Filtering them is
  the difference between a usable skill and one that screams every session. The full list
  is `NOISY_BINARIES` in `detect.mjs`.
- **Subagent traffic.** `isSidechain` entries are dropped. A subagent's failed command is
  not friction the user can fix in their config.
- **Harness-generated messages.** Task notifications, hook output and slash-command bodies
  arrive on the same event as human prompts; only `origin.kind === "human"` counts, which
  is what keeps a task notification from being read as a complaint.
- **Token cost, model choice, timing.** Interesting, but not friction this skill can fix.
  `session-report` covers that ground.

## The ledger

`~/.claude/evolve/ledger.json`, one entry per fingerprint:

| Status | Effect |
|---|---|
| `seen` | Observed, never proposed. Counts toward the score |
| `applied` | Fixed. Silent unless it recurs, which is then flagged as a regression |
| `declined` | The user said no. **Excluded from scoring entirely** — it cannot even help trigger a nudge |
| `deferred` | Not now. Silent until `deferUntil` passes (three days by default) |

Undecided entries are swept after 120 days; verdicts are kept indefinitely. Deleting an
entry by hand makes that finding proposable again — the right way to undo a regretted
`declined`.

## Tuning the gate

| Variable | Default | Effect |
|---|---|---|
| `EVOLVE_DISABLE` | unset | Any value silences both hooks completely |
| `EVOLVE_THRESHOLD` | 4.0 | Score needed to speak |
| `EVOLVE_COOLDOWN_MIN` | 240 | Per-project quiet period after a nudge |
| `EVOLVE_MIN_TOOL_CALLS` | 12 | Activity floor (either this or the prompt floor) |
| `EVOLVE_MIN_PROMPTS` | 3 | Activity floor, the other half |
| `EVOLVE_MAX_PER_SESSION` | 1 | Interruptions allowed per session |
| `EVOLVE_HARD_THRESHOLD` | 10 | A score this high overrides cooldown and cap |
| `EVOLVE_DEBUG` | unset | Each hook explains on stderr why it stayed quiet |
| `EVOLVE_HOME` | `~/.claude/evolve` | Where state lives |

## How the plumbing fits together

```
turn ends ──▶ Stop: stop-observe.mjs
                 reads only the new bytes of the transcript
                 folds them into ~/.claude/evolve/sessions/<id>.json
                 scores against the ledger
                 under the gate?  ──▶ exits silently (the usual case)
                 over it?         ──▶ writes pending/<id>.json
                                        │
user types ──▶ UserPromptSubmit: prompt-nudge.mjs
                 finds the pending file, deletes it, injects
                 <evolve-observation> alongside the prompt
                                        │
                                    this skill
```

The Stop hook cannot speak: on that event a JSON body carrying `decision: "block"` forces
the model to keep working, so anything written to stdout risks an invisible loop. It arms
a nudge instead, and the next prompt delivers it. That indirection is also the polite
behaviour — a proposal about how the session went never interrupts work still in flight.
