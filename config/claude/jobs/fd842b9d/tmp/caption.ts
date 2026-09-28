import type { Card } from "@luminous/schema";
import type { EffectOp } from "/home/jofre/projects/luminous_ui/packages/engine/src/effects";
import { applyAction, createGame } from "/home/jofre/projects/luminous_ui/packages/engine/src/index";
import type { GameEvent, GameState, Seat } from "/home/jofre/projects/luminous_ui/packages/engine/src/index";
import { runProgram } from "/home/jofre/projects/luminous_ui/packages/engine/src/interpreter";
import { FIXTURE_POOL, battler, basicEnergy, deckOf, itemTrainer } from "/home/jofre/projects/luminous_ui/packages/engine/src/testFixtures";

const DRAWER = "z-drawer", WALL = "z-wall", ENERGY = "z-energy", ITEM = "z-item";
const LOCAL: Record<string, Card> = {
  [DRAWER]: battler(DRAWER, { name: "Z", hp: 120, retreat: 1, types: ["Colorless"], attacks: [{ cost: ["Colorless"], name: "T", effect: "x", damage: 30 }] }),
  [WALL]: battler(WALL, { name: "W", hp: 330, retreat: 1, types: ["Colorless"], attacks: [{ cost: ["Colorless"], name: "Tap", damage: 10 }] }),
  [ENERGY]: basicEnergy(ENERGY),
  [ITEM]: itemTrainer(ITEM),
};
const POOL = { ...FIXTURE_POOL, ...LOCAL };
const DECK = deckOf({ [DRAWER]: 8, [WALL]: 8, [ENERGY]: 20, [ITEM]: 24 });
function must(r: ReturnType<typeof applyAction>): GameState { if (!r.ok) throw new Error(r.error.code + " " + r.error.message); return r.state; }
function firstBasic(state: GameState, side: Seat): string {
  const uid = state.players[side].hand.find((h) => { const c = POOL[state.cardIdByUid[h] ?? ""]; return c?.category === "Pokemon" && (c as any).stage === "Basic"; });
  if (!uid) throw new Error("no basic"); return uid;
}
function setup(seed: number): GameState {
  const c = createGame({ seed, decks: { p1: DECK, p2: DECK }, cardPool: POOL });
  if (!c.ok) throw new Error("createGame " + c.error.code);
  let s = c.state;
  if (s.phase.kind !== "setup:chooseFirst") throw new Error("phase");
  s = must(applyAction(s, { type: "chooseFirstPlayer", seat: s.phase.coinWinner, first: "p1" }));
  while (s.phase.kind === "setup:drawExtra") {
    const p = s.phase; const owed = (["p1","p2"] as const).find((x) => !p.decided[x]);
    if (!owed) throw new Error("x");
    s = must(applyAction(s, { type: "setupDrawExtra", seat: owed, count: p.owed[owed] }));
  }
  for (const side of ["p1","p2"] as const) s = must(applyAction(s, { type: "setupPlaceActive", seat: side, uid: firstBasic(s, side) }));
  for (const side of ["p1","p2"] as const) s = must(applyAction(s, { type: "setupReady", seat: side }));
  return s;
}
const state = setup(7);
const progs: Record<string, EffectOp[]> = {
  draw2: [{ op: "payFromHand", count: 1, to: "discard", recordAs: "paid" }, { op: "recordGate", slot: "paid", then: [{ op: "drawCards", count: 2 }] } as any],
  oppDiscard: [{ op: "payFromHand", count: 1, to: "discard", recordAs: "paid" }, { op: "recordGate", slot: "paid", then: [{ op: "opponentDiscardsFromHand", count: 1 }] } as any],
  bare: [{ op: "payFromHand", count: 1, to: "discard", recordAs: "paid" }],
};
for (const [k, ops] of Object.entries(progs)) {
  const ev: GameEvent[] = [];
  const r = runProgram(state, ops, { seat: "p1" }, ev);
  console.log(k, r.kind, r.kind === "parked" ? JSON.stringify((r.prompt as any).note) : "");
}
