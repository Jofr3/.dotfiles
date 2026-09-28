import {
  deriveAttackEffect,
  splitAttackGateClause,
  splitAttackTrailingClause,
} from "/home/jofre/projects/luminous_ui/packages/engine/src/effects";
import { legalAttackCorpus, resolvedByAnyReader } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus";
const REGISTRY_ATTACK_SENTENCES: string[] = await Bun.file(
  "/home/jofre/.claude/jobs/fd842b9d/tmp/regsents.json",
).json();
console.log("registry distinct sentences:", REGISTRY_ATTACK_SENTENCES.length);
const rawUnbuiltSentences = legalAttackCorpus().filter(([, text]) => !resolvedByAnyReader(text));
const residueSentences = rawUnbuiltSentences.filter(([, text]) => {
  if (REGISTRY_ATTACK_SENTENCES.includes(text)) return false;
  const gate = splitAttackGateClause(text);
  if (gate !== null && gate.body !== "" && resolvedByAnyReader(gate.body)) return false;
  return splitAttackTrailingClause(text) === null;
});
const units = (r: readonly (readonly [number, string])[]) => r.reduce((s, [n]) => s + n, 0);
console.log(`raw unbuilt: ${rawUnbuiltSentences.length} / ${units(rawUnbuiltSentences)}`);
console.log(`residue    : ${residueSentences.length} / ${units(residueSentences)}`);
const target = "Search your deck for a Basic Pokémon and put it onto your Bench. Then, shuffle your deck. If you put any Pokémon onto your Bench in this way, move an Energy from this Pokémon to the new Benched Pokémon.";
console.log("target in residue?", residueSentences.some(([, s]) => s === target));
console.log("target in rawUnbuilt?", rawUnbuiltSentences.some(([, s]) => s === target));
console.log("deriveAttackEffect(target) =", deriveAttackEffect(target));
