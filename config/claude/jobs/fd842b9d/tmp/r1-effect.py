import subprocess, os
ROOT="/home/jofre/projects/luminous_ui"
P=os.path.join(ROOT,"packages/engine/src/censusAttackCorpus.ts")
PRED='      if (name.startsWith("deriveAttack") && typeof value === "function") {'
REPL='      if (typeof value === "function") {'
MEASURE='''
import { legalAttackCorpus, resolvedByAnyReader, attackReaderSurface } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus.ts";
import * as effects from "/home/jofre/projects/luminous_ui/packages/engine/src/effects.ts";
const corpus = legalAttackCorpus();
const claimed = corpus.filter(([, t]) => resolvedByAnyReader(t));
console.log("surface=" + attackReaderSurface().length);
console.log("corpus=" + corpus.length + "  claimed=" + claimed.length);
const extras = attackReaderSurface().filter((n) => !n.startsWith("deriveAttack"));
console.log("non-deriveAttack members=" + extras.length + " -> " + extras.join(", "));
const sample = corpus[0][1];
for (const n of extras) {
  const v = (effects as Record<string, unknown>)[n] as (t: string) => unknown;
  let r: unknown; try { r = v(sample); } catch (e) { r = "THREW:" + String(e).slice(0, 40); }
  console.log(`  ${n}(sample) -> ${typeof r} ${JSON.stringify(r)?.slice(0,40)}  !==null? ${r !== null}`);
}
'''
open("/tmp/d497measure.ts","w").write(MEASURE)
orig=open(P,encoding="utf-8").read()
assert orig.count(PRED)==1
parts=orig.split(PRED); mut=parts[0]+REPL+parts[1]
try:
    open(P,"wb").write(mut.encode("utf-8"))
    r=subprocess.run(["bun","/tmp/d497measure.ts"],cwd=ROOT,capture_output=True,text=True)
    print("=== UNDER R1 MUTATION ===\n"+r.stdout+r.stderr)
finally:
    open(P,"wb").write(orig.encode("utf-8"))
    assert open(P,encoding="utf-8").read()==orig
    print("restored OK")
r=subprocess.run(["bun","/tmp/d497measure.ts"],cwd=ROOT,capture_output=True,text=True)
print("=== AT HEAD ===\n"+r.stdout+r.stderr)
