# D498 — work order

## 🛑 A COVERAGE slice, the third and last of this run.

**No corpus sentence gets built. Residue, `BUILT.attack`, `OPAQUE` and the census do not move. There
is no census tax and NO ENGINE VERSION BUMP.** Verify that with `git diff --name-only` rather than
asserting it (D496). **After this slice the loop returns to building sentences** — the instrument
debt D497 named is discharged here, and a fourth coverage slice would be padding.

## The target

**`resolvedByAnyReader()` in `packages/engine/src/censusAttackCorpus.ts`, lines 805–816 — ZERO
mutant rows**, measured by span at `8934296b` with all 2,424 `find` strings resolved. D497 guarded
`surface()` and explicitly left this as named, priced debt.

**It is the more load-bearing half.** This is the predicate behind **every residue and
`BUILT.attack` figure in the repo**. Its whole body is one line:

```ts
return surface().some(([, read]) => read(text) !== null);
```

⚠️ **And its own doc block already names the hazard**: *"A name lookup that missed would yield
`undefined`, and `undefined !== null` is TRUE — so a typo'd or renamed reader would make this
predicate claim EVERY sentence and every census figure in the repo would move at once, upward, with
nothing naming the cause. There is no lookup to miss."*

## What I measured, so you do not have to start cold

Over all **640 corpus sentences × 13 readers = 8,320 calls**:

- **`undefined` returns: 0**
- `null` returns: **7,788**
- non-null returns: **532** ⚠️ (against 529 sentences claimed — the difference is the known
  dual-claim population of 3, so the figures cohere)

🛑 **Therefore `!== null` → `!= null` is EQUIVALENT TODAY and not separable by any corpus sentence.**
That confirms D497's hedge. **Re-derive it rather than trusting me** — and note the consequence:
`!= null` is *strictly the better guard*, since it would catch exactly the `undefined`-returning
enrolment the doc block warns about. **If you ship that row, it is a declared survivor with a kind
and a falsifier, not a kill.**

**Witnesses: 107 test files reference `resolvedByAnyReader`, plus 3 scripts.** ⚠️ **Do not infer
coverage from that number** — D497's lesson is that a witness count says nothing about which *axis*
each witness can see. **Classify them by what they can move**, and pick killer sets accordingly.

## The candidate mutations, and what I expect — all of it checkable

| mutation | my expectation | confidence |
|---|---|---|
| `.some` → `.every` | claimed set collapses; dies loudly | confident |
| `!== null` → `!== undefined` | every `null` becomes "claimed"; residue → 0; dies loudly | confident |
| `!== null` → `!= null` | **equivalent today**, measured above | confident, and measured |
| dropping the call / returning a constant | dies loudly | hedged |

**This is a small region and the honest output may be three or four rows.** 🛑 **Say so with the
measurement rather than padding** (D497). A short, fully-measured report is the better artefact.

## What you must do FIRST

1. **Re-derive the absence by span**, and report it. ⚠️ **`--decision <D>` is a FLOOR with a
   false-negative half, and `--list` IGNORES `--decision`** (D496).
2. **Re-derive my 8,320-call measurement**, and state the command.
3. **Classify the witnesses by the axis each can see**, before choosing killer sets. D497's controls
   were the finding: a killer set drawn from suites that only pin one axis lets the other axis's
   mutations survive and reports a gap that does not exist.
4. ⚠️ **Check the second consumer.** `surface()` had two, and a row aimed at one was first killed by
   the other. Find out what calls `resolvedByAnyReader` besides the census — 3 scripts do — and say
   whether a row's first kill arrives where you aimed it.

## The two outcomes that matter

1. **If a row SURVIVES, that is a real gap in the predicate behind every census figure in the repo.**
   **Do not tune the row** — diagnose it, and fix the witness if that is the cause, with the survival
   measurement written into the rung (D496's pattern, which worked).
2. **If a mutation is EQUIVALENT, declare it with its KIND named and a falsifier you CHECKED**
   (D468, and D497's new *purity* kind). `!= null` is the obvious candidate and its falsifier is the
   day any reader returns `undefined`.

⚠️ **A row that dies for the wrong reason is worse than no row.** Read `find`/`replace`/`what`
against each other before probing, and **name which assertion kills each row, measured** by applying
the mutation and reading the first failure — never from a suite's name (D494).

## Hard rules — read these as written

- **Do NOT commit, do NOT `git add`, do NOT run a whole-corpus sweep.** A `--decision D498
  --allow-dirty` probe is expected; row count derived three ways.
- **`docs/` is UNTOUCHED. Do not run the end-of-session ritual.** 🛑 **`ARCHIVES` in
  `progressLog.test.ts` is the RITUAL's — leave it byte-unchanged and verify by sha256.**
- **Never `git stash` / `git checkout --` / `git reset --hard`.**
- ⚠️ **A FOREGROUND PROBE CAN BE SIGTERM'd BY A TOOL TIMEOUT BEFORE ITS `finally` RUNS** and the tool
  recovers silently (D496). **Prefer `setsid` for anything that patches the tree**, and verify the
  tree against HEAD by hash afterwards.
- Temp files in `$CLAUDE_JOB_DIR/tmp` only.
- `--allow-dirty` MANDATORY on a dirty tree; `--decision` takes ONE value (D443); **`--only` does NOT
  accumulate**; **`--list` ignores `--decision`.**
- ⚠️ **A `replace` omitting a REQUIRED field reports ERROR — `precheck` gates `find` only.**
- ⚠️ **`precheck` requires each `find` to occur exactly once, and `partition-gate` rejects two rows
  that are the same experiment.** In a **one-line function** both are real constraints — expect to
  lengthen a `find` onto surrounding context it uniquely owns (D443/D446/D448).
- ⚠️ **`patches LITERALLY` is 22**; the criterion is a `String.replace` special, **not a bare `$`**.
  **Verify it rather than accepting it**, and say if your rows move it.
- 🛑 **STATE THE COMMAND YOU USED FOR EVERY COUNT.**
- ⚠️ **`bun run check` must exit 0.** On a coverage slice a failure means you touched behaviour.

## Report back

The absence re-derived by span. My 8,320-call measurement re-derived, with the command. The witness
classification by axis, and the killer sets that follow from it. Every row authored, with **which
assertion kills it, measured**. 🛑 **Any survivor diagnosed and NOT tuned away; any equivalent
declared with its KIND and a CHECKED falsifier.** Whether a row's first kill arrived where you aimed
it. **If the region warrants fewer rows than expected, say so with the measurement.** What you left
and its price. The gates verbatim. **The corpus delta and a sweep prediction with its arithmetic
shown, plus an explicit statement that the residue, `BUILT.attack`, the census and the engine version
do NOT move.** **Every place this brief was wrong — assume at least one, and say which of my claims
were hedged and which were confident.**
