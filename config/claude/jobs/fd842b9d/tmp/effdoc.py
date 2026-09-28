p = "/home/jofre/projects/luminous_ui/packages/engine/src/effects.ts"
backup = open(p, encoding="utf-8").read()
FIND = ("      ENERGY-TYPE subgroup, on the attack surface, which `ownerPokemon` must\n"
        "      refuse rather than approximate (asserted in `switchSeam.test.ts`).\n")
ADD = ("\n      🆕🆕 **D468 BUILT THAT ATTACK-SURFACE PRINTING, AND THIS PARAGRAPH STILL\n"
       "      HOLDS WORD FOR WORD — WHICH IS THE POINT OF KEEPING IT.** `ownerPokemon`\n"
       "      still cannot say `{L}` and still must not try; what changed is that the\n"
       "      OTHER field can and now does. `ATTACK_SELF_SWITCH_TYPED` (this file) reads\n"
       "      Vikavolt's sentence into `targetType`, so the row is served by D273's rider\n"
       "      rather than by this one, and `switchSeam.test.ts` §4's rung is RE-POINTED\n"
       "      onto the derived VALUE rather than deleted (D449: a `toBeNull` on a sentence\n"
       "      the catalog PRINTS is a liability, and its replacement is an INEQUALITY of\n"
       "      programs, never a `.not.toBeNull()` — D438).\n"
       "      ⚠️ **THE COST OF THE NOTE BEING PHRASED AS A REFUSAL IS WORTH RECORDING**\n"
       "      (D457): `docs/workstreams/simulator.md`'s work-order table carried this row\n"
       "      as ⏹️ REFUSED for the whole of D273's life, priced against the field that\n"
       "      REFUSED it instead of the field that would SERVE it — and the serving field\n"
       "      was named three paragraphs down, in this same block, the entire time.\n")
try:
    n = backup.count(FIND)
    assert n == 1, "note occurs %dx" % n
    out = backup.replace(FIND, FIND + ADD, 1)
    assert out != backup
    with open(p, "wb") as fh:
        fh.write(out.encode("utf-8"))
    print("effects.ts doc note: %d -> %d bytes (+%d)" % (len(backup), len(out), len(out)-len(backup)))
except Exception as e:
    with open(p, "wb") as fh:
        fh.write(backup.encode("utf-8"))
    print("RESTORED after", e); raise
