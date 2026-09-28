import { legalAttackCorpus } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus";
const rows = legalAttackCorpus() as unknown as any[];
console.log("corpus rows:", rows.length, "shape:", JSON.stringify(rows[0]));
const texts = rows.map((r) => (Array.isArray(r) ? r[1] : r.text ?? r.sentence));
const ANCHOR = /^Your opponent discards a card from their hand\. If (.+), your opponent discards (\d+) more cards\.$/;
const hits = texts.filter((t: string) => ANCHOR.test(t.trim()));
console.log("compound anchor hits:", hits.length, hits);
// the WIDER family: any "N more cards" tail
const MORE = /discards? (\d+) more cards?/;
console.log("'N more cards' anywhere:", texts.filter((t: string) => MORE.test(t)).length);
// what the new clause row would newly claim: any sentence containing the Salandit clause
const CLAUSE = "this Pokémon evolved from Salandit during this turn";
console.log("sentences containing the clause:", texts.filter((t: string) => t.includes(CLAUSE)).length);
// tail-only anchor claim over the corpus
const TAILONLY = /^If (.+), your opponent discards (\d+) more cards\.$/;
console.log("tail-only anchor hits over whole sentences:", texts.filter((t: string) => TAILONLY.test(t.trim())).length);
// bonus skeleton over the clause
const BONUS = /^If (.+), this attack does (\d+) more damage\.$/;
console.log("bonus skeleton + Salandit clause:", texts.filter((t: string) => { const m = BONUS.exec(t.trim()); return m !== null && m[1] === CLAUSE; }).length);
