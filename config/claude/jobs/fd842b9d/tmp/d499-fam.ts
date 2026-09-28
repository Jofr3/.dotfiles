import * as effects from "/home/jofre/projects/luminous_ui/packages/engine/src/effects.ts";
import { attackReaderSurface, legalAttackCorpus, resolvedByAnyReader } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus.ts";

const NAMES = attackReaderSurface();
const R = (n: string) => (effects as Record<string, unknown>)[n] as (t: string) => unknown;
const corpus = legalAttackCorpus();
// file line of a corpus sentence = index + OFFSET; derive OFFSET from the known row
const src = await Bun.file("/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus.ts").text();
const lines = src.split("\n");
function fileLine(sentence: string): number {
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]!;
    const cut = l.indexOf(" ");
    if (cut > 0 && l.slice(cut + 1) === sentence && /^\d+$/.test(l.slice(0, cut))) return i + 1;
  }
  return -1;
}
console.log("corpus rows: %d, total printings: %d", corpus.length, corpus.reduce((a, [u]) => a + u, 0));

// ── canonical residue predicate, copied VERBATIM from censusAtHead.test.ts (see below) ──
const REG = new Set<string>();  // filled later
function served(text: string): boolean { return false; }

// FAMILY A: the gate family, BOTH faces
const gate = corpus.filter(([, t]) => /^Flip a coin\. If (heads|tails), /.test(t));
console.log("\n=== ^Flip a coin\\. If (heads|tails),  family: %d sentences / %d printings", gate.length, gate.reduce((a,[u])=>a+u,0));
for (const [u, t] of gate) {
  const claims = NAMES.filter((n) => R(n)(t) !== null);
  console.log("  line %d  %dp  [%s]  %s", fileLine(t), u, claims.join("+") || "REFUSED", t);
}
const headsOnly = corpus.filter(([, t]) => /^Flip a coin\. If heads, /.test(t));
const tailsFirst = corpus.filter(([, t]) => /^Flip a coin\. If tails, /.test(t));
console.log("  -- ^...If heads, : %d sentences / %dp ; ^...If tails, : %d sentences / %dp",
  headsOnly.length, headsOnly.reduce((a,[u])=>a+u,0), tailsFirst.length, tailsFirst.reduce((a,[u])=>a+u,0));

// FAMILY B: during your opponent's next turn
const dur = corpus.filter(([, t]) => t.includes("during your opponent's next turn,") || t.includes("During your opponent's next turn,"));
const durBuilt = dur.filter(([, t]) => resolvedByAnyReader(t));
console.log("\n=== 'during your opponent's next turn,' (either case): %d sentences / %d printings; reader-built %d / %dp, unread %d / %dp",
  dur.length, dur.reduce((a,[u])=>a+u,0),
  durBuilt.length, durBuilt.reduce((a,[u])=>a+u,0),
  dur.length - durBuilt.length, dur.reduce((a,[u])=>a+u,0) - durBuilt.reduce((a,[u])=>a+u,0));
for (const [u, t] of dur) {
  if (resolvedByAnyReader(t)) continue;
  console.log("  UNREAD line %d %dp  %s", fileLine(t), u, t);
}

// the prevent-family
const prev = corpus.filter(([, t]) => t.includes("prevent all damage from and effects of attacks done to this Pokémon"));
console.log("\n=== 'prevent all damage from and effects of attacks done to this Pokémon': %d sentences / %dp", prev.length, prev.reduce((a,[u])=>a+u,0));
for (const [u, t] of prev) {
  const claims = NAMES.filter((n) => R(n)(t) !== null);
  console.log("  line %d %dp [%s] %s", fileLine(t), u, claims.join("+") || "REFUSED", t);
}
