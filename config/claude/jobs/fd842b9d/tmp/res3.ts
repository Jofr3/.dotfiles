import { legalAttackCorpus, resolvedByAnyReader } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus";
import { splitAttackGateClause, splitAttackTrailingClause } from "/home/jofre/projects/luminous_ui/packages/engine/src/effects";
const raw = legalAttackCorpus().filter(([, t]) => !resolvedByAnyReader(t));
const trail = raw.filter(([, t]) => splitAttackTrailingClause(t) !== null);
console.log("raw", raw.length, "trail-nonnull", trail.length, trail.reduce((a,[n])=>a+n,0));
const gate = raw.filter(([, t]) => { const g = splitAttackGateClause(t); return g !== null && g.body !== "" && resolvedByAnyReader(g.body); });
console.log("gate-served", gate.length, gate.reduce((a,[n])=>a+n,0));
