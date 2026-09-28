import * as e from "/home/jofre/projects/luminous_ui/packages/engine/src/effects.ts";
const rows = [
  "You may search your deck for any number of Basic Lillie's Pokémon and put them onto your Bench. Then, shuffle your deck.",
  "You may search your deck for any number of Fennel cards, reveal them, and put them into your hand. Then, shuffle your deck.",
];
for (const r of rows) {
  const out: string[] = [];
  for (const [n, f] of Object.entries(e)) {
    if (!n.startsWith("deriveAttack") || typeof f !== "function") continue;
    try { const v = (f as (s: string) => unknown)(r); if (v !== null && v !== undefined) out.push(`${n} -> ${JSON.stringify(v).slice(0,220)}`); } catch {}
  }
  console.log("\n" + r.slice(0, 70) + "…");
  console.log(out.length ? out.join("\n") : "   (no reader claims it)");
}
