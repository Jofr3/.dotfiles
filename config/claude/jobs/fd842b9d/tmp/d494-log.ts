import { applyAction, createGame, logFromEvents } from "/home/jofre/projects/luminous_ui/packages/engine/src/index.ts";
import type { Card, GameState, Seat } from "/home/jofre/projects/luminous_ui/packages/engine/src/index.ts";
import { battler, typedEnergy, deckOf, setActiveFromDeck, clearBench, attachFromDeck, benchFromDeck, attachBenchFromDeck } from "/home/jofre/projects/luminous_ui/packages/engine/src/testFixtures.ts";
const P = "If you have 3 or more Energy in play, this attack does 70 more damage. This attack's damage isn't affected by Weakness.";
const A="d494-attacker", R="d494-reserve", W="d494-wall", WA="d494-water", D="d494-dark";
const POOL: Record<string, Card> = {
  [A]: battler(A, { name: "D494 Threshold Drake", hp: 200, types: ["Water"], attacks: [{ cost: ["Colorless"], name: "Surging Reserve", damage: "100+", effect: P }] }),
  [R]: battler(R, { name: "D494 Reserve", hp: 90 }),
  [W]: battler(W, { name: "D494 Wall", hp: 400, weaknesses: [{ type: "Water", value: "×2" }], resistances: [{ type: "Water", value: "-30" }] }),
  [WA]: typedEnergy(WA, "Water"), [D]: typedEnergy(D, "Darkness"),
};
const DECK = deckOf({ [A]: 4, [R]: 8, [W]: 4, [WA]: 32, [D]: 12 });
function must(r: ReturnType<typeof applyAction>): GameState { if (!r.ok) throw new Error(r.error.code + " " + r.error.message); return r.state; }
function firstBasic(s: GameState, seat: Seat): string {
  const uid = s.players[seat].hand.find((h) => { const c = POOL[s.cardIdByUid[h] ?? ""]; return c?.category === "Pokemon" && c.stage === "Basic"; });
  if (!uid) throw new Error("no basic"); return uid;
}
const created = createGame({ seed: 4940, decks: { p1: DECK, p2: DECK }, cardPool: POOL });
if (!created.ok) throw new Error("createGame");
let st = created.state;
if (st.phase.kind !== "setup:chooseFirst") throw new Error("phase");
st = must(applyAction(st, { type: "chooseFirstPlayer", seat: st.phase.coinWinner, first: "p2" }));
while (st.phase.kind === "setup:drawExtra") { const ph = st.phase; const seat = (["p1","p2"] as const).find((s)=>!ph.decided[s]); if(!seat) break; st = must(applyAction(st, { type: "setupDrawExtra", seat, count: ph.owed[seat] })); }
for (const seat of ["p1","p2"] as const) st = must(applyAction(st, { type: "setupPlaceActive", seat, uid: firstBasic(st, seat) }));
for (const seat of ["p1","p2"] as const) st = must(applyAction(st, { type: "setupReady", seat }));
st = must(applyAction(st, { type: "endTurn", seat: "p2" }));
st = setActiveFromDeck(st, "p1", A); st = clearBench(st, "p1");
st = attachFromDeck(st, "p1", WA, 1); st = benchFromDeck(st, "p1", R);
st = attachBenchFromDeck(st, "p1", 0, WA, 1); st = attachBenchFromDeck(st, "p1", 0, D, 1);
st = setActiveFromDeck(st, "p2", W); st = clearBench(st, "p2");
const res = applyAction(st, { type: "attack", seat: "p1", index: 0 });
if (!res.ok) throw new Error("attack " + res.error.code);
for (const e of logFromEvents(res.events, { names: { p1: "Ash", p2: "Gary" }, state: res.state }) as Array<Record<string, unknown>>) {
  const segs = (e.segments ?? []) as Array<{ text: string }>;
  console.log("   [" + String(e.seat ?? "-") + "] " + segs.map((x) => x.text).join(""));
}
