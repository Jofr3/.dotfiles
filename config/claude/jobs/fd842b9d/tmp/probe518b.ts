import * as e from "/home/jofre/projects/luminous_ui/packages/engine/src/effects.ts";
const rows: [number,string][] = [
  [324,"If this Pokémon is affected by a Special Condition, ignore all Energy in this attack's cost."],
  [386,"If your opponent's Active Pokémon is affected by a Special Condition, this attack does 120 more damage."],
  [513,"This Pokémon recovers from all Special Conditions."],
  [537,"This attack does 100 damage for each Special Condition affecting your opponent's Active Pokémon."],
];
for (const [ln,r] of rows) {
  const out: string[] = [];
  for (const [n, f] of Object.entries(e)) {
    if (!(n.startsWith("deriveAttack")||n.startsWith("splitAttack")) || typeof f !== "function") continue;
    try { const v = (f as (s:string)=>unknown)(r); if (v != null) out.push(`${n} -> ${JSON.stringify(v).slice(0,120)}`); } catch {}
  }
  console.log(`:${ln}  ${out.length ? "BUILT  "+out[0] : "UNBUILT"}`);
}
