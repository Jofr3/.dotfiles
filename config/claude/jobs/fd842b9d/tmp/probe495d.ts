import * as E from "/home/jofre/projects/luminous_ui/packages/engine/src/effects.ts";
const mod = E as unknown as Record<string, (s: string) => unknown>;
const T = [
 ["target",        "Flip a coin. If heads, during your opponent's next turn, the Defending Pokémon can't attack."],
 ["coin+status (built)", "Flip a coin. If heads, your opponent's Active Pokémon is now Paralyzed."],
 ["coin+draw",     "Flip a coin. If heads, draw 3 cards."],
];
for (const [k,s] of T) {
  console.log(k);
  for (const sp of ["splitAttackGateClause","splitAttackTrailingClause"]) {
    let r: unknown = null; try { r = mod[sp]?.(s) ?? null; } catch {}
    console.log("   ", sp, "=>", r ? JSON.stringify(r).slice(0,120) : "null");
  }
}
