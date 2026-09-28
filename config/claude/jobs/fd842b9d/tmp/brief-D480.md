# D480 — the two registry rows the audit uncovered

Repo: /home/jofre/projects/luminous_ui  (branch main, tree CLEAN at 07734a30)

## Read first

  - `scripts/autoloop/prompt.md`
  - the `## NEXT (resume point)` block in `docs/progress.md` (written after D479) —
    **sections (4)–(9) are this slice's work order and constraints.**
  - the `| **D479** |` row in `docs/decisions.md` (the audit that found this row),
    plus D477 and D478.
  - `docs/conventions.md` — ⚠️ **it is ~6,000 lines; do NOT read it end to end.**
    Read its heading index, then these entries **by title**:
      · *"Audit refusals from the zero-mutant-row set, not from the residue's class table"*
      · *"A refusal has three failure modes, and only two of them overturn anything"*
      · *"The three defect classes a `find`/`replace`/`what` diff catches"*
      · *"The danger of an unkillable row is not that it fails — it is that it PASSES"*
      · *"A brief that cannot be followed literally is a brief that gets followed approximately"*
      · *"An anchor with zero mutant rows is evidence its doc block has never been re-read"*
      · *"A declared survivor's reason is a claim about a POPULATION; a probe is a claim about a SUITE"*
    plus anything the index suggests is relevant to registry authoring.
    *(D479 found the previous phrasing of this section — "read ALL of it", and a
    pointer to "the last three entries" of a non-chronological file — unfollowable.
    This is the corrected form.)*

## State

