import { attackReaderSurface, legalAttackCorpus } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus";
import * as effects from "/home/jofre/projects/luminous_ui/packages/engine/src/effects";

const E = effects as unknown as Record<string, (t: string) => unknown>;
const NAMES = attackReaderSurface();

function claiming(t: string): string[] {
  return NAMES.filter((n) => E[n]!(t) !== null);
}

// The FIVE axes, derived by diffing the print against D488's built mill+scale
// (corpus line 126) — each substituted onto its nearest BUILT spelling, D489's rule.
type Axis = { name: string; printed: string; built: string };
const AXES: Axis[] = [
  { name: "MILL-SIDE",  printed: "each player's", built: "your" },
  { name: "COUNT",      printed: "the top card of", built: "the top 3 cards of" },
  { name: "JOINER",     printed: "deck. This attack", built: "deck, and this attack" },
  { name: "FOLD",       printed: "140 more damage", built: "140 damage" },
  { name: "POSSESSOR",  printed: "Energy card discarded", built: "Energy card you discarded" },
];

const PRINT =
  "Discard the top card of each player's deck. This attack does 140 more damage for each Energy card discarded in this way.";

function point(mask: number): string {
  let s = PRINT;
  for (let i = 0; i < AXES.length; i++) {
    const a = AXES[i]!;
    if ((mask >> i) & 1) {
      if (!s.includes(a.printed)) throw new Error(`axis ${a.name}: printed fragment absent from ${s}`);
      s = s.replace(a.printed, () => a.built);
    }
  }
  return s;
}
// sanity: the print itself must be reproduced at mask 0 and be the corpus row
if (point(0) !== PRINT) throw new Error("mask 0 is not the print");
if (!legalAttackCorpus().some(([, s]) => s === PRINT)) throw new Error("PRINT is not a corpus row");

const rows: { w: number; mask: number; s: string; readers: string[] }[] = [];
for (let mask = 0; mask < 1 << AXES.length; mask++) {
  const s = point(mask);
  rows.push({ w: popcount(mask), mask, s, readers: claiming(s) });
}
function popcount(n: number) { let c = 0; while (n) { c += n & 1; n >>= 1; } return c; }

console.log("AXES (from the PRINT):");
AXES.forEach((a, i) => console.log(`  ${i}: ${a.name.padEnd(10)} "${a.printed}" -> "${a.built}"`));
console.log("\n=== LATTICE by Hamming weight (2^5 x 13 readers) ===");
for (let w = 0; w <= AXES.length; w++) {
  const at = rows.filter((r) => r.w === w);
  const built = at.filter((r) => r.readers.length > 0);
  console.log(`weight ${w}: points ${at.length}, built ${built.length}`);
  for (const b of built) {
    const which = AXES.filter((_, i) => (b.mask >> i) & 1).map((a) => a.name).join("+");
    console.log(`    [${which}] -> ${b.readers.join(",")}`);
    console.log(`       "${b.s}"`);
    console.log(`       ${JSON.stringify(E.deriveAttackEffect!(b.s))}`);
  }
}
console.log("\nTOTAL built points:", rows.filter((r) => r.readers.length > 0).length, "of", rows.length);

// ── separately: the D403-direction substitution for JOINER+FOLD (a period + "more"
// IS built, on the bench-discard head), asked as its own probe.
console.log("\n=== D403-direction probes (period joiner + 'more' kept) ===");
for (const s of [
  // all axes onto D488 except FOLD/JOINER left printed, with the bench head instead:
  "You may discard up to 2 Energy from your Benched Pokémon. This attack does 140 more damage for each Energy card discarded in this way.",
  "You may discard up to 2 Energy from your Benched Pokémon. This attack does 140 more damage for each card you discarded in this way.",
  "Discard the top 3 cards of your deck. This attack does 140 more damage for each Energy card you discarded in this way.",
  "Discard the top 3 cards of your deck. This attack does 140 damage for each Energy card you discarded in this way.",
]) console.log(`  ${JSON.stringify(claiming(s))}  "${s}"`);
