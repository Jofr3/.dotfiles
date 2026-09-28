import * as fs from "node:fs";
const { MUTANTS } = await import("/home/jofre/projects/luminous_ui/scripts/mutation/mutants.ts");
// Mechanical region-overlap audit: every row whose `find` resolves inside a region I will edit.
const REGIONS: [string, number, number][] = [
  ["packages/engine/src/effects.ts", 13700, 13800],   // the bench-counter anchors
  ["packages/engine/src/effects.ts", 27330, 27700],   // deriveAttackDamageMultiplier chain
  ["packages/engine/src/effects.ts", 27600, 27700],   // DAMAGE_SUPPRESSION + reader
  ["packages/engine/src/attack.ts", 1600, 1730],      // the deferral block + suppression read
];
const cache = new Map<string,string>();
function src(f:string){ if(!cache.has(f)) cache.set(f, fs.readFileSync(f,"utf8")); return cache.get(f)!; }
console.log("rows:", MUTANTS.length);
for (const [file,lo,hi] of REGIONS) {
  const s = src(file);
  console.log(`\n### region ${file}:${lo}-${hi}`);
  for (const m of MUTANTS as any[]) {
    if (m.file !== file) continue;
    const at = s.indexOf(m.find);
    if (at < 0) { continue; }
    const startLine = s.slice(0,at).split("\n").length;
    const endLine = startLine + m.find.split("\n").length - 1;
    if (endLine >= lo && startLine <= hi) console.log(`   ${m.id} [${m.decision}] lines ${startLine}-${endLine} killers=${JSON.stringify(m.expectKilledBy)}`);
  }
}
console.log("\n### the two D467 rows' finds, verbatim");
for (const id of ["D467-counter-printed-zero-derives","D467-bench-counter-walk-loses-the-unfiltered-path","D467-counter-arm-builds-the-unfiltered-member"]) {
  const m = (MUTANTS as any[]).find(x=>x.id===id); if(!m){console.log("MISSING",id);continue;}
  console.log(`--- ${id} (file ${m.file}) ---\nFIND:\n${m.find}\nREPLACE:\n${m.replace}`);
}
