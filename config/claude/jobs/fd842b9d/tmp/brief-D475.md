# D475 — the seat axis on the shipped flip member, through the switch D474 installed

Repo: /home/jofre/projects/luminous_ui  (branch main, tree CLEAN at 4f646100)

Read FIRST and treat as binding:
  - scripts/autoloop/prompt.md
  - docs/conventions.md — ALL of it.
  - the `## NEXT (resume point)` block in docs/progress.md (written after D474) —
    **section (4) is this slice's work order, and section (8) lists hazards that
    have bitten in each of the last three slices. Both are more precise than what
    follows; let them override me where we differ.**
  - the D472..D474 rows in docs/decisions.md.

## State

RESIDUE **108 sentences / 150 printings**. Gate §A **134 / 108 / 150**. `OPAQUE`
**74/106**, `MULTI-3` **10/14**. Corpus **2,163**, engine **0.372.0**,
`MATCH_RECORD_VERSION` **29**, `ARCHIVES` **144** (🛑 the RITUAL's to step, never
yours — six work orders running have said so, five builders have refused anyway).

## The target: corpus FILE LINE 231

> *"Flip a coin for each Energy attached to both Active Pokémon. This attack does
> 60 damage for each heads."* — **1 Standard-legal printing.**

D474 built its sibling (file line 233), answered this row's open question rather
than deferring it, and **re-priced it downward from "bigger than it looks" to
"smaller than its reputation"**. Verify that price; report where it drifted.

What D474 established, from source:
  - **It rides the OLD member, not D474's new one.** 231 counts *Energy on two
    bodies*; `pokemonInPlay` counts *bodies* through `countPokemonInPlay`, and no
    widening of a body count reaches an Energy count. This is pinned as a rung in
    `inPlayFlipCount.test.ts` §1 (`resolvedByAnyReader(231) === false`, all 13
    readers null, both splitters null) — **so your build will make that rung go
    red, and re-pointing it (not flipping it — D438) is part of the work.**
  - **D473's RENAME-shaped pricing (D362/D369) DOES NOT APPLY**: `AttackFlipCount`
    is **never serialised** — `deriveAttackCoinFlip` produces a local `const`
    inside `attack()`, and `grep AttackFlipCount packages/schema` returns zero. So
    there is **no version component in either direction**. State which of the three
    arguments you are making (no carrier at all / a byte string a v29 deploy
    already writes / a new member of a persisted union) — yesterday's convention.
  - **The fold already exists verbatim.** `attack.ts`'s `bothActivesEnergyCount`
    arm spells `countAttachedEnergy(state, attacker, null) + (defenderActive ===
    null ? 0 : countAttachedEnergy(state, defenderActive, null))`.
  - **The real remaining cost is one thing:** `takeFlips` today receives only
    `attackerSeat` and `attacker`. **Getting the DEFENDER'S ACTIVE into it is the
    whole of the work.**

## 🛑 The trap D474 armed, and why this row is where it fires

D474 converted `takeFlips`'s dispatch from a **ternary** to a **`switch`**. The
reason is this row specifically:

> Under the old ternary, exhaustiveness rested on a **payload coincidence** — a new
> member without an `energy` field was a loud `TS2339` at the `count.energy`
> access. But a member **carrying** an `energy` field of compatible type would have
> satisfied that access and fallen **SILENTLY** into the self-attached reading.
> **This row is exactly such a member** — it counts Energy, so its payload will
> look like `attachedEnergy`'s.

**So: take it through the `switch`, and do not reintroduce a payload-shaped
dispatch.** If you find yourself widening `attachedEnergy` with a seat field rather
than adding a member, stop and re-derive — D440's rule (asymmetric payload ⇒ two
members) is what keeps the discriminator load-bearing.

⚠️ **And a self-check that follows from D474's finding:** after you build, mutate
your new member's arm to emit the OLD member and confirm something reddens. If the
old ternary would have made that mutation silent, your `switch` must make it loud —
that is the whole value D474 bought, and this is the first row that can test it.

## Requirements

