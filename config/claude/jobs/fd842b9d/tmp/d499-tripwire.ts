const { MUTANTS } = await import("/home/jofre/projects/luminous_ui/scripts/mutation/mutants.ts");
console.log("corpus rows (from the MODULE): " + MUTANTS.length);
const NEEDLES = [
  "ATTACK_COIN_CANCEL",
  "cancelOnTails",
  "ATTACK_COIN_BONUS",
  "deriveAttackCoinFlip",
  "AttackCoinFlip",
  "ATTACK_FAILED",
  "coinFlipGate",
  "FLIP_PREVENT",
  "preventDamage",
  "does nothing",
  "If tails",
  "If heads",
  "prevent all damage from and effects",
  "ONE_FLIP",
  "takeFlips",
  "programPerHeads",
  "otherwise",
  "during your opponent's next turn",
  "coinFlip",
  "effects: true",
  "preventedUntil",
];
for (const n of NEEDLES) {
  const hits = MUTANTS.filter((m: Record<string, unknown>) =>
    [m.id, m.decision, m.what, m.find, m.replace, m.file, JSON.stringify(m.survives ?? "")]
      .join(" ")
      .includes(n),
  );
  console.log("");
  console.log("### " + n + " -> " + hits.length + " row(s)");
  for (const h of hits as Record<string, string>[]) {
    const where = [
      (h.id + " " + h.what).includes(n) ? "META" : "",
      (h.find ?? "").includes(n) ? "FIND" : "",
      (h.replace ?? "").includes(n) ? "REPLACE" : "",
    ]
      .filter(Boolean)
      .join("/");
    console.log("   [" + where + "] " + h.id + "  (" + h.decision + ")  file=" + h.file);
  }
}
