import { attackReaderSurface, resolvedByAnyReader, legalAttackCorpus } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus";
import * as effects from "/home/jofre/projects/luminous_ui/packages/engine/src/effects";

const S = attackReaderSurface();
console.log("SURFACE COUNT =", S.length);
for (const n of S) console.log("  ", n);

const TARGET = "Discard the top card of each player's deck. This attack does 140 more damage for each Energy card discarded in this way.";
const corpus = legalAttackCorpus();
const row = corpus.find(([, s]) => s === TARGET);
console.log("\nCORPUS ROW FOUND =", row !== undefined, "printings =", row?.[0]);
console.log("resolvedByAnyReader(TARGET) =", resolvedByAnyReader(TARGET));
console.log("\nPER-READER on TARGET:");
for (const n of S) {
  const f = (effects as unknown as Record<string, (t: string) => unknown>)[n];
  let v: unknown;
  try { v = f(TARGET); } catch (e) { v = `THREW ${String(e)}`; }
  console.log(`  ${n} => ${JSON.stringify(v)}`);
}

// splitters
const gate = (effects as any).splitAttackGateClause?.(TARGET) ?? null;
const trail = (effects as any).splitAttackTrailingClause?.(TARGET) ?? null;
console.log("\nsplitAttackGateClause =", JSON.stringify(gate));
console.log("splitAttackTrailingClause =", JSON.stringify(trail));
const req = (effects as any).splitAttackRequirementClause?.(TARGET) ?? null;
const can = (effects as any).splitAttackCancelClause?.(TARGET) ?? null;
console.log("splitAttackRequirementClause =", JSON.stringify(req));
console.log("splitAttackCancelClause =", JSON.stringify(can));
