import io
p='docs/conventions.md'
s=io.open(p,encoding='utf-8').read()
anchor='## Git / commits'
NEW = r'''### A lattice can be EMPTY at every weight — a sixth shape, and a claim about the FAMILY (D502)

D502's whole-sentence 2⁴ read `0/1 · 0/4 · 0/6 · 0/4 · 0/1`: **no built point at any weight, and all
four axes flipping a verdict at 0 of 8 cells.**

🛑 **Stop reading that as a statement about the axes and read it as one about the SEAM.** The §9.2
gate family is **7 sentences / 9 printings**, every one claimed whole by an anchor that welds its own
head, **with no composition path at all** — so the honest whole-sentence table is **2⁰**, and the
informative lattice was the **tail's own 2³** (`0/1 · 0/3 · 0/3 · 1/1`, no degenerate axis).

**When every axis is inert, the next question is which sub-expression has a live lattice**, not which
axis was miscounted.

⚠️ **And a degenerate axis makes the point set smaller than the bit set.** Sixteen bit-points were
**eight distinct strings**, so an instrument collecting "the points the new anchor claims" into an
array rather than a Set reports the print twice — which D502's first draft did, and it went red.

### Read the ARITY question at the FLOOR, not at the candidate count (D502)

Pinning a destination reduced a parking op's decisions from two to one and left `destinations` at
length 1 — which looks exactly like the forced arm D441 added, and is not. **That force is gated on
the FLOOR**, and the printed determiner *"move **an** Energy"* gives `max: 1` → floor 0, so **the
decline is still an answer and the op still parks.**

**Ask what the remaining ANSWER set is, not what the remaining CANDIDATE set is.** A single candidate
with a declinable floor is still a question; a single candidate with a positive floor is not.

### The complement of a shipped field is not a field you can invert (D502)

D502 needed to pin a destination to a recorded uid, and the shipped near-relative was an `exclude`
that *removes* recorded uids from a candidate set — the same shape in the opposite polarity. It could
not be reused, on three counts, and the order of the checks is the lesson:

1. **Supply first.** An inverted `exclude` needs a producer for the inverted set, and no op files the
   complement of its own answer. **That is one grep.**
2. **Then the value KINDS** — one subtracts uids from uids of the same kind; the other maps a card
   uid onto the body carrying it, which the first has no analogue for.
3. **Then the direction of the LOSS** — a dropped `exclude` widens an offer; a dropped pin widens one
   destination to a whole zone, and only the second changes which body the sentence is about.

### A refusal whose BOTH clauses survive re-derivation is worth saying out loud (D502)

Five consecutive slices found an inherited price naming something already built, so the habit became
to report the falsification. D502's did not falsify: D230's two-clause refusal was **true in both
halves** at this head.

**Record that explicitly.** A run that only ever publishes its corrections teaches its successors
that recorded prices are unreliable, when the actionable fact is the opposite — *this* one was real,
which is why the row was worth building now rather than deferring again.

### Placing a new anchor is a decision about ANOTHER decision's row (D502)

Two `^…$` anchors with different mandatory byte runs are structurally disjoint, so their order is
legibility — **until a terminator goes.** `D230-anchor-drops-the-tail` names D502's printing as its
real witness, and reading the head anchor **first** is what keeps that mutation observable; ahead of
it, the mutation goes inert on the one card the row cites and a shipped row's stated reason quietly
becomes false.

🛑 **Before choosing where a new arm goes, grep the mutant corpus for rows whose `what` names the
sentence you are about to build.**

### `tsc` over `scripts/` catches what `precheck` and a probe cannot (D502, D481 paying out)

Twenty-one D502 rows emitted a one-element **array** where `what` takes a string. **`precheck` was
clean. The probe ran all twenty-two and reported 20 killed / 2 known.** The runner reads `what` only
to print it, so nothing in the mutation toolchain can see the error — **`bun run check` was red in
seconds.**

**D481's closed hole is the only thing standing between a data error in the mutant corpus and a
green gate**, and this is the first slice caught by it rather than by a sweep. ⚠️ **A green probe is
not evidence that the rows are well-formed** — only that they patch and run.

### The tripwire audit's needle list must include the CENSUS CONSTANTS (D502)

`D495-census-built-attack-not-stepped` quotes `"  attack: 1616,"` and **rots on every census step**,
in a test file that no code region of a reader slice touches. D502's audit used twelve name-needles
and seventeen span regions and **missed it**; `precheck` found it in seconds.

**Predict it**, the way D501 learned to predict `D326-record-version-not-bumped` across a version
bump. A row whose `find` quotes a number that every slice moves is a standing rot, and the audit
should name it before the build rather than discover it after.

'''
s=s.replace(anchor,NEW+anchor,1)
io.open(p,'w',encoding='utf-8').write(s)
print('ok')
