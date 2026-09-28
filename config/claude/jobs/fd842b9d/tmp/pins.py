import io, sys

NOTE_LONG = (
    "\U0001f195\U0001f195\U0001f195 **D482 +1 sentence / +1 printing — THE WHOLE-SIDE SPREAD, AND IT NEEDED NO OP AT ALL** "
    "— `censusAttackCorpus.ts` FILE LINE **572**, *\"This attack does 30 damage to each of your opponent's Pokémon. "
    "(Don't apply Weakness and Resistance for Benched Pokémon.)\"*, **1 sentence / 1 legal printing**, claimed WHOLE by "
    "`deriveAttackEffect` arm **6a-bis** through ONE new anchor `SPREAD_EACH_OPPONENT_POKEMON` over a **TWO-OP PROGRAM OF "
    "SHIPPED OPS** — `damageDefender`'s FLAT arm (D316; `snipeActive`'s full §8.5 pipeline, so Weakness and Resistance "
    "DO apply on the Active) followed by `spreadDamage { target: \"opponentBench\" }` (D189/D425; flat, no W/R). "
    "\U0001f6d1 **D447, D459 AND D462 ALL PRICED THIS ROW AT A THIRD `spreadDamage.target` PLUS A §8.5 ASYMMETRY, AND ALL "
    "THREE ARE FALSE AT THIS HEAD** — the asymmetry the price was for **is the boundary between two ops this engine has "
    "shipped since D189/D316**, and widening `spreadDamage` would have falsified index.ts 0.327.0's *\"`spreadDamage` only "
    "ever touches `side.bench`\"* in three files for a mechanism that was not needed. ZERO new `EffectOp` members, op FIELDS, "
    "op VALUES, `interpreter.ts` bytes, prompts, events, error codes, registry rows, `packages/schema` bytes or "
    "`FIXTURE_POOL` ids (file-local `cardPool`, D414); reader surface still **13**. ⚠️ **THE SENTENCE STEP AND THE "
    "PRINTING STEP AGREE AT 1 AND 1** — D479's agreed at 1 and 1, D478's disagreed at 1 vs 2, so this term was DERIVED "
    "here and not carried. RAW summand ALONE: no registry row, no gate split, no trailing split (all three re-measured "
    "unmoved — registry 10/16, gate 5/13, trailing 11/21)."
)
NOTE_SHORT = (
    "\U0001f195\U0001f195\U0001f195 **D482 −1 sentence / −1 printing — THE WHOLE-SIDE SPREAD** — "
    "`censusAttackCorpus.ts` FILE LINE **572**, *\"This attack does 30 damage to each of your opponent's Pokémon. "
    "(Don't apply Weakness and Resistance for Benched Pokémon.)\"*, claimed WHOLE by `deriveAttackEffect` arm 6a-bis "
    "through ONE new anchor over a two-op program of SHIPPED ops (`damageDefender` flat + `spreadDamage`). ZERO new op "
    "members/fields/values, ZERO `interpreter.ts` bytes, reader surface still 13. ⚠️ SENTENCE STEP AND PRINTING "
    "STEP AGREE AT 1 AND 1."
)
NOTE_CHAIN = (
    "\U0001f195\U0001f195\U0001f195 **D482 −1 on this chain (it counts the UNBUILT remainder) — THE WHOLE-SIDE "
    "SPREAD**, `censusAttackCorpus.ts` FILE LINE **572**, claimed WHOLE by `deriveAttackEffect` arm 6a-bis through ONE new "
    "anchor over a two-op program of SHIPPED ops. ⚠️ **THIS IS THE `units - built` MIRROR AND NOT THE "
    "`BUILT.ability + BUILT.trainer + BUILT.specialEnergy` SUM**, which STAYS **405** — measured, not predicted: this "
    "slice adds no registry row, no ability text and no Special Energy text (D480's brief predicted 405 would move and it "
    "could not)."
)

EDITS = [
    ("packages/engine/src/censusAtHead.test.ts",
     "  attack: 1592, // (\U0001f195\U0001f195 D479",
     "  attack: 1593, // (" + NOTE_LONG + ") // (\U0001f195\U0001f195 D479"),
    ("packages/engine/src/censusAtHead.test.ts",
     "    expect(units - built).toBe(386); // (\U0001f195\U0001f195 D479",
     "    expect(units - built).toBe(385); // (" + NOTE_CHAIN + ") // (\U0001f195\U0001f195 D479"),
    ("packages/engine/src/censusAtHead.test.ts",
     "    expect(unbuiltAttack).toBe(140); // (\U0001f195\U0001f195 D479",
     "    expect(unbuiltAttack).toBe(139); // (" + NOTE_SHORT + ") // (\U0001f195\U0001f195 D479"),
    ("packages/engine/src/censusAtHead.test.ts",
     "    expect(rawUnbuiltSentences.length).toBe(127); // (\U0001f195\U0001f195 D479",
     "    expect(rawUnbuiltSentences.length).toBe(126); // (" + NOTE_SHORT + ") // (\U0001f195\U0001f195 D479"),
    ("packages/engine/src/censusAtHead.test.ts",
     "    expect(residueSentences.length).toBe(101); // (\U0001f195\U0001f195 D479",
     "    expect(residueSentences.length).toBe(100); // (" + NOTE_SHORT + ") // (\U0001f195\U0001f195 D479"),
    ("packages/engine/src/precociousEvolution.test.ts",
     "    expect(head).toBe(1592); // (\U0001f195\U0001f195 D479",
     "    expect(head).toBe(1593); // (" + NOTE_SHORT + ") // (\U0001f195\U0001f195 D479"),
]

for path, find, repl in EDITS:
    with io.open(path, encoding="utf-8") as fh:
        src = fh.read()
    parts = src.split(find)
    if len(parts) != 2:
        print("FAIL %s: %d occurrence(s) of %r" % (path, len(parts) - 1, find[:60]))
        sys.exit(1)
    with io.open(path, "w", encoding="utf-8") as fh:
        fh.write(repl.join(parts))
    print("ok  %s  <- %s" % (path, find[:48]))
