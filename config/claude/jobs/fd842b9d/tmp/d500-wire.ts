import { applyAction } from "/home/jofre/projects/luminous_ui/packages/engine/src/index.ts";
import { deckOf, driveSetup, must, mustApply, setActiveFromDeck, clearBench, attachFromDeck, benchFromDeck, attachBenchFromDeck } from "/home/jofre/projects/luminous_ui/packages/engine/src/testFixtures.ts";
import { logFromEvents } from "/home/jofre/projects/luminous_ui/packages/engine/src/log.ts";
const DECK = deckOf({"fix-selfenergy":4,"fix-water-energy":12,"fix-energy":12,"fix-blend":4,"fix-special":8,"fix-titan":8,"fix-basic-1":12});
let state = must(applyAction(driveSetup(11,{p1:DECK,p2:DECK},{first:"p2"}),{type:"endTurn",seat:"p2"}));
state = setActiveFromDeck(state,"p1","fix-selfenergy"); state = clearBench(state,"p1");
state = setActiveFromDeck(state,"p2","fix-titan"); state = clearBench(state,"p2");
state = attachFromDeck(state,"p1","fix-water-energy",2);
state = attachFromDeck(state,"p1","fix-energy",2);
state = attachFromDeck(state,"p1","fix-blend",1);
state = benchFromDeck(state,"p1","fix-titan");
state = attachBenchFromDeck(state,"p1",0,"fix-water-energy",3);
state = attachFromDeck(state,"p2","fix-special",2);
const r = mustApply(state,{type:"attack",seat:"p1",index:3});
const wire = JSON.stringify(r.state);
for (const needle of ["energyOnSelf","energyType","\"basic\"","\"special\"","Normal","Special"]) {
  const i = wire.indexOf(needle);
  console.log(`${needle.padEnd(16)} ${i<0?"ABSENT":"at "+i+" : ..."+wire.slice(Math.max(0,i-90), i+60)+"..."}`);
}
console.log("\n--- log entries ---");
const entries = logFromEvents(r.events, { names:{p1:"Ember",p2:"Wren"}, state:r.state, elapsed:"+00:11" });
for (const e of entries) console.log(JSON.stringify({kind:(e as {kind?:string}).kind, who:(e as {who?:string}).who, text:(e as {segments?:{text:string}[]}).segments?.map(s=>s.text).join("")}));
