import { readFileSync } from "node:fs";
const src = readFileSync("/home/jofre/projects/luminous_ui/packages/engine/src/effects.ts", "utf8");
const needles = [
  "  /^Flip a coin\\. If heads, during your opponent['’]s next turn, prevent all damage from and effects of attacks done to this Pokémon\\.$/;",
  "  /^Flip a coin\\. If heads, during your opponent['’]s next turn, prevent all damage done to this Pokémon by attacks\\.$/;",
  "  /^Flip a coin\\. If tails, during your next turn, this Pokémon can['’]t attack\\.$/;",
  "  if (FLIP_PREVENT_DAMAGE.test(effect)) {",
  "  if (FLIP_PREVENT_DAMAGE_AND_EFFECTS.test(effect)) {",
  "  if (FLIP_TAILS_SELF_CANT_ATTACK.test(effect)) {",
  "        then: [{ op: \"preventDamage\", effects: true }],",
  "        then: [{ op: \"preventDamage\" }],",
  "        then: [{ op: \"preventAttack\" }],",
  "        onTails: true,",
];
for (const n of needles) {
  let c = 0, i = -1;
  while ((i = src.indexOf(n, i + 1)) >= 0) c++;
  console.log(`${String(c).padStart(3)}×  ${JSON.stringify(n.slice(0, 90))}`);
}
