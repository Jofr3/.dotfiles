import io, re
p = 'docs/progress.md'
s = io.open(p, encoding='utf-8').read()
lines = s.split('\n')

# ---- 1. stamp ----
old6 = lines[5]
assert old6.startswith('**Last updated:** 2026-09-08 — build session #427'), old6
new6 = ('**Last updated:** 2026-09-08 — build session #428 (**P3-M5 — D488, *the recording mill: '
 'two rows, one mechanism, and the pair-hood MEASURED BY AXIS DELETION rather than asserted.*** '
 'Built corpus **file lines 126 and 129**, *"Discard the top 3 cards of your deck, and this attack '
 'does 80 damage for each Energy card you discarded in this way."* and its `Misty\'s Pokémon` '
 'sibling at count 7 — **2 sentences / 2 legal printings through ONE anchor**. '
 '🛑 **THE PAIR REALLY DOES SHARE ONE MECHANISM, AND THAT IS A MEASUREMENT.** Each axis deleted in '
 'turn and both rows re-run against all 13 readers: deleting the FILTER refuses both (**and '
 'collapses them to the SAME STRING at two counts**), deleting the MILL HEAD refuses both, deleting '
 'the SCALING builds both. **Two blockers — `discardDeckTop` filed nothing (`recordAs` absent) and '
 '`damageDefender.count` was read by `.length` with no filter — and both rows carry BOTH.** Unlike '
 'D483\'s 2+2 split this is one cluster; the filters differ in KIND (category vs owner-prefixed name) '
 'and that difference cost **ZERO**. Pair-hood is pinned in the corpus two ways: two rows are '
 'characters only row B can see, so a split would have left them with no killer. '
 '🛑 **THE COMPOSITION NEAR-MISS IS REAL, DERIVABLE, AND CONSTRAINS THE BOARD RATHER THAN DISSOLVING '
 'THE QUESTION.** *"…for each Energy card in your discard pile."* IS claimed by '
 '`deriveAttackDamageMultiplier` — but it folds at DECLARATION, before the program runs, and counts '
 'the WHOLE pile. **On a pile that starts EMPTY the two are equal BY ALGEBRA for every deck, count '
 'and noun** — the pile afterwards *is* what the mill moved — so every board in the suite pre-seeds '
 'the pile. Board A separates 6 of 8 candidate readings, **board B separates all 8** (140 / 490 / 0 / '
 '350 / 770 / 210 / 280 / 70), which is why the file fields two decks. ⚠️ **And ONE candidate no '
 'board can separate — a MILL-SIDE filter — is arithmetically identical forever on any deck whose top '
 'N all match, so §6 asserts the pile CONTENTS, not only its size.** '
 '🛑 **WITNESS LOAD COUNTED BEFORE PRICING (D487-ii), AND IT DID NOT SCALE WITH ROW COUNT.** Neither '
 'sentence appears verbatim outside the census; the refusal witness is held BY PREDICATE in **one '
 'file, two rungs**, shared across the pair — **building both cost exactly what building one would '
 'have**, and no mechanism count predicts that. Both rungs re-pointed onto the SHAPE and one now '
 'discriminates the arms **by the op**, because a `.length` re-point would have gone on being right '
 'while the sentence it names stopped being true. '
 '⚠️ **MY BRIEF\'S HEDGED READ WAS HALF RIGHT AND THE WRONG HALF IS THE INTERESTING ONE**: '
 '`DamageCountSource` is **not involved at all** (it folds at declaration, off the board) — this '
 'family\'s count is an `EffectSlot` shipped since **D96** — and the brief **never named the other '
 'blocker at all**. **ZERO** new `EffectOp`/`EffectSlot`/`CardFilter`/`BoardCondition`/'
 '`DamageCountSource` members, readers (**13**), prompts, parks, events, state fields or schema '
 'bytes; two OPTIONAL op keys and one noun resolver that READS `DISCARD_PILE_NOUNS` without adding '
 'to it. **Describer obligation checked by CALL PATH and found EMPTY** — `recordAs` with no '
 '`recordGate` reaches no describer. `MATCH_RECORD_VERSION` **29 HELD and DRIVEN at the hard '
 'address**: a v29 `{op:"damageDefender",per:80,count:"discarded"}` still counts the whole slot — '
 '**240 vs the filtered 80**, a different number, so the rung cannot pass by accident. Engine '
 '**0.382.0 → 0.383.0**. Corpus **2,301 → 2,312**, archive ratchet **158**. `bun run check` GREEN, '
 '**474 files / 10,756 tests**, `it(` delta **+31 EXACT**. Residue **95/134 → 93/132**, '
 '`BUILT.attack` **1598 → 1600**.)')
lines[5] = new6
lines.insert(7, '**Last updated (was):** ' + old6.split('**Last updated:** ',1)[1])
lines.insert(8, '')
io.open(p,'w',encoding='utf-8').write('\n'.join(lines))
print('stamp ok')
