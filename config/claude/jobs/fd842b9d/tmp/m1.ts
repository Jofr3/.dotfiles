import { legalAttackCorpus } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus";
const rows: [number,string][] = legalAttackCorpus() as any;
const show = (label:string, re:RegExp) => {
  const hits = rows.map((r,i)=>[i+1,r] as const).filter(([,[,t]])=>re.test(t));
  console.log(`\n## ${label}: ${hits.length} sentences / ${hits.reduce((a,[,[n]])=>a+n,0)} printings`);
  for (const [i,[n,t]] of hits) console.log(`  idx${i} ${n}p  ${t}`);
};
show("in its name", /in its name/);
show("name (any)", /\bname\b/);
show("both yours and your opponent", /both yours and your opponent/);
show("in play that has", /in play that has/);
show("Supporter card", /Supporter card/);
// quote bytes on the two target rows
for (const t of rows.map(r=>r[1]).filter(t=>/in its name/.test(t))) {
  console.log("\n", t);
  console.log("  cps:", [...t].map((c,i)=>[i,c.codePointAt(0)!] as const).filter(([,cp])=>cp>126 || cp===0x22 || cp===0x27 || cp===0x28).map(([i,cp])=>`${i}:U+${cp.toString(16).toUpperCase().padStart(4,"0")}`).join(" "));
}
