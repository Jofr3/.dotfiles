import { legalAttackCorpus } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus";
const corpus = legalAttackCorpus();
const tot = (rs: readonly (readonly [number,string])[]) => `${rs.length} sentences / ${rs.reduce((a,[u])=>a+u,0)} printings`;
console.log("=== every distinct token-run following 'Benched Pokémon' in the column ===");
const seen = new Map<string, number>();
for (const [u, t] of corpus) {
  for (const m of t.matchAll(/Benched Pokémon([^.]*)/g)) {
    const k = JSON.stringify(m[1]);
    seen.set(k, (seen.get(k) ?? 0) + u);
  }
}
for (const [k, v] of [...seen].sort()) console.log(`  ${v.toString().padStart(3)}  ${k}`);
console.log("\n=== every distinct run following \"opponent's Pokémon\" ===");
const seen2 = new Map<string, number>();
for (const [u, t] of corpus) {
  for (const m of t.matchAll(/opponent['’]s Pokémon([^.]*)/g)) {
    const k = JSON.stringify(m[1]);
    seen2.set(k, (seen2.get(k) ?? 0) + u);
  }
}
for (const [k, v] of [...seen2].sort()) console.log(`  ${v.toString().padStart(3)}  ${k}`);

console.log("\n=== D472: what each candidate widening of ALSO_BENCHED_SNIPE_BODY claims over all 640 ===");
const BASE =
  `attack (?:also )?does (\\d+) damage to (\\d+) of (your opponent['’]s|your) Benched Pokémon` +
  "( that has any damage counters on it)?\\." +
  `(?: \\(Don['’]t apply Weakness and Resistance for Benched Pokémon\\.\\))?`;
const withClass = (cls: string) =>
  `attack (?:also )?does (\\d+) damage to (\\d+) of (your opponent['’]s|your) Benched Pokémon` +
  cls +
  "( that has any damage counters on it)?\\." +
  `(?: \\(Don['’]t apply Weakness and Resistance for Benched Pokémon\\.\\))?`;
const variants: [string, string][] = [
  ["HEAD (no class group)", BASE],
  ["A: ( ex| ex or Benched Pokémon V)?  [the two printed nouns]", withClass("( ex or Benched Pokémon V| ex)?")],
  ["B: ( (?:ex|V|VMAX|VSTAR)(?: or Benched Pokémon (?:ex|V|VMAX|VSTAR))?)?  [whole suffix vocab]", withClass("( (?:ex|V|VMAX|VSTAR)(?: or Benched Pokémon (?:ex|V|VMAX|VSTAR))?)?")],
  ["C: ( [^.]+)?  [saturating]", withClass("( [^.]+)?")],
];
for (const [label, body] of variants) {
  for (const [caller, wrap] of [
    ["ALSO_BENCHED_SNIPE  ^This …$", (b: string) => `^This ${b}$`],
    ["CONDITIONAL_BENCH_SNIPE ^If (.+), this …$", (b: string) => `^If (.+), this ${b}$`],
    ["SELF_DISCARD_THEN_BENCH_SNIPE", (b: string) => `^Discard (all|\\d+)(?: \\{([GRWLPFDMCN])\\})? Energy from this Pokémon(?:\\. This|, and this) ${b}$`],
  ] as const) {
    const re = new RegExp(wrap(body));
    const hit = corpus.filter(([, t]) => re.test(t));
    console.log(`  ${label.padEnd(62)} | ${caller.padEnd(32)} ${tot(hit)}`);
  }
}
console.log("\n=== rows newly claimed by variant A vs HEAD, per caller ===");
for (const [caller, wrap] of [
  ["ALSO_BENCHED_SNIPE", (b: string) => `^This ${b}$`],
  ["CONDITIONAL_BENCH_SNIPE", (b: string) => `^If (.+), this ${b}$`],
  ["SELF_DISCARD_THEN_BENCH_SNIPE", (b: string) => `^Discard (all|\\d+)(?: \\{([GRWLPFDMCN])\\})? Energy from this Pokémon(?:\\. This|, and this) ${b}$`],
  ["OPTIONAL_COST_PAYOFF_BENCH_SNIPE", (b: string) => `^this ${b}$`],
] as const) {
  const before = new Set(corpus.filter(([, t]) => new RegExp(wrap(BASE)).test(t)).map(([, t]) => t));
  const after = corpus.filter(([, t]) => new RegExp(wrap(withClass("( ex or Benched Pokémon V| ex)?"))).test(t));
  const added = after.filter(([, t]) => !before.has(t));
  console.log(`  ${caller}: +${added.length} sentences / +${added.reduce((a,[u])=>a+u,0)} printings`);
  for (const [u, t] of added) console.log(`      [${u}p] ${t}`);
}
