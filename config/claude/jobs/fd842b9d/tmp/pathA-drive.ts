import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, statSync } from "node:fs";
const ROOT = "/home/jofre/projects/luminous_ui";
const EFFECTS = `${ROOT}/packages/engine/src/effects.ts`;
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const original = readFileSync(EFFECTS, "utf8");
const beforeSize = statSync(EFFECTS).size, beforeSha = sha(original);

const FIND = `export function deriveAttackEffect(text: string): EffectOp[] | null {`;
if (original.split(FIND).length - 1 !== 1) throw new Error("FIND not unique");
const TAIL = "Before doing damage, you may attach any number of Basic {W} Energy cards from your hand to this Pokémon.";
const FULL = "This attack does 30 damage for each {W} Energy attached to this Pokémon. " + TAIL;
const REPLACE = FIND + `
  if (text.trim() === ${JSON.stringify(TAIL)}) {
    return [{ op: "attachFromHand", filter: { kind: "basicEnergy", energyType: "Water" } }];
  }`;
let patched = false;
try {
  writeFileSync(EFFECTS, original.replace(FIND, () => REPLACE), "utf8");
  patched = true;
  const fx = await import(`${ROOT}/packages/engine/src/testFixtures`);
  const idx = await import(`${ROOT}/packages/engine/src/index`);

  const PROBE = fx.battler("fix-d503probe", {
    name: "D503Probe", types: ["Water"], hp: 200, retreat: 1,
    attacks: [{ cost: ["Water"], name: "Aqua Surge", damage: 0, effect: FULL }],
  });
  const WALL = fx.battler("fix-d503wall", { types: ["Colorless"], hp: 300 });
  const pool = { ...fx.FIXTURE_POOL, "fix-d503probe": PROBE, "fix-d503wall": WALL } as any;

  const deck = [
    ...Array(4).fill("fix-d503probe"),
    ...Array(4).fill("fix-d503wall"),
    ...Array(30).fill("fix-water-energy"),
    ...Array(22).fill("fix-energy"),
  ];
  const decks = { p1: deck, p2: deck };
  let state = (idx as any).mustCreate ? null : null;
  // use createGame with the local pool (D414 idiom)
  const created = (idx as any).createGame({ seed: 7, decks, cardPool: pool });
  if (created.ok !== true) throw new Error("createGame failed: " + JSON.stringify(created).slice(0,300));
  console.log("created ok");
} finally {
  if (patched) {
    writeFileSync(EFFECTS, original, "utf8");
    const a = statSync(EFFECTS).size, b = sha(readFileSync(EFFECTS, "utf8"));
    console.log(`RESTORED size ok=${a===beforeSize} sha ok=${b===beforeSha}`);
  }
}
