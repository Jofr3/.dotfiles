import { rows, builds } from "/home/jofre/projects/luminous_ui/scripts/residue-census";
import { legalAttackCorpus } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus";
const corpus = legalAttackCorpus();
const opaque = new Set(rows.filter((r) => r.cls === "OPAQUE").map((r) => r.text));
const residue = new Set(rows.map((r) => r.text));
const M: [string, RegExp][] = [
  ["COPY-ATTACK", /use it as this attack/],
  ["CONTINUOUS", /\b(During your next turn|During your opponent's next turn|Until the end of)/],
  ["SCHEMA-BANNER", /\b(Ancient|Future|Tera)\b/],
  ["PRIZE", /Prize card/],
  ["BOTH-SIDES", /both yours and your opponent's|both Active Pokémon/],
  ["NAMED-CARD", /"[^"]+"|N's |Team Rocket|United Wings|Drifloon|Drifblim|Fennel|Angelite|Rollout|Hyper Fang/],
  ["OPP-HAND-DECK", /your opponent's hand|opponent discards|opponent chooses|shuffle their deck/],
  ["UP-TO-N-COUNT", /up to the number of|a number of cards up to/],
];
for (const [name, rx] of M) {
  let o=0,ou=0,r=0,ru=0,b=0,bu=0;
  const bhits: string[] = [];
  for (const [u,t] of corpus) {
    if (!rx.test(t)) continue;
    if (opaque.has(t)) {o++;ou+=u;}
    if (residue.has(t)) {r++;ru+=u;} else {b++;bu+=u; bhits.push(t);}
  }
  console.log(`${name.padEnd(16)} OPAQUE ${String(o).padStart(2)}/${String(ou).padStart(3)}   residue ${String(r).padStart(2)}/${String(ru).padStart(3)}   BUILT ${String(b).padStart(2)}/${String(bu).padStart(3)}`);
  for (const h of bhits.slice(0,3)) console.log(`      built: ${h.slice(0,110)}`);
}
