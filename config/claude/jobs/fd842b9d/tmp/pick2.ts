const P = "/home/jofre/projects/luminous_ui/packages/engine/src/";
const { legalAttackCorpus, resolvedByAnyReader } = await import(P + "censusAttackCorpus");
const rows = legalAttackCorpus() as unknown as [number, string][];
// loosest shape for a per-body FILTER on a snipe target — grep the concept two ways
const pats = [/that ha[sv]e? any damage counters/i, /Benched Pokémon that/i];
const seen = new Set<string>();
for (const p of pats) for (const [n, s] of rows.filter(([, s]) => p.test(s))) {
  if (seen.has(s)) continue; seen.add(s);
  console.log(String(n).padStart(2), resolvedByAnyReader(s) ? "BUILT  " : "UNBUILT", s.slice(0, 108));
}
console.log(`\n(patterns: /that ha[sv]e? any damage counters/i and /Benched Pokémon that/i — ${seen.size} distinct rows, all printed)`);
