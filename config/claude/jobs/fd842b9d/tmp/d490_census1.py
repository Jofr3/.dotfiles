import io, sys
ANN = ("(\U0001f195\U0001f195\U0001f195 **D490 +1 sentence / +2 printings — THE MILL OF **BOTH** DECKS, SCALED BY THE "
       "ENERGY AMONG WHAT IT MILLED** — `censusAttackCorpus.ts` FILE LINE **130**, *\"Discard the top card of "
       "each player's deck. This attack does 140 more damage for each Energy card discarded in this way.\"*, "
       "**1 sentence / 2 legal printings**, the LAST unbuilt member of the `discarded in this way` family. "
       "Claimed by `deriveAttackDiscardScaledBoost`, which becomes a TWO-MEMBER discriminated union rather than "
       "a FOURTEENTH reader — measured: a new `deriveAttack*` export would have moved **75 "
       "`expect(attackReaderSurface()).toHaveLength(13)` assertions across 74 files**, where riding this reader "
       "costs **ZERO bytes in `attack.ts`** (`scaledBase`, `effectSimulated` and `modifierSimulated` are all "
       "spelled `discardScaledBoost !== null`). ONE new VALUE on the shipped `discardDeckTop.whose` "
       "(`\"eachPlayer\"`, dispatched by a `switch` where a ternary stood — D447) and ZERO new op FIELDS: "
       "`damageDefender.base` (D403) and `damageDefender.countFilter` (D488) both already ship. "
       "\U0001f6d1 **THE 2⁵ AXIS-SUBSTITUTION LATTICE WAS RUN IN FULL AND EXACTLY ONE OF ITS 32 POINTS BUILDS** — "
       "the all-five substitution — so no proper subset of the MILL SIDE / COUNT SPELLING / JOINER / `more` "
       "FOLD / OWNERLESS POSSESSOR reaches a claimed string. ⚠️ **THE TWO STEPS DISAGREE, 1 AND 2**: a "
       "`.length` site takes +1 where a `units(…)` site takes +2.)")

EDITS = [
    ("/home/jofre/projects/luminous_ui/packages/engine/src/censusAtHead.test.ts",
     "  attack: 1602, // (", "  attack: 1604, // " + ANN + " ("),
    ("/home/jofre/projects/luminous_ui/packages/engine/src/censusAtHead.test.ts",
     "    expect(unbuiltAttack).toBe(130); // (",
     "    expect(unbuiltAttack).toBe(128); // " + ANN + " ("),
    ("/home/jofre/projects/luminous_ui/packages/engine/src/censusAtHead.test.ts",
     "const RAW_UNBUILT_ATTACK_UNITS = 180;  // (",
     "const RAW_UNBUILT_ATTACK_UNITS = 178;  // " + ANN + " ("),
    ("/home/jofre/projects/luminous_ui/packages/engine/src/precociousEvolution.test.ts",
     "    expect(head).toBe(1602); // (",
     "    expect(head).toBe(1604); // " + ANN + " ("),
    ("/home/jofre/projects/luminous_ui/packages/engine/src/censusAtHead.test.ts",
     "    expect(Math.round((inRows / unbuiltAttack) * 100)).toBe(18); // \U0001f195\U0001f195\U0001f195 **D483",
     "    expect(Math.round((inRows / unbuiltAttack) * 100)).toBe(19); // \U0001f195\U0001f195\U0001f195 **D490 — 18% → 19%, AND THE NUMERATOR DID NOT MOVE. THE NINTH ROUNDING-BOUNDARY CROSSING THIS FIGURE HAS EVER HAD.** `inRows` stands still at **24** — MEASURED, not assumed: this slice's ONE sentence was run against all EIGHT `ROWS` patterns and matches ZERO (it opens *\"Discard the top…\"*, where the nearest pattern reads *\"[Ll]ook at the top\"*) — while the DENOMINATOR alone fell `unbuiltAttack` 130 → **128**. \U0001f6d1 **AND THE NUMERATOR WAS DERIVED BY INTERSECTION RATHER THAN READ (D488): a rounded assertion has a solution SET.** At the OLD denominator `round(n/130*100) === 18` holds for `n ∈ {24}` (23.4 ≤ n ≤ 24.05); at the NEW one `=== 19` holds for `n ∈ {24}` (23.68 ≤ n ≤ 24.96). The intersection is **{24}**, unmoved, so the printed digit is the only thing this slice may edit here. 24/130 = 18.46% rounds to 18; 24/128 = 18.75% rounds to 19. // \U0001f195\U0001f195\U0001f195 **D483"),
]
for path, find, repl in EDITS:
    s = io.open(path, encoding="utf-8").read()
    if s.count(find) != 1:
        sys.stderr.write("COUNT %d for %s :: %s\n" % (s.count(find), path, find[:90])); raise SystemExit(2)
    open(path, "wb").write(repl.join(s.split(find)).encode("utf-8"))
    print("ok", path.split("/")[-1], find[:50])
