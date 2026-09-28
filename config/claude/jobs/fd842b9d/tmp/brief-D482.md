# D482 — two rows the banner does not block

Repo: /home/jofre/projects/luminous_ui  (branch main, tree CLEAN at 542bfeda)

## Read first

  - `scripts/autoloop/prompt.md`
  - the `## NEXT (resume point)` block in `docs/progress.md` (written after D481) —
    **sections (4)–(8).**
  - `packages/engine/src/refusedPrintings.ts` — **read this BEFORE pricing
    anything.** It exists to stop D480 recurring, and lists 9 refusals with their
    surfaces (3 ability, 4 trainer, 1 tool, plus resolved ones).
  - the `| **D480** |` and `| **D481** |` rows in `docs/decisions.md`.
  - `docs/conventions.md` — ⚠️ **~6,000 lines; do NOT read end to end.** Read the
    heading index, then these entries **by title**:
      · *"A refusal carries two claims with two different oracles — check build state first"*
      · *"Two instruments over one population: reading one is a sample, not a survey"*
      · *"The three defect classes a `find`/`replace`/`what` diff catches"*
      · *"The danger of an unkillable row is not that it fails — it is that it PASSES"*
      · *"A wider anchor that claims the same rows is not free — it is pure risk"*
      · *"Closing a verification hole changes the standing of every past measurement over it"*

## State

RESIDUE **101 / 140**. Gate §A **127 / 101 / 140**. `OPAQUE` **69/100**,
`COMPOUND-head` **10/11**, `SUBST-2` **4/5**, `PHRASE-1` **4/5**. Corpus **2,246**,
engine **0.377.0**, `MATCH_RECORD_VERSION` **29**, `ARCHIVES` **151** (🛑 RITUAL's).
`BUILT.attack` **1592**, `units - built` **386**,
`BUILT.ability + BUILT.trainer + BUILT.specialEnergy` **405**. Declared survivors
**41 across nine files**. ✅ **`scripts/` is now typechecked** — a mis-keyed field
in a mutant row dies to `bun run typecheck` in ~38s instead of a 2.7-hour sweep.

## The two candidates

The reachable classes have drained to the point where **almost everything left in
`SUBST-2` and `PHRASE-1` is `Ancient`/`Future`-blocked** — no `cardSchema` column
carries a banner, nineteenth slice running. **Exactly two rows are not.** Verbatim
from `bun scripts/residue-census.ts`:

**(A)** `SUBST-2`, 1 printing:
> *"This attack does 30 damage to each of your opponent's Pokémon. (Don't apply
> Weakness and Resistance for Benched Pokémon.)"*
> `SUBST «each» → «1»` builds
> `[{op:"damageChosen",target:"opponentAny",amount:30,count:1,source:"attack",deals:true}]`

A board-wide spread where a *chosen single target* already ships. **My read, to be
checked:** the blocker is quantifier, not vocabulary — `damageChosen` picks one, and
"each" needs a spread that hits every body on that side. Check whether a spread op
already exists (there are shipped `…Spread`/`…Each` ops elsewhere in this engine)
before assuming a new one is needed.

**(B)** `PHRASE-1`, 1 printing:
> *"This attack does 40 damage for each Basic Energy attached to this Pokémon."*
> deleting «Basic» builds
> `deriveAttackDamageMultiplier → {per:40,count:{kind:"energyOnSelf",energyType:null}}`

**Priced twice before and the price moved both times.** D469 said four consumers of
the shared `BasicEnergyType | "special" | null` vocabulary; D471 re-measured it at
**13 consumers across 21 production call sites** for this 1 printing, plus a
uniformity bill — three shipped comments assert the refusal holds across zones, so
building only one arm ships an asymmetry those comments deny. ⚠️ **D471 also
established the semantic question is CLOSED**: Luminous is a Special-class card
whatever it provides, and two shipped derivers already read the printed word
`Basic` to a class filter.

## What to do

🛑 **CHECK BUILD STATE FIRST, for whichever you take** (D480). `programFor` is the
cheaper query, three prose rules failed to enforce it, and the last two slices both
turned on a claim about what already ships. Run **BOTH** instruments (D477).

**Then take whichever is genuinely cheapest and say why.** If (A)'s spread op
already exists, it is probably the cheaper row despite (B) having two prior
pricings. **If both are dearer than something in `COMPOUND-head` (10/11) or the
`MULTI` classes, take that instead and say so** — a well-argued switch is the
deliverable, and the classes have moved since anyone last read them.

⚠️ **If you take (B), the 13-consumer price is the one to verify, not re-derive.**
It has been measured twice and moved both times; a third independent measurement is
worth more than trusting either.

