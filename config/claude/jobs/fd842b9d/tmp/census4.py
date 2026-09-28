import io

TERM = (
    " - 1 /* \U0001f195\U0001f195\U0001f195 **D482 — A `- 1` TERM FRONT-INSERTED AHEAD OF D479's, AND THE FROZEN "
    "ENDPOINT IS UNTOUCHED (D426/D437/D461/D462).** THE WHOLE-SIDE SPREAD — `censusAttackCorpus.ts` FILE LINE 572, "
    "**1 sentence / 1 legal printing**, claimed WHOLE by `deriveAttackEffect` arm 6a-bis through ONE new anchor "
    "`SPREAD_EACH_OPPONENT_POKEMON` over a TWO-OP PROGRAM OF SHIPPED OPS (`damageDefender` flat + `spreadDamage`). "
    "⚠️ THE SENTENCE STEP AND THE PRINTING STEP AGREE AT 1 AND 1, so both chains take the same term — read the head "
    "name, never the neighbouring term (D451/D461/D464). RAW summand ALONE: no registry row, no gate split, no "
    "trailing split, reader surface still 13, ZERO new `EffectOp` members, op FIELDS, op VALUES or `interpreter.ts` "
    "bytes. EDITED AT THE FRONT, NEVER AT THE END. */"
)
NOTE = (
    " // (\U0001f195\U0001f195\U0001f195 D482 — the WHOLE-SIDE SPREAD raises the head by 1 sentence / 1 printing "
    "(`censusAttackCorpus.ts` FILE LINE 572, arm 6a-bis), so this DERIVED figure moves with it.)"
)

def insert(fn, line, anchor):
    p = "packages/engine/src/" + fn
    with io.open(p, encoding="utf-8") as fh:
        lines = fh.readlines()
    ln = lines[line - 1]
    at = ln.find(anchor)
    if at < 0:
        raise SystemExit("MISS %s:%d %r" % (fn, line, anchor))
    cut = at + len(anchor)
    lines[line - 1] = ln[:cut] + TERM + ln[cut:]
    with io.open(p, "w", encoding="utf-8") as fh:
        fh.writelines(lines)
    print("ok insert %s:%d after %r" % (fn, line, anchor))

def repin(fn, line, old, new):
    p = "packages/engine/src/" + fn
    with io.open(p, encoding="utf-8") as fh:
        lines = fh.readlines()
    ln = lines[line - 1].rstrip("\n")
    at = ln.find(old)
    if at < 0 or ln.find(old, at + 1) >= 0:
        raise SystemExit("MISS/AMBIG %s:%d %r" % (fn, line, old))
    lines[line - 1] = ln[:at] + new + ln[at + len(old):] + NOTE + "\n"
    with io.open(p, "w", encoding="utf-8") as fh:
        fh.writelines(lines)
    print("ok pin %s:%d" % (fn, line))

insert("censusAtHead.test.ts", 6215, "expect(BUILT.attack")
for fn, line in [("opponentBenchCount.test.ts", 949), ("retreatCostBonus.test.ts", 1061)]:
    insert(fn, line, "units(resolving)")
    insert(fn, line, "resolving.length")
repin("benchNamedBonus.test.ts", 1230, ").toBe(1211);", ").toBe(1212);")
repin("sameEnergyBonus.test.ts", 1027, ").toBe(1233);", ").toBe(1234);")
