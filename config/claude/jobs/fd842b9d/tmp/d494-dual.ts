import { attackReaderSurface, legalAttackCorpus } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus.ts";
import * as E from "/home/jofre/projects/luminous_ui/packages/engine/src/effects.ts";
const names = attackReaderSurface();
const mod = E as unknown as Record<string, (s: string) => unknown>;
for (const [n, t] of legalAttackCorpus() as unknown as [number, string][]) {
  const c = names.filter((k) => (mod[k]?.(t) ?? null) !== null);
  if (c.length > 1) console.log(n + "p", c.join("+"), "|", t.slice(0, 100));
}
