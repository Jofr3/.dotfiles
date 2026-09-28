# D469 — chosen by the census, filtered by the schema

Repo: /home/jofre/projects/luminous_ui  (branch main, tree CLEAN at f54b44ba)

Read FIRST and treat as binding:
  - scripts/autoloop/prompt.md
  - docs/conventions.md — ALL of it. Three entries were added yesterday and they
    govern this slice directly: "A one-token blocker is one token WIDE", "A
    refusal re-proposed three times is one `expect` away from self-checking",
    and "`equivalent` is a verdict, not a reason".
  - the `## NEXT (resume point)` block in docs/progress.md (written after D468)
  - the D466..D468 rows in docs/decisions.md

## The targeting rule, as amended by D468 — apply it before you write any code

`bun scripts/residue-census.ts` at HEAD: RESIDUE **114 sentences / 158 printings**
(population 640/1732 − reader 500/1524 − registry 10/16 − gate 5/13 − trailing
11/21). `OPAQUE` is 78/112 and did not move.

**The census picks a TOKEN, not a SLICE.** D468 proved the rest of the inference
unsound: a one-token blocker is one token WIDE, and says nothing about whether the
token names a COLUMN or a BANNER. So for whatever you pick, the FIRST thing you do
is open `packages/schema/src/catalog/card.ts` and ask which of `cardSchema`'s 21
keys the printed word reads. If the answer is "none", the row is data-blocked and
the honest move is to leave it — do not build a filter that counts 0 forever.

🛑 **OFF THE TABLE, do not re-propose (this is now the FOURTH slice in a row where
it has come up):** the `Ancient`/`Future` family — 12 sentences / 17 printings,
corpus file lines 134, 181, 182, 272, 287, 345, 355, 406, 435, 457, 533, 565. It
is blocked on a schema column that does not exist; its falsifier is an ingest
MIGRATION and RUN, not engine code. `typedSelfSwitch.test.ts` §9 already fails the
day that changes. Also off the table: file line 412 (PHRASE-18, two mechanisms at
two seams); file lines 529/539/616/572 (COMPOUND-* — D466 measured that "build the
head and the row leaves" is FALSE for these); and file line 534, which is
`scaledDamage.test.ts`'s third negative control — a successor that builds it OWES
a fourth control.

## The shortlist — candidates, NOT a mandate

I read the census output and these are the residue rows whose blocker looks like
GAME STATE or an existing column rather than an absent one. **Verify each claim
yourself; pick the coherent slice; if you find a better row I did not list, take
it and say why.** Verbatim classifier output:

  SUBST-5  "This attack does 10 more damage for each damage counter on all of your
            opponent's Pokémon."   (1p)
            «all of your opponent's» → «this» builds:
            deriveAttackDamageBonus → {per:10,count:{kind:"damageCountersOnSelf"}}
    — my read: this is a SEAT/SCOPE axis on a count-source family that already has
      `damageCountersOnSelf` and (since D467) `damageCountersOnYourBench`. Damage
      counters are game state, not card data, so there is no schema risk at all.
      This looks like the cheapest true row in the residue. VERIFY IT.

  SUBST-4  "Each player draws 3 cards."   (1p)
            «Each player draws» → «Draw» builds: [{op:"drawCards",count:3}]
    — my read: a both-seats draw. Pure game state. Check whether `drawCards`
      already carries a seat field, or whether two ops in sequence is the honest
      build, or whether the opponent-draw half has an interpreter seat that does
      not exist yet — that last one would make this bigger than it looks.

  PHRASE-1 "This attack does 20 more damage for each {L} Energy attached to all of
            your Iono's Pokémon."   (1p)
            deleting «Iono's» builds: {per:20,count:{kind:"energyOnSelf",
            zone:"board",energyType:"Lightning"}}
    — my read: an owner-prefix NAME filter. `moveCountersToDefender` already ships
      `ownerPokemon:"Team Rocket"`, so the vocabulary may already exist and this
      reads `Card.name`, a real column. But CHECK: D468 found the exact opposite
      trap one slice ago, where a row was priced against the field that refused it
      instead of the field that served it. Price it against both.

  PHRASE-1 "This attack does 40 damage for each Basic Energy attached to this
            Pokémon."   (1p)
            deleting «Basic» builds: {per:40,count:{kind:"energyOnSelf",
            energyType:null}}
    — my read: needs Basic-vs-Special distinguishable on an ATTACHED energy card.
      Verify that the attached-card representation retains enough to tell them
      apart; if attachments are stored as a type tally rather than as cards, this
      is data-blocked at the STATE layer rather than the schema layer, which is a
      different refusal and worth writing down as one.

