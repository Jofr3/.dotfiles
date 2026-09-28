const { MUTANTS } = await import("/home/jofre/projects/luminous_ui/scripts/mutation/mutants.ts");
console.log("MUTANTS length (from module):", MUTANTS.length);
const NEEDLES = [
  "Pokémon ex and Pokémon V",
  "Pokémon ex.",
  "each of your opponent's Pokémon",
  "isn't affected by Weakness or Resistance",
  "SPREAD_EACH_OPPONENT_POKEMON",
  "spreadDamage",
  "ignoreWR",
  "suffixPokemon",
  "snipeTargets",
  "placeSnipe",
  "damageChosen",
  "op.count",
  "snipeNote",
  "anyOf",
  "pokemonInPlay",
  "DamageMultiplier",
  "damageDefender",
];
for (const n of NEEDLES) {
  const hits = MUTANTS.filter((m: { id: string; decision: string; what: string; find: string; replace: string }) =>
    [m.id, m.decision, m.what, m.find, m.replace].join(" ").includes(n));
  console.log(`\n--- needle ${JSON.stringify(n)}: ${hits.length} rows`);
  for (const h of hits) {
    const hh = h as { id: string; decision: string; file: string; survives?: unknown };
    console.log(`    ${hh.id} [${hh.decision}] file=${hh.file} survives=${hh.survives ? JSON.stringify(hh.survives) : "-"}`);
  }
}
