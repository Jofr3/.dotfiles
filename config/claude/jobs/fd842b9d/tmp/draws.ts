import { legalAttackCorpus, resolvedByAnyReader } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus";
const rows = legalAttackCorpus();
console.log("=== corpus sentences containing /draw/i ===");
for (const [n, t] of rows) {
  if (/draw/i.test(t)) console.log(resolvedByAnyReader(t) ? "BUILT " : "UNBUILT", n, JSON.stringify(t));
}
console.log("\n=== corpus sentences containing /[Ee]ach player/ ===");
for (const [n, t] of rows) {
  if (/each player/i.test(t)) console.log(resolvedByAnyReader(t) ? "BUILT " : "UNBUILT", n, JSON.stringify(t));
}
console.log("\n=== corpus sentences containing /player/ (any) ===");
for (const [n, t] of rows) {
  if (/player/i.test(t)) console.log(resolvedByAnyReader(t) ? "BUILT " : "UNBUILT", n, JSON.stringify(t));
}
