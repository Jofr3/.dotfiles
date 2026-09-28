import * as effects from "/home/jofre/projects/luminous_ui/packages/engine/src/effects";
import { attackReaderSurface, legalAttackCorpus } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus";

const WHOLE =
  "Your opponent discards a card from their hand. If this Pokémon evolved from Salandit during this turn, your opponent discards 2 more cards.";
const HEAD = "Your opponent discards a card from their hand.";
const TAIL = "If this Pokémon evolved from Salandit during this turn, your opponent discards 2 more cards.";

const surface = attackReaderSurface();
console.log("reader surface length:", surface.length);
for (const s of [WHOLE, HEAD, TAIL]) {
  console.log("=== ", JSON.stringify(s.slice(0, 60)));
  for (const name of surface) {
    const fn = (effects as any)[name] as (t: string) => unknown;
    let out: unknown;
    try { out = fn(s); } catch (e) { out = `THREW ${(e as Error).message}`; }
    console.log(`  ${name}: ${out === null ? "null" : JSON.stringify(out)}`);
  }
}
// splitters
for (const name of Object.keys(effects)) {
  if (/split|Split/.test(name) && typeof (effects as any)[name] === "function") {
    console.log("SPLITTER", name);
  }
}
const corpus = legalAttackCorpus();
const rows = corpus.filter((r: any) => (r.text ?? r.sentence ?? "").includes("Salandit"));
console.log("corpus rows w/ Salandit:", JSON.stringify(rows, null, 1).slice(0, 2000));