1. Build it properly; the op must MEAN something on a real board.
2. New vitest suite in `packages/engine/src/`, behavioural. ⚠️ **Zero flips and
   all-tails are the same damage and NOT the same fact** — drive both, plus a board
   where the two Actives carry *different* amounts so a one-seat reading is
   distinguishable from the sum. A ZERO-MATCH board with controls. If plausible
   wrong implementations collide on a value, name the colliding pairs and separate
   them elsewhere (D473's §3 shape). Prefer a file-local `cardPool` (D414).
3. ⚠️ Mutate your central new arm to its NEAREST WRONG SIBLING and check something
   OTHER than a census suite goes red (D469 → D470 → D472 → D473 → D474).
4. ⚠️ **Before generalising any anchor, measure what the generalisation claims over
   all 640 rows** (D472; applied twice by D473). If it claims the same rows, the
   generality is pure risk. **And for every op a widened anchor would newly admit,
   check `describeBranch`/`describeCondition` has a phrase for it** (D473).
5. Hand-authored mutant rows for everything. `expectKilledBy` names your suite;
   `find` occurs exactly once; a `survives` row still needs `expectKilledBy`. Any
   `equivalent` row must state WHICH KIND of disjointness (guarded / structural).
6. Step the engine version only if `packages/engine` behaviour moved.
7. Census pins in `censusAtHead.test.ts` if you built a sentence. 🛑 **The tax has
   taken THREE DIFFERENT SHAPES in three slices** — D472 `- 1`/`- 2` disagreeing on
   the same line, D473 both `- 2`, D474 `- 1`/`- 2`. **Derive it; never carry the
   previous pattern.** ⚠️ **`BUILT.attack` is a RECORDED CONSTANT the chains
   subtract FROM — bump it FIRST** (D449) or every dependent rung fails a round
   later. ⚠️ **D463's front-insert trap is live and bit D474**: a naive splice eats
   the following `- ` and yields `head - 1 /*…*/ 2 /*…*/`, a TS1005 on a
   38,995-character line. `units - built` is **396**;
   `BUILT.ability + BUILT.trainer + BUILT.specialEnergy` **STAYS 405**. There is a
   `Math.round` percentage no grep finds; it crossed seven slices running and then
   did not cross at D474 — **derive it, do not assume either way**.
8. `bun scripts/opaque-anatomy-gate.ts` must still pass — report its line.
9. `scripts/residue-census-gate.ts` holds no literals of its own.

## Gates before you report

  - `bun run check` GREEN — exact counts, delta **re-derived**. ⚠️ Count `it(` at
    HEAD versus now rather than inferring: D473 broke the "+N = the suite's own
    count" shape (two re-pointed suites each gained an `it`), D474 resumed it.
    **This slice re-points a rung, so expect it may break again.**
  - `bun scripts/mutation/precheck.ts` clean — corpus total **and the
    `patches LITERALLY (N row(s))` count**, currently **15**.
  - `bun scripts/residue-census-gate.ts` OK — §A triple.
  - `bun scripts/opaque-anatomy-gate.ts` OK — its line.
  - `bun scripts/mutation/run.ts --decision D475 --allow-dirty` — MANDATORY flag.
    Row count three ways. Report killed / survivor / GAP exactly.
  - `--only D275-engine-version-drifts-again --allow-dirty` if you bump the version.
    🛑 **`--only` does NOT accumulate.**
  - find-vs-replace diff over your new rows.
  - attribution control on your central row: by hand, each killer ALONE, restore in
    a `finally`, verify by size AND sha256. 🛑 **Python's `str.replace` REJECTS a
    function second argument** — use `find`-split + join with `len(parts) == 2`.

## For my sweep prediction

Report `+K killed, +S declared survivors` — exact.

⚠️ **And report `git diff --numstat` per file for every file with deletions.**
Declared survivors live in `interpreter.ts` (12), `effects.ts` (8), `attack.ts` (7),
`continuous.ts` (5), `flow.ts` (2), `redact.ts` (1), `GameHud.tsx` (1),
`splice-gate.ts` (1). **You will almost certainly edit `attack.ts` and
`effects.ts`** — name every deleted line in those two and say whether any survivor's
reason touches it. D473's expensive audit was triggered by one deleted COMMENT
closer; `numstat` cannot tell a comment from code.

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
**whether D474's re-price held and where it drifted**; **whether the `switch` made
the old-member mutation LOUD, measured** — that is D474's investment paying off or
not, and either answer is worth having; how you got the defender's Active into
`takeFlips` and what else that touched; what you left and its price in one of
D469's three shapes; **every place this brief was wrong**, assuming at least one;
the gates verbatim; the per-file numstat for deletions; and the corpus delta.
