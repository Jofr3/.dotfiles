import io
p='docs/progress.md'
s=io.open(p,encoding='utf-8').read()
old_row='| simulator | P3 | 🚧 **M1–M3 + M4 done; M5 in progress** (latest: **P3-M5 — D501,'
i=s.index(old_row); j=s.index('\n',i)
new_row=('| simulator | P3 | 🚧 **M1–M3 + M4 done; M5 in progress** (latest: **P3-M5 — D502, *the deck '
 'search that energises what it benched*: a SIXTH lattice shape — empty at every weight, which is a '
 'claim about the FAMILY (§9.2 gates have no composition path at all) rather than about the axes. The '
 'park\'s arity does NOT collapse, because the force is gated on the FLOOR. And `tsc` caught 21 rows '
 'with array-valued `what` that `precheck` and the probe both passed. D230\'s refusal survived '
 're-derivation with BOTH clauses true. 1 sentence / 1 printing**; engine 0.394.0, corpus 2,486, '
 'check GREEN 485/11,105) |')
s=s[:i]+new_row+s[j:]
log_anchor='### 2026-09-11 — build session #441 (P3-M5 — D501)'
assert s.count(log_anchor)==1
ENTRY = r'''### 2026-09-12 — build session #442 (P3-M5 — D502)

**THE DECK SEARCH THAT ENERGISES WHAT IT BENCHED — A SIXTH LATTICE SHAPE THAT IS A CLAIM ABOUT THE
FAMILY, AND `tsc` CATCHING WHAT `precheck` AND THE PROBE BOTH MISSED.** Engine **0.393.0 → 0.394.0**,
**`MATCH_RECORD_VERSION` HELD at 30**, corpus **2,464 → 2,486**, declared survivors **48 → 50**,
archive ratchet **171 → 172**, `bun run check` GREEN at **485 files / 11,105 tests**.

**(0) THE BUILD.** Corpus **file line 440**, 1 printing: **REFUSED 13/13** with all four splitters
null. ⚠️ **The head is itself a corpus row at 7 printings**, which made it a free attribution control
— something the brief did not say.

**(1) 🛑 A SIXTH LATTICE SHAPE: EMPTY AT EVERY WEIGHT.** The whole-sentence 2⁴ reads
**`0/1 · 0/4 · 0/6 · 0/4 · 0/1`** — **no built point anywhere, and all four axes flip a verdict at 0
of 8 cells.** **That is a claim about the SEAM, not the axes**: the §9.2 gate family is **7 sentences
/ 9 printings**, every one claimed WHOLE by an anchor that welds its own head, **with no composition
path at all**. So the honest whole-sentence table is **2⁰**, and the informative one is the **tail's
own 2³** — `0/1 · 0/3 · 0/3 · 1/1`, no degenerate axis, D489's shape. ⚠️ **And a degenerate axis
makes the point set smaller than the bit set** — 16 points, **8 distinct strings** — so an instrument
collecting them into an array rather than a Set reports the print twice, which the first draft did.

**(2) 🛑 THREE OF MY CONFIDENT CLAIMS WERE WRONG, AND THE CENTRAL ONE INVERTED THE CARRIER.** I
wrote: *"NO op targets a recorded uid as a DESTINATION … the slot-targeting shape ships in the
NEGATIVE, on a different carrier."* True of **recorded** uids only — **`moveEnergy` already pins
destinations by uid at two `route` values, on the SAME op**, verified at ritual time (`sourceRef` is
documented as *"the `ctx.sourceUid` question every other…"*). **So the precedent to argue against was
a two-member unanimous set on the same carrier saying *make it a route*** — refused because a `route`
holds a **structural position** where a recorded body is a **runtime identity**, and because the
crossing (free route + pin) is unspellable that way. Shipped as a **rider**. Also wrong: *"twelve ops
carry `recordAs`"* (**12 declarations across 11 op kinds**), and my quote of `moveEnergy`'s parking
comment is **three slices stale** — D441 gave the op a forced arm, **which is the very fact the arity
question turns on**.

**(3) ✅ D230's REFUSAL SURVIVED RE-DERIVATION WITH BOTH CLAUSES TRUE.** After five consecutive slices
found an inherited price naming something already built, this one was real in both halves — *"`searchDeck`
files no record, and no `moveEnergy` destination says 'wherever the last op put it'."* **Worth saying
out loud**: the run's habit is to report only the falsifications, and *"the quoted price was real"*
is what makes a refusal worth acting on.

**(4) 🛑 THE PARK'S ARITY DOES NOT COLLAPSE, AND THAT IS THE FINDING.** The decision count falls
2 → 1 and `destinations` is length 1 — which looks like D441's forced arm and is not. **That force is
gated on the FLOOR**, and *"move **an** Energy"* gives `max: 1` → floor 0, so **the decline is still
an answer and the op still parks.** Driven: the decline is accepted, `min` is absent from the prompt,
and `movable` carries two distinct classes so *"which Energy"* stays a live question. **Read the
arity question at the floor, not at the candidate count.**

**(5) THE TAIL-ONLY TRAP, DRIVEN AND REFUSED.** The trailing splitter's only unmet condition on this
string is the tail, so claiming it would free the row **more cheaply**. Refused because the tail
carries **two** anaphors pointing out of its clause — *"in this way"* and *"the **new** Benched
Pokémon"* — so the splitter would compose it behind any claimed head and read a `recordGate` on a
slot nothing filed. ⚠️ **D485's case degraded loudly; this one degrades SILENTLY** — the gate is
simply false.

**(6) 🆕 `tsc` CAUGHT WHAT NO OTHER INSTRUMENT COULD.** 21 rows emitted a one-element **array** for
`what`. **`precheck` was clean and the probe ran all 22, reporting 20 killed / 2 known** — because
the runner reads `what` only to print it. **`bun run check` was red in seconds.** **D481's closed
hole is the only thing between a data error in the corpus and a green gate**, and this is the first
slice caught by it rather than by a sweep.

**(7) `MATCH_RECORD_VERSION` HELD at 30, ADDRESS FIRST — AND THERE ARE TWO DOORS.** Both new keys
land inside `EffectContinuation` at `GameState.phase.cont`: `searchDeck.recordAs` on the **parking**
op in `pendingOp`, and `moveEnergy.destRecorded` on the op **behind** it inside `rest` — **D450's
second door, the one that gets forgotten** — and both are in the real serialized bytes. So
reachability and serialized-alphabet are unavailable, and **D125's widening is what holds it**: both
keys are OPTIONAL and absent means what every v30 writer meant. ⚠️ **And the optional shape WOULD
have disarmed something**: a shipped key-set rung pins the **bare head's** program, which has no
`recordAs`, so it would have passed either way. New key-set rungs added **at both doors**.

**(8) THE DESCRIBER FIRES, FOR THE FIRST TIME IN A WHILE — AND IT TOOK THREE EDITS, NOT ONE.**
`recordSlotOf` learns `searchDeck` (the **eighth** recorder); `describeCondition` learns the printed
long condition; and **`describeBranch` had no `moveEnergy` arm at all**, so without it the caption
silently loses the whole clause (D473). Rendered, it is the card's printed second half byte for byte.
**`log.ts` needed nothing**, and ⚠️ **I predicted its destination segment would name the pre-existing
Bench body and was wrong** — it names the body the search benched, which is the pin reaching the one
surface a player reads.

**(9) ⚠️ THE TRIPWIRE AUDIT MISSED A ROW THAT ROTS ON EVERY CENSUS STEP.**
`D495-census-built-attack-not-stepped` quotes `"  attack: 1616,"` — twelve name-needles and seventeen
span regions missed it, and `precheck` found it in seconds. **The needle list must include the census
constants.** Two live tripwires it *did* find decided the anchor's position:
`D230-anchor-drops-the-tail` names this printing as its witness, and placing the new arm **after**
the head anchor is what keeps that mutation observable.

**(10) NUMBERS.** Residue **82/116 → 81/115**; **`COMPOUND-head` 6 → 5**; `BUILT.attack` **1616 →
1617**; the two steps **AGREE at 1 and 1**, verified off the corpus row. **66 literal substitutions
across 24 files, all by LINE NUMBER** with a **comment-aware** one-occurrence check — necessary
because `BUILT.attack - ` occurs 3–4× on one 67 KB line and **two chains share a physical line at
columns 6 and ~31,900**. Witness load **1 file / 1 rung**, sentence-quoting, not amortising. `it(`
**+41 EXACT**. Version tax **102 / 72**, against `git grep`'s 100 / 71.

'''
s=s.replace(log_anchor,ENTRY+log_anchor,1)
io.open(p,'w',encoding='utf-8').write(s)
print('ok')
