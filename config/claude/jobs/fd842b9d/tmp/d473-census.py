import os, re, sys

BASE = "/home/jofre/projects/luminous_ui/packages/engine/src/"

NOTE = (
    "🆕🆕 **D473 — A `- 2` TERM FRONT-INSERTED AHEAD OF D472's, AND THE FROZEN ENDPOINT IS "
    "UNTOUCHED (D426/D437/D461/D462).** (THE PRINTED HAND COST WHOSE CONSEQUENT IS GATED ON "
    "ITSELF — `censusAttackCorpus.ts` **FILE LINES 101 and 102**, *\"Discard a card from your "
    "hand. If you do, draw {2|3} cards.\"*, **2 sentences / 2 legal printings**, claimed WHOLE "
    "by `deriveAttackEffect` through the new `HAND_COST_THEN_DRAW` anchor. ⚠️ **THE SENTENCE "
    "STEP AND THE PRINTING STEP AGREE AT 2 AND 2**, so every chain in this pass takes the same "
    "term — the opposite of D472's 1-and-2, and a pass that assumed they always differ would be "
    "wrong at every site (D451/D461). ONE anchor and ONE arm: the printed *\"If you do,\"* is "
    "§9.2's shipped `recordGate` and the head is the shipped `payFromHand`, so the program is "
    "three SHIPPED ops in printed order and there are ZERO new `EffectOp` members, op fields, op "
    "values, prompts, events, error codes, registry rows, `CardFilter`/`BoardCondition` members, "
    "`packages/schema` bytes, `redact.ts` bytes or `FIXTURE_POOL` ids (file-local `cardPool`, "
    "D414). RAW summand ALONE: no registry row, no gate split and no trailing split is involved, "
    "and the reader surface stands still at 13. `handEnergyCancel.test.ts` §4's structural guard "
    "gained a SECOND, narrow escape — a payment whose whole consequent sits behind a `recordGate` "
    "on the slot it files — and its paying population steps 3/4 → 5/6.)"
)
FRONT = f" - 2 /* {NOTE} */"

# ── the LIVE HEADS: whole-expression anchors, never a bare integer (D450/D452). ──
LIVE = [
    ("benchNamedBonus.test.ts", "expect(resolved).toHaveLength(503);", "expect(resolved).toHaveLength(505);"),
    ("benchNamedBonus.test.ts", "expect(units(resolved)).toBe(1528);", "expect(units(resolved)).toBe(1530);"),
    ("censusAtHead.test.ts", "expect(units - built).toBe(400);", "expect(units - built).toBe(398);"),
    ("censusAtHead.test.ts", "expect(unbuiltAttack).toBe(154);", "expect(unbuiltAttack).toBe(152);"),
    ("censusAtHead.test.ts", "expect(rawUnbuiltSentences.length).toBe(137);", "expect(rawUnbuiltSentences.length).toBe(135);"),
    ("censusAtHead.test.ts", "expect(residueSentences.length).toBe(111);", "expect(residueSentences.length).toBe(109);"),
    ("censusAtHead.test.ts", "const RAW_UNBUILT_ATTACK_UNITS = 204;", "const RAW_UNBUILT_ATTACK_UNITS = 202;"),
    ("censusAtHead.test.ts", "expect(resolved.length).toBe(503);", "expect(resolved.length).toBe(505);"),
    ("censusAtHead.test.ts", "expect(resolved.reduce((sum, [units]) => sum + units, 0)).toBe(1528);", "expect(resolved.reduce((sum, [units]) => sum + units, 0)).toBe(1530);"),
    ("compoundCompose.test.ts", "expect(claimedWhole).toHaveLength(179);", "expect(claimedWhole).toHaveLength(181);"),
    ("defenderStatusTriple.test.ts", "expect([resolved.length, units(resolved)]).toEqual([503, 1528]);", "expect([resolved.length, units(resolved)]).toEqual([505, 1530]);"),
    ("exOnlyActive.test.ts", "expect(resolved).toHaveLength(503);", "expect(resolved).toHaveLength(505);"),
    ("exOnlyActive.test.ts", "expect(resolvedP).toBe(1528);", "expect(resolvedP).toBe(1530);"),
    ("exOnlyActive.test.ts", "expect(residue).toHaveLength(137);", "expect(residue).toHaveLength(135);"),
    ("exOnlyActive.test.ts", "expect(residueP).toBe(204);", "expect(residueP).toBe(202);"),
    ("flipStatusEnergyDiscard.test.ts", "expect([resolved.length, units(resolved)]).toEqual([503, 1528]);", "expect([resolved.length, units(resolved)]).toEqual([505, 1530]);"),
    ("inPlayTypeBonus.test.ts", "expect([resolving.length, units(resolving)]).toEqual([503, 1528]);", "expect([resolving.length, units(resolving)]).toEqual([505, 1530]);"),
    ("moreEnergyBonus.test.ts", "expect(resolved).toHaveLength(503);", "expect(resolved).toHaveLength(505);"),
    ("moreEnergyBonus.test.ts", "expect(units(resolved)).toBe(1528);", "expect(units(resolved)).toBe(1530);"),
    ("opponentBenchCount.test.ts", "expect([resolving.length, units(resolving)]).toEqual([503, 1528]);", "expect([resolving.length, units(resolving)]).toEqual([505, 1530]);"),
    ("perHeadsEnergyDiscard.test.ts", "expect([resolved.length, units(resolved)]).toEqual([503, 1528]);", "expect([resolved.length, units(resolved)]).toEqual([505, 1530]);"),
    ("precociousEvolution.test.ts", "expect(rawHead).toBe(1528);", "expect(rawHead).toBe(1530);"),
    ("precociousEvolution.test.ts", "expect(head).toBe(1578);", "expect(head).toBe(1580);"),
    ("retreatCostBonus.test.ts", "expect([resolving.length, units(resolving)]).toEqual([503, 1528]);", "expect([resolving.length, units(resolving)]).toEqual([505, 1530]);"),
    ("sameEnergyBonus.test.ts", "expect(resolved).toHaveLength(503);", "expect(resolved).toHaveLength(505);"),
    ("sameEnergyBonus.test.ts", "expect(units(resolved)).toBe(1528);", "expect(units(resolved)).toBe(1530);"),
    ("sawkRequirementSplit.test.ts", "expect(resolved).toHaveLength(503);", "expect(resolved).toHaveLength(505);"),
    ("sawkRequirementSplit.test.ts", "expect(p(resolved)).toBe(1528);", "expect(p(resolved)).toBe(1530);"),
    ("sawkRequirementSplit.test.ts", "expect(residue).toHaveLength(137);", "expect(residue).toHaveLength(135);"),
    ("sawkRequirementSplit.test.ts", "expect(p(residue)).toBe(204);", "expect(p(residue)).toBe(202);"),
    ("selfDamagePerCounter.test.ts", "expect([resolved.length, units(resolved)]).toEqual([503, 1528]);", "expect([resolved.length, units(resolved)]).toEqual([505, 1530]);"),
]

