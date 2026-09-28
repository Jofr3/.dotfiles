import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const ARGV = "scripts/mutation/argv.ts";
const RUN = "scripts/mutation/run.ts";

type Edit = { name: string; file: string; find: string; replace: string };

const EDITS: Edit[] = [
  { name: "E1 unknown `--` flag no longer rejected", file: ARGV,
    find: "    if (!KNOWN_FLAGS.includes(arg)) {",
    replace: "    if (!KNOWN_FLAGS.includes(arg) && !arg.startsWith(\"--\")) {" },
  { name: "E2 missing value reads as a value", file: ARGV,
    find: "    const value = argv[i + 1];",
    replace: "    const value = argv[i + 1] ?? \"x\";" },
  { name: "E3 flag-shaped value accepted", file: ARGV,
    find: "    if (value.startsWith(\"-\")) {",
    replace: "    if (false) {" },
  { name: "E4 bare positional accepted", file: ARGV,
    find: "    if (!KNOWN_FLAGS.includes(arg)) {",
    replace: "    if (!KNOWN_FLAGS.includes(arg) && arg.startsWith(\"-\")) {" },
  { name: "E5 repeated flag accepted", file: ARGV,
    find: "    if (seen.has(arg)) {",
    replace: "    if (false) {" },
  { name: "E6 OVER-fires: any value containing a dash refused", file: ARGV,
    find: "    if (value.startsWith(\"-\")) {",
    replace: "    if (value.includes(\"-\")) {" },
  { name: "E7 guard disabled in place (order untouched)", file: RUN,
    find: "  if (problems.length > 0) {",
    replace: "  if (problems.length > 0 && false) {" },
  { name: "E8 a flag added to run.ts and not registered", file: RUN,
    find: "  const full = argv.includes(\"--full\");",
    replace: "  const full = argv.includes(\"--full\") || argv.includes(\"--dry-run\");" },
  { name: "E9 `--decision` tightened to an exact match", file: RUN,
    find: "      (decision === undefined || m.decision.includes(decision)),",
    replace: "      (decision === undefined || m.decision === decision)," },
];

// E10 is a MOVE, not a substitution — handled separately below.

function runSuite(): { failed: number; passed: number; names: string[] } {
  const r = spawnSync("bunx", ["vitest", "run", "packages/engine/src/mutationArgvGuard.test.ts"],
    { encoding: "utf8" });
  const out = `${r.stdout}${r.stderr}`;
  const m = /Tests\s+(?:(\d+) failed \| )?(\d+) passed/.exec(out);
  const names = [...out.matchAll(/^\s+×\s+(.+?)\s+\d+ms$/gm)].map((x) => x[1] ?? "");
  return { failed: Number(m?.[1] ?? 0), passed: Number(m?.[2] ?? 0), names };
}

const base = runSuite();
console.log(`BASELINE: ${base.passed} passed, ${base.failed} failed\n`);

for (const e of EDITS) {
  const original = readFileSync(e.file, "utf8");
  const n = original.split(e.find).length - 1;
  if (n !== 1) { console.log(`${e.name}: find occurs ${n}× — SKIPPED`); continue; }
  writeFileSync(e.file, original.split(e.find).join(e.replace));
  try {
    const r = runSuite();
    console.log(`${e.name}\n    -> ${r.failed} failed / ${r.passed} passed`);
    for (const nm of r.names) console.log(`       × ${nm}`);
  } finally {
    writeFileSync(e.file, original);
  }
}

// E10 — MOVE the validation block to AFTER the journal recovery.
{
  const original = readFileSync(RUN, "utf8");
  const start = original.indexOf("  const problems = argvProblems(argv);");
  const endMark = "    process.exit(4);\n  }\n";
  const end = original.indexOf(endMark, start) + endMark.length;
  const block = original.slice(start, end);
  const anchor = "  if (journalState === \"recovered\") process.exit(2);\n";
  const moved = original.slice(0, start) + original.slice(end)
    .replace(anchor, `${anchor}\n${block}`);
  writeFileSync(RUN, moved);
  try {
    const r = runSuite();
    console.log(`E10 validation MOVED below --list and recoverFromJournal()\n    -> ${r.failed} failed / ${r.passed} passed`);
    for (const nm of r.names) console.log(`       × ${nm}`);
  } finally {
    writeFileSync(RUN, original);
  }
}

const after = runSuite();
console.log(`\nRESTORED: ${after.passed} passed, ${after.failed} failed`);
