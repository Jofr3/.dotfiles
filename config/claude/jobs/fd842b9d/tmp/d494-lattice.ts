import { attackReaderSurface } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus.ts";
import * as E from "/home/jofre/projects/luminous_ui/packages/engine/src/effects.ts";
const names = attackReaderSurface();
const mod = E as unknown as Record<string, unknown>;
type R = (s: string) => unknown;
function claimers(s: string): string[] {
  const out: string[] = [];
  for (const n of names) { let v: unknown; try { v = (mod[n] as R)(s); } catch { continue; } if (v !== null && v !== undefined) out.push(n); }
  return out;
}
const SPL = ["splitAttackRequirementClause","splitAttackCancelClause","splitAttackGateClause","splitAttackTrailingClause"];
function splitters(s: string): string[] {
  const out: string[] = [];
  for (const n of SPL) { let v: unknown; try { v = (mod[n] as R)(s); } catch { continue; } if (v !== null && v !== undefined) out.push(n); }
  return out;
}

// AXES, counted from the PRINT (row 337).
// 0 = the PRINTED value, 1 = the nearest BUILT spelling.
const QUANT = ["3 or more", "at least 3"];          // built spelling: corpus line 341's clause literal
const TYPE  = ["Energy", "{D} Energy"];             // built spelling: corpus line 341
const AMT   = ["70", "50"];                         // built spelling: corpus line 341's printed amount
const TAIL  = [
  " This attack's damage isn't affected by Weakness.",              // 0 = PRINTED
  " This attack's damage isn't affected by Weakness or Resistance.",// 1 = nearest BUILT tail (corpus 627, 2p)
  "",                                                              // 2 = ABSENT (row 341's shape)
];
const TAILNAME = ["W-only(print)", "W-or-R(built)", "absent(built-row-shape)"];

function point(q: number, t: number, a: number, tl: number): string {
  return `If you have ${QUANT[q]} ${TYPE[t]} in play, this attack does ${AMT[a]} more damage.${TAIL[tl]}`;
}

console.log("READERS:", names.length);
console.log();
type Row = { w: number; q: number; t: number; a: number; tl: number; s: string; c: string[]; sp: string[] };
const rows: Row[] = [];
for (let q = 0; q < 2; q++) for (let t = 0; t < 2; t++) for (let a = 0; a < 2; a++) for (let tl = 0; tl < 3; tl++) {
  const s = point(q, t, a, tl);
  // Hamming weight against the PRINT: TAIL counts 1 if changed at all
  const w = q + t + a + (tl === 0 ? 0 : 1);
  rows.push({ w, q, t, a, tl, s, c: claimers(s), sp: splitters(s) });
}
rows.sort((x, y) => x.w - y.w || x.q - y.q || x.t - y.t || x.a - y.a || x.tl - y.tl);
let lastW = -1;
for (const r of rows) {
  if (r.w !== lastW) { console.log(`\n===== Hamming weight ${r.w} =====`); lastW = r.w; }
  const axes = `Q=${QUANT[r.q]}${r.q?"*":" "} | T=${TYPE[r.t]}${r.t?"*":" "} | A=${AMT[r.a]}${r.a?"*":" "} | TAIL=${TAILNAME[r.tl]}`;
  const verdict = r.c.length ? "BUILT by " + r.c.join("+") : "REFUSED " + names.length + "/" + names.length;
  console.log(`  ${axes}`);
  console.log(`    ${verdict}${r.sp.length ? "   splitters: " + r.sp.join(",") : ""}`);
}
console.log();
const byW: Record<number, [number, number]> = {};
for (const r of rows) { const k = r.w; byW[k] ??= [0, 0]; byW[k][0]++; if (r.c.length) byW[k][1]++; }
console.log("| axes changed | points | built |");
console.log("|---|---:|---:|");
for (const k of Object.keys(byW).map(Number).sort((a,b)=>a-b)) console.log(`| ${k} | ${byW[k][0]} | ${byW[k][1]} |`);
