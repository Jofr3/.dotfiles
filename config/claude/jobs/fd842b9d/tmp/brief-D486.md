# D486 — the row a predecessor's audit already cleared

Repo: /home/jofre/projects/luminous_ui  (branch main, tree CLEAN at fea12fec)

## Read first

  - `scripts/autoloop/prompt.md`
  - the `## NEXT (resume point)` block in `docs/progress.md` (after D485).
  - `packages/engine/src/refusedPrintings.ts` before pricing anything (D480).
  - the `| **D479** |` row in `docs/decisions.md` — **its audit priced this row** —
    plus `| **D483** |`, `| **D485** |`.
  - `docs/conventions.md` — ⚠️ **~6,000 lines; do NOT read end to end.** Read the
    heading index, then these **by title**:
      · *"Three slices running, the decisive artefact was a board chosen from an argument"*
      · *"\"Does the op exist?\" is checkable; \"does a composition of shipped ops spell it?\" is not"*
      · *"The arithmetic-coincidence class applies to designs, not only to assertions"*
      · *"A refusal carries two claims with two different oracles — check build state first"*
      · *"A rung that tests two fields at once cannot prove either"*
      · *"A refusal witness is a tripwire whose blast radius is the whole family"*
      · *"A brief's hard-rules list is a checklist, and omissions from it read as permission"*

## State

RESIDUE **97 / 136**. Gate §A **123/97/136**. `OPAQUE` **67/98**, `COMPOUND-head`
**9/10**, `COMPOUND-tail` **2/4**, `SUBST-2` **3/4**, `PHRASE-1` **4/5**. Corpus
**2,286**, engine **0.380.0**, `MATCH_RECORD_VERSION` **29**, `ARCHIVES` **155**.
`BUILT.attack` **1596**, `units - built` **382**,
`BUILT.ability + BUILT.trainer + BUILT.specialEnergy` **405**. Survivors **42 across
nine files**. `patches LITERALLY` **21**; experiment-identity near-miss population
**8**. Version tax **60 / 79 / 59 / 16** per D485's re-measurement.

## The target

Corpus `COMPOUND-head`, **1 printing**:

> *"Your opponent discards a card from their hand. If this Pokémon evolved from
> Salandit during this turn, your opponent discards 2 more cards."*
> `KEPT ✅ builds: "Your opponent discards a card from their hand."` →
> `[{"op":"opponentDiscardsFromHand","count":1}]`
> `CUT 🛑 does NOT build: "If this Pokémon evolved from Salandit during this turn, …"`

**D479's refusal audit already examined this row and cleared its expressibility.**
Its finding, verbatim from the decisions row: *"`yourActiveEvolvedFromThisTurn`
exists; the Salandit row is 'one consequent away' — **true**; this is a PRICE, not
an expressibility refusal."* I have confirmed the member exists
(`effects.ts:2799`) and that a registry row already authors it with a different
name.

⚠️ **That is a price claim from D479, and prices in this run have been wrong more
often than right.** D470's *"two ops"* was three consumers; D474's *"zero test
rungs"* was 1,668 lines of them; D475's *"the whole of the work"* was already done;
D477 under-counted a family; D482's three-mechanism price cost one arm. **Verify
it; do not inherit it.** In particular:
  - the condition takes a `name` — does anything already read *"evolved from X
    during this turn"* from a printed sentence, or only from hand-authored registry
    rows? A clause table may or may not exist for it.
  - the consequent is *"discards **2 more** cards"* — an increment on a count the
    head already emits. Is that a second `opponentDiscardsFromHand`, a gate around
    one, or a field? 🛑 **Ask whether a COMPOSITION of shipped ops spells it and
    DRIVE the answer** (D482) — and apply the counterweight: **if two candidate
    programs agree on the boards you would naturally write, name the board where
    they differ or say you could not** (D483, D485).

## Requirements

1. **Build state first with the RIGHT oracle** (D480/D482): the 13 readers from
   `attackReaderSurface()`, run programmatically — not `programFor`, whose limits
   `refusedPrintings.ts` states for attack sentences.
