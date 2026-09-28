import {
  attackReaderSurface,
  legalAttackCorpus,
  resolvedByAnyReader,
} from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus";
import * as effects from "/home/jofre/projects/luminous_ui/packages/engine/src/effects";

const A_FULL =
  "Your opponent reveals their hand. Discard all Item cards and Pokémon Tool cards you find there.";
const A_HEAD = "Your opponent reveals their hand.";
const A_TAIL = "Discard all Item cards and Pokémon Tool cards you find there.";
const B_FULL =
  "Your opponent's Active Pokémon is now Confused. Put 8 damage counters instead of 3 on that Pokémon for this Special Condition.";
const B_HEAD = "Your opponent's Active Pokémon is now Confused.";
const B_TAIL = "Put 8 damage counters instead of 3 on that Pokémon for this Special Condition.";

const READER_NAMES = attackReaderSurface();
console.log("reader surface length:", READER_NAMES.length);
console.log("readers:", READER_NAMES.join(", "));

const readers: Array<[string, (t: string) => unknown]> = READER_NAMES.map((n) => [
  n,
  (effects as unknown as Record<string, (t: string) => unknown>)[n],
]);

function driveAll(label: string, text: string) {
  console.log(`\n=== ${label} ===\n${text}`);
  let any = false;
  for (const [name, fn] of readers) {
    if (typeof fn !== "function") {
      console.log(`  ${name}: NOT A FUNCTION ON effects (${typeof fn})`);
      continue;
    }
    const out = fn(text);
    if (out !== null && out !== undefined) {
      any = true;
      console.log(`  ✅ ${name} → ${JSON.stringify(out)}`);
    }
  }
  if (!any) console.log("  🛑 no reader claims it (13/13 null)");
  console.log(`  resolvedByAnyReader = ${resolvedByAnyReader(text)}`);
  console.log(`  splitAttackGateClause = ${JSON.stringify(effects.splitAttackGateClause(text))}`);
  console.log(
    `  splitAttackTrailingClause = ${JSON.stringify(effects.splitAttackTrailingClause(text))}`,
  );
}

for (const [l, t] of [
  ["A FULL", A_FULL],
  ["A HEAD", A_HEAD],
  ["A TAIL", A_TAIL],
  ["B FULL", B_FULL],
  ["B HEAD", B_HEAD],
  ["B TAIL", B_TAIL],
] as const) {
  driveAll(l, t);
}

// population check
const corpus = legalAttackCorpus();
for (const [l, t] of [
  ["A", A_FULL],
  ["B", B_FULL],
] as const) {
  const row = corpus.find((r) => r.text === t);
  console.log(`\n${l} corpus row:`, row ? JSON.stringify(row) : "NOT FOUND");
}
