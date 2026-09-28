import io

TERM = (
    " - 1 /* \U0001f195\U0001f195\U0001f195 **D482 — A `- 1` TERM FRONT-INSERTED AHEAD OF D479's, AND THE FROZEN "
    "ENDPOINT IS UNTOUCHED (D426/D437/D461/D462).** THE WHOLE-SIDE SPREAD — `censusAttackCorpus.ts` FILE LINE 572, "
    "*\"This attack does 30 damage to each of your opponent's Pokémon. (Don't apply Weakness and Resistance for "
    "Benched Pokémon.)\"*, **1 sentence / 1 legal printing**, claimed WHOLE by `deriveAttackEffect` arm 6a-bis "
    "through ONE new anchor `SPREAD_EACH_OPPONENT_POKEMON` over a TWO-OP PROGRAM OF SHIPPED OPS "
    "(`damageDefender` flat + `spreadDamage`). ⚠️ THE SENTENCE STEP AND THE PRINTING STEP AGREE AT 1 AND 1, "
    "so both chains take the same term — read the head name, never the neighbouring term (D451/D461/D464). "
    "RAW summand ALONE: no registry row, no gate split, no trailing split, reader surface still 13, ZERO new "
    "`FIXTURE_POOL` ids (file-local `cardPool`, D414), ZERO new `EffectOp` members, op FIELDS, op VALUES, prompts, "
    "choices, events, error codes or `interpreter.ts` bytes. EDITED AT THE FRONT, NEVER AT THE END. */"
)
NOTE = (
    " // (\U0001f195\U0001f195\U0001f195 D482 — the WHOLE-SIDE SPREAD raises the head by 1 sentence / 1 printing "
    "(`censusAttackCorpus.ts` FILE LINE 572, arm 6a-bis, `SPREAD_EACH_OPPONENT_POKEMON` over `damageDefender` + "
    "`spreadDamage`), so this DERIVED figure moves with it. This slice's own sentence is NOT in this file's "
    "subtracted set, which is why the figure steps by exactly the head's step.)"
)

CHAINS = [
    ("censusAtHead.test.ts", 6112, "expect(BUILT.attack", "expect(BUILT.attack" + TERM),
    ("precociousEvolution.test.ts", 697, "expect(head", "expect(head" + TERM),
]
PINS = [
    ("benchNamedBonus.test.ts", 1095, ").toBe(338);", ").toBe(339);"),
    ("compoundCompose.test.ts", 622, "toBe(482)", "toBe(483)"),
    ("defenderStatusTriple.test.ts", 546, "toEqual([512, 1540])", "toEqual([513, 1541])"),
    ("flipStatusEnergyDiscard.test.ts", 565, "toEqual([512, 1540])", "toEqual([513, 1541])"),
    ("flipStatusHeadsTails.test.ts", 735, "toEqual([512, 1540])", "toEqual([513, 1541])"),
    ("inPlayTypeBonus.test.ts", 810, "toEqual([373, 1272])", "toEqual([374, 1273])"),
    ("moreEnergyBonus.test.ts", 805, "toEqual([368, 1268])", "toEqual([369, 1269])"),
    ("opponentBenchCount.test.ts", 873, "toEqual([373, 1272])", "toEqual([374, 1273])"),
    ("perHeadsEnergyDiscard.test.ts", 667, "toEqual([511, 1540])", "toEqual([512, 1541])"),
    ("retreatCostBonus.test.ts", 982, "toEqual([370, 1264])", "toEqual([371, 1265])"),
    ("sameEnergyBonus.test.ts", 969, ").toBe(351);", ").toBe(352);"),
    ("selfDamagePerCounter.test.ts", 190, "toEqual([512, 1541])", "toEqual([513, 1542])"),
]

def patch(fn, line, old, new, note):
    p = "packages/engine/src/" + fn
    with io.open(p, encoding="utf-8") as fh:
        lines = fh.readlines()
    idx = line - 1
    ln = lines[idx]
    code = ln.split("//")[0]
    parts = code.split(old)
    if len(parts) != 2:
        raise SystemExit("MISS/AMBIG %s:%d (%d) %r" % (fn, line, len(parts) - 1, code.strip()[:80]))
    rest = ln[len(code):].rstrip("\n")
    lines[idx] = parts[0] + new + parts[1].rstrip("\n") + note + rest + "\n"
    with io.open(p, "w", encoding="utf-8") as fh:
        fh.writelines(lines)
    print("ok %s:%d" % (fn, line))

for fn, line, old, new in CHAINS:
    patch(fn, line, old, new, "")
for fn, line, old, new in PINS:
    patch(fn, line, old, new, NOTE)
