import * as effects from "/home/jofre/projects/luminous_ui/packages/engine/src/effects";
import { attackReaderSurface, legalAttackCorpus, resolvedByAnyReader } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus";
const surface = attackReaderSurface();
const corpus = legalAttackCorpus() as unknown as [number, string][];
function claimers(s: string) {
  const out: string[] = [];
  for (const n of surface) { let v: unknown; try { v = (effects as any)[n](s); } catch { v = null; } if (v !== null && v !== undefined) out.push(n); }
  return out;
}
console.log("row0:", JSON.stringify(corpus[0]));
const TARGET = "Discard up to 3 Energy cards from your hand. This attack does 60 damage to 1 of your opponent's Pokémon for each Energy card you discarded in this way. (Don't apply Weakness and Resistance for Benched Pokémon.)";
console.log("TARGET in corpus:", corpus.some((r) => r[1] === TARGET), "printings:", corpus.find(r=>r[1]===TARGET)?.[0]);

console.log("\n=== corpus rows mentioning 'discarded in this way' ===");
for (const [n, t] of corpus) {
  if (t.includes("discarded in this way") || t.includes("you discarded")) {
    console.log(`${n}p  built=${resolvedByAnyReader(t)}  [${claimers(t).join(",")}]  ${JSON.stringify(t)}`);
  }
}
console.log("\n=== corpus rows with 'from your hand' AND 'Discard' ===");
for (const [n, t] of corpus) {
  if (/Discard/.test(t) && /from your hand/.test(t)) {
    console.log(`${n}p  built=${resolvedByAnyReader(t)}  [${claimers(t).join(",")}]  ${JSON.stringify(t)}`);
  }
}
console.log("\n=== corpus rows with 'damage to 1 of your opponent' AND 'for each' ===");
for (const [n, t] of corpus) {
  if (/damage to 1 of your opponent/.test(t) && /for each/i.test(t)) {
    console.log(`${n}p  built=${resolvedByAnyReader(t)}  [${claimers(t).join(",")}]  ${JSON.stringify(t)}`);
  }
}
