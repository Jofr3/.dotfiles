import { legalAttackCorpus } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus";
const corpus = legalAttackCorpus() as unknown as [number, string][];
const variants: [string, RegExp][] = [
  ["STRICT (arity literal 1, noun literal)", new RegExp("^Discard up to (\\d+) Energy cards from your hand\\. This attack does (\\d+) damage to 1 of your opponent['’]s Pokémon for each Energy card you discarded in this way\\.(?: \\(Don['’]t apply Weakness and Resistance for Benched Pokémon\\.\\))?$")],
  ["arity CAPTURED", new RegExp("^Discard up to (\\d+) Energy cards from your hand\\. This attack does (\\d+) damage to (\\d+) of your opponent['’]s Pokémon for each Energy card you discarded in this way\\.(?: \\(Don['’]t apply Weakness and Resistance for Benched Pokémon\\.\\))?$")],
  ["zone GENERALISED (this|your Pokémon|your hand)", new RegExp("^Discard up to (\\d+) Energy cards from (?:your hand|this Pokémon|your Pokémon)\\. This attack does (\\d+) damage to 1 of your opponent['’]s Pokémon for each Energy card you discarded in this way\\.(?: \\(Don['’]t apply Weakness and Resistance for Benched Pokémon\\.\\))?$")],
  ["quantifier GENERALISED (all|N|up to N)", new RegExp("^Discard (?:all|any amount of|up to (\\d+)) Energy cards from your hand\\. This attack does (\\d+) damage to 1 of your opponent['’]s Pokémon for each Energy card you discarded in this way\\.(?: \\(Don['’]t apply Weakness and Resistance for Benched Pokémon\\.\\))?$")],
  ["count noun CAPTURED ([^.]+)", new RegExp("^Discard up to (\\d+) Energy cards from your hand\\. This attack does (\\d+) damage to 1 of your opponent['’]s Pokémon for each ([^.]+) you discarded in this way\\.(?: \\(Don['’]t apply Weakness and Resistance for Benched Pokémon\\.\\))?$")],
  ["W/R MANDATORY", new RegExp("^Discard up to (\\d+) Energy cards from your hand\\. This attack does (\\d+) damage to 1 of your opponent['’]s Pokémon for each Energy card you discarded in this way\\. \\(Don['’]t apply Weakness and Resistance for Benched Pokémon\\.\\)$")],
  ["'Energy cards?' alternation", new RegExp("^Discard up to (\\d+) Energy(?: cards)? from your hand\\. This attack does (\\d+) damage to 1 of your opponent['’]s Pokémon for each Energy card you discarded in this way\\.(?: \\(Don['’]t apply Weakness and Resistance for Benched Pokémon\\.\\))?$")],
];
for (const [label, re] of variants) {
  const hits = corpus.filter(([, t]) => re.test(t));
  console.log(`${String(hits.length).padStart(2)} sentences / ${String(hits.reduce((a,[n])=>a+n,0)).padStart(2)} printings  ${label}`);
  for (const [n, t] of hits) console.log(`      ${n}p ${JSON.stringify(t.slice(0, 90))}`);
}
