import { legalAttackCorpus, resolvedByAnyReader } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus";
import * as E from "/home/jofre/projects/luminous_ui/packages/engine/src/effects";

const ROW =
  'This attack does 40 damage for each Pokémon in play that has "Koffing" or "Weezing" in its name (both yours and your opponent\'s).';

console.log("=== derived value ===");
console.log(JSON.stringify(E.deriveAttackDamageMultiplier(ROW), null, 1));
console.log("resolvedByAnyReader:", resolvedByAnyReader(ROW));
console.log("splitGate:", E.splitAttackGateClause(ROW), "splitTrailing:", E.splitAttackTrailingClause(ROW));

// which OTHER readers claim it?
for (const [n, f] of Object.entries(E)) {
  if (!n.startsWith("deriveAttack") || typeof f !== "function") continue;
  const out = (f as (s: string) => unknown)(ROW);
  if (out !== null && out !== undefined) console.log("claimed by", n);
}

// corpus sweep: which rows does the new anchor claim?
const RX = /^This attack does (\d+) damage for each Pokémon in play that has "([^"]+)" or "([^"]+)" in its name \(both yours and your opponent['’]s\)\.$/;
const rows = legalAttackCorpus();
console.log("corpus rows:", rows.length, "printings:", rows.reduce((s, [n]) => s + n, 0));
const hit = rows.filter(([, s]) => RX.test(s));
console.log("new anchor matches:", hit.length, "sentences /", hit.reduce((s, [n]) => s + n, 0), "printings");
for (const [n, s] of hit) console.log("  ", n, JSON.stringify(s));

// absence measurements
const q = (re: RegExp) => rows.filter(([, s]) => re.test(s));
console.log('"more" twin of this shape:', q(/^This attack does \d+ more damage for each Pokémon in play that has "[^"]+" or "[^"]+" in its name \(both yours and your opponent['’]s\)\.$/).length);
console.log('both-sides in-play "more" ANY noun:', q(/more damage for each .* in play.*both yours and your opponent/).length);
console.log('one-fragment form of this shape:', q(/for each Pokémon in play that has "[^"]+" in its name/).length);
console.log('"Basic Pokémon in play that has":', q(/for each (of your )?Basic Pokémon in play that has /).length);
console.log('rows containing " in its name":', q(/ in its name/).length);
console.log('rows containing "in play that has":', q(/in play that has /).map(([n,s])=>[n,s]));

// quote bytes on the three "in its name" rows
for (const [n, s] of q(/ in its name/)) {
  const idx: number[] = [];
  for (let i = 0; i < s.length; i++) if (s.codePointAt(i) === 0x22) idx.push(i);
  const ap: number[] = [];
  for (let i = 0; i < s.length; i++) { const c = s.codePointAt(i); if (c === 0x27 || c === 0x2019) ap.push(c ?? 0); }
  console.log("  n=", n, "quoteU+0022 idx:", idx.join(","), "apostrophes:", ap.map((c) => "U+" + c.toString(16).toUpperCase().padStart(4, "0")).join(","));
}
