import { MUTANTS } from "/home/jofre/projects/luminous_ui/scripts/mutation/mutants.ts";
const rows = MUTANTS as unknown as {
  id: string; decision: string; what: string; file: string; find: string; replace: string;
  expectKilledBy?: string[]; survives?: { kind: string; reason: string };
}[];
console.log(`corpus rows (from the MODULE): ${rows.length}`);
console.log(`declared survivors: ${rows.filter((r) => r.survives !== undefined).length}`);

// NEEDLES: the CODE LINES this slice would add / the family it touches (D493 — the needle is the code line)
const needles: [string, string][] = [
  ["the widening line itself", "coinFlipGate"],
  ["the consequent op", "preventAttack"],
  ["the anchor family name", "FLIP_PREVENT_DAMAGE"],
  ["the bare arm's anchor", "DEFENDER_CANT_ATTACK_NEXT_TURN"],
  ["the tails sibling", "FLIP_TAILS_SELF_CANT_ATTACK"],
  ["the compound sibling", "SELF_DISCARD_ONE_THEN_DEFENDER_LOCK"],
  ["the basic-gated sibling", "DEFENDER_BASIC_CANT_ATTACK"],
  ["the gate splitter", "splitAttackGateClause"],
  ["the trailing splitter guard", "claimedByAnyReader"],
  ["target defender", 'target: "defender"'],
  ["the printed sentence", "can't attack"],
  ["the duration clause", "next turn"],
  ["the durated record", "attackLocked"],
  ["the durated stamp", "lockedAttackTurn"],
  ["the event", "ATTACK_LOCKED"],
  ["the gate event", "ATTACK_EFFECT_COIN_FLIP"],
  ["onTails", "onTails"],
  ["the describer", "withConsequence"],
  ["the note path", "conditionNote"],
];
for (const [label, needle] of needles) {
  const hits = rows.filter(
    (r) =>
      r.id.includes(needle) || r.decision.includes(needle) || r.what.includes(needle) ||
      r.find.includes(needle) || r.replace.includes(needle) ||
      (r.survives?.reason ?? "").includes(needle),
  );
  console.log(`\n--- needle ${JSON.stringify(needle)} (${label}): ${hits.length} row(s)`);
  for (const h of hits.slice(0, 60)) {
    const where = [
      r_in(h.id, needle) && "id", r_in(h.what, needle) && "what",
      r_in(h.find, needle) && "find", r_in(h.replace, needle) && "replace",
      r_in(h.survives?.reason ?? "", needle) && "reason",
    ].filter(Boolean).join("+");
    console.log(`    ${h.id}  [${h.file}]  in:${where}${h.survives ? "  SURVIVOR(" + h.survives.kind + ")" : ""}`);
  }
  if (hits.length > 60) console.log(`    ... ${hits.length - 60} more`);
}
function r_in(s: string, n: string) { return s.includes(n); }
