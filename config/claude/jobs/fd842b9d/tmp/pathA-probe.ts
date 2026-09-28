// D503 — PATH A PROBE: make `deriveAttackEffect` claim the printed TAIL and let
// `splitAttackTrailingClause` compose the whole sentence. Measure what ships.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, statSync } from "node:fs";
const ROOT = "/home/jofre/projects/luminous_ui";
const EFFECTS = `${ROOT}/packages/engine/src/effects.ts`;
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const original = readFileSync(EFFECTS, "utf8");
const beforeSize = statSync(EFFECTS).size, beforeSha = sha(original);
console.log(`baseline: ${beforeSize} bytes sha=${beforeSha.slice(0,16)}`);

const FIND = `export function deriveAttackEffect(text: string): EffectOp[] | null {`;
if (original.split(FIND).length - 1 !== 1) throw new Error("FIND not unique");
const TAIL = "Before doing damage, you may attach any number of Basic {W} Energy cards from your hand to this Pokémon.";
const REPLACE = FIND + `
  // D503 TEMPORARY PATH-A PROBE — removed in a finally.
  if (text.trim() === ${JSON.stringify(TAIL)}) {
    return [{ op: "attachFromHand", filter: { kind: "basicEnergy", energyType: "Water" } }];
  }`;

const FULL = "This attack does 30 damage for each {W} Energy attached to this Pokémon. Before doing damage, you may attach any number of Basic {W} Energy cards from your hand to this Pokémon.";
let patched = false;
try {
  writeFileSync(EFFECTS, original.replace(FIND, () => REPLACE), "utf8");
  patched = true;
  const eff = await import(`${ROOT}/packages/engine/src/effects`);
  const cen = await import(`${ROOT}/packages/engine/src/censusAttackCorpus`);
  const fx = await import(`${ROOT}/packages/engine/src/testFixtures`);

  console.log("\n--- 1. does the splitter compose the PRINTED sentence now? ---");
  console.log("splitAttackTrailingClause(FULL) =>", JSON.stringify(eff.splitAttackTrailingClause(FULL)));
  console.log("resolvedByAnyReader(FULL) =>", cen.resolvedByAnyReader(FULL));

  console.log("\n--- 2. canonical residue predicate (verbatim from censusAtHead.test.ts) ---");
  const raw = cen.legalAttackCorpus().filter(([, t]: [number,string]) => !cen.resolvedByAnyReader(t));
  const residue = raw.filter(([, t]: [number,string]) => {
    const gate = eff.splitAttackGateClause(t);
    if (gate !== null && gate.body !== "" && cen.resolvedByAnyReader(gate.body)) return false;
    return eff.splitAttackTrailingClause(t) === null;
  });
  console.log(`raw refusal: ${raw.length} sentences / ${raw.reduce((s:number,[n]:[number,string])=>s+n,0)} printings`);
  console.log(`residue (minus gate+trailing, registry NOT subtracted here): ${residue.length} / ${residue.reduce((s:number,[n]:[number,string])=>s+n,0)}`);
  console.log(`TARGET still in residue? ${residue.some(([, t]: [number,string]) => t === FULL)}`);

  console.log("\n--- 3. DRIVE IT: what damage does the composed program deal? ---");
  const CARD = fx.battler("fix-d503probe", {
    name: "D503Probe", types: ["Water"], hp: 200, retreat: 1,
    attacks: [{ cost: ["Water"], name: "Aqua Surge", damage: 0, effect: FULL }],
  });
  const WALL = fx.battler("fix-d503wall", { types: ["Colorless"], hp: 300 });
  const pool: Record<string, unknown> = { ...fx.FIXTURE_POOL, "fix-d503probe": CARD, "fix-d503wall": WALL };
  // deck: the probe body, the wall, and Water Energy to attach/hold
  const WATER = Object.keys(fx.FIXTURE_POOL).find((k) => /water/i.test(k)) ?? null;
  console.log("candidate water energy fixture:", WATER);
  console.log("FIXTURE energy-ish keys:", Object.keys(fx.FIXTURE_POOL).filter((k)=>/energy/i.test(k)).join(", "));
} finally {
  if (patched) {
    writeFileSync(EFFECTS, original, "utf8");
    const a = statSync(EFFECTS).size, b = sha(readFileSync(EFFECTS, "utf8"));
    console.log(`\nRESTORED: ${a} bytes sha=${b.slice(0,16)}  size ok=${a===beforeSize} sha ok=${b===beforeSha}`);
  }
}
