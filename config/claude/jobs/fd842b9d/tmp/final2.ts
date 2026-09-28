import { legalAttackCorpus, resolvedByAnyReader } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus";
const corpus = legalAttackCorpus();
function survey(name: string, re: RegExp) {
  const hits = corpus.filter(([, s]) => re.test(s));
  const un = hits.filter(([, s]) => !resolvedByAnyReader(s));
  console.log(`\n### ${name}: corpus ${hits.length}s/${hits.reduce((a,[n])=>a+n,0)}p | unresolved ${un.length}s/${un.reduce((a,[n])=>a+n,0)}p`);
  for (const [n, s] of hits) console.log(`   ${resolvedByAnyReader(s)?"BUILT ":"UNBUILT"} [${n}] ${s}`);
}
survey("that has the <Name> attack (whole corpus, TOTAL check)", /has the .+ attack/);
survey("Round attack only", /that has the Round attack/);
survey("in its name (TOTAL)", /in its name/);
survey("Pokémon ex / Pokémon V nouns in a 'for each' count", /for each [^.]*Pokémon (ex|V)\b/);
survey("Heal N damage from each of your <noun>", /^Heal \d+ damage from each of your /);
survey("bare 'This attack does N (more )?damage for each ... discard pile.'", /^This attack does \d+ (more )?damage for each .+ discard pile\.$/);
