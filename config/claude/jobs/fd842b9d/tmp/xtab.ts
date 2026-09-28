import { ANATOMY, MARKERS } from "/home/jofre/projects/luminous_ui/scripts/opaque-anatomy";
for (const m of MARKERS.filter(x=>x.verdict==="blocker")) {
  const hit = ANATOMY.filter(a=>m.rx.test(a.text));
  const inMulti = hit.filter(a=>a.hit!==null);
  console.log(`${m.name.padEnd(16)} OPAQUE ${hit.length}/${hit.reduce((s,a)=>s+a.units,0)}  of which MULTI-k ${inMulti.length}/${inMulti.reduce((s,a)=>s+a.units,0)}  labelled ${hit.length-inMulti.length}`);
}
const un = ANATOMY.filter(a=>a.cls==="UNEXPLAINED");
console.log(`\nUNEXPLAINED ${un.length}/${un.reduce((s,a)=>s+a.units,0)}  — largest printings first:`);
for (const a of [...un].sort((x,y)=>y.units-x.units).slice(0,6)) console.log(`  ${a.units}p ${a.text.slice(0,95)}`);
