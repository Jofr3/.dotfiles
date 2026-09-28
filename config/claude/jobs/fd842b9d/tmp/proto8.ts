import { rows, builds } from "/home/jofre/projects/luminous_ui/scripts/residue-census";
import { legalAttackCorpus } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus";
const corpus = legalAttackCorpus();
const opaque = rows.filter((r) => r.cls === "OPAQUE");
const residueSet = new Set(rows.map((r) => r.text));
const M: [string, RegExp][] = [
  ["COPY-ATTACK", /use it as this attack/],
  ["SCHEMA-BANNER", /\b(Ancient|Future|Tera)\b/],
  ["VARIABLE-MAX", /up to the number of|a number of cards up to|any number of/],
  ["ATTACK-BY-NAME", /used (Angelite|Rollout)|Hyper Fang|United Wings/],
  ["DEVOLVE", /Devolve|Stage Evolution/],
  ["WIN-GAME", /you win this game/],
  ["FACE-DOWN-PRIZE", /face-down Prize|face up/],
  ["SELF-COUNTER-SCALE", /damage counters on this Pokémon\. This attack/],
  ["TOOL", /Pokémon Tool/],
  ["WEAKNESS-REWRITE", /Weakness is now/],
  ["COST-MUTATE", /attacks used by the Defending Pokémon cost|ignore all Energy in this attack's cost|can be used for \{/],
  ["BASE-DAMAGE-SET", /base damage is/],
];
function builtSide(rx: RegExp) { let b=0,bu=0; for (const [u,t] of corpus) if (rx.test(t) && !residueSet.has(t)) {b++;bu+=u;} return [b,bu]; }
const label = new Map<string,string>();
for (const r of opaque) {
  for (const [n, rx] of M) { const [b] = builtSide(rx); if (b===0 && rx.test(r.text)) { label.set(r.text, n); break; } }
}
const tally: Record<string,[number,number]> = {};
for (const r of opaque) { const k = label.get(r.text) ?? "UNMARKED"; const t = tally[k] ?? [0,0]; t[0]++; t[1]+=r.units; tally[k]=t; }
for (const [n,rx] of M) { const [b,bu]=builtSide(rx); console.log(`${n.padEnd(20)} builtSide ${b}/${bu}  labels ${tally[n]?.[0]??0}/${tally[n]?.[1]??0}`); }
console.log(`\nUNMARKED ${tally["UNMARKED"]?.[0]} / ${tally["UNMARKED"]?.[1]}`);
for (const r of opaque) if (!label.has(r.text)) console.log(`   ${String(r.units).padStart(2)}p ${r.text}`);
