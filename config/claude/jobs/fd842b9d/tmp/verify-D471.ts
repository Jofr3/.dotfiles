import { MUTANTS } from "/home/jofre/projects/luminous_ui/scripts/mutation/mutants";
import { readFileSync } from "node:fs";
const inc = MUTANTS.filter((m) => m.decision.includes("D471"));
const eq  = MUTANTS.filter((m) => m.decision === "D471");
const idp = MUTANTS.filter((m) => m.id.startsWith("D471-"));
console.log(`corpus total: ${MUTANTS.length}`);
console.log(`--decision D471 by String.includes: ${inc.length}   by equality: ${eq.length}   by id prefix: ${idp.length}`);
let bad = 0;
for (const m of idp) {
  const src = readFileSync(`/home/jofre/projects/luminous_ui/${m.file}`, "utf8");
  const n = src.split(m.find).length - 1;
  const inert = m.find === m.replace;
  const applied = src.replace(m.find, () => m.replace);
  const changed = applied !== src;
  const dl = applied.length - src.length;
  const ok = n === 1 && !inert && changed;
  if (!ok) bad++;
  console.log(`  ${ok ? "ok " : "BAD"} ${m.id.padEnd(38)} find×${n}  inert=${inert}  changed=${changed}  Δbytes=${dl}  killer=${JSON.stringify(m.killedByCommand)}  expectKilledBy=${JSON.stringify(m.expectKilledBy)}  survives=${m.survives ? "YES" : "no"}`);
}
console.log(bad === 0 ? "\nfind-vs-replace: none inert, all unique, all change the file." : `\n${bad} BAD ROW(S)`);
const surv = MUTANTS.filter((m) => m.survives !== undefined);
console.log(`declared survivors in the corpus: ${surv.length}`);
const byFile: Record<string, number> = {};
for (const m of surv) byFile[m.file] = (byFile[m.file] ?? 0) + 1;
for (const [f, n] of Object.entries(byFile).sort((a,b)=>b[1]-a[1])) console.log(`   ${String(n).padStart(2)}  ${f}`);
