import io
p='docs/conventions.md'
s=io.open(p,encoding='utf-8').read()
anchor='## Git / commits'
NEW = r'''### A family can be BUILT, GREEN and CENSUS-COMPLETE while being executable by nothing (D495)

`bun scripts/mutation/run.ts --decision D142 --allow-dirty` prints **"No mutants selected."** So do
`D144` and `D148`. D142's gated-prevent family is **19 legal printings — the largest single mapping
in D134's census — and no mutant row has intersected it by span for roughly 350 decisions.** Every
green whole-corpus sweep in that span said precisely nothing about it.

🛑 **The census cannot see this and neither can the sweep.** A census reports whether a sentence is
*claimed*; a green sweep reports that every row that exists was killed. **Neither reports that no row
exists.**

**`--decision <D>` printing "No mutants selected" is the cheapest audit in the toolkit, and nothing
runs it on a cadence.** Sweep every decision id for it once, and treat an empty result as a finding
rather than as an absence of news.

⚠️ **Measure the gap by SPAN, not by op name** (D453). A family can have rows that mention it in
prose while nothing mutates the lines that implement it.

### A WEIGHT-1-ONLY lattice is a distinct warrant for a whole-sentence anchor (D495)

D489, D490 and D494 each produced a lattice with exactly one built point at **full** weight — *no
proper subset builds*, so the anchor is justified because nothing smaller is claimed.

D495 produced the opposite: built-by-weight **0/1 · 2/2 · 0/1**. **Every segment of the print is
already claimed and only the combination has no reader.** There is no prerequisite half and no proper
superset to compose from, which is a *different* justification for the same conclusion.

**Report the built-by-weight vector, not just the verdict.** Two lattices that both end in "ship an
anchor" can say opposite things about why, and the difference is what a later slice needs.

### Enumerate a gated family by BOTH faces of its gate (D495)

A `^Flip a coin\. If heads, ` pattern cannot see a row that opens *"Flip a coin. **If tails**, this
attack does nothing. **If heads**, …"*. D495's work order miscounted the family for exactly that
reason — the conclusion survived, the enumeration did not.

**Match on the gate, not on one of its faces**: `/^Flip a coin\. If (heads|tails), /`. The same
applies to any two-armed construct where one arm may be spelled first.

### A recorded refusal that quotes a PRICE needs the price re-derived, not just the claim (D495)

D490 established that a recorded refusal can be stale and D491 that it can be answering a different
question. D495 adds the third failure mode: **a refusal whose reasoning is a cost estimate**, where
half the estimate is real and half is not.

The refusal priced this row at *"a seed sweep **and a fourth fixture**"*. The seed half was real —
the target suite pins a seed-free claim, so the board belonged in a new file. **The fixture half was
wrong**: D452's file-local `cardPool` idiom keeps a demonstrator out of `FIXTURE_POOL` entirely, so
the pool-size pin, an eleven-deep `ids.length` ladder and a derivable sweep all took a **zero** term.

**Re-derive each term of a quoted price separately.** A price is a conjunction, and conjunctions rot
one clause at a time.

### D463's eaten-minus-sign trap does not fail loudly (D495)

A front-term splice whose marker *includes* the `- ` produces `resolving.length - - 1 /*D495*/ 1
/*D494*/…`. **`git diff` looks plausible.** The suite does not go red in a way that names the cause:
what surfaced it was a **`PARSE_ERROR` in 8 files with 210 tests silently NOT COLLECTED, while the
summary still read "15 failed."**

⚠️ **The convention already gives the correct form** — splice with a `head` that *excludes* the sign
— **and it was read and still got wrong on the first pass**, because the marker including the sign is
the natural thing to grep for.

🛑 **After any front-term pass, check the COLLECTED-TEST count, not just the failure count.** A
falling total with a plausible failure line is the signature of a parse error, and a parse error in a
census file hides exactly the assertions the pass was editing.

### Decline a rung rather than ship it vacuous — and leave an executable falsifier (D495, applying D200)

D495's first shield-interaction draft set a **made-up field** on the victim and **passed while
asserting nothing**. It was caught by **reading the draft, not by a red run** — a vacuous rung is
green by construction and no harness will complain.

The mechanism was driven by a **registry** lookup that a per-board `cardPool` clone cannot inject, so
the honest options were a wider fixture (which would have reddened another suite's boards) or a
decline.

**Declining is legitimate; declining silently is not.** The decline shipped with an executable
falsifier — every id in the deck asserted registry-free — so the day one gains a row, the rung goes
red and names the reason the decline expired.

'''
s=s.replace(anchor,NEW+anchor,1)
io.open(p,'w',encoding='utf-8').write(s)
print('ok')
