# D500 — work order

## The target

**1 sentence / 1 legal printing:**

> *"This attack does 40 damage for each Basic Energy attached to this Pokémon."*

## What I measured at `09b28a2a` — re-derive every cell

| string | verdict |
|---|---|
| **the target** | **REFUSED 13/13** |
| *"…for each **{W}** Energy attached to this Pokémon."* | **BUILDS** — `deriveAttackDamageMultiplier` |
| *"…for each Energy attached to this Pokémon."* (untyped) | **BUILDS** — same |
| *"…for each **Basic Energy card** in your opponent's discard pile."* | **BUILDS** — same reader |
| *"…for each **Basic Energy card** in your discard pile."* | **BUILDS** |

🛑 **So the noun *"Basic Energy"* is ALREADY READABLE on a different count source, and both the typed
and untyped forms of the attached count build.** The gap is specific to the **attached** counter.

**The vocabulary that exists:**

- `CardFilter` already has `{ kind: "basicEnergy"; energyType?: BasicEnergyType }` — a **card
  category**.
- `energyOnSelf` counts by **`energyType`**, and `countEnergyInPlay` takes
  `BasicEnergyType | "special" | null` — **provision types plus ONE category (`"special"`)**.

## 🛑 The distinction I expect to be the content — and it is a rules question, not a typing one

**A Special Energy card can PROVIDE a basic type.** So *"each Basic Energy attached"* counts **CARDS
that are Basic Energy cards**, which is **not** the same as counting provisions — and the shipped
attached-counter counts provisions.

**D494 measured exactly this distinction** on the same helper: its `null` arm counts Energy **CARDS**
(`holder.energy.length`) where a type asks **`providesEnergyType` per uid**. **Re-derive that, and
find the board that separates the two readings** — it needs a Special Energy attached that provides a
basic type. ⚠️ **If no such card exists in the fixture pool, say so and say what that costs**, rather
than asserting the distinction is untestable.

## The design question

**Does `energyOnSelf` gain a new VALUE on `energyType`, or a `filter?: CardFilter`?** D467 gave
`damageCountersOnYourBench` a `filter?: CardFilter` for exactly this kind of narrowing, and a
`basicEnergy` filter already ships. ⚠️ **Price both, and apply D472's discipline**: measure whether
the wider spelling claims any sentence the tight one does not, over all 640 rows. If they claim the
same set, ship the tight one and keep the measurement as a rung.

⚠️ **And check what the neighbouring count source does.** The discard-pile reader already reads this
noun — **find out which spelling it uses and whether this row can reuse it**, rather than inventing a
second vocabulary for one printed word (D159: one noun, one answer).

## What you must do FIRST

1. **Build state programmatically** off the 13 `deriveAttack*` exports for every string above, plus
   all four splitters. Report verbatim.
2. 🛑 **THE AXIS-SUBSTITUTION LATTICE, BOTH DIRECTIONS**, reporting the **built-by-weight vector**
   (D495/D499 — three shapes are now on record and they say different things). **Count the axes from
   the PRINT**, and **check each for DEGENERACY before listing it** (D491/D494): here the AMOUNT and
   the count-source are both live candidates for being degenerate, since their printed values
   already build.
3. **Price each branch ALONE as well as together** (D493/D494), with the **canonical residue
   predicate copied verbatim from `censusAtHead.test.ts`** (D430/D494).
4. 🛑 **GREP THE MUTANT CORPUS FOR THE ROW WHOSE `replace` IS ANY WIDENING YOU CONSIDER** (D493), and
   run the tripwire audit over all 2,439 rows **from the module**.
5. 🛑 **RE-DERIVE ANY REFUSAL YOU FIND, AND ASK WHICH CARRIER IT IS ABOUT** (D499). A refusal scoped
   to a carrier is not a refusal of the sentence, and *"no widening of any anchor in THIS family can
   reach it"* is the hardest form to see. **D499 overturned a 57-decision refusal with that one
   question.**
6. **Witness load, counted and divided**, each site classified predicate-held or sentence-quoting.
   🛑 **Verify every specimen IS a row of `legalAttackCorpus()`** at its committed count (D490).

## Obligations

- **THE DESCRIBER: trace the call sites**, both `withConsequence` and `conditionNote` (D494 found
  real work in the latter, where the category argument never looks). Report both.
