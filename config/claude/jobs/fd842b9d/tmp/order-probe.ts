// D503 ORDER PROBE — patches ONE temporary arm into effects.ts, drives a real
// board, restores in a `finally`, and verifies size + sha256 both ways.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, statSync } from "node:fs";

const ROOT = "/home/jofre/projects/luminous_ui";
const EFFECTS = `${ROOT}/packages/engine/src/effects.ts`;

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

const original = readFileSync(EFFECTS, "utf8");
const beforeSize = statSync(EFFECTS).size;
const beforeSha = sha(original);
console.log(`baseline effects.ts: ${beforeSize} bytes sha256=${beforeSha}`);

// The anchor we splice in front of: the first line of deriveAttackDamageMultiplier's body.
const FIND = `export function deriveAttackDamageMultiplier(text: string): AttackDamageBonus | null {`;
const occurrences = original.split(FIND).length - 1;
if (occurrences !== 1) throw new Error(`FIND occurs ${occurrences}x`);

const ROW71 =
  "Before doing damage, discard all Pokémon Tools and Special Energy from your opponent's Active Pokémon.";

const REPLACE =
  FIND +
  `
  // D503 TEMPORARY ORDER PROBE — removed in a finally.
  if (text.trim() === ${JSON.stringify(ROW71)}) {
    return { per: 30, count: { kind: "energyOnOpponent", zone: "active", energyType: null } };
  }`;

let patched = false;
try {
  const next = original.replace(FIND, () => REPLACE);
  if (next === original) throw new Error("replacement was a no-op");
  writeFileSync(EFFECTS, next, "utf8");
  patched = true;
  console.log(`patched effects.ts: ${statSync(EFFECTS).size} bytes (delta ${statSync(EFFECTS).size - beforeSize})`);

  const fx = await import(`${ROOT}/packages/engine/src/testFixtures`);
  const eff = await import(`${ROOT}/packages/engine/src/effects`);
  const idx = await import(`${ROOT}/packages/engine/src/index`);

  console.log("reader claims ROW71 =>", JSON.stringify(eff.deriveAttackDamageMultiplier(ROW71)));
  console.log("preDamage claims ROW71 =>", JSON.stringify(eff.deriveAttackPreDamage(ROW71)));

  const SEED = 11;
  const other = (s: string) => (s === "p1" ? "p2" : "p1");
  const seat = "p1";
  const decks = { p1: fx.PRE_DAMAGE_FAMILY_DECK, p2: fx.PRE_DAMAGE_FAMILY_DECK };
  let state = fx.driveSetup(SEED, decks, { first: other(seat) });
  state = fx.setActiveFromDeck(state, seat, "fix-preseam");
  state = fx.setActiveFromDeck(state, other(seat), "fix-seamwall");
  state = fx.attachFromDeck(state, seat, "fix-energy", 2);
  state = fx.mustApply(state, { type: "endTurn", seat: other(seat) }).state;
  state = fx.attachToolFromDeck(state, other(seat), "active", "sv01-192");
  state = fx.attachFromDeck(state, other(seat), "sv02-193", 1); // Special Energy
  state = fx.attachFromDeck(state, other(seat), "fix-energy", 1); // Basic Energy

  const defBefore = state.players[other(seat)].active;
  console.log("defender energy BEFORE swing:", defBefore.energy.length, "tools:", defBefore.tools.length);

  const res = fx.mustApply(state, { type: "attack", seat, index: 0 });
  const dmg = res.events.find((e: any) => e.type === "DAMAGE_DEALT");
  const defAfter = res.state.players[other(seat)].active;
  console.log("defender energy AFTER swing:", defAfter === null ? "KO" : defAfter.energy.length);
  console.log("DAMAGE_DEALT =>", JSON.stringify(dmg));
  console.log("events:", res.events.map((e: any) => e.type).join(", "));
} finally {
  if (patched) {
    writeFileSync(EFFECTS, original, "utf8");
    const afterSize = statSync(EFFECTS).size;
    const afterSha = sha(readFileSync(EFFECTS, "utf8"));
    console.log(`RESTORED effects.ts: ${afterSize} bytes sha256=${afterSha}`);
    console.log(`size match: ${afterSize === beforeSize}  sha match: ${afterSha === beforeSha}`);
  }
}
