import { MUTANTS } from "/home/jofre/projects/luminous_ui/scripts/mutation/mutants.ts";
import { execSync } from "node:child_process";
const M = MUTANTS as unknown as Array<Record<string, unknown>>;
const declared = M.filter((m) => m.survives !== undefined);
// files with DELETIONS in this slice's diff (D472's step 1)
const numstat = execSync("git -C /home/jofre/projects/luminous_ui diff --numstat", { encoding: "utf8" });
const withDeletions = new Set(
  numstat.split("\n").filter(Boolean).map((l) => l.split("\t")).filter((p) => p[1] !== "0").map((p) => p[2] as string),
);
const byFile = new Map<string, number>();
for (const d of declared) byFile.set(String(d.file), (byFile.get(String(d.file)) ?? 0) + 1);
console.log("declared survivors:", declared.length);
console.log("survivor files:", [...byFile].map(([f, n]) => `${f}=${n}`).join(", "));
const risky = declared.filter((d) => withDeletions.has(String(d.file)));
console.log(`\nSTEP 1 — survivors in files with DELETIONS: ${risky.length} of ${declared.length}`);
for (const d of risky) console.log("   ", d.id, "[" + d.decision + "]", d.file);
console.log(`STEP 2 — dismissed by file (no deletions there): ${declared.length - risky.length}`);
