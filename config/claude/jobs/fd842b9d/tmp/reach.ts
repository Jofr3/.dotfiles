import { programFor, registryCardIds } from "/home/jofre/projects/luminous_ui/packages/engine/src/registry";
import { deriveAttackEffect } from "/home/jofre/projects/luminous_ui/packages/engine/src/effects";
import { legalAttackCorpus } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus";
let multi = 0, total = 0, maxLen = 0;
const walk = (v: unknown): void => {
  if (Array.isArray(v)) {
    const ops = v.filter((e) => e !== null && typeof e === "object" && "op" in (e as object));
    if (ops.length === v.length && v.length > 0) {
      total++; if (v.length > 1) multi++; maxLen = Math.max(maxLen, v.length);
    }
    v.forEach(walk); return;
  }
  if (v === null || typeof v !== "object") return;
  for (const el of Object.values(v as Record<string, unknown>)) walk(el);
};
for (const id of registryCardIds()) walk(programFor(id));
for (const [, t] of legalAttackCorpus()) { const p = deriveAttackEffect(t); if (p) walk(p); }
console.log({ total, multi, maxLen });
