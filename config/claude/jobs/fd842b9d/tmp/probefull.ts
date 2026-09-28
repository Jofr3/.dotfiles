import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
const { CANDS } = await import("/home/jofre/.claude/jobs/fd842b9d/tmp/cands.ts");
const ROOT = "/home/jofre/projects/luminous_ui";
const TARGET = `${ROOT}/packages/engine/src/effects.ts`;
const ORIGINAL = readFileSync(TARGET, "utf8");
const ORIGINAL_BYTES = Buffer.from(ORIGINAL, "utf8");

const restore = () => { try { writeFileSync(TARGET, ORIGINAL_BYTES); } catch {} };
process.on("SIGINT", () => { restore(); process.exit(130); });
process.on("SIGTERM", () => { restore(); process.exit(143); });
process.on("exit", restore);

const only = process.argv.slice(2);
const todo = (CANDS as any[]).filter((c) => only.some((o) => c.id.startsWith(o)));
const out: string[] = [];
try {
  for (const c of todo) {
    const parts = ORIGINAL.split(c.find);
    if (parts.length !== 2) throw new Error(`${c.id}: find ${parts.length - 1}×`);
    const mutated = parts.join(c.replace);
    if (mutated === ORIGINAL) throw new Error(`${c.id}: INERT`);
    writeFileSync(TARGET, Buffer.from(mutated, "utf8"));
    if (readFileSync(TARGET, "utf8") !== mutated) throw new Error("write-back mismatch");
    const t0 = Date.now();
    const r = spawnSync("bunx", ["vitest", "run", "--pool=forks", "--maxWorkers=2"], {
      cwd: ROOT, encoding: "utf8", timeout: 3_600_000, env: { ...process.env, CI: "1" },
    });
    const o = (r.stdout ?? "") + (r.stderr ?? "");
    out.push(`\n===== FULL SUITE :: ${c.id} :: ${r.status === 0 ? "SURVIVED" : "KILLED"} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
    out.push(o.match(/Test Files\s+.*$/m)?.[0] ?? "(no Test Files line)");
    out.push(o.match(/Tests\s+.*$/m)?.[0] ?? "(no Tests line)");
    for (const m of [...o.matchAll(/^\s*FAIL\s+.*$/gm)].slice(0, 20)) out.push("   " + m[0].trim().slice(0, 200));
    console.error(out[out.length - 3]);
  }
} finally {
  writeFileSync(TARGET, ORIGINAL_BYTES);
  console.error(`[restore] match=${String(readFileSync(TARGET, "utf8") === ORIGINAL)}`);
}
console.log(out.join("\n"));
