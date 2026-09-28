const { MUTANTS } = await import("/home/jofre/projects/luminous_ui/scripts/mutation/mutants.ts");
type Row = Record<string, string> & { survives?: { kind: string; reason: string } };
const ROWS = MUTANTS as Row[];
// The SEVEN lines D499 deleted, verbatim from `git diff -U0`.
const DELETED = [
  'coinFlip !== null && coinFlip.kind !== "cancelOnTails" && coinFlip.kind !== "programPerHeads"',
  "const [faces, rngState] =",
  'coinFlip.kind === "cancelOnTails"',
  "takeFlips(next, action.seat, active, ONE_FLIP)",
  "takeFlips(next, action.seat, active, coinFlip.flips)",
  'if (coinFlip.kind === "cancelOnTails") {',
  "return ATTACK_COIN_CANCEL.test(effect) ? { kind: \"cancelOnTails\" } : null;",
];
// The STRUCTURES D499 extended, for D466's second test.
const EXTENDED = ["AttackCoinFlip", "cancelOnTails", "takeFlips", "printedFlips", "program", "ONE_FLIP", "coinExplainsModifier", "ATTACK_COIN_CANCEL"];

for (const d of ROWS.filter((m) => m.survives !== undefined && (m.file.endsWith("attack.ts") || m.file.endsWith("effects.ts")))) {
  const reason = d.survives?.reason ?? "";
  const hitsDeleted = DELETED.filter((l) => reason.includes(l) || d.find.includes(l));
  const hitsExtended = EXTENDED.filter((s) => reason.includes(s));
  if (hitsDeleted.length === 0 && hitsExtended.length === 0) continue;
  console.log("### " + d.id + " (" + d.decision + ") " + d.file.split("/").pop());
  if (hitsDeleted.length) console.log("    quotes a DELETED line: " + JSON.stringify(hitsDeleted));
  if (hitsExtended.length) console.log("    reason names an EXTENDED structure: " + hitsExtended.join(", "));
  console.log("    reason: " + reason.slice(0, 700));
  console.log("");
}
