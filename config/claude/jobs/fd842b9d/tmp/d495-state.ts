import * as E from "/home/jofre/projects/luminous_ui/packages/engine/src/effects.ts";
import {
  attackReaderSurface,
  legalAttackCorpus,
  resolvedByAnyReader,
} from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus.ts";

const mod = E as unknown as Record<string, (t: string) => unknown>;
const names = attackReaderSurface();
console.log("READER SURFACE:", names.length, JSON.stringify(names));

const SPLITTERS = [
  "splitAttackGateClause",
  "splitAttackTrailingClause",
  "splitAttackRequirementClause",
  "splitAttackCancelClause",
] as const;

function report(label: string, text: string) {
  console.log("\n=== " + label);
  console.log("  TEXT: " + JSON.stringify(text));
  const claims: string[] = [];
  for (const n of names) {
    const v = mod[n]?.(text);
    if (v !== null && v !== undefined) claims.push(`${n} -> ${JSON.stringify(v)}`);
  }
  console.log(`  READERS CLAIMING: ${claims.length}/${names.length}`);
  for (const c of claims) console.log("    " + c);
  for (const s of SPLITTERS) {
    const v = mod[s]?.(text);
    console.log(`  ${s}: ${JSON.stringify(v)}`);
  }
  console.log(`  resolvedByAnyReader: ${resolvedByAnyReader(text)}`);
}

const TARGET =
  "Flip a coin. If heads, during your opponent's next turn, the Defending Pokémon can't attack.";
const BARE = "During your opponent's next turn, the Defending Pokémon can't attack.";
const COINPARA =
  "Flip a coin. If heads, your opponent's Active Pokémon is now Paralyzed.";

report("TARGET (the print)", TARGET);
report("BARE LOCK", BARE);
report("COIN + PARALYZED (builds per brief)", COINPARA);

// The whole "During your opponent's next turn," family from the corpus
console.log("\n\n########## DURATION FAMILY (corpus rows) ##########");
const corpus = legalAttackCorpus();
console.log("corpus rows:", corpus.length);
const fam = corpus
  .map((r, i) => [i, r[0], r[1]] as const)
  .filter(([, , t]) => /during your opponent's next turn/i.test(t));
console.log("family size:", fam.length, "printings:", fam.reduce((a, f) => a + f[1], 0));
for (const [idx, units, t] of fam) {
  const claims = names.filter((n) => {
    const v = mod[n]?.(t);
    return v !== null && v !== undefined;
  });
  const g = mod.splitAttackGateClause?.(t);
  const tr = mod.splitAttackTrailingClause?.(t);
  console.log(
    `\n[arrIdx ${idx}] units=${units} claimed=${claims.length}/13 ${claims.join(",")}`,
  );
  console.log(`   ${JSON.stringify(t)}`);
  console.log(`   gate=${JSON.stringify(g)} trailing=${JSON.stringify(tr)}`);
}
