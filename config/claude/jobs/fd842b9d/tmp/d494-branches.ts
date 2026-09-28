import { legalAttackCorpus, resolvedByAnyReader } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus.ts";
import { splitAttackGateClause, splitAttackTrailingClause, deriveAttackDamageSuppression, deriveAttackEffect } from "/home/jofre/projects/luminous_ui/packages/engine/src/effects.ts";

const rows = legalAttackCorpus() as unknown as [number, string][];
// The CANONICAL residue predicate, copied verbatim from censusAtHead.test.ts (D430:
// copy the predicate, do not reconstruct it). REGISTRY_ATTACK_SENTENCES is a test-file
// constant; the two rows below are checked against it separately.
const raw = rows.filter(([, t]) => !resolvedByAnyReader(t));
const residue = raw.filter(([, t]) => {
  const gate = splitAttackGateClause(t);
  if (gate !== null && gate.body !== "" && resolvedByAnyReader(gate.body)) return false;
  return splitAttackTrailingClause(t) === null;
});
const P = (xs: [number, string][]) => `${xs.length}s/${xs.reduce((a, [n]) => a + n, 0)}p`;
console.log("raw unbuilt (no registry subtraction):", P(raw));
console.log("residue (gate+trailing subtracted, registry NOT):", P(residue));
console.log();

// ── BRANCH D: widen splitAttackTrailingClause to admit a SUPPRESSION tail. ─────
// Solo payoff = residue rows of the form "HEAD. TAIL" where some reader claims HEAD
// and `deriveAttackDamageSuppression` claims TAIL. Split at EVERY ". " boundary
// (the loosest plausible shape — D419/D424: state the pattern).
const freedByD: [number, string][] = [];
for (const [n, t] of residue) {
  let hit = false;
  for (let i = 0; i + 2 <= t.length; i++) {
    if (t.slice(i, i + 2) !== ". ") continue;
    const head = t.slice(0, i + 1);
    const tail = t.slice(i + 2);
    if (resolvedByAnyReader(head) && deriveAttackDamageSuppression(tail) !== null) { hit = true; break; }
  }
  if (hit) freedByD.push([n, t]);
}
console.log("[BRANCH D] trailing splitter widened to a SUPPRESSION tail, ALONE:", P(freedByD));
for (const [n, t] of freedByD) console.log("   ", n + "p", t);
console.log();

// Same, but with the tail admitted by ANY reader (D493's `D409-tail-guard-widened-to-any-reader`)
const freedAny: [number, string][] = [];
for (const [n, t] of residue) {
  let hit = false;
  for (let i = 0; i + 2 <= t.length; i++) {
    if (t.slice(i, i + 2) !== ". ") continue;
    const head = t.slice(0, i + 1);
    const tail = t.slice(i + 2);
    if (resolvedByAnyReader(head) && resolvedByAnyReader(tail)) { hit = true; break; }
  }
  if (hit) freedAny.push([n, t]);
}
console.log("[BRANCH D'] trailing splitter widened to ANY-reader tail, ALONE:", P(freedAny));
for (const [n, t] of freedAny) console.log("   ", n + "p", t);
console.log();

// ── Does row 337's HEAD build if the head-vocabulary lands? and its TAIL? ──────
const H = "If you have 3 or more Energy in play, this attack does 70 more damage.";
const T = "This attack's damage isn't affected by Weakness.";
console.log("337 head claimed today:", resolvedByAnyReader(H));
console.log("337 tail claimed today:", resolvedByAnyReader(T), " (suppression reader:", deriveAttackDamageSuppression(T), ")");
console.log("deriveAttackEffect(337 tail):", deriveAttackEffect(T));
console.log("splitAttackTrailingClause(337 full):", splitAttackTrailingClause("If you have 3 or more Energy in play, this attack does 70 more damage. This attack's damage isn't affected by Weakness."));
