import { readFileSync } from "node:fs";
import { legalAttackCorpus, resolvedByAnyReader, attackReaderSurface } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus";
import * as effects from "/home/jofre/projects/luminous_ui/packages/engine/src/effects";
const { splitAttackGateClause, splitAttackTrailingClause } = effects as any;

// ── the REGISTRY arm, transcribed exactly as scripts/residue-census.ts does it ──
const CENSUS = "/home/jofre/projects/luminous_ui/packages/engine/src/censusAtHead.test.ts";
function registryAttackSentences(): Set<string> {
  const src = readFileSync(CENSUS, "utf8");
  const head = src.indexOf('const REGISTRY_ATTACKS: readonly (readonly [string, string])[] = [');
  const end = src.indexOf("\n];", head);
  const block = src.slice(head, end).split("\n").map((l) => l.replace(/\s*\/\/.*$/, "")).join("\n");
  const PAIR = /\[\s*"(sv[a-z0-9.]*-\d+)"\s*,\s*"((?:[^"\\]|\\.)*)"\s*,?\s*\]/g;
  const s = new Set<string>();
  for (const m of block.matchAll(PAIR)) s.add((m[2] ?? "").replace(/\\"/g, '"'));
  return s;
}
const REGISTRY = registryAttackSentences();

export function buildsFull(text: string): boolean {
  if (resolvedByAnyReader(text)) return true;
  if (REGISTRY.has(text)) return true;
  const gate = splitAttackGateClause(text);
  if (gate !== null && gate.body !== "" && resolvedByAnyReader(gate.body)) return true;
  return splitAttackTrailingClause(text) !== null;
}
export function claims(text: string): string[] {
  const out: string[] = [];
  for (const [name, fn] of Object.entries(effects as any)) {
    if (!name.startsWith("deriveAttack") || typeof fn !== "function") continue;
    let v: unknown;
    try { v = (fn as any)(text); } catch { continue; }
    if (v === null || v === undefined) continue;
    out.push(`${name} -> ${JSON.stringify(v)}`);
  }
  return out;
}
export function arm(text: string): string {
  if (resolvedByAnyReader(text)) return "reader";
  if (REGISTRY.has(text)) return "registry";
  const g = splitAttackGateClause(text);
  if (g !== null && g.body !== "" && resolvedByAnyReader(g.body)) return "gate";
  if (splitAttackTrailingClause(text) !== null) return "trailing";
  return "NONE";
}
export function report(label: string, text: string) {
  const a = arm(text);
  console.log(`${a === "NONE" ? "🛑" : "✅"} [${a}] ${label}\n    «${text}»`);
  for (const c of claims(text)) console.log(`      ${c}`);
  const g = splitAttackGateClause(text);
  if (g) console.log(`      gateSplit: ${JSON.stringify(g)} bodyReader=${g.body!==""&&resolvedByAnyReader(g.body)}`);
  const t = splitAttackTrailingClause(text);
  if (t) console.log(`      trailingSplit: ${JSON.stringify(t)}`);
}
export const CORPUS = legalAttackCorpus();
