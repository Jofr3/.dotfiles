import { legalAttackCorpus } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus";
import { deriveAttackDamageBonus, deriveAttackDamageMultiplier, deriveAttackDamagePenalty } from "/home/jofre/projects/luminous_ui/packages/engine/src/effects";
import * as effects from "/home/jofre/projects/luminous_ui/packages/engine/src/effects";
const P1 = /does \d+ (more |less )?damage for each /i;
const rows: Record<string, [number,string][]> = {};
for (const [c,t] of legalAttackCorpus()) {
  if (!P1.test(t)) continue;
  const b = deriveAttackDamageBonus(t), m = deriveAttackDamageMultiplier(t), p = deriveAttackDamagePenalty(t);
  let key: string;
  const hit = b ?? m ?? p;
  if (hit) key = (b?"BONUS":m?"MULT":"PENALTY") + " :: " + JSON.stringify(hit.count);
  else {
    // which other reader claims it?
    const names: string[] = [];
    for (const [n,v] of Object.entries(effects)) if (n.startsWith("deriveAttack") && typeof v === "function" && (v as any)(t) !== null) names.push(n);
    key = names.length ? "OTHER-READER :: "+names.join("+") : "UNBUILT";
  }
  (rows[key] ??= []).push([c,t]);
}
for (const k of Object.keys(rows).sort()) {
  const v = rows[k]!;
  console.log(`\n### ${k}  — ${v.length} sentences / ${v.reduce((a,[n])=>a+n,0)} printings`);
  for (const [c,t] of v) console.log(`   ${c}\t${t}`);
}
