import { readFileSync } from "node:fs";
import { legalAttackCorpus, resolvedByAnyReader, attackReaderSurface } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus";
import { splitAttackGateClause, splitAttackTrailingClause, deriveAttackEffect } from "/home/jofre/projects/luminous_ui/packages/engine/src/effects";

const REG = readFileSync("/home/jofre/projects/luminous_ui/packages/engine/src/registry.ts", "utf8");
const corpus = legalAttackCorpus();
console.log("readers:", attackReaderSurface().length, attackReaderSurface().join(","));
console.log("corpus sentences:", corpus.length, "printings:", corpus.reduce((a,[n])=>a+n,0));

function servedBySplitter(s: string): boolean {
  const g = splitAttackGateClause(s);
  if (g && resolvedByAnyReader(g.body)) return true;
  const t = splitAttackTrailingClause(s);
  if (t && resolvedByAnyReader(t.head) && resolvedByAnyReader(t.tail)) return true;
  return false;
}

const residue = corpus.filter(([, s]) => !resolvedByAnyReader(s) && !servedBySplitter(s) && !REG.includes(s));
console.log("residue sentences:", residue.length, "printings:", residue.reduce((a,[n])=>a+n,0));

// looser residue variants
const r2 = corpus.filter(([, s]) => !resolvedByAnyReader(s));
console.log("reader-only residue:", r2.length, "/", r2.reduce((a,[n])=>a+n,0));

// FAMILY ENUMERATION - loose shapes, over WHOLE corpus, no truncation
const pats: [string, RegExp][] = [
  ["A: as this attack", /as this attack/i],
  ["B: use .* attack", /use (it|that|this|an|one|the)?\s*attack/i],
  ["C: any 'attack' + 'use'", /attack/i],
  ["D: copy", /copy|copies|copied/i],
  ["E: attacks(') ", /attacks'|attacks\b/i],
];
for (const [name, re] of pats) {
  const hits = corpus.filter(([, s]) => re.test(s));
  console.log(`\n### ${name}  -> ${hits.length} sentences / ${hits.reduce((a,[n])=>a+n,0)} printings`);
}
