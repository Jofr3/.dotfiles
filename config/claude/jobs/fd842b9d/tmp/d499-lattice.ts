import * as effects from "/home/jofre/projects/luminous_ui/packages/engine/src/effects.ts";
import { attackReaderSurface, legalAttackCorpus, resolvedByAnyReader } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus.ts";
const NAMES = attackReaderSurface();
const R = (n: string) => (effects as Record<string, unknown>)[n] as (t: string) => unknown;
const SPL = ["splitAttackRequirementClause","splitAttackCancelClause","splitAttackGateClause","splitAttackTrailingClause"] as const;
const corpusSet = new Set(legalAttackCorpus().map(([, t]) => t));

// ── AXES, counted from the PRINT (corpus file line 268) ──
// A: CANCEL-ARM PRESENCE  print=present   nearest BUILT "absent" -> corpus line 249 (15p, BUILT)
// B: CANCEL-ARM CONSEQUENT print="this attack does nothing"  nearest BUILT second-arm consequent
//    -> "your opponent's Active Pokémon is now Confused" (from corpus line 263, 2p, BUILT)
// C: ARM ORDER            print=tails-arm FIRST   nearest BUILT = heads-arm FIRST (line 263's shape)
const FLIP = "Flip a coin. ";
const HEADS_CONS = "during your opponent's next turn, prevent all damage from and effects of attacks done to this Pokémon";
const TAILS_PRINT = "this attack does nothing";
const TAILS_BUILT = "your opponent's Active Pokémon is now Confused";

function point(aAbsent: boolean, bBuilt: boolean, cHeadsFirst: boolean): string {
  const heads = `If heads, ${HEADS_CONS}.`;
  if (aAbsent) return `${FLIP}${heads}`;   // B and C collapse when the arm is gone
  const tails = `If tails, ${bBuilt ? TAILS_BUILT : TAILS_PRINT}.`;
  return cHeadsFirst ? `${FLIP}${heads} ${tails}` : `${FLIP}${tails} ${heads}`;
}

type Row = { w: number; a: boolean; b: boolean; c: boolean; s: string; claims: string[]; splits: string[] };
const rows: Row[] = [];
const seen = new Set<string>();
for (const a of [false, true]) for (const b of [false, true]) for (const c of [false, true]) {
  const s = point(a, b, c);
  const w = (a ? 1 : 0) + (b ? 1 : 0) + (c ? 1 : 0);
  const claims = NAMES.filter((n) => R(n)(s) !== null);
  const splits = SPL.filter((n) => ((effects as Record<string, unknown>)[n] as (t: string) => unknown)(s) !== null);
  rows.push({ w, a, b, c, s, claims, splits });
}
console.log("=== DIRECTION 1: substitute each axis onto its nearest BUILT spelling, starting FROM THE PRINT ===");
console.log("axes: A=cancel-arm ABSENT  B=cancel consequent -> built sibling  C=order -> heads-first\n");
const byW = new Map<number, { n: number; built: number }>();
const collapsed = new Set<string>();
for (const r of rows.sort((x, y) => x.w - y.w)) {
  const dup = collapsed.has(r.s); collapsed.add(r.s);
  const g = byW.get(r.w) ?? { n: 0, built: 0 }; 
  if (!dup) { g.n++; if (r.claims.length) g.built++; }
  byW.set(r.w, g);
  console.log("w=%d A=%s B=%s C=%s %s %s corpus=%s split=[%s]\n      %s",
    r.w, r.a?1:0, r.b?1:0, r.c?1:0,
    r.claims.length ? "BUILT" : "refused",
    dup ? "(COLLAPSED duplicate of an earlier point)" : "",
    corpusSet.has(r.s) ? "YES" : "no",
    r.splits.join(",") , 
    `[${r.claims.join("+") || "13/13 refused"}] ${JSON.stringify(r.s)}`);
}
console.log("\nBUILT-BY-WEIGHT (distinct points): %s",
  [...byW.entries()].sort((a,b)=>a[0]-b[0]).map(([w,g])=>`${w}: ${g.built}/${g.n}`).join(" · "));
