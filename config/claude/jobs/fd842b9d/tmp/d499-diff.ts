// The FOUR pre-probe passes, run over D499's own rows.
//   (1) find-vs-replace diff  — catches INERT rows (D450/D451)
//   (2) what-vs-replace read   — catches MIS-DESCRIBED rows (D477/D478)
//   (3) region overlap         — which PRE-EXISTING rows sit in a span D499 edited (D447)
//   (4) `$`-special audit      — which rows depend on the literal patcher (D492)
const { MUTANTS } = await import("/home/jofre/projects/luminous_ui/scripts/mutation/mutants.ts");
type Row = Record<string, string> & { survives?: { kind: string; reason: string } };
const ROWS = MUTANTS as Row[];
const MINE = ROWS.filter((m) => m.decision.includes("D499"));

console.log("=== (1) find vs replace — INERT check ===");
for (const m of MINE) {
  const same = m.find === m.replace;
  // strip comments and whitespace from both sides: what is left is the SEMANTIC delta
  const strip = (s: string) => s.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, " ").trim();
  const sf = strip(m.find);
  const sr = strip(m.replace);
  console.log(
    (same ? "  ❌ IDENTICAL " : sf === sr ? "  ❌ COMMENT-ONLY " : "  ok           ") +
      m.id,
  );
  if (sf !== sr) {
    // show the first differing token run, short
    let i = 0;
    while (i < sf.length && i < sr.length && sf[i] === sr[i]) i++;
    console.log("        find …" + sf.slice(Math.max(0, i - 20), i + 60));
    console.log("        repl …" + sr.slice(Math.max(0, i - 20), i + 60));
  }
}

console.log("");
console.log("=== (2) `what` names the token that MOVED ===");
for (const m of MINE) {
  const words = m.what.toLowerCase();
  const hints: string[] = [];
  if (/\^/.test(m.find) !== /\^/.test(m.replace)) hints.push("caret");
  if (/\$\/;/.test(m.find) !== /\$\/;/.test(m.replace)) hints.push("terminator");
  if (m.find.includes("['’]") !== m.replace.includes("['’]")) hints.push("apostrophe");
  if (m.find.includes("effects: true") !== m.replace.includes("effects: true")) hints.push("effects");
  const ok =
    (hints.includes("caret") ? words.includes("caret") || words.includes("`^`") : true) &&
    (hints.includes("terminator") ? words.includes("$") : true) &&
    (hints.includes("apostrophe") ? words.includes("apostroph") : true) &&
    (hints.includes("effects") ? words.includes("effects") : true);
  console.log((ok ? "  ok   " : "  ❌   ") + m.id + "   moved: [" + hints.join(",") + "]");
}

console.log("");
console.log("=== (3) region overlap: pre-existing rows in a span D499 edited ===");
const EDITED: Record<string, [number, number][]> = {
  // effects.ts: the anchor block, the arm, the AttackCoinFlip union
  "packages/engine/src/effects.ts": [
    [17640, 17720],
    [18490, 18530],
    [18935, 18965],
  ],
  // attack.ts: printedFlips, the coin block, coinExplainsModifier
  "packages/engine/src/attack.ts": [
    [800, 840],
    [2090, 2130],
    [2290, 2330],
  ],
};
const ROOT = "/home/jofre/projects/luminous_ui/";
for (const [file, spans] of Object.entries(EDITED)) {
  const src = await Bun.file(ROOT + file).text();
  for (const m of ROWS) {
    if (m.file !== file || m.decision.includes("D499")) continue;
    const i = src.indexOf(m.find);
    if (i < 0) continue;
    const start = src.slice(0, i).split("\n").length;
    const end = start + m.find.split("\n").length - 1;
    for (const [a, b] of spans) {
      if (end >= a && start <= b) {
        console.log("  " + m.id + " (" + m.decision + ") " + file + ":" + start + "-" + end);
        break;
      }
    }
  }
}

console.log("");
console.log("=== (4) `$`-special audit — the splice-gate population ===");
const SPECIAL = /\$[$&`'\d]|\$<[^>]+>/;
const dependents = ROWS.filter((m) => SPECIAL.test(m.replace));
console.log("  rows whose `replace` carries a String.replace special: " + dependents.length);
console.log("  of which D499's: " + dependents.filter((m) => m.decision.includes("D499")).map((m) => m.id).join(", ") || "  of which D499's: (none)");
const bareDollar = ROWS.filter((m) => m.replace.includes("$"));
console.log("  (a BARE `$` would over-count: " + bareDollar.length + " rows — D492's trap)");
