import { legalAttackCorpus, resolvedByAnyReader } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus";
const corpus = legalAttackCorpus();
const units = (rows: readonly (readonly [number, string])[]) => rows.reduce((s, [n]) => s + n, 0);

const NARROW = ["Pokémon ex and Pokémon V", "Pokémon ex"];
const WIDE = [
  "Pokémon ex and Pokémon V",
  "Pokémon ex",
  "Evolution Pokémon",
  "Stage 1 Pokémon",
  "Stage 2 Pokémon",
  "Basic Pokémon",
  "Charjabug",
  "Pokémon",
];
const mk = (nouns: string[]) =>
  new RegExp(
    `^This attack does (\\d+) damage to each of your opponent['’]s (${nouns.join(
      "|",
    )})\\. This attack['’]s damage isn['’]t affected by Weakness or Resistance\\.$`,
  );

for (const [label, nouns] of [["NARROW (2 keys)", NARROW], ["WIDE (all 8 map keys)", WIDE]] as const) {
  const re = mk(nouns as string[]);
  const hit = corpus.filter(([, t]) => re.test(t));
  console.log(`${label}: ${hit.length} sentences / ${units(hit)} printings`);
  for (const [n, t] of hit) console.log(`    ${n}p  ${t}`);
}

// Cross-anchor disjointness: does any corpus row match the new anchor AND any other
// module-level anchor in effects.ts? Approximate by re-testing the three siblings.
const SIBLINGS: [string, RegExp][] = [
  ["SPREAD_EACH_OPPONENT_POKEMON", new RegExp(`^This attack does (\\d+) damage to each of your opponent['’]s Pokémon\\.(?: \\(Don['’]t apply Weakness and Resistance for Benched Pokémon\\.\\))?$`)],
  ["CHOSEN_ANY_TARGET(head)", new RegExp(`^This attack does (\\d+) damage to (\\d+) of your opponent['’]s Pokémon`)],
  ["SPREAD_EACH_BENCH(head)", /Benched Pokémon/],
];
const mine = mk(NARROW);
console.log("\ncross-anchor overlap over all 640 rows:");
for (const [name, re] of SIBLINGS) {
  const both = corpus.filter(([, t]) => mine.test(t) && re.test(t));
  console.log(`  ${name}: ${both.length}`);
}

// residue re-measure
const unbuilt = corpus.filter(([, t]) => !resolvedByAnyReader(t));
console.log(`\nRAW unbuilt: ${unbuilt.length} sentences / ${units(unbuilt)} printings`);
const built = corpus.filter(([, t]) => resolvedByAnyReader(t));
console.log(`reader-claimed: ${built.length} sentences / ${units(built)} printings`);
console.log(`corpus: ${corpus.length} sentences / ${units(corpus)} printings`);
