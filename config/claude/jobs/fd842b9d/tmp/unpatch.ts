import { readFileSync, writeFileSync } from "node:fs";
import { MUTANTS } from "/home/jofre/projects/luminous_ui/scripts/mutation/mutants";
const ids = readFileSync("/home/jofre/.claude/jobs/fd842b9d/tmp/broken.txt", "utf8").trim().split("\n");
for (const id of ids) {
  const row = (MUTANTS as any[]).find((m) => m.id === id);
  if (!row) { console.log("NO ROW", id); continue; }
  const p = "/home/jofre/projects/luminous_ui/" + row.file;
  const s = readFileSync(p, "utf8");
  const nR = s.split(row.replace).length - 1;
  const nF = s.split(row.find).length - 1;
  console.log(`${id}  file=${row.file}  replace×${nR}  find×${nF}`);
  if (nR === 1 && nF === 0) {
    writeFileSync(p, s.replace(row.replace, row.find));
    console.log("   -> UNPATCHED");
  }
}
