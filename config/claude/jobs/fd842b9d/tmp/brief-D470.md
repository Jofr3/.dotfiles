# D470 — a row that is already priced, and the price is what you check first

Repo: /home/jofre/projects/luminous_ui  (branch main, tree CLEAN at ba99844f)

Read FIRST and treat as binding:
  - scripts/autoloop/prompt.md
  - docs/conventions.md — ALL of it. Four entries landed in the last two days and
    they govern this slice directly: "A census measures whether a sentence is
    CLAIMED, never whether it is claimed CORRECTLY"; "Price a left row and write
    the price down"; "`equivalent` is a verdict, not a reason"; and "Pure addition
    is a survivor-preservation argument, and `precheck` is its proof".
  - the `## NEXT (resume point)` block in docs/progress.md (written after D469) —
    sections (3) and (4) are this brief's source and are more detailed than what
    is repeated below.
  - the D467..D469 rows in docs/decisions.md

## The candidate, and the ONE thing that decides whether you build it

D469 priced three residue rows and left them. The nominated next row is:

  corpus **file line 558** — *"This attack does 20 more damage for each {L} Energy
  attached to all of your Iono's Pokémon."* — 1 legal printing.
  Classifier: deleting «Iono's» builds
  `deriveAttackDamageBonus → {per:20,count:{kind:"energyOnSelf",zone:"board",energyType:"Lightning"}}`

**It passes D468's schema test**: `CardFilter.ownerPokemon` has shipped since D200
and reads `Card.name`, a real column. So this is not data-blocked.

**It was left for a SIZE reason, and that size is the first thing you must
measure.** The recorded price is: a new `filter?: CardFilter` on `energyOnSelf`
**plus** a widening of `countEnergyInPlay` — **which `energyOnOpponent` also
calls**. D454's rule applies: *a shared helper is the implementation of every op
that calls it*, so touching it puts every caller in the blast radius.

🛑 **DO THIS BEFORE WRITING ANY CODE.** Enumerate every caller of
`countEnergyInPlay` and every consumer that would have to learn the new filter.
Then choose:

  - **If the blast radius really is two ops** — build it. That is a fair slice.
  - **If it opens wider than that** — do NOT force it. Say so with the caller list
    as evidence, and take one of these instead:
      (a) corpus **file line 580** — *"This attack does 40 damage for each Basic
          Energy attached to this Pokémon."* ⚠️ D469 established that this is **NOT
          state-blocked** (a previous brief guessed it was and was wrong):
          `InPlayPokemon.energy` is a `string[]` of card uids and
          `specialEnergyUids`/`isSpecialEnergy` already tell Basic from Special off
          the `energyType` column. It is a vocabulary widening of the shared
          `BasicEnergyType | "special" | null` across FOUR consumers
          (`countAttachedEnergy`, `countEnergyInPlay`, `hasAttachedEnergy`,
          `MaxHpScale.attachedEnergy`) — verify that count.
      (b) whatever `bun scripts/residue-census.ts` names, filtered by D468's schema
          test. Residue at HEAD is **113 sentences / 157 printings**; `OPAQUE` is
          78/112 and has not moved in three slices.

Either way, **report the caller enumeration** — the number is the deliverable
whether or not you build the row, because the next slice inherits it.

🛑 **Do NOT take corpus file line 199** (*"Each player draws 3 cards."*). D469
established it costs `MATCH_RECORD_VERSION` 29 → 30: `drawCards` is
`{op,count,recordAs?}` with no seat field *deliberately*, the refusal is written at
`effects.ts:9296-9298`, and building it both reverses a recorded design decision
and adds an op field. That is a slice of its own, with its own version argument.

🛑 **Still off the table** (this is the sixth slice it could come up): the
`Ancient`/`Future` family, blocked on a schema column that does not exist —
`typedSelfSwitch.test.ts` §9 already fails the day ingest lands it. Also off: file
line 412, and file lines 529/539/616/572.

## The work

1. The caller enumeration above, first, in writing.
2. Build the chosen row: types, reader/derive, and whatever the interpreter needs
   so the op MEANS something on a real board.
3. ⚠️ **D469's convention is the one to honour hardest here.** A census cannot see
   a reader arm that claims a sentence and then answers WRONGLY — D469 proved it
   with a mutant under which both census suites stayed green while the program
   computed the wrong scope. **So: mutate your new arm to its NEAREST WRONG
   SIBLING and check that something OTHER than a census suite goes red.** For a
   filtered count that means an unfiltered board must produce a different number
   than a filtered one on a board built to separate them. If nothing but the
   census reddens, the sentence is claimed but not built.
4. New test suite. Behavioural on real boards. Include a ZERO-MATCH board with
   controls that distinguish it from silence-for-another-reason (0-because-empty
   and 0-because-nothing-matches are the same number and not the same fact), and
   a board where several plausible wrong implementations each answer a DIFFERENT
   number. Prefer a file-local `cardPool` (D414) over a new `FIXTURE_POOL` id.
