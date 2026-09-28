import io
p='docs/conventions.md'
s=io.open(p,encoding='utf-8').read()
anchor='## Git / commits'
NEW = r'''### `OPAQUE` means UNCLASSIFIED, never EXPENSIVE (D494, confirming D463)

D494's row was filed `OPAQUE` — the census class for *"no deletion and no substitution this
instrument can make reaches a built string"* — and it cost **less** than the `COMPOUND-head` row
built one slice earlier.

The reason is mechanical, not a coincidence: `residue-census.ts`'s three probes are all
**single-region**. This row's edit to a built string needed a quantifier substitution **and** a type
substitution **and** a tail removal — **three separated points** — so no single-region probe could
reach it, whatever its cost.

🛑 **Never read `OPAQUE` as a price.** It reports the instrument's reach, not the row's. This is the
second time in one run that an `OPAQUE` row turned out cheaper than a classified neighbour.

### A killer set named from a suite's NAME is a lie in the over-broad direction (D494)

D494 credited `typedEnergyThreshold.test.ts` with killing a `conditionHolds` arm because the name
matched the subject. **It kills neither row and contains zero references to the member.** The real
killers were two shipped suites that had been discriminating that line since D193/D376 and had never
been credited with it.

**Hunt one suite at a time and record what actually goes red.** A killer set assembled by name is
wrong in the direction that hides work: it credits a suite that does nothing and leaves the suites
that do the discriminating uncredited — which is D474's *driven-but-unpinned*, arriving through a
naming shortcut rather than through an omission.

### The self-reference rule fires on the LITERAL, never on the PATTERN (D494, a precondition on D488)

D488 established that a prose census of exceptions is self-referential the moment it is written down
— the paragraph counting occurrences becomes one. D494 found the precondition nobody had stated.

A paragraph that writes its command with an **escaped** pattern (`0\.389\.0`) does **not** contain
the literal it counts, so it does **not** count itself. D494's first draft declared the next
exception list would be two, counting itself; running the command afterwards returned the smaller
number.

**Before applying D488's rule, check whether the note's own text matches the literal or only the
pattern.** And ⚠️ **the inherited total may still be short**: D493's note said 92 where the truth was
93, the 93rd being that note's own sentence — the rule firing *inside the paragraph that warns about
it*. **Re-measure; never inherit.**

### An axis whose printed value already builds is degenerate — including a PREDICTED axis (D494, re-earning D491)

D491 established the rule for axes someone names. D494 earned it again on an axis someone
**predicted**: a work order said *"expect at least one more axis"*, and the obvious candidate
(the damage amount) turned out to be a **capture on an anchor that already builds**. A 2⁴ table would
have been the 2³ table reported twice.

⚠️ **And check whether the extra dimension is an AXIS or a VALUE.** D494's third axis was
three-valued (`absent` / `Weakness` / `Weakness or Resistance`) — the richness lived *inside* an axis
already counted, not beside it.

🛑 **A corollary about hedges.** For six slices this loop's hedged claims were the accurate ones and
its confident claims failed. At D494 the inverse held exactly: every confident measurement was right
and the single hedge was wrong. **Treat "the hedged claim carries" as a tendency worth checking, not
a rule to lean on** — the useful discipline is measuring, not calibrating confidence about who was
confident.

'''
s=s.replace(anchor,NEW+anchor,1)
io.open(p,'w',encoding='utf-8').write(s)
print('ok')
