import * as effects from "/home/jofre/projects/luminous_ui/packages/engine/src/effects";
import { resolvedByAnyReader, legalAttackCorpus } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus";
const corpus = legalAttackCorpus();
const raw = corpus.filter(([, t]) => !resolvedByAnyReader(t));
const residue = raw.filter(([, t]) => {
  const g = (effects as any).splitAttackGateClause(t);
  if (g !== null && g.body !== "" && resolvedByAnyReader(g.body)) return false;
  return (effects as any).splitAttackTrailingClause(t) === null;
});
const P = (rows: readonly (readonly [number,string])[]) => `${rows.length} sentences / ${rows.reduce((s,[n])=>s+n,0)} printings`;
console.log("RAW reader refusal :", P(raw));
console.log("RESIDUE (gate+trailing subtracted; registry NOT):", P(residue));

console.log("\n=== BRANCH A — a PARKABLE pre-damage seam. Residue rows printing a 'before doing damage' clause: ===");
const a = residue.filter(([, t]) => /[Bb]efore doing damage/.test(t));
for (const [n,t] of a) console.log(`  ${n}p ${JSON.stringify(t)}`);
console.log("  SOLO PAYOFF CEILING:", P(a));

console.log("\n=== BRANCH B — a DESTINATION narrowing on attachFromHand ('to this Pokémon'). Residue rows that attach from hand: ===");
const b = residue.filter(([, t]) => /attach[^.]*from your hand/i.test(t));
for (const [n,t] of b) console.log(`  ${n}p ${JSON.stringify(t)}`);
console.log("  SOLO PAYOFF CEILING:", P(b));

console.log("\n=== BRANCH C — recompute the scaling after the pre-damage hook. Residue rows carrying BOTH a scaling clause and a pre-damage clause: ===");
const c = residue.filter(([, t]) => /[Bb]efore doing damage/.test(t) && /for each/i.test(t));
for (const [n,t] of c) console.log(`  ${n}p ${JSON.stringify(t)}`);
console.log("  SOLO PAYOFF CEILING:", P(c));

console.log("\n=== Cross-check: which SHIPPED (built) corpus rows would Branch C's reorder move? ===");
const built = corpus.filter(([, t]) => resolvedByAnyReader(t));
const dual = built.filter(([, t]) => (effects as any).deriveAttackPreDamage(t) !== null &&
  ((effects as any).deriveAttackDamageBonus(t) !== null || (effects as any).deriveAttackDamageMultiplier(t) !== null || (effects as any).deriveAttackDamagePenalty(t) !== null));
console.log("  built rows claimed by a preDamage reader AND a scaling reader:", P(dual));
const pre = built.filter(([, t]) => (effects as any).deriveAttackPreDamage(t) !== null);
console.log("  built rows claimed by deriveAttackPreDamage at all:", P(pre));
for (const [n,t] of pre) {
  const sc = ["deriveAttackDamageBonus","deriveAttackDamageMultiplier","deriveAttackDamagePenalty"].filter((k)=>(effects as any)[k](t)!==null);
  console.log(`    ${n}p scaling readers=[${sc.join(",")}]  ${t.slice(0,60)}...`);
}
