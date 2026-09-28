import type { Card } from "@luminous/schema";
import { applyAction, createGame } from "/home/jofre/projects/luminous_ui/packages/engine/src/index";
import type { GameState, Seat } from "/home/jofre/projects/luminous_ui/packages/engine/src/index";
import { conditionHolds } from "/home/jofre/projects/luminous_ui/packages/engine/src/interpreter";
import {
  FIXTURE_POOL,
  attachFromDeck,
  battler,
  benchFromDeck,
  clearBench,
  deckOf,
  firstBasicInHand,
  must,
  setActiveFromDeck,
} from "/home/jofre/projects/luminous_ui/packages/engine/src/testFixtures";

const SWINGS = [{ cost: ["Colorless"], name: "Drake Lock", damage: 10 }];
const mk = (id: string, types: string[], hp: number, atk = false): Card =>
  battler(id, { name: id, hp, types, ...(atk ? { attacks: [...SWINGS] } : {}) });

const LOCAL: Record<string, Card> = {
  "fix-d472-drakeswing": mk("fix-d472-drakeswing", ["Dragon"], 200, true),
  "fix-d472-tideswing": mk("fix-d472-tideswing", ["Water"], 200, true),
  "fix-d472-drakefoe": mk("fix-d472-drakefoe", ["Dragon"], 340),
  "fix-d472-tidefoe": mk("fix-d472-tidefoe", ["Water"], 340),
  "fix-d472-dualfoe": mk("fix-d472-dualfoe", ["Water", "Dragon"], 340),
  "fix-d472-drakesit": mk("fix-d472-drakesit", ["Dragon"], 120),
  "fix-d472-tidesit": mk("fix-d472-tidesit", ["Water"], 120),
};
const POOL = { ...FIXTURE_POOL, ...LOCAL };
const DECK = deckOf({
  "fix-d472-drakeswing": 4,
  "fix-d472-tideswing": 4,
  "fix-d472-drakefoe": 4,
  "fix-d472-tidefoe": 4,
  "fix-d472-dualfoe": 4,
  "fix-d472-drakesit": 4,
  "fix-d472-tidesit": 4,
  "fix-basic-1": 4,
  "fix-energy": 28,
});

function localSetup(first: Seat): GameState {
  const created = createGame({ seed: 11, decks: { p1: DECK, p2: DECK }, cardPool: POOL });
  if (!created.ok) throw new Error(created.error.code);
  let state = created.state;
  if (state.phase.kind !== "setup:chooseFirst") throw new Error("phase");
  state = must(
    applyAction(state, { type: "chooseFirstPlayer", seat: state.phase.coinWinner, first }),
  );
  while (state.phase.kind === "setup:drawExtra") {
    const phase = state.phase;
    const seat = (["p1", "p2"] as const).find((s) => !phase.decided[s]);
    if (seat === undefined) throw new Error("drawExtra");
    state = must(applyAction(state, { type: "setupDrawExtra", seat, count: phase.owed[seat] }));
  }
  for (const seat of ["p1", "p2"] as const) {
    state = must(
      applyAction(state, { type: "setupPlaceActive", seat, uid: firstBasicInHand(state, seat) }),
    );
  }
  for (const seat of ["p1", "p2"] as const) {
    state = must(applyAction(state, { type: "setupReady", seat }));
  }
  return state;
}

function table(swinger: string, ourBench: string, foe: string, theirBench: string): GameState {
  let state = must(applyAction(localSetup("p2"), { type: "endTurn", seat: "p2" }));
  state = setActiveFromDeck(state, "p1", swinger);
  state = clearBench(state, "p1");
  state = setActiveFromDeck(state, "p2", foe);
  state = clearBench(state, "p2");
  state = benchFromDeck(state, "p1", ourBench);
  state = benchFromDeck(state, "p2", theirBench);
  return attachFromDeck(state, "p1", "fix-energy", 1);
}

const BOARDS: [string, GameState][] = [
  ["A", table("fix-d472-tideswing", "fix-d472-tidesit", "fix-d472-drakefoe", "fix-d472-tidesit")],
  ["B", table("fix-d472-drakeswing", "fix-d472-tidesit", "fix-d472-tidefoe", "fix-d472-tidesit")],
  ["C", table("fix-d472-tideswing", "fix-d472-drakesit", "fix-d472-tidefoe", "fix-d472-tidesit")],
  ["D", table("fix-d472-tideswing", "fix-d472-tidesit", "fix-d472-tidefoe", "fix-d472-drakesit")],
  ["E", table("fix-d472-tideswing", "fix-d472-tidesit", "fix-d472-dualfoe", "fix-d472-tidesit")],
];


function topTypes(s: GameState, seat: Seat): string[] {
  const body = s.players[seat].active;
  if (body === null) return [];
  const uid = body.stack[body.stack.length - 1] as string;
  const id = s.cardIdByUid[uid] as string;
  return (POOL[id]?.types ?? []) as string[];
}
const D = "Dragon" as never;
const READINGS: [string, (s: GameState) => boolean][] = [
  ["CORRECT opponentActiveHasType Dragon", (s) => conditionHolds(s, "p1", { kind: "opponentActiveHasType", type: D })],
  ["gate DROPPED (unconditional)", () => true],
  ["SEAT INVERTED (reads our own Active)", (s) => conditionHolds(s, "p2", { kind: "opponentActiveHasType", type: D })],
  ["opponentInPlayHasType", (s) => conditionHolds(s, "p1", { kind: "opponentInPlayHasType", type: D })],
  ["yourBenchHasType", (s) => conditionHolds(s, "p1", { kind: "yourBenchHasType", type: D })],
  ["types[0] instead of includes", (s) => (topTypes(s, "p2"))[0] === "Dragon"],
  ["wrong constant (Colorless)", (s) => conditionHolds(s, "p1", { kind: "opponentActiveHasType", type: "Colorless" as never })],
  ["condition INVERTED", (s) => !conditionHolds(s, "p1", { kind: "opponentActiveHasType", type: D })],
];

for (const [label, f] of READINGS) {
  let bits = 0;
  const row: string[] = [];
  for (const [, state] of BOARDS) {
    const v = f(state);
    row.push(v ? "1" : "0");
    bits = bits * 2 + (v ? 1 : 0);
  }
  console.log(`${String(bits).padStart(3)}  ${row.join(",")}   ${label}`);
}
