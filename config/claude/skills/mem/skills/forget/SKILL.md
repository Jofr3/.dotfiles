---
name: forget
description: Remove or correct something in the mem store. Use when the user says "forget that…", "that's not true anymore", "delete/remove that memory", "stop remembering…", "un-remember", "that memory is wrong", or when they correct a fact you just recalled from memory ("no, I switched to bun") — the stale memory has to be dealt with, not just worked around. Also covers finding the right memory first, restoring one that was archived by mistake, and unpinning. Do NOT use to drop a task-scoped instruction from the current conversation; this only touches the stored memory database.
version: 0.2.0
---

# forget

Take a memory out of retrieval. The `mem` MCP server's **`forget`** tool does this; its
arguments are in the schema, and this file covers only what a schema cannot say. Archiving is
the default and is reversible; real deletion happens only when the user asks for it.

## Find it before you remove it

Never guess an id. `forget` takes ids, not descriptions, and archiving the wrong memory is an
invisible failure — nobody notices the fact that should have been there.

- `list` — active memories for this project
- `search` — find it by meaning
- `show` — confirm the text before touching it

Then confirm with the user in one line if there is any ambiguity: "#7 says *use pnpm, never
npm* — archive that one?" If several memories match, list them and ask; do not archive a set
on a guess.

## Archive, don't delete

Archiving sets `status='archived'`: out of retrieval, still in the store, fully restorable
with `restore: true`, and the audit log records who did it and why. Pass `reason` — it is what
makes the archive readable months later.

`hard: true` purges the row and its events for good, and nothing else in the plugin deletes
anything. Only reach for it when the user explicitly wants permanent deletion — a leaked
secret, or a memory they never want on disk. If they just say "forget it", archive. Quote the
memory's text back to them before purging it, and never purge to tidy up after your own
mistake when archiving would do.

A **pinned** memory refuses both archive and purge: `#7 is pinned — unpin it first, or pass
--force`. That guard is deliberate. Do not pass `force` on your own initiative; either unpin
deliberately or tell the user the memory is pinned and ask.

## When a recalled memory turns out to be wrong

This is the important case. The user corrects something you retrieved: the old memory is now
actively harmful, because a confidently wrong memory is worse than no memory. Two steps, both
needed:

1. `forget` the stale one, with a `reason` saying what superseded it.
2. `remember` the correction, with a `why` recording when and from what it changed.

Archive the stale one *and* store the correction. Storing the new fact alone leaves two
contradictory memories competing for the same recall slot — cosine cannot tell "we use Vitest"
from "we no longer use Vitest", so both would keep coming back.

If the user is merely refining ("also true, but only for the API package"), the old memory may
still be right — narrow it instead: archive and re-add with the qualifier, or leave it and add
the specific one.

## Unpinning and demoting

A pinned memory is exempt from decay and automatic pruning, so it never fades on its own. The
**`pin`** tool sets it, and `off: true` unsets it.

If a memory is not wrong but too broad — it gets retrieved for everything and helps with
nothing — that is over-general slop, and archiving it is right. `show` reports `injected`
versus `useful` counts; high injected with useful near zero is the signature.

## What the output tells you

```
Archived #7 — out of retrieval, restore with 'mem forget 7 --restore'.
  in this repo use pnpm and never npm
```

A failed call means the id did not resolve — unlike `search`, "nothing matched" here means the
command did not do what was asked. Re-check with `list` over `status: ["active", "archived"]`
and `scope: "all"` before retrying.

Tell the user what was removed and whether it can be undone. If a purge happened, say plainly
that it is gone.

Related: `recall` to find the memory first, `remember` to store the corrected fact.
