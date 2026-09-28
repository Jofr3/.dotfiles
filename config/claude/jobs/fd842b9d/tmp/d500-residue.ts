import { readFileSync } from "node:fs";
import * as effects from "/home/jofre/projects/luminous_ui/packages/engine/src/effects.ts";
import { legalAttackCorpus, resolvedByAnyReader } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus.ts";
const { splitAttackGateClause, splitAttackTrailingClause } = effects as unknown as {
  splitAttackGateClause: (t: string) => { body: string } | null;
  splitAttackTrailingClause: (t: string) => unknown;
};
// REGISTRY_ATTACK_SENTENCES, lifted out of censusAtHead.test.ts by parsing its table.
const src = readFileSync("/home/jofre/projects/luminous_ui/packages/engine/src/censusAtHead.test.ts", "utf8");
const start = src.indexOf("const REGISTRY_ATTACKS: readonly (readonly [string, string])[] = [");
const end = src.indexOf("\n];", start);
const block = src.slice(start, end);
const pairs = [...block.matchAll(/\[\s*"([^"]+)",\s*\n?\s*"((?:[^"\\]|\\.)*)",?\s*\n?\s*\]/g)];
const REGISTRY_ATTACK_SENTENCES = [...new Set(pairs.map((m) => JSON.parse(`"${m[2]}"`) as string))];
console.log("REGISTRY_ATTACKS pairs parsed:", pairs.length, "| distinct sentences:", REGISTRY_ATTACK_SENTENCES.length, "(committed literal: 10)");

// === CANONICAL RESIDUE PREDICATE, copied verbatim from censusAtHead.test.ts:6303-6311 ===
const rawUnbuiltSentences = legalAttackCorpus().filter(
  ([, text]) => !resolvedByAnyReader(text),
);
const residueSentences = rawUnbuiltSentences.filter(([, text]) => {
  if (REGISTRY_ATTACK_SENTENCES.includes(text)) return false;
  const gate = splitAttackGateClause(text);
  if (gate !== null && gate.body !== "" && resolvedByAnyReader(gate.body)) return false;
  return splitAttackTrailingClause(text) === null;
});
const units = (rs: readonly (readonly [number, string])[]) => rs.reduce((s, [n]) => s + n, 0);
console.log("\nrawUnbuiltSentences.length =", rawUnbuiltSentences.length, "(committed literal 110)");
console.log("residueSentences.length     =", residueSentences.length, "(committed literal 84)");
console.log("raw unbuilt PRINTINGS       =", units(rawUnbuiltSentences));
console.log("residue PRINTINGS           =", units(residueSentences));

const T = "This attack does 40 damage for each Basic Energy attached to this Pokémon.";
const inRaw = rawUnbuiltSentences.find(([, t]) => t === T);
const inRes = residueSentences.find(([, t]) => t === T);
console.log("\nTARGET in rawUnbuilt? ", inRaw ? `yes, ${inRaw[0]} legal printing(s)` : "NO");
console.log("TARGET in residue?    ", inRes ? `yes, ${inRes[0]} legal printing(s)` : "NO");
