import * as e from "/home/jofre/projects/luminous_ui/packages/engine/src/effects.ts";
const rows = [
  "If you have exactly 1 Prize card remaining, your opponent's Active Pokémon is now Paralyzed.",
  "Your opponent's Active Pokémon is now Paralyzed.",
  "This attack does 50 damage for each of your Pokémon that has any damage counters on it.",
  "This attack does 100 damage for each Special Condition affecting your opponent's Active Pokémon.",
];
for (const r of rows) {
  const out: string[] = [];
  for (const [n, f] of Object.entries(e)) {
    if (!n.startsWith("deriveAttack") && !n.startsWith("splitAttack")) continue;
    if (typeof f !== "function") continue;
    try { const v = (f as (s: string) => unknown)(r); if (v !== null && v !== undefined) out.push(`  ${n} -> ${JSON.stringify(v).slice(0,180)}`); } catch {}
  }
  console.log("\n" + r.slice(0,84));
  console.log(out.length ? out.join("\n") : "   (nothing claims it)");
}
