import * as e from "/home/jofre/projects/luminous_ui/packages/engine/src/effects.ts";
const rows = [
  "Discard a card from your hand. If you do, your opponent discards a card from their hand.",
  "Discard a card from your hand. If you do, draw 2 cards.",
  "Shuffle your hand into your deck. Then, draw a card for each card in your opponent's hand.",
  "Shuffle your hand into your deck. Then, draw 6 cards.",
];
for (const r of rows) {
  const out: string[] = [];
  for (const [n, f] of Object.entries(e)) {
    if (!n.startsWith("deriveAttack") || typeof f !== "function") continue;
    try { const v = (f as (s: string) => unknown)(r); if (v !== null && v !== undefined) out.push(`  ${n} -> ${JSON.stringify(v).slice(0,200)}`); } catch {}
  }
  console.log("\n" + r.slice(0,76));
  console.log(out.length ? out.join("\n") : "   (no reader claims it)");
}
