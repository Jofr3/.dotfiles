import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, statSync } from "node:fs";
const ROOT = "/home/jofre/projects/luminous_ui";
const EFFECTS = `${ROOT}/packages/engine/src/effects.ts`;
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const original = readFileSync(EFFECTS, "utf8");
const beforeSize = statSync(EFFECTS).size, beforeSha = sha(original);
const FIND = `export function deriveAttackEffect(text: string): EffectOp[] | null {`;
if (original.split(FIND).length - 1 !== 1) throw new Error("FIND not unique");
const TAIL = "Before doing damage, you may attach any number of Basic {W} Energy cards from your hand to this Pokémon.";
const FULL = "This attack does 30 damage for each {W} Energy attached to this Pokémon. " + TAIL;
const REPLACE = FIND + `
  if (text.trim() === ${JSON.stringify(TAIL)}) {
    return [{ op: "attachFromHand", filter: { kind: "basicEnergy", energyType: "Water" } }];
  }`;
let patched = false;
try {
  writeFileSync(EFFECTS, original.replace(FIND, () => REPLACE), "utf8");
  patched = true;
  const fx = await import(`${ROOT}/packages/engine/src/testFixtures`);
  const idx = await import(`${ROOT}/packages/engine/src/index`);

  const DECK = fx.deckOf({
    "fix-selfenergy": 4, "fix-water-energy": 16, "fix-energy": 12,
    "fix-blend": 4, "fix-special": 8, "sv02-191": 4, "fix-titan": 6, "fix-basic-1": 6,
  });
  const foe = "p2";
  let state = fx.mustApply(fx.driveSetup(11, { p1: DECK, p2: DECK }, { first: foe }),
    { type: "endTurn", seat: foe }).state;
  state = fx.setActiveFromDeck(state, "p1", "fix-selfenergy");
  state = fx.clearBench(state, "p1");
  state = fx.setActiveFromDeck(state, foe, "fix-titan");
  state = fx.clearBench(state, foe);
  state = fx.attachFromDeck(state, "p1", "fix-water-energy", 2);
  state = fx.attachFromDeck(state, "p1", "fix-energy", 2);
  // 2 Water Energy in HAND, the cards the printed sentence offers
  state = fx.handFromDeck(state, "p1", "fix-water-energy", 2);

  // re-text attack 0 on a per-board cardPool CLONE (D414 idiom)
  const card = state.cardPool["fix-selfenergy"];
  const atk = card.attacks[0];
  console.log("fix-selfenergy attack0 cost:", JSON.stringify(atk.cost), "printed damage:", atk.damage);
  state = { ...state, cardPool: { ...state.cardPool, "fix-selfenergy": {
    ...card, attacks: [{ ...atk, damage: 0, effect: FULL }, ...card.attacks.slice(1)] } } };

  const before = state.players.p1.active;
  console.log("attacker attached energy:", before.energy.length, " hand size:", state.players.p1.hand.length);
  const waterInHand = state.players.p1.hand.filter((u: string) => state.cardIdByUid[u] === "fix-water-energy").length;
  console.log("fix-water-energy in hand:", waterInHand);

  const r = fx.mustApply(state, { type: "attack", seat: "p1", index: 0 });
  console.log("\nEVENTS:", r.events.map((e: any) => e.type).join(" -> "));
  const d = r.events.find((e: any) => e.type === "DAMAGE_DEALT");
  console.log("DAMAGE_DEALT:", JSON.stringify(d));
  console.log("phase after swing:", r.state.phase.kind);
  if (r.state.phase.kind === "effect:choose") {
    console.log("PARK PROMPT:", JSON.stringify(r.state.phase.prompt).slice(0, 400));
  }
  console.log("attacker energy after:", r.state.players.p1.active?.energy.length);
} finally {
  if (patched) {
    writeFileSync(EFFECTS, original, "utf8");
    const a = statSync(EFFECTS).size, b = sha(readFileSync(EFFECTS, "utf8"));
    console.log(`\nRESTORED size ok=${a===beforeSize} sha ok=${b===beforeSha}`);
  }
}
