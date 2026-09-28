import io, sys, os
os.chdir('/home/jofre/projects/luminous_ui')

def NOTE(delta):
    return ('(\U0001f195\U0001f195\U0001f195 **D515 ' + delta + ' — THE THIRD MEMBER OF D473’s PRINTED '
      '*“Discard a card from your hand. If you do, …”* FAMILY, AND THE BLOCKER WAS THE DESCRIBER '
      'RATHER THAN THE ANCHOR** — `censusAttackCorpus.ts` **FILE LINE 103**, '
      '*"Discard a card from your hand. If you do, your opponent discards a card from their hand."*, '
      '**1 sentence / 1 legal printing**, claimed by `deriveAttackEffect`. '
      '\U0001f6d1 **D473 MEASURED THIS ROW AND NAMED ITS BLOCKER IN WRITING, AND THE NAMED ONE WAS THE RIGHT ONE.** '
      '`HAND_COST_THEN_DRAW`’s block records D472’s whole-corpus measurement — widening that anchor’s '
      'consequent to `(.+)` claims this row and NO OTHER — and refuses it because `interpreter.ts`’s '
      '`describeBranch` had no phrase for `opponentDiscardsFromHand`: with none, `withConsequence` returns the '
      'prompt unchanged and the parking payment’s caption degrades to the bare '
      '*"Discard a card from your hand."*, **BYTE-IDENTICAL to an UNGATED payment’s**, while a census would '
      'record the row built. DRIVEN on both sides of the new case in `handCostOpponentDiscard.test.ts` §5 '
      'rather than quoted. The whole price is ONE anchor, ONE arm and ONE `describeBranch` case. '
      '✅ **ZERO new ops, op fields, op values, prompts, prompt fields, choice kinds, events, error codes, '
      '`CardFilter`/`BoardCondition` members, registry rows, `FIXTURE_POOL` ids or `packages/schema` bytes** — '
      '`payFromHand` + `recordGate` + `opponentDiscardsFromHand` is three shipped ops in the shipped order. '
      '\U0001f195 **THE LATTICE CHANGES SHAPE IN BOTH DIRECTIONS AT ONCE** (D513/D514): '
      'OPENER × GATE × CONSEQUENT × COUNT reads **6 of 16 → 7 of 16** over the residue predicate '
      'with flips `6·6·2·0` → `7·7·1·1`, so CONSEQ moves ONTO zero as the widening '
      'retires a cell while COUNT moves OFF it as the narrowing creates one — and the owed *"printed zero times"* '
      'measurement (the 640-sentence column prints NO gated plural) is paid in that suite’s §1. '
      '`MATCH_RECORD_VERSION` **HELD at 30** on the SERIALIZED-ALPHABET argument (D452/D462/D463); reachability is '
      'FALSE here because the payment parks, and the loss direction is driven.)')

SHORT = ('\U0001f195\U0001f195\U0001f195 D515, corpus FILE LINE 103, 1 sentence / 1 printing — THE THIRD MEMBER OF '
  'D473’s printed *“Discard a card from your hand. If you do, …”* family, claimed by '
  '`deriveAttackEffect` through ONE new whole-sentence anchor, ONE arm and ONE `describeBranch` case. '
  '\U0001f6d1 THE BLOCKER WAS THE DESCRIBER AND D473 NAMED IT: with no phrase for `opponentDiscardsFromHand` the '
  'parking payment’s caption degraded to the bare cost, byte-identical to an ungated payment’s. '
  '⚠️ **A TERM AT THE FRONT, AND THE FROZEN ENDPOINT IS UNTOUCHED** (D426/D463). '
  '\U0001f6d1 THE SENTENCE TERM AND THE PRINTING TERM ARE BOTH 1 HERE — the row carries one legal printing, so '
  'the two chains step together for once (D451).')

edits = []  # (file, old, new, count)

def sub(path, old, new, n=1):
    edits.append((path, old, new, n))

