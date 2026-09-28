import * as effects from "/home/jofre/projects/luminous_ui/packages/engine/src/effects.ts";
const all = Object.entries(effects as Record<string, unknown>);
console.log("Object.entries KEY ORDER (as the loop sees it):");
all.forEach(([n, v], i) => console.log(`${String(i).padStart(3)} ${typeof v === "function" ? "fn " : "obj"} ${n}`));
