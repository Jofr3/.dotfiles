import { readFileSync } from "node:fs";
const src = readFileSync("packages/engine/src/censusAttackCorpus.ts", "utf8");
const lines = src.split("\n");
type Row = { fileLine: number; printings: number; text: string };
const rows: Row[] = [];
for (let i = 0; i < lines.length; i++) {
  const m = /^(\d+) (.+)$/.exec(lines[i]);
  if (m) rows.push({ fileLine: i + 1, printings: Number(m[1]), text: m[2] });
}
console.log(`parsed ${rows.length} rows / ${rows.reduce((a, r) => a + r.printings, 0)} printings`);

const pats: Array<[string, RegExp]> = [
  ["A  /If heads,/i (loosest heads)", /If heads,/i],
  ["B  /If tails,/i (loosest tails)", /If tails,/i],
  ["C  BOTH branches printed: /If heads,/i AND /If tails,/i", /(?=.*If heads,)(?=.*If tails,)/is],
  ["D  ordered heads-then-tails: /If heads,.*If tails,/is", /If heads,.*If tails,/is],
  ["E  ordered tails-then-heads: /If tails,.*If heads,/is", /If tails,.*If heads,/is],
  ["F  any coin-face conditional at all: /If (heads|tails)/i", /If (?:heads|tails)/i],
];
for (const [name, re] of pats) {
  const hits = rows.filter((r) => re.test(r.text));
  console.log(`\n${name}  →  ${hits.length} rows / ${hits.reduce((a, r) => a + r.printings, 0)} printings`);
}
