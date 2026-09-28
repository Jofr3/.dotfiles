import io
p='docs/conventions.md'
s=io.open(p,encoding='utf-8').read()
anchor='## Git / commits'
NEW = r'''### A boolean predicate's witnesses split by POLARITY, and each half is blind to the other mutation (D498)

`resolvedByAnyReader` has 102 calling files and 330 classified assertions, and they are not
interchangeable. **139 CLAIM-TRUE rungs can only see a NARROWING. 98 CLAIM-FALSE rungs can only see a
WIDENING.** 93 population folds see both. Measured: 12 files see narrowing only, 5 see widening only.

Driven, and exactly complementary:

| mutation | a CLAIM-TRUE suite | a CLAIM-FALSE suite |
|---|---|---|
| `.some` → `.every` (claims 529 → 0) | **RED** | green |
| `!== null` → `!== undefined` (529 → 640) | green | **RED** |

🛑 **A killer set assembled from one polarity lets the other mutation survive and reports a gap that
is not there.** **Pick one axis-PURE suite per row and name the population suite second.**

This is D438's polarity rule arriving at a **killer set** rather than at a re-point, and D497's
witness-classification lesson on a different axis: a witness count says nothing about which mutation
each witness can see.

### A one-line predicate can have NO count-preserving mutation at all (D498, bounding D497)

D497 earned *"the count is defended by ~90 assertions, so aim rows at mutations that PRESERVE the
count."* At `resolvedByAnyReader` there is nothing to aim at.

Measured over 640 sentences × 13 readers, the body admits exactly **three** behaviours — claim 0,
claim 529, claim 640 — and **both count-preserving candidates are equivalent**: `!= null` and
`Boolean(…)` each claim the same 529, because **0 of 8,320 calls return `undefined`** and 0 return a
falsy non-null.

**When a region's mutation lattice is that small, publish the lattice rather than filling a quota.**
Three rows, one of them a declared survivor, is the honest output — and two further candidates were
declined as second rows of one experiment (D484/D475).

### "Strictly a better guard" is a claim about WHICH failure you want (D498)

`read(text) != null` would refuse an `undefined`-answering reader where the shipped `!== null` admits
it — catching exactly the hazard that function's own doc block names. It is still **not strictly
better**.

Under `!== null`, a mis-enrolled reader makes the predicate claim **everything**: catastrophic, and
**loud** — 22 rungs across 5 files red in one run, which is what made D444's accident visible. Under
`!= null`, that reader contributes nothing, every census figure stands still, and the defect is
**silent at this line**.

🛑 **Before calling a stricter comparison an improvement, ask what the loose version's failure was
doing for you.** This repo's own doctrine — *flag loudly rather than guess* (D190b/D199) and *choose
the shape so that losing the information is detectable* (D421) — points away from the stricter
operator here, and the tension belongs in the row's `what` rather than in a silent edit.

### An instrument that classifies suites must strip comments, bracket-match, and be RUN AGAINST A PROBE (D498, re-earning D455)

A first-pass classifier of one predicate's witnesses got two answers wrong in opposite directions:
one suite read as a witness on a hit that is **prose inside a comment**, and another read as having
no rung because a wrapped `expect(\n …\n).toBe(…)` overflowed a fixed character window.

**Both were found by driving the prediction against a probe, not by re-reading the regex.**

🛑 **A classifier's error rate is measurable in one experiment and invisible in its output.** Strip
comments before scanning source for anything (D455), bracket-match the call rather than windowing on
character count, and **publish the classification only after a probe has confirmed it** — otherwise
the instrument built to apply a convention is the thing that violates it.

### `killedByCommand` REPLACES `expectKilledBy` — a row killed two ways can name only one (D498)

Both of D498's killed rows are independently caught by `residue-census-gate` **and** by a test suite.
The runner's row shape cannot express that: setting `killedByCommand` replaces the suite list rather
than adding to it.

**Record the unnamed killer in prose** — in the decision's header comment or the row's `what` —
rather than losing it. A successor re-pointing the row will otherwise believe the named killer is the
only one, and may weaken a guard that two instruments were holding.

'''
s=s.replace(anchor,NEW+anchor,1)
io.open(p,'w',encoding='utf-8').write(s)
print('ok')
