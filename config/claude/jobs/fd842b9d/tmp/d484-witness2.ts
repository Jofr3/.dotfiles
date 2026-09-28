import { indistinguishableGroups, isPartitioned, selfCheck, sharedPatchGroups } from "/home/jofre/projects/luminous_ui/scripts/mutation/partition-gate.ts";
selfCheck();
console.log("selfCheck() passed");
const tags = ["D437","D447","D455","D465","D475","D482"];
for (const t of tags) {
  const mod = await import(`/home/jofre/.claude/jobs/fd842b9d/tmp/hist-${t}.ts`);
  const M = mod.MUTANTS as any[];
  const g = indistinguishableGroups(M);
  console.log(`${t}: ${String(M.length).padStart(5)} rows  partitioned=${isPartitioned(M)}  groups=${g.length}  sharedPatchRows=${sharedPatchGroups(M).reduce((n,x)=>n+x.length,0)}${g.length?"  -> "+g.map(x=>x.map((m:any)=>m.id).join(" + ")).join(" ; "):""}`);
}
const { MUTANTS } = await import("/home/jofre/projects/luminous_ui/scripts/mutation/mutants.ts");
console.log(`HEAD: ${MUTANTS.length} rows  partitioned=${isPartitioned(MUTANTS)}  sharedPatchRows=${sharedPatchGroups(MUTANTS).reduce((n,x)=>n+x.length,0)}`);
