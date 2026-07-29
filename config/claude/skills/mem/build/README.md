# Build harness

23 slices across phases 0–5b, each sized to fit comfortably in one context window.
`STATE.json` is the only thing that survives between sessions.

## Two ways to drive it

### A. Interactive relay — default, keeps you in the loop

```bash
node build/mem-build start      # arm the relay
```

Then work normally. When a slice finishes and `mem-build done` advances the ledger, type
`/clear`. The `SessionStart` hook sees `source=clear`, pulls the next slice's prompt, and
hands it over as the first message of the fresh session.

So `/clear` means "next slice, clean context". You review every slice; nothing runs
unattended.

```bash
node build/mem-build pause      # stop the relay; /clear goes back to meaning /clear
```

### B. Headless loop — unattended

```bash
./build/loop.sh              # run to completion
./build/loop.sh --max 3      # three slices then stop
./build/loop.sh --dry        # print the next prompt, execute nothing
```

One `claude -p` process per slice, so context isolation is structural rather than
negotiated. Logs land in `build/logs/`.

Best on mechanical slices (0.x, 1.x). For judgement-heavy ones — 3.3 threshold tuning,
5b.2 the LLM judge — use mode A so you can see what it decided.

## Why it doesn't drift

A multi-session loop fails in three ways. Each has a specific guard:

**The model says it finished when it didn't.** `mem-build done` runs the slice's `verify`
command itself and exits non-zero if it fails. Self-report isn't accepted.

**The loop spins on a slice it can't do.** `loop.sh` checks whether the ledger actually
advanced. If the next slice is still the same one, it stops and points at the log rather
than retrying. A slice marked `blocked` disarms the relay and halts the loop.

**The next session starts blind.** `--handoff` is mandatory. It is the only thing carried
forward, so the prompt asks for what was built, what the next session needs, and anything
surprising.

Also: `STATE.json` writes are atomic (tmp + rename), `touch build/STOP` halts the loop
between slices, and `mem-build reset <id>` reopens a slice.

## Safety of the SessionStart hook

It runs on every session start, so it is inert by default:

- exits 0 silently on malformed input, missing state, or a paused build
- only fires inside `skills/mem/`
- `source=clear` → `initialUserMessage` (starts work); everything else → a status line only

That asymmetry is deliberate: opening a session never puts you to work. You opt in by
typing `/clear`, and only while the relay is armed.

Verified: malformed JSON, empty object, no stdin, paused build, and wrong cwd all exit 0
with no output.

## Commands

```
mem-build status                  where we are
mem-build prompt [--id 1.2]       print a slice's self-contained prompt
mem-build start | pause           arm/disarm the relay
mem-build done --handoff "..."    verify, then advance
mem-build fail --note "..."       record a blocker, halt the loop
mem-build reset <id>              reopen a slice
```
