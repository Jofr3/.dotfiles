import * as effects from "/home/jofre/projects/luminous_ui/packages/engine/src/effects";
import { legalAttackCorpus, resolvedByAnyReader } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus";
import { programFor, registryCardIds } from "/home/jofre/projects/luminous_ui/packages/engine/src/registry";
const corpus = legalAttackCorpus() as unknown as [number, string][];
const split = (effects as any).splitAttackGateClause, splitT = (effects as any).splitAttackTrailingClause;
// canonical residue predicate approximation: reader OR gate-split OR trailing-split
function served(t: string): boolean {
  if (resolvedByAnyReader(t)) return true;
  const g = split(t); if (g !== null && g.body !== "" && resolvedByAnyReader(g.body)) return true;
  const s = splitT(t); if (s !== null) return true;
  return false;
}
const residue = corpus.filter(([, t]) => !served(t));
console.log("residue (reader+2 splitters):", residue.length, "sentences /", residue.reduce((a, [n]) => a + n, 0), "printings");
console.log("\n=== residue rows mentioning 'your hand' ===");
for (const [n, t] of residue) if (/your hand/.test(t)) console.log(`${n}p  ${JSON.stringify(t)}`);
console.log("\n=== residue rows with a CHOSEN target ('to 1 of your opponent' or 'to N of') ===");
for (const [n, t] of residue) if (/to \d+ of your opponent|to 1 of your/.test(t)) console.log(`${n}p  ${JSON.stringify(t)}`);
console.log("\n=== residue rows with 'discarded in this way' / 'in this way' ===");
for (const [n, t] of residue) if (/in this way/.test(t)) console.log(`${n}p  ${JSON.stringify(t)}`);
console.log("\n=== residue rows with 'Discard' AND 'for each' ===");
for (const [n, t] of residue) if (/Discard/i.test(t) && /for each/i.test(t)) console.log(`${n}p  ${JSON.stringify(t)}`);
