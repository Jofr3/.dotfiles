import * as effects from "/home/jofre/projects/luminous_ui/packages/engine/src/effects.ts";
import { attackReaderSurface, legalAttackCorpus } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus.ts";
const NAMES = attackReaderSurface();
const R = (n: string) => (effects as Record<string, unknown>)[n] as (t: string) => unknown;
const corpusSet = new Set(legalAttackCorpus().map(([, t]) => t));
function ask(s: string) {
  const c = NAMES.filter((n) => R(n)(s) !== null);
  return { c, v: c.length ? JSON.stringify(R(c[0]!)(s)) : "null" };
}
// DIRECTION 2: hold the CANCEL arm at the PRINT, substitute the HEADS consequent onto
// each nearest BUILT spelling drawn from the same printed ^Flip a coin. If heads, family.
const HEADS_ALTS: [string, string][] = [
  ["PRINT (line 249, 15p)", "during your opponent's next turn, prevent all damage from and effects of attacks done to this Pokémon"],
  ["line 248, 4p  durated prevent (damage only)", "during your opponent's next turn, prevent all damage done to this Pokémon by attacks"],
  ["line 250, 1p  durated attack-lock", "during your opponent's next turn, the Defending Pokémon can't attack"],
  ["line 247, 12p NON-durated discard", "discard an Energy from your opponent's Active Pokémon"],
  ["line 265, 27p NON-durated status", "your opponent's Active Pokémon is now Paralyzed"],
  ["line 253, 20p damage bonus (deriveAttackCoinFlip)", "this attack does 20 more damage"],
];
console.log("=== DIRECTION 2: cancel arm HELD at the print, HEADS consequent substituted ===");
for (const [label, cons] of HEADS_ALTS) {
  const bare = `Flip a coin. If heads, ${cons}.`;
  const full = `Flip a coin. If tails, this attack does nothing. If heads, ${cons}.`;
  const b = ask(bare), f = ask(full);
  console.log("\n%s", label);
  console.log("  bare  corpus=%s %s  %s", corpusSet.has(bare)?"YES":"no ", (b.c.join("+")||"REFUSED").padEnd(22), b.v.slice(0,110));
  console.log("  +cancel corpus=%s %s  %s", corpusSet.has(full)?"YES":"no ", (f.c.join("+")||"REFUSED").padEnd(22), f.v.slice(0,110));
}
// And the mirror: cancel arm held, but spelled as the SECOND clause
console.log("\n=== mirror: cancel arm SECOND ===");
for (const [label, cons] of HEADS_ALTS) {
  const s = `Flip a coin. If heads, ${cons}. If tails, this attack does nothing.`;
  const a = ask(s);
  console.log("  %s -> %s", label.padEnd(46), a.c.join("+") || "REFUSED");
}
// And: what does the shipped TWO-ARMED gate (line 263) derive to?
console.log("\n=== the shipped two-armed gates ===");
for (const t of legalAttackCorpus().map(([, x]) => x).filter((t) => /^Flip a coin\. If (heads|tails),/.test(t) && /If (heads|tails),/.test(t.slice(20)))) {
  const a = ask(t);
  console.log("  [%s] %s\n     -> %s", a.c.join("+") || "REFUSED", t, a.v);
}
