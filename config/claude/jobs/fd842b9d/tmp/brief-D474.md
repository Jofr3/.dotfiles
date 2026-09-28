# D474 — the filtered flip count, and machinery that nothing pins

Repo: /home/jofre/projects/luminous_ui  (branch main, tree CLEAN at 9d805e1d)

Read FIRST and treat as binding:
  - scripts/autoloop/prompt.md
  - docs/conventions.md — ALL of it.
  - the `## NEXT (resume point)` block in docs/progress.md (written after D473) —
    **section (4) is this slice's work order and is more precise than anything
    below. Read it first and let it override me where we differ.**
  - the D471..D473 rows in docs/decisions.md.

## State

RESIDUE **109 sentences / 152 printings**. Gate §A **135 / 109 / 152**.
`OPAQUE` **75/110 → 75/108**, `MULTI-3` **11/16**. Corpus **2,142**, engine
**0.371.0**, `MATCH_RECORD_VERSION` **29**, `ARCHIVES` **143**
(🛑 the RITUAL's to step, never yours — five work orders running have said so).

## The target: corpus FILE LINE 233 — and it comes with a debt

> *"Flip a coin for each {D} Pokémon you have in play. This attack does 60 damage
> for each heads."* — **2 Standard-legal printings.**

D473 priced this from source rather than guessing, so **verify the price rather
than re-deriving it from scratch**, and report where it has drifted:

  - **ONE anchor**, **structurally disjoint** from `ATTACK_COIN_PER_ENERGY` (whose
    trailing literal is `Energy attached to this Pokémon`) — **so no guard is
    needed**, and per D467/D468 your declared-`equivalent` row (if you write one)
    must say the disjointness is *structural, no guard, and correctly none*.
  - **ONE new `AttackFlipCount` member** — D440's payload rule: `attachedEnergy`
    carries `energy: BasicEnergyType|"special"|null`, a body count carries a
    filter, so **asymmetric payload ⇒ two members**, not a widened one.
  - **ONE arm in `takeFlips`** (`attack.ts` ~:645).
  - **The count is free**: `countPokemonInPlay(state, seat, filter)`
    (`interpreter.ts` ~:4501) and `inPlayBodyFilter` (`effects.ts` ~:13448) ship,
    and `{D}` is a live key of `CLAUSE_POKEMON_TYPES` over `ENERGY_TYPE_BY_CODE`'s
    `D: "Darkness"`.
  - ⚠️ **`takeFlips` reads the union as an early return plus a TERNARY, not a
    `switch`.** D473 verified on an *isomorphic reproduction* — **not on the real
    file** — that a member lacking `energy` is a TYPE ERROR at the `count.energy`
    access rather than a silent fall into `attachedEnergy`. **Check that on the
    real file, and convert the ternary to a `switch` regardless** (D222/D447): a
    union whose exhaustiveness rests on a ternary is one member away from a silent
    wrong answer.
  - **`MATCH_RECORD_VERSION` stays 29, and the member-vs-inhabitant test is the
    WRONG argument here.** `AttackFlipCount` is **never persisted** —
    `deriveAttackCoinFlip` produces a local `const` inside `attack()`, and
    `grep AttackFlipCount packages/schema` returns zero. **State which of the three
    arguments you are making** (no carrier at all / a byte string a v29 deploy
    already writes / a new member of a persisted union) — yesterday's convention.

## 🛑 The debt this slice should pay while it is there

D473 measured, with D453's span predicate: **ZERO test rungs and ZERO mutant rows
sit on `takeFlips`, the `AttackFlipCount` declaration, `countAttachedEnergy`'s
definition, or `ATTACK_COIN_PER_ENERGY`.** `grep "Pokémon you have in play"
*.test.ts` returns 0 hits.

**That machinery is pinned by nothing, and you are about to extend it.** D472 found
the same shape at `conditionHolds`'s `opponentActiveHasType` arm — load-bearing for
a whole family, zero rows, because coverage accrues to whoever last edited nearby.

**Pay it: author rows against the EXISTING members too, not only your new one.** A
slice that adds a third member to an unpinned union and pins only its own arm has
made the union harder to change, not easier.

## Also owed: a sentence about file line 231

*"Flip a coin for each Energy attached to both Active Pokémon."* (1p, `MULTI-2`) is
the **SEAT axis on the shipped member**. D473's price says a slice taking 233 owes
an answer: **does 231's seat ride your new member or the old one?** You do not have
to build 231 — but say which, with the reason, because the next slice inherits it.

## Requirements

1. Build it properly; the op must MEAN something on a real board.
2. New vitest suite in `packages/engine/src/`, behavioural. A ZERO-MATCH board
   (no `{D}` in play → zero flips) with controls distinguishing it from
   silence-for-another-reason — ⚠️ **and note that zero flips and all-tails are the
   same damage and NOT the same fact**; drive both. A board where several plausible
   wrong implementations each answer a DIFFERENT value; if the natural answers
   collide, name the colliding pairs and separate them elsewhere (D473's §3 shape).
   Prefer a file-local `cardPool` (D414) over a new `FIXTURE_POOL` id.
3. ⚠️ Mutate your central new arm to its NEAREST WRONG SIBLING and check something
   OTHER than a census suite goes red (D469 → D470 → D472 → D473, four addresses).
4. ⚠️ **Before generalising any anchor, measure what the generalisation claims over
   all 640 rows** (D472, applied twice by D473). If it claims the same rows, the
   generality is pure risk. 🆕 **And for every op a widened anchor would newly
   admit, check `describeBranch`/`describeCondition` has a phrase for it** — D473
   refused a widening whose reader was correct but whose CAPTION would silently
   have said less, which no census and no mutant can see.
5. Hand-authored mutant rows for everything, plus the debt above. `expectKilledBy`
   names your suite; `find` occurs exactly once; a `survives` row still needs
   `expectKilledBy`.
6. Step the engine version if and only if `packages/engine` behaviour moved.
7. Census pins in `censusAtHead.test.ts` if you built a sentence. ⚠️ **Do NOT carry
   last slice's tax shape** — D472's sentence and printing chains took `- 1` and
   `- 2` and disagreed on the same line in three files; D473's both took `- 2`.
   ⚠️ **`BUILT.attack` is a RECORDED CONSTANT the chains subtract FROM, so bump it
   FIRST** (D449) or every dependent rung fails in a later round. `units - built`
   is **398**; `BUILT.ability + BUILT.trainer + BUILT.specialEnergy` **STAYS 405**.
   There is a `Math.round` percentage no grep finds that has crossed six times.
8. `bun scripts/opaque-anatomy-gate.ts` must still pass — report its line.
9. `scripts/residue-census-gate.ts` holds no literals of its own.

## Gates before you report

  - `bun run check` GREEN — exact counts, delta **re-derived**. ⚠️ D473's broke the
    five-slice "+N = the suite's own count" shape because two re-pointed suites
    each gained an `it`; **count `it(` at HEAD versus now rather than inferring.**
  - `bun scripts/mutation/precheck.ts` clean — corpus total **and the
    `patches LITERALLY (N row(s))` count**, currently **15**.
  - `bun scripts/residue-census-gate.ts` OK — §A triple.
  - `bun scripts/opaque-anatomy-gate.ts` OK — its line.
  - `bun scripts/mutation/run.ts --decision D474 --allow-dirty` — `--allow-dirty`
    MANDATORY. Row count three ways. Report killed / survivor / GAP exactly.
  - `--only D275-engine-version-drifts-again --allow-dirty` if you bump the version.
    🛑 **`--only` does NOT accumulate** — loop if you need N rows.
  - find-vs-replace diff over your new rows.
  - attribution control on your central row: by hand, each killer ALONE, restore in
    a `finally`, verify by size AND sha256. 🛑 **Python's `str.replace` REJECTS a
    function second argument** — use `find`-split + join with `len(parts) == 2`.

## For my sweep prediction

Report `+K killed, +S declared survivors` — exact.

⚠️ **And report `git diff --numstat` per file for every file with deletions.** The
declared survivors live in `interpreter.ts` (12), `effects.ts` (8), `attack.ts` (7),
`continuous.ts` (5), `flow.ts` (2), `redact.ts` (1), `GameHud.tsx` (1),
`splice-gate.ts` (1). **This slice edits `attack.ts` and probably `effects.ts`, so
step three is likely** — if you delete even one line in those, name it and say
whether any survivor's reason touches it. D473's expensive audit was triggered by a
single deleted COMMENT closer; `numstat` cannot tell a comment from code.

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
**whether D473's price held and where it drifted**; **whether the ternary really is
a type error on the real file**; **the coverage debt: how many rows you added
against pre-existing machinery, and what they pin**; **your answer on file line
231's seat**; what you left and its price in one of D469's three shapes; **every
place this brief was wrong**, assuming at least one; the gates verbatim; the
per-file numstat for deletions; and the corpus delta.
