import * as effects from "/home/jofre/projects/luminous_ui/packages/engine/src/effects";
import { attackReaderSurface, legalAttackCorpus } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus";
const surface = attackReaderSurface();
const corpus = legalAttackCorpus();
const splitters = ["splitAttackCancelClause","splitAttackGateClause","splitAttackRequirementClause","splitAttackTrailingClause"];
function claims(s: string) {
  const out: string[] = [];
  for (const n of surface) { const f = (effects as any)[n]; let v; try { v = f(s); } catch { v = null; }
    if (v !== null && v !== undefined) out.push(n); }
  return out;
}
function splitClaims(s: string) {
  const out: string[] = [];
  for (const n of splitters) { const v = (effects as any)[n](s); if (v !== null && v !== undefined) out.push(n); }
  return out;
}

// Axes, each: [name, printedValue, nearestBuiltValue]
type Pt = { amount: string; form: string; scope: string; filter: string; tail: string };

function build(p: Pt, filterPrint: string) {
  const filter = p.filter === "P" ? filterPrint : "Pokémon";
  const scope = p.scope === "P" ? "" : "Benched ";
  const amount = p.amount === "P" ? "AMT" : "30";
  let core: string;
  if (p.form === "P") {
    core = `This attack does ${amount} damage to each of your opponent's ${scope}${filter}.`;
  } else {
    // nearest BUILT count spelling: whole-side takes " in play", bench form does not
    const loc = p.scope === "P" ? " in play" : "";
    core = `This attack does ${amount} damage for each of your opponent's ${scope}${filter}${loc}.`;
  }
  const tail = p.tail === "P"
    ? " This attack's damage isn't affected by Weakness or Resistance."
    : " (Don't apply Weakness and Resistance for Benched Pokémon.)";
  return core + tail;
}

const AX = ["amount", "form", "scope", "filter", "tail"] as const;

function run(label: string, amtPrint: string, filterPrint: string) {
  console.log(`\n############ ${label}  (amount=${amtPrint}, filter="${filterPrint}") ############`);
  const rows: { w: number; pt: Pt; changed: string[]; text: string; c: string[]; sp: string[] }[] = [];
  for (let m = 0; m < 32; m++) {
    const pt: Pt = {
      amount: m & 1 ? "B" : "P",
      form: m & 2 ? "B" : "P",
      scope: m & 4 ? "B" : "P",
      filter: m & 8 ? "B" : "P",
      tail: m & 16 ? "B" : "P",
    };
    const changed = AX.filter((a) => (pt as any)[a] === "B");
    const text = build(pt, filterPrint).replace("AMT", amtPrint);
    rows.push({ w: changed.length, pt, changed, text, c: claims(text), sp: splitClaims(text) });
  }
  const byW: Record<number, { n: number; built: number }> = {};
  for (const r of rows) { byW[r.w] ??= { n: 0, built: 0 }; byW[r.w].n++; if (r.c.length) byW[r.w].built++; }
  console.log("| axes changed | points | built |");
  console.log("|---|---:|---:|");
  for (let w = 0; w <= 5; w++) console.log(`| ${w} | ${byW[w].n} | ${byW[w].built} |`);
  console.log("\nfull table:");
  for (const r of rows.sort((a, b) => a.w - b.w)) {
    console.log(`  w=${r.w} [${r.changed.join("+") || "PRINT"}] ${r.c.length ? "BUILT:" + r.c.join(",") : "refused"}${r.sp.length ? " SPLIT:" + r.sp.join(",") : ""}\n      ${r.text}`);
  }
  // degeneracy: does flipping each axis alone ever change the verdict, over all 32 points?
  console.log("\naxis degeneracy (verdict flips caused by toggling this axis, over all 16 pairs):");
  for (let bit = 0; bit < 5; bit++) {
    let flips = 0, samestring = 0;
    for (let m = 0; m < 32; m++) {
      if (m & (1 << bit)) continue;
      const a = rows.find((r) => JSON.stringify(r.pt) === JSON.stringify({ amount: m & 1 ? "B" : "P", form: m & 2 ? "B" : "P", scope: m & 4 ? "B" : "P", filter: m & 8 ? "B" : "P", tail: m & 16 ? "B" : "P" }))!;
      const m2 = m | (1 << bit);
      const b = rows.find((r) => JSON.stringify(r.pt) === JSON.stringify({ amount: m2 & 1 ? "B" : "P", form: m2 & 2 ? "B" : "P", scope: m2 & 4 ? "B" : "P", filter: m2 & 8 ? "B" : "P", tail: m2 & 16 ? "B" : "P" }))!;
      if (a.text === b.text) samestring++;
      if ((a.c.length > 0) !== (b.c.length > 0)) flips++;
    }
    console.log(`  ${AX[bit]}: ${flips}/16 verdict flips, ${samestring}/16 pairs where the substitution changes NO BYTES (degenerate)`);
  }
}

run("ROW 539", "100", "Pokémon ex and Pokémon V");
run("ROW 616", "60", "Pokémon ex");
