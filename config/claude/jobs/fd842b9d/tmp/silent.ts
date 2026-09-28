import { legalAttackCorpus } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus";
const corpus = legalAttackCorpus();
const BASE = /^This attack does (\d+) damage for each Special Condition affecting your opponent['’]s Active Pokémon\.$/;
const variants: [string, RegExp, number][] = [
  ["C4 no ^",  /This attack does (\d+) damage for each Special Condition affecting your opponent['’]s Active Pokémon\.$/, 1],
  ["C5 no $",  /^This attack does (\d+) damage for each Special Condition affecting your opponent['’]s Active Pokémon\./, 1],
  ["C6 more",  /^This attack does (\d+) more damage for each Special Condition affecting your opponent['’]s Active Pokémon\.$/, 1],
  ["C7 on",    /^This attack does (\d+) damage for each Special Condition on your opponent['’]s Active Pokémon\.$/, 1],
  ["C8 ascii", /^This attack does (\d+) damage for each Special Condition affecting your opponent's Active Pokémon\.$/, 1],
];
const hits = (re: RegExp) => corpus.filter(([,t]) => { const m = re.exec(t); return m !== null && Number(m[1]) >= 1; });
const base = hits(BASE);
console.log("BASE claims", base.length, "sentence(s)", base.reduce((s,[u])=>s+u,0), "printing(s)");
for (const [name, re] of variants) {
  const h = hits(re);
  console.log(name.padEnd(10), h.length, "sentence(s)", h.reduce((s,[u])=>s+u,0), "printing(s)", h.length===base.length && h.reduce((s,[u])=>s+u,0)===base.reduce((s,[u])=>s+u,0) ? "→ CENSUS UNMOVED (silent)" : "→ CENSUS MOVES");
}
// C9: per >= 0 — is a printed 0 in the column?
const zero = corpus.filter(([,t]) => /^This attack does 0 damage for each Special Condition/.test(t));
console.log("C9 printed-zero rows in column:", zero.length, "→", zero.length ? "CENSUS MOVES" : "CENSUS UNMOVED (silent)");
