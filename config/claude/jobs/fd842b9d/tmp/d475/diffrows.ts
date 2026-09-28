import { MUTANTS } from "/home/jofre/projects/luminous_ui/scripts/mutation/mutants";
const mine = MUTANTS.filter((m) => m.decision === "D475");
console.log("D475 rows (equality):", mine.length);
console.log("D475 rows (includes, the runner's own filter):", MUTANTS.filter((m) => m.decision.includes("D475")).length);
console.log("corpus total:", MUTANTS.length);
for (const m of mine) {
  const inert = m.find === m.replace;
  // strip comments and string-only differences: report the semantic token that moved
  const a = m.find, b = m.replace;
  let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++;
  let j = 0; while (j < a.length - i && j < b.length - i && a[a.length-1-j] === b[b.length-1-j]) j++;
  console.log(`\n${m.id}  [${m.file}] inert=${inert}`);
  console.log(`   -  ${JSON.stringify(a.slice(i, a.length - j))}`);
  console.log(`   +  ${JSON.stringify(b.slice(i, b.length - j))}`);
  if (m.survives) console.log(`   SURVIVES ${m.survives.kind}`);
}
