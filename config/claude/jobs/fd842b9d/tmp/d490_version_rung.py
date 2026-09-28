import io, sys
P = "/home/jofre/projects/luminous_ui/packages/engine/src/eachDeckMillBoost.test.ts"
s = io.open(P, encoding="utf-8").read()
F = """    expect(
      discardScaledBoostProgram({ kind: "eachDeckMill", per: PER }, PRINTED_BASE).some(
        (op) => op.op === "recordGate",
      ),
    ).toBe(false);
  });
});"""
R = """    expect(
      discardScaledBoostProgram({ kind: "eachDeckMill", per: PER }, PRINTED_BASE).some(
        (op) => op.op === "recordGate",
      ),
    ).toBe(false);
  });

  it("engineVersion is 0.385.0 and `manifest.version` agrees — the bump is for BEHAVIOUR", () => {
    // 🆕🆕🆕 D490 — 0.384.0 → **0.385.0**. A card can reach it: one printed sentence that
    // derived to `null` on all thirteen readers and fell to the loud
    // `ATTACK_EFFECT_SKIPPED` path now mills BOTH decks and deals a number proportional to
    // the Energy among what it milled. ⚠️ **THIS SUITE AUTHORS THE PIN, WHICH IS THE HALF
    // EVERY VERSION-TAX COUNT MISSES** (D427: every note counts the pins it INHERITED and
    // never the one it is about to AUTHOR). Re-measured at this head AFTER the edit rather
    // than forecast (D489): **85 occurrences / 63 files / 18 `it(…)` titles**, with SEVEN
    // history occurrences of `0.384.0` left alone. ⚠️ **D489's own exception list said FOUR
    // and there were FIVE** — it named "this heading" for the paragraph INSIDE its
    // changelog entry and missed the entry's actual `0.383.0 → 0.384.0` heading, which is
    // D488's rule fired a second time: *a prose census of exceptions is self-referential
    // the moment it is written down, and the count is taken before the sentence exists.*
    expect(engineVersion).toBe("0.385.0");
    expect(manifest.version).toBe(engineVersion);
    expect(deriveAttackDiscardScaledBoost(MILL_BOTH)).not.toBeNull();
  });
});"""
if s.count(F) != 1:
    sys.stderr.write("COUNT %d\n" % s.count(F)); raise SystemExit(2)
s = R.join(s.split(F))
s = s.replace('import { applyAction, createGame } from "./index";',
              'import { applyAction, createGame, engineVersion, manifest } from "./index";', 1)
open(P, "wb").write(s.encode("utf-8"))
print("version rung added")
