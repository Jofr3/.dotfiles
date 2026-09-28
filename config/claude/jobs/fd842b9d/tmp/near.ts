import * as effects from "/home/jofre/projects/luminous_ui/packages/engine/src/effects";
import { attackReaderSurface, legalAttackCorpus, resolvedByAnyReader } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus";
const names = attackReaderSurface();
const mod = effects as unknown as Record<string, (t: string) => unknown>;
const corpus = legalAttackCorpus();

function claims(text: string): string[] {
  return names.filter((n) => mod[n]!(text) !== null);
}

console.log("### A) corpus sentences containing ' in this way,' — built?");
for (const [p, s] of corpus) {
  if (s.includes(" in this way,")) {
    console.log(`  [${p}p] ${resolvedByAnyReader(s) ? "BUILT   " : "refused "} ${s}`);
  }
}
console.log("\n### B) corpus sentences containing 'Move an Energy' / 'move an Energy'");
for (const [p, s] of corpus) {
  if (/[Mm]ove an Energy/.test(s)) {
    console.log(`  [${p}p] ${resolvedByAnyReader(s) ? "BUILT   " : "refused "} ${s}`);
  }
}
console.log("\n### C) corpus sentences containing 'onto your Bench' AND 'in this way'");
for (const [p, s] of corpus) {
  if (s.includes("onto your Bench") && s.includes("in this way")) {
    console.log(`  [${p}p] ${resolvedByAnyReader(s) ? "BUILT   " : "refused "} ${s}`);
  }
}
console.log("\n### D) probes");
for (const t of [
  "Move an Energy from this Pokémon to 1 of your Benched Pokémon.",
  "Move an Energy from this Pokémon to the new Benched Pokémon.",
  "move an Energy from this Pokémon to 1 of your Benched Pokémon.",
  "If you put any Pokémon onto your Bench in this way, this Pokémon is now Poisoned.",
  "If you attached Energy to a Pokémon in this way, this Pokémon is now Poisoned.",
]) {
  console.log(`  ${JSON.stringify(t)}\n    -> ${JSON.stringify(claims(t))}`);
}
