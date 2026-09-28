import { legalAttackCorpus } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus";
const corpus = legalAttackCorpus();
const HEAD = `^This attack does (\\d+) damage to each of your opponent['’]s Pokémon\\.`;
const TAIL = `(?: \\(Don['’]t apply Weakness and Resistance for Benched Pokémon\\.\\))?$`;
const V: Record<string, RegExp> = {
  shipped: new RegExp(HEAD + TAIL),
  also: new RegExp(`^This attack (?:also )?does (\\d+) damage to each of your opponent['’]s Pokémon\\.` + TAIL),
  possessive: new RegExp(`^This attack does (\\d+) damage to each of (?:your opponent['’]s|your) Pokémon\\.` + TAIL),
  noDollar: new RegExp(HEAD + `(?: \\(Don['’]t apply Weakness and Resistance for Benched Pokémon\\.\\))?`),
  noCaret: new RegExp(`This attack does (\\d+) damage to each of your opponent['’]s Pokémon\\.` + TAIL),
  mandatoryParen: new RegExp(`^This attack does (\\d+) damage to each of your opponent['’]s Pokémon\\. \\(Don['’]t apply Weakness and Resistance for Benched Pokémon\\.\\)$`),
};
for (const [k, re] of Object.entries(V)) {
  const hits = corpus.filter(([, s]) => re.test(s));
  console.log(k, "=>", hits.length, "sentence(s) /", hits.reduce((a, [n]) => a + n, 0), "printing(s)");
  for (const [n, s] of hits) if (!s.startsWith("This attack does 30 damage to each of your opponent's Pok")) console.log("   EXTRA:", n, s);
}
