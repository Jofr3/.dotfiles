import * as E from "/home/jofre/projects/luminous_ui/packages/engine/src/effects.ts";
import { attackReaderSurface } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus.ts";
const mod = E as unknown as Record<string, (t: string) => unknown>;
const names = attackReaderSurface();
export function claims(t: string): string[] {
  return names.filter((n) => {
    const v = mod[n]?.(t);
    return v !== null && v !== undefined;
  });
}
export function val(t: string): unknown {
  for (const n of names) {
    const v = mod[n]?.(t);
    if (v !== null && v !== undefined) return { [n]: v };
  }
  return null;
}
export function line(t: string) {
  const c = claims(t);
  return `${c.length === 0 ? "REFUSED " : "BUILDS  "} ${c.length}/13 ${JSON.stringify(t)}${c.length ? "  => " + JSON.stringify(val(t)) : ""}`;
}
