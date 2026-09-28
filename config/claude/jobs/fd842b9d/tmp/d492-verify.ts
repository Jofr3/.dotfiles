import { legalAttackCorpus } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus";
import { deriveAttackEffect } from "/home/jofre/projects/luminous_ui/packages/engine/src/effects";

const corpus = legalAttackCorpus();
const suffixCarriers = corpus.filter(([, text]) =>
  JSON.stringify(deriveAttackEffect(text) ?? []).includes("suffixPokemon"),
);
console.log("suffixCarriers:", suffixCarriers.length, "sentences /",
  suffixCarriers.reduce((n, [u]) => n + u, 0), "printings");
for (const [n, t] of suffixCarriers) console.log(`   ${n}p  ${t}`);

// D488's intersection: which numerators are green at each denominator?
const green = (den: number) =>
  [...Array(60).keys()].filter((num) => Math.round((num / den) * 100) === (den === 127 ? 19 : 20));
console.log("\nnumerators green at 19% with denominator 127:", green(127).join(","));
console.log("numerators green at 20% with denominator 123:", green(123).join(","));
const inter = green(127).filter((n) => green(123).includes(n));
console.log("intersection:", inter.join(","));
console.log("24/127 =", ((24 / 127) * 100).toFixed(2), "  24/123 =", ((24 / 123) * 100).toFixed(2));
