import { legalAttackCorpus, resolvedByAnyReader } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus";
import * as fs from "node:fs";
const src = fs.readFileSync("/home/jofre/projects/luminous_ui/packages/engine/src/censusAtHead.test.ts", "utf8");
const h = src.indexOf("const REGISTRY_ATTACKS: readonly (readonly [string, string])[] = [");
const e = src.indexOf("\n];", h);
const block = src.slice(h, e).split("\n").map((l) => l.replace(/\s*\/\/.*$/, "")).join("\n");
const PAIR = /\[\s*"(sv[a-z0-9.]*-\d+)"\s*,\s*"((?:[^"\\]|\\.)*)"\s*,?\s*\]/g;
let bad = 0;
for (const m of block.matchAll(PAIR)) {
  const s = (m[2] ?? "").replace(/\\"/g, '"');
  if (resolvedByAnyReader(s)) { console.log(`🛑 REGISTRY SENTENCE NOW READER-CLAIMED: ${m[1]} ${s}`); bad++; }
}
console.log(`registry sentences claimed by a reader: ${bad}`);
const corpus = legalAttackCorpus();
let claimed = 0, units = 0;
for (const [u, t] of corpus) if (resolvedByAnyReader(t)) { claimed++; units += u; }
console.log(`reader-claimed corpus sentences: ${claimed}, printings: ${units}`);
// Everything the anchor family now claims that names a proper name
for (const [u, t] of corpus) {
  if (!/[Ss]earch your deck/.test(t)) continue;
  if (!resolvedByAnyReader(t)) continue;
  if (!/(any number of|byName)/.test(t)) continue;
  console.log(`  claimed (any-number): ${u}p ${t}`);
}
