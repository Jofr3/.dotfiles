import * as e from "/home/jofre/projects/luminous_ui/packages/engine/src/effects.ts";
for (const r of ["You win this game.", "you win this game"]) {
  const out: string[] = [];
  for (const [n, f] of Object.entries(e)) {
    if (!n.startsWith("deriveAttack") || typeof f !== "function") continue;
    try { const v = (f as (s:string)=>unknown)(r); if (v != null) out.push(`  ${n} -> ${JSON.stringify(v).slice(0,140)}`); } catch {}
  }
  console.log(`"${r}" -> ${out.length ? "\n"+out.join("\n") : "(nothing claims it)"}`);
}
