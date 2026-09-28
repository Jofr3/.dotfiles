import { rows, builds } from "/home/jofre/projects/luminous_ui/scripts/residue-census";
import { legalAttackCorpus } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus";
const corpus = legalAttackCorpus();
const built = corpus.filter(([, t]) => builds(t)).map(([, t]) => t);
const opaque = rows.filter((r) => r.cls === "OPAQUE");

// re-implement segments() identically to residue-census.ts
function segments(text: string): string[] {
  const out: string[] = []; let depth = 0, start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "(") depth++; else if (c === ")") depth = Math.max(0, depth - 1);
    if (depth !== 0) continue;
    if (c !== "." && c !== ")") continue;
    const gap = /^\s+/.exec(text.slice(i + 1)); if (gap === null) continue;
    const next = text[i + 1 + gap[0].length] ?? "";
    if (!/[A-Z(]/.test(next)) continue;
    out.push(text.slice(start, i + 1)); start = i + 1 + gap[0].length;
  }
  out.push(text.slice(start));
  return out.filter((s) => s.length > 0);
}
const tally: Record<string, number> = {};
const detail: string[] = [];
for (const r of opaque) {
  const segs = segments(r.text);
  const b = segs.map((s) => builds(s));
  const m = b.filter(Boolean).length;
  const key = segs.length === 1 ? "SINGLE" : `SEG${segs.length}-${m}built`;
  tally[key] = (tally[key] ?? 0) + 1;
  if (segs.length > 1) detail.push(`${key}  ${b.map(x=>x?"B":".").join("")}  :: ${r.text.slice(0,80)}`);
}
console.log("=== SEGMENT ANATOMY ===");
for (const k of Object.keys(tally).sort()) console.log(`  ${k.padEnd(14)} ${tally[k]}`);
console.log(detail.join("\n"));

// NOVEL TOKEN probe
const norm = (t:string)=>t.toLowerCase().replace(/[.,;:()"]/g,"");
const builtTokens = new Set<string>();
for (const b of built) for (const t of b.split(" ")) builtTokens.add(norm(t));
console.log("\n=== NOVEL TOKENS (appear in NO built corpus sentence) ===");
const novelCount: Record<string, number> = {};
let noNovel = 0;
for (const r of opaque) {
  const nov = [...new Set(r.text.split(" ").map(norm))].filter((t) => t !== "" && !builtTokens.has(t));
  if (nov.length === 0) { noNovel++; continue; }
  for (const n of nov) novelCount[n] = (novelCount[n] ?? 0) + 1;
}
console.log("rows with ZERO novel tokens:", noNovel, "of", opaque.length);
console.log(Object.entries(novelCount).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`${v} ${k}`).join("\n"));
