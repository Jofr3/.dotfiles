import * as e from "/home/jofre/projects/luminous_ui/packages/engine/src/effects.ts";
const rows = [
  "This attack does 50 damage for each of your Pokémon that has any damage counters on it.",
  "This attack does 20 damage to 1 of your opponent's Benched Pokémon for each damage counter on that Pokémon. (Don't apply Weakness and Resistance for Benched Pokémon.)",
];
for (const r of rows) {
  const out: string[] = [];
  for (const [n,f] of Object.entries(e)) {
    if (!n.startsWith("deriveAttack") || typeof f!=="function") continue;
    try { const v=(f as (s:string)=>unknown)(r); if (v!=null) out.push(`${n} -> ${JSON.stringify(v).slice(0,110)}`);} catch {}
  }
  console.log(`  ${out.length?"BUILT  "+out[0]:"UNBUILT"}  ← ${r.slice(0,58)}`);
}
