// Is the survivor a SUITE gap or an INERT row (D450)? Compute what the mutation
// would answer on §2's board, from the code rather than from the row's prose.
import { FIXTURE_POOL } from "/home/jofre/projects/luminous_ui/packages/engine/src/testFixtures.ts";
import { ANY_ENERGY } from "/home/jofre/projects/luminous_ui/packages/engine/src/cards.ts";
console.log("ANY_ENERGY sentinel =", JSON.stringify(ANY_ENERGY));
// The mutation drops the `continue`, so `basic` ALSO runs the ternary's else branch:
//   providesEnergyType(state, holder, uid, "basic")  ==  units.includes("basic") || units.includes(ANY_ENERGY)
// Nothing provides the literal "basic", so the extra term is NON-ZERO only for a
// WILDCARD provider. §2's board fields none — hence the row is INERT there.
for (const id of ["fix-blend", "fix-special", "fix-water-energy", "fix-energy", "sv02-191"]) {
  const c = FIXTURE_POOL[id];
  console.log(`${id.padEnd(20)} present=${c !== undefined} energyType=${(c as {energyType?: string} | undefined)?.energyType}`);
}
