import * as E from "/home/jofre/projects/luminous_ui/packages/engine/src/effects.ts";
const mod = E as unknown as Record<string, (s: string) => unknown>;
console.log("bare lock  =>", JSON.stringify(mod["deriveAttackEffect"]("During your opponent's next turn, the Defending Pokémon can't attack.")));
console.log("coin+status=>", JSON.stringify(mod["deriveAttackEffect"]("Flip a coin. If heads, your opponent's Active Pokémon is now Paralyzed.")));
console.log("coin+bare  =>", JSON.stringify(mod["deriveAttackEffect"]("Flip a coin. If heads, during your opponent's next turn, the Defending Pokémon can't attack.")));
