import * as effects from "/home/jofre/projects/luminous_ui/packages/engine/src/effects";
import { attackReaderSurface, resolvedByAnyReader, legalAttackCorpus } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus";
const R = attackReaderSurface();
const claims = (s: string) => R.filter((n) => ((effects as any)[n] as (t:string)=>unknown)(s) !== null);
const corpus = legalAttackCorpus();
console.log("=== corpus rows mentioning 'from your hand to this Pokémon' ===");
for (const [n, t] of corpus) {
  if (/from your hand to (this|1 of your)/.test(t)) {
    console.log(`${n}p  built=${resolvedByAnyReader(t)}  [${claims(t).join(",")}]  ${JSON.stringify(t)}`);
  }
}
console.log("\n=== corpus rows with 'any number of' ===");
for (const [n, t] of corpus) if (/any number of/.test(t)) console.log(`${n}p built=${resolvedByAnyReader(t)} [${claims(t).join(",")}] ${JSON.stringify(t)}`);
console.log("\n=== corpus rows starting 'Before doing damage' or containing 'before doing damage' ===");
for (const [n, t] of corpus) if (/[Bb]efore doing damage/.test(t)) console.log(`${n}p built=${resolvedByAnyReader(t)} [${claims(t).join(",")}] ${JSON.stringify(t)}`);
console.log("\n=== corpus rows with 'you may attach' ===");
for (const [n, t] of corpus) if (/you may attach/i.test(t)) console.log(`${n}p built=${resolvedByAnyReader(t)} [${claims(t).join(",")}] ${JSON.stringify(t)}`);
