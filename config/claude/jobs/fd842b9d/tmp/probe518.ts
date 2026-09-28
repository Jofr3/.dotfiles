import * as e from "/home/jofre/projects/luminous_ui/packages/engine/src/effects.ts";
const rows = [
  "This attack does 100 damage for each Special Condition affecting your opponent's Active Pokémon.",
  "During your next turn, the Defending Pokémon takes 50 more damage from attacks (after applying Weakness and Resistance).",
  "During your next turn, this Pokémon's Hyper Fang attack's base damage is 240.",
  "This attack does 50 damage for each of your Pokémon that has any damage counters on it.",
];
for (const r of rows) {
  const out: string[] = [];
  for (const [n, f] of Object.entries(e)) {
    if (!(n.startsWith("deriveAttack") || n.startsWith("splitAttack")) || typeof f !== "function") continue;
    try { const v = (f as (s:string)=>unknown)(r); if (v != null) out.push(`  ${n} -> ${JSON.stringify(v).slice(0,170)}`); } catch {}
  }
  console.log("\n" + r.slice(0,78));
  console.log(out.length ? out.join("\n") : "   (nothing claims it)");
}
