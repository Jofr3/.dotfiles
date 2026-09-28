import { legalAttackCorpus } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus.ts";
const rows = legalAttackCorpus();
const specimens = [
  "Flip a coin. If heads, during your opponent's next turn, the Defending Pokémon can't attack.",
  "During your opponent's next turn, the Defending Pokémon can't attack.",
  "During your opponent's next turn, the Defending Pokémon can't use attacks.",
  "Flip a coin. If heads, during your opponent's next turn, prevent all damage done to this Pokémon by attacks.",
  "Flip a coin. If heads, during your opponent's next turn, prevent all damage from and effects of attacks done to this Pokémon.",
  "Flip a coin. If tails, during your next turn, this Pokémon can't attack.",
  "Flip a coin. If tails, this attack does nothing. If heads, during your opponent's next turn, prevent all damage from and effects of attacks done to this Pokémon.",
];
for (const s of specimens) {
  const hit = rows.find(([, t]) => t === s);
  console.log(`${hit ? `IS a corpus row, ${hit[0]} printing(s)` : "NOT A CORPUS ROW"}  ${JSON.stringify(s.slice(0, 70))}...`);
}
// codePointAt on the apostrophes of the target (D421/D440)
const T = specimens[0] as string;
for (let i = 0; i < T.length; i++) {
  const c = T.codePointAt(i) as number;
  if (c === 0x27 || c === 0x2019) console.log(`  apostrophe at index ${i}: U+${c.toString(16).toUpperCase().padStart(4, "0")}`);
}
