import { MUTANTS } from "/home/jofre/projects/luminous_ui/scripts/mutation/mutants";
import { readFileSync } from "node:fs";

const ROOT = "/home/jofre/projects/luminous_ui/";
type Region = { file: string; start: number; end: number; name: string };

function regionByBraces(file: string, needle: string, name: string, forward = 4000): Region {
  const src = readFileSync(ROOT + file, "utf-8");
  const at = src.indexOf(needle);
  if (at < 0) throw new Error(`needle not found: ${needle}`);
  return { file, start: at, end: at + forward, name };
}

const attack = readFileSync(ROOT + "packages/engine/src/attack.ts", "utf-8");
const effects = readFileSync(ROOT + "packages/engine/src/effects.ts", "utf-8");
const cont = readFileSync(ROOT + "packages/engine/src/continuous.ts", "utf-8");

function span(src: string, file: string, from: string, to: string, name: string): Region {
  const a = src.indexOf(from);
  if (a < 0) throw new Error(`missing from: ${from}`);
  const b = src.indexOf(to, a);
  if (b < 0) throw new Error(`missing to: ${to}`);
  return { file, start: a, end: b + to.length, name };
}

const regions: Region[] = [
  span(attack, "packages/engine/src/attack.ts", "function takeFlips(", "const ONE_FLIP", "takeFlips (body)"),
  span(effects, "packages/engine/src/effects.ts", "export type AttackFlipCount =", '| { kind: "untilTails" };', "AttackFlipCount decl"),
  span(cont, "packages/engine/src/continuous.ts", "export function countAttachedEnergy(", "\n}\n", "countAttachedEnergy defn"),
  span(effects, "packages/engine/src/effects.ts", "const ATTACK_COIN_PER_ENERGY =", "for each heads\\.$/;", "ATTACK_COIN_PER_ENERGY decl"),
  span(effects, "packages/engine/src/effects.ts", "  const perEnergy = ATTACK_COIN_PER_ENERGY.exec(effect);", "  // D129 — the two unbounded arms.", "ATTACK_COIN_PER_ENERGY arm"),
];

for (const r of regions) console.log(`REGION ${r.name} ${r.file} [${r.start}, ${r.end}) len=${r.end - r.start}`);

const srcCache = new Map<string, string>();
function src(f: string) {
  let s = srcCache.get(f);
  if (s === undefined) { s = readFileSync(ROOT + f, "utf-8"); srcCache.set(f, s); }
  return s;
}

for (const r of regions) {
  const hits: string[] = [];
  for (const m of MUTANTS) {
    if (m.file !== r.file) continue;
    const s = src(m.file);
    let at = s.indexOf(m.find);
    while (at >= 0) {
      const end = at + m.find.length;
      if (at < r.end && end > r.start) { hits.push(`${m.id} [${at},${end})`); break; }
      at = s.indexOf(m.find, at + 1);
    }
  }
  console.log(`\n== ${r.name}: ${hits.length} row(s) intersect by span`);
  for (const h of hits) console.log("   " + h);
}
console.log("\ncorpus total:", MUTANTS.length);
