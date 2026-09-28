import { CORPUS, buildsFull, arm } from "./ask";
const needles = process.argv.slice(2);
for (const [p, t] of CORPUS as any) {
  if (needles.every((n) => t.includes(n))) {
    console.log(`${arm(t)==="NONE"?"🛑":"✅"} ${String(p).padStart(3)}p [${arm(t)}] ${t}`);
  }
}
