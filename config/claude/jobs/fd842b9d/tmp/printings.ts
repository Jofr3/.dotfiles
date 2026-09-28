import { legalAttackCorpus } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus.ts";
const corpus = legalAttackCorpus();
console.log(`corpus rows: ${corpus.length}, total printings: ${corpus.reduce((a, [n]) => a + n, 0)}`);

const PATTERNS: Array<[string, RegExp]> = [
  ["FLIP_PREVENT_DAMAGE_AND_EFFECTS (exact anchor)", /^Flip a coin\. If heads, during your opponent['’]s next turn, prevent all damage from and effects of attacks done to this Pokémon\.$/],
  ["FLIP_PREVENT_DAMAGE (exact anchor)", /^Flip a coin\. If heads, during your opponent['’]s next turn, prevent all damage done to this Pokémon by attacks\.$/],
  ["FLIP_TAILS_SELF_CANT_ATTACK (exact anchor)", /^Flip a coin\. If tails, during your next turn, this Pokémon can['’]t attack\.$/],
];
for (const [name, re] of PATTERNS) {
  const hits = corpus.filter(([, s]) => re.test(s));
  console.log(`\n${name}: ${hits.length} sentence(s) / ${hits.reduce((a, [n]) => a + n, 0)} printing(s)`);
  for (const [n, s] of hits) console.log(`   ${n}p  ${s}`);
}

console.log("\n=== BROAD: every corpus sentence mentioning can't attack / tails ===");
const broad = corpus.filter(([, s]) => /can['’]t attack/.test(s));
console.log(`/can['’]t attack/: ${broad.length} sentences / ${broad.reduce((a,[n])=>a+n,0)} printings`);
for (const [n, s] of broad) console.log(`   ${n}p  ${s}`);
console.log("\n=== BROAD: /^Flip a coin\\. If tails, / ===");
const tails = corpus.filter(([, s]) => /^Flip a coin\. If tails, /.test(s));
console.log(`${tails.length} sentences / ${tails.reduce((a,[n])=>a+n,0)} printings`);
for (const [n, s] of tails) console.log(`   ${n}p  ${s}`);
console.log("\n=== BROAD: /If tails/ anywhere ===");
const anytails = corpus.filter(([, s]) => /If tails/.test(s));
console.log(`${anytails.length} sentences / ${anytails.reduce((a,[n])=>a+n,0)} printings`);
for (const [n, s] of anytails) console.log(`   ${n}p  ${s}`);
