import { applyAction } from "/home/jofre/projects/luminous_ui/packages/engine/src/index";
import { DEFENDER_STATUS_TRIPLE_DECK, attachFromDeck, clearBench, driveSetup, must, mustApply, setActiveFromDeck } from "/home/jofre/projects/luminous_ui/packages/engine/src/testFixtures";
import { presentStatuses } from "/home/jofre/projects/luminous_ui/packages/engine/src/types";
import type { GameState } from "/home/jofre/projects/luminous_ui/packages/engine/src/types";
const PRINTED = "This attack does 100 damage for each Special Condition affecting your opponent's Active Pokémon.";
function board(seed=11): GameState {
  let s = must(applyAction(driveSetup(seed,{p1:DEFENDER_STATUS_TRIPLE_DECK,p2:DEFENDER_STATUS_TRIPLE_DECK},{first:"p2"}),{type:"endTurn",seat:"p2"}));
  s = setActiveFromDeck(s,"p1","fix-oxford"); s = clearBench(s,"p1"); s = attachFromDeck(s,"p1","fix-energy",2);
  s = setActiveFromDeck(s,"p2","fix-titan"); s = clearBench(s,"p2"); return s;
}
function withEffect(state: GameState, effect: string, index=1): GameState {
  const card = state.cardPool["fix-oxford"]!; const attacks=[...(card.attacks ?? [])];
  attacks[index] = {...attacks[index]!, effect};
  return {...state, cardPool:{...state.cardPool, "fix-oxford":{...card, attacks}}};
}
let s = withEffect(board(29), PRINTED);
s = mustApply(s,{type:"attack",seat:"p1",index:0}).state;
s = mustApply(s,{type:"endTurn",seat:"p2"}).state;
console.log("conditions after a round:", JSON.stringify(s.players.p2.active?.conditions), "count", presentStatuses(s.players.p2.active!.conditions).length);
const r = mustApply(s,{type:"attack",seat:"p1",index:1});
console.log("dealt", r.events.find(e=>e.type==="DAMAGE_DEALT"));
