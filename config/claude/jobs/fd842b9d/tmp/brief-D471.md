# D471 — a choice between a priced row and an unasked question

Repo: /home/jofre/projects/luminous_ui  (branch main, tree CLEAN at 2a385143)

Read FIRST and treat as binding:
  - scripts/autoloop/prompt.md
  - docs/conventions.md — ALL of it. Eight entries have landed in the last four
    days; the ones that govern this slice hardest are "A census measures whether a
    sentence is CLAIMED, never whether it is claimed CORRECTLY", "Pure addition is
    a survivor-preservation argument, and `precheck` is its proof", "Price a left
    row and write the price down", and D465's rule that **an instrument that
    measures the repo must be killable by the corpus**.
  - the `## NEXT (resume point)` block in docs/progress.md (written after D470) —
    sections (3), (4) and (6) are this brief's source and are more detailed than
    the summary below.
  - the D468..D470 rows in docs/decisions.md.

## The state

Residue at HEAD: **112 sentences / 156 printings**. Gate §A: **138 / 112 / 156**.
Corpus **2,113**, all verdicts clean, engine **0.369.0**,
`MATCH_RECORD_VERSION` **29**, `ARCHIVES` **140** (🛑 the RITUAL's to step, never
yours — stepping it turns `bun run check` RED).

## You are choosing between two slices. Decide, justify, and do ONE.

### (A) The priced row — file line 580, re-priced first

*"This attack does 40 damage for each Basic Energy attached to this Pokémon."*
Classifier: deleting «Basic» builds
`deriveAttackDamageMultiplier → {per:40,count:{kind:"energyOnSelf",energyType:null}}`.

It is **not** data-blocked: `InPlayPokemon.energy` is a `string[]` of card uids and
`specialEnergyUids` / `isSpecialEnergy` already tell Basic from Special off the
`energyType` column. D469 priced it at four consumers of the shared
`BasicEnergyType | "special" | null` vocabulary. ⚠️ **That price is stale** —
`countEnergyInPlay` gained an optional parameter at D470 and has three call sites
of its own.

🛑 **And there is a semantic question the plumbing hides, which you must answer
BEFORE deciding to build:** what does `"basic"` mean for a **wildcard Luminous**
energy? That is a *provision-vs-printed-class* question the type does not currently
pose anywhere in the codebase. If the honest answer requires inventing a rule that
no printed card forces, that is a reason to decline — say so with the evidence.
D470's lesson applies directly: **enumerate the shared helper's call sites and
report the number whether or not you build.**

### (B) The unasked question — the anatomy of `OPAQUE`

`OPAQUE` is **78 sentences / 112 printings**, by far the largest class in the
residue, and **it has not moved in FOUR slices** while everything around it fell.
The classifier defines it only negatively: *no deletion and no substitution this
instrument can make reaches a built string*. Nobody has ever asked **why**, or
whether it is one thing or many.

That is a measurement slice in the lineage of D455 (`opcoverage.ts`), D459
(`residue-census.ts`) and D465 (`residue-census-gate.ts`) — each of which produced
an instrument that now drives targeting. If you take it:
  - **Publish the instrument, not only the number** (D454's lesson: a headline
    structural claim built on an unpublished predicate was falsified one slice
    later). A committed script, not a paragraph of findings.
  - 🛑 **D465's rule is binding: an instrument that measures the repo must be
    KILLABLE BY THE CORPUS.** Hand-author mutant rows against your own classifier
    with a real killer, or gate it the way `residue-census-gate.ts` gates the
    census. An instrument nothing can turn red is a vacuous guard with a number
    attached.
  - The deliverable is a partition with names — *why* each OPAQUE sentence is
    opaque, in categories a future brief can act on (needs an op that does not
    exist / needs two mechanisms at two seams / needs a schema column / is a
    compound whose head is itself unbuilt / etc.), with counts.
  - **Say what your instrument CANNOT see**, out loud, the way D467's session log
    does for its three instruments.

**My read, which you should overturn if the source disagrees:** (B) is the better
slice. `OPAQUE` standing still for four slices while the reachable classes drain is
the strongest untested signal in the residue, and the last three measurement slices
each paid for themselves several times over. (A) is a single printing whose price
is uncertain and whose semantic question may not have a printed answer. But you
have the source and I do not — **if the `"basic"` question turns out to have a
clean answer and the consumer count is small, (A) is a legitimate choice.**

🛑 **Do NOT take corpus file line 199** (*"Each player draws 3 cards."*) — D469
established it costs `MATCH_RECORD_VERSION` 29 → 30, since `drawCards` is
`{op,count,recordAs?}` with no seat field *deliberately* (refusal at
`effects.ts:9296-9298`). That is a slice with its own version argument, not a rider.

🛑 **Still off the table** (seventh slice running): the `Ancient`/`Future` family,
blocked on a schema column that does not exist — `typedSelfSwitch.test.ts` §9
already fails the day ingest lands it. Also off: file line 412, and file lines
529/539/616/572.

## Requirements either way

