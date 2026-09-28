import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
const ROOT = "/home/jofre/projects/luminous_ui";
const FILE = ROOT + "/packages/engine/src/censusAttackCorpus.ts";
const FIND = "  return surface().some(([, read]) => read(text) !== null);";
const CASES: [string, string][] = [
  ["R1-every",     "  return surface().every(([, read]) => read(text) !== null);"],
  ["R2-undefined", "  return surface().some(([, read]) => read(text) !== undefined);"],
  ["R3-loose",     "  return surface().some(([, read]) => read(text) != null);"],
];
const GATES = [
  ["residue-census-gate", ["bun", "scripts/residue-census-gate.ts"]],
  ["opaque-anatomy-gate", ["bun", "scripts/opaque-anatomy-gate.ts"]],
] as const;
const orig = readFileSync(FILE, "utf8");
for (const [name, repl] of CASES) {
  try {
    const next = orig.replace(FIND, () => repl);
    if (next === orig) throw new Error("inert");
    writeFileSync(FILE, next, "utf8");
    for (const [g, argv] of GATES) {
      const r = spawnSync(argv[0], argv.slice(1), { cwd: ROOT, encoding: "utf8", maxBuffer: 1 << 26 });
      const out = ((r.stdout ?? "") + (r.stderr ?? "")).trim().split("\n");
      console.log(`${name} / ${g}: exit=${r.status}  ${out.slice(-2).join(" | ").slice(0, 260)}`);
    }
  } finally { writeFileSync(FILE, orig, "utf8"); }
}
console.log(`RESTORED_OK=${readFileSync(FILE, "utf8") === orig}`);
