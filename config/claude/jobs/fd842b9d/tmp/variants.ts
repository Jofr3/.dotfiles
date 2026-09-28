import { legalAttackCorpus } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus";
const corpus = legalAttackCorpus();
const WR = `(?: \\(Don['’]t apply Weakness and Resistance for Benched Pokémon\\.\\))?`;
const WRM = ` \\(Don['’]t apply Weakness and Resistance for Benched Pokémon\\.\\)`;
const SCALE = " for each Prize card your opponent has taken";
const variants: Record<string, RegExp> = {
  "narrow (also optional, opponent spelled, W/R optional)": new RegExp(
    `^This attack (?:also )?does (\\d+) damage to each of your opponent['’]s Benched Pokémon${SCALE}\\.${WR}$`,
  ),
  "wide: possessive captured": new RegExp(
    `^This attack (?:also )?does (\\d+) damage to each of (your opponent['’]s|your) Benched Pokémon${SCALE}\\.${WR}$`,
  ),
  "narrow-also: `also` MANDATORY": new RegExp(
    `^This attack also does (\\d+) damage to each of your opponent['’]s Benched Pokémon${SCALE}\\.${WR}$`,
  ),
  "no-also: the word REFUSED": new RegExp(
    `^This attack does (\\d+) damage to each of your opponent['’]s Benched Pokémon${SCALE}\\.${WR}$`,
  ),
  "W/R MANDATORY": new RegExp(
    `^This attack (?:also )?does (\\d+) damage to each of your opponent['’]s Benched Pokémon${SCALE}\\.${WRM}$`,
  ),
  "scale clause OPTIONAL (the mutant)": new RegExp(
    `^This attack (?:also )?does (\\d+) damage to each of your opponent['’]s Benched Pokémon(?:${SCALE})?\\.${WR}$`,
  ),
};
for (const [name, re] of Object.entries(variants)) {
  const hit = corpus.filter(([, t]) => re.test(t));
  const units = hit.reduce((s, [n]) => s + n, 0);
  console.log(`${name.padEnd(52)} ${hit.length} sentence(s) / ${units} printing(s)`);
  for (const [n, t] of hit) console.log(`      ${n}p  ${t}`);
}
// apostrophe codepoints in the print
const P = corpus.find(([, t]) => t.includes("for each Prize card your opponent has taken") && t.includes("each of"))![1];
console.log("\nprint:", JSON.stringify(P));
console.log("apostrophe codepoints:", [...P].map((c, i) => [i, c]).filter(([, c]) => c === "'" || c === "’").map(([i, c]) => `${i}:U+${(c as string).codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}`).join(" "));
