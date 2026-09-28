import { legalAttackCorpus, resolvedByAnyReader } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus";

const BODY =
  `attack (?:also )?does (\\d+) damage to (\\d+) of (your opponent['’]s|your) Benched Pokémon` +
  "( that has any damage counters on it)?\\." +
  `(?: \\(Don['’]t apply Weakness and Resistance for Benched Pokémon\\.\\))?`;

const cands: [string, RegExp][] = [
  ["MIN untyped (bench, shared body)", new RegExp(`^Discard (all|\\d+) Energy from this Pokémon(?:\\. This|, and this) ${BODY}$`)],
  ["TYPED-optional (code or name)", new RegExp(
     `^Discard (all|\\d+)(?: \\{([WRGLPFDMYNC])\\})? Energy from this Pokémon(?:\\. This|, and this) ${BODY}$`)],
  ["LITERAL-narrow: no also, no side capture, no damagedOnly", new RegExp(
     `^Discard (all|\\d+) Energy from this Pokémon(?:\\. This|, and this) attack (?:also )?does (\\d+) damage to (\\d+) of your opponent['’]s Benched Pokémon\\.(?: \\(Don['’]t apply Weakness and Resistance for Benched Pokémon\\.\\))?$`)],
  ["WIDE: join is any of . This|, and this|; also allow 'an'", new RegExp(
     `^Discard (all|an|\\d+) Energy from this Pokémon(?:\\. This|, and this) ${BODY}$`)],
  ["EXISTING SELF_DISCARD_THEN_ANY_TARGET", new RegExp(
     "^Discard (all|\\d+) Energy from this Pokémon(?:\\. This|, and this) " +
     `attack does (\\d+) damage to (\\d+) of your opponent['’]s Pokémon\\.` +
     `(?: \\(Don['’]t apply Weakness and Resistance for Benched Pokémon\\.\\))?$`)],
];

const corpus = legalAttackCorpus();
for (const [name, re] of cands) {
  let s = 0, p = 0; const hits: string[] = [];
  let already = 0, alreadyP = 0;
  for (const [n, t] of corpus) {
    if (re.test(t)) {
      s++; p += n; hits.push(`${n}p ${t.slice(0,120)}`);
      if (resolvedByAnyReader(t)) { already++; alreadyP += n; }
    }
  }
  console.log(`\n### ${name}\n  claims ${s} sentences / ${p} printings (of which ALREADY resolved: ${already}/${alreadyP})`);
  for (const h of hits) console.log("   ", h);
}
