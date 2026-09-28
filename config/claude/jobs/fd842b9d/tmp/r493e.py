import io
p='docs/conventions.md'
s=io.open(p,encoding='utf-8').read()
anchor='## Git / commits'
NEW = r'''### Price each branch of a fork ALONE as well as together (D493)

D493 faced a two-blocker row and a work order that asked *"which branch frees more?"* — a question
that presupposes the branches are independent. Measured, they were not:

- **(A)** the vocabulary gap freed **0 sentences / 0 printings** alone. The clause it would teach is
  printed standalone **zero** times.
- **(B)** the composition seam freed **0 / 0** alone. The set it would serve — *refused whole,
  unserved by all splitters, head claimed, tail claimed by a non-effect reader* — was **empty**.
- **(A)+(B) together freed 1 / 1** — which is exactly what a single whole-sentence anchor freed, for
  a fraction of the cost.

🛑 **A branch with an empty SOLO payoff is not half a slice. It is a prerequisite** — and a
prerequisite whose only consumer is the other branch is not a design option, it is a cost line.

**Compute each branch's payoff over the whole corpus separately before comparing them.** If neither
pays alone, the fork was never a fork.

### Before building a composition path, grep the corpus for the mutant whose `replace` IS that path (D493)

D493's composition branch already existed as a mutant row. `D409-tail-guard-widened-to-any-reader`
carries `replace: "  if (!claimedByAnyReader(tail)) return null;"` — **byte for byte the widening** —
and its `what` names the defect it ships: *"a tail claimed only by a DAMAGE reader would then be
admitted, and the caller has nowhere to put it… SILENT IN EVERY CENSUS."*

**Building that branch would have disarmed the tripwire that describes it** — D436's GAP, arrived at
from the authoring side rather than the sweeping side.

⚠️ **The needle is the GUARD LINE, not the decision number.** Nobody looking for "prior art on
trailing-clause composition" would search for `D409`; they would search for the code they were about
to write. Grep the corpus's `replace` column for the line you are about to add, before you add it.

### A dual-claim POPULATION rung is blind to correctness (D493, extending D469)

D469 established that a census measures whether a sentence is *claimed*, never whether it is claimed
*correctly*. D493 found the same blindness one layer down, at a rung that looked like a real check:

A **population** rung asserting *"exactly these N sentences are claimed by two readers"* stayed
**green** under a reader mutation that changed the derived value — because it asserts **how many
readers claim**, never **what they answer**.

**Say in the rung which layer it covers.** A population rung defends the shape of the reader table
and nothing about the numbers those readers produce; only a behavioural suite does that.

### When a sentence needs two readers, ask whether the caller already hands them the same string (D493)

`attack.ts` hands `effect` to all five damage readers. So a sentence that needs a multiplier **and** a
suppression cost **one constant and zero caller bytes** — the two readers simply both match it.

The alternative, a composition seam, would have cost a fifth splitter, a rebind in the four-stripper
chain, the `effectSimulated`/`modifierSimulated` terms, and the splitter disjointness matrix growing
6 pairs → 10 — **and that matrix would have fired**, because one shipped card carries both a leading
requirement clause and a trailing suppression clause.

**Check the caller's dispatch before designing a seam.** Two readers over one string is free when the
caller already broadcasts; a seam is never free.

⚠️ **And gate the second reader on the first.** D493's suppression arm fires only if the multiplier
arm also claims the string, so the pair cannot half-build — D445's `.test()`-beside-an-`.exec()`
defect, answered by asking the arm that owns the guards.

'''
s=s.replace(anchor,NEW+anchor,1)
io.open(p,'w',encoding='utf-8').write(s)
print('ok')
