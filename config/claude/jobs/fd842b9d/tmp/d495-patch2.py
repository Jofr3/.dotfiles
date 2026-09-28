P = "/home/jofre/projects/luminous_ui/packages/engine/src/effects.ts"
orig = open(P, encoding="utf-8").read()
before = orig.count("\n")
FIND = """        // BYTE-IDENTICAL to the second op of the arm above, which is the family's
        // checkable claim on this pair: there is ONE action here, printed two ways,
        // and the gate is a condition in front of it.
        // biome-ignore lint/suspicious/noThenProperty: `then` is the effect contract's gated-step list, not a thenable (arrays are not callable).
        then: [{ op: "preventAttack", target: "defender" }],
      },
    ];
  }
"""
NEW = """  // 26d (D495). The SAME lock behind the WINNING face of a coin — corpus FILE
  //      LINE 250, ONE legal printing, and the SEVENTH copy of this file's
  //      `Flip a coin. If heads, ` prefix. See the anchor's block for the lattice,
  //      the D472 widening measurement and the re-derivation of D408's price.
  //
  //      ⚠️ ZERO NEW MECHANISM AND ZERO NEW SERIALISED BYTES. `coinFlipGate` has
  //      spliced a `then` since 0.x; `preventAttack` has carried `target` since
  //      D148; and the two have already MET — arm 26 above is a `coinFlipGate`
  //      whose `then` holds a `preventAttack`, shipped at D144. So this is NOT the
  //      first durated op inside a gate, and the claim that it would be is one this
  //      arm's slice checked before writing rather than after (D443: a "this would
  //      be the first X" is a claim about a CLASS).
  //
  //      🛑 THE `then` IS BYTE-IDENTICAL TO `DEFENDER_CANT_ATTACK_NEXT_TURN`'s
  //      WHOLE PROGRAM, and to the arm above's own `then`, ON PURPOSE — the
  //      family's checkable claim since D134: there is ONE action here, printed
  //      four ways (bare, behind an Energy discard, behind a Basic condition, and
  //      now behind a coin), and the gate is procedure in front of it. The line is
  //      therefore a deliberate twin of the one three lines up; do NOT "tidy" the
  //      two into a shared constant (D446/D448 — a mutant row anchored on the bare
  //      line alone would start occurring 2×, so every row about either arm quotes
  //      the `if` line that arm uniquely owns).
  //
  //      A TAILS IS A RESOLVED ATTACK, NOT A SKIPPED EFFECT (D134's reading, sixth
  //      payment): the sentence was read, the coin decided, and a loud
  //      `ATTACK_EFFECT_SKIPPED` row would be a lie about a card that worked.
  if (FLIP_HEADS_DEFENDER_CANT_ATTACK.test(effect)) {
    return [
      {
        op: "coinFlipGate",
        // biome-ignore lint/suspicious/noThenProperty: `then` is the effect contract's gated-step list, not a thenable (arrays are not callable).
        then: [{ op: "preventAttack", target: "defender" }],
      },
    ];
  }
"""
assert orig.count(FIND) == 1, orig.count(FIND)
out = orig.replace(FIND, FIND + NEW, 1)
assert out != orig
with open(P, "wb") as fh:
    fh.write(out.encode("utf-8"))
after = open(P, encoding="utf-8").read()
print("lines", before, "->", after.count("\n"))
assert after.count("FLIP_HEADS_DEFENDER_CANT_ATTACK") == 2
print("OK")
