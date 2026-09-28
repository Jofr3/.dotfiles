import io
p='docs/conventions.md'
s=io.open(p,encoding='utf-8').read()
anchor='## Git / commits'
NEW = r'''### Run the axis-deletion LATTICE, and substitute each axis onto its nearest BUILT spelling (D489, refining D488-i)

D488 established axis deletion as the way to measure whether two rows are one slice. D489 sharpens
the method twice.

**Substitute, do not delete.** Removing a clause outright confounds two different findings — *"this
axis is the blocker"* and *"the remainder is not a sentence the corpus would ever print"*. Replace
each axis with its nearest **already-built** spelling instead, so every point in the lattice is a
sentence some reader could in principle claim.

**Run the lattice, not the list.** One-axis deletions answer *"is any single axis the blocker"*; they
cannot answer *"does any proper subset of this sentence already build"*. D489 ran all **2⁵ points ×
13 readers** on a five-axis sentence:

| axes changed | points | built |
|---|---:|---:|
| 0 (the print) | 1 | 0 |
| 1 | 5 | 0 |
| 2 | 10 | 0 |
| 3 | 10 | 0 |
| 4 | 5 | 0 |
| 5 (all) | 1 | **1** |

*"No proper subset builds"* is strictly stronger than *"one point builds"*, and it is what justifies
a whole-sentence anchor rather than a composition.

⚠️ **And count the axes from the PRINT, not from the brief.** D489's work order named four; the
sentence had five — the printed noun was bare `Energy cards` with no type token where the shipped
anchor's filter group was mandatory. The missing axis is the one that makes a "the head already
ships" claim true of the *vocabulary* and false of the *sentence*.

### A brief's "A or B?" fork is itself a claim, and the answer is often C (D489)

D489's work order priced a hand-source discard as *"a seventh `discardEnergy.from` member, or D485's
`discardFromOpponentHand` mirrored"*, and named those two carriers confidently. **Both were wrong.**
The carrier was `payFromHand`, which already had the source, the filter, the §9.2 filing and the
`chooseCards` park, and lacked only the quantifier.

**Before choosing between two named carriers, grep the op union for the VERB THE SENTENCE PRINTS** —
`grep -n 'from your hand' effects.ts` — rather than for the carriers someone named. A fork presented
as exhaustive is an assertion about the op union, and it deserves the same witness as any other.

### Ask what the PARK carries before pricing a union member (D489)

Widening a union looks like adding a word. It is not, when the new member changes what the **prompt**
must carry. Every machine under `discardEnergy` takes a `PokemonRef` — `discardableEnergies` yields
`{uid, from: PokemonRef}`, the §11 shield filters those refs, `interchangeableCandidates` keys on the
host, and the park itself carries refs across the wire. **A hand card has no ref**, so a hand member
there changes the prompt's candidate *type*: D457's five mirrors (`packages/schema`, `redact.ts`,
`projection.ts`, both HUDs) — to say what `chooseCards` already says.

**The test is not "does the union have room" but "does the new member's payload fit the park".**

### "This op parks, so the describer obligation is live" is a CATEGORY ARGUMENT (D489, re-earning D478)

Two consecutive slices, a work order predicted describer work from the fact that an op parks. Both
times the obligation was **empty**.

`withConsequence` returns the prompt unchanged unless the QUEUE holds a `recordGate` on the slot the
parking op files; `describeBranch`/`describeCondition` are reached only from `recordGate.then`.
**Parking is not the trigger — a gate is.** Trace the one call site; do not argue from the op's
category.

⚠️ **And the real describer work is often somewhere the category argument never looks.** D489's was
in the park's *heading*: `handCostPhrase` learning the printed *"up to N"* makes the caption the
printed head sentence byte for byte, which turns it into a D457 witness that the op carried its cap.

### A named slot beats a boolean rider once the source stops being implicit (D489)

`damageChosen`'s two existing scaled-snipe riders are bare `true` flags because each names an
**implicit** source the fold finds from `(state, ctx)` — the prize count, the attacker's attached
Energy. A §9.2 record is an **address** with three inhabitants, so a boolean would have to hard-code
one, and D458 already measured the board that breaks that: two sequential recorders overwrite one
slot, so a program filing both `paid` and `discarded` needs to say which.

Shipped as `perRecorded?: EffectSlot` — **not** `count`, which on that op already means the arity.
**No filter twin**: the filing op is narrowed by the printed noun, so a filter would be unfalsifiable
on every board the sentence reaches, and the falsifier belongs at the site rather than in a field.

### A census staying GREEN under an attribution control is the finding, not the absence of one (D489, demonstrating D469)

D489 broke its central arm at the nearest wrong sibling — the printed **hand** head read as a
**board** discard — and `censusAtHead` stayed green. Under that wrong build the sentence still reads,
`resolvedByAnyReader` is still true, the residue still falls by one and `BUILT.attack` still steps.

**A census measures whether a sentence is CLAIMED, never whether it is claimed CORRECTLY.** The five
behavioural suites that went red are what discriminate. When the attribution control leaves a census
green, record it: it is positive evidence that the census is doing its stated job and not more.

### `cardIdentity` keys a Basic Energy on what it PROVIDES, not its id (D489)

N unnamed `basicEnergy` fixtures are **one** interchangeable class. A suite measuring an
interchangeable *collapse* on them measures the offer's ceiling and says nothing about the collapse —
D489's first board hid exactly this, and a red rung found it. **Use `typedEnergy` with distinct
provisions** whenever the board is meant to separate "how many are offered" from "how many distinct
choices exist".

### An instrument's SCOPE is part of its figure — `git grep` cannot see the new suite (D489)

The version tax at D489's head is **88 occurrences / 62 files / 18 `it(` titles**. `git grep` reports
**84 / 61 / 17**, and the difference is exactly the slice's own new test suite, which is **untracked
until the ritual commits it**. Every slice creates one, so a `git grep` tax figure is systematically
short by one file's worth — and the builder's report quoted two mutually inconsistent numbers for
this one figure.

**Say which instrument produced a number, and check its scope covers the untracked tree.** This is
D488's `SURVIVES(known)` failure at a different instrument: the run was right both times and the
thing counting it was not.

⚠️ **The same applies to `grep -c 'it('`**, which counts *lines containing* the substring — including
prose and comments — and over-reported D489's rung delta by 4. `grep -cE '^\s+it\('` agreed with
vitest exactly.

### A version-tax forecast is a forecast (D489, applying D427)

Predicting the successor's tax arithmetic fails in a way the arithmetic cannot see: the file count
does not grow monotonically, because the **previous** slice's suite drops out of the live set as the
new one joins it. Re-measure after the edit; do not carry a predicted figure into a resume point.

### A residue-census snapshot in `tmp/` is one slice stale by construction (D489)

`census-D<N>.txt` is written *before* D<N>'s own build lands. Diffing against it reports your slice's
delta **plus the previous slice's**. Re-run the instrument at HEAD; the gate's §A literals are the
check that you did.

'''
s=s.replace(anchor,NEW+anchor,1)
io.open(p,'w',encoding='utf-8').write(s)
print('ok')
