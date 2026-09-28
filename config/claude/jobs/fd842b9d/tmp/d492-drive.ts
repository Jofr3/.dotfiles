import type { Card } from "@luminous/schema";
import { applyAction, createGame } from "/home/jofre/projects/luminous_ui/packages/engine/src/index";
import type { GameState, Seat } from "/home/jofre/projects/luminous_ui/packages/engine/src/index";
import {
  FIXTURE_POOL,
  attachFromDeck,
  attachToolFromDeck,
  battler,
  benchFromDeck,
  clearBench,
  deckOf,
  firstBasicInHand,
  must,
  mustApply,
  setActiveFromDeck,
} from "/home/jofre/projects/luminous_ui/packages/engine/src/testFixtures";

const SEED = 492_0492;
const EX_V_100 =
  "This attack does 100 damage to each of your opponent's Pokémon ex and Pokémon V. This attack's damage isn't affected by Weakness or Resistance.";
const EX_60 =
  "This attack does 60 damage to each of your opponent's Pokémon ex. This attack's damage isn't affected by Weakness or Resistance.";
const FOR_EACH_EX_V_60 =
  "This attack does 60 damage for each of your opponent's Pokémon ex and Pokémon V in play.";
const FOR_EACH_EX_60 = "This attack does 60 damage for each of your opponent's Pokémon ex in play.";

const CARDS: Record<string, Card> = {
  "d492-sniper": battler("d492-sniper", {
    name: "D492 Sniper",
    types: ["Colorless"],
    hp: 320,
    retreat: 1,
    attacks: [
      { cost: ["Colorless"], name: "Rule Purge", effect: EX_V_100 },
      { cost: ["Colorless"], name: "Ex Purge", effect: EX_60 },
      { cost: ["Colorless"], name: "Pair Count", effect: FOR_EACH_EX_V_60 },
      { cost: ["Colorless"], name: "Ex Count", effect: FOR_EACH_EX_60 },
      { cost: ["Colorless"], name: "Plain Cuff", damage: 30 },
    ],
  }),
  "d492-wall-ex": battler("d492-wall-ex", {
    name: "D492 Wall ex",
    types: ["Colorless"],
    hp: 500,
    weaknesses: [{ type: "Colorless", value: "×2" }],
  }),
  "d492-wall-ex-nw": battler("d492-wall-ex-nw", {
    name: "D492 Bare Wall ex",
    types: ["Colorless"],
    hp: 500,
  }),
  "d492-wall": battler("d492-wall", { name: "D492 Wall", types: ["Colorless"], hp: 340 }),
  "d492-foe-ex": battler("d492-foe-ex", { name: "D492 Foe ex", types: ["Fighting"], hp: 330 }),
  "d492-foe-v": battler("d492-foe-v", { name: "D492 Foe V", types: ["Colorless"], hp: 320 }),
  "d492-foe": battler("d492-foe", { name: "D492 Foe", types: ["Colorless"], hp: 310 }),
  "d492-other-ex": battler("d492-other-ex", { name: "D492 Other ex", types: ["Colorless"], hp: 300 }),
};
const POOL: Record<string, Card> = { ...FIXTURE_POOL, ...CARDS };
const DECK = deckOf({
  "d492-sniper": 6,
  "d492-wall-ex": 6,
  "d492-wall-ex-nw": 6,
  "d492-wall": 6,
  "d492-foe-ex": 6,
  "d492-foe-v": 6,
  "d492-foe": 6,
  "d492-other-ex": 6,
  "sv01-192": 4,
  "fix-energy": 8,
  "fix-water-energy": 0,
});

function open(first: Seat): GameState {
  const created = createGame({ seed: SEED, decks: { p1: DECK, p2: DECK }, cardPool: POOL });
  if (!created.ok) throw new Error(created.error.code);
  let t = created.state;
  if (t.phase.kind !== "setup:chooseFirst") throw new Error("bad phase");
  t = must(applyAction(t, { type: "chooseFirstPlayer", seat: t.phase.coinWinner, first }));
  while (t.phase.kind === "setup:drawExtra") {
    const d = t.phase;
    const owing = (["p1", "p2"] as const).find((s) => !d.decided[s]);
    if (owing === undefined) throw new Error("none owing");
    t = must(applyAction(t, { type: "setupDrawExtra", seat: owing, count: d.owed[owing] }));
  }
  for (const seat of ["p1", "p2"] as const) {
    t = must(applyAction(t, { type: "setupPlaceActive", seat, uid: firstBasicInHand(t, seat) }));
  }
  for (const seat of ["p1", "p2"] as const) t = must(applyAction(t, { type: "setupReady", seat }));
  return t;
}

