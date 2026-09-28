"""`D502-arm-drops-the-record-gate` claims its only killer is the CAPTION and that
every BOARD is identical under it. Driven: apply the row and read WHICH `it` blocks
redden."""
import hashlib, subprocess, sys, json
ROOT="/home/jofre/projects/luminous_ui/"
rows=json.loads(subprocess.run(["bun","-e",
  'const {MUTANTS}=await import("./scripts/mutation/mutants.ts");'
  'console.log(JSON.stringify(MUTANTS.filter(m=>m.id==="D502-arm-drops-the-record-gate")));'],
  cwd=ROOT,capture_output=True,text=True,timeout=300).stdout)
r=rows[0]; path=ROOT+r["file"]
original=open(path,"rb").read(); size0=len(original); sha0=hashlib.sha256(original).hexdigest()
text=original.decode("utf-8")
assert text.count(r["find"])==1
print(f"baseline {r['file']}: {size0} bytes sha256 {sha0[:16]}…")
try:
    open(path,"wb").write(text.replace(r["find"], r["replace"], 1).encode("utf-8"))
    out=subprocess.run(["bunx","vitest","run","packages/engine/src/derivedBenchSearchMove.test.ts","--reporter=verbose"],
                       cwd=ROOT,capture_output=True,text=True,timeout=600)
    fails=[l.strip() for l in out.stdout.splitlines() if l.strip().startswith("×")]
    print(f"  failing `it` blocks: {len(fails)}")
    for f in fails: print("   ", f[:120])
finally:
    open(path,"wb").write(original)
    back=open(path,"rb").read()
    print(f"restored: {len(back)} bytes sha256 {hashlib.sha256(back).hexdigest()[:16]}… {'OK' if back==original else 'MISMATCH'}")
    assert back==original
