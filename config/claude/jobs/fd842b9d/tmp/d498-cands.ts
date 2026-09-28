import { legalAttackCorpus, attackReaderSurface } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus.ts";
import * as effects from "/home/jofre/projects/luminous_ui/packages/engine/src/effects.ts";
const names = attackReaderSurface();
const rows = legalAttackCorpus().map((r: any) => r[1] as string);
type P = (t: string) => boolean;
const S = names.map(n => (effects as any)[n] as (t: string) => unknown);
const cands: [string, P][] = [
  ["SHIPPED  .some(r => r(t) !== null)",        t => S.some(r => r(t) !== null)],
  ["M1 .every(r => r(t) !== null)",             t => S.every(r => r(t) !== null)],
  ["M2 .some(r => r(t) !== undefined)",         t => S.some(r => (r(t) as any) !== undefined)],
  ["M3 .some(r => r(t) === null)",              t => S.some(r => r(t) === null)],
  ["M4 .some(r => r(t) != null)   [loose]",     t => S.some(r => (r(t) as any) != null)],
  ["M5 .some(r => Boolean(r(t)))  [truthy]",    t => S.some(r => Boolean(r(t)))],
  ["M6 .some(r => r(t) !== null) on [0] only",  t => [S[0]].some(r => r(t) !== null)],
  ["M7 return true",                            () => true],
  ["M8 return false",                           () => false],
];
for (const [label, p] of cands) {
  const n = rows.filter(p).length;
  console.log(`${String(n).padStart(4)}/640 claimed   ${label}`);
}
// falsy non-null returns?
let falsyNonNull = 0, undef = 0;
const kinds = new Set<string>();
for (const t of rows) for (const r of S) { const v = r(t) as any; if (v === undefined) undef++; else if (v !== null) { kinds.add(Array.isArray(v)?"array":typeof v); if (!v) falsyNonNull++; } }
console.log(`falsy-non-null returns = ${falsyNonNull}; undefined returns = ${undef}; value kinds = ${[...kinds].join(",")}`);
