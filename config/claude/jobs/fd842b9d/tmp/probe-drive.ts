import type { Card } from "@luminous/schema";
import { deriveAttackEffect } from "/home/jofre/projects/luminous_ui/packages/engine/src/effects";
import { applyAction, createGame } from "/home/jofre/projects/luminous_ui/packages/engine/src/index";
import type { GameState, Seat } from "/home/jofre/projects/luminous_ui/packages/engine/src/index";
import {
  FIXTURE_POOL,
  attachFromDeck,
  battler,
  basicEnergy,
  clearBench,
  deckOf,
  firstBasicInHand,
  handFromDeck,
  must,
  mustApply,
  setActiveFromDeck,
  trainerCard,
} from "/home/jofre/projects/luminous_ui/packages/engine/src/testFixtures";

const SWEEP =
  "Your opponent reveals their hand. Discard all Item cards and Pokémon Tool cards you find there.";
console.log("derive:", JSON.stringify(deriveAttackEffect(SWEEP)));

const CARDS: Record<string, Card> = {
  "d485-thief": battler("d485-thief", {
    name: "D485 Thief",
    types: ["Colorless"],
    hp: 300,
    attacks: [{ cost: ["Colorless"], name: "Hand Sweep", effect: SWEEP }],
  }),
  "d485-wall": battler("d485-wall", { name: "D485 Wall", types: ["Colorless"], hp: 340 }),
  "d485-item-a": trainerCard("d485-item-a", "Item", "A test Item."),
  "d485-item-b": trainerCard("d485-item-b", "Item", "A second test Item."),
  "d485-item-c": trainerCard("d485-item-c", "Item", "A third test Item."),
  "d485-tool-a": trainerCard("d485-tool-a", "Tool", "A test Tool."),
  "d485-tool-b": trainerCard("d485-tool-b", "Tool", "A second test Tool."),
  "d485-sup": trainerCard("d485-sup", "Supporter", "A test Supporter."),
  "d485-nrg": basicEnergy("d485-nrg"),
};
const POOL = { ...FIXTURE_POOL, ...CARDS };
const DECK = deckOf({
  "d485-thief": 8,
  "d485-wall": 8,
  "d485-item-a": 6,
  "d485-item-b": 6,
  "d485-item-c": 6,
  "d485-tool-a": 6,
  "d485-tool-b": 6,
  "d485-sup": 6,
  "d485-nrg": 8,
});
console.log("deck", DECK.length);

function open(first: Seat): GameState {
  const created = createGame({ seed: 20260907, decks: { p1: DECK, p2: DECK }, cardPool: POOL });
  if (!created.ok) throw new Error(`createGame: ${created.error.code}`);
  let t = created.state;
  if (t.phase.kind !== "setup:chooseFirst") throw new Error("no chooseFirst");
  t = must(applyAction(t, { type: "chooseFirstPlayer", seat: t.phase.coinWinner, first }));
  while (t.phase.kind === "setup:drawExtra") {
    const d = t.phase;
    const owing = (["p1", "p2"] as const).find((s) => !d.decided[s]);
    if (owing === undefined) throw new Error("stuck");
    t = must(applyAction(t, { type: "setupDrawExtra", seat: owing, count: d.owed[owing] }));
  }
  for (const s of ["p1", "p2"] as const) {
    t = must(applyAction(t, { type: "setupPlaceActive", seat: s, uid: firstBasicInHand(t, s) }));
  }
  for (const s of ["p1", "p2"] as const) t = must(applyAction(t, { type: "setupReady", seat: s }));
  return t;
}

function withHand(state: GameState, seat: Seat, ids: readonly string[]): GameState {
  const side = state.players[seat];
  let next: GameState = {
    ...state,
    players: { ...state.players, [seat]: { ...side, hand: [], deck: [...side.deck, ...side.hand] } },
  };
  for (const id of ids) next = handFromDeck(next, seat, id, 1);
  return next;
}

const HAND = [
  "d485-item-a",
  "d485-item-b",
  "d485-item-c",
  "d485-tool-a",
  "d485-tool-b",
  "d485-sup",
  "d485-nrg",
];

let t = open("p2");
t = mustApply(t, { type: "endTurn", seat: "p2" }).state;
t = setActiveFromDeck(t, "p1", "d485-thief");
t = setActiveFromDeck(t, "p2", "d485-wall");
t = clearBench(t, "p1");
t = clearBench(t, "p2");
t = attachFromDeck(t, "p1", "d485-nrg", 1);
t = withHand(t, "p2", HAND);
console.log("opp hand before:", t.players.p2.hand.length);
const res = mustApply(t, { type: "attack", seat: "p1", index: 0 });
console.log("phase:", res.state.phase.kind);
console.log("opp hand after:", res.state.players.p2.hand.length);
console.log(
  "remaining ids:",
  res.state.players.p2.hand.map((u) => u.replace(/#.*/, "")),
);
console.log("discard:", res.state.players.p2.discard.length);
console.log(
  "events:",
  res.events.map((e) => e.type).join(", "),
);
