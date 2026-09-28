import { MUTANTS } from "/home/jofre/.claude/jobs/fd842b9d/tmp/d484-mutants-D482.ts";
const g = new Map<string, any[]>();
for (const m of MUTANTS as any[]) {
  const k = JSON.stringify([m.file, m.find, m.replace, [...(m.expectKilledBy ?? [])].sort(), m.survives ?? null]);
  const a = g.get(k); if (a) a.push(m); else g.set(k, [m]);
}
console.log(`corpus at D482 (551c8692): ${MUTANTS.length} rows`);
const d = [...g.values()].filter(v => v.length > 1);
console.log(`INDISTINGUISHABLE-EXPERIMENT groups: ${d.length}`);
for (const v of d) console.log(`  ${v[0].file}\n    find: ${JSON.stringify(v[0].find)}\n    ${v.map((m:any)=>m.id).join("\n    ")}`);
