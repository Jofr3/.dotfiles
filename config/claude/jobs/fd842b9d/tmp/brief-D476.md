# D476 — the FACE axis, after the COUNT axis closed

Repo: /home/jofre/projects/luminous_ui  (branch main, tree CLEAN at 382d82cc)

Read FIRST and treat as binding:
  - scripts/autoloop/prompt.md
  - docs/conventions.md — ALL of it.
  - the `## NEXT (resume point)` block in docs/progress.md (written after D475) —
    **sections (4), (5) and (8) are this slice's work order and are more precise
    than what follows; let them override me where we differ.**
  - the D473..D475 rows in docs/decisions.md.

## State

RESIDUE **107 sentences / 149 printings**. Gate §A **133 / 107 / 149**. `OPAQUE`
**73/105**, `MULTI-2` **9/12**, `MULTI-3` **10/14**. Corpus **2,178**, engine
**0.373.0**, `MATCH_RECORD_VERSION` **29**, `ARCHIVES` **145**
(🛑 the RITUAL's to step — seven work orders running, six builders correctly
refusing).

## The target: corpus FILE LINE 217

> *"Flip 3 coins. For each tails, discard an Energy from this Pokémon."* — **1
> Standard-legal printing.**

D475 closed the flip-COUNT axis (three rows / four printings, each read through a
different `AttackFlipCount` member) and named the FACE as the family's remaining
open axis — at this exact row, which is also the row **D463 named when it first
named the face axis**.

D475's price, which you should **verify rather than re-derive**, and report where
it drifted:
  - one anchor;
  - **one `face?: CoinFace` FIELD on `programPerHeads`** — D440's rule read rather
    than copied: identical payload plus a discriminator ⇒ a **FIELD**, not a
    member, **exactly what D460 did for `AttackFlipThreshold`**;
  - one line in `attack.ts`'s expansion, counting the printed face instead of
    `heads`;
  - the op ships (`discardEnergy {from:"self"}`, D222), and **N sequential parks
    are a shipped capability** (D452).

⚠️ **Three slices running, the inherited price has been wrong in its expensive
clause and right in its verdict** — D470's *"two ops"* was three consumers, D474's
*"zero test rungs"* was 1,668 lines of them, D475's *"the whole of the work"* was
already done. **Assume the same here and find it.** In particular: check whether
`programPerHeads` is the right home at all, and whether anything *else* reads
`heads` that would need the same field.

## What this slice can uniquely check

The count axis is now closed and each of its three rows reads through a different
member. **If the face field is genuinely orthogonal to the count member, then a
face-flipped mutant should be killable independently of which count member the
sentence uses.** Say whether that holds — it is the difference between an axis and
an accident, and nobody has been able to ask it until now.

## Requirements

1. Build it properly; the op must MEAN something on a real board.
2. New vitest suite in `packages/engine/src/`, behavioural. ⚠️ **For a face axis
   the load-bearing board is one where heads and tails counts DIFFER** — 3 coins
   giving 1 head / 2 tails distinguishes every wrong reading; an all-heads or
   all-tails board distinguishes nothing. Drive both faces, plus zero-of-the-
   printed-face (which is silence for the *printed* reason) with controls
   separating it from silence-for-another-reason. Prefer a file-local `cardPool`
   (D414); check whether the sentence is already fielded as a refusal witness
   before adding anything — **D475 found its row had sat on `fix-bothactives`
   index 2 since D196**, which is why it added no fixture id and had to re-point
   two shipped rungs instead.
3. ⚠️ Mutate your central new arm to its NEAREST WRONG SIBLING (here: counting
   `heads` where the print says tails) and check something OTHER than a census
   suite goes red. Five slices running this has held; report the blind list.
4. ⚠️ **Before generalising any anchor, measure what the generalisation claims over
   all 640 rows** (D472; twice at D473; again at D475, where the optional-filter
   loosening claimed the identical 1/1). If it claims the same rows, the generality
   is pure risk. **And for every op a widened anchor would newly admit, check
   `describeBranch`/`describeCondition` has a phrase for it** (D473).
5. Hand-authored mutant rows for everything. `expectKilledBy` names your suite;
   `find` occurs exactly once; a `survives` row still needs `expectKilledBy`. Any
   `equivalent` row must state WHICH KIND of disjointness (guarded / structural).
   🆕 **And do not author a row whose mutation cannot change an answer** (D475): if
   no board distinguishes the mutant from the original, it is not a weak row, it is
   not a row. Write the observable form instead.
