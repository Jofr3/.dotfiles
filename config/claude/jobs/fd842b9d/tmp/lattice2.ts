import { legalAttackCorpus, resolvedByAnyReader } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus";
import { deriveAttackEffect, splitAttackGateClause, splitAttackTrailingClause } from "/home/jofre/projects/luminous_ui/packages/engine/src/effects";
import { readFileSync } from "node:fs";
const CENSUS = "/home/jofre/projects/luminous_ui/packages/engine/src/censusAtHead.test.ts";
const src = readFileSync(CENSUS, "utf8");
const head = src.indexOf('const REGISTRY_ATTACKS: readonly (readonly [string, string])[] = [');
const block = src.slice(head, src.indexOf("\n];", head)).split("\n").map((l) => l.replace(/\s*\/\/.*$/, "")).join("\n");
const REGISTRY = new Set<string>();
for (const m of block.matchAll(/\[\s*"(sv[a-z0-9.]*-\d+)"\s*,\s*"((?:[^"\\]|\\.)*)"\s*,?\s*\]/g)) REGISTRY.add((m[2] ?? "").replace(/\\"/g, '"'));
const builds = (t: string): boolean => {
  if (resolvedByAnyReader(t)) return true;
  if (REGISTRY.has(t)) return true;
  const g = splitAttackGateClause(t);
  if (g !== null && g.body !== "" && resolvedByAnyReader(g.body)) return true;
  return splitAttackTrailingClause(t) !== null;
};
/** D505's RIDER: the points THIS slice's arm claims, keyed on the derived VALUE. */
const claimedByD515 = (t: string): boolean => {
  const p = deriveAttackEffect(t);
  if (p === null || p.length !== 2) return false;
  const [a, b] = p as any[];
  return a?.op === "payFromHand" && b?.op === "recordGate" && b.then?.length === 1 && b.then[0]?.op === "opponentDiscardsFromHand";
};
const OPENER = ["Discard a card from your hand.", "Draw 2 cards."] as const;
const conseq = (c: number, n: number) => c === 0
  ? (n === 0 ? "your opponent discards a card from their hand" : "your opponent discards 2 cards from their hand")
  : (n === 0 ? "draw 1 cards" : "draw 2 cards");
const point = (a: number, b: number, c: number, d: number) => {
  const t = conseq(c, d);
  return b === 0 ? `${OPENER[a]} If you do, ${t}.` : `${OPENER[a]} ${t[0]!.toUpperCase()}${t.slice(1)}.`;
};
const NAMES = ["OPENER", "GATE", "CONSEQ", "COUNT"];
type Row = { bits: number[]; s: string; r: boolean; b: boolean; mine: boolean };
const rows: Row[] = [];
for (let i = 0; i < 16; i++) {
  const bits = [(i >> 3) & 1, (i >> 2) & 1, (i >> 1) & 1, i & 1];
  const s = point(bits[0]!, bits[1]!, bits[2]!, bits[3]!);
  rows.push({ bits, s, r: resolvedByAnyReader(s), b: builds(s), mine: claimedByD515(s) });
}
console.log("distinct strings:", new Set(rows.map((r) => r.s)).size, "/ 16");
console.log("points this arm claims:", rows.filter((r) => r.mine).map((r) => r.bits.join("")));
const report = (label: string, get: (r: Row) => boolean, sub: boolean) => {
  const v = (r: Row) => (sub && r.mine ? false : get(r));
  const w = [0, 1, 2, 3, 4].map((k) => { const at = rows.filter((r) => r.bits.reduce((a, b) => a + b, 0) === k); return `${at.filter(v).length}/${at.length}`; });
  const flips = NAMES.map((n, i) => {
    let f = 0;
    for (const r of rows) { if (r.bits[i] === 1) continue; const o = rows.find((y) => y.bits.every((b, j) => (j === i ? b === 1 : b === r.bits[j])))!; if (v(o) !== v(r)) f++; }
    return `${n} ${f}`;
  });
  console.log(`${label}: ${w.join(" · ")}  = ${rows.filter(v).length}/16   flips(of 8): ${flips.join(" · ")}`);
};
report("PRE  builds()   ", (r) => r.b, true);
report("POST builds()   ", (r) => r.b, false);
report("PRE  readers-only", (r) => r.r, true);
report("POST readers-only", (r) => r.r, false);
console.log("divergent builds!=readers (POST):", rows.filter((r) => r.b !== r.r).length, "of 16");
const corpus = new Map(legalAttackCorpus().map(([n, s]) => [s, n]));
console.log("PRINTED points:", rows.filter((r) => corpus.has(r.s)).map((r) => `${r.bits.join("")} ${corpus.get(r.s)}p`));
// the "printed zero times" measurements the live axes owe
const GATED_PLURAL = /^Discard a card from your hand\. If you do, your opponent discards \d+ cards from their hand\.$/;
console.log("gated-plural rows in the 640-sentence column:", legalAttackCorpus().filter(([, s]) => GATED_PLURAL.test(s)).length);
