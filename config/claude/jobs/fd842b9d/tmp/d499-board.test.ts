import { describe, expect, it } from "vitest";
import { applyAction } from "/home/jofre/projects/luminous_ui/packages/engine/src/index";
import type { GameEvent, GameState } from "/home/jofre/projects/luminous_ui/packages/engine/src/index";
import {
  PREVENT_BLOCK_DECK,
  attachFromDeck,
  driveSetup,
  must,
  mustApply,
  setActiveFromDeck,
} from "/home/jofre/projects/luminous_ui/packages/engine/src/testFixtures";

const PRINTED =
  "Flip a coin. If tails, this attack does nothing. If heads, during your opponent's next turn, prevent all damage from and effects of attacks done to this Pokémon.";
const BARE_CANCEL = "Flip a coin. If tails, this attack does nothing.";

function withEffect(state: GameState, effect: string): GameState {
  const card = state.cardPool["sv03-004"];
  if (card === undefined) throw new Error("no sv03-004");
  const attacks = card.attacks ?? [];
  const first = attacks[0];
  if (first === undefined) throw new Error("no attack 0");
  return {
    ...state,
    cardPool: {
      ...state.cardPool,
      "sv03-004": { ...card, attacks: [{ ...first, effect }, ...attacks.slice(1)] },
    },
  };
}
function board(seed: number, effect: string): GameState {
  let s = must(
    applyAction(
      driveSetup(seed, { p1: PREVENT_BLOCK_DECK, p2: PREVENT_BLOCK_DECK }, { first: "p2" }),
      { type: "endTurn", seat: "p2" },
    ),
  );
  s = setActiveFromDeck(s, "p1", "sv03-004");
  s = attachFromDeck(s, "p1", "fix-energy", 1);
  return withEffect(s, effect);
}
const swing = (s: GameState) => mustApply(s, { type: "attack", seat: "p1", index: 0 });
const find = (e: GameEvent[], t: string) => e.find((x) => x.type === t);

describe("probe", () => {
  it("finds seeds and shows the two faces", () => {
    const heads: number[] = [];
    const tails: number[] = [];
    for (let seed = 1; seed <= 40; seed++) {
      try {
        const { events } = swing(board(seed, PRINTED));
        const f = find(events, "ATTACK_EFFECT_COIN_FLIP") as { result?: string } | undefined;
        if (f?.result === "heads") heads.push(seed);
        else if (f?.result === "tails") tails.push(seed);
      } catch (e) {
        // skip
      }
    }
    console.log("HEADS", heads.slice(0, 12), "TAILS", tails.slice(0, 12));
    const h = swing(board(heads[0] ?? 2, PRINTED));
    console.log("HEADS events:", h.events.map((e) => e.type).join(", "));
    console.log("HEADS block:", JSON.stringify(h.state.players.p1.active?.attackBlock));
    console.log("HEADS defender damage:", h.state.players.p2.active?.damage);
    console.log("HEADS turn:", h.state.turn);
    const t = swing(board(tails[0] ?? 1, PRINTED));
    console.log("TAILS events:", t.events.map((e) => e.type).join(", "));
    console.log("TAILS block:", JSON.stringify(t.state.players.p1.active?.attackBlock));
    console.log("TAILS defender damage:", t.state.players.p2.active?.damage);
    // rng: same seed, bare cancel vs compound
    for (const seed of [heads[0] ?? 2, tails[0] ?? 1]) {
      const a = swing(board(seed, BARE_CANCEL));
      const b = swing(board(seed, PRINTED));
      console.log(
        "seed",
        seed,
        "rng bare",
        JSON.stringify(a.state.rngState),
        "rng compound",
        JSON.stringify(b.state.rngState),
        "same:",
        JSON.stringify(a.state.rngState) === JSON.stringify(b.state.rngState),
        "flips:",
        a.events.filter((e) => e.type === "ATTACK_EFFECT_COIN_FLIP").length,
        b.events.filter((e) => e.type === "ATTACK_EFFECT_COIN_FLIP").length,
      );
    }
    expect(true).toBe(true);
  });
});
