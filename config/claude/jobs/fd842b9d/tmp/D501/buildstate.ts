import * as effects from "/home/jofre/projects/luminous_ui/packages/engine/src/effects.ts";
import { attackReaderSurface, legalAttackCorpus, resolvedByAnyReader } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus.ts";

type Reader = (t: string) => unknown;
const NAMES = attackReaderSurface();
console.log(`READER SURFACE (${NAMES.length}): ${NAMES.join(", ")}`);

const SPLITTERS = [
  "splitAttackRequirementClause",
  "splitAttackCancelClause",
  "splitAttackGateClause",
  "splitAttackTrailingClause",
] as const;

const E = effects as unknown as Record<string, Reader>;

const HEAD = "Your opponent's Active Pokémon is now Confused.";
const TAIL = "Put 8 damage counters instead of 3 on that Pokémon for this Special Condition.";
const FULL = `${HEAD} ${TAIL}`;
const P2 = "Your opponent's Active Pokémon is now Poisoned. During Pokémon Checkup, put 2 damage counters on that Pokémon instead of 1.";
const P8 = "Your opponent's Active Pokémon is now Poisoned. During Pokémon Checkup, put 8 damage counters on that Pokémon instead of 1.";
const POISON_HEAD = "Your opponent's Active Pokémon is now Poisoned.";

const STRINGS: [string, string][] = [
  ["FULL PRINT (corpus line 685)", FULL],
  ["TAIL alone", TAIL],
  ["HEAD alone (corpus line 683)", HEAD],
  ["POISON 2 (corpus line 688)", P2],
  ["POISON 8 (corpus line 689)", P8],
  ["POISON HEAD (corpus line 687)", POISON_HEAD],
];

for (const [label, s] of STRINGS) {
  const claims: string[] = [];
  for (const n of NAMES) {
    const r = E[n];
    if (typeof r !== "function") { console.log(`  !! ${n} is not a function`); continue; }
    let v: unknown;
    try { v = r(s); } catch (e) { v = `THREW ${(e as Error).message}`; }
    if (v !== null) claims.push(`${n} => ${JSON.stringify(v)}`);
  }
  const sp: string[] = [];
  for (const n of SPLITTERS) {
    const f = E[n];
    let v: unknown;
    try { v = f(s); } catch (e) { v = `THREW ${(e as Error).message}`; }
    if (v !== null && v !== undefined) sp.push(`${n} => ${JSON.stringify(v)}`);
  }
  console.log(`\n=== ${label}`);
  console.log(`    ${JSON.stringify(s)}`);
  console.log(`    readers claiming: ${claims.length}/${NAMES.length}${claims.length ? "\n      " + claims.join("\n      ") : "  → REFUSED " + NAMES.length + "/" + NAMES.length}`);
  console.log(`    splitters: ${sp.length ? "\n      " + sp.join("\n      ") : "none of 4"}`);
  console.log(`    resolvedByAnyReader: ${resolvedByAnyReader(s)}`);
}

// corpus membership + printing counts
const corpus = legalAttackCorpus();
console.log(`\n=== CORPUS MEMBERSHIP / PRINTINGS`);
for (const [label, s] of STRINGS) {
  const row = corpus.find(([, t]) => t === s);
  console.log(`  ${label}: ${row ? `IS a corpus row, ${row[0]} printing(s)` : "NOT in corpus"}`);
}
console.log(`  corpus size: ${corpus.length} sentences / ${corpus.reduce((a, [n]) => a + n, 0)} printings`);
