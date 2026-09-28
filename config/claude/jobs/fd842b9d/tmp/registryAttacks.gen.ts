export const REGISTRY_ATTACKS: readonly (readonly [string, string])[] = [
  [
    "sv09-068",
    "You may search your deck for any number of Basic Lillie's Pokémon and put them onto your Bench. Then, shuffle your deck.",
  ],
  [
    "sv10-050",
    "Search your deck for up to 3 Misty's Pokémon, reveal them, and put them into your hand. Then, shuffle your deck.",
  ],
  [
    "sv10-194",
    "Search your deck for up to 3 Misty's Pokémon, reveal them, and put them into your hand. Then, shuffle your deck.",
  ],
  [
    "sv10-083",
    "Search your deck for up to 2 Basic Steven's Pokémon and put them onto your Bench. Then, shuffle your deck.",
  ],
  // 🆕 D312 — the FIFTH, and the FIRST one that is NOT at index 0. Gholdengo
  // `sv08-131` idx 1 "Surf Back"; idx 0's evolved-this-turn conditional stays
  // unsimulated, which is what the index-precision rung below now drives on TWO
  // cards instead of one.
  ["sv08-131", "You may shuffle this Pokémon and all attached cards into your deck."],
  // 🆕 D313 — SEVEN MORE, on THREE sentences, and they are the whole DESTINATION
  // axis of the self-removal family landing in one slice. The table goes 5 → 12
  // rows and its DISTINCT sentences 4 → 7, which is the shape of a `dest` field
  // that had to be priced over all four printed spellings at once or not at all.
  // ⚠️ Two of the three are at index **1** (Comfey, Revavroom ex) and one at index
  // **0** (Crobat ex), so the "SOME index carries a program" lookup D312 installed
  // is now load-bearing on five cards rather than two.
  ["sv09-068", "Put this Pokémon and all attached cards into your hand."],
  ["sv06.5-015", "Discard this Pokémon and all attached cards."],
  ["sv06.5-081", "Discard this Pokémon and all attached cards."],
  [
    "sv10-122",
    "You may put this Pokémon into your hand. (Discard all cards attached to this Pokémon.)",
  ],
  [
    "sv10-217",
    "You may put this Pokémon into your hand. (Discard all cards attached to this Pokémon.)",
  ],
  [
    "sv10-234",
    "You may put this Pokémon into your hand. (Discard all cards attached to this Pokémon.)",
  ],
  [
    "sv10-242",
    "You may put this Pokémon into your hand. (Discard all cards attached to this Pokémon.)",
  ],
  // 🆕 D314 — the THIRTEENTH, on an EIGHTH distinct sentence. Eldegoss `sv07-011`
  // idx 0 "Breezy Gift"; idx 1 is "Leafage", `damage: 50` with no `effect` key at
  // all, so it contributes zero attack units and must stay unclaimed.
  [
    "sv07-011",
    "Put this Pokémon and all attached cards into your deck. If you do, search your deck for up to 3 cards and put them into your hand. Then, shuffle your deck.",
  ],
  // 🆕 D338 — the FOURTEENTH and FIFTEENTH, on a NINTH distinct sentence. Heatmor
  // `sv10.5w-019`/`-104` idx 0 "Licking Catch", 2 legal printings of 2 on ONE
  // byte-identical sentence, re-queried against remote D1 `luminous` rather than
  // recalled (`instr(attacks_json,'in any combination of {R} Pok') > 0` is 2 rows /
  // 2 legal; `instr(attacks_json,'Licking Catch') > 0` is the same two ids reached
  // by the attack NAME instead of by the sentence). Both ids: `legal_standard = 1`,
  // `category = 'Pokemon'`, Basic, `["Fire"]`, `abilities_json IS NULL`, `effect IS
  // NULL`, `length(attacks_json) = 268`.
  // 🛑 **THIS IS THE SUMMAND THAT MOVES, AND IT IS KEYED ON THE REGISTRY.**
  // `BUILT.attack`'s other two summands are READER-keyed — `rawUnitsAtHead()` runs
  // the `deriveAttack*` readers live over the committed legal corpus with
  // `programFor` nowhere in the addition (D307/D315), so an authored row buys the
  // raw summand nothing at all, and the split term is keyed on the split string,
  // which this sentence does not carry. **SAY WHICH SUMMAND YOU MOVE BEFORE YOU
  // ASSERT A DELTA**: 1,164 raw + **15** registry + 13 split = **1,192**.
  // ⚠️ AND `derivedHandSearch.test.ts`'s `DEFERRED` STILL REFUSES THE SENTENCE BY
  // NAME — *"a typed DISJUNCTION (sv10.5w-019/-104)"* — which is not a
  // contradiction: that table asserts `deriveAttackEffect(text) === null` and never
  // `programFor(id) === undefined`. D314's distinction, checked by opening the
  // assertion rather than by assuming it, and its `10` total stands still.
  // ⚠️ INDEX-PRECISE: index 1 "Fire Claws" is `damage: 60` with NO `effect` key at
  // all, so it contributes zero attack units and must stay unclaimed — Eldegoss's
  // rule one row up, now driven on a SECOND card.
  [
    "sv10.5w-019",
    "Search your deck for up to 3 in any combination of {R} Pokémon and Basic {R} Energy cards, reveal them, and put them into your hand. Then, shuffle your deck.",
  ],
  [
    "sv10.5w-104",
    "Search your deck for up to 3 in any combination of {R} Pokémon and Basic {R} Energy cards, reveal them, and put them into your hand. Then, shuffle your deck.",
  ],
  // 🆕 D339 — the SIXTEENTH row, on a TENTH distinct sentence, and **THE ROW THAT
  // CLOSES THE "in any combination of" GRAMMAR AT 6 OF 6**. Maushold `sv08-158`
  // idx 0 "Familial March", 1 legal printing of 1, re-queried against remote D1
  // `luminous` rather than recalled: `instr(attacks_json,'in any combination of')`
  // is 4 rows / 3 legal and `instr(attacks_json,'Search your deck for up to') > 0
  // AND instr(attacks_json,'any combination') > 0` is 3 rows / 3 legal — Heatmor's
  // two (above) and this one. `sv08-158`: `legal_standard = 1`, `category =
  // 'Pokemon'`, Stage1 from Tandemaus, `["Colorless"]`, `abilities_json IS NULL`,
  // `effect IS NULL`, `length(attacks_json) = 324`.
  // 🛑 **THE ROWS AND THE KEYS STEP TOGETHER (15 → 16 AND 14 → 15) AND THE
  // SENTENCES STEP WITH THEM (9 → 10)** — one id carrying one sentence at one
  // index, where D338's stepped 2 and 2 against 1 sentence because a reprint
  // shared a string. All three numbers move by exactly 1 here, which is the
  // simplest shape this table takes and worth saying out loud because the previous
  // row was the exception.
  // 🛑 **THIS IS THE SUMMAND THAT MOVES, AND IT IS KEYED ON THE REGISTRY.**
  // `BUILT.attack`'s other two summands are READER-keyed — `rawUnitsAtHead()` runs
  // the `deriveAttack*` readers live over the committed legal corpus with
  // `programFor` nowhere in the addition (D307/D315), so an authored row buys the
  // raw summand nothing, and the split term is keyed on the split string, which
  // this sentence does not carry. **SAY WHICH SUMMAND YOU MOVE BEFORE YOU ASSERT A
  // DELTA**: 1,164 raw + **16** registry + 13 split = **1,193**.
  // ⚠️ AND `derivedBenchSearch.test.ts`'s `DEFERRED` STILL REFUSES THE SENTENCE BY
  // NAME — it asserts `deriveAttackEffect(text) === null` and never `programFor(id)
  // === undefined`, so the refusal is UNCHANGED by building it. D314's distinction,
  // checked by opening the assertion rather than by assuming it; its `25` total
  // stands still and only the LABEL on its third term moved (D339 repaired the word
  // "unspellable", which `anyOf` had made false at D337).
  // ⚠️ INDEX-PRECISE: index 1 "Incessant Incisors" is *"Flip 4 coins. This attack
  // does 30 damage for each heads."* with `damage: "30×"` — a coin-scaled body that
  // contributes zero attack units and must stay unclaimed, Eldegoss's rule at D314
  // and Heatmor's at D338, now driven on a THIRD card.
  [
    "sv08-158",
    "Search your deck for up to 2 in any combination of Maushold and Maushold ex and put them onto your Bench. Then, shuffle your deck.",
  ],
];