E = 'packages/engine/src/'

# ── live-head pins: [541, 1580] -> [542, 1581]
for f in ['cancelThenPrevent','defenderStatusTriple','derivedBenchSearchMove','flipDefenderAttackLock',
          'flipStatusEnergyDiscard','flipStatusHeadsTails','handDiscardScaledSnipe','inPlayTypeBonus',
          'opponentBenchCount','perHeadsEnergyDiscard','retreatCostBonus','selfDamagePerCounter']:
    sub(E+f+'.test.ts', ').toEqual([541, 1580]);  // (', ').toEqual([542, 1581]);  // ' + NOTE('+1 sentence / +1 printing') + ' (')

# ── toHaveLength(541)/toBe(541)
for f in ['benchNamedBonus','exOnlyActive','moreEnergyBonus','sameEnergyBonus','sawkRequirementSplit']:
    sub(E+f+'.test.ts', ').toHaveLength(541);  // (', ').toHaveLength(542);  // ' + NOTE('+1 sentence') + ' (')
sub(E+'censusAtHead.test.ts', 'expect(resolved.length).toBe(541);  // (',
    'expect(resolved.length).toBe(542);  // ' + NOTE('+1 sentence') + ' (')

# ── unbuilt [99, 152] -> [98, 151]
for f in ['bothBenchSpread','classedBoardSpread','scaledBenchSpread']:
    sub(E+f+'.test.ts', ').toEqual([99, 152]);  // (', ').toEqual([98, 151]);  // ' + NOTE('−1 sentence / −1 printing') + ' (')

# ── censusAtHead constants
sub(E+'censusAtHead.test.ts', 'expect(rawUnbuiltSentences.length).toBe(99); // (',
    'expect(rawUnbuiltSentences.length).toBe(98); // ' + NOTE('−1 sentence') + ' (')
sub(E+'censusAtHead.test.ts', '  attack: 1630, // (', '  attack: 1631, // ' + NOTE('+1 printing') + ' (')
sub(E+'censusAtHead.test.ts', 'const RAW_UNBUILT_ATTACK_UNITS = 152;  // (',
    'const RAW_UNBUILT_ATTACK_UNITS = 151;  // ' + NOTE('−1 printing') + ' (')

# ── the odd ones
sub(E+'compoundCompose.test.ts', 'expect(claimedWhole).toHaveLength(209);  // (',
    'expect(claimedWhole).toHaveLength(210);  // ' + NOTE('+1 multi-clause sentence claimed WHOLE') + ' (')
sub(E+'confusionDamage.test.ts', 'expect(claimedEndingInPeriod.length).toBe(499);  // (',
    'expect(claimedEndingInPeriod.length).toBe(500);  // ' + NOTE('+1 claimed sentence ending in a period') + ' (')
sub(E+'precociousEvolution.test.ts', 'expect(rawHead).toBe(1580);  // (',
    'expect(rawHead).toBe(1581);  // ' + NOTE('+1 printing') + ' (')

# ── frozen-endpoint FRONT terms
sub(E+'basicEnergyScaling.test.ts', '      resolvedNow.length - 1 /* \U0001f195\U0001f195\U0001f195 D510,',
    '      resolvedNow.length - 1 /* ' + SHORT + ' */ - 1 /* \U0001f195\U0001f195\U0001f195 D510,')
sub(E+'basicEnergyScaling.test.ts', '      units(resolvedNow) - 2 /* \U0001f195\U0001f195\U0001f195 D510,',
    '      units(resolvedNow) - 1 /* ' + SHORT + ' */ - 2 /* \U0001f195\U0001f195\U0001f195 D510,')

for path, old, new, n in edits:
    src = open(path, encoding='utf8').read()
    c = src.count(old)
    if c != n:
        print('MISS', path, c, repr(old[:70])); continue
    open(path, 'w', encoding='utf8').write(src.replace(old, new, n))
    print('ok  ', path, repr(old[:50]))
