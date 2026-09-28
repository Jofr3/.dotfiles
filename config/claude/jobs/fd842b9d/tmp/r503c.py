import io
p='docs/progress.md'
s=io.open(p,encoding='utf-8').read()
old_row='| simulator | P3 | 🚧 **M1–M3 + M4 done; M5 in progress** (latest: **P3-M5 — D502,'
i=s.index(old_row); j=s.index('\n',i)
new_row=('| simulator | P3 | 🚧 **M1–M3 + M4 done; M5 in progress** (latest: **P3-M5 — D503, *REFUSED, '
 'with the measurement — and the cheap road was completely unguarded*: the pre-damage attach cannot '
 'be counted by the multiplier because the scaling is fixed before the hook runs (DRIVEN), and '
 'parking the attach means cutting `attack()` at a seam with 703 lines and 20 live locals to carry. '
 'Payoff 1 sentence / 1 printing. The one-arm shortcut answers 60 where the card says 210 and '
 'switches off the loud channel — now guarded. And the readers-only lattice said "no path" where the '
 'splitter-inclusive one said "a path with one guard." NO sentence built, zero engine bytes '
 'changed**; corpus 2,490, check GREEN 486/11,125) |')
s=s[:i]+new_row+s[j:]
log_anchor='### 2026-09-12 — build session #442 (P3-M5 — D502)'
assert s.count(log_anchor)==1
ENTRY = r'''### 2026-09-12 — build session #443 (P3-M5 — D503)

**REFUSED, WITH THE MEASUREMENT — AND THE CHEAP ROAD WAS COMPLETELY UNGUARDED.** 🛑 **No sentence
built, and the refusal is the deliverable.** Engine **0.394.0 UNMOVED**, `MATCH_RECORD_VERSION` **30
UNMOVED**, residue **81 / 115 UNMOVED**, `BUILT.attack` **1617 UNMOVED**, declared survivors **50
UNMOVED**; corpus **2,486 → 2,490**, archive ratchet **172 → 173**, `bun run check` GREEN at **486
files / 11,125 tests**.

**(0) THE SHAPE.** Corpus **file line 569**, 1 printing: **REFUSED 13/13**, all four splitters null,
and it stays refused. **ZERO engine source bytes changed** — verified by sha256 against the HEAD
blobs for `effects.ts`, `interpreter.ts` and `attack.ts` — so the whole diff is **64 insertions and
ZERO deletions** across two test files, four mutant rows and one new suite.

**(1) ✅ MY ORDERING HYPOTHESIS HELD, AND IT WAS DRIVEN RATHER THAN READ.** On a real board the
pre-damage hook discarded an Energy and the fold still scored **two** — **the scaling is fixed before
the hook runs**, so a pre-damage attach cannot be counted by the multiplier, which is the whole point
of the printed *"Before doing damage"*. ⚠️ **But I named the wrong local**: `scaledBase` is 0 for a
multiplier by construction; the load-bearing one is **`scaled` at line 1790**. ⚠️ **And there is a
SECOND blocker I never named** — `scaledAttackDamage` is handed `active`, a `const` bound **670 lines
before the fold**, so even a reorder must also rebind (D428's stale-local defect).

**(2) 🛑 BUT THE ORDERING IS NOT THE REASON TO REFUSE — THE SEAM IS.** *"You may attach any number"*
is declinable, so the attach **parks** — and `applyAttackPreDamage` returns a type its own doc block
calls *"not an `ApplyResult`, not a `RunResult`, not anything `settleProgram` could drain"*: **the
park is forbidden by the compiler, deliberately** (D429's property-not-shape rule, at the type).
`attack()` spans **2,155 lines with exactly ONE continuation point**, in its tail. Parking at the
hook leaves **703 lines and 20 live locals** to carry — including an accumulated `GameEvent[]` and a
mutated board — which is **a new persisted shape at `phase.cont`, not a widening**. **Payoff: 1
sentence / 1 printing. That is the refusal.**

**(3) 🛑 AND THE CHEAP ROAD IS A TRAP THAT HAD NO GUARD AT ALL.** **One** arm in `deriveAttackEffect`
claiming the printed tail makes the trailing splitter compose the whole sentence. Driven on a real
board: the correct answer is **210**, the composed program answers **60**; the park caption promises
*"your Pokémon in any way you like"* where the card prints *"this Pokémon"*; **the Bench becomes a
legal target**; the residue **falls** and `BUILT.attack` **steps**; and the engine's one honest
failure channel — `ATTACK_EFFECT_SKIPPED` — **switches off**. D485's rule at a *timing* clause rather
than an anaphor, and D190b/D199 at the instrument layer. **It is now guarded**, armed by a row whose
killer names **the tripwire alone**, so a kill proves the tripwire discriminates rather than the
census.

**(4) 🆕 A METHOD FINDING THAT INVERTS CONCLUSIONS.** The **readers-only** lattice reads
`0/1 · 0/3 · 0/3 · 0/1` — D502's empty shape, *"the seam has no path"*. The **splitter-inclusive**
lattice reads `0/1 · 0/3 · 1/3 · 1/1` — *"the seam HAS a path, and one reader's refusal is the only
guard."* **Opposite conclusions from one sentence, and only the second is actionable.** ⚠️ **Every
lattice this run has reported was readers-only**, so the six recorded shapes may each be missing a
splitter dimension.

**(5) ✅ THE SHIPPED REFUSAL SURVIVED RE-DERIVATION IN BOTH CLAUSES** — D502's rule on its second
consecutive slice. ⚠️ **One clause was imprecise and was corrected in place, both copies**: *"an
unbounded count"* reads as a missing capability and is not one — `attachFromHand` has taken *"any
number"* since D247. **A fourth failure mode for a reason: true under a narrower reading than its
words carry**, beside D479's *false-when-written / rotted / reason-only*. The verdict stands; **the
precise blocker is a PINCER** — `attachFromHand` has the unbounded count but no destination
narrowing, `attachEnergyFrom` has `toSelf` but a numeric count, and neither op has both halves.

**(6) ⚠️ THREE OF MY CONFIDENT CLAIMS WERE WRONG, ALL VERIFIED AT RITUAL TIME.** `AttackPreDamage`
has **FOUR** kinds, not three; one of them targets the **attacker's own** body rather than the
opponent's; and `D495-census-built-attack-not-stepped` quotes **`attack: 1617`**, not the 1616 I
wrote — **a number D502's own convention entry also recorded wrongly, and which I corrected in
`conventions.md` during this ritual.** **Re-derive a census literal from the module, never from a
convention.**

**(7) THE OBLIGATIONS.** Both describers traced to their single call site: `recordSlotOf` enumerates
**eight** recorders and `attachFromHand` is not among them, so the obligation is **empty on both
roads** — D478/D489's rule re-earned for a fourth consecutive slice. **`log.ts` rendered**, with the
honest limit at the rung: this slice adds no event and no arm, so the rendering measures the
**refused** build rather than shipped behaviour.

**(8) WITNESS LOAD — 2 files, AND THEY ARE COMPLEMENTARY RATHER THAN REDUNDANT.** One asserts
`deriveAttackEffect` is null and catches **Path A only**; the other asserts the two damage readers
are null and catches **Path B only**. **Count witnesses by which build road each can see**, not by
how many name the sentence.

'''
s=s.replace(log_anchor,ENTRY+log_anchor,1)
io.open(p,'w',encoding='utf-8').write(s)
print('ok')
