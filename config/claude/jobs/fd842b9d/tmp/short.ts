import { ANATOMY, MARKERS } from "/home/jofre/projects/luminous_ui/scripts/opaque-anatomy";
const blockers = MARKERS.filter(m=>m.verdict==="blocker");
const m2 = ANATOMY.filter(a=>a.cls==="MULTI-2");
const clean = m2.filter(a=>!blockers.some(b=>b.rx.test(a.text)));
console.log(`MULTI-2 ${m2.length}/${m2.reduce((s,a)=>s+a.units,0)}  — free of every BLOCKER marker: ${clean.length}/${clean.reduce((s,a)=>s+a.units,0)}`);
for (const a of clean) console.log(`  ${a.units}p ${a.text}\n      → ${a.hit?.onto}\n      regions ${a.hit?.regions.map(r=>`${r.alen}→${r.blen}`).join(" ")}`);
