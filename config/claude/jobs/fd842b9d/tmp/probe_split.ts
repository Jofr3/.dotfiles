const B = "/home/jofre/projects/luminous_ui/packages/engine/src/";
const eff = await import(B + "effects");
const P = "Flip a coin. If heads, your opponent's Active Pokémon is now Paralyzed and Poisoned. If tails, your opponent's Active Pokémon is now Confused.";
const c = P + " Draw a card.";
console.log("derive:", eff.deriveAttackEffect(c));
console.log("split:", JSON.stringify(eff.splitAttackTrailingClause(c)));
