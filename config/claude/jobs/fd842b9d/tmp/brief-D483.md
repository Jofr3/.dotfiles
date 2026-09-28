# D483 — the `ex`/`V` class narrowing, which four residue rows share

Repo: /home/jofre/projects/luminous_ui  (branch main, tree CLEAN at b36fcc1d)

## Read first

  - `scripts/autoloop/prompt.md`
  - the `## NEXT (resume point)` block in `docs/progress.md` (after D482) —
    **sections (4)–(7).**
  - `packages/engine/src/refusedPrintings.ts` before pricing anything (D480).
  - the `| **D482** |` row in `docs/decisions.md`, plus D480 and D481.
  - `docs/conventions.md` — ⚠️ **~6,000 lines; do NOT read end to end.** Read the
    heading index, then these **by title**:
      · *"\"Does the op exist?\" is checkable; \"does a composition of shipped ops spell it?\" is not"*
      · *"A refusal carries two claims with two different oracles — check build state first"*
      · *"The unkillable-as-written class is not confined to mutant rows"*
      · *"A refusal witness is a tripwire whose blast radius is the whole family"*
      · *"Two instruments over one population: reading one is a sample, not a survey"*
      · *"A wider anchor that claims the same rows is not free — it is pure risk"*

## State

RESIDUE **100 / 139**. Gate §A **126 / 100 / 139**. `OPAQUE` **69/100**,
`COMPOUND-head` **10/11**, `COMPOUND-tail` **2/4**, `SUBST-2` **3/4**, `PHRASE-1`
**4/5**. Corpus **2,255**, engine **0.378.0**, `MATCH_RECORD_VERSION` **29**,
`ARCHIVES` **152** (🛑 RITUAL's). `BUILT.attack` **1593**, `units - built` **385**,
`BUILT.ability + BUILT.trainer + BUILT.specialEnergy` **405**. Survivors **41 across
nine files**. `patches LITERALLY` **21** — ⚠️ the hazard is it FALLING.

## The cluster — one blocker, four rows, six printings

D482 built the unfiltered whole-side spread by **composing two shipped ops**. Its
`ex`/`V`-narrowed siblings are still unbuilt, and **so is the snipe with the same
narrowing**. Measured over the residue, four rows name `Pokémon ex` or `Pokémon V`
as a *target* narrowing:

  1. *"This attack does 60 damage to each of your opponent's Pokémon ex. This
     attack's damage isn't affected by Weakness or Resistance."* — **2 printings**
  2. *"This attack does 100 damage to each of your opponent's Pokémon ex and
     Pokémon V. …"* — **2 printings**
  3. *"This attack does 60 damage to 1 of your opponent's Benched Pokémon ex or
     Benched Pokémon V. (Don't apply Weakness and Resistance for Benched
     Pokémon.)"* — **1 printing**
  4. *"Discard all Energy from this Pokémon, and this attack does 210 damage to 1
     of your opponent's Benched Pokémon ex. (…)"* — **1 printing** (this is the
     long-standing "file line 111")

**That is 4 sentences / 6 printings behind ONE class narrowing** — the largest
single-blocker cluster left in the residue. **Verify that count yourself**; it is
mine, from a grep over the census output, and D477 established that an enumeration
is only as good as the window it was read through. **Publish a pattern.**

## What the prior pricing says, and what to do with it

D472 priced the `ex` narrowing and D477 re-confirmed it on inspection:
`damageChosen` carries five riders — `optional`, `deals`, `perTakenPrize`,
`perEnergyOnSelf`, `damagedOnly` — and **none narrows the candidate CLASS**;
`damagedOnly` narrows on a BOARD fact off an `InPlayPokemon`, where `ex` is a CARD
fact (`Card.suffix`, which `suffixPokemon` reads). It called for a new op FIELD on a
PARKING op, with D334/D421's optional-vs-required question live.

🛑 **But D482 just showed that "does the op have a field for it?" is the same
family of question as "does the op exist?" — and that the answer to the useful
question was different.** So, in order:

1. **Build state first, with the RIGHT oracle** (D480/D482): for attack sentences
   that is the 13 readers from `attackReaderSurface()`, run programmatically — not
   `programFor`, whose limits `refusedPrintings.ts` states.
2. **Then ask the composition question explicitly and DRIVE it.** Can any of these
   be spelled by shipped ops — a filtered count, an existing class-aware helper,
   `CardFilter`'s `suffixPokemon`, a gate over a per-body condition? D482's row was
   priced at three mechanisms for 35 decisions because nobody asked.
3. **Only then price a field.** If a field really is needed, note that **rows 1–2
   are a SPREAD and rows 3–4 are a SNIPE** — they may not share an address even
   though they share a printed word. **Say whether one field serves all four or
   whether this is two mechanisms**, because that decides whether the cluster is
   one slice or two.
