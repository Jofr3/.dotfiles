import { legalAttackCorpus } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus";
import { deriveAttackEffect, splitAttackGateClause, splitAttackTrailingClause } from "/home/jofre/projects/luminous_ui/packages/engine/src/effects";
import { registryCardIds, programFor } from "/home/jofre/projects/luminous_ui/packages/engine/src/registry";
import type { EffectOp } from "/home/jofre/projects/luminous_ui/packages/engine/src/effects";

const PARKERS = new Set<string>();
// collect every program the engine can produce and report where discardDeckTop sits
type Prog = { src: string; ops: readonly EffectOp[] };
const progs: Prog[] = [];
for (const [, s] of legalAttackCorpus()) {
  const p = deriveAttackEffect(s);
  if (p !== null) progs.push({ src: `corpus: ${s}`, ops: p });
  const g = splitAttackGateClause(s);
  if (g !== null && g.body !== "") { const b = deriveAttackEffect(g.body); if (b) progs.push({ src: `gate: ${s}`, ops: b }); }
  const t = splitAttackTrailingClause(s);
  if (t !== null) { const b = deriveAttackEffect(s); if (b) progs.push({ src: `trail: ${s}`, ops: b }); }
}
for (const id of registryCardIds()) {
  const prog = programFor(id);
  if (prog === undefined) continue;
  for (const [k, v] of Object.entries(prog as Record<string, unknown>)) {
    if (Array.isArray(v)) progs.push({ src: `registry ${id}.${k}`, ops: v as EffectOp[] });
    else if (v && typeof v === "object" && "attack" in (v as object)) { /* skip */ }
  }
}
function walk(ops: readonly EffectOp[], src: string, depth: string) {
  ops.forEach((op, i) => {
    if (op.op === "discardDeckTop") {
      console.log(`  ${src} ${depth}[${i}/${ops.length}] whose=${(op as any).whose} recordAs=${(op as any).recordAs}`);
    }
    for (const key of ["then", "otherwise", "ops"] as const) {
      const sub = (op as any)[key];
      if (Array.isArray(sub)) walk(sub, src, `${depth}${op.op}.${key}>`);
    }
  });
}
console.log("=== every discardDeckTop the engine can produce, with its POSITION ===");
for (const p of progs) walk(p.ops, p.src.slice(0, 90), "");
