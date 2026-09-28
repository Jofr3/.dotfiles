# -*- coding: utf-8 -*-
import io

ROWS = r'''  // ── D486 · the gated increment on the opponent's hand discard ──────────────
  // "1 sentence / 1 legal printing; ONE anchor, ONE arm, ONE clause row, ZERO new mechanism."
  // 🛑 THE FIVE READINGS §5 DRIVES ARE THE FIVE ROWS BELOW, ONE EACH, and each one's
  //    (gate-true, gate-false) answer PAIR is named in its `what` — because on this
  //    sentence no SINGLE board separates them: *correct* and *the gate dropped* both
  //    answer 3 on the true board, and *correct* and *the increment as a total* both
  //    answer 1 on the false one. The pair is the experiment.
  // ⚠️ C1's `find` is a SUPERSET of C4's and C5's lines, which is D485's own C1/C2/C3
  //    idiom (a line, a block containing it, a bigger block containing both) and is
  //    what a six-line arm with eight independent claims forces. It rots LOUDLY:
  //    `precheck` reports a superset `find` at ZERO matches the moment either inner
  //    line is re-transcribed, which is the opposite of D483's silent case.
  {
    id: "D486-gate-collapses-to-the-unconditional-reading",
    decision: "D486",
    what: "🛑 **C1 — THE CENTRAL ARM AT ITS NEAREST WRONG SIBLING: the gate is deleted and both discards run always.** The printed *\"If this Pokémon evolved from Salandit during this turn\"* stops being a condition, so every attacker on this card discards THREE from the opponent's hand whether it evolved or not. ⚠️ **SILENT IN EVERY CENSUS AND IN MOST BOARDS**: the sentence still resolves, `BUILT.attack` is 1597, the residue is 96/135, `ATTACK_EFFECT_SKIPPED` never fires, and **on the gate-TRUE board this mutant and the shipped arm are BYTE-IDENTICAL** — 3 cards, same pile, same two prompts. The pair is (3,3) against the correct (1,3)… read the other way round: correct is (3,1), this is (3,3). The only rung that can see it is one on the gate-FALSE board, which is exactly why §4 fields THREE of them, one axis apart each",
    file: "packages/engine/src/effects.ts",
    find: "      return [\n        { op: \"opponentDiscardsFromHand\", count: 1 },\n        {\n          op: \"conditionGate\",\n          cond: gate,\n          // biome-ignore lint/suspicious/noThenProperty: `then` is the effect contract's gated-step list, not a thenable (arrays are not callable).\n          then: [{ op: \"opponentDiscardsFromHand\", count: more }],\n        },\n      ];",
    replace: "      return [\n        { op: \"opponentDiscardsFromHand\", count: 1 },\n        { op: \"opponentDiscardsFromHand\", count: more },\n      ];",
    expectKilledBy: ["packages/engine/src/evolvedDiscardCompound.test.ts"],
  },
  {
    id: "D486-increment-becomes-the-total",
    decision: "D486",
    what: "⚠️ **C2 — *\"2 MORE\"* READ AS A TOTAL RATHER THAN AS AN INCREMENT**, which is the one misreading the printed English actually invites: the gated op takes `more + 1`, so the attack discards FOUR where the card says three. Answers the pair **(4, 1)**, and the gate-FALSE half is IDENTICAL to the correct build's — so a suite that only ever fielded the un-evolved board would report this green. ⚠️ **AND IT NEEDS A HAND OF FOUR TO SEE AT ALL**: at three cards the clamp swallows the difference and both empty the hand, which is why §5 drives the three-card board explicitly and asserts the collapse",
    file: "packages/engine/src/effects.ts",
    find: "    const more = Number(match[2]);",
    replace: "    const more = Number(match[2]) + 1;",
    expectKilledBy: ["packages/engine/src/evolvedDiscardCompound.test.ts"],
  },
  {
    id: "D486-increment-floor-admits-zero",
    decision: "D486",
    what: "⚠️ **C3 — THE NUMERIC FLOOR EVERY COUNT-BEARING ARM IN THIS FILE CARRIES, REMOVED.** `more >= 1` becomes `more >= 0`, so a printed *\"discards 0 more cards\"* derives to a program that announces a gated discard of nothing instead of landing on the loud `ATTACK_EFFECT_SKIPPED` path (D190b's exact-map-or-flag rule). **No printed sentence carries it today** — the plural noun makes 1 unspellable and 0 unprinted — which is exactly the shape D479 named UNKILLABLE-AS-WRITTEN, so the rung that kills it is a SYNTHETIC string in §3 and not a corpus row. Its sibling one arm up (`D426-*`) is the same claim at the same address",
    file: "packages/engine/src/effects.ts",
    find: "    if (gate !== null && more >= 1) {",
    replace: "    if (gate !== null && more >= 0) {",
    expectKilledBy: ["packages/engine/src/evolvedDiscardCompound.test.ts"],
  },
  {
    id: "D486-head-discard-is-not-the-article",
    decision: "D486",
    what: "⚠️ **C4 — THE HEAD'S `1` IS THE PRINTED ARTICLE, AND THIS ROW IS WHAT SAYS SO.** *\"discards **a** card\"* becomes a 2, so the compound's first op stops agreeing with `deriveAttackEffect` of the head sentence — the property §3 asserts against the READER rather than against a re-typed literal (D479's capture rule), and the property the sibling composition in §5 does not have. Answers **(4, 2)**: wrong on BOTH gate boards, which is what separates it from C1 and C2",
    file: "packages/engine/src/effects.ts",
    find: "        { op: \"opponentDiscardsFromHand\", count: 1 },\n        {\n          op: \"conditionGate\",",
    replace: "        { op: \"opponentDiscardsFromHand\", count: 2 },\n        {\n          op: \"conditionGate\",",
    expectKilledBy: ["packages/engine/src/evolvedDiscardCompound.test.ts"],
  },
  {
    id: "D486-gate-arms-are-crossed",
    decision: "D486",
    what: "🛑 **C5 — THE INCREMENT MOVES TO THE GATE'S FALSE ARM**, so the card pays its bonus to every attacker that did NOT evolve from Salandit this turn and nothing to the one that did. Answers **(1, 3)** — the correct pair (3, 1) with its halves swapped — so **either board alone catches it and neither is enough on its own to distinguish it from C1**, which is the whole reason §5 keys on the PAIR. ⚠️ The `then: []` in the replacement is not padding: `conditionGate.then` is REQUIRED and `otherwise` is optional, so an arms-crossed build has to spell both, and this row is what proves the empty arm is reachable at all",
    file: "packages/engine/src/effects.ts",
    find: "          then: [{ op: \"opponentDiscardsFromHand\", count: more }],",
    replace: "          then: [],\n          otherwise: [{ op: \"opponentDiscardsFromHand\", count: more }],",
    expectKilledBy: ["packages/engine/src/evolvedDiscardCompound.test.ts"],
  },
  {
    id: "D486-clause-table-miss-defaults-to-the-named-card",
    decision: "D486",
    what: "🛑 **C6 — AN UNMAPPED CLAUSE STOPS BEING LOUD.** `boardConditionForClause` returning null is what makes a clause this engine has never read land on the refusal path; defaulted to the Salandit member, *\"If this Pokémon evolved from **Rayquaza** during this turn, your opponent discards 2 more cards.\"* would derive to a program that pays Salandit's increment off a card that names a different Pokémon. **This is `CONDITIONAL_DAMAGE_CLAUSES`' standing rule inverted**, and it is the defect D393 refused a TEMPLATE to avoid — *\"a pattern would resolve 'evolved from Rayquaza' to a predicate answering FALSE forever and silently\"* — arriving through the other door, where it answers TRUE instead",
    file: "packages/engine/src/effects.ts",
    find: "    const gate = boardConditionForClause(match[1] ?? \"\");\n    const more = Number(match[2]);",
    replace: "    const gate = boardConditionForClause(match[1] ?? \"\") ??\n      ({ kind: \"yourActiveEvolvedFromThisTurn\", name: \"Salandit\" } as BoardCondition);\n    const more = Number(match[2]);",
    expectKilledBy: ["packages/engine/src/evolvedDiscardCompound.test.ts"],
  },
  {
    id: "D486-clause-row-names-the-wrong-card",
    decision: "D486",
    what: "🛑 **C7 — THE THIRD LITERAL CLAUSE ROW NAMES ITS NEIGHBOUR'S CARD.** `name: \"Salandit\"` becomes `\"Gimmighoul\"`, which is D393's own cross-control at a THIRD address: the clause key still matches, the member is still right, the gate still evaluates — and it answers FALSE on the one board the printed sentence is about, because `conditionHolds` compares the card one below the top of the stack to `cond.name` BYTE FOR BYTE. **Answers (1, 1)**, i.e. it looks exactly like a card with no gate clause at all. ⚠️ **AND IT IS THE ROW THAT SAYS THE THREE LITERAL ROWS ARE THREE CLAIMS AND NOT ONE** — D393 priced a PAIR because one member serves two names; this row is what keeps the third name falsifiable",
    file: "packages/engine/src/effects.ts",
    find: "    { kind: \"yourActiveEvolvedFromThisTurn\", name: \"Salandit\" },",
    replace: "    { kind: \"yourActiveEvolvedFromThisTurn\", name: \"Gimmighoul\" },",
    expectKilledBy: ["packages/engine/src/evolvedDiscardCompound.test.ts"],
  },
  {
    id: "D486-tail-only-anchor-loses-the-antecedent",
    decision: "D486",
    what: "🛑 **C8 — THE REFUSAL THIS SLICE WROTE, ARMED, AND IT IS D485's C6 ONE PART OF SPEECH OVER.** The anchor drops its leading discard clause and becomes TAIL-ONLY, which is the CHEAPER build D466's rule surfaced and this slice declined: `deriveAttackEffect` then claims the bare fragment *\"If this Pokémon evolved from Salandit during this turn, your opponent discards 2 more cards.\"*, whose *\"2 MORE\"* has no antecedent, and `splitAttackTrailingClause` — whose only unmet condition was that tail — composes it behind **any** claimed head. *\"Your opponent's Active Pokémon is now Asleep. If this Pokémon evolved from Salandit during this turn, your opponent discards 2 more cards.\"* then discards two cards MORE THAN NOTHING. ⚠️ **THE FAMILY MARKS ITS OWN ANAPHOR IN PRINT**: the column's only other gated-increment compound spells it *\"discard 3 more cards **in this way**\"*, the §9.2 backward reference this engine reads as `recordGate`. 🛑 **THIS ROW HAS KILLERS IN TWO FILES AND THE SECOND IS A PREDECESSOR'S** — D426's `opponentHandDiscard.test.ts` slot, which asserts this exact tail fragment stays unclaimed and was RE-POINTED rather than deleted when the compound landed",
    file: "packages/engine/src/effects.ts",
    find: "  /^Your opponent discards a card from their hand\\. If (.+), your opponent discards (\\d+) more cards\\.$/;",
    replace: "  /^If (.+), your opponent discards (\\d+) more cards\\.$/;",
    expectKilledBy: [
      "packages/engine/src/evolvedDiscardCompound.test.ts",
      "packages/engine/src/opponentHandDiscard.test.ts",
    ],
  },

];
'''

p = "scripts/mutation/mutants.ts"
s = io.open(p, encoding="utf-8").read()
old = "\n];\n"
assert s.endswith(old), repr(s[-20:])
s = s[: -len(old)] + "\n" + ROWS
io.open(p, "w", encoding="utf-8").write(s)
print("mutant rows appended")
