import { readFileSync, writeFileSync } from "node:fs";
const { BUILT } = await import("/home/jofre/.claude/jobs/fd842b9d/tmp/rows.ts");
const P = "/home/jofre/projects/luminous_ui/scripts/mutation/mutants.ts";
const src = readFileSync(P, "utf8");
const TAIL = "];\n";
if (!src.endsWith(TAIL)) throw new Error("unexpected tail");
if (src.includes('"D496-')) throw new Error("D496 rows already present — refusing to double-insert");
const q = (s: string) => JSON.stringify(s);
const block = (BUILT as any[])
  .map((r) =>
    [
      "  {",
      `    id: ${q(r.id)},`,
      `    decision: ${q(r.decision)},`,
      `    what: ${q(r.what)},`,
      `    file: ${q(r.file)},`,
      `    find: ${q(r.find)},`,
      `    replace: ${q(r.replace)},`,
      "    expectKilledBy: [",
      ...r.expectKilledBy.map((f: string) => `      ${q(f)},`),
      "    ],",
      "  },",
    ].join("\n"),
  )
  .join("\n");
const out = src.slice(0, src.length - TAIL.length) + block + "\n" + TAIL;
const before = src.split("\n").length;
const payload = Buffer.from(out, "utf8"); // encode FIRST (D463)
writeFileSync(P, payload);
const back = readFileSync(P, "utf8");
if (back !== out) throw new Error("write-back mismatch");
console.log(`lines ${before} -> ${back.split("\n").length} (+${back.split("\n").length - before}), rows +${(BUILT as any[]).length}`);
