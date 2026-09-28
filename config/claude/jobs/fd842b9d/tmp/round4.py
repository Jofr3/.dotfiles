ROOT = "/home/jofre/projects/luminous_ui/packages/engine/src/"
NOTE = (" // 🆕🆕 D468 %s (THE TYPED SELF-SWITCH — `censusAttackCorpus.ts` **FILE LINE 499**, "
        "*\"Switch this Pokémon with 1 of your Benched {L} Pokémon.\"*, **1 legal printing**. ⚠️ **A LIVE HEAD, "
        "NOT A CHAIN** — the literal moves and nothing is added at the front (D461). ⚠️ **THIS SITE WAS MASKED "
        "BEHIND ANOTHER IN THE SAME `it` AND ONLY SURFACED ON THE THIRD `check` ROUND** — vitest stops an `it` at "
        "its first throw, so the runner's list is never the population (D462/D465).)")
# (file, exact find, exact replace, note-kind) — each asserted to occur exactly once IN THAT FILE.
EDITS = [
  ("censusAtHead.test.ts", "expect(built).toBe(1978);", "expect(built).toBe(1979);", "+1 printing"),
  # 🛑 TWO `405`s IN THIS FILE AND THEY ARE DIFFERENT QUANTITIES THAT COINCIDE TODAY.
  # This one is `units - built` (2383 - 1979 = 404). The one at :5898 is
  # `BUILT.ability + BUILT.trainer + BUILT.specialEnergy` (284 + 113 + 8) and MUST STAY 405.
  # Anchored on the whole expression, never on the literal.
  ("censusAtHead.test.ts", "expect(units - built).toBe(405);", "expect(units - built).toBe(404);", "-1 printing"),
  ("defenderStatusTriple.test.ts",
   "expect([withoutOxford.length, units(withoutOxford)]).toEqual([498, 1521]);",
   "expect([withoutOxford.length, units(withoutOxford)]).toEqual([499, 1522]);", "+1 sentence / +1 printing"),
  ("flipStatusEnergyDiscard.test.ts",
   "expect([without.length, units(without)]).toEqual([498, 1521]);",
   "expect([without.length, units(without)]).toEqual([499, 1522]);", "+1 sentence / +1 printing"),
  ("perHeadsEnergyDiscard.test.ts",
   "expect([without.length, units(without)]).toEqual([497, 1521]);",
   "expect([without.length, units(without)]).toEqual([498, 1522]);", "+1 sentence / +1 printing"),
  ("selfDamagePerCounter.test.ts",
   "expect([without.length, units(without)]).toEqual([498, 1522]);",
   "expect([without.length, units(without)]).toEqual([499, 1523]);", "+1 sentence / +1 printing"),
]
touched = {}
for fname, find, repl, kind in EDITS:
    touched.setdefault(fname, []).append((find, repl, kind))
for fname, edits in touched.items():
    p = ROOT + fname
    backup = open(p, encoding="utf-8").read()
    out = backup
    try:
        for find, repl, kind in edits:
            n = out.count(find)
            assert n == 1, "%s: %r occurs %dx" % (fname, find, n)
            out = out.replace(find, repl + (NOTE % kind), 1)
        assert out != backup
        with open(p, "wb") as fh:
            fh.write(out.encode("utf-8"))
        print("%-34s %d site(s), +%d bytes" % (fname, len(edits), len(out) - len(backup)))
    except Exception as e:
        with open(p, "wb") as fh:
            fh.write(backup.encode("utf-8"))
        print("%s RESTORED after %s" % (fname, e)); raise
# The trap, asserted rather than trusted: the OTHER 405 must still be there.
src = open(ROOT + "censusAtHead.test.ts", encoding="utf-8").read()
assert src.count("expect(BUILT.ability + BUILT.trainer + BUILT.specialEnergy).toBe(405);") == 1
print("\n🛑 the OTHER 405 (`BUILT.ability + BUILT.trainer + BUILT.specialEnergy`) is intact")
