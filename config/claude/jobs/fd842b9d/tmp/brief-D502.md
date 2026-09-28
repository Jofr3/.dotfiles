# D502 — work order

## The target

**1 sentence / 1 legal printing**, a `COMPOUND-head` row whose head already builds:

> *"Search your deck for a Basic Pokémon and put it onto your Bench. Then, shuffle your deck. If you
> put any Pokémon onto your Bench in this way, move an Energy from this Pokémon to the new Benched
> Pokémon."*

## What I measured at `b60b2003` — re-derive every cell

| string | verdict |
|---|---|
| the full print | **REFUSED 13/13** |
| the head — *"Search your deck … Then, shuffle your deck."* | **BUILDS** → `[{searchDeck, filter:{kind:"basicPokemon"}, dest:"bench", max:1},{shuffleDeck}]` |
| the tail alone | **REFUSED 13/13** |

**The vocabulary that exists, and where the gap is:**

- **`searchDeck` has NO `recordAs`.** Twelve ops carry one; this is not among them. D488 added
  `discardDeckTop.recordAs` on exactly this pattern, so the precedent is one slice-family over.
- **`recordGate` ships** (D473's pair) — so *"If you do / If you put … in this way"* has a carrier.
- **`moveEnergy.route` ALREADY HAS `"selfToBench"`.** The move itself is not the gap.
- ⚠️ **`moveEnergy` PARKS**, and its own comment says why: *"Two coupled decisions (which Energy +
  where), so it parks."*
- 🛑 **`EffectSlot` is `"paid" | "moved" | "discarded"` — three slots, and NO op targets a recorded
  uid as a DESTINATION.** The closest shipped thing is **`discardPileRetrieval.exclude?: EffectSlot`**
  — which reads a slot to *remove* uids from a candidate set. **So the slot-targeting shape ships in
  the NEGATIVE, on a different carrier.**

## The design question I expect to be the content

The printed sentence says *"to **the new** Benched Pokémon"* — **there is no destination choice at
all.** But `moveEnergy` parks precisely because it has two coupled decisions. **Pinning the
destination to the recorded uid removes one of them**, which changes a parking op's arity.

**Drive that.** Does the park collapse to a single decision, and what does the prompt then ask? ⚠️
**And if the recorded Pokémon is absent** — the search found nothing, or the player declined — **what
does the gate do?** The head's `max: 1` and the *"any"* in *"if you put **any** Pokémon"* both point
at an empty case that must be silent rather than a park with no candidates.

⚠️ **Price the polarity against `exclude`.** A `toRecorded`-shaped field is `exclude`'s complement,
and D498 found that witnesses split by polarity — so **check whether the shipped negative form can be
reused or inverted**, rather than assuming a new field is needed (D159: one noun, one answer).

## What you must do FIRST

1. **Build state programmatically** off the 13 `deriveAttack*` exports for every string above, plus
   all four splitters. Report verbatim.
2. 🛑 **THE AXIS-SUBSTITUTION LATTICE, BOTH DIRECTIONS**, reporting the **built-by-weight vector**.
   **Five shapes are now on record** — D489/D490/D494/D501's *full weight*, D495's *every segment*,
   D499's *prerequisite half*, D500's *single-axis 2¹* — **and they say different things about why an
   anchor is warranted.** **Count the axes from the PRINT and check each for DEGENERACY before
   listing it** (D491/D494/D500/D501: one of six was degenerate last slice).
3. **Price each branch ALONE as well as together** (D493/D494), with the **canonical residue
   predicate copied verbatim from `censusAtHead.test.ts`** (D430/D494).
4. 🛑 **RE-DERIVE ANY REFUSAL YOU FIND AND ASK WHICH CARRIER IT IS ABOUT** (D499) — and note that
   **the slot-targeting precedent here is on ANOTHER OP**, which is exactly the territory where that
   question pays.
5. **Grep the mutant corpus for the row whose `replace` IS any widening you consider** (D493); run the
   tripwire audit over all 2,464 rows **from the module**. ⚠️ **Measure absence by SPAN, not by name**
   (D453/D496) — `searchDeck`'s arm and `moveEnergy`'s park are both worth checking.
6. **Witness load, counted and divided**; **verify every specimen IS a row of `legalAttackCorpus()`**
   at its committed count (D490).

## 🛑 The version question — and it should contrast with last slice, but DERIVE it

`moveEnergy` **parks**, so its op rides `phase.cont.pendingOp` into `MatchRecord.state`. **D501
bumped 29 → 30 because its key was REQUIRED at a persisted address and the rest could not witness its
absence.** An **optional** key at the same kind of address is D125's widening and should not bump —
**but say so from the measurement, not from the contrast.**

**Name the address FIRST, then the argument** (D499/D501). ⚠️ **And ask what the optional shape would
DISARM** (D501): check whether any `satisfies` guard or key-set rung exists on the structure you are
widening, because an optional key can satisfy such a guard while reaching neither surface it protects.
**Drive a reconstructed v-current record and show it answers a different number if the reading is
wrong.**

