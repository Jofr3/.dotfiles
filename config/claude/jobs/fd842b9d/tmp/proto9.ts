import { rows, builds } from "/home/jofre/projects/luminous_ui/scripts/residue-census";
import { legalAttackCorpus, resolvedByAnyReader } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus";
import * as effects from "/home/jofre/projects/luminous_ui/packages/engine/src/effects";
const corpus = legalAttackCorpus();
const built = corpus.filter(([, t]) => builds(t)).map(([, t]) => t);
const opaque = rows.filter((r) => r.cls === "OPAQUE");
function readersOf(text: string): string[] {
  const out: string[] = [];
  for (const [name, fn] of Object.entries(effects)) {
    if (!name.startsWith("deriveAttack") || typeof fn !== "function") continue;
    let v: unknown; try { v = (fn as any)(text); } catch { continue; }
    if (v !== null && v !== undefined) out.push(name);
  }
  return out;
}
// token-level Levenshtein
function dist(a: string[], b: string[]): number {
  const m = a.length, n = b.length;
  let prev = new Array(n+1).fill(0).map((_,j)=>j);
  for (let i=1;i<=m;i++){ const cur=[i]; for(let j=1;j<=n;j++){ cur[j]=Math.min(prev[j]+1, cur[j-1]+1, prev[j-1]+(a[i-1]===b[j-1]?0:1)); } prev=cur; }
  return prev[n];
}
const tally: Record<string,[number,number]> = {};
const lines: string[] = [];
for (const r of opaque) {
  const a = r.text.split(" ");
  let bestD = Infinity, bestT = "";
  for (const b0 of built) { const d = dist(a, b0.split(" ")); if (d < bestD) { bestD = d; bestT = b0; } }
  const rd = readersOf(bestT);
  const key = rd.length ? rd.join("+") : "(splitter/registry)";
  const t = tally[key] ?? [0,0]; t[0]++; t[1]+=r.units; tally[key]=t;
  lines.push(`d=${String(bestD).padStart(2)} ${key.replace(/deriveAttack/g,"")}  :: ${r.text.slice(0,55)}  →  ${bestT.slice(0,55)}`);
}
console.log("=== NEAREST BUILT SENTENCE, by the READER that claims it ===");
for (const [k,v] of Object.entries(tally).sort((a,b)=>b[1][0]-a[1][0])) console.log(`  ${String(v[0]).padStart(2)} / ${String(v[1]).padStart(3)}p  ${k.replace(/deriveAttack/g,"")}`);
console.log("\n=== DISTANCE HISTOGRAM ===");
const h: Record<number,number> = {};
for (const l of lines) { const d = Number(/d=\s*(\d+)/.exec(l)![1]); h[d]=(h[d]??0)+1; }
console.log(Object.entries(h).sort((a,b)=>Number(a[0])-Number(b[0])).map(([d,c])=>`  d=${d.padStart(2)}  ${c}`).join("\n"));
console.log("\n"+lines.join("\n"));
