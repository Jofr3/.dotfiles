import * as effects from "/home/jofre/projects/luminous_ui/packages/engine/src/effects";
import { attackReaderSurface, legalAttackCorpus, resolvedByAnyReader } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus";
const names = attackReaderSurface(); const E = effects as any;
const split = E.splitAttackTrailingClause as (t:string)=>any;
function claims(s:string){return names.filter(n=>(E[n] as any)(s)!==null);}
function verdict(s:string){ const c=claims(s); const sp=split(s);
  return c.length? `BUILDS [${c.join(",")}]` : (sp? `COMPOSES head=${JSON.stringify(sp.head)}` : "REFUSED 13/13, split null"); }

// ── HEADS: printed value + nearest BUILT substitutions (each a real corpus row where possible)
const HEADS: [string,string,string][] = [
  ["H0 printed (Cynthia multiplier head, corpus line 529's head)","This attack does 10 damage for each damage counter on all of your Benched Cynthia's Pokémon.","BUILT: deriveAttackDamageMultiplier"],
  ["H1 an EFFECT head that BUILDS (corpus line 613's head)","This attack does 50 damage to each of your opponent's Benched Pokémon.","BUILT: deriveAttackEffect"],
  ["H2 the shipped ignoreWR head (corpus line 616's head)","This attack does 60 damage to each of your opponent's Pokémon ex.","BUILT: deriveAttackEffect"],
  ["H3 a BONUS head that BUILDS","This attack does 30 more damage for each Prize card you have taken.","?"],
  ["H4 the OTHER Weakness-only row's head (corpus line 337's head)","If you have 3 or more Energy in play, this attack does 70 more damage.","?"],
];
const TAILS: [string,string][] = [
  ["T0 printed (bare Weakness)","This attack's damage isn't affected by Weakness."],
  ["T1 nearest BUILT suppression (corpus line 627)","This attack's damage isn't affected by Weakness or Resistance."],
  ["T2 nearest BUILT suppression, Resistance-only (corpus line 625)","This attack's damage isn't affected by Resistance."],
  ["T3 nearest BUILT deriveAttackEffect tail","Draw 3 cards."],
];

console.log("=== HEADS ALONE ===");
for (const [l,s] of HEADS) console.log(`  ${l}\n     ${JSON.stringify(s)}\n     -> ${verdict(s)}`);
console.log("\n=== TAILS ALONE ===");
for (const [l,s] of TAILS) console.log(`  ${l}\n     ${JSON.stringify(s)}\n     -> ${verdict(s)}`);

console.log("\n=== THE 5x4 LATTICE (head x tail), joined by '. ' ===");
console.log("head\\tail".padEnd(10) + TAILS.map(([l])=>l.slice(0,2)).map(x=>x.padEnd(34)).join(""));
for (const [hl,hs] of HEADS) {
  const cells = TAILS.map(([,ts]) => { const s = hs + " " + ts; const c = claims(s); const sp = split(s);
    return (c.length? "BUILD["+c[0]!.replace("deriveAttack","")+"]" : sp? "COMPOSE" : "REFUSED").padEnd(34); });
  console.log(hl.slice(0,2).padEnd(10) + cells.join(""));
}

console.log("\n=== HAMMING-WEIGHT TABLE for corpus line 529 ===");
console.log("Axes counted FROM THE PRINT (D489), keeping only axes whose printed value does NOT already build (D491):");
const H0 = HEADS[0]![1], T0 = TAILS[0]![1], T1 = TAILS[1]![1], T3 = TAILS[3]![1];
const pts: [number,string,string][] = [
  [0, "print (H0 . T0)", H0 + " " + T0],
  [1, "TAIL-OBJECT substituted (H0 . T1)", H0 + " " + T1],
  [1, "TAIL-SEAM substituted (H0 . T3)", H0 + " " + T3],
  [2, "both substituted == TAIL-SEAM (degenerate)", H0 + " " + T3],
];
for (const [w,l,s] of pts) console.log(`  w=${w}  ${l}\n        -> ${verdict(s)}`);
console.log("  w=ALL (both segments dropped; head alone) -> " + verdict(H0));
console.log("  w=ALL (both segments dropped; tail alone) -> " + verdict(T0));

console.log("\n=== D492's BOTH-DIRECTIONS check applied to corpus line 337 (the other Weakness-only row) ===");
const R337 = "If you have 3 or more Energy in play, this attack does 70 more damage. This attack's damage isn't affected by Weakness.";
console.log("  whole  -> " + verdict(R337));
console.log("  head   -> " + verdict(HEADS[4]![1]));
console.log("  head + T1 (W-or-R) -> " + verdict(HEADS[4]![1] + " " + T1));
console.log("  head + T3 (effect tail) -> " + verdict(HEADS[4]![1] + " " + T3));
for (const alt of [
  "If you have 3 or more Energy in play, this attack does 70 more damage.",
  "If your opponent's Active Pokémon is a Pokémon ex, this attack does 70 more damage.",
  "This attack does 70 more damage for each Energy in play.",
  "If you have 3 or more Energy attached to this Pokémon, this attack does 70 more damage.",
  "If you have 3 or more Pokémon in play, this attack does 70 more damage.",
]) console.log(`  HEAD-AXIS PROBE ${JSON.stringify(alt)}\n        -> ${verdict(alt)}`);
