import * as effects from "/home/jofre/projects/luminous_ui/packages/engine/src/effects";
import { attackReaderSurface, legalAttackCorpus, resolvedByAnyReader } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus";
const src = await Bun.file("/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus.ts").text();
const lines = src.split("\n");
const lineOf = (n: number, t: string) => lines.indexOf(`${n} ${t}`) + 1;
function servedOtherwise(t: string) {
  const g = (effects as any).splitAttackGateClause(t);
  const tr = (effects as any).splitAttackTrailingClause(t);
  const rq = (effects as any).splitAttackRequirementClause(t);
  const cn = (effects as any).splitAttackCancelClause(t);
  const parts: string[] = [];
  if (g && g.body !== "" && resolvedByAnyReader(g.body)) parts.push("GATE");
  if (tr && resolvedByAnyReader(tr.head) && (effects as any).deriveAttackEffect(tr.tail) !== null) parts.push("TRAIL");
  if (rq) parts.push("REQ?");
  if (cn) parts.push("CANCEL?");
  return parts;
}
for (const [n, t] of legalAttackCorpus()) {
  if (!/\b(Ancient|Future)\b/.test(t)) continue;
  if (resolvedByAnyReader(t)) continue;
  console.log(`line ${lineOf(n, t)}  ${n}p  served=${servedOtherwise(t).join(",") || "none"}  apos=${/['’]/.test(t)}  ${JSON.stringify(t)}`);
}