# ── the CHAIN HEADS: a FRONT term, tail byte-identical (D463). `ids.length` chains
#    are FIXTURE-ID ladders and take ZERO — this slice adds no FIXTURE_POOL id. ──
HEAD = re.compile(r"([A-Za-z_$][\w$.]*(?:\([^()]*\))?(?:\.length)?)\s-\s(\d+)\s/\*")
SKIP_SUBJECTS = {"ids.length"}

backups: dict[str, bytes] = {}
try:
    live_done = 0
    for fn, old, new in LIVE:
        p = BASE + fn
        if p not in backups:
            backups[p] = open(p, "rb").read()
        s = open(p, encoding="utf-8").read()
        parts = s.split(old)
        assert len(parts) == 2, f"{fn}: {old!r} occurs {len(parts) - 1}x"
        payload = new.join(parts).encode("utf-8")
        with open(p, "wb") as fh:
            fh.write(payload)
        live_done += 1

    chain_done = 0
    files = sorted({BASE + fn for fn in os.listdir(BASE) if fn.endswith(".test.ts")})
    for p in files:
        s = open(p, encoding="utf-8").read()
        lines = s.split("\n")
        touched = False
        for i, ln in enumerate(lines):
            ms = [m for m in HEAD.finditer(ln) if m.group(1) not in SKIP_SUBJECTS and m.group(1) not in ("Number", "Math")]
            if not ms:
                continue
            # D463: the marker is not unique on the line — the FIRST code-region hit is
            # the code one. Assert every hit we take sits in the code region.
            for m in reversed(ms):
                # D456: TWO CHAINS CAN SHARE ONE PHYSICAL LINE, and the comments are so
                # long that a column heuristic is wrong for the second one. So the test
                # is structural: is this position inside a block comment?
                before = ln[: m.start()]
                assert before.rfind("/*") <= before.rfind("*/"), (
                    f"{p}:{i + 1} head at col {m.start()} sits inside a block comment"
                )
                ln = ln[: m.end(1)] + FRONT + ln[m.end(1) :]
                chain_done += 1
            lines[i] = ln
            touched = True
        if touched:
            if p not in backups:
                backups[p] = open(p, "rb").read()
            payload = "\n".join(lines).encode("utf-8")
            with open(p, "wb") as fh:
                fh.write(payload)
    print(f"live heads stepped: {live_done}")
    print(f"chain front terms inserted: {chain_done}")
    print(f"files touched: {len(backups)}")
except Exception as exc:  # restore everything on any failure
    for p, blob in backups.items():
        with open(p, "wb") as fh:
            fh.write(blob)
    print("RESTORED after failure:", exc, file=sys.stderr)
    raise
