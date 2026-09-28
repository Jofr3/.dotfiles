import { deriveAttackEffect } from "/home/jofre/projects/luminous_ui/packages/engine/src/effects";
import { legalAttackCorpus } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus";
import { programFor, registryCardIds } from "/home/jofre/projects/luminous_ui/packages/engine/src/registry";

type Op = { op: string; recordAs?: string; dest?: string };
function walk(ops: readonly unknown[]): Op[] {
  const out: Op[] = [];
  for (const o of ops as Op[]) {
    out.push(o);
    const then = (o as unknown as { then?: unknown[] }).then;
    if (Array.isArray(then)) out.push(...walk(then));
    const other = (o as unknown as { otherwise?: unknown[] }).otherwise;
    if (Array.isArray(other)) out.push(...walk(other));
    const ops2 = (o as unknown as { ops?: unknown[] }).ops;
    if (Array.isArray(ops2)) out.push(...walk(ops2));
  }
  return out;
}
const all: Op[] = [];
for (const [, s] of legalAttackCorpus()) all.push(...walk(deriveAttackEffect(s) ?? []));
let regPrograms = 0;
for (const id of registryCardIds()) {
  const p = programFor(id);
  if (p === undefined) continue;
  for (const key of ["attack", "ability", "trainer", "energy"] as const) {
    const v = (p as unknown as Record<string, unknown>)[key];
    if (Array.isArray(v)) { regPrograms++; all.push(...walk(v)); }
    else if (v !== undefined && v !== null && typeof v === "object") {
      for (const inner of Object.values(v as Record<string, unknown>)) {
        if (Array.isArray(inner)) { regPrograms++; all.push(...walk(inner)); }
      }
    }
  }
}
console.log("ops walked:", all.length, "| registry program slots:", regPrograms);
const searches = all.filter((o) => o.op === "searchDeck");
const recording = searches.filter((o) => o.recordAs !== undefined);
console.log("searchDeck ops:", searches.length);
console.log("searchDeck ops carrying `recordAs`:", recording.length,
  "| their dests:", [...new Set(recording.map((o) => o.dest))]);
console.log("recording ops of ANY kind:", all.filter((o) => o.recordAs !== undefined).length);
const dests = new Set(searches.map((o) => o.dest));
console.log("all searchDeck dests seen:", [...dests].sort());
