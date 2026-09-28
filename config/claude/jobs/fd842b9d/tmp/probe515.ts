import * as e from "/home/jofre/projects/luminous_ui/packages/engine/src/effects.ts";
const rows = [
  "Before doing damage, discard all Pokémon Tools from your opponent's Active Pokémon.",
  "Discard up to 2 Pokémon Tools from your opponent's Pokémon.",
];
for (const r of rows) {
  const out: string[] = [];
  for (const [n, f] of Object.entries(e)) {
    if (!n.startsWith("deriveAttack") || typeof f !== "function") continue;
    try { const v = (f as (s: string) => unknown)(r); if (v !== null && v !== undefined) out.push(`${n} -> ${JSON.stringify(v).slice(0,260)}`); } catch {}
  }
  console.log("\n" + r.slice(0,72) + "…");
  console.log(out.length ? out.join("\n") : "   (no reader claims it)");
}
