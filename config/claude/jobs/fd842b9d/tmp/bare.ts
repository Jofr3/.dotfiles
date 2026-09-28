import { legalAttackCorpus } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus.ts";
const rows = new Map(legalAttackCorpus().map(([n, s]) => [s, n] as const));
console.log("BARE:", rows.get("Your opponent's Active Pokémon is now Paralyzed."));
for (const [n,s] of legalAttackCorpus()) if (s.includes("is now Paralyzed") && s.length < 70) console.log(n, JSON.stringify(s));