RESIDUE **101 sentences / 140 printings**. Gate §A **127 / 101 / 140**. `OPAQUE`
**69/100**. Corpus **2,227**, engine **0.377.0**, `MATCH_RECORD_VERSION` **29**,
`ARCHIVES` **149** (🛑 the RITUAL's — eleven work orders, ten builders refusing).

## The target — and it is a different KIND of slice

D479's audit falsified `handRefresh`'s doc block, which had refused two printings
for *"a play gate no `BoardCondition` spells and `GameState` carries no datum for"*.
Every mechanism ships:

  - `trainerPlayableIf` / `registry.ts`'s `playableIf?: BoardCondition`, read at
    `cardplay.ts:139` — and `registry.ts` **already authors one**;
  - `BoardCondition`'s `{ kind: "yourPokemonKoedOnOpponentsLastTurn"; owner?; byAttack? }`
    (`effects.ts:3002`, D271, widened D326);
  - `GameState.lastKoTurn` / `lastKoMarks`, with
    `koedDuringOpponentsLastTurn` / `koedMarksOnOpponentsLastTurn` reading them;
  - `handRefresh { who: "both", draw: { kind: "perSeat" } }`.

**The cards: Unfair Stamp `sv06-165`, Team Rocket's Archer `sv10-170` / `-223`.**
D479 priced this as **two hand-authored `registry.ts` rows and nothing else**.

⚠️ **Verify that price; do not inherit it.** Six of the last eight slices found an
inherited price wrong in its expensive clause, and D477 found one wrong by
*under*-counting. In particular check: does `perSeat` mean what these cards print;
is the `owner?` / `byAttack?` narrowing needed for either; and does either card
print anything beyond the gate and the refresh.

🛑 **THIS SLICE MOVES A DIFFERENT CENSUS, AND THAT IS THE MAIN HAZARD.** It is a
**trainer** slice, not an attack slice:
  - **`BUILT.ability + BUILT.trainer + BUILT.specialEnergy` = 405 WILL MOVE.** Every
    previous brief has told its builder that sum **STAYS 405** and to anchor on
    whole expressions so it is never swept. **That instruction is now wrong for this
    slice.** Step it deliberately, and check whether anything treats it as a frozen
    endpoint (D461/D463 — a red run names the endpoint, so the wrong edit is the one
    the tool names).
  - **`BUILT.attack` and the attack residue should NOT move.** If they do, something
    is wrong — say so rather than stepping them.
  - Re-derive which census literals move from the instruments, not from the
    attack-slice pattern seven predecessors used.

**If the price turns out wrong and this is bigger than two rows, say so with the
evidence and take the cheapest true thing instead.** A well-argued switch is the
deliverable.

## Also priced and available (D479), if you switch

  - **Corpus 487** — *"…draw a card for each card in your opponent's hand."* (1p) —
    **VERSION-COSTING**: a fifth `HandRefreshDraw` member, and a new member in a
    persisted union is the costly side → **`MATCH_RECORD_VERSION` 29 → 30**.
  - **Corpus 529** (Cynthia + bare Weakness) — vocabulary is ~2 lines and **the
    leading half builds today** (one of D479's four falsifications), but it costs a
    FIFTH splitter **plus teaching `builds()` in two instruments** — an instrument
    change needs a killer — for a measured payoff of **1 sentence / 1 printing**.
  - **Corpus 569** — a `toSelf` rider **plus a pre-damage seam**.
  - **File line 268** — a SEAM, not a vocabulary; refusal witness in three files.
  - **File line 111** — a new op FIELD on a PARKING op.
  - **File line 537** — owes a **FIFTH** negative-control home.
  - 🛑 **Off the table:** `Ancient`/`Future`/`Tera` — no `cardSchema` column carries
    a banner (seventeenth slice).

## Requirements

1. Build it properly; the gate and the refresh must both MEAN something on a real
   board — **including the negative case**, where the gate is false and the card
   cannot be played.
2. New vitest suite, behavioural. ⚠️ **For a play gate the load-bearing boards are
   the two sides of the gate driven separately**, plus a board where the gate is
   true for the *wrong reason* (a KO on your own turn, or the opponent's Pokémon
   KO'd rather than yours) — a gate that reads "any KO" passes the naive board and
   fails that one. Include a ZERO-MATCH board with controls separating it from
   silence-for-another-reason. Prefer a file-local `cardPool` (D414); check first
   whether either card is already fielded as a refusal witness (D475).
3. ⚠️ Mutate your central change to its NEAREST WRONG SIBLING and check something
   OTHER than a census suite goes red. Eight slices running.
4. Hand-authored mutant rows for everything. **Read each row's `what` against its
   `replace` BEFORE probing** — three distinct defect classes caught in three
   slices, the newest being a row that was live and correctly described but
   **unkillable by its own suite**, which would have shipped as a silent survivor.
5. Step the engine version only if `packages/engine` behaviour moved. Decide
   `MATCH_RECORD_VERSION` (29) on the serialized-alphabet argument **and** on
   reachability, and STATE which you are making.
6. Both gates must still pass — report their lines. ⚠️ **A registry row may move the
   anatomy's built-target count without moving `OPAQUE`** — check rather than assume.

## Gates before you report

  - `bun run check` GREEN — counts re-derived by counting `it(` at HEAD vs now.
  - `bun scripts/mutation/precheck.ts` clean — corpus total **and
    `patches LITERALLY (N)`, now 18**; ⚠️ **the hazard is that number FALLING.**
  - `bun scripts/residue-census-gate.ts`, `bun scripts/opaque-anatomy-gate.ts`.
  - `bun scripts/mutation/run.ts --decision D480 --allow-dirty` — MANDATORY flag,
    row count three ways, report killed / survivor / GAP **and `error(s)`**.
  - `--only D275-engine-version-drifts-again --allow-dirty` if you bump the version.
    🛑 **`--only` does NOT accumulate** — one decision per invocation.
  - find-vs-replace diff over your new rows.
  - attribution control: by hand, each killer ALONE, restore in a `finally`, verify
    by size AND sha256. 🛑 **Python's `str.replace` REJECTS a function second
    argument** — `find`-split + join with `len(parts) == 2`.

## 🛑 The operator rule

**NEVER write to the tree while the harness is in flight.** If a probe is
interrupted, verify tree integrity by size + sha256 on every survivor-housing file
before doing anything else, then re-probe alone.

## For my sweep prediction

Report `+K killed, +S declared survivors`, exact, **naming `0 error(s)`
explicitly**. Match each survivor's evidence to the shape of its reason — local
reasons are settled by a probe, population-quantifying ones only by the full run.

⚠️ **Report `git diff --numstat` per file for every file with deletions.** Declared
survivors: `interpreter.ts` 12, `effects.ts` 11, `attack.ts` 7, `continuous.ts` 5,
`flow.ts` 2, `redact.ts` 1, `src/features/game/GameHud.tsx` 1,
`scripts/mutation/splice-gate.ts` 1 — **40 total**. Name every deleted line in any
of those eight. ⚠️ **`registry.ts` houses none of them** — worth confirming, since
this slice's centre of gravity is there.

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

**Whether D479's two-rows price held**, and what it actually cost; **which census
literals moved and which did not** — especially the 405 sum and whether anything
treated it as frozen; what you built; what you left and its price in one of D469's
three shapes; **every place this brief was wrong**, assuming at least one; the gates
verbatim; the per-file numstat for deletions; and the corpus delta.
