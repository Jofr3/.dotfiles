import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
const ROOT = "/home/jofre/projects/luminous_ui";
const m = await import(`${ROOT}/scripts/mutation/mutants.ts`);
const rows = ((m as any).MUTANTS ?? (m as any).default) as any[];
const ids = process.argv.slice(2);
for (const id of ids) {
  const r = rows.find((x) => x.id === id);
  if (r === undefined) { console.log(`?? ${id} not found`); continue; }
  const path = `${ROOT}/${r.file}`;
  const orig = readFileSync(path);
  try {
    const src = orig.toString("utf8");
    if (src.split(r.find).length - 1 !== 1) throw new Error("find not unique");
    writeFileSync(path, Buffer.from(src.split(r.find).join(r.replace), "utf8"));
    const res = spawnSync("bunx", ["vitest", "run", ...r.expectKilledBy], { cwd: ROOT, encoding: "utf8" });
    console.log(`${res.status === 0 ? "SURVIVES" : "KILLED  "}  ${id}  (${r.expectKilledBy.join(", ")})`);
  } finally {
    writeFileSync(path, orig);
    const now = readFileSync(path);
    if (Buffer.compare(orig, now) !== 0) throw new Error(`RESTORE FAILED for ${path}`);
  }
}
