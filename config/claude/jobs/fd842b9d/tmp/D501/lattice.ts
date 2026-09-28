import * as effects from "/home/jofre/projects/luminous_ui/packages/engine/src/effects.ts";
import { attackReaderSurface, legalAttackCorpus } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus.ts";

type Reader = (t: string) => unknown;
const E = effects as unknown as Record<string, Reader>;
const NAMES = attackReaderSurface();
const SPLITTERS = ["splitAttackRequirementClause","splitAttackCancelClause","splitAttackGateClause","splitAttackTrailingClause"] as const;

function claimants(s: string): string[] {
  const out: string[] = [];
  for (const n of NAMES) { let v: unknown; try { v = E[n](s); } catch { v = null; } if (v !== null && v !== undefined) out.push(n); }
  return out;
}
function splitters(s: string): string[] {
  const out: string[] = [];
  for (const n of SPLITTERS) { let v: unknown; try { v = E[n](s); } catch { v = null; } if (v !== null && v !== undefined) out.push(n); }
  return out;
}
/** "built" = claimed WHOLE by a reader, or served by a splitter. */
function built(s: string): boolean { return claimants(s).length > 0 || splitters(s).length > 0; }

// ── AXES, counted from the PRINT, each substituted onto its nearest BUILT spelling.
// 0 = the PRINT's value, 1 = the nearest BUILT spelling (corpus line 689).
// S status | T timing-prefix(+verb case) | P position of the "instead of" phrase
// D the DEFAULT value inside it | R the trailing "for this Special Condition"
// N (COUNT 8) is checked for degeneracy separately below.
function point(bits: number, count = 8): string {
  const S = (bits >> 4) & 1, T = (bits >> 3) & 1, P = (bits >> 2) & 1, D = (bits >> 1) & 1, R = bits & 1;
  const status = S ? "Poisoned" : "Confused";
  const timing = T ? "During Pokémon Checkup, put" : "Put";
  const dflt = D ? "1" : "3";
  const insteadMid = P ? "" : ` instead of ${dflt}`;
  const insteadEnd = P ? ` instead of ${dflt}` : "";
  const trail = R ? "" : " for this Special Condition";
  return `Your opponent's Active Pokémon is now ${status}. ${timing} ${count} damage counters${insteadMid} on that Pokémon${insteadEnd}${trail}.`;
}

const PRINT = point(0b00000);
const BUILT_END = point(0b11111);
console.log(`PRINT  (0b00000): ${PRINT}`);
console.log(`ENDPT  (0b11111): ${BUILT_END}`);
const corpus = legalAttackCorpus();
console.log(`print === corpus 685 ? ${corpus.some(([,t]) => t === PRINT)}`);
console.log(`endpt === corpus 689 ? ${corpus.some(([,t]) => t === BUILT_END)}`);

// DEGENERACY of the COUNT axis: substitute 8 -> the sibling's other printed count (2),
// on the otherwise-BUILT endpoint and on the PRINT.
console.log(`\n— COUNT axis degeneracy —`);
for (const c of [8, 2]) {
  console.log(`  endpoint@${c}: built=${built(point(0b11111, c))}  print@${c}: built=${built(point(0b00000, c))}`);
}

// The full 2^5 lattice.
const byWeight = new Map<number, { total: number; built: number; builtPoints: string[] }>();
for (let b = 0; b < 32; b++) {
  const w = ((b >> 4) & 1) + ((b >> 3) & 1) + ((b >> 2) & 1) + ((b >> 1) & 1) + (b & 1);
  const s = point(b);
  const ok = built(s);
  const rec = byWeight.get(w) ?? { total: 0, built: 0, builtPoints: [] };
  rec.total++; if (ok) { rec.built++; rec.builtPoints.push(`${b.toString(2).padStart(5, "0")} ${claimants(s).join("+") || splitters(s).join("+")}  ${s}`); }
  byWeight.set(w, rec);
}
console.log(`\n— BUILT-BY-WEIGHT (axes substituted toward the BUILT sibling) —`);
const vec: string[] = [];
for (let w = 0; w <= 5; w++) {
  const r = byWeight.get(w)!;
  vec.push(`${r.built}/${r.total}`);
  console.log(`  weight ${w}: ${r.built}/${r.total} built`);
  for (const p of r.builtPoints) console.log(`      ${p}`);
}
console.log(`  VECTOR: ${vec.join(" · ")}`);
