import { describe, expect, it } from "vitest";
import { applyAction } from "./index";
import type { GameState, Seat, GameEvent } from "./index";
import {
  IN_PLAY_BODIES_DECK, attachFromDeck, benchFromDeck, clearBench, driveSetup, must, mustApply,
  setActiveFromDeck, setBenchDamage, setDamage,
} from "./testFixtures";

const SEED = 1;
function bare(by: Seat = "p1"): GameState {
  const foe: Seat = by === "p1" ? "p2" : "p1";
  let state = must(applyAction(driveSetup(SEED, { p1: IN_PLAY_BODIES_DECK, p2: IN_PLAY_BODIES_DECK }, { first: foe }), { type: "endTurn", seat: foe }));
  state = setActiveFromDeck(state, by, "fix-inplaybodies");
  state = clearBench(state, by);
  state = attachFromDeck(state, by, "fix-energy", 1);
  state = setActiveFromDeck(state, foe, "fix-titan");
  return clearBench(state, foe);
}
function benched(state: GameState, seat: Seat, ids: readonly string[]): GameState {
  let next = state;
  for (const id of ids) next = benchFromDeck(next, seat, id);
  return next;
}
function withEffect(state: GameState, effect: string, index = 0): GameState {
  const card = state.cardPool["fix-inplaybodies"];
  if (card === undefined) throw new Error("no card");
  const attacks = [...(card.attacks ?? [])];
  const at = attacks[index];
  if (at === undefined) throw new Error("no attack");
  attacks[index] = { ...at, effect };
  return { ...state, cardPool: { ...state.cardPool, "fix-inplaybodies": { ...card, attacks } } };
}
describe("scratch", () => {
  it("board", () => {
    let s = benched(bare(), "p1", ["fix-grass-stage1","fix-grass-basic","fix-benchfiller","fix-stage1","fix-grass-basic"]);
    s = benched(s, "p2", ["fix-benchfiller","fix-benchfiller"]);
    s = setDamage(s, "p1", 20);
    s = setBenchDamage(s, "p1", 0, 10);
    s = setBenchDamage(s, "p1", 1, 30);
    s = setBenchDamage(s, "p2", 0, 10);
    console.log("p1 bench ids", s.players.p1.bench.map(b=>b.cards[b.cards.length-1]));
    console.log("p1 damage", s.players.p1.active?.damage, s.players.p1.bench.map(b=>b.damage));
    console.log("p2 bench ids", s.players.p2.bench.map(b=>b.cards[b.cards.length-1]));
    console.log("p2 damage", s.players.p2.active?.damage, s.players.p2.bench.map(b=>b.damage));
    const sent = "This attack does 50 damage for each of your Pokémon that has any damage counters on it.";
    const r = mustApply(withEffect(s, sent), { type: "attack", seat: "p1", index: 0 });
    console.log("events", r.events.map(e=>e.type));
    console.log("dealt", (r.events.find(e=>e.type==="DAMAGE_DEALT") as any)?.dealt);
    const r2 = mustApply(withEffect(s, "This attack does 50 damage for each of your Pokémon in play."), { type: "attack", seat: "p1", index: 0 });
    console.log("unnarrowed dealt", (r2.events.find(e=>e.type==="DAMAGE_DEALT") as any)?.dealt);
    const r3 = mustApply(withEffect(s, "This attack does 50 damage for each of your Basic Pokémon that has any damage counters on it."), { type: "attack", seat: "p1", index: 0 });
    console.log("basic damaged dealt", (r3.events.find(e=>e.type==="DAMAGE_DEALT") as any)?.dealt);
    const r4 = mustApply(withEffect(s, "This attack does 50 damage for each of your Evolution Pokémon that has any damage counters on it."), { type: "attack", seat: "p1", index: 0 });
    console.log("evolution damaged dealt", (r4.events.find(e=>e.type==="DAMAGE_DEALT") as any)?.dealt);
  });
});
