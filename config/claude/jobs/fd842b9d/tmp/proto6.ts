import { rows } from "/home/jofre/projects/luminous_ui/scripts/residue-census";
const opaque = rows.filter((r) => r.cls === "OPAQUE");
opaque.forEach((r, i) => console.log(`${String(i+1).padStart(2)}  ${String(r.units).padStart(2)}p  ${r.text}`));
console.log(`\nTOTAL ${opaque.length} / ${opaque.reduce((s,r)=>s+r.units,0)}`);
