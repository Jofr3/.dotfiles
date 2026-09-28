import { MUTANTS } from "/home/jofre/projects/luminous_ui/scripts/mutation/mutants";
const g = new Map<string, typeof MUTANTS[number][]>();
for (const m of MUTANTS) {
  const k = JSON.stringify([m.file, m.find, m.replace]);
  const a = g.get(k); if (a) a.push(m); else g.set(k, [m]);
}
const dupes = [...g.values()].filter(v => v.length > 1);
console.log(`=== EXACT (file,find,replace) DUPLICATES: ${dupes.length} group(s), ${dupes.reduce((s,v)=>s+v.length,0)} rows ===`);
for (const v of dupes) {
  console.log(`  ${v[0]!.file}`);
  console.log(`  find:    ${JSON.stringify(v[0]!.find)}`);
  console.log(`  replace: ${JSON.stringify(v[0]!.replace)}`);
  for (const m of v) console.log(`    - ${m.id}  (decision ${m.decision}) killedBy=${JSON.stringify((m as any).expectKilledBy ?? [])} survives=${JSON.stringify((m as any).survives ?? null)}`);
  console.log("");
}
// same (file,find), different replace = the legitimate idiom
const g2 = new Map<string, typeof MUTANTS[number][]>();
for (const m of MUTANTS) { const k = JSON.stringify([m.file, m.find]); const a = g2.get(k); if (a) a.push(m); else g2.set(k, [m]); }
const shared = [...g2.values()].filter(v => v.length > 1);
console.log(`=== SAME (file,find) groups: ${shared.length} group(s), ${shared.reduce((s,v)=>s+v.length,0)} rows ===`);
const spread = new Map<number, number>();
for (const v of shared) spread.set(v.length, (spread.get(v.length) ?? 0) + 1);
console.log("   group sizes: " + [...spread.entries()].sort((a,b)=>a[0]-b[0]).map(([k,v])=>`${k}x${v}`).join(" "));
// cross-decision shared find
const cross = shared.filter(v => new Set(v.map(m=>m.decision)).size > 1);
console.log(`   of which CROSS-DECISION: ${cross.length}`);
for (const v of cross) console.log(`     ${v.map(m=>m.id).join(" | ")}`);
