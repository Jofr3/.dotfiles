import { programFor, registryCardIds } from "/home/jofre/projects/luminous_ui/packages/engine/src/registry";
const holds = (v: unknown): boolean => {
  if (Array.isArray(v)) return v.some(holds);
  if (v === null || typeof v !== "object") return false;
  const r = v as Record<string, unknown>;
  if (r.op === "handRefresh") return true;
  return Object.values(r).some(holds);
};
const ids = registryCardIds().filter((id) => holds(programFor(id)));
console.log("producer card ids:", ids.length);
console.log(ids.join(" "));
