import { legalAttackCorpus, resolvedByAnyReader, attackReaderSurface } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus";
import { splitAttackGateClause, splitAttackTrailingClause } from "/home/jofre/projects/luminous_ui/packages/engine/src/effects";
const corpus = legalAttackCorpus();
const P1 = /does \d+ (more |less )?damage for each /i;
console.log("READER SURFACE", attackReaderSurface().length, attackReaderSurface().join(","));
const fam = corpus.filter(([,t]) => P1.test(t));
const built = fam.filter(([,t]) => resolvedByAnyReader(t));
const raw = fam.filter(([,t]) => !resolvedByAnyReader(t));
const sum = (a:readonly (readonly [number,string])[]) => a.reduce((x,[n])=>x+n,0);
console.log(`FAMILY ${fam.length} / ${sum(fam)}`);
console.log(`built(resolvedByAnyReader) ${built.length} / ${sum(built)}`);
console.log(`raw unbuilt ${raw.length} / ${sum(raw)}`);
// canonical residue filter, copied verbatim from censusAtHead.test.ts:6226
const REGISTRY: string[] = []; // no P1 sentence is in REGISTRY_ATTACK_SENTENCES; verified separately
const residue = raw.filter(([, text]) => {
  if (REGISTRY.includes(text)) return false;
  const gate = splitAttackGateClause(text);
  if (gate !== null && gate.body !== "" && resolvedByAnyReader(gate.body)) return false;
  return splitAttackTrailingClause(text) === null;
});
console.log(`residue (− gate/trailing) ${residue.length} / ${sum(residue)}`);
console.log("\n=== SERVED BY SPLITTER, NOT BY WHOLE READER (raw minus residue) ===");
for (const [c,t] of raw) if (!residue.some(([,x])=>x===t)) console.log(c+"\t"+t);
console.log("\n=== FULL UNBUILT (raw) ENUMERATION ===");
for (const [c,t] of raw) console.log(c+"\t"+t);
