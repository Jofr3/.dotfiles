import { CORPUS, claims, arm } from "./ask";
const out: string[] = [];
for (const [p, t] of CORPUS as any) {
  const cs = claims(t);
  out.push(`${String(p).padStart(3)}p [${arm(t)}] ${t}`);
  for (const c of cs) out.push(`      ${c}`);
}
console.log(out.join("\n"));
