import io
p='docs/progress.md'
lines=io.open(p,encoding='utf-8').read().split('\n')
old6=lines[5]
assert old6.startswith('**Last updated:** 2026-09-11 — build session #438')
new6=('**Last updated:** 2026-09-11 — build session #439 (**P3-M5 — D499, *the cancel and the shield on '
 'ONE coin — a THIRD lattice shape, a 57-decision refusal overturned, and a mutant that SURVIVED '
 '11,001 tests.*** **The loop is back to building sentences.** Built corpus **file line 268**, *"Flip '
 'a coin. If tails, this attack does nothing. If heads, during your opponent\'s next turn, prevent '
 'all damage from and effects of attacks done to this Pokémon."* — **1 sentence / 2 legal '
 'printings**. 🛑 **A THIRD LATTICE SHAPE, AND MY PREDICTION OF D495\'s WAS WRONG.** Built-by-weight '
 '**`0/1 · 1/3 · 0/1`**: exactly one point builds, at **weight 1**, reached by **deleting the cancel '
 'arm** — and that arm\'s complement is itself **a printed 15-printing corpus row**. So there IS a '
 'prerequisite half, unlike D495\'s *every-segment-builds*, and it is not D489/D490/D494\'s *one '
 'built point at full weight* either. **The blocker is the JOIN — a SEAM question, which is why the '
 'answer was a coin member rather than an anchor.** Direction 2: the cancel held and the heads '
 'consequent varied over six printed alternatives — **all six build alone, none builds with the '
 'cancel in front, and all six mirrors refuse.** 🛑 **A 57-DECISION REFUSAL OVERTURNED, AND THE '
 'DISPROOF IS ONE QUESTION.** D142\'s block listed this row LOUD (*"a SECOND consequent on the same '
 'flip"*) and four suites carried it, one calling it *"a durable witness rather than a treadmill"* — '
 'and **every clause is TRUE of `deriveAttackEffect` and FALSE as a claim about the engine** '
 '(D456/D457). That reader\'s program runs at the TAIL, *after* §8.5, so an `otherwise` **cannot '
 'retract damage already dealt**; the carrier that CAN is `deriveAttackCoinFlip`, read ~1,000 lines '
 'earlier, in front of §8.5. **The question that disproves it: WHICH CARRIER IS READ AT THE SEAM THE '
 'RULE RESOLVES AT?** ✅ **And because the refusal was carrier-scoped, FIVE shipped `toBeNull` '
 'witnesses stayed GREEN and ARMED.** 🛑 **THE TWO-READER IDIOM DOES NOT TRANSFER, AND THE REASON IS '
 'A RESOURCE.** D493/D494 shipped sentences claimed by two readers because `attack.ts` broadcasts '
 '`effect` — but **both readers here consume `state.rngState`**, so a dual claim spends **two rng '
 'steps and emits two flip rows for ONE printed flip**, and the faces could disagree. **Before '
 'reaching for that idiom, ask what each reader SPENDS.** RNG driven: post-swing `rngState` is '
 '**byte-identical to the bare cancel\'s on the same seed, on both faces**, exactly one flip row, '
 'seeds **searched not stubbed**. 🛑 **AND A MUTANT SURVIVED 482 FILES / 11,001 TESTS — A REAL SUITE '
 'HOLE.** The first probe returned **1 GAP**; `--only … --full` discriminated it (D455) rather than a '
 'narrow killer set being blamed. `ATTACK_COIN_CANCEL`\'s `^` had **ZERO rows intersecting it by SPAN '
 'for 373 decisions**, measured over all 2,427 pre-existing `find`s **by span, not by name** (D453). '
 '**The row was NOT tuned; the SUITE was** (D496\'s pattern, second use). **`MATCH_RECORD_VERSION` 29 '
 'on the SERIALIZED ALPHABET, address named FIRST** — `InPlayPokemon.attackBlock`, a `GameState` '
 'field persisted **directly** with no park in front, so D450\'s reachability is the wrong shape and '
 'is stated **second** as the weaker half; the record is `{"turn":3,"effects":true}` **either way**, '
 'driven against the sibling sentence on the same seed. **No bump owed, none contorted around.** '
 '⚠️ **THREE OF MY CONFIDENT CLAIMS WERE WRONG AND BOTH MY HEDGES CARRIED** — D487\'s pattern, not '
 'D494\'s inverse. The lattice shape; *"the largest reachable row"* (it is **tied** at 2 printings '
 'with three others); and the family split — **verified at ritual time as 30 built / 12 unread '
 'pre-slice against my 27 / 15**, each half wrong by 3, **and they summed to 42, which is exactly '
 'what hid it.** Engine **0.390.0 → 0.391.0**. Corpus **2,427 → 2,439**, declared survivors **47 → '
 '48**, archive ratchet **169**. `bun run check` GREEN, **482 files / 11,002 tests** (+1 file, +33 '
 'tests). Residue **85/120 → 84/118**, `BUILT.attack` **1612 → 1614**.)')
lines[5]=new6
lines.insert(7,'**Last updated (was):** '+old6.split('**Last updated:** ',1)[1])
lines.insert(8,'')
io.open(p,'w',encoding='utf-8').write('\n'.join(lines))
print('ok')
