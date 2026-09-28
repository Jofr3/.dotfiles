import * as effects from "/home/jofre/projects/luminous_ui/packages/engine/src/effects";
import { attackReaderSurface, legalAttackCorpus, resolvedByAnyReader } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus";

const surface = attackReaderSurface();
console.log("SURFACE LENGTH =", surface.length);
console.log("SURFACE =", JSON.stringify(surface, null, 1));

const FULL =
  "Discard up to 3 Energy cards from your hand. This attack does 60 damage to 1 of your opponent's Pokémon for each Energy card you discarded in this way. (Don't apply Weakness and Resistance for Benched Pokémon.)";

// corpus membership check (D452: never pin an invented string)
const corpus = legalAttackCorpus();
console.log("corpus size:", corpus.length, "typeof row:", typeof corpus[0], JSON.stringify(corpus[0]).slice(0, 200));

const VARIANTS: [string, string][] = [
  ["FULL", FULL],
  ["del-HAND-HEAD", "This attack does 60 damage to 1 of your opponent's Pokémon for each Energy card you discarded in this way. (Don't apply Weakness and Resistance for Benched Pokémon.)"],
  ["del-CHOSEN", "Discard up to 3 Energy cards from your hand. This attack does 60 damage for each Energy card you discarded in this way. (Don't apply Weakness and Resistance for Benched Pokémon.)"],
  ["del-SCALING", "Discard up to 3 Energy cards from your hand. This attack does 60 damage to 1 of your opponent's Pokémon. (Don't apply Weakness and Resistance for Benched Pokémon.)"],
  ["del-WR", "Discard up to 3 Energy cards from your hand. This attack does 60 damage to 1 of your opponent's Pokémon for each Energy card you discarded in this way."],
  ["seg1-HEAD-alone", "Discard up to 3 Energy cards from your hand."],
  ["seg2-DAMAGE-alone", "This attack does 60 damage to 1 of your opponent's Pokémon for each Energy card you discarded in this way. (Don't apply Weakness and Resistance for Benched Pokémon.)"],
  ["seg2-DAMAGE-noWR", "This attack does 60 damage to 1 of your opponent's Pokémon for each Energy card you discarded in this way."],
  ["del-CHOSEN+SCALING", "Discard up to 3 Energy cards from your hand. This attack does 60 damage. (Don't apply Weakness and Resistance for Benched Pokémon.)"],
  ["hand->self", "Discard up to 3 Energy from this Pokémon. This attack does 60 damage to 1 of your opponent's Pokémon for each Energy card you discarded in this way. (Don't apply Weakness and Resistance for Benched Pokémon.)"],
];

function readAll(s: string) {
  const out: Record<string, unknown> = {};
  for (const name of surface) {
    const fn = (effects as unknown as Record<string, (t: string) => unknown>)[name];
    let v: unknown;
    try { v = fn(s); } catch (e) { v = `THREW ${(e as Error).message}`; }
    if (v !== null && v !== undefined) out[name] = v;
  }
  return out;
}

const splitters = Object.keys(effects).filter((k) => k.startsWith("splitAttack") && typeof (effects as any)[k] === "function");
console.log("SPLITTERS =", JSON.stringify(splitters));

for (const [label, text] of VARIANTS) {
  const claims = readAll(text);
  const names = Object.keys(claims);
  const sp: Record<string, unknown> = {};
  for (const s of splitters) {
    const v = (effects as any)[s](text);
    if (v !== null && v !== undefined) sp[s] = v;
  }
  console.log(`\n### ${label}`);
  console.log(`    text: ${JSON.stringify(text)}`);
  console.log(`    resolvedByAnyReader: ${resolvedByAnyReader(text)}  claimers: ${names.length ? names.join(",") : "NONE"}`);
  if (names.length) console.log(`    values: ${JSON.stringify(claims)}`);
  console.log(`    splitters: ${Object.keys(sp).length ? JSON.stringify(sp) : "none"}`);
  console.log(`    in corpus: ${corpus.some((r: any) => (typeof r === "string" ? r : r.text) === text)}`);
}
