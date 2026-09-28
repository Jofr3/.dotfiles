import * as effects from "/home/jofre/projects/luminous_ui/packages/engine/src/effects.ts";
const { deriveAttackDamageMultiplier: M, deriveAttackDamageBonus: B, deriveAttackCoinFlip: C, deriveAttackRequirement: R } = effects as unknown as Record<string,(t:string)=>unknown>;
const probes: [string,string][] = [
  ["target",            "This attack does 40 damage for each Basic Energy attached to this Pokémon."],
  ["target + ` card`",  "This attack does 40 damage for each Basic Energy card attached to this Pokémon."],
  ["{C} still LOUD",    "This attack does 40 damage for each {C} Energy attached to this Pokémon."],
  ["junk still LOUD",   "This attack does 40 damage for each Fancy Energy attached to this Pokémon."],
  ["additive Basic",    "This attack does 40 more damage for each Basic Energy attached to this Pokémon."],
  ["Iono's Basic",      "This attack does 20 more damage for each Basic Energy attached to all of your Iono's Pokémon."],
  ["your board Basic",  "This attack does 30 more damage for each Basic Energy attached to all of your Pokémon."],
  ["opp board Basic",   "This attack does 60 damage for each Basic Energy attached to all of your opponent's Pokémon."],
  ["opp active Basic",  "This attack does 20 damage for each Basic Energy attached to your opponent's Active Pokémon."],
];
for (const [k,s] of probes) {
  console.log(`${k.padEnd(20)} MULT=${JSON.stringify(M(s))}  BONUS=${JSON.stringify(B(s))}`);
}
console.log("\nCOIN  Basic:", JSON.stringify(C("Flip a coin for each Basic Energy attached to this Pokémon. This attack does 80 damage for each heads.")));
console.log("COIN  {C}  :", JSON.stringify(C("Flip a coin for each {C} Energy attached to this Pokémon. This attack does 80 damage for each heads.")));
console.log("\nGATE Basic:", JSON.stringify(B("If this Pokémon has any Basic Energy attached, this attack does 90 more damage.")));
console.log("GATE Special:", JSON.stringify(B("If this Pokémon has any Special Energy attached, this attack does 90 more damage.")));
