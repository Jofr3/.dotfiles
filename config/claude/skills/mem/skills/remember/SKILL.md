---
name: remember
description: Store a durable fact about the user or this project in the mem store — a preference, decision, constraint, correction or reference that should still be true in a future session. Use when the user says "remember that…", "don't forget…", "from now on…", "keep in mind…", "note that…", "for future reference", or asks you to save/store/persist something about how they work; and proactively when they state or correct a lasting preference in passing ("actually I prefer X", "no, always Y here", "we use Z, not W", "stop doing X"). Do NOT use for anything that stops being true when this task ends — a one-off instruction for the current change, file paths you just read, transient state — or for facts the repo already records in CLAUDE.md, README or git history.
version: 0.1.0
---

# remember

Write one durable fact to the memory store so it survives `/clear`, a new session, and a
reboot. Storage is a local Turso database; nothing leaves the machine.

```bash
~/.claude/skills/mem/bin/mem add "<one fact>" --why "<where it came from>"
```

## Only durable, only one fact

The store is small on purpose — recall injects at most 5 memories, so every stored fact
competes with the others. A memory earns its place by being **still true next month**.

Store:

- **preference** — "prefer pnpm over npm", "run tests with `bun test`"
- **decision** — "we moved auth to Clerk in July 2026, Auth0 is gone"
- **constraint** — "never force push a branch someone else is working on"
- **correction** — a standing correction of something you got wrong repeatedly
- **fact** — durable context that is not in the repo ("Jofre works alone on this")
- **reference** — a pointer worth keeping (dashboard URL, ticket board)

Do not store:

- task-scoped instructions ("in this refactor, keep the old export")
- anything recoverable from the code, CLAUDE.md, or git — a memory that duplicates the repo
  goes stale the moment the repo changes
- restatements of a memory you just stored (it will merge, but ask first whether it is
  actually a new fact)
- secrets. The write path rejects them; see below.

## Writing the text

One fact, one line, self-contained and imperative. It will be read months later with no
surrounding conversation, and it is matched semantically against a question, so the words
that make it findable have to be in it.

| Bad | Good |
|---|---|
| "he prefers the other one" | "prefer pnpm over npm for JS installs" |
| "use it for tests" | "run the test suite with `bun test`, not vitest" |
| "pnpm; vitest; 2-space indent" | three separate memories |

Put the rationale in `--why` — it is shown on recall and is what lets a future session judge
whether the fact still applies.

## Scope

Default is **project**, keyed on the normalised git remote (falling back to the absolute
path). A preference that follows the user everywhere needs `--global`.

```bash
mem add "prefer pnpm over npm" --global --kind preference
mem add "this repo deploys from main via Vercel" --kind decision   # project-scoped
```

Recall unions global + current project, so `--global` costs precision everywhere. Use it for
"how I work", not "how this codebase works".

## Options worth knowing

```
--why <text>          rationale / provenance (do include it)
--kind <k>            preference|decision|constraint|fact|correction|reference
--global | --project  scope (default: project)
--pin                 never decays, never pruned, exempt from automatic actions
--staged              store without activating (not retrievable until promoted)
--salience <0-1>      how important (default 0.5); raises it in ranking
--confidence <0-1>    how sure you are (default 0.5)
--expires-in <days>   TTL, for facts with a known shelf life
--json                machine-readable result
```

`--pin` is for things that must never quietly disappear — a safety constraint, an identity
fact.

`--staged` exists for auto-capture: use it **when and only when** a `<mem-capture-cue>` block
asked you to. That block comes from a regex on the user's prompt, so it is a guess, and
`--staged` is what makes acting on a guess safe — a staged memory is invisible to recall until
the user promotes it out of the queue (`/mem:review`). Everywhere else it is a hedge, and a hedge
lands in a queue nobody asked for: if you are unsure whether a fact is durable, ask the user in
one line instead.

## What the output tells you

```
Added #7 · preference · active · project github.com/Jofr3/.dotfiles (git-remote)
  prefer pnpm over npm for JS installs
```

or, when it landed on top of something close:

```
Merged into #7 · 0.990 similar · project github.com/Jofr3/.dotfiles (git-remote)
  in this repo use pnpm and never npm
  text, confidence 0.50 → 0.63
```

**A merge is not a failure and not a duplicate** — at cosine ≥ 0.93 within the same scope the
write updates that row instead of inserting, bumping confidence. Note that **the longer text
wins**, so a merge can rewrite the stored wording. If the merge target is not actually the
same fact, re-run with `--no-dedup`.

`nearest existing: #7 at 0.915 (kept separate)` means it was close but distinct — worth a
glance to confirm the store is not accumulating near-copies.

## Secrets are refused, not stored

```
mem add: Refusing to store: this looks like it contains a credential …
```

Exit code **2** means "you handed me a secret", distinct from 1 for a real error. Do not
retry with the secret. Rewrite the fact to say *where* the credential lives, never what it
is: "the Turso token is in 1Password under 'mem prod'". `MEM_ALLOW_SECRETS=1` exists for
false positives; only the user should decide to set it.

## After writing

Say what you stored in one short line — id, and the text if you rephrased it. The user needs
to know a memory now exists, because it will silently shape later sessions.

Related: `recall` to search the store, `forget` to remove or correct a memory.
