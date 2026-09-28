import { legalAttackCorpus } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus";
const rows = new Map(legalAttackCorpus().map(([n, t]) => [t, n]));
const S = {
  PRINTED: "This attack does 30 damage to each of your opponent's Pokémon. (Don't apply Weakness and Resistance for Benched Pokémon.)",
  CHOSEN_ONE: "This attack does 30 damage to 1 of your opponent's Pokémon. (Don't apply Weakness and Resistance for Benched Pokémon.)",
  BENCH_ONLY: "This attack does 30 damage to each of your opponent's Benched Pokémon. (Don't apply Weakness and Resistance for Benched Pokémon.)",
  BENCH_ALSO: "This attack also does 30 damage to each of your opponent's Benched Pokémon. (Don't apply Weakness and Resistance for Benched Pokémon.)",
  OWN_BENCH_ALSO: "This attack also does 30 damage to each of your Benched Pokémon. (Don't apply Weakness and Resistance for Benched Pokémon.)",
  EX_FILTERED: "This attack does 60 damage to each of your opponent's Pokémon ex. This attack's damage isn't affected by Weakness or Resistance.",
  EX_V_FILTERED: "This attack does 100 damage to each of your opponent's Pokémon ex and Pokémon V. This attack's damage isn't affected by Weakness or Resistance.",
};
for (const [k, v] of Object.entries(S)) console.log(k, "=>", rows.get(v) ?? "ABSENT");
