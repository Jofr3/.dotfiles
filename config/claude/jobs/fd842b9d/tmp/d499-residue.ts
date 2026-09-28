// CANONICAL residue predicate, copied VERBATIM from censusAtHead.test.ts:6303-6311.
import { legalAttackCorpus, resolvedByAnyReader } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus.ts";
import { splitAttackGateClause, splitAttackTrailingClause } from "/home/jofre/projects/luminous_ui/packages/engine/src/effects.ts";
import { REGISTRY_ATTACKS } from "./regatk.ts";

export const REGISTRY_ATTACK_SENTENCES = [...new Set(REGISTRY_ATTACKS.map(([, text]) => text))];

export function rawUnbuilt(): readonly (readonly [number, string])[] {
  return legalAttackCorpus().filter(([, text]) => !resolvedByAnyReader(text));
}
export function residue(): readonly (readonly [number, string])[] {
  return rawUnbuilt().filter(([, text]) => {
    if (REGISTRY_ATTACK_SENTENCES.includes(text)) return false;
    const gate = splitAttackGateClause(text);
    if (gate !== null && gate.body !== "" && resolvedByAnyReader(gate.body)) return false;
    return splitAttackTrailingClause(text) === null;
  });
}
export const units = (rows: readonly (readonly [number, string])[]) => rows.reduce((a, [u]) => a + u, 0);

if (import.meta.main) {
  const raw = rawUnbuilt();
  const res = residue();
  console.log("rawUnbuiltSentences.length = %d (pin 111)  units = %d (RAW_UNBUILT_ATTACK_UNITS pin 170)", raw.length, units(raw));
  console.log("residueSentences.length    = %d (pin 85)   units = %d", res.length, units(res));
}
