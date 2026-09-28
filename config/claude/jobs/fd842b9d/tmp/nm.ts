import * as e from "/home/jofre/projects/luminous_ui/packages/engine/src/effects";
const T = [
  "Shuffle your hand into your deck. Then, draw a card for each card in your hand.",
  "Shuffle your hand into your deck. Then, draw a card for each card in your opponent's discard pile.",
  "Shuffle your hand into your deck. Then, draw 2 cards for each card in your opponent's hand.",
  "Shuffle your hand into your deck. Then, draw a card for each card in your opponent's hand",
  "Shuffle your hand into your deck and draw a card for each card in your opponent's hand.",
  "Shuffle your opponent's hand into their deck. Then, draw a card for each card in your opponent's hand.",
  "Draw a card. Shuffle your hand into your deck. Then, draw a card for each card in your opponent's hand.",
  "Shuffle your hand into your deck. Then, draw a card for each card in your opponent's hand. Your turn ends.",
];
for (const t of T) {
  const hits: string[] = [];
  for (const [n, f] of Object.entries(e)) {
    if (typeof f !== "function") continue;
    if (!n.startsWith("deriveAttack") && !n.startsWith("splitAttack")) continue;
    let o: unknown; try { o = (f as any)(t); } catch { continue; }
    if (o !== null && o !== undefined) hits.push(`${n}->${JSON.stringify(o)}`);
  }
  console.log(hits.length ? "CLAIMED" : "null   ", JSON.stringify(t), hits.join(" | "));
}
