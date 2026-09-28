import * as effects from "/home/jofre/projects/luminous_ui/packages/engine/src/effects";
import { attackReaderSurface } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus";
const names = attackReaderSurface();
const mod = effects as unknown as Record<string, (t: string) => unknown>;
const T = "Search your deck for up to 2 Basic {D} Energy cards and attach them to this Pokémon. Then, shuffle your deck. If you attached Energy to a Pokémon in this way, this Pokémon is now Poisoned.";
for (const n of names) { const v = mod[n]!(T); if (v !== null) console.log(n, "->", JSON.stringify(v, null, 1)); }