## The work

1. Pick the coherent slice and say plainly why the others were left. **A smaller
   true slice beats a larger one held together by a claim that does not survive
   the sweep.** A well-argued refusal with a test behind it is an acceptable
   outcome for this slice, as D468 was — but only if the source actually refuses.
2. Build it: types, reader/derive, and whatever the interpreter needs so the op
   MEANS something on a real board. A filter that parses but never narrows is not
   built.
3. New test suite for the slice; behavioural assertions on real boards, with a
   ZERO-MATCH board and a control that distinguishes it from silence-for-another-
   reason. Prefer a file-local `cardPool` over a new `FIXTURE_POOL` id (D414), and
   if you do add a pool id, pay `opponentResistanceBonus.test.ts`'s ladder.
4. Hand-author mutant rows for EVERY sentence and EVERY field you add.
   `expectKilledBy` names your suite. `find` must occur exactly once in its target.
   A row with `survives` and no `expectKilledBy` crashes the runner silently.
   ⚠️ **If any row is an order-swap or otherwise declared `equivalent`, its reason
   MUST say WHICH KIND of disjointness it rests on — guarded (contingent on a
   deletable byte, and then a companion deletion row must exist and be KILLED) or
   structural (no guard, and correctly none).** The verdict column does not
   preserve that distinction; yesterday's convention is explicit.
5. Step the engine version. Decide `MATCH_RECORD_VERSION` (currently 29) on the
   SERIALIZED-ALPHABET argument and STATE the argument: is there a byte a v29
   record can hold after this slice that it could not hold before it?
6. Update the census pins in `censusAtHead.test.ts` to the NEW measured values.
   Step FRONT terms; do NOT move frozen endpoints. ⚠️ **That file holds TWO `405`s
   that are different quantities coinciding today** — `units - built` is 404 now,
   while `BUILT.ability + BUILT.trainer + BUILT.specialEnergy` STAYS 405. A
   `grep 405` + `sed` pass breaks it. Anchor on the whole expression.
7. Re-run `bun scripts/residue-census-gate.ts` and update its §A pinned literals
   (currently **140 / 114 / 158**).
8. 🛑 **DO NOT touch `ARCHIVES` in `progressLog.test.ts`.** It is 138 and it counts
   `### Prior resume point (` blocks, which only the ritual writes. Stepping it
   turns `bun run check` RED. D468's work order got this wrong and the builder was
   right to refuse.

## Gates before you report

  - `bun run check` GREEN — report the exact files/tests counts, and re-derive the
    delta rather than carrying the previous slice's shape (it has been different
    five slices running).
  - `bun scripts/mutation/precheck.ts` clean — report the corpus total.
  - `bun scripts/residue-census-gate.ts` OK — report the §A triple.
  - `bun scripts/mutation/run.ts --decision D469 --allow-dirty` — `--allow-dirty`
    is MANDATORY on a dirty tree or every row is SKIPPED-DIRTY and the exit is a
    verdict-shaped non-result. `--decision` matches by String.includes; check the
    row count both ways. Report killed / survivor / GAP exactly.
  - find-vs-replace diff over your new rows — a `replace` that compiles to
    byte-equivalent code is INERT and precheck CANNOT see it.
  - attribution control: apply your central row by hand and run each candidate
    killer ALONE, then restore the file byte-identically in a `finally` and verify
    by size AND content.

## Hard rules

  - DO NOT COMMIT. DO NOT `git add`. DO NOT run a whole-corpus sweep. Leave the
    tree dirty and NAME every untracked path in your report — `git commit -a`
    cannot see them.
  - NEVER `git stash`, `git checkout --`, `git reset --hard`, or any wholesale
    working-tree mutation.
  - Never `String.replace(find, replacementString)` with a replacement read from a
    file (`$&` / `` $` `` splice); use a function replacement and assert file size.
  - Encode first, write second, inside `try/finally`.
  - Temp files in $CLAUDE_JOB_DIR/tmp, never /tmp.

## Report back

What you built sentence by sentence with printings counts and corpus FILE LINES
(fileLine = arrayIndex + 53); what you left and why; **every place this brief was
wrong** (assume there is at least one); the gate results verbatim; and the corpus
delta as `+K killed, +S declared survivors`, since I must commit the predicted
sweep line before the sweep runs.
