const P = "/home/jofre/projects/luminous_ui/packages/engine/src/";
const { legalAttackCorpus, resolvedByAnyReader } = await import(P + "censusAttackCorpus");
const E = await import(P + "effects");
const rows = legalAttackCorpus() as unknown as [number, string][];
const hit = rows.find(([, s]) => s.startsWith("If this Pokémon has at least 2 extra Energy"));
if (!hit) { console.log("not found"); } else {
  const [n, s] = hit;
  console.log(`printings: ${n}\nsentence: ${s}`);
  console.log(`resolvedByAnyReader: ${resolvedByAnyReader(s)}`);
  console.log(`gate split: ${JSON.stringify(E.splitAttackGateClause(s))}`);
  console.log(`trailing split: ${JSON.stringify(E.splitAttackTrailingClause(s))}`);
  console.log(`bonus reader: ${JSON.stringify(E.deriveAttackDamageBonus(s))}`);
}
console.log("\n--- LOOSE: every corpus row mentioning 'extra Energy', all hits ---");
for (const [n, s] of rows.filter(([, s]) => /extra energy/i.test(s))) console.log(String(n).padStart(2), s.slice(0, 110));
