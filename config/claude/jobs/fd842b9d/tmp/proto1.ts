import { rows, builds } from "/home/jofre/projects/luminous_ui/scripts/residue-census";
import { legalAttackCorpus } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus";

const corpus = legalAttackCorpus();
const built = corpus.filter(([, t]) => builds(t)).map(([, t]) => t);
const opaque = rows.filter((r) => r.cls === "OPAQUE");
console.log("OPAQUE rows:", opaque.length, "printings:", opaque.reduce((s, r) => s + r.units, 0));

// AXIS 1: substitution with SUBMAX raised — how big is the region really?
function substSize(text: string, max: number): { size: number; from: string; to: string; onto: string } | null {
  const a = text.split(" ");
  let best: any = null;
  for (const b0 of built) {
    const b = b0.split(" ");
    let p = 0;
    while (p < a.length && p < b.length && a[p] === b[p]) p++;
    let s = 0;
    while (s < a.length - p && s < b.length - p && a[a.length - 1 - s] === b[b.length - 1 - s]) s++;
    const fromLen = a.length - p - s, toLen = b.length - p - s;
    if (fromLen === 0 && toLen === 0) continue;
    if (fromLen > max || toLen > max) continue;
    if (fromLen === 0 || toLen === 0) continue;
    const size = fromLen + toLen;
    if (best === null || size < best.size) best = { size, from: a.slice(p, p+fromLen).join(" "), to: b.slice(p, p+toLen).join(" "), onto: b0 };
  }
  return best;
}
// AXIS 2: pure INSERTION — residue is a built sentence with tokens MISSING
function insertion(text: string, max: number): { at: number; ins: string; onto: string } | null {
  const a = text.split(" ");
  let best: any = null;
  for (const b0 of built) {
    const b = b0.split(" ");
    let p = 0;
    while (p < a.length && p < b.length && a[p] === b[p]) p++;
    let s = 0;
    while (s < a.length - p && s < b.length - p && a[a.length-1-s] === b[b.length-1-s]) s++;
    const fromLen = a.length - p - s, toLen = b.length - p - s;
    if (fromLen !== 0 || toLen === 0 || toLen > max) continue;
    if (best === null || toLen < best.len) best = { at: p, ins: b.slice(p, p+toLen).join(" "), onto: b0, len: toLen };
  }
  return best;
}
let n1 = 0, n2 = 0;
const wide: string[] = [];
for (const r of opaque) {
  const s = substSize(r.text, 40);
  const i = insertion(r.text, 40);
  if (s) { n1++; wide.push(`SUBST-${s.size}  «${s.from}» → «${s.to}»   :: ${r.text.slice(0,60)}`); }
  if (i) { n2++; }
}
console.log("reachable by a wider substitution (SUBMAX 40):", n1);
console.log("reachable by a pure INSERTION:", n2);
console.log(wide.slice(0, 25).join("\n"));
