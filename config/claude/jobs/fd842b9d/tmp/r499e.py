import io
p='docs/conventions.md'
s=io.open(p,encoding='utf-8').read()
anchor='## Git / commits'
NEW = r'''### A refusal scoped to a CARRIER is not a refusal of the sentence (D499)

D142 recorded that this row needed *"a SECOND consequent on the same flip"*, four suites carried the
refusal, and one called it *"a durable witness rather than a treadmill"*. It stood for **57
decisions**. **Every clause was true of `deriveAttackEffect` and false as a claim about the engine.**

That reader's program runs at the **tail**, after §8.5 — so an `otherwise` arm cannot retract damage
already dealt, exactly as the block said. But `deriveAttackCoinFlip` is read **~1,000 lines earlier,
in front of §8.5**, and can.

🛑 **The disproof is one question, and it is cheap: WHICH CARRIER IS READ AT THE SEAM THE RULE
RESOLVES AT?** Ask it of every recorded refusal before pricing the row it guards. *"No widening of
any anchor in THIS family can reach it"* is the hardest form to see, because the scope qualifier is
doing all the work and reads like emphasis.

✅ **And note what a correctly-scoped refusal buys**: because D142's was about a carrier rather than
the sentence, **five shipped `toBeNull` witnesses stayed green and armed** through the build. A
refusal that overreaches takes its witnesses down with it.

### A third lattice shape: the PREREQUISITE HALF (D499)

Three shapes are now on record, and they say different things:

- **D489/D490/D494** — one built point at **full** weight: *no proper subset builds*, so nothing
  smaller is claimed and an anchor is warranted.
- **D495** — built-by-weight `0/1 · 2/2 · 0/1`: **every segment builds** and only the combination has
  no reader; no prerequisite half and no superset to compose from.
- **D499** — built-by-weight `0/1 · 1/3 · 0/1`: **one built point at weight 1**, reached by deleting
  a segment whose complement is *itself a printed corpus row*.

**The third says the blocker is the JOIN**, which is a **seam** question — and that is why D499's
answer was a new member on the reader that owns the seam rather than a whole-sentence anchor.

**Report the built-by-weight vector, not the verdict.** All three end in "ship something"; only the
vector says what.

### The two-reader idiom is free only when neither reader consumes a RESOURCE (D499, bounding D493/D494)

D493 and D494 shipped sentences claimed by **two** readers over one anchor, because `attack.ts` hands
the same `effect` string to all five damage readers — one constant, zero caller bytes.

**That is free only when the readers are pure.** Here both consume `state.rngState`, and `attack.ts`
runs both blocks unconditionally — so a dual claim spends **two rng steps and emits two coin-flip
rows for one printed flip**, and the two faces can disagree.

🛑 **Before reaching for the idiom, ask what each reader SPENDS.** And when a single printed flip must
drive two consequences, assert the resource directly: D499 drove `rngState` to be **byte-identical to
the sibling's on the same seed, on both faces**, with seeds searched rather than stubbed.

### A first-probe survivor must be discriminated with `--only … --full` (D499, applying D455)

D499's first probe returned one GAP. The cheap reading is *"my killer set is too narrow"*. The
measured reading required running the single row against the **whole suite**: it survived **482 files
/ 11,001 tests**, so the killer set was not the problem — the anchor's `^` had **zero rows
intersecting it by span for 373 decisions**.

**Measure the absence by SPAN, not by decision name** (D453), and then **fix the suite, not the row**
(D496): D499's row stayed byte-for-byte and the suite gained a constructed prefix.

⚠️ **Dispatch ORDER is what makes a sibling anchor's terminator observable.** Two whole-sentence
anchors are structurally disjoint while both keep their terminators; reading the one that *can* widen
first is what turns its loosening into a red rung instead of a survivor.

'''
s=s.replace(anchor,NEW+anchor,1)
io.open(p,'w',encoding='utf-8').write(s)
print('ok')