4. **Take whatever subset is genuinely coherent.** If only the spread half is
   cheap, build that and price the rest. **A partial with an accurate price beats a
   forced whole.**

⚠️ **Rows 1–2 carry a W/R suppression tail** (*"isn't affected by Weakness or
Resistance"*). D465/D467 recorded that `DAMAGE_SUPPRESSION` has no
Weakness-only arm and `splitAttackTrailingClause` demands a `deriveAttackEffect`
tail — **check whether that applies here or whether the tail composes**, since
D482's Bench half is already W/R-free by construction.

## Requirements

1. Build it properly; the op must MEAN something on a real board.
2. New vitest suite, behavioural. ⚠️ **For a class-narrowed spread the load-bearing
   board mixes `ex`, `V` and plain bodies at different HP**, so
   hit-everything / hit-ex-only / hit-ex-and-V are three distinguishable answers.
   🆕 **And compute what each candidate implementation would answer BEFORE choosing
   the damage values** — D482 found a section silently vacuous because two readings
   produced byte-identical boards at the printed damage, and **the symptom was a
   control passing**. Include a ZERO-MATCH board (no `ex` on the opponent's side)
   with controls separating it from silence-for-another-reason. Prefer a file-local
   `cardPool` (D414); check first whether any of these sentences is already fielded
   as a refusal witness (D475) — **and if so, expect re-pointing it to be part of
   the work** (D482's widening was caught by a witness D189 wrote).
3. ⚠️ Mutate your central arm to its NEAREST WRONG SIBLING; something OTHER than a
   census suite must go red. Ten slices running.
4. ⚠️ **Measure what any generalisation claims over all 640 rows** (D472); an
   override is legitimate only as a recorded rung (D477). **Describer obligations
   follow the CALL PATH** (D478).
5. Hand-authored rows for everything. **Read each row's `what` against its `replace`
   BEFORE probing.** ⚠️ **If you make any field REQUIRED, that is a corpus-wide
   edit** — a dependent `replace` omitting it reports ERROR, and `precheck` gates
   `find` only (D476).
6. Step the engine version only if `packages/engine` behaviour moved. Decide
   `MATCH_RECORD_VERSION` (29) and STATE which argument. ⚠️ **A new op FIELD on a
   persisted op is the costly side** — if you add one, say plainly whether 29 → 30.
7. Census pins if you built a sentence. **Derive the tax shape.** ⚠️ **`BUILT.attack`
   is a RECORDED CONSTANT the chains subtract FROM — bump it FIRST** (D449).
   ⚠️ **MEASURE the `Math.round` numerator.** ⚠️ **Step literals on a MEASUREMENT,
   never a prediction.** ⚠️ **The version tax is 57 assertions / 73 sites across 57
   files including 13 `it(…)` TITLES** — `index.ts` still forecasts a stale 37/41.
8. Both instrument gates must still pass — report their lines.

## Gates before you report

  - `bun run check` GREEN — `typecheck-coverage` line too; counts re-derived by
    counting `it(` at HEAD vs now, **and explain any discrepancy rather than
    rounding it away** (D482's was +27 for a 26-test suite: one comment mentioned
    `` `it(…)` ``).
  - `bun scripts/mutation/precheck.ts` clean — corpus total and `patches LITERALLY`.
  - `bun scripts/residue-census-gate.ts`, `bun scripts/opaque-anatomy-gate.ts`.
  - `bun scripts/mutation/run.ts --decision D483 --allow-dirty` — MANDATORY flag,
    row count three ways, killed / survivor / GAP **and `error(s)`**.
  - `--only D275-engine-version-drifts-again --allow-dirty` if you bump the version.
    🛑 **`--only` does NOT accumulate.**
  - attribution control: by hand, each killer ALONE, restore in a `finally`, verify
    by size AND sha256. 🛑 **Python's `str.replace` REJECTS a function second
    argument.**

## 🛑 The operator rule

**NEVER write to the tree while the harness is in flight.**

## For my sweep prediction

`+K killed, +S declared survivors`, exact, **naming `0 error(s)` explicitly**.
Match each survivor's evidence to the shape of its reason.

⚠️ **Report `git diff --numstat` per file for every file with deletions.** Survivors:
`interpreter.ts` 12, `effects.ts` 11, `attack.ts` 7, `continuous.ts` 5, `flow.ts` 2,
`redact.ts` 1, `src/features/game/GameHud.tsx` 1, `scripts/mutation/splice-gate.ts`
1, `packages/engine/src/refusedPrintings.ts` 1 — **41 across nine files**.

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

**The cluster measurement first** (your pattern, its rows and printings, versus my
four/six); **the composition check and what it found**; whether one field serves all
four or this is two mechanisms; what you built and what you left with its price;
**every place this brief was wrong**; the gates verbatim; the per-file numstat for
deletions; and the corpus delta.
