import { claims } from "/home/jofre/.claude/jobs/fd842b9d/tmp/d495-probe.ts";
import * as E from "/home/jofre/projects/luminous_ui/packages/engine/src/effects.ts";
const mod = E as unknown as Record<string, (t: string) => unknown>;
function v(t: string): unknown {
  for (const n of ["deriveAttackEffect"]) {
    const r = mod[n]?.(t);
    if (r !== null && r !== undefined) return r;
  }
  return null;
}

// ---------- ORTHOGONAL 2^2: GATE x CONSEQUENT ----------
// GATE slot: printed "Flip a coin. If heads, " ; nearest BUILT differing spelling: absent.
// CONSEQUENT slot: printed "the Defending Pokémon can't attack" ;
//   nearest BUILT differing spelling under the SAME gate: "prevent all damage done to this Pokémon by attacks"
const GATE = ["Flip a coin. If heads, ", ""];
const CONS = [
  "the Defending Pokémon can't attack",
  "prevent all damage done to this Pokémon by attacks",
];
function point(g: number, c: number): string {
  const head = GATE[g] === "" ? "During" : "during";
  return `${GATE[g]}${head} your opponent's next turn, ${CONS[c]}.`;
}
console.log("###### 2^2 LATTICE: GATE x CONSEQUENT (0 = printed value, 1 = built substitute)");
let builtCount = [0, 0, 0];
for (const g of [0, 1])
  for (const c of [0, 1]) {
    const t = point(g, c);
    const cl = claims(t);
    const w = g + c;
    if (cl.length > 0) builtCount[w] = (builtCount[w] ?? 0) + 1;
    console.log(
      `  w=${w} GATE=${g} CONS=${c}  ${cl.length ? "BUILDS " : "REFUSED"}  ${JSON.stringify(t)}${cl.length ? "\n            => " + JSON.stringify(v(t)) : ""}`,
    );
  }
console.log("  by Hamming weight built:", JSON.stringify(builtCount), " (w0 of 1, w1 of 2, w2 of 1)");

// ---------- SUB-LATTICE inside CONS=printed: GATE x SEAT x VERB ----------
console.log("\n###### SUB-LATTICE (CONS held at the print): GATE x SEAT x VERB");
const SEAT = [
  { dur: "your opponent's", subj: "the Defending Pokémon" },
  { dur: "your", subj: "this Pokémon" },
];
const VERB = ["attack", "use attacks", "retreat"];
for (const g of [0, 1])
  for (const s of [0, 1])
    for (let vb = 0; vb < VERB.length; vb++) {
      const head = GATE[g] === "" ? "During" : "during";
      const t = `${GATE[g]}${head} ${SEAT[s].dur} next turn, ${SEAT[s].subj} can't ${VERB[vb]}.`;
      const cl = claims(t);
      console.log(
        `  GATE=${g} SEAT=${s} VERB=${VERB[vb].padEnd(11)} ${cl.length ? "BUILDS " : "REFUSED"} ${JSON.stringify(t)}${cl.length ? " => " + JSON.stringify(v(t)) : ""}`,
      );
    }

// ---------- GATE slot's THREE inhabitants (axis-vs-value, D494) ----------
console.log("\n###### GATE SLOT INHABITANTS (is FACE an AXIS or a VALUE?)");
for (const g of ["", "Flip a coin. If heads, ", "Flip a coin. If tails, "]) {
  for (const c of CONS) {
    const head = g === "" ? "During" : "during";
    const t = `${g}${head} your opponent's next turn, ${c}.`;
    console.log(`  ${claims(t).length ? "BUILDS " : "REFUSED"} ${JSON.stringify(t)}`);
  }
}

// ---------- DIRECTION 2: start from each BUILT base and substitute TOWARD the print ----------
console.log("\n###### DIRECTION 2 — from each BUILT base toward the print");
const bases = [
  ["bare lock (corpus line 187)", "During your opponent's next turn, the Defending Pokémon can't attack."],
  ["gated prevent (corpus line 248)", "Flip a coin. If heads, during your opponent's next turn, prevent all damage done to this Pokémon by attacks."],
  ["gated prevent+effects (line 249)", "Flip a coin. If heads, during your opponent's next turn, prevent all damage from and effects of attacks done to this Pokémon."],
  ["tails self lock (D144)", "Flip a coin. If tails, during your next turn, this Pokémon can't attack."],
];
for (const [label, b] of bases) {
  console.log(`  BASE ${label}: ${claims(b).length ? "BUILDS" : "REFUSED"}`);
}
