import * as effects from "/home/jofre/projects/luminous_ui/packages/engine/src/effects.ts";

const all = Object.entries(effects as Record<string, unknown>);
console.log(`effects.ts exports: ${all.length}`);

const byType = new Map<string, number>();
for (const [, v] of all) byType.set(typeof v, (byType.get(typeof v) ?? 0) + 1);
console.log("export typeof histogram:", [...byType].map(([k, n]) => `${k}=${n}`).join(" "));

// The shipped predicate
const ship = all.filter(([n, v]) => n.startsWith("deriveAttack") && typeof v === "function").map(([n]) => n);
console.log(`\nSHIPPED  startsWith("deriveAttack") && typeof==="function"  -> ${ship.length}`);
console.log(ship.slice().sort().join("\n"));

const variants: [string, (n: string, v: unknown) => boolean][] = [
  ['startsWith("deriveAttack") ONLY (typeof guard deleted)', (n) => n.startsWith("deriveAttack")],
  ['includes("deriveAttack") && fn', (n, v) => n.includes("deriveAttack") && typeof v === "function"],
  ['endsWith("deriveAttack") && fn', (n, v) => n.endsWith("deriveAttack") && typeof v === "function"],
  ['startsWith("derive") && fn', (n, v) => n.startsWith("derive") && typeof v === "function"],
  ['startsWith("deriveAttac") && fn', (n, v) => n.startsWith("deriveAttac") && typeof v === "function"],
  ['startsWith("deriveAttackD") && fn', (n, v) => n.startsWith("deriveAttackD") && typeof v === "function"],
  ['startsWith("deriveAttacks") && fn', (n, v) => n.startsWith("deriveAttacks") && typeof v === "function"],
  ['startsWith("attack") && fn', (n, v) => n.startsWith("attack") && typeof v === "function"],
  ['typeof === "function" ONLY (prefix deleted)', (_n, v) => typeof v === "function"],
  ['startsWith("deriveAttack") && typeof !== "function"', (n, v) => n.startsWith("deriveAttack") && typeof v !== "function"],
  ['startsWith("deriveAttack") && typeof === "object"', (n, v) => n.startsWith("deriveAttack") && typeof v === "object"],
];
console.log("\n--- variant cardinalities ---");
for (const [label, p] of variants) {
  const got = all.filter(([n, v]) => p(n, v)).map(([n]) => n).sort();
  const same = got.length === ship.length && got.every((x, i) => x === [...ship].sort()[i]);
  console.log(`${String(got.length).padStart(3)}  ${same ? "SAME SET " : "DIFFERENT"}  ${label}`);
  if (!same && got.length <= 20) console.log(`      -> ${got.join(", ")}`);
}

// Does any export NAMED deriveAttack* fail the typeof guard?
const namedButNotFn = all.filter(([n, v]) => n.startsWith("deriveAttack") && typeof v !== "function");
console.log(`\nexports named deriveAttack* that are NOT functions: ${namedButNotFn.length}`);

// Is the shipped set already in sorted order as Object.entries yields it?
const insertion = all.filter(([n, v]) => n.startsWith("deriveAttack") && typeof v === "function").map(([n]) => n);
const sorted = [...insertion].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
console.log(`\nObject.entries order === sorted order? ${JSON.stringify(insertion) === JSON.stringify(sorted)}`);
console.log(`insertion: ${insertion.join(", ")}`);
console.log(`sorted   : ${sorted.join(", ")}`);
const rev = [...insertion].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
console.log(`reversed : ${rev.join(", ")}`);
