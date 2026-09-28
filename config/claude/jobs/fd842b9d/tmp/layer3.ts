import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, statSync } from "node:fs";
const ROOT = "/home/jofre/projects/luminous_ui";
const EFFECTS = `${ROOT}/packages/engine/src/effects.ts`;
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const original = readFileSync(EFFECTS, "utf8");
const beforeSize = statSync(EFFECTS).size, beforeSha = sha(original);
console.log(`BASELINE size=${beforeSize} sha256=${beforeSha}`);
const TAIL = "Before doing damage, you may attach any number of Basic {W} Energy cards from your hand to this Pokémon.";
const PRINTED = "This attack does 30 damage for each {W} Energy attached to this Pokémon. " + TAIL;
const MUTATE = process.env.D503_MUTATE === "1";
const FIND = "export function deriveAttackEffect(text: string): EffectOp[] | null {";
const REPLACE = FIND + `\n  if (text.trim() === ${JSON.stringify(TAIL)}) {\n    return [{ op: "attachFromHand", filter: { kind: "basicEnergy", energyType: "Water" } }];\n  }`;
let patched = false;
try {
  if (MUTATE) {
    if (original.split(FIND).length - 1 !== 1) throw new Error("FIND not unique");
    writeFileSync(EFFECTS, original.replace(FIND, () => REPLACE), "utf8");
    patched = true;
    console.log(`MUTATED size=${statSync(EFFECTS).size}`);
  } else {
    console.log("UNMUTATED — the HEAD control");
  }
  const fx = await import(`${ROOT}/packages/engine/src/testFixtures`);
  const logmod = await import(`${ROOT}/packages/engine/src/log`);
  const DECK = fx.deckOf({ "fix-selfenergy": 4, "fix-water-energy": 16, "fix-energy": 12,
    "fix-blend": 4, "fix-special": 8, "sv02-191": 4, "fix-titan": 6, "fix-basic-1": 6 });
  let state = fx.mustApply(fx.driveSetup(11, { p1: DECK, p2: DECK }, { first: "p2" }), { type: "endTurn", seat: "p2" }).state;
  state = fx.setActiveFromDeck(state, "p1", "fix-selfenergy");
  state = fx.clearBench(state, "p1");
  state = fx.setActiveFromDeck(state, "p2", "fix-titan");
  state = fx.clearBench(state, "p2");
  state = fx.attachFromDeck(state, "p1", "fix-water-energy", 2);
  state = fx.attachFromDeck(state, "p1", "fix-energy", 2);
  state = fx.handFromDeck(state, "p1", "fix-water-energy", 2);
  state = fx.benchFromDeck(state, "p1", "fix-titan");
  const card = state.cardPool["fix-selfenergy"], atk = card.attacks[0];
  state = { ...state, cardPool: { ...state.cardPool, "fix-selfenergy": {
    ...card, attacks: [{ ...atk, damage: 0, effect: PRINTED }, ...card.attacks.slice(1)] } } };
  const r = fx.mustApply(state, { type: "attack", seat: "p1", index: 0 });
  const d = r.events.find((e: any) => e.type === "DAMAGE_DEALT");
  console.log(`events: ${r.events.map((e: any) => e.type).join(" → ")}`);
  console.log(`DAMAGE_DEALT: ${d ? JSON.stringify({base:d.base,scaled:d.scaled,dealt:d.dealt}) : "none"}`);
  console.log(`phase: ${r.state.phase.kind}`);
  if (r.state.phase.kind === "effect:choose") {
    console.log(`park note   : ${JSON.stringify((r.state.phase as any).prompt.note)}`);
    console.log(`park targets: ${JSON.stringify((r.state.phase as any).prompt.targets)}`);
    console.log(`park max/cands: ${(r.state.phase as any).prompt.max} / ${(r.state.phase as any).prompt.candidates.length}`);
  }
  console.log("--- log.ts RENDERED ---");
  const ctx = { names: { p1: "Ember", p2: "Wren" }, state: r.state, elapsed: "+00:11" };
  for (const e of logmod.logFromEvents(r.events, ctx)) {
    if (e.kind === "turn") continue;
    console.log(`  ${e.who}: ${e.segments.map((s: any) => s.text).join("")}`);
  }
} finally {
  if (patched) {
    writeFileSync(EFFECTS, original, "utf8");
    const a = statSync(EFFECTS).size, b = sha(readFileSync(EFFECTS, "utf8"));
    console.log(`RESTORED size=${a} sha256=${b}  size ok=${a===beforeSize} sha ok=${b===beforeSha}`);
  }
}