1. A new test suite for whatever you produce, behavioural where behaviour exists.
   If you build a sentence: a ZERO-MATCH board with controls that distinguish it
   from silence-for-another-reason, and a board where several plausible wrong
   implementations each answer a DIFFERENT number. Prefer a file-local `cardPool`
   (D414) over a new `FIXTURE_POOL` id.
2. Hand-authored mutant rows for everything you add. `expectKilledBy` names your
   suite; `find` must occur exactly once in its target; a `survives` row still
   needs `expectKilledBy` or the runner crashes silently. Any row declared
   `equivalent` MUST state WHICH KIND of disjointness it rests on — guarded (then a
   companion deletion row must exist and be KILLED) or structural (no guard, and
   correctly none).
3. ⚠️ **D469/D470's convention, honoured hardest:** mutate your central new arm to
   its NEAREST WRONG SIBLING and check that something OTHER than a census suite
   goes red. D470 reproduced this with four blind suites. If only the census
   reddens, the thing is claimed but not built.
4. Step the engine version. ⚠️ A version bump re-points
   `D275-engine-version-drifts-again`, which `--decision D471` CANNOT see — probe
   it with `--only`. Decide `MATCH_RECORD_VERSION` (29) on the SERIALIZED-ALPHABET
   argument and STATE it.
5. Census pins in `censusAtHead.test.ts`. ⚠️ The tax is **not** confined to that
   file and its shape has differed every slice — D469's was 54 edits across 14
   files; D470's was 21 front terms across 8 files, 20 live heads, and **eight
   numerically distinct literals in `censusAtHead.test.ts` alone**, including two
   (`BUILT.attack`, `RAW_UNBUILT_ATTACK_UNITS`) that **no grep for the headline
   figures finds**. Expect several `check` rounds; the masked-second-failure effect
   (D431/D464) has fired in every round of the last two slices. ⚠️ That file holds
   two numerically-close quantities that must not be swept together: `units - built`
   is **402**, while `BUILT.ability + BUILT.trainer + BUILT.specialEnergy` STAYS
   **405**. Anchor on whole expressions, never a bare number. ⚠️
   `opponentResistanceBonus.test.ts`'s eleven `- 1` terms are **D467's** and may
   take a 0 term — check, do not sweep.
6. ⚠️ `scripts/residue-census-gate.ts` holds **NO pinned literals of its own** — it
   reads them out of `censusAtHead.test.ts` and §A only checks that they AGREE.

## Gates before you report

  - `bun run check` GREEN — exact counts, delta **re-derived** not carried (the
    same shape has now repeated four slices running, which is a measurement, not a
    licence).
  - `bun scripts/mutation/precheck.ts` clean — report the corpus total. It now also
    reports that `run.ts` patches LITERALLY; **if that line ever disappears, eleven
    rows are silently splicing megabytes again and all of them report KILLED.**
  - `bun scripts/residue-census-gate.ts` OK — report the §A triple.
  - `bun scripts/mutation/run.ts --decision D471 --allow-dirty` — `--allow-dirty` is
    MANDATORY on a dirty tree. `--decision` matches by `String.includes`; check the
    row count both ways. Report killed / survivor / GAP exactly.
  - `--only D275-engine-version-drifts-again --allow-dirty` after the version bump.
    🆕 ⚠️ **`--only` does NOT accumulate** — passing it several times silently runs
    ONE row and prints a green-looking total. Loop if you need N rows.
  - find-vs-replace diff over your new rows (an INERT row is invisible to precheck).
  - attribution control on your central row: apply by hand, run each candidate
    killer ALONE, restore in a `finally`, verify by size AND sha256.

## For my sweep prediction

Report the corpus delta as `+K killed, +S declared survivors` — I commit the
predicted whole-corpus line BEFORE the sweep, so it must be exact.

⚠️ **And tell me whether every hunk is a PURE ADDITION** (no existing line
modified) or, if not, name every file where you modified an existing line and what
that line was. That argument, with `precheck` as its witness, is how I clear
declared survivors living in files you touched.

## Hard rules

  - DO NOT COMMIT. DO NOT `git add`. DO NOT run a whole-corpus sweep. Leave the
    tree dirty and NAME every untracked path — `git commit -a` cannot see them.
  - NEVER `git stash`, `git checkout --`, `git reset --hard`, or any wholesale
    working-tree mutation.
  - Never `String.replace(find, replacementString)` with a replacement read from a
    file (`$&` / `` $` `` splice) — this is the defect D470 just found in the
    harness itself, after the rule had been in the conventions since D462. Use a
    function replacement and assert file size.
  - Encode first, write second, inside `try/finally`.
  - Temp files in $CLAUDE_JOB_DIR/tmp, never /tmp.

## Report back

Which slice you chose and **why, with the evidence that decided it** — including,
if you chose (B), the answer to the `"basic"`/Luminous question and the consumer
count you measured, since the next slice inherits them either way. Then: what you
built; what you left and its price in one of D469's three shapes (bigger than it
looks / smaller than its reputation / version-costing); **every place this brief
was wrong** — assume at least one; the gate results verbatim; the pure-addition
answer; and the corpus delta.
