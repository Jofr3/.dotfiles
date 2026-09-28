import * as effects from "/home/jofre/projects/luminous_ui/packages/engine/src/effects";
import { attackReaderSurface, legalAttackCorpus, resolvedByAnyReader } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus";

const surface = attackReaderSurface();
console.log("SURFACE LENGTH =", surface.length);
console.log("SURFACE =", JSON.stringify(surface));

const corpus = legalAttackCorpus();
console.log("corpus size:", corpus.length, "sample row:", JSON.stringify(corpus[0]));

const splitters = Object.keys(effects).filter((k) => k.startsWith("splitAttack") && typeof (effects as any)[k] === "function");
console.log("SPLITTERS =", JSON.stringify(splitters));

function readAll(s: string) {
  const out: Record<string, unknown> = {};
  const refused: string[] = [];
  for (const name of surface) {
    const fn = (effects as unknown as Record<string, (t: string) => unknown>)[name];
    let v: unknown;
    try { v = fn(s); } catch (e) { v = `THREW ${(e as Error).message}`; }
    if (v !== null && v !== undefined) out[name] = v; else refused.push(name);
  }
  return { out, refused };
}

function corpusRow(text: string) {
  // corpus rows are [printings, text] tuples per legalAttackCorpus signature
  const hit = corpus.find((r: any) => r[1] === text);
  return hit ? { printings: hit[0] } : null;
}

// file-line lookup
import { readFileSync } from "node:fs";
const src = readFileSync("/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus.ts", "utf8").split("\n");
function fileLine(text: string): number | null {
  for (let i = 0; i < src.length; i++) if (src[i].includes(text)) return i + 1;
  return null;
}

const ROWS: [string, string][] = [
  ["539", "This attack does 100 damage to each of your opponent's Pokémon ex and Pokémon V. This attack's damage isn't affected by Weakness or Resistance."],
  ["616", "This attack does 60 damage to each of your opponent's Pokémon ex. This attack's damage isn't affected by Weakness or Resistance."],
  ["612 (built sibling)", "This attack does 60 damage for each of your opponent's Pokémon ex and Pokémon V in play."],
  ["613 (built sibling)", "This attack does 60 damage for each of your opponent's Pokémon ex in play."],
  ["620 (snipe + same W/R tail)", "This attack does 70 damage to 1 of your opponent's Pokémon. This attack's damage isn't affected by Weakness or Resistance."],
];

for (const [label, text] of ROWS) {
  const { out, refused } = readAll(text);
  const names = Object.keys(out);
  const sp: Record<string, unknown> = {};
  for (const s of splitters) {
    const v = (effects as any)[s](text);
    sp[s] = v === null || v === undefined ? null : v;
  }
  console.log(`\n### ROW ${label}  fileLine=${fileLine(text)}  corpus=${JSON.stringify(corpusRow(text))}`);
  console.log(`    text: ${JSON.stringify(text)}`);
  console.log(`    resolvedByAnyReader: ${resolvedByAnyReader(text)}`);
  console.log(`    CLAIMED BY (${names.length}/${surface.length}): ${names.length ? names.join(",") : "NONE"}`);
  if (names.length) console.log(`    values: ${JSON.stringify(out)}`);
  console.log(`    REFUSED BY (${refused.length}/${surface.length}): ${refused.join(",")}`);
  for (const s of splitters) console.log(`    ${s}: ${JSON.stringify(sp[s])}`);
}