2. Build it properly; the op must MEAN something on a real board.
3. New vitest suite, behavioural. ⚠️ **The load-bearing board must separate
   gate-true from gate-false AND both from the unconditional reading** — a build
   that ignores the gate and always discards 3 passes any board where the gate
   happens to be true. **Compute what each candidate answers before choosing the
   hand size**, so no two collide (D482's silently vacuous section; the symptom was
   a control passing). Include a ZERO-MATCH board with controls. Prefer a
   file-local `cardPool` (D414); check whether this sentence is already fielded as
   a refusal witness (D475) — **D485 found its candidate fielded in two files and
   the rejected one in nine**, so check before pricing.
4. ⚠️ Mutate your central arm to its NEAREST WRONG SIBLING; something OTHER than a
   census suite must go red. Twelve slices running.
5. ⚠️ **Measure what any generalisation claims over all 640 rows** (D472).
   **Describer obligations follow the CALL PATH** (D478).
6. Hand-authored rows for everything. **Read each row's `what` against its
   `replace` BEFORE probing**, and **make every discriminating rung differ from its
   control in exactly ONE axis** (D484).
7. Step the engine version only if `packages/engine` behaviour moved. Decide
   `MATCH_RECORD_VERSION` (29) and STATE which argument — ⚠️ **a new op FIELD on a
   persisted op is the costly side.**
8. Census pins if you built a sentence. **`BUILT.attack` is a RECORDED CONSTANT the
   chains subtract FROM — bump it FIRST** (D449). **MEASURE the `Math.round`
   numerator** (it holds at 18). **Step literals on a MEASUREMENT, never a
   prediction.**
9. Both instrument gates must still pass — report their lines.

## Gates before you report

  - `bun run check` GREEN — `typecheck-coverage` line too; counts re-derived by
    counting `it(` at HEAD vs now, **explaining any discrepancy** (D485's vitest
    delta was +26 against an `it(` delta of +27, because a generated-per-row suite
    lost a row — a real effect worth naming, not rounding away).
  - `bun scripts/mutation/precheck.ts` clean — corpus total, `patches LITERALLY`,
    **and the experiment-identity near-miss count (8)**.
  - `bun scripts/residue-census-gate.ts`, `bun scripts/opaque-anatomy-gate.ts`.
  - `bun scripts/mutation/run.ts --decision D486 --allow-dirty` — MANDATORY flag,
    row count three ways, killed / survivor / GAP **and `error(s)`**.
  - `--only D275-engine-version-drifts-again --allow-dirty` if you bump the version.
    🛑 **`--only` does NOT accumulate.**
  - attribution control: by hand, each killer ALONE, restore in a `finally`, verify
    by size AND sha256. 🛑 **Python's `str.replace` REJECTS a function second
    argument.**

## 🛑 Hard rules — the full list

  - **DO NOT COMMIT. DO NOT `git add`. DO NOT run a whole-corpus sweep.**
  - 🛑 **DO NOT run the end-of-session ritual — it belongs to the caller.** Leave
    `docs/progress.md`, `docs/decisions.md` and `docs/conventions.md` **untouched**,
    and do NOT step `ARCHIVES` in `progressLog.test.ts`. *(D485's brief omitted this
    line and its builder correctly read the omission as permission; it is restored
    deliberately.)*
  - Leave the tree dirty and **NAME every untracked path**.
  - **NEVER** `git stash`, `git checkout --`, `git reset --hard`, or any wholesale
    working-tree mutation.
  - **NEVER write to the tree while the harness is in flight.**
  - Never `String.replace(find, replacementString)` with a replacement read from a
    file.
  - Encode first, write second, inside `try/finally`.
  - Temp files in `$CLAUDE_JOB_DIR/tmp`, never `/tmp`.
  - Do not commit or delete `tmp/mutation-journal.json.clobbered-*`.

## For my sweep prediction

`+K killed, +S declared survivors`, exact, **naming `0 error(s)` explicitly**.
⚠️ **Report `git diff --numstat` per file for every file with deletions.** Survivors:
`interpreter.ts` 12, `effects.ts` 12, `attack.ts` 7, `continuous.ts` 5, `flow.ts` 2,
`redact.ts` 1, `src/features/game/GameHud.tsx` 1, `scripts/mutation/splice-gate.ts`
1, `packages/engine/src/refusedPrintings.ts` 1 — **42 across nine files**.

## Report back

Build state first; **whether D479's price held and where it drifted**; the
composition check and the board that separates the candidates; what you built; what
you left and its price; **every place this brief was wrong**; the gates verbatim;
the per-file numstat for deletions; and the corpus delta.
