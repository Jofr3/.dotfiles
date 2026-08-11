# Where a change goes, and how to write it

One finding, many possible homes. Picking the wrong one is how a setup rots: a preference
buried in a project file, a procedure pasted into three CLAUDE.mds, a skill written for
something that happened once.

The order below is the order to consider them in. Prefer the smallest change that removes
the friction, and prefer editing something that exists over adding something new.

## 1. Delete or fix something that already exists

Always consider this first, because it is the only option that makes future sessions
cheaper instead of more expensive.

Propose a deletion or an edit when:

- **A document is wrong.** The `documented-command-failed` signal means a file told this
  session to do something that did not work. Fix those exact lines. Never append a
  correction next to a falsehood — leaving both is worse than either alone, because the
  next reader cannot tell which one is current.
- **An instruction no longer applies.** A path, a flag, a script, a service that is gone.
- **Two files disagree.** Duplicated guidance that has drifted. Keep one, delete the
  other, and if both are needed, make one point at the other rather than restating it.
- **A CLAUDE.md has become an essay.** Hundreds of lines of half-true prose is a tax on
  every session in that repo. Cut what is obvious from the code, what is stale, and what
  no session has ever needed.
- **A skill never fires when it should.** That is a description bug, and the fix is in the
  frontmatter, not the body. If the skill has no remaining job at all, propose deleting it.

For a deletion, show the lines being removed and say what makes them wrong. "This is
verbose" is not a reason; "this command does not exist" is.

## 2. The project's CLAUDE.md

The default home for a repo fact that a session needed and did not have.

Rules, all of them earned:

- **Five lines maximum** per addition. Longer than that means it belongs in `docs/`.
- **Imperative, not narrative.** "Build with `X`", not "The project can be built by…".
- **The exact command, in backticks**, plus the wrong one it is mistaken for. The near
  miss is the valuable half: `pnpm build` failing matters precisely because it is what
  anybody would try first.
- **Under an existing heading** if one fits. A new heading per note produces a file of
  headings.
- **No dates, no changelog, no rationale paragraph.** The file is instructions, not
  history.

```md
## Commands
- Build with `pnpm run build:app`. Plain `pnpm build` is not a script and fails.
- Tests need a running database: `docker compose up -d db` first.
```

## 3. `docs/`

For anything that needs more than five lines: a procedure with real steps, an
architectural explanation, a debugging playbook. Add the document, then add **one** line
in CLAUDE.md pointing at it. A doc nothing points to will not be read.

## 4. A durable user preference → mem, not a file

"Always use bun", "never push without asking", "prefer explicit types". These are the
user's standing preferences and belong in the mem store via `mem:remember`, where they
apply across every project. Writing them into one repo's CLAUDE.md scopes them to the
wrong place and hides them from every other repo.

The test: would this still be true in a completely different codebase? Then it is a
preference, not a project fact.

## 5. A new or edited skill

A skill is a much bigger commitment than a note, and most findings never earn one. It is
justified when **all** of these hold:

- The same friction has appeared in **three or more sessions** (`evolve history` proves
  this — quote the count).
- It is a **procedure**, not a fact. Several steps, in order, with judgement in between.
  A fact is a note; a procedure is a skill.
- A note has already been tried and did not work, or the procedure is plainly too long to
  live in CLAUDE.md.
- You can write a **description that will actually trigger**. This is where most skills
  fail: it must name the words the user would really type and the situations where it
  should fire. If you cannot write that sentence, the skill will sit unused and the
  friction will continue.

Structure, matching the conventions already in `~/.claude/skills/`:

```
~/.claude/skills/<name>/
  SKILL.md            frontmatter: name, description (trigger-rich), version
  references/*.md     detail loaded only when needed
  scripts/*.mjs       anything deterministic — do it in code, not in prose
```

Put the judgement in `SKILL.md` and the mechanics in scripts. Anything a script can decide
correctly should not be left to a paragraph of instructions.

Project-scoped skills go in `<repo>/.claude/skills/` instead, and that is the right choice
when the procedure is meaningless outside that repo.

## 6. A plugin or hook bug

`tool-error` and `hook-error` findings are code defects, and the code is local and
editable — the plugins under `~/.claude/skills/` (`mem`, `drizzle-db`) are this user's own.
Read the failing script, find the actual fault, and propose a fix like any other bug fix.

Do not paper over a broken hook with a note telling future sessions to work around it. If
it cannot be fixed now, propose unwiring it from `settings.json` and say so plainly.

## 7. settings.json

Permissions, hooks, env vars, model and mode. The `update-config` skill owns the details
of this file; hand off to it rather than hand-editing when the change is non-trivial.

Repeated permission prompts are better handled by the `fewer-permission-prompts` skill,
which mines transcripts for exactly that and produces a prioritised allowlist.

## Proposing well

Two changes maximum, ranked, each as a real diff:

```
Two things from this session worth keeping:

1. CLAUDE.md — the build alias (cost ~4 minutes today, 3rd session in a row)
   + ## Commands
   + - Build with `pnpm run build:app`. Plain `pnpm build` is not a script and fails.

2. docs/testing.md:12 — says `pnpm test:e2e` needs no database. It does.
   - E2E tests run standalone.
   + E2E tests need `docker compose up -d db` first.

Apply both, one, or neither?
```

Then record whatever happens with `evolve decide`, including "neither" — an unrecorded
decline is a proposal that will come back.