5. Hand-author mutant rows for every sentence and every field you add.
   `expectKilledBy` names your suite; `find` must occur exactly once in its target;
   a `survives` row still needs `expectKilledBy` or the runner crashes silently.
   Any row declared `equivalent` MUST state WHICH KIND of disjointness it rests on
   — guarded (then a companion deletion row must exist and be KILLED) or
   structural (no guard, and correctly none).
6. Step the engine version. ⚠️ **A version bump re-points
   `D275-engine-version-drifts-again`, which `--decision D470` CANNOT see** — probe
   it separately with `--only`. Decide `MATCH_RECORD_VERSION` (currently **29**) on
   the SERIALIZED-ALPHABET argument and STATE it: is there a byte a v29 record can
   hold after this slice that it could not hold before? If the answer involves a
   new op field, the answer is yes.
7. Census pins in `censusAtHead.test.ts` → new measured values. Step FRONT terms;
   do not move frozen endpoints. ⚠️ The census tax is **NOT confined to that file**
   — D469's was 54 edits across 14 files (11 there, 27 live heads across 13 others
   in six spellings, 16 front `- 1` terms across 7 files on 12 physical lines), and
   **seven of the thirteen hid a SECOND failure behind vitest's first-throw**, so
   expect to run `check` several times. ⚠️ That file holds two numerically-close
   quantities that must not be swept together: `units - built` is **403**, while
   `BUILT.ability + BUILT.trainer + BUILT.specialEnergy` STAYS **405**. Anchor on
   whole expressions, never on a bare number.
8. ⚠️ `scripts/residue-census-gate.ts` holds **NO pinned literals of its own** — it
   reads them out of `censusAtHead.test.ts` and §A only checks that they AGREE. Do
   not try to edit literals there; step the `censusAtHead` pins and re-run the gate.
   §A currently reads **139 / 113 / 157**.
9. 🛑 **DO NOT touch `ARCHIVES` in `progressLog.test.ts`.** It is **139** and counts
   `### Prior resume point (` blocks, which only the ritual writes. Stepping it
   turns `bun run check` RED.

## Gates before you report

  - `bun run check` GREEN — exact files/tests counts, and **re-derive the delta**
    rather than carrying the previous shape (it repeated for the first time in
    three slices at D469, which is a measurement, not a licence).
  - `bun scripts/mutation/precheck.ts` clean — report the corpus total.
  - `bun scripts/residue-census-gate.ts` OK — report the §A triple.
  - `bun scripts/mutation/run.ts --decision D470 --allow-dirty` — `--allow-dirty` is
    MANDATORY on a dirty tree or every row is SKIPPED-DIRTY and the exit is a
    verdict-shaped non-result. `--decision` matches by `String.includes`; check the
    row count both ways. Report killed / survivor / GAP exactly.
  - `--only D275-engine-version-drifts-again --allow-dirty` after the version bump.
  - find-vs-replace diff over your new rows — an INERT row (a `replace` that
    compiles byte-equivalent) is invisible to `precheck`.
  - attribution control on your central row: apply by hand, run each candidate
    killer ALONE, restore in a `finally`, verify by size AND sha256.

## For my sweep prediction

Report the corpus delta as `+K killed, +S declared survivors`. I commit the
predicted whole-corpus line BEFORE the sweep runs, so it must be exact.

⚠️ **And tell me whether every hunk of your slice is a PURE ADDITION** (no existing
line modified) or whether you edited existing lines, and if so which. D469's
close-out established that pure-addition is a survivor-preservation argument whose
witness is `precheck` re-finding every `find` exactly once — it is how I clear
declared survivors that live in files you touched, and it is much cheaper than
reading their reasons. If you modified existing lines, name them so I read the
right reasons instead.

## Hard rules

  - DO NOT COMMIT. DO NOT `git add`. DO NOT run a whole-corpus sweep. Leave the
    tree dirty and NAME every untracked path — `git commit -a` cannot see them.
  - NEVER `git stash`, `git checkout --`, `git reset --hard`, or any wholesale
    working-tree mutation.
  - Never `String.replace(find, replacementString)` with a replacement read from a
    file (`$&` / `` $` `` splice); use a function replacement and assert file size.
  - Encode first, write second, inside `try/finally`.
  - Temp files in $CLAUDE_JOB_DIR/tmp, never /tmp.

## Report back

The caller enumeration and the build/decline decision it drove; what you built
sentence by sentence with printings and corpus FILE LINES (fileLine = arrayIndex +
53); what you left and its PRICE, in one of D469's three shapes (bigger than it
looks / smaller than its reputation / version-costing); **every place this brief
was wrong** — assume at least one; the gate results verbatim; the pure-addition
answer; and the corpus delta.
