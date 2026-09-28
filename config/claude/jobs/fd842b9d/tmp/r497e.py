import io
p='docs/conventions.md'
s=io.open(p,encoding='utf-8').read()
anchor='## Git / commits'
NEW = r'''### A module namespace's key order is a property of the LOADER, not the module (D497)

`Object.entries` on an ES module namespace is **spec-sorted** under Bun's native ESM and
**declaration-ordered** under vite/vitest's SSR transform. Measured on the same bytes:
`Object.keys(effects)` arrives already sorted under `bun` and does not under `vitest`.

So a `.sort()` over that input is **a no-op in one runner and real behaviour in the other** — and
this repo reads the same function under **both** (suites under vitest, `scripts/residue-census.ts`
under Bun).

🛑 **Never reason about enumeration order from the source. Measure it in the runner that owns the
answer** — and when two runners own different answers, say which one a rung is pinning.

### "No witness exists" is a claim about a GREP, and the shape you grep for decides it (D497)

A work order reported that nothing asserted the reader surface's *contents* or *order* — having
looked for length pins. There were **~50 order-sensitive sites**, spelled
`expect(<names>.sort()).toEqual(surface())`. **`toEqual` on arrays is order-sensitive**, so a sorted
left-hand side pins order *and* membership.

🛑 **The diagnosis changes the whole slice.** *Untested* needs a witness; **driven-but-unpinned needs
ROWS** (D474). Acting on the wrong one means "fixing" a guard that already existed and shipping a
redundant rung.

⚠️ **And classify witnesses by what they can SEE, not by the fact that they exist.** Two of those
sites re-sort the surface before comparing and are blind to order **by construction**. A killer set
assembled from length-only suites lets every order mutation survive and reports a gap that is not
there.

### Both halves of a two-clause guard deserve a row, and the PAIR is the finding (D497)

For `name.startsWith("deriveAttack") && typeof value === "function"`: dropping the prefix conjunct
takes the oracle from 13 entries to 25 and the residue **to zero**; dropping the `typeof` conjunct
changes nothing, because no non-function export carries the name.

**Ship both.** One is KILLED; the other is a declared survivor with kind `unreachable-population`
that self-invalidates the day such an export appears. **One conjunct is load-bearing and one is
defence in depth, and only the pair tells you which** — which is exactly what a later reader needs
before touching either.

⚠️ **And note where the damage actually shows up.** The count is defended by ~90 assertions, so a
count-changing mutation dies instantly; the dangerous mutations are the ones that **preserve** the
count. Aim rows there.

### `equivalent` has a third kind: PURITY (D497, extending D468)

D468 named structural and guarded disjointness. A **memo over an input fixed at load** is neither:
the recomputation is a pure function of an immutable value, so no board can separate memoised from
recomputing.

**State the falsifier you checked, not the one you assume.** D497's was `grep -rn 'vi.mock(\|vi.spyOn('`
over the engine returning **0** — nothing can stub the namespace mid-run, so the input really is
immutable for the suite's lifetime. The obligation is to re-derive that the day it stops being true.

### A coverage slice should say when a region is thinner than it looks (D497)

Seven candidate mutations existed on a 16-line function and **three were unobservable today**. The
honest output is six rows plus the measurement for the seventh — not seven rows, and not silence.

⚠️ **Declining a row is a result when it carries its reasoning.** D497 recorded why
`startsWith` → `includes` was skipped (equivalent at the same count and order, probed green in five
suites) so a successor can disagree in one line rather than re-deriving it. And it declined the
realistic memo slips because they die by TypeError everywhere — **measuring the language rather than
the code** (D440).

'''
s=s.replace(anchor,NEW+anchor,1)
io.open(p,'w',encoding='utf-8').write(s)
print('ok')
