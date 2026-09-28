const { MUTANTS } = await import("/home/jofre/projects/luminous_ui/scripts/mutation/mutants.ts");
const mine = (MUTANTS as any[]).filter((m) => m.decision.includes("D472"));
console.log("D472 rows:", mine.length);
for (const m of mine) {
  const f = m.find;
  const r = m.replace;
  if (f === r) {
    console.log("!! IDENTICAL:", m.id);
    continue;
  }
  // strip every // line comment and every /* */ block, plus whitespace, and compare
  const strip = (s: string) =>
    s
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .map((l) => l.replace(/\/\/.*$/, ""))
      .join("\n")
      .replace(/\s+/g, " ")
      .trim();
  const same = strip(f) === strip(r);
  // first differing token run, so the SEMANTIC change is named (D450)
  let i = 0;
  while (i < f.length && i < r.length && f[i] === r[i]) i++;
  let j = 0;
  while (j < f.length - i && j < r.length - i && f[f.length - 1 - j] === r[r.length - 1 - j]) j++;
  const fromTok = f.slice(i, f.length - j);
  const toTok = r.slice(i, r.length - j);
  console.log(
    `${same ? "!! INERT-AFTER-COMMENT-STRIP" : "ok"}  ${m.id}\n     ${JSON.stringify(fromTok)}\n  -> ${JSON.stringify(toTok)}`,
  );
}
