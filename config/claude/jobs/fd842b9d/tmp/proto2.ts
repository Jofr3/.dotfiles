import { rows, builds } from "/home/jofre/projects/luminous_ui/scripts/residue-census";
import { legalAttackCorpus } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus";
const corpus = legalAttackCorpus();
const built = corpus.filter(([, t]) => builds(t)).map(([, t]) => t);
const opaque = rows.filter((r) => r.cls === "OPAQUE");
function substSize(text: string, max: number) {
  const a = text.split(" ");
  let best: number | null = null;
  for (const b0 of built) {
    const b = b0.split(" ");
    let p = 0; while (p < a.length && p < b.length && a[p] === b[p]) p++;
    let s = 0; while (s < a.length - p && s < b.length - p && a[a.length-1-s] === b[b.length-1-s]) s++;
    const f = a.length - p - s, t = b.length - p - s;
    if (f === 0 || t === 0) continue;
    if (f > max || t > max) continue;
    const size = f + t;
    if (best === null || size < best) best = size;
  }
  return best;
}
for (const max of [4,5,6,7,8,10,12]) {
  let n = 0, u = 0;
  for (const r of opaque) if (substSize(r.text, max) !== null) { n++; u += r.units; }
  console.log(`SUBMAX ${String(max).padStart(2)}  reaches ${String(n).padStart(3)} / ${u} of the 78 OPAQUE`);
}
// two-span deletion (disjoint), each span <= 6 tokens
function twoSpan(text: string, maxLen: number): [string,string] | null {
  const tok = text.split(" ");
  for (let l1 = 1; l1 <= maxLen; l1++)
  for (let i = 0; i + l1 <= tok.length; i++)
  for (let l2 = 1; l2 <= maxLen; l2++)
  for (let j = i + l1; j + l2 <= tok.length; j++) {
    const kept = [...tok.slice(0,i), ...tok.slice(i+l1, j), ...tok.slice(j+l2)].join(" ");
    if (builds(kept)) return [tok.slice(i,i+l1).join(" "), tok.slice(j,j+l2).join(" ")];
  }
  return null;
}
let t2 = 0; const t2rows: string[] = [];
for (const r of opaque) { const h = twoSpan(r.text, 6); if (h) { t2++; t2rows.push(`«${h[0]}» + «${h[1]}»  :: ${r.text.slice(0,70)}`); } }
console.log(`\nTWO-SPAN deletion (each <= 6 tok): ${t2} rows`);
console.log(t2rows.join("\n"));
