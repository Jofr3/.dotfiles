import { legalAttackCorpus, resolvedByAnyReader } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus";
import { splitAttackGateClause, splitAttackTrailingClause } from "/home/jofre/projects/luminous_ui/packages/engine/src/effects";
import { readFileSync } from "node:fs";

const src = readFileSync("/home/jofre/projects/luminous_ui/packages/engine/src/censusAtHead.test.ts","utf8");
const head = src.indexOf('const REGISTRY_ATTACKS: readonly (readonly [string, string])[] = [');
const end = src.indexOf("\n];", head);
const block = src.slice(head,end).split("\n").map(l=>l.replace(/\s*\/\/.*$/,"")).join("\n");
const PAIR = /\[\s*"(sv[a-z0-9.]*-\d+)"\s*,\s*"((?:[^"\\]|\\.)*)"\s*,?\s*\]/g;
const REGISTRY = new Set<string>();
for (const m of block.matchAll(PAIR)) REGISTRY.add((m[2] ?? "").replace(/\\"/g,'"'));

const corpus = legalAttackCorpus();
const tally: Record<string,[number,number]> = { reader:[0,0], registry:[0,0], gate:[0,0], trailing:[0,0], none:[0,0] };
for (const [units, text] of corpus) {
  let a = "none";
  if (resolvedByAnyReader(text)) a="reader";
  else if (REGISTRY.has(text)) a="registry";
  else {
    const g = splitAttackGateClause(text);
    if (g !== null && g.body !== "" && resolvedByAnyReader(g.body)) a="gate";
    else if (splitAttackTrailingClause(text) !== null) a="trailing";
  }
  tally[a]![0]++; tally[a]![1]+=units;
}
console.log(JSON.stringify(tally,null,1));
const built = (["reader","registry","gate","trailing"] as const).reduce((s,k)=>s+tally[k]![1],0);
const builtS = (["reader","registry","gate","trailing"] as const).reduce((s,k)=>s+tally[k]![0],0);
console.log("BUILT sentences", builtS, "printings", built);
console.log("corpus", corpus.length, corpus.reduce((s,[u])=>s+u,0));