- **`log.ts`: RENDER the row** rather than reasoning about it (D456/D499), and record any honest
  limit at the rung.
- **THE ATTRIBUTION CONTROL AT BOTH LAYERS**, each killer alone, restored in a `finally`, size **and**
  sha256 verified, with the layer map named. ⚠️ **A dual-claim population rung is blind at both**
  (D493/D498), and **witnesses split by POLARITY** where the subject is boolean (D498).
- **`MATCH_RECORD_VERSION`: name the address FIRST, then say WHICH argument you use.** A
  `DamageCountSource` is parse-time and reaches no persisted structure — but **derive that, do not
  assume it**, and state reachability as the weaker half if you use it (D499).

## Hard rules — read these as written

- **Do NOT commit, do NOT `git add`, do NOT run a whole-corpus sweep.** A `--decision D500
  --allow-dirty` probe is expected; row count derived three ways.
- **`docs/` is UNTOUCHED. Do not run the end-of-session ritual.** 🛑 **`ARCHIVES` in
  `progressLog.test.ts` is the RITUAL's — leave it byte-unchanged and verify by sha256.**
- **Never `git stash` / `git checkout --` / `git reset --hard`.** Never write to the tree while the
  harness is in flight. ⚠️ **Prefer `setsid` for anything that patches the tree** — a foreground
  probe can be SIGTERM'd before its `finally` runs and the tool recovers silently (D496).
- 🛑 **Scratch files belong in `$CLAUDE_JOB_DIR/tmp`, NOT in the repo.**
- `--allow-dirty` MANDATORY on a dirty tree; `--decision` takes ONE value (D443) and is a **FLOOR**
  with a false-negative half (D496); **`--only` does NOT accumulate**; **`--list` IGNORES
  `--decision`**; **`killedByCommand` REPLACES `expectKilledBy`** (D498).
- 🆕 ⚠️ **A FIRST-PROBE SURVIVOR MUST BE DISCRIMINATED WITH `--only … --full`** before blaming a
  narrow killer set (D455/D499). **If it is a real gap, fix the SUITE and leave the row
  byte-for-byte** (D496/D499).
- ⚠️ **A `replace` omitting a REQUIRED field reports ERROR — `precheck` gates `find` only.**
- 🛑 **A BARE `toBe(N)` REPLACEMENT IS NOT SAFE FOR SMALL LITERALS** (D492) — patch **by line number**,
  **undo LINES not VALUES**, verify by **paired diff analysis**.
- ⚠️ **Census tax in WAVES** — grep the OLD VALUES as bare tokens first, **counting MATCHES not
  LINES**; **`BUILT.attack` FIRST** (D449); splice a twice-per-line marker at a **column-asserted**
  occurrence (D463); **check the COLLECTED-TEST count, not just the failure count** (D495). ⚠️ **This
  row is 1/1, so the two steps should AGREE — verify rather than trust.**
- ⚠️ **A `Math.round` numerator has a SOLUTION SET** — intersect across both denominators (D488).
- 🛑 **STATE THE COMMAND YOU USED FOR EVERY COUNT.** `git grep` misses your untracked suite; an
  `it.each` is ONE site and N tests (D494); **re-measure the version tax AND its exception list after
  the edit** — the inherited list has been wrong on four separate slices, each time because the note
  counting it was itself a match. 🆕 **Spelling the note entirely in ESCAPED patterns makes the figure
  stable under its own text** (D499); where it cannot be, **publish the command and refuse to quote
  the number.**
- ⚠️ **`patches LITERALLY` is 22** — verify rather than accept; the criterion is a `String.replace`
  special, **not a bare `$`** (which returns 228).

## Report back

Build state for every string in my table, re-derived. The lattice **by built-by-weight vector**, both
directions, with any degenerate axis named. Each branch's solo payoff and the combined payoff. **The
cards-versus-provisions question answered with a driven board** — or an explicit statement that the
fixture pool cannot separate them, and what that costs. Whether the neighbouring count source's
spelling can be reused. The tripwire audit. Witness load. The describer and `log.ts` traces. The
attribution control at both layers with the layer map. The version argument, address named first.
What you built; what you left and its price. **Every place this brief was wrong — assume at least
one, and say which of my claims were hedged and which were confident.** The gates verbatim. The
per-file numstat for deletions. The corpus delta and a sweep prediction with its arithmetic shown.