function table(defender: string, bench: readonly string[]): GameState {
  let t = open("p2");
  t = mustApply(t, { type: "endTurn", seat: "p2" }).state;
  t = setActiveFromDeck(t, "p1", "d492-sniper");
  t = setActiveFromDeck(t, "p2", defender);
  t = clearBench(t, "p1");
  t = clearBench(t, "p2");
  t = attachFromDeck(t, "p1", "fix-energy", 2);
  for (const c of bench) t = benchFromDeck(t, "p2", c);
  return t;
}

const vec = (s: GameState) => [s.players.p2.active?.damage ?? 0, ...s.players.p2.bench.map((p) => p.damage)];

console.log("\n### BOARD M");
{
    const M = table("d492-wall-ex", ["d492-foe-ex", "d492-foe-v", "d492-foe", "d492-other-ex"]);
    const a0 = mustApply(M, { type: "attack", seat: "p1", index: 0 });
    console.log("EX_V_100 on M:", vec(a0.state), a0.state.phase.kind);
    console.log("  events:", a0.events.map((e) => e.type).join(","));
    const a1 = mustApply(M, { type: "attack", seat: "p1", index: 1 });
    console.log("EX_60 on M:", vec(a1.state));
    const a2 = mustApply(M, { type: "attack", seat: "p1", index: 2 });
    console.log("FOR_EACH_EX_V_60 on M:", vec(a2.state));
    const a3 = mustApply(M, { type: "attack", seat: "p1", index: 3 });
    console.log("FOR_EACH_EX_60 on M:", vec(a3.state));
    console.log("p1 board after a0:", [a0.state.players.p1.active?.damage, ...a0.state.players.p1.bench.map((p) => p.damage)]);
}
console.log("\n### BOARD C — chestplate on bench0 (an {F} ex)");
{
    let C = table("d492-wall-ex", ["d492-foe-ex", "d492-foe-v", "d492-foe", "d492-other-ex"]);
    C = attachToolFromDeck(C, "p2", 0, "sv01-192");
    const a0 = mustApply(C, { type: "attack", seat: "p1", index: 0 });
    console.log("EX_V_100 on C:", vec(a0.state));
    console.log("  DAMAGE_DEALT rows:", JSON.stringify(a0.events.filter((e) => e.type === "DAMAGE_DEALT")));
}
console.log("\n### BOARD S — only ex is the Active (weakness)");
{
    const S = table("d492-wall-ex", ["d492-foe"]);
    console.log("EX_60 on S:", vec(mustApply(S, { type: "attack", seat: "p1", index: 1 }).state));
    console.log("FOR_EACH_EX_60 on S:", vec(mustApply(S, { type: "attack", seat: "p1", index: 3 }).state));
    const Snw = table("d492-wall", ["d492-foe"]);
    console.log("no-ex active EX_60:", vec(mustApply(Snw, { type: "attack", seat: "p1", index: 1 }).state));
    const Snowk = table("d492-wall-ex-nw", ["d492-foe"]);
    console.log("COLLISION no-weakness EX_60:", vec(mustApply(Snowk, { type: "attack", seat: "p1", index: 1 }).state));
    console.log("COLLISION no-weakness FOR_EACH_EX_60:", vec(mustApply(Snowk, { type: "attack", seat: "p1", index: 3 }).state));
}
console.log("\n### BOARD N — Active not an ex");
{
    const N = table("d492-wall", ["d492-foe-ex", "d492-foe-v", "d492-foe", "d492-other-ex"]);
    console.log("EX_V_100 on N:", vec(mustApply(N, { type: "attack", seat: "p1", index: 0 }).state));
    console.log("FOR_EACH_EX_V_60 on N:", vec(mustApply(N, { type: "attack", seat: "p1", index: 2 }).state));
}
console.log("\n### BOARD Z — no ex/V anywhere");
{
    const Z = table("d492-wall", ["d492-foe"]);
    const r = mustApply(Z, { type: "attack", seat: "p1", index: 0 });
    console.log("EX_V_100 on Z:", vec(r.state), r.state.phase.kind);
    console.log("  events:", r.events.map((e) => e.type).join(","));
}
