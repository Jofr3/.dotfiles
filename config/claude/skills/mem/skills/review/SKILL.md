---
name: review
description: Triage the mem review queue — the memories auto-capture guessed at but nobody has approved yet, plus the pairs consolidation will not resolve without a human. Use when the user says "review my memories", "what's staged", "what did you capture", "triage the queue", "clean up my memory store", or asks what mem has been picking up; and when they follow up on a capture ("did you save that?", "keep that one", "no, drop it"). Each item is promoted (becomes recallable), edited then promoted, or discarded. Do NOT use to store a new fact — that is `remember` — or to remove a memory already active, which is `forget`.
version: 0.2.0
---

# review

The staging queue holds memories the plugin captured on a guess. A `UserPromptSubmit` regex
notices phrasing that often marks a durable preference and asks for a staged write; a staged
memory is **never recalled** until someone promotes it. This skill is where that decision gets
made.

The `mem` MCP server's **`review`** tool covers all four moves through its `action` argument —
`list` (the default), `promote`, `discard`, `edit`. Its arguments are in the schema; this file
covers only what a schema cannot say.

## Read the queue first

```
ref  type           age  kind        scope               similar        text
#12  staged-memory  3d   preference  github.com/me/api   #7 0.96 merge  in this repo use pnpm, never npm
#14  staged-memory  2d   fact        github.com/me/api                  deploys go out from main on Thursdays
#15  staged-memory  1d   preference  global              #3 0.88 near   I prefer terse commit messages
```

Every project is shown, not just this one — a queue that hides items never gets cleared.

The `similar` column is the active memory this capture sits next to. **merge** means promoting
it folds the two into one; **near** means they sound alike but promoting leaves both, and
whether that is right is the reviewer's call — `show` on the active memory next to the capture
is usually enough to tell a restatement from a genuinely different fact.

## The decision, per item

Promote only what is **still true next month**. The bar is `remember`'s bar, and it has not
moved because a regex rather than a person proposed the fact — if anything it is higher, since
nobody chose to store this.

- **Promote** a stated preference, decision, constraint or correction.
- **Edit, then promote** when the fact is right but the wording is not: captures often arrive
  as a fragment of a sentence, and a memory is read months later with no conversation around
  it. Rewrite it as one self-contained imperative line.
- **Discard** anything task-scoped ("keep the old export in this refactor"), anything the repo
  already records, anything that was a passing remark, and anything you cannot state as one
  fact.

**Propose, then act.** Show the user the queue with a one-line recommendation each, and let
them answer. Promoting on your own judgement is the thing staging exists to prevent — the
memory then shapes every later session and nobody chose it. Discarding on request is fine;
so is discarding obvious junk when the user says "clean it up".

## The three verbs

`promote` and `discard` take several refs at once and apply as one reversible run — all of
them or none. `edit` takes exactly one, because rewriting several to the same text would
collapse them.

`edit` accepts `text`, `why`, `kind`, `salience`, `confidence`, and `editScope` to fix the
scope. Captures land project-scoped by default, so a preference about how the *user* works —
editors, commit style, package manager everywhere — usually needs `editScope: "global"`. Add
`promote: true` to accept it in the same call; leaving an edited item in the queue means it
gets triaged twice.

Refs are ids or uid prefixes, the same as everywhere else in `mem`. Every promote/discard run
reports a run id, and `mem undo <run_id>` in the CLI reverses it.

## Duplicates merge, they do not accumulate

Promoting an item marked `merge` folds it into the memory it restates: the longer wording wins,
confidence goes up, and the capture is marked `superseded` pointing at the survivor.

```
Promoted #12 into #7 — 0.962 similar, so it merged rather than adding a second copy.
  in this repo use pnpm and never npm, it is the only supported installer
  text, confidence 0.50 → 0.63
```

That is the correct outcome, not a lost memory — recall injects at most five items, and five
paraphrases of one fact crowd out everything else. If the two are genuinely different facts
that happen to sound alike, `noMerge: true` keeps them apart.

An item marked `near` is the opposite case: close enough to be worth your eye, not close enough
to merge on its own. If it really is the same fact in different words, the fix is usually to
discard the capture (the store already knows it) or to edit the *active* memory instead.

## The other item type: consolidation proposals

The queue has a second producer. When two stored memories are near-identical, an LLM judge
classifies the pair, and anything it will not resolve on its own lands here as a
`consolidation-pair` item:

```
ref              type                age  kind        scope              similar       text
proposal:7:31    consolidation-pair  1d   preference  github.com/me/api  #31 0.91 near  we use vitest
```

These appear after `mem consolidate --apply` has run (weekly, or whenever somebody types it).
That command is CLI-only and not one of the tools — `mem consolidate` on its own is a dry run
and puts nothing in the queue.

Every **contradiction** comes here, always — one of the two memories is about to stop being
recallable, and that is not a decision to make automatically. So do the others when the guard
fires: the older memory is pinned, or it is more than 0.3 more confident than the newer one,
or the change would touch a pinned row. Duplicates, refinements and links resolve on their own
and never appear.

`review` with `json: true` gives you the whole proposal: `proposal.wants` says what promoting
would do in one line ("retire #7, superseded by #31"), `proposal.guard.reason` says why it is
being asked rather than done, and `proposal.why` is the judge's own sentence.

- **Promote** applies it: the retired memory becomes `superseded`, pointing at the one that
  replaced it. Restorable via `forget` with `restore: true`.
- **Discard** leaves both memories exactly as they are, and the pair is not judged again
  unless one of them is restated.

Read both texts before answering — `show` on both ids. The judge is looking at two sentences
with no context, and "use pnpm" versus "use pnpm, never npm" is agreement, not contradiction.
If the two are both true, discard the proposal; if the older one is simply wrong now, promote
it. `edit` does not apply to these items — to fix the wording of either memory, edit that
memory.

## Discarding is reversible

`discard` archives: out of retrieval, still in the store, and `forget` with `restore: true`
puts it **back in the queue** rather than making it active. So rejecting is cheap and rejecting
by mistake is recoverable. Pass `reason` — a rejection is the strongest signal the store gets
about what not to capture, and the reason is what makes it readable later.

Nothing here deletes anything. `forget` with `hard: true` is the only call that does, and it is
not part of triage.

## After triaging

Say what happened in one or two lines: how many were promoted, what was merged into what, and
what was dropped. Promoted memories start shaping later sessions silently, so the user needs
to know which facts now exist.

If the queue is mostly junk, say so — the gate is meant to run above a 50% promote rate, and
a queue full of noise is a signal to tighten it rather than something to keep clearing.

Related: `remember` to store a fact directly, `recall` to search what is already active,
`forget` to remove a memory that is already in the store. The
`~/.claude/skills/mem/bin/mem` CLI takes the same commands (`mem review`, `mem review promote
12 14`), which is the fallback if the server is not registered on this machine.
