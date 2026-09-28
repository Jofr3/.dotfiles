import * as effects from "/home/jofre/projects/luminous_ui/packages/engine/src/effects";
import { attackReaderSurface } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus";
const R = attackReaderSurface();
const test = (t: string) => {
  const c = R.filter((n) => (effects as any)[n](t) !== null);
  console.log(`${c.length ? "BUILT[" + c.join(",") + "]" : "unread"}  :: ${t}`);
  if (c.length) console.log("     " + JSON.stringify((effects as any)[c[0]!](t)));
};
test("This attack's damage isn't affected by Weakness or Resistance.");
test("This attack does 60 damage to each of your opponent's Pokémon ex. (Don't apply Weakness and Resistance for Benched Pokémon.)");
test("This attack does 60 damage to each of your opponent's Pokémon. This attack's damage isn't affected by Weakness or Resistance.");
test("This attack does 60 damage to each of your opponent's Pokémon.");
test("This attack does 30 damage to each of your opponent's Pokémon. (Don't apply Weakness and Resistance for Benched Pokémon.)");
test("This attack does 60 damage to 1 of your opponent's Benched Pokémon or Benched Pokémon. (Don't apply Weakness and Resistance for Benched Pokémon.)");
test("This attack does 60 damage to 1 of your opponent's Benched Pokémon ex. (Don't apply Weakness and Resistance for Benched Pokémon.)");
console.log("--- splitters on the two spread rows ---");
for (const t of [
  "This attack does 60 damage to each of your opponent's Pokémon ex. This attack's damage isn't affected by Weakness or Resistance.",
  "This attack does 100 damage to each of your opponent's Pokémon ex and Pokémon V. This attack's damage isn't affected by Weakness or Resistance.",
]) {
  console.log(t);
  console.log("  gate:", JSON.stringify((effects as any).splitAttackGateClause?.(t) ?? null));
  console.log("  trail:", JSON.stringify((effects as any).splitAttackTrailingClause?.(t) ?? null));
}
console.log("--- corpus rows ending with that exact W/R sentence ---");
