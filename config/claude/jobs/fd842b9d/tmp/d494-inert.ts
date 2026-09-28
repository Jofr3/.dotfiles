import { MUTANTS } from "/home/jofre/projects/luminous_ui/scripts/mutation/mutants.ts";
const M = (MUTANTS as unknown as Array<Record<string, unknown>>).filter((m) =>
  String(m.decision).includes("D494"),
);
console.log("D494 rows:", M.length, "\n");
for (const m of M) {
  const f = String(m.find), r = String(m.replace);
  // strip comments and whitespace: what SEMANTIC token moved? (D450/D451)
  const strip = (s: string) =>
    s.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, " ").trim();
  const sf = strip(f), sr = strip(r);
  const inert = sf === sr;
  console.log(`${inert ? "🛑 INERT" : "live   "}  ${m.id}`);
  if (inert) console.log("     find/replace strip to the same program!");
  else {
    // show the first differing region
    let i = 0; while (i < sf.length && i < sr.length && sf[i] === sr[i]) i++;
    let j = 0; while (j < sf.length - i && j < sr.length - i && sf[sf.length-1-j] === sr[sr.length-1-j]) j++;
    console.log(`     - ${JSON.stringify(sf.slice(i, sf.length - j))}`);
    console.log(`     + ${JSON.stringify(sr.slice(i, sr.length - j))}`);
  }
}
