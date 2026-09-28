import { MUTANTS } from "/home/jofre/projects/luminous_ui/scripts/mutation/mutants";
console.log("corpus size:", MUTANTS.length);
const needles = [
  "takeFlips", "AttackFlipCount", "ATTACK_COIN_PER_ENERGY", "ATTACK_COIN_PER_BODY_IN_PLAY",
  "attachedEnergy", "pokemonInPlay", "countAttachedEnergy", "bothActivesEnergyCount",
  "deriveAttackCoinFlip", "fix-bothactives", "Twin Flip", "both Active Pokémon",
  "selfEnergyScaling", "inPlayFlipCount", "MAX_PRINTED_FLIPS", "flips",
];
for (const n of needles) {
  const hits = MUTANTS.filter((m) => JSON.stringify(m).includes(n));
  console.log(`\n### ${n}: ${hits.length}`);
  for (const h of hits) {
    const where: string[] = [];
    if (h.id.includes(n)) where.push("id");
    if ((h.what ?? "").includes(n)) where.push("what");
    if (h.find.includes(n)) where.push("FIND");
    if (h.replace.includes(n)) where.push("REPLACE");
    if ((h.expectKilledBy ?? []).join(" ").includes(n)) where.push("killer");
    if (JSON.stringify(h.survives ?? "").includes(n)) where.push("survives");
    if (h.file.includes(n)) where.push("file");
    console.log(`  ${h.id}  [${h.file}]  ${where.join(",")}`);
  }
}
