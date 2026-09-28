import io
p='docs/progress.md'
lines=io.open(p,encoding='utf-8').read().split('\n')
old6=lines[5]
assert old6.startswith('**Last updated:** 2026-09-12 — build session #442')
new6=('**Last updated:** 2026-09-12 — build session #443 (**P3-M5 — D503, *REFUSED, WITH THE '
 'MEASUREMENT — and the cheap road was completely unguarded.*** 🛑 **NO SENTENCE BUILT, AND THE '
 'REFUSAL IS THE DELIVERABLE.** Corpus **file line 569**, *"This attack does 30 damage for each {W} '
 'Energy attached to this Pokémon. Before doing damage, you may attach any number of Basic {W} Energy '
 'cards from your hand to this Pokémon."* — **REFUSED 13/13**, and it stays refused. **ZERO engine '
 'source bytes changed**, verified by sha256 against the HEAD blobs for `effects.ts`, `interpreter.ts` '
 'and `attack.ts`; the whole diff is two test files, four mutant rows and one new suite. ✅ **MY '
 'ORDERING HYPOTHESIS HELD, AND IT WAS DRIVEN RATHER THAN READ.** On a real board the pre-damage hook '
 'discarded an Energy and the fold still scored **two** — **the scaling is fixed before the hook '
 'runs**, so a pre-damage attach cannot be counted. ⚠️ **But I named the wrong local**: `scaledBase` '
 'is 0 for a multiplier by construction; the load-bearing one is **`scaled` at line 1790**. **And '
 'there is a SECOND blocker I never named** — `scaledAttackDamage` is handed `active`, a `const` '
 'bound **670 lines before the fold**, so even a reorder must also rebind (D428). 🛑 **BUT THE '
 'ORDERING IS NOT THE REASON TO REFUSE — THE SEAM IS, AND IT IS MEASURED.** *"You may attach any '
 'number"* is declinable, so the attach **parks** — and `applyAttackPreDamage` returns a type its own '
 'doc block says is *"not an `ApplyResult`, not a `RunResult`, not anything `settleProgram` could '
 'drain"*: **the park is forbidden by the compiler, deliberately.** `attack()` spans **2,155 lines '
 'with exactly ONE continuation point**, in its tail; parking at the hook leaves **703 lines and 20 '
 'live locals** to carry, including an accumulated `GameEvent[]` and a mutated board — **a NEW '
 'persisted shape at `phase.cont`, not a widening.** **Payoff: 1 sentence / 1 printing. That is the '
 'refusal.** 🛑 **AND THE CHEAP ROAD IS A TRAP THAT HAD NO GUARD AT ALL.** ONE arm in '
 '`deriveAttackEffect` claiming the printed tail makes the splitter compose the whole sentence — '
 'driven on a real board: the correct answer is **210**, the composed program answers **60**, the '
 'park caption promises *"your Pokémon in any way you like"* where the card prints *"this Pokémon"*, '
 '**the Bench becomes a legal target**, the residue **falls**, and the engine\'s one honest failure '
 'channel **switches off**. **It is now guarded, armed by a mutant row whose killer names the '
 'tripwire ALONE** so a kill proves the tripwire discriminates rather than the census. 🆕 **A METHOD '
 'FINDING THAT INVERTS A CONCLUSION**: the readers-only lattice reads `0/1 · 0/3 · 0/3 · 0/1` — '
 'D502\'s empty shape, *"the seam has no path"* — while **the SPLITTER-INCLUSIVE lattice reads '
 '`0/1 · 0/3 · 1/3 · 1/1`, *"the seam HAS a path and one reader\'s refusal is the only guard"*.** '
 '**Opposite conclusions from one sentence; run the lattice over the RESIDUE PREDICATE, not the '
 'readers alone.** ✅ **AND THE SHIPPED REFUSAL SURVIVED RE-DERIVATION IN BOTH CLAUSES** (D502\'s '
 'rule, second consecutive slice) — though one clause was **imprecise and corrected in place, both '
 'copies**: *"an unbounded count"* reads as a missing capability and is not one. ⚠️ **THREE OF MY '
 'CONFIDENT CLAIMS WERE WRONG**: `AttackPreDamage` has **FOUR** kinds, not three (verified); one of '
 'them targets the **attacker\'s own** body, not the opponent\'s; and '
 '`D495-census-built-attack-not-stepped` quotes **`attack: 1617`**, not the 1616 I wrote — **a number '
 'D502\'s own convention entry also recorded wrongly, corrected in `conventions.md` this ritual.** '
 'Corpus **2,486 → 2,490**, declared survivors **50 UNCHANGED**, archive ratchet **173**. `bun run '
 'check` GREEN, **486 files / 11,125 tests**. Residue **81/115 UNMOVED**, `BUILT.attack` **1617 '
 'UNMOVED**, engine **0.394.0 UNMOVED**, `MATCH_RECORD_VERSION` **30 UNMOVED**.)')
lines[5]=new6
lines.insert(7,'**Last updated (was):** '+old6.split('**Last updated:** ',1)[1])
lines.insert(8,'')
io.open(p,'w',encoding='utf-8').write('\n'.join(lines))
print('ok')
