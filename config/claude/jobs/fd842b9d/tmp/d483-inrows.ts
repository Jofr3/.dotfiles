import { legalAttackCorpus, resolvedByAnyReader } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus";
const PATTERNS = [
  /[Ss]earch your deck for.*Energy card.*attach/,
  /[Aa]ttach.*Energy card.*from your.*discard pile/,
  /[Ll]ook at the top/,
  /[Pp]ut.*from your discard pile/,
  /use it as this attack/,
  /deck for a card that evolves/,
  /[Pp]revent all damage.*by attacks from/,
  /ttach.*Energy card.*from your hand/,
];
const NEW = [
  "Discard all Energy from this Pokémon, and this attack does 210 damage to 1 of your opponent's Benched Pokémon ex. (Don't apply Weakness and Resistance for Benched Pokémon.)",
  "This attack does 60 damage to 1 of your opponent's Benched Pokémon ex or Benched Pokémon V. (Don't apply Weakness and Resistance for Benched Pokémon.)",
];
for (const s of NEW) console.log(`matches=${PATTERNS.filter((p) => p.test(s)).length}  ${s.slice(0, 70)}…`);
const unbuilt = legalAttackCorpus().filter(([, t]) => !resolvedByAnyReader(t));
console.log("unbuiltAttack sentences:", unbuilt.length);
for (const inRows of [24]) {
  console.log(`  ${inRows}/139 = ${(inRows/139*100).toFixed(2)}% → ${Math.round(inRows/139*100)}`);
  console.log(`  ${inRows}/137 = ${(inRows/137*100).toFixed(2)}% → ${Math.round(inRows/137*100)}`);
}
