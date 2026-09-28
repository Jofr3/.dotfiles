import { builds } from "/home/jofre/projects/luminous_ui/scripts/residue-census.ts";
import * as effects from "/home/jofre/projects/luminous_ui/packages/engine/src/effects";
const A = "You may search your deck for any number of Fennel cards, reveal them, and put them into your hand. Then, shuffle your deck.";
const B = "You may search your deck for any number of Basic Lillie's Pokémon and put them onto your Bench. Then, shuffle your deck.";
for (const [label, s] of [["657 Fennel", A], ["656 Lillie", B]] as const) {
  console.log(`--- ${label} --- builds=${builds(s)}`);
  const claims: string[] = [];
  for (const [name, fn] of Object.entries(effects)) {
    if (!name.startsWith("deriveAttack") || typeof fn !== "function") continue;
    let out: unknown;
    try { out = (fn as (t: string) => unknown)(s); } catch (e) { claims.push(`${name} THREW`); continue; }
    if (out === null || out === undefined) continue;
    claims.push(`${name} -> ${JSON.stringify(out)}`);
  }
  console.log("  readers:", claims.length === 0 ? "(none)" : claims.join(" | "));
  console.log("  gateSplit:", JSON.stringify(effects.splitAttackGateClause(s)));
  console.log("  trailSplit:", JSON.stringify(effects.splitAttackTrailingClause(s)));
}
