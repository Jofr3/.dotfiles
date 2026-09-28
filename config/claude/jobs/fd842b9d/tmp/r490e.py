import io
p='docs/conventions.md'
s=io.open(p,encoding='utf-8').read()
anchor='## Git / commits'
NEW = r'''### A byte pin cannot catch a PHANTOM SPECIMEN (D490, extending D452)

`deckTopMill.test.ts` held a near-miss documented *"verbatim off the local D1"* that read **100**
more damage. The committed corpus column prints **140**, on the one and only row containing
`each player's deck` — and `effects.ts` had copied the invented figure to two more doc sites. Both
`toBeNull` rungs on that string had been green for **two independent wrong reasons**: the string was
a phantom, *and* the readers they named were the wrong ones.

🛑 **A byte pin measures an invention exactly as faithfully as it measures the truth.** D452 caught
this shape at a hand-retyped *opening*; D490 caught it at a hand-retyped **damage figure**, which no
amount of pinning can distinguish from a real one.

**The repair, and the standing rule: assert that a specimen IS a row of `legalAttackCorpus()`**, and
read its printing count off the corpus rather than typing it. Where a card id cannot be resolved in
this checkout, cite the corpus **file line** instead — and say the id is unresolvable rather than
inventing one.

### A refusal ROTS, and nothing in the corpus forces anyone to re-derive it (D490, closing D478's loop)

D490's family had **zero mutant rows across 87 decisions**. A tripwire audit over all 2,331
pre-existing rows on eight needles found **no row resting on the refusal**. The loop is complete and
self-sealing: the refusal stopped the family being built → an unbuilt family attracted no rows → no
row rested on the refusal → nothing ever re-checked it.

Its stated reason (*"it needs a recording mill this engine does not have"*) had been **false since
D488**, two slices earlier, and it also said *"refused by all TWELVE readers"* when the surface had
been thirteen since D417.

🛑 **Before pricing any residue row from a recorded refusal, re-derive the refusal itself.** Five
consecutive slices have found an inherited price naming something already built — and at D490 the
caller's own *correction* of the price was also half-stale.

### The RECORD can decide an op's shape, and it is cheap to drive (D490, applying D458)

The question *"is 'each player's deck' one op or two sequential ones?"* looks like a style call. It
is not: `recordMoved` **assigns** (`record[slot] = [...uids]`), so `[mill self, mill opponent,
damage]` leaves only the **second** deck's card filed — **190 where the sentence deals 330**, with
both decks correctly milled and both log rows correct, so nothing else looks wrong. Two slots is no
escape either, because `damageDefender.count` is a single `EffectSlot`.

**When a program files a record and something downstream counts it, drive the sequential spelling
before choosing.** D458 measured this overwrite on a different pair; D490 is the first printing whose
*damage number* turns on it.

⚠️ **And widen a two-member discriminant with a `switch`, not the ternary it replaced.** The shipped
line was `op.whose === "self" ? ctx.seat : otherSeat(ctx.seat)`; a third member falls silently out of
the wrong side and `tsc` says nothing — D447's `snipeTargets` defect at a new address.

### When two shipped precedents disagree, find the axis that distinguishes them (D490, applying D433)

`counterEachAll`'s `side:"both"` walks absolute `SEATS`. `handRefresh`'s `who:"both"` walks
controller-first. Picking one by preference would have been a coin flip; the distinguishing fact is
**what the op emits per iteration**: `counterEachAll` emits one event per *body*, so seat order is
not row order, while `handRefresh` and D490's mill emit one row per *seat*, so the seat order **is**
the log's order.

🛑 **And test it from p2's chair.** Absolute-vs-controller ordering is **inert on every board where
p1 attacks** — the entire distinction is unobservable in the default fixture, so a suite can look
thorough and still let the mutant live.

### A witness re-pointed onto a READER's return value is blind to the ASSEMBLER (D490, extending D489/D469)

D489 established that a census staying green under an attribution control is the finding. D490 goes
a layer further: under a mutation that mills the **wrong deck**, *all four* family suites whose
witnesses had just been re-pointed **also stayed green** — because their claims are about what the
**reader** answers, and the mutation lives in the **assembler**, downstream of it. Only the
behavioural suite discriminated.

**Re-point a witness onto the OP where you can.** Where the reader's return value is the only
available subject, **say in the rung that the family's witnesses are blind to assembly**, so the next
slice does not mistake their greenness for coverage.

### Say which instrument produced a number — writing the convention did not prevent the repeat (D490, re-earning D489)

D489 recorded that `git grep` sees only **tracked** files, so a version-tax figure taken with it is
short by exactly the slice's own new suite. **One slice later, D490's report quoted a tracked-only
occurrence count beside an untracked-inclusive file count** — the identical mixed figure.

Measured at D490's head: **89 occurrences / 63 files / 19 `it(` titles**; `git grep` says **85 / 62**;
the new suite contributes exactly **4 / 1**.

⚠️ **D489's history-exception list was also one short** — it named four and there were five, having
called *"this heading"* the paragraph *inside* its changelog entry while missing the entry's own
heading. That is D488's self-reference rule firing a second time.

🛑 **The rule that works is procedural, not advisory: re-measure the figure AND its exception list
after the edit, and state the command you used.** A convention that says "check your scope" does not
survive contact with a report template that does not ask for the command.

### Grep the OLD VALUES as bare tokens before letting the runner find the census tax (D490)

The tax lands in waves because an earlier failing `expect(` masks later ones in the same `it`. D490
cut it to three waves (4, 9, 2) by first grepping the **old** literals as bare tokens — which found
31 sites across 16 files in one pass — and letting the runner find only the remainder. The runner is
a one-throw-per-`it` instrument; a grep is not.

'''
s=s.replace(anchor,NEW+anchor,1)
io.open(p,'w',encoding='utf-8').write(s)
print('ok')
