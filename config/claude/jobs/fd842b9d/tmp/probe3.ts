const A = new RegExp(
  "^(?:You may search|Search) your deck for (?:(an? [^,.]+?)(, reveal it,)? and put it" +
    "|up to (\\d+) ([^,.]+?)( of different types)?(, reveal them,)? and put them)" +
    " into your hand\\. Then, shuffle your deck\\.$",
);
const cases = [
 ["473","Search your deck for up to 3 Basic Energy cards of different types, reveal them, and put them into your hand. Then, shuffle your deck."],
 ["474","Search your deck for up to 3 Basic Energy cards, reveal them, and put them into your hand. Then, shuffle your deck."],
 ["440ish","Search your deck for up to 3 {D} Pokémon, reveal them, and put them into your hand. Then, shuffle your deck."],
 ["greenG","Search your deck for up to 3 Basic {G} Energy cards, reveal them, and put them into your hand. Then, shuffle your deck."],
 ["singular","Search your deck for a Supporter card and put it into your hand. Then, shuffle your deck."],
 ["noreveal","Search your deck for up to 3 Basic Energy cards of different types and put them into your hand. Then, shuffle your deck."],
] as const;
for (const [l,s] of cases) { const m = A.exec(s); console.log(l, m ? JSON.stringify(m.slice(1)) : "null"); }
