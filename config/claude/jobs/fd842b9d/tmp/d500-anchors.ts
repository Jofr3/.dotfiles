import * as e from "/home/jofre/projects/luminous_ui/packages/engine/src/effects.ts";
type R = (t: string) => unknown;
const B = (e as unknown as Record<string, R>)["deriveAttackDamageBonus"] as R;
const M = (e as unknown as Record<string, R>)["deriveAttackDamageMultiplier"] as R;
const C = (e as unknown as Record<string, R>)["deriveAttackCoinFlip"] as R;
const probes: [string, string, R][] = [
  ["SELF_ENERGY_MULTIPLY", "This attack does 40 damage for each Basic Energy attached to this Pokémon.", M],
  ["SELF_ENERGY_SCALE (self tail)", "This attack does 40 more damage for each Basic Energy attached to this Pokémon.", B],
  ["SELF_ENERGY_SCALE (board tail)", "This attack does 30 more damage for each Basic Energy attached to all of your Pokémon.", B],
  ["SELF_ENERGY_FILTERED_SCALE", "This attack does 20 more damage for each Basic Energy attached to all of your Iono's Pokémon.", B],
  ["OPPONENT_ENERGY_SCALE", "This attack does 20 more damage for each Basic Energy attached to your opponent's Active Pokémon.", B],
  ["OPPONENT_ENERGY_MULTIPLY (active)", "This attack does 20 damage for each Basic Energy attached to your opponent's Active Pokémon.", M],
  ["OPPONENT_ENERGY_MULTIPLY (board)", "This attack does 60 damage for each Basic Energy attached to all of your opponent's Pokémon.", M],
  ["ATTACK_COIN_PER_ENERGY", "Flip a coin for each Basic Energy attached to this Pokémon. This attack does 80 damage for each heads.", C],
  ["SELF_ENERGY_ATTACHED_CLAUSE", "If this Pokémon has any Basic Energy attached, this attack does 90 more damage.", B],
];
let n = 0;
for (const [k, s, f] of probes) {
  const r = f(s);
  if (r !== null && r !== undefined) n += 1;
  console.log(`${r !== null && r !== undefined ? "RESOLVES" : "refused "}  ${k}`);
}
console.log(`\nANCHORS that now resolve the token \`Basic\`: ${n} of ${probes.length}`);
