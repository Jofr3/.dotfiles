import { rows, builds } from "/home/jofre/projects/luminous_ui/scripts/residue-census";
import { legalAttackCorpus } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus";
const corpus = legalAttackCorpus();
const built = corpus.filter(([, t]) => builds(t)).map(([, t]) => t);
const opaque = rows.filter((r) => r.cls === "OPAQUE");
const norm = (t: string) => t.toLowerCase().replace(/[.,;:()"]/g, "");
function grams(text: string, n: number): Set<string> {
  const tok = text.split(" ").map(norm).filter((x) => x !== "");
  const out = new Set<string>();
  for (let i = 0; i + n <= tok.length; i++) out.add(tok.slice(i, i + n).join(" "));
  return out;
}
type Row = { g: string; o: number; ou: number; b: number };
const acc = new Map<string, Row>();
for (const n of [1,2,3,4]) {
  for (const r of opaque) for (const g of grams(r.text, n)) {
    const e = acc.get(g) ?? { g, o: 0, ou: 0, b: 0 };
    e.o++; e.ou += r.units; acc.set(g, e);
  }
}
for (const b of built) for (const n of [1,2,3,4]) for (const g of grams(b, n)) {
  const e = acc.get(g); if (e) e.b++;
}
const blockers = [...acc.values()].filter((e) => e.b === 0 && e.o >= 2).sort((a,b)=>b.o-a.o || a.g.length-b.g.length);
console.log("=== n-grams present in >=2 OPAQUE rows and ZERO built sentences ===");
for (const e of blockers.slice(0, 60)) console.log(`  ${String(e.o).padStart(2)} rows / ${String(e.ou).padStart(3)}p   «${e.g}»`);
