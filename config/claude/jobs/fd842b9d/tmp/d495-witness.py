P = "packages/engine/src/bareAttackLock.test.ts"
orig = open(P, encoding="utf-8").read()
FIND = '''  it("refuses the COIN-GATED defender lock, which this slice measured and left out", () => {
    // "Flip a coin. If heads, during your opponent's next turn, the Defending
    // Pokémon can't attack." — 1 legal printing, and the arm would be one regex and
    // one `coinFlipGate` whose `then` is this slice's own program. It is OUT on the
    // WITNESS rather than on the arm: this suite and both suites it sits between
    // are deliberately SEED-FREE, and a coin-gated printing turns that determinism
    // claim into a coincidence of one shuffle. One printing against a seed sweep
    // and a fourth fixture is worse than the residue head it would be taken from.
    expect(
      deriveAttackEffect(
        "Flip a coin. If heads, during your opponent's next turn, the Defending Pokémon can't attack.",
      ),
    ).toBeNull();
  });
'''
NEW = '''  it("🆕 D495 BUILT the COIN-GATED defender lock — re-pointed onto the OP, refusals kept", () => {
    // D408 WROTE THIS RUNG AS A `toBeNull` AND SAID WHY, and the paragraph is kept
    // rather than deleted because it is the record of a PRICE (D427/D466):
    //
    //   > "1 legal printing, and the arm would be one regex and one `coinFlipGate`
    //   >  whose `then` is this slice's own program. It is OUT on the WITNESS rather
    //   >  than on the arm: this suite and both suites it sits between are
    //   >  deliberately SEED-FREE, and a coin-gated printing turns that determinism
    //   >  claim into a coincidence of one shuffle. One printing against a seed sweep
    //   >  and a fourth fixture is worse than the residue head it would be taken from."
    //
    // 🛑 D495 RE-DERIVED BOTH HALVES OF THAT PRICE AND ONLY ONE WAS REAL.
    //   • the SEED half STANDS. The board is NOT here — it is in
    //     `flipDefenderAttackLock.test.ts`, which owns the seeds. §5's own
    //     "consumes no rng across a whole install" rung below is untouched, and it
    //     stays true because DERIVING a program consumes nothing.
    //   • the FOURTH FIXTURE half was WRONG. D452's file-local `cardPool` idiom keeps
    //     the demonstrator out of `FIXTURE_POOL` entirely, so the pool-size pin, the
    //     eleven-deep `ids.length` ladder in `opponentResistanceBonus.test.ts` and
    //     `clauseApostrophe.test.ts`'s derivable sweep (which iterates `FIXTURE_POOL`,
    //     not the corpus) all take a ZERO term. The quoted price was one fixture high.
    //
    // ⚠️ RE-POINTED ONTO THE OP AND NOT ONTO A BOOLEAN (D438/D488). A bare
    // `.not.toBeNull()` would be true under a build that claims this string with the
    // WRONG program, and it would silently discard the twelve-way refusal the old
    // rung carried. So: the owner is named by VALUE, and every OTHER reader is still
    // asserted to refuse — strictly stronger in both directions than either half.
    const PRINTED =
      "Flip a coin. If heads, during your opponent's next turn, the Defending Pokémon can't attack.";
    // The specimen is a ROW OF THE COMMITTED CORPUS at its committed count, not a
    // hand-typed string (D452/D490 — a byte pin measures an invention as faithfully
    // as it measures the truth). Corpus FILE LINE 250; the card id is UNRESOLVABLE in
    // this checkout (no local D1, D425) and is deliberately not invented.
    expect(legalAttackCorpus().filter(([, s]) => s === PRINTED)).toEqual([[1, PRINTED]]);
    expect(deriveAttackEffect(PRINTED)).toEqual([
      {
        op: "coinFlipGate",
        // biome-ignore lint/suspicious/noThenProperty: `then` is the effect contract's gated-step list, not a thenable.
        then: [{ op: "preventAttack", target: "defender" }],
      },
    ]);
    // 🛑 THE `then` IS THE BARE ANCHOR'S WHOLE PROGRAM, BYTE FOR BYTE — the family's
    // checkable claim since D134, and the reason the bare arm is this arm's control.
    expect(deriveAttackEffect(PRINTED)?.[0]).toMatchObject({
      then: deriveAttackEffect(DEFENDER_BARE),
    });
    // …and the TAILS spelling is still refused: the pool prints no such row, and the
    // anchor's `If heads,` is what refuses it. One axis, one difference (D427).
    expect(
      deriveAttackEffect(
        "Flip a coin. If tails, during your opponent's next turn, the Defending Pokémon can't attack.",
      ),
    ).toBeNull();
    // The TWELVE refusals the old rung carried, kept rather than traded away (D438).
    for (const name of attackReaderSurface()) {
      if (name === "deriveAttackEffect") continue;
      const read = (effectsModule as unknown as Record<string, (t: string) => unknown>)[name];
      expect(read?.(PRINTED) ?? null, name).toBeNull();
    }
    // The surface COUNT beside the loop, because a loop over a shrinking surface
    // stays green (D417: pin the diff AND the count).
    expect(attackReaderSurface()).toHaveLength(13);
  });
'''
assert orig.count(FIND) == 1, orig.count(FIND)
out = orig.replace(FIND, NEW, 1)
# imports
IMP = 'import { legalAttackCorpus } from "./censusAttackCorpus";'
assert out.count(IMP) == 1
out = out.replace(
    IMP,
    'import * as effectsModule from "./effects";\n'
    'import { attackReaderSurface, legalAttackCorpus } from "./censusAttackCorpus";',
    1,
)
with open(P, "wb") as fh:
    fh.write(out.encode("utf-8"))
print("witness re-pointed")
