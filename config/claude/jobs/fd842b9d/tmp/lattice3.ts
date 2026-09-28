import { resolvedByAnyReader } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus";
import * as effects from "/home/jofre/projects/luminous_ui/packages/engine/src/effects";
import { buildsFull, arm } from "./ask";
const { splitAttackGateClause, splitAttackTrailingClause } = effects as any;
type Axis = { name: string; from: string; to: string };
function run(label: string, print: string, axes: Axis[]) {
  const n = axes.length;
  for (const a of axes) { const c = print.split(a.from).length - 1; if (c !== 1) throw new Error(`axis ${a.name} occurs ${c}x`); }
  const R: number[][] = Array.from({ length: n + 1 }, () => []);
  const F: number[][] = Array.from({ length: n + 1 }, () => []);
  let g = 0, tr = 0; const div: string[] = []; const bf: string[] = [];
  for (let m = 0; m < 2 ** n; m++) {
    let t = print; const on: string[] = [];
    for (let i = 0; i < n; i++) if (m & (1 << i)) { t = t.replace(axes[i]!.from, axes[i]!.to); on.push(axes[i]!.name); }
    t = t.replace(/\s+/g, " ").trim();
    const w = on.length, r = resolvedByAnyReader(t), f = buildsFull(t);
    R[w]!.push(r ? 1 : 0); F[w]!.push(f ? 1 : 0);
    if (splitAttackGateClause(t) !== null) g++;
    if (splitAttackTrailingClause(t) !== null) tr++;
    if (r !== f) div.push(`   DIVERGE w=${w} [${on.join("+")}] readers=${r} full=${f} arm=${arm(t)} «${t}»`);
    if (f) bf.push(`   ✅ w=${w} [${on.join("+") || "—"}] arm=${arm(t)} «${t}»`);
  }
  const vR = R.map((a) => `${a.filter(Boolean).length}/${a.length}`).join(" · ");
  const vF = F.map((a) => `${a.filter(Boolean).length}/${a.length}`).join(" · ");
  console.log(`\n### ${label}\n  READERS-ONLY       ${vR}\n  SPLITTER-INCLUSIVE ${vF}\n  AGREE=${vR === vF}  gateSplit non-null at ${g}/${2 ** n}  trailingSplit non-null at ${tr}/${2 ** n}`);
  for (const d of div) console.log(d);
  for (const b of bf) console.log(b);
}
run("L517 (top pick) — splitter instrumentation",
"This attack also does 10 damage to each of your opponent's Benched Pokémon for each Prize card your opponent has taken. (Don't apply Weakness and Resistance for Benched Pokémon.)",
[
  { name: "A1-scale", from: " for each Prize card your opponent has taken", to: "" },
  { name: "A2-seat", from: "each of your opponent's Benched Pokémon", to: "each of your Benched Pokémon" },
  { name: "A3-amount", from: "does 10 damage", to: "does 30 damage" },
  { name: "A4-wr", from: " (Don't apply Weakness and Resistance for Benched Pokémon.)", to: "" },
  { name: "A5-also", from: "This attack also does", to: "This attack does" },
]);
run("D503's L569 — attempted REPRODUCTION of the reported divergence",
"This attack does 30 damage for each {W} Energy attached to this Pokémon. Before doing damage, you may attach any number of Basic {W} Energy cards from your hand to this Pokémon.",
[
  { name: "A1-timing", from: "Before doing damage, you may attach", to: "You may attach" },
  { name: "A2-count", from: "any number of", to: "2" },
  { name: "A3-dest", from: "cards from your hand to this Pokémon.", to: "cards from your hand to your Pokémon in any way you like." },
]);
