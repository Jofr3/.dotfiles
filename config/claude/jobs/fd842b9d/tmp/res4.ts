import { readFileSync } from "node:fs";
import { legalAttackCorpus, resolvedByAnyReader } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus";
import { splitAttackGateClause, splitAttackTrailingClause } from "/home/jofre/projects/luminous_ui/packages/engine/src/effects";
// transcribe REGISTRY_ATTACK_SENTENCES structurally from the test file
const src = readFileSync("/home/jofre/projects/luminous_ui/packages/engine/src/censusAtHead.test.ts","utf8");
const start = src.indexOf("const REGISTRY_ATTACKS: readonly");
const end = src.indexOf("\n];", start);
const block = src.slice(start, end);
const sents = [...new Set([...block.matchAll(/"((?:[^"\\]|\\.)+)",?\n?\s*\]/g)].map(m=>m[1]))];
const raw = legalAttackCorpus().filter(([, t]) => !resolvedByAnyReader(t));
const REG = readFileSync("/home/jofre/projects/luminous_ui/packages/engine/src/registry.ts","utf8");
const inRegistryFile = raw.filter(([,t])=>REG.includes(t));
console.log("raw", raw.length, raw.reduce((a,[n])=>a+n,0));
console.log("raw sentences whose text literally occurs in registry.ts:", inRegistryFile.length, inRegistryFile.reduce((a,[n])=>a+n,0));
for (const [n,t] of inRegistryFile) console.log("  REGFILE", n, t.slice(0,80));
