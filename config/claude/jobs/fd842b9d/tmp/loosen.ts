import { legalAttackCorpus } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus.ts";
const corpus = legalAttackCorpus();
const tot = (rs: readonly (readonly [number, string])[]) => `${rs.length}s/${rs.reduce((a, [n]) => a + n, 0)}p`;
const WIDE = String.raw`^Flip a coin\. If heads, during your opponent['’]s next turn, prevent all damage from and effects of attacks done to this Pokémon\.$`;
const NARROW = String.raw`^Flip a coin\. If heads, during your opponent['’]s next turn, prevent all damage done to this Pokémon by attacks\.$`;
const TAILS = String.raw`^Flip a coin\. If tails, during your next turn, this Pokémon can['’]t attack\.$`;

const cases: Array<[string, string]> = [
  ["WIDE  base", WIDE],
  ["WIDE  no ^", WIDE.slice(1)],
  ["WIDE  no \\.$", WIDE.replace(/\\\.\$$/, "")],
  ["WIDE  no $ (keep \\.)", WIDE.slice(0, -1)],
  ["WIDE  ['’]->'", WIDE.replace("['’]", "'")],
  ["WIDE  ['’]->’", WIDE.replace("['’]", "’")],
  ["WIDE  'from and effects of ' deleted", WIDE.replace("from and effects of ", "")],
  ["NARROW base", NARROW],
  ["NARROW no ^", NARROW.slice(1)],
  ["NARROW no \\.$", NARROW.replace(/\\\.\$$/, "")],
  ["NARROW no $ (keep \\.)", NARROW.slice(0, -1)],
  ["NARROW ['’]->'", NARROW.replace("['’]", "'")],
  ["NARROW 'by attacks'->'by attacks from Basic Pokémon'", NARROW.replace("by attacks", "by attacks from Basic Pokémon")],
  ["TAILS base", TAILS],
  ["TAILS no ^", TAILS.slice(1)],
  ["TAILS no \\.$", TAILS.replace(/\\\.\$$/, "")],
  ["TAILS ['’]->'", TAILS.replace("['’]", "'")],
  ["TAILS If tails->If heads", TAILS.replace("If tails", "If heads")],
  ["TAILS your next->your opponent's next", TAILS.replace("during your next turn", "during your opponent['’]s next turn")],
];
for (const [name, src] of cases) {
  const re = new RegExp(src);
  const hits = corpus.filter(([, s]) => re.test(s));
  console.log(`${name.padEnd(52)} ${tot(hits).padStart(9)}`);
  for (const [n, s] of hits) console.log(`      ${String(n).padStart(3)}p  ${s.slice(0, 130)}`);
}
