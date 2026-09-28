import * as e from "/home/jofre/projects/luminous_ui/packages/engine/src/effects";
import { attackReaderSurface, resolvedByAnyReader, legalAttackCorpus } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus";
const R = attackReaderSurface();
const claims = (s: string) => R.filter((n) => ((e as any)[n])(s) !== null);
const P = "This attack does 30 damage for each {W} Energy attached to this Pokémon. Before doing damage, you may attach any number of Basic {W} Energy cards from your hand to this Pokémon.";
const HEAD = "This attack does 30 damage for each {W} Energy attached to this Pokémon.";
const TAIL = "Before doing damage, you may attach any number of Basic {W} Energy cards from your hand to this Pokémon.";
const TYPED_SIB = "You may attach any number of Basic {W} Energy cards from your hand to your Pokémon in any way you like.";
const BARE_SIB = "You may attach any number of Basic Energy cards from your hand to your Pokémon in any way you like.";
const TOSELF = "Attach an Energy card from your hand to this Pokémon. If you do, heal 60 damage from this Pokémon.";
console.log("surface:", R.length);
console.log("HEAD claims:", claims(HEAD), JSON.stringify(e.deriveAttackDamageMultiplier(HEAD)));
console.log("TAIL claims:", claims(TAIL));
console.log("PRINT claims:", claims(P));
console.log("TYPED_SIB:", JSON.stringify(e.deriveAttackEffect(TYPED_SIB)));
console.log("BARE_SIB:", JSON.stringify(e.deriveAttackEffect(BARE_SIB)));
console.log("TOSELF:", JSON.stringify(e.deriveAttackEffect(TOSELF)));
console.log("split(HEAD + ' ' + TYPED_SIB):", JSON.stringify(e.splitAttackTrailingClause(`${HEAD} ${TYPED_SIB}`)));
console.log("split(PRINT):", JSON.stringify(e.splitAttackTrailingClause(P)));
const corpus = legalAttackCorpus();
const row = corpus.find(([, t]) => t === P);
console.log("corpus row printings:", row?.[0]);
console.log("corpus index (0-based):", corpus.findIndex(([, t]) => t === P));
const pre = corpus.filter(([, t]) => e.deriveAttackPreDamage(t) !== null);
console.log("preDamage-claimed:", pre.length, "sentences /", pre.reduce((s, [n]) => s + n, 0), "printings");
const scalingReaders = ["deriveAttackDamageBonus","deriveAttackDamageMultiplier","deriveAttackDamagePenalty"];
console.log("of those, also claimed by a scaling reader:", pre.filter(([, t]) => scalingReaders.some((k) => ((e as any)[k])(t) !== null)).length);
const bothNeeded = corpus.filter(([, t]) => /^.*\. Before doing damage, /.test(t) || /[Bb]efore doing damage/.test(t) && /for each/i.test(t));
console.log("corpus rows carrying BOTH a 'for each' fold and a 'before doing damage' clause:", bothNeeded.length, JSON.stringify(bothNeeded.map(([n,t])=>[n,t.slice(0,40)])));
// the typed sibling printings
for (const s of [TYPED_SIB, BARE_SIB]) {
  const r = corpus.find(([, t]) => t === s);
  console.log(`corpus row for ${JSON.stringify(s.slice(0,45))}... =>`, r ? `${r[0]} printings` : "NOT A CORPUS ROW");
}
console.log("TYPED_SIB in corpus?", corpus.some(([, t]) => t === TYPED_SIB));
