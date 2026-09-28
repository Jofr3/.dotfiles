import io
p='docs/conventions.md'
s=io.open(p,encoding='utf-8').read()
anchor='## Git / commits'
NEW = r'''### An axis whose printed value is ALREADY BUILT is not an axis (D491)

D491's brief named three axes — SCOPE, MOOD, COUNT. Measured over the full lattice, **two were inert
on the verdict and one was degenerate**: *"Draw 3 cards."* had built since M4, so substituting COUNT
onto its nearest BUILT spelling changed nothing on either side of the split.

**Before listing an axis, check that its nearest BUILT spelling actually DIFFERS from the print.**
Otherwise the lattice carries a dimension that cannot move the verdict, and its Hamming weights mean
less than they look — a 2⁴ table with one degenerate axis is really a 2³ table reported twice.

⚠️ **And when an axis has no nearest-BUILT spelling at all, say it is UNAVAILABLE rather than
inventing a point.** D491's subject-noun axis (`player`, where every built seat noun is `you` /
`your opponent`) had nothing printed or built to substitute onto, so it could not be varied
independently of SCOPE. Reporting that is a finding; fabricating a comparison point is not.

### A lattice run AFTER the build is not the lattice — derive the pre-state, do not quote it (D491)

A pre-slice axis table cannot be re-run at the new head, so writing it into a suite as prose is
exactly the unfalsifiable claim D465 forbids: it records what someone once saw, and nothing rechecks
it.

**The executable form is `before = now && !NEW_ANCHOR.test(point)`** — derive the old verdict from
the current one by subtracting what the new anchor claims — **plus a rung asserting that the points
the new anchor claims are exactly the ones that moved.** That version reddens if a later slice widens
the anchor across a point the lattice said was refused.

### Read what a refusal QUANTIFIES OVER before treating it as a blocker (D491, applying D450)

D490 found a recorded refusal that had gone **stale**. D491 found something sharper and more common:
a refusal that was **still true, and answering a different question.**

`opponentMayDraw`'s doc says *"Deliberately NOT a rider on `drawCards`: that op is fully automatic and
seat-fixed to the controller, and every one of its call sites relies on both."* Both halves hold — of
the **shape it refuses**, a MAY answered by the other player, which needs a park, and a parking rider
does break *fully automatic*. It says nothing about a **mandatory both-seats key**, which needs no
park at all.

**A doc block that refuses a SHAPE has refused that shape, not the axis.** Quote the refusal's own
reasoning and check what it ranges over before letting it price anything.

### An attack ENDS THE TURN, so the defender's turn-start draw lands inside the same action (D491)

Any claim about what an attack's *effect* drew must filter `CARDS_DRAWN` on **`reason: "effect"`**. A
bare row count is off by one for the defender on every board — and worse, it **passes a build that
walks the seats in either order**, because the extra row makes `["p1","p2"]` and `["p2","p1"]` both
read as three rows with the defender appearing.

This cost D491 a red round and it is the same shape as D430's *a regex that matches a clock is not a
regex that matches a source*, arriving this time at an event's `reason` field.

⚠️ **The deck-out consequences follow from the same fact**: `flow.ts` checks only the seat whose turn
is **starting**, so an attacker who decks themselves out does **not** lose, and when both players
deck out the **defender** does — inside the same action, not a turn later.

### A mechanical substitution pass must be CLOSED UNDER ITS OWN OUTPUT (D491)

D491's census pass ran two rules in one loop where the first rule's **replacement** was the second
rule's **pattern**. One line was stepped twice and gained a duplicated comment.

**Either order the rules so no output is a later input, or apply them in a single pass with a
sentinel.** 🛑 **`git diff` will not flag this** — the line still looks stepped, just stepped too far.
The only detection is re-reading the patched lines, which is worth doing on every mechanical pass.

### `spliceReport`'s population moves when a row BREAKS, not only when one is written (D491)

`patches LITERALLY` read **22** mid-slice against a recorded 21, and returned to 21 once `precheck`'s
broken rows were repaired. The cause: a row whose `find` occurs **twice** in its target is counted as
spliceable, because `String.replace` and split/join then disagree about it.

**Read a moved gate population as a question about the corpus's HEALTH before reading it as a change
in the corpus.** A count that drifts without an authoring edit is usually a broken row, not a new
dependency.

### Name which LAYER each witness covers — census, reader, executor (D491, extending D490-ii)

D490 showed that a witness re-pointed onto a reader's return value is blind to the assembler. D491
ran the attribution control at **both** layers and produced the full map:

| witness kind | reader mutation | executor mutation |
|---|---|---|
| census (`censusAtHead`) and loud controls | green | green |
| value re-point onto the reader's answer | **red** | green |
| behavioural suite | **red** | **red** |

So: **the census and the loud controls are blind to both layers**; a value re-point — the form D438
says to prefer — covers **the reader only**; and **only a behavioural suite covers the executor.**
State this explicitly in the rung, so a later slice does not read a green family suite as coverage of
the program its reading builds.

### Count MATCHES, not LINES, when grepping the census tax (D491)

D491's front-term pass found **21 sites across 8 files** where `grep -n` reported **18 / 9** — three
lines carry two chains each. Use `grep -o` (or a regex `findall`) and count matches.

🆕 **And naming a constant is what makes it greppable**: wave 3 was a single site,
`RAW_UNBUILT_ATTACK_UNITS`, found by one grep — where **seven consecutive slices** had stepped its
`toBe(N)` pin and missed the bare arithmetic operand beside it, because the operand had no name until
D458 gave it one.

'''
s=s.replace(anchor,NEW+anchor,1)
io.open(p,'w',encoding='utf-8').write(s)
print('ok')
