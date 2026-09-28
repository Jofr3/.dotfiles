import * as effects from "/home/jofre/projects/luminous_ui/packages/engine/src/effects";
const frags = [
  "a card for each card in your opponent's hand",
  "Draw a card for each card in your opponent's hand.",
  "draw a card for each card in your opponent's hand.",
  "Then, draw a card for each card in your opponent's hand.",
  "for each card in your opponent's hand",
  "Shuffle your hand into your deck. Then, draw a card for each card in your opponent's hand.",
];
for (const t of frags) {
  const hits: string[] = [];
  for (const [name, fn] of Object.entries(effects)) {
    if (typeof fn !== "function") continue;
    if (!name.startsWith("deriveAttack") && !name.startsWith("splitAttack")) continue;
    let out: unknown; try { out = (fn as any)(t); } catch { continue; }
    if (out === null || out === undefined) continue;
    hits.push(`${name} -> ${JSON.stringify(out)}`);
  }
  console.log(JSON.stringify(t), "=>", hits.length ? hits.join(" | ") : "(null)");
}
