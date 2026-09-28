import re, sys

NOTE = ("(\U0001f195\U0001f195\U0001f195 **D518 +1 sentence / +2 printings — THE §12 SPECIAL-CONDITION TALLY ON THE "
 "DEFENDING ACTIVE** — `censusAttackCorpus.ts` **FILE LINE 537**, *\"This attack does 100 damage for each "
 "Special Condition affecting your opponent's Active Pokémon.\"*, **1 sentence / 2 legal printings**, claimed "
 "by `deriveAttackDamageMultiplier` through ONE new anchor (`OPPONENT_CONDITION_COUNT_MULTIPLY`) and ONE new "
 "`DamageCountSource` member (`specialConditionsOnOpponentActive`, the **20th**), whose walk is "
 "`presentStatuses` — the SAME projection the shipped `opponentActiveHasSpecialCondition` predicate folds, so "
 "*predicate ⟺ count ≥ 1* holds BY CONSTRUCTION rather than by two readers agreeing. \U0001f6d1 **THE SHIPPED "
 "PREDICATE COULD NOT PAY THIS ROW**: `DamageCountSource.boardCondition` is the 0-or-1 INDICATOR (D115), whose "
 "ceiling is `per` at every `per`, while this sentence pays `per` per CONDITION and a body can carry THREE. "
 "⚠️ **THE SENTENCE STEP AND THE PRINTING STEP DISAGREE, 1 vs 2**, so a `.length` site takes +1 where a "
 "`units(…)` site takes +2 — measured off the corpus row rather than copied between the two kinds of site "
 "(D451/D461). READER summand ALONE — registry 10/16, gate 5/13 and trailing 11/21 all re-measured unmoved — "
 "and the reader surface stands still at **13**.)")

def patch(path, lineno, old, new, note=NOTE):
    ls = open(path).read().split('\n')
    i = lineno - 1
    l = ls[i]
    assert old in l, (path, lineno, l[:200])
    code, sep, tail = l.partition('  // ')
    if sep == '':
        code, sep, tail = l, '  // ', ''
    assert old in code, (path, lineno, code[:200])
    ls[i] = code.replace(old, new, 1) + sep + note + (' ' + tail if tail else '')
    open(path, 'w').write('\n'.join(ls))
    print("patched", path, lineno)
