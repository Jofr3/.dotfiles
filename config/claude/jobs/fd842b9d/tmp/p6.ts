// Does any of D477's three sentences match one of the eight ROWS backlog patterns?
const sentences = [
  "Discard 2 Energy from this Pokémon. This attack also does 120 damage to 1 of your opponent's Benched Pokémon. (Don't apply Weakness and Resistance for Benched Pokémon.)",
  "Discard all Energy from this Pokémon, and this attack also does 90 damage to 1 of your opponent's Benched Pokémon. (Don't apply Weakness and Resistance for Benched Pokémon.)",
  "Discard all {R} Energy from this Pokémon, and this attack does 180 damage to 1 of your opponent's Benched Pokémon. (Don't apply Weakness and Resistance for Benched Pokémon.)",
];
const patterns: [string, RegExp][] = [
  ["search your deck", /[Ss]earch your deck/],
  ["look at the top", /[Ll]ook at the top/],
  ["put ... from your discard pile", /[Pp]ut .* from your discard pile/],
  ["use it as this attack", /use it as this attack/],
  ["evolve search", /evolves? from/],
  ["prevent damage", /[Pp]revent all damage/],
  ["attach from deck", /[Aa]ttach .* from your deck/],
  ["attach from discard", /[Aa]ttach .* from your discard pile/],
];
for (const s of sentences) {
  const hit = patterns.filter(([, re]) => re.test(s)).map(([n]) => n);
  console.log(hit.length === 0 ? "NO ROW PATTERN" : `HITS: ${hit.join(", ")}`, "|", s.slice(0, 60));
}
