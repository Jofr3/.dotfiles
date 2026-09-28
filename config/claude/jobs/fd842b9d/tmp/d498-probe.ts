// D498 manual attribution probe. Patches ONE line of censusAttackCorpus.ts, runs a
// named vitest set, records the FIRST failure, restores in `finally` (D459/D462).
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
const ROOT = "/home/jofre/projects/luminous_ui";
const FILE = ROOT + "/packages/engine/src/censusAttackCorpus.ts";
const FIND = "  return surface().some(([, read]) => read(text) !== null);";
const CASES: [string, string][] = [
  ["R1-every",        "  return surface().every(([, read]) => read(text) !== null);"],
  ["R2-undefined",    "  return surface().some(([, read]) => read(text) !== undefined);"],
  ["R3-loose",        "  return surface().some(([, read]) => read(text) != null);"],
  ["X-eqnull",        "  return surface().some(([, read]) => read(text) === null);"],
  ["X-truthy",        "  return surface().some(([, read]) => Boolean(read(text)));"],
];
const SUITES = process.argv.slice(3);
const only = process.argv[2];
const orig = readFileSync(FILE, "utf8");
const origLines = orig.split("\n").length;
if (orig.split(FIND).length - 1 !== 1) throw new Error("find does not occur exactly once");
for (const [name, repl] of CASES) {
  if (only !== "all" && only !== name) continue;
  try {
    const next = orig.replace(FIND, () => repl);
    if (next === orig) throw new Error("inert: replace === find");
    if (next.split("\n").length !== origLines) throw new Error("line count moved");
    writeFileSync(FILE, next, "utf8");
    const r = spawnSync("bunx", ["vitest", "run", "--pool=forks", "--maxWorkers=2", ...SUITES], {
      cwd: ROOT, encoding: "utf8", maxBuffer: 1 << 28,
    });
    const out = (r.stdout ?? "") + (r.stderr ?? "");
    const fails = out.split("\n").filter(l => /FAIL |AssertionError|→ expected|Tests  /.test(l));
    console.log(`\n===== ${name} : exit=${r.status} =====`);
    console.log(fails.slice(0, 14).join("\n"));
  } finally {
    writeFileSync(FILE, orig, "utf8");
  }
}
const back = readFileSync(FILE, "utf8");
console.log(`\nRESTORED_OK=${back === orig}`);
