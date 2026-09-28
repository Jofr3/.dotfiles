import os
ROOT = "/home/jofre/projects/luminous_ui/packages/engine/src/"
NOTE = (" // 🆕🆕 D468 %s (THE TYPED SELF-SWITCH — `censusAttackCorpus.ts` **FILE LINE 499**, "
        "*\"Switch this Pokémon with 1 of your Benched {L} Pokémon.\"*, **1 legal printing**. ⚠️ **A LIVE HEAD, "
        "NOT A CHAIN — SO THE LITERAL MOVES AND NOTHING IS ADDED AT THE FRONT** (D461's table: the tell is the "
        "left-hand side of the assertion). ⚠️ **AND THE SENTENCE STEP AND THE PRINTING STEP AGREE AT 1 HERE**, "
        "which is the easy case and is not a shape that carries — D467's was 2 vs 3.)")
# (find, replace, note-kind) applied over every *.test.ts; every occurrence is a live head.
EDITS = [
  ("expect([resolved.length, units(resolved)]).toEqual([499, 1523]);",
   "expect([resolved.length, units(resolved)]).toEqual([500, 1524]);", "+1 sentence / +1 printing"),
  ("expect([resolving.length, units(resolving)]).toEqual([499, 1523]);",
   "expect([resolving.length, units(resolving)]).toEqual([500, 1524]);", "+1 sentence / +1 printing"),
  ("expect(resolved).toHaveLength(499);", "expect(resolved).toHaveLength(500);", "+1 sentence / +1 printing"),
  ("expect(resolvedP).toBe(1523);", "expect(resolvedP).toBe(1524);", "+1 printing"),
  ("expect(p(resolved)).toBe(1523);", "expect(p(resolved)).toBe(1524);", "+1 printing"),
  ("expect(rawHead).toBe(1523);", "expect(rawHead).toBe(1524);", "+1 printing"),
  ("expect(units(resolved)).toBe(1523);", "expect(units(resolved)).toBe(1524);", "+1 printing"),
  ("expect(resolved.reduce((sum, [units]) => sum + units, 0)).toBe(1523);",
   "expect(resolved.reduce((sum, [units]) => sum + units, 0)).toBe(1524);", "+1 printing"),
  ("expect(residueP).toBe(209);", "expect(residueP).toBe(208);", "-1 printing"),
  ("expect(p(residue)).toBe(209);", "expect(p(residue)).toBe(208);", "-1 printing"),
  ("expect(head).toBe(1573);", "expect(head).toBe(1574);", "+1 printing"),
  ("expect(residue).toHaveLength(141);", "expect(residue).toHaveLength(140);", "-1 sentence"),
]
files = [f for f in sorted(os.listdir(ROOT)) if f.endswith(".test.ts")]
counts = {e[0]: 0 for e in EDITS}
for f in files:
    p = ROOT + f
    backup = open(p, encoding="utf-8").read()
    out = backup
    try:
        for find, repl, kind in EDITS:
            n = out.count(find)
            if n == 0:
                continue
            assert n == 1, "%s: %r occurs %dx" % (f, find, n)
            out = out.replace(find, repl + (NOTE % kind), 1)
            counts[find] += 1
        if out != backup:
            with open(p, "wb") as fh:
                fh.write(out.encode("utf-8"))
            print("%-40s stepped, +%d bytes" % (f, len(out) - len(backup)))
    except Exception as e:
        with open(p, "wb") as fh:
            fh.write(backup.encode("utf-8"))
        print("%s RESTORED after %s" % (f, e)); raise
print("\nPER-PATTERN COUNTS:")
for find, n in counts.items():
    print("  %2d  %s" % (n, find))
print("TOTAL live heads stepped:", sum(counts.values()))
