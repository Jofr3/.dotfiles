import * as effects from "/home/jofre/projects/luminous_ui/packages/engine/src/effects";
import { attackReaderSurface, legalAttackCorpus } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus";

const names = attackReaderSurface();
console.log("READER SURFACE (" + names.length + "):", names.join(", "));

const mod = effects as unknown as Record<string, (t: string) => unknown>;

const FULL =
  "Search your deck for a Basic Pokémon and put it onto your Bench. Then, shuffle your deck. If you put any Pokémon onto your Bench in this way, move an Energy from this Pokémon to the new Benched Pokémon.";
const HEAD = "Search your deck for a Basic Pokémon and put it onto your Bench. Then, shuffle your deck.";
const TAIL =
  "If you put any Pokémon onto your Bench in this way, move an Energy from this Pokémon to the new Benched Pokémon.";

function report(label: string, text: string) {
  console.log("\n=== " + label + " ===");
  console.log(JSON.stringify(text));
  let claimed = 0;
  for (const n of names) {
    const v = mod[n]!(text);
    if (v !== null) {
      claimed++;
      console.log("  CLAIMED by " + n + " -> " + JSON.stringify(v));
    }
  }
  if (claimed === 0) console.log("  REFUSED " + names.length + "/" + names.length);
  for (const s of [
    "splitAttackRequirementClause",
    "splitAttackCancelClause",
    "splitAttackGateClause",
    "splitAttackTrailingClause",
  ]) {
    const f = mod[s] as unknown as (t: string) => unknown;
    console.log("  " + s + " -> " + JSON.stringify(f(text)));
  }
  const inCorpus = legalAttackCorpus().filter(([, s]) => s === text);
  console.log("  corpus rows: " + JSON.stringify(inCorpus));
}

report("FULL PRINT", FULL);
report("HEAD", HEAD);
report("TAIL", TAIL);