## Requirements

1. Build it properly; the op must MEAN something on a real board.
2. New vitest suite, behavioural. **For a spread**, the load-bearing board has
   bodies at different HP with a KO among them, so *hit-everything*,
   *hit-active-only* and *hit-bench-only* are three distinguishable answers, and
   the W/R suppression tail is driven rather than assumed. **For an energy count**,
   drive a pile mixing Basic and Special so the filter's presence is observable.
   Include a ZERO-MATCH board with controls. Prefer a file-local `cardPool` (D414);
   check first whether the sentence is already fielded as a refusal witness (D475).
3. ⚠️ Mutate your central arm to its NEAREST WRONG SIBLING; something OTHER than a
   census suite must go red. Nine slices running.
4. ⚠️ **Measure what any generalisation claims over all 640 rows** (D472); an
   override is legitimate only as a recorded rung (D477). **Describer obligations
   follow the CALL PATH, not the op's category** (D478).
5. Hand-authored rows for everything. **Read each row's `what` against its `replace`
   BEFORE probing** — three defect classes in four slices, the newest being rows
   that are live and correctly described but **unkillable by their own suite**.
6. Step the engine version only if `packages/engine` behaviour moved. Decide
   `MATCH_RECORD_VERSION` (29) and STATE which argument you make.
7. Census pins if you built a sentence. **Derive the tax shape** — nine slices, nine
   readings. ⚠️ **`BUILT.attack` is a RECORDED CONSTANT the chains subtract FROM —
   bump it FIRST** (D449). ⚠️ **MEASURE the `Math.round` numerator.** ⚠️ **Do not
   step a census literal on a PREDICTION — step it on a MEASUREMENT** (D480's brief
   predicted 405 would move; it could not).
8. Both instrument gates must still pass — report their lines.

## Gates before you report

  - `bun run check` GREEN — counts re-derived by counting `it(` at HEAD vs now.
    ⚠️ It now runs `typecheck-coverage` FIRST; report that line too.
  - `bun scripts/mutation/precheck.ts` clean — corpus total **and
    `patches LITERALLY (N)`, now 18**; ⚠️ the hazard is that number FALLING.
  - `bun scripts/residue-census-gate.ts`, `bun scripts/opaque-anatomy-gate.ts`.
  - `bun scripts/mutation/run.ts --decision D482 --allow-dirty` — MANDATORY flag,
    row count three ways, report killed / survivor / GAP **and `error(s)`**.
  - `--only D275-engine-version-drifts-again --allow-dirty` if you bump the version.
    🛑 **`--only` does NOT accumulate.**
  - attribution control: by hand, each killer ALONE, restore in a `finally`, verify
    by size AND sha256. 🛑 **Python's `str.replace` REJECTS a function second
    argument** — `find`-split + join with `len(parts) == 2`.

## 🛑 The operator rule

**NEVER write to the tree while the harness is in flight.** If a probe is
interrupted, verify tree integrity by size + sha256 on every survivor-housing file
before doing anything else, then re-probe alone.

## For my sweep prediction

Report `+K killed, +S declared survivors`, exact, **naming `0 error(s)`
explicitly**. Match each survivor's evidence to the shape of its reason.

⚠️ **Report `git diff --numstat` per file for every file with deletions.** Declared
survivors: `interpreter.ts` 12, `effects.ts` 11, `attack.ts` 7, `continuous.ts` 5,
`flow.ts` 2, `redact.ts` 1, `src/features/game/GameHud.tsx` 1,
`scripts/mutation/splice-gate.ts` 1, `packages/engine/src/refusedPrintings.ts` 1 —
**41 across nine files**. Name every deleted line in any of those nine.

## Hard rules

  - DO NOT COMMIT. DO NOT `git add`. DO NOT run a whole-corpus sweep. Leave the tree
    dirty and NAME every untracked path.
  - NEVER `git stash`, `git checkout --`, `git reset --hard`, or any wholesale
    working-tree mutation.
  - Never `String.replace(find, replacementString)` with a replacement read from a
    file.
  - Encode first, write second, inside `try/finally`.
  - Temp files in `$CLAUDE_JOB_DIR/tmp`, never `/tmp`.
  - Do not commit or delete `tmp/mutation-journal.json.clobbered-*`.

## Report back

Which row you took and **why, with the build-state check stated first**; whether
(B)'s 13-consumer price held if you verified it; what you built; what you left and
its price in one of D469's three shapes; **every place this brief was wrong**,
assuming at least one; the gates verbatim; the per-file numstat for deletions; and
the corpus delta.