## Obligations

- **THE DESCRIBER: trace both call sites** (`withConsequence` and `conditionNote`) and report both.
  ⚠️ **This slice is the first in a while where `withConsequence` may genuinely fire**: it needs
  `recordSlotOf(op)` defined **and** a queued `recordGate` on that slot — and this program has a
  `recordGate`. **Check whether `searchDeck` joins `recordSlotOf`'s list, and if so, what caption is
  owed.**
- **`log.ts`: RENDER the rows** rather than reasoning about them (D456/D499/D501), and record any
  honest limit at the rung.
- **THE ATTRIBUTION CONTROL AT BOTH LAYERS**, each killer alone, restored in a `finally`, size **and**
  sha256 verified, with the layer map named.
- ⚠️ **If a row survives its first probe, discriminate it with `--only … --full`.** Three diagnoses
  are on record: real suite gap (D499), narrow killer set (D455), **inert on the fielded board**
  (D500) — the last needs a *fixture*, not a wider killer set. ⚠️ **And a first-probe CLEAN result is
  the weaker outcome** (D464): it shows the rows run, not that the suite discriminates.

## Hard rules — read these as written

- **Do NOT commit, do NOT `git add`, do NOT run a whole-corpus sweep.** A `--decision D502
  --allow-dirty` probe is expected; row count derived three ways.
- **`docs/` is UNTOUCHED. Do not run the end-of-session ritual.** 🛑 **`ARCHIVES` in
  `progressLog.test.ts` is the RITUAL's — leave it byte-unchanged and verify by sha256.**
- **Never `git stash` / `git checkout --` / `git reset --hard`.** Never write to the tree while the
  harness is in flight. ⚠️ **Prefer `setsid`** (D496). 🛑 **Scratch files in `$CLAUDE_JOB_DIR/tmp`,
  NOT in the repo.**
- `--allow-dirty` MANDATORY on a dirty tree; `--decision` takes ONE value (D443) and is a **FLOOR**
  with a false-negative half (D496); **`--only` does NOT accumulate**; **`--list` IGNORES
  `--decision`**; **`killedByCommand` REPLACES `expectKilledBy`** (D498).
- ⚠️ **A `replace` omitting a REQUIRED field reports ERROR — `precheck` gates `find` only.**
- 🛑 **RUN THE BARE-TOKEN CENSUS FIRST, AND LET THE COUNT PICK THE METHOD** (D501 sharpening D492):
  its two census literals matched 186 and 243 times repo-wide, so **every literal was patched by line
  number** and no value-keyed pass was attempted. ⚠️ **A bare `toBe(N)` replacement is not safe for
  small literals**, and **a revert is not an inverse** — undo LINES, not VALUES.
- ⚠️ **Census tax in WAVES**; **`BUILT.attack` FIRST** (D449); splice a twice-per-line marker at a
  **column-asserted** occurrence (D463); **check the COLLECTED-TEST count, not just the failure
  count** (D495). ⚠️ **This row is 1/1, so the two steps should AGREE — verify rather than trust.**
- ⚠️ **A `Math.round` numerator has a SOLUTION SET** — intersect across both denominators (D488).
- 🛑 **STATE THE COMMAND YOU USED FOR EVERY COUNT**; `git grep` misses your untracked suite; an
  `it.each` is ONE site and N tests (D494); **re-measure the version tax AND its exception list after
  the edit** — 🆕 **D501's list grew to 3 because its own suite header spells the literal rather than
  an escaped pattern**; spelling it escaped keeps the figure stable (D499).
- ⚠️ **`patches LITERALLY` is 22** — verify rather than accept; the criterion is a `String.replace`
  special, **not a bare `$`**. 🆕 ⚠️ **`D326-record-version-not-bumped` rots on every version bump** —
  **if you bump, predict it in the tripwire audit rather than discovering it in `precheck`** (D501 was
  the first to manage that).

## Report back

Build state for every string in my table, re-derived. The lattice **by built-by-weight vector**, both
directions, with any degenerate axis named. Each branch's solo payoff and the combined payoff.
**Whether the park's arity collapses, driven — and what the prompt asks afterwards.** The empty-record
case. Whether `exclude`'s shipped negative form can be reused or inverted rather than adding a field.
**The version argument, address named first, derived rather than contrasted — including what an
optional key would DISARM.** The describer traces, especially whether `withConsequence` fires for the
first time in a while. The tripwire audit, by span. Witness load. The attribution control at both
layers with the layer map. What you built; what you left and its price. **Every place this brief was
wrong — assume at least one, and say which of my claims were hedged and which were confident.** The
gates verbatim. The per-file numstat for deletions. The corpus delta and a sweep prediction with its
arithmetic shown.
