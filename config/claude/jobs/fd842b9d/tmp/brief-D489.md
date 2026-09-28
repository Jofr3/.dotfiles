# D489 — work order

## The target

**`censusAttackCorpus.ts` file line 138, 1 sentence / 2 legal printings:**

> *"Discard up to 3 Energy cards from your hand. This attack does 60 damage to 1 of your
> opponent's Pokémon for each Energy card you discarded in this way. (Don't apply Weakness
> and Resistance for Benched Pokémon.)"*

This is **the leftover D488 named and did not pay**. `discardScaledDamage.test.ts` §1's re-pointed
rung says, in the tree as committed: *"the `damageChosen` that reads a slot is still unbuilt, and it
is what the one remaining sentence needs."* That comment is a claim I inherited, not a measurement —
**re-derive it before you accept it.** D486 and D487 both had me quoting a price to a row that did
not contain it, and D488's own brief named the wrong blocker entirely.

## What you must do FIRST, before any design

**Derive build state programmatically off `attackReaderSurface()`'s 13 `deriveAttack*` exports.**
Never `programFor` (D480/D482). Report the 13/13 result verbatim. `refusedPrintings.ts` has no rows
for attack printings at all (its limit 1) — check that it is still true rather than assuming it.

**Then run AXIS DELETION (D488-i), because it is cheap and it is the only thing that tells you the
slice's size.** Delete each axis alone and re-run all 13 readers. The axes I can see are: the HAND
head (*"Discard up to 3 Energy cards from your hand."*), the CHOSEN target (*"to 1 of your
opponent's Pokémon"* vs the defender), the SCALING tail, and the W/R parenthetical. If any deletion
builds, that tells you which half already ships. **This row is nominally alone — but check whether
it is really alone**, i.e. whether some other residue row refuses and builds on exactly the same
axes. D488's pair looked like two slices and was one; D483's cluster looked like one and was two.

**Then count WITNESS LOAD before pricing (D487-ii, as refined by D488).** Grep for the sentence
verbatim and for the predicate-held refusals that cover it. D488's finding was that a
predicate-held witness amortises across a whole cluster — 1 file / 2 rungs for two rows — so count
against the MECHANISM and divide by the rows it frees. At minimum `discardScaledDamage.test.ts`
§1 names this sentence's mechanism; `scaledAnySnipe`/`anyTargetSnipe` may too. Verify, don't assume.

## What I believe about the mechanism — HEDGED, and my hedged reads have been half-wrong six slices running

`damageChosen` already carries **two scaled-snipe riders** and they are documented as a family at
`effects.ts` ~4862: `perTakenPrize?: true` and `perEnergyOnSelf?: true` (D448). D448's doc block
prices the general collapse to `scale?: DamageCountSource` at **24 sites across 10 files plus a
version bump** and refuses it, because `perTakenPrize` is a PERSISTED key (this op parks) and
dropping its name is a RENAME rather than a widening.

**So my read is that this sentence wants a THIRD member of that rider family — and that it is the
first one that cannot be a bare `true`.** `perTakenPrize` and `perEnergyOnSelf` name an *implicit*
source (the prize count; the attacker's attached Energy). A record slot is an *address* and has to
be named. D488 solved the same problem on the defender side with `damageDefender.count: EffectSlot`
+ `countFilter` — but ⚠️ **that spelling is unavailable here and the reason is documented**:
`effects.ts` ~5077 says *"`damageChosen.count` is ALREADY TAKEN and means the ARITY"*, so a literal
`{per, count}` embed would put two unrelated quantities behind one word.

**Treat every sentence of the preceding paragraph as unverified.** I have NOT checked whether
`snipeAmount` in `interpreter.ts` can reach a record slot at the pick as well as at the op, nor
whether `EffectSlot` is even in scope at that declaration.

## What I DID verify with a witness after writing the above — and it moves the blocker

⚠️ **My hedge "I do not know whether the hand-discard head is built" is answered, and in the
OPPOSITE direction from the guess.** The *counting* half of the head already ships in full; only
the SOURCE ZONE is missing. Check each of these yourself, but they were read out of the tree:

- `discardEnergy` carries **`count?: "all" | number | "any"`**, where `"any"` is *"the declinable
  'you may discard ANY amount' … the player choosing HOW MANY as well as WHICH"*, plus a **`cap`**
  documented as *"an upper BOUND on the declinable up-to — the printed 'up to N'"*, plus
  **`recordAs?: EffectSlot`** (*"File the discarded uids under this §9.2 slot so a later op can read
  how many came off"*, D96/D402). **So `count: "any"` + `cap: 3` + `recordAs` is the printed
  *"Discard up to 3 … cards"* verbatim, already built.**
- 🛑 **But `discardEnergy.from` has SIX members and none of them is a hand**:
  `"opponentActive" | "opponentChosen" | "yourActive" | "yours" | "yourBench" | "self"`. A repo-wide
  grep for a hand SOURCE member returns nothing. ⚠️ **Do not confuse this with the `to?: "hand" |
  "deck"` field one screen up — that is D295's DESTINATION** (*"the VICTIM'S OWN HAND"*), a different
  axis entirely, and mistaking the two would be exactly the false-citation failure of D486/D487.

**So the head blocker is a SOURCE ZONE, and whether it belongs on this op is the design question,
not a formality.** The doc frames the six members as *"a spot (`yourActive`), a side (`yours`), a
body (`self`)"* and D403's *"COMPLEMENT" (`yourBench`)* — **all four are board scopes, and a hand is
not a board scope.** `discardEnergyApply` is documented as resolving *"EVERY zone it writes against
`discardVictimSeat`"*, which is a claim about zones you should test rather than trust.

🛑 **AND THERE IS A SHIPPED MIRROR YOU MUST PRICE AGAINST: D485's `discardFromOpponentHand
{ filter: CardFilter }`.** That is a hand-source discard as its OWN OP rather than a `from` member —
built four slices ago, by this same loop, for the opponent's side. **So the real question is: is
D489's head the own-side mirror of D485's op, or a seventh `from` member on `discardEnergy`?**
Note what the mirror would still lack: `discardFromOpponentHand` has **no `count`, no `cap` and no
`recordAs`**, so that route re-authors three fields `discardEnergy` already has, while the `from`
route re-uses all three and pays instead by widening a union whose stated organising principle is
board scope. ⚠️ **Price BOTH, in sites, and say which one D485's own doc block predicts** — it
argued a field-on-the-op over a twin op *"for D294's reason verbatim: the offer, the §11 refusal,
the shield filter, the interchangeable collapse, the park and the §9.2 record are all
destination-independent"*. Whether that argument transfers from a DESTINATION to a SOURCE is the
thing to decide, and it is not obvious.

## The three questions that decide the design

1. **Where does the count come from, and does the fold already exist?** D448's doc says `snipeAmount`
   has been a second, parallel fold since Covetous Ivy and that the riders *"reach the fold that
   already exists; they do not build one."* Check whether a slot-read reaches it the same way — and
   note the amount is read **twice** (at the op and again at the pick), so a slot that is overwritten
   between them is a real hazard. Drive it.
2. **Boolean rider or named slot?** Price both. If a bare `true` works because the slot name is
   fixed by the head that files it, say so and show the board where a second recording op in the
   same program would break it. If it must be named, say what the name is and why it is not `count`.
3. **`MATCH_RECORD_VERSION`.** This op **PARKS**, so unlike D488 its record IS persisted and the
   version question genuinely reaches the door. D487's rule says adding an OPTIONAL key is a
   widening and cannot force a bump; D448's own doc says the same thing in the other direction (a
   RENAME would cost). **Re-derive it at the hard address anyway** — the alphabet grows and
   reachability is not empty — and drive a v29 record that means something different if you get it
   wrong, with a *different number*, not a different shape.

## Two obligations that D488 discharged as EMPTY and that are LIVE here

- 🛑 **THE DESCRIBER.** D488's build had `recordAs` with no `recordGate`, neither op parked, and
  `withConsequence`/`describeBranch` were unreachable — so the D478 obligation was empty. **This op
  parks.** Check the call path and expect real work.
- 🛑 **THE PROMPT / CHOICE.** A `chooseCards` head and a `choosePokemon` pick are two parks in one
  program. Drive the ordering, and drive what happens when the player discards **zero** (an *"up
  to"* floor of 0 means a 0-damage snipe — does the attack still ask for a target? What does the
  card say? What does the engine do today for a 0-amount `damageChosen`?).

## Boards (D488-ii)

**Enumerate every candidate reading and count how many each board separates before you choose one.**
D488 found eight readings and needed **two** decks: board A separated 6, board B separated all 8.
⚠️ **And watch for algebraic identity on the natural board.** The obvious hazard here: a hand that
holds exactly 3 Energy and nothing else makes *"discard up to 3"*, *"discard all Energy"* and
*"discard your hand"* the same move. **Pre-load the hand with non-Energy and with more than 3
Energy**, and drive the up-to floor at 0, 1 and 3. ⚠️ **A candidate no board separates by quantity
is separated by CONTENTS** — if a mill-side/discard-side filter is indistinguishable by damage,
assert which cards left the hand.

## Hard rules — read these as written

- **Do NOT commit, do NOT `git add`, do NOT run a whole-corpus sweep.** A `--decision D489
  --allow-dirty` probe of your own rows is expected; report it verbatim with the row count derived
  three ways.
- **`docs/` is UNTOUCHED. Do not run the end-of-session ritual.** 🛑 **`ARCHIVES` in
  `progressLog.test.ts` is the RITUAL's and belongs to the caller — leave that file byte-unchanged.**
- **Never `git stash` / `git checkout --` / `git reset --hard`.** Never write to the tree while the
  mutation harness is in flight.
- Temp files in `$CLAUDE_JOB_DIR/tmp` only.
- `--allow-dirty` is MANDATORY on a dirty tree; `--decision` matches by `String.includes`; **`--only`
  does NOT accumulate.**
- ⚠️ **A `replace` omitting a REQUIRED field reports ERROR — `precheck` gates `find` only.**
- ⚠️ **The census tax lands in WAVES** because an earlier failing `expect(` masks later ones in the
  same `it` (D487 took five rounds, D488 took four). **Bump `BUILT.attack` FIRST** (D449). 🆕 **And a
  `Math.round` numerator has a solution SET, not a solution** — D488 derived its by intersecting the
  green ranges at both denominators rather than reading the literal. Do the same; do not edit it
  blind because the rung is green.
- ⚠️ **Version tax: 81 occurrences / 61 files / 17 `it(` titles, with FOUR history occurrences left
  alone.** D488 corrected D487's "three" — the fourth is the paragraph that quotes the arrow it is
  counting. **Re-derive the exception list; do not inherit it.**
- Attribution control by hand: break the central arm at its **nearest wrong sibling**, run each
  killer alone, restore in a `finally`, and verify size **and** sha256. Report which suites go red.

## Report back

Build state first, off the right oracle. The axis-deletion table. Whether this row is really alone.
The witness load, counted, and divided by the rows it frees. The candidate-reading enumeration and
how many readings each board separates. The design answer to all three questions with the price you
measured, not the price you expected. The describer and prompt obligations — discharged, not
asserted. What you built; what you left and its price. **Every place this brief was wrong — assume
at least one, and say explicitly which of my claims were hedged and which were confident, because
the pattern for six slices is that the confident ones fail.** The gates verbatim. The per-file
numstat for deletions. The corpus delta and a sweep prediction with its arithmetic shown.