6. Step the engine version only if `packages/engine` behaviour moved.
7. Census pins if you built a sentence. 🛑 **The tax has taken FOUR DIFFERENT
   SHAPES in four slices** (D472 `-1`/`-2`, D473 `-2`/`-2`, D474 `-1`/`-2`, D475
   `-1`/`-1`). **Derive it; no predecessor's pattern has ever been right.**
   ⚠️ **`BUILT.attack` is a RECORDED CONSTANT the chains subtract FROM — bump it
   FIRST** (D449). ⚠️ **D463's front-insert trap** bit D474 and missed D475 — verify
   the junctions byte-wise either way. `units - built` is **395**;
   `BUILT.ability + BUILT.trainer + BUILT.specialEnergy` **STAYS 405**. There is a
   `Math.round` percentage no grep finds; **derive it, do not assume either way**.
8. `bun scripts/opaque-anatomy-gate.ts` must still pass — report its line.
9. `scripts/residue-census-gate.ts` holds no literals of its own.

## Gates before you report

  - `bun run check` GREEN — exact counts, delta **re-derived**; count `it(` at HEAD
    versus now rather than inferring.
  - `bun scripts/mutation/precheck.ts` clean — corpus total **and the
    `patches LITERALLY (N row(s))` count**, currently **15**.
  - `bun scripts/residue-census-gate.ts` OK — §A triple.
  - `bun scripts/opaque-anatomy-gate.ts` OK — its line.
  - `bun scripts/mutation/run.ts --decision D476 --allow-dirty` — MANDATORY flag.
    Row count three ways. Report killed / survivor / GAP exactly.
  - `--only D275-engine-version-drifts-again --allow-dirty` if you bump the version.
    🛑 **`--only` does NOT accumulate.**
  - find-vs-replace diff over your new rows — D475's caught an INERT row from a
    backslash-escaping slip, which `precheck` cannot see by construction.
  - attribution control on your central row: by hand, each killer ALONE, restore in
    a `finally`, verify by size AND sha256. 🛑 **Python's `str.replace` REJECTS a
    function second argument** — `find`-split + join with `len(parts) == 2`.

## 🛑 The operator rule D475 paid to re-learn

**NEVER write to the tree while the harness is in flight.** D475 edited a source
file mid-probe, the harness reported CLOBBER, preserved the edit and restored its
own baseline — discarding it. Recovery cost a round. **And the whole-corpus sweep
later reported `0 clobber(s)`, correctly**, because a CLOBBER is scoped to the run
that observes it: the tool contains the mistake so well that nothing downstream
records it. Sequence your edits and your probes; never overlap them.

## For my sweep prediction

Report `+K killed, +S declared survivors` — exact.

⚠️ **And report `git diff --numstat` per file for every file with deletions.**
The declared-survivor map, **re-measured from the module at D475's ritual**:
`interpreter.ts` 12, `effects.ts` 10, `attack.ts` 7, `continuous.ts` 5, `flow.ts`
2, `redact.ts` 1, `GameHud.tsx` 1, `splice-gate.ts` 1 — **39 total**. You will
likely edit `effects.ts` and `attack.ts`; name every deleted line in those and say
whether any survivor's reason touches it. D473's expensive audit was triggered by a
single deleted COMMENT closer.

## Hard rules

  - DO NOT COMMIT. DO NOT `git add`. DO NOT run a whole-corpus sweep. Leave the tree
    dirty and NAME every untracked path.
  - NEVER `git stash`, `git checkout --`, `git reset --hard`, or any wholesale
    working-tree mutation.
  - Never `String.replace(find, replacementString)` with a replacement read from a
    file.
  - Encode first, write second, inside `try/finally`.
  - Temp files in $CLAUDE_JOB_DIR/tmp, never /tmp.

## Report back

What you built, with printings and corpus FILE LINES (fileLine = arrayIndex + 53);
**whether D475's price held and where it drifted**; **whether the face field is
genuinely orthogonal to the count member, measured**; what you left and its price
in one of D469's three shapes; **every place this brief was wrong**, assuming at
least one; the gates verbatim; the per-file numstat for deletions; and the corpus
delta.
