import * as effects from "/home/jofre/projects/luminous_ui/packages/engine/src/effects";

const ROW = "Shuffle your hand into your deck. Then, draw a card for each card in your opponent's hand.";
const SIB = "Shuffle your hand into your deck. Then, draw 6 cards.";
const DMG = "This attack does 30 damage for each card in your opponent's hand.";

function probe(label: string, text: string) {
  console.log(`\n### ${label}\n    ${JSON.stringify(text)}`);
  let any = false;
  for (const [name, fn] of Object.entries(effects)) {
    if (typeof fn !== "function") continue;
    if (!name.startsWith("deriveAttack") && !name.startsWith("splitAttack")) continue;
    let out: unknown;
    try { out = (fn as (t: string) => unknown)(text); } catch (e) { console.log(`  ${name} THREW ${e}`); any = true; continue; }
    if (out === null || out === undefined) continue;
    console.log(`  ${name} -> ${JSON.stringify(out)}`);
    any = true;
  }
  if (!any) console.log("  (all null)");
  console.log(`  resolvedByAnyReader = ${(effects as any).resolvedByAnyReader?.(text)}`);
}

function segments(text: string): string[] {
  const out: string[] = []; let depth = 0, start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "(") depth++; else if (c === ")") depth = Math.max(0, depth - 1);
    if (depth !== 0) continue;
    if (c !== "." && c !== ")") continue;
    const gap = /^\s+/.exec(text.slice(i + 1)); if (gap === null) continue;
    const next = text[i + 1 + gap[0].length] ?? "";
    if (!/[A-Z(]/.test(next)) continue;
    out.push(text.slice(start, i + 1)); start = i + 1 + gap[0].length;
  }
  out.push(text.slice(start));
  return out.filter((s) => s.length > 0);
}

for (const [l, t] of [["TARGET", ROW], ["SIBLING", SIB], ["DAMAGE-ROW", DMG]] as const) {
  probe(l, t);
  const segs = segments(t);
  console.log(`  segments (${segs.length}): ${JSON.stringify(segs)}`);
  segs.forEach((s, i) => probe(`${l} seg${i}`, s));
}
