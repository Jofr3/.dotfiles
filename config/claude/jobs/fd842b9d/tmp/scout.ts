import {
  legalAttackCorpus,
  resolvedByAnyReader,
  attackReaderSurface,
} from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus";
import {
  splitAttackGateClause,
  splitAttackTrailingClause,
} from "/home/jofre/projects/luminous_ui/packages/engine/src/effects";
import { REGISTRY_ATTACKS } from "./registryAttacks.gen";

const REGISTRY_ATTACK_SENTENCES = [...new Set(REGISTRY_ATTACKS.map(([, t]) => t))];

const corpus = legalAttackCorpus();
const rawUnbuilt = corpus.filter(([, text]) => !resolvedByAnyReader(text));
const residue = rawUnbuilt.filter(([, text]) => {
  if (REGISTRY_ATTACK_SENTENCES.includes(text)) return false;
  const gate = splitAttackGateClause(text);
  if (gate !== null && gate.body !== "" && resolvedByAnyReader(gate.body)) return false;
  return splitAttackTrailingClause(text) === null;
});

console.error("CORPUS sentences:", corpus.length, "printings:", corpus.reduce((s,[n])=>s+n,0));
console.error("rawUnbuilt sentences:", rawUnbuilt.length, "printings:", rawUnbuilt.reduce((s,[n])=>s+n,0));
console.error("residue sentences:", residue.length, "printings:", residue.reduce((s,[n])=>s+n,0));
console.error("reader surface:", attackReaderSurface().length, attackReaderSurface().join(","));

for (const [n, text] of residue) console.log(`${n}\t${text}`);
