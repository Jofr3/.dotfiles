import * as effects from "/home/jofre/projects/luminous_ui/packages/engine/src/effects";
import { attackReaderSurface, resolvedByAnyReader } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus";
const surface = attackReaderSurface();
const T = "Discard up to 3 Energy cards from your hand. This attack does 60 damage to 1 of your opponent's Pokémon for each Energy card you discarded in this way. (Don't apply Weakness and Resistance for Benched Pokémon.)";
type Axis = { name: string; apply: (s: string) => string };
const AXES: Axis[] = [
  { name: "FILTER",  apply: (s) => s.replace("3 Energy cards", "3 {G} Energy cards") },
  { name: "ZONE",    apply: (s) => s.replace("from your hand", "from your Pokémon") },
  { name: "CHOSEN",  apply: (s) => s.replace(" to 1 of your opponent's Pokémon", "") },
  { name: "COUNTN",  apply: (s) => s.replace("for each Energy card you discarded", "for each card you discarded") },
  { name: "WR",      apply: (s) => s.replace(" (Don't apply Weakness and Resistance for Benched Pokémon.)", "") },
];
function claimers(s: string) {
  const out: string[] = [];
  for (const n of surface) { let v: unknown; try { v = (effects as any)[n](s); } catch { v = null; } if (v !== null && v !== undefined) out.push(n); }
  return out;
}
const results: { mask: number; names: string[]; built: boolean; who: string[]; text: string }[] = [];
for (let m = 0; m < 32; m++) {
  let s = T; const names: string[] = [];
  for (let i = 0; i < 5; i++) if (m & (1 << i)) { s = AXES[i].apply(s); names.push(AXES[i].name); }
  const who = claimers(s);
  results.push({ mask: m, names, built: who.length > 0, who, text: s });
}
console.log("=== ALL 32 AXIS COMBINATIONS (5 axes) ===");
for (const r of results.sort((a, b) => a.names.length - b.names.length || a.mask - b.mask)) {
  console.log(`${r.built ? "BUILD " : "refuse"} [${r.names.length}] ${r.names.join("+") || "(none = PRINTED)"}  ${r.who.join(",")}`);
}
console.log("\n=== minimal building sets ===");
const builds = results.filter((r) => r.built);
for (const b of builds) {
  const minimal = !builds.some((o) => o !== b && o.names.length < b.names.length && o.names.every((n) => b.names.includes(n)));
  if (minimal) {
    console.log(`MINIMAL: ${b.names.join("+")}`);
    console.log(`   ${JSON.stringify(b.text)}`);
    for (const n of b.who) console.log(`   ${n} => ${JSON.stringify((effects as any)[n](b.text))}`);
  }
}
