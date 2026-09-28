// D503 ATTRIBUTION CONTROL — both layers, each killer alone, restored in a
// `finally`, size AND sha256 verified both ways.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, statSync } from "node:fs";
const ROOT = "/home/jofre/projects/luminous_ui";
const EFFECTS = `${ROOT}/packages/engine/src/effects.ts`;
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const original = readFileSync(EFFECTS, "utf8");
const beforeSize = statSync(EFFECTS).size, beforeSha = sha(original);
console.log(`BASELINE effects.ts  size=${beforeSize}  sha256=${beforeSha}`);

const TAIL = "Before doing damage, you may attach any number of Basic {W} Energy cards from your hand to this Pokémon.";
const PRINTED = "This attack does 30 damage for each {W} Energy attached to this Pokémon. " + TAIL;

// ---------- LAYER 0: the CENSUS at HEAD, unmutated ----------
{
  const eff = await import(`${EFFECTS}?v=base`);
  const cen = await import(`${ROOT}/packages/engine/src/censusAttackCorpus.ts?v=base`);
  const raw = cen.legalAttackCorpus().filter(([, t]: any) => !cen.resolvedByAnyReader(t));
  const residue = raw.filter(([, t]: any) => {
    const g = eff.splitAttackGateClause(t);
    if (g !== null && g.body !== "" && cen.resolvedByAnyReader(g.body)) return false;
    return eff.splitAttackTrailingClause(t) === null;
  });
  console.log(`\nHEAD: raw refusal ${raw.length}/${raw.reduce((s:number,[n]:any)=>s+n,0)}  residue-before-registry ${residue.length}/${residue.reduce((s:number,[n]:any)=>s+n,0)}`);
}

const FIND = "export function deriveAttackEffect(text: string): EffectOp[] | null {";
const REPLACE = FIND + `
  if (text.trim() === ${JSON.stringify(TAIL)}) {
    return [{ op: "attachFromHand", filter: { kind: "basicEnergy", energyType: "Water" } }];
  }`;
let patched = false;
try {
  if (original.split(FIND).length - 1 !== 1) throw new Error("FIND not unique");
  writeFileSync(EFFECTS, original.replace(FIND, () => REPLACE), "utf8");
  patched = true;
  console.log(`MUTATED effects.ts  size=${statSync(EFFECTS).size}`);

  const eff = await import(`${EFFECTS}?v=mut`);
  const cen = await import(`${ROOT}/packages/engine/src/censusAttackCorpus.ts?v=mut`);
  const raw = cen.legalAttackCorpus().filter(([, t]: any) => !cen.resolvedByAnyReader(t));
  const residue = raw.filter(([, t]: any) => {
    const g = eff.splitAttackGateClause(t);
    if (g !== null && g.body !== "" && cen.resolvedByAnyReader(g.body)) return false;
    return eff.splitAttackTrailingClause(t) === null;
  });
  console.log(`\n=== LAYER 1 — THE CENSUS, under the reader mutation ===`);
  console.log(`  raw refusal ${raw.length}/${raw.reduce((s:number,[n]:any)=>s+n,0)}  residue-before-registry ${residue.length}/${residue.reduce((s:number,[n]:any)=>s+n,0)}`);
  console.log(`  TARGET still in residue? ${residue.some(([, t]: any) => t === PRINTED)}`);
  console.log(`  → the residue FALLS and BUILT.attack STEPS, so a builder steps the constants and the census goes GREEN on the wrong build.`);

  console.log(`\n=== LAYER 2 — THE READER, under the same mutation ===`);
  console.log(`  deriveAttackEffect(TAIL) => ${JSON.stringify(eff.deriveAttackEffect(TAIL))}`);
  console.log(`  → §4's rung asserts this is null. It is FALSE under the mutant whatever the census constants say, which is why the tripwire and not the census is the guard.`);

  console.log(`\n=== LAYER 3 — THE EXECUTOR, driven, and the LOG RENDERED ===`);
  const fx = await import(`${ROOT}/packages/engine/src/testFixtures.ts?v=mut`);
  const logmod = await import(`${ROOT}/packages/engine/src/log.ts?v=mut`);
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
  const card = state.cardPool["fix-selfenergy"];
  const atk = card.attacks[0];
  state = { ...state, cardPool: { ...state.cardPool, "fix-selfenergy": {
    ...card, attacks: [{ ...atk, damage: 0, effect: PRINTED }, ...card.attacks.slice(1)] } } };
  const r = fx.mustApply(state, { type: "attack", seat: "p1", index: 0 });
  const d = r.events.find((e: any) => e.type === "DAMAGE_DEALT");
  const waterOn = r.state.players.p1.active.energy.filter((u: string) => {
    const c = r.state.cardPool[r.state.cardIdByUid[u]]; return c?.energyType === "Water"; }).length;
  console.log(`  events: ${r.events.map((e: any) => e.type).join(" → ")}`);
  console.log(`  DAMAGE_DEALT.scaled = ${d.scaled}   (the pre-attach count × 30)`);
  console.log(`  phase after the swing: ${r.state.phase.kind}`);
  console.log(`  🛑 the attach is still UNANSWERED when the damage is already on the board.`);
  console.log(`\n  --- log.ts RENDERED ROWS (what the player is told) ---`);
  const ctx = { names: { p1: "Ember", p2: "Wren" }, state: r.state, elapsed: "+00:11" };
  for (const entry of logmod.logFromEvents(r.events, ctx)) {
    if (entry.kind === "turn") { console.log(`   [turn] ${JSON.stringify(entry).slice(0,120)}`); continue; }
    console.log(`   ${entry.who}: ${entry.segments.map((s: any) => s.text).join("")}`);
  }
  console.log(`  --- and the PARK's caption ---`);
  console.log(`   note: ${JSON.stringify((r.state.phase as any).prompt.note)}`);
  console.log(`   targets: ${JSON.stringify((r.state.phase as any).prompt.targets)}`);
} finally {
  if (patched) {
    writeFileSync(EFFECTS, original, "utf8");
    const a = statSync(EFFECTS).size, b = sha(readFileSync(EFFECTS, "utf8"));
    console.log(`\nRESTORED effects.ts  size=${a}  sha256=${b}`);
    console.log(`  size match=${a === beforeSize}  sha256 match=${b === beforeSha}`);
  }
}
