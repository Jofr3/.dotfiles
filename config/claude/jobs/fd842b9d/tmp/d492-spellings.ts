import * as effects from "/home/jofre/projects/luminous_ui/packages/engine/src/effects";
import { attackReaderSurface, legalAttackCorpus, resolvedByAnyReader } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus";
const surface = attackReaderSurface();
const corpus = legalAttackCorpus();
function claims(s: string) {
  const out: string[] = [];
  for (const n of surface) { const f = (effects as any)[n]; let v; try { v = f(s); } catch { v = null; }
    if (v !== null && v !== undefined) out.push(n); }
  return out;
}
function val(s: string) {
  const o: Record<string, unknown> = {};
  for (const n of surface) { const f = (effects as any)[n]; let v; try { v = f(s); } catch { v = null; }
    if (v !== null && v !== undefined) o[n] = v; }
  return o;
}
const CAND = [
  "This attack's damage isn't affected by Weakness or Resistance.",
  "This attack does 100 damage to each of your opponent's Pokémon ex and Pokémon V.",
  "This attack does 60 damage to each of your opponent's Pokémon ex.",
  "This attack does 100 damage to each of your opponent's Pokémon.",
  "This attack does 100 damage to each of your opponent's Pokémon. (Don't apply Weakness and Resistance for Benched Pokémon.)",
  "This attack does 100 damage to each of your opponent's Benched Pokémon.",
  "This attack does 100 damage to each of your opponent's Benched Pokémon ex and Pokémon V.",
  "This attack does 100 damage for each of your opponent's Pokémon ex and Pokémon V in play.",
  "This attack does 100 damage to each of your opponent's Pokémon ex and Pokémon V. (Don't apply Weakness and Resistance for Benched Pokémon.)",
  "This attack does 100 damage to 1 of your opponent's Pokémon ex and Pokémon V. This attack's damage isn't affected by Weakness or Resistance.",
  "This attack does 100 damage to 1 of your opponent's Pokémon. This attack's damage isn't affected by Weakness or Resistance.",
  "This attack does 100 damage to each of your opponent's Pokémon ex. This attack's damage isn't affected by Weakness or Resistance.",
  "This attack does 60 damage to each of your opponent's Pokémon ex and Pokémon V. This attack's damage isn't affected by Weakness or Resistance.",
];
for (const c of CAND) {
  const cs = claims(c);
  const inCorpus = corpus.find((r: any) => r[1] === c);
  console.log(`${cs.length ? "BUILT  " : "REFUSED"} [corpus:${inCorpus ? inCorpus[0] + "p" : "-"}] ${JSON.stringify(c)}`);
  if (cs.length) console.log(`        -> ${JSON.stringify(val(c))}`);
}
// enumerate every corpus row containing "each of your opponent's" and its build state
console.log("\n=== corpus rows: /each of your opponent's/ ===");
for (const [p, t] of corpus as any) {
  if (t.includes("each of your opponent's")) console.log(`${resolvedByAnyReader(t) ? "BUILT " : "UNBLT "} ${p}p  ${t}`);
}
console.log("\n=== corpus rows: /Pokémon ex/ or /Pokémon V/ ===");
for (const [p, t] of corpus as any) {
  if (/Pokémon ex|Pokémon V/.test(t)) console.log(`${resolvedByAnyReader(t) ? "BUILT " : "UNBLT "} ${p}p  ${t}`);
}
console.log("\n=== corpus rows: /isn't affected by Weakness or Resistance/ ===");
for (const [p, t] of corpus as any) {
  if (t.includes("isn't affected by Weakness or Resistance")) console.log(`${resolvedByAnyReader(t) ? "BUILT " : "UNBLT "} ${p}p  ${t}`);
}
