import * as effects from "/home/jofre/projects/luminous_ui/packages/engine/src/effects.ts";
import { resolvedByAnyReader, attackReaderSurface } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus.ts";

const ROWS: [string, string][] = [
  [":342", "If you have exactly 1 Prize card remaining, your opponent's Active Pokémon is now Paralyzed."],
  [":343", "If you have more Prize cards remaining than your opponent, this attack does 90 more damage."],
  [":346", "If you use this attack when you have exactly 1 Prize card remaining, you win this game."],
  [":350", "If your opponent doesn't have exactly 3 or 4 Prize cards remaining, this attack does nothing."],
  [":353", "If your opponent has 4 or fewer Prize cards remaining, this attack does 70 more damage."],
  ["consequent", "Your opponent's Active Pokémon is now Paralyzed."],
];
console.log("READER SURFACE:", attackReaderSurface().length, attackReaderSurface().join(", "));
for (const [tag, text] of ROWS) {
  console.log("\n===", tag, JSON.stringify(text));
  console.log("  resolvedByAnyReader:", resolvedByAnyReader(text));
  for (const [name, fn] of Object.entries(effects)) {
    if (!name.startsWith("deriveAttack") || typeof fn !== "function") continue;
    let out: unknown;
    try { out = (fn as (t: string) => unknown)(text); } catch (e) { console.log(`  ${name} THREW`, e); continue; }
    if (out === null || out === undefined) continue;
    console.log(`  ${name} →`, JSON.stringify(out));
  }
  console.log("  gate:", JSON.stringify(effects.splitAttackGateClause(text)));
  console.log("  trailing:", JSON.stringify(effects.splitAttackTrailingClause(text)));
  const rq = (effects as any).splitAttackRequirementClause;
  if (typeof rq === "function") console.log("  requirement:", JSON.stringify(rq(text)));
}
