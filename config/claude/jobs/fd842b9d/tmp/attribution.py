import hashlib, os, subprocess, sys
ROOT="/home/jofre/projects/luminous_ui"
TARGET=os.path.join(ROOT,"packages/engine/src/effects.ts")
FIND='    if (count >= 1) return [{ op: "drawCards", count, from: "bottom" }];'
REPL='    if (count >= 1) return [{ op: "drawCards", count }];'

def stat(p):
    b=open(p,"rb").read()
    return len(b), hashlib.sha256(b).hexdigest()

def run(spec):
    r=subprocess.run(["npx","vitest","run",spec],cwd=ROOT,capture_output=True,text=True)
    return r.returncode

before=stat(TARGET)
print("BEFORE", before)
src=open(TARGET,encoding="utf-8").read()
assert src.count(FIND)==1, src.count(FIND)
try:
    open(TARGET,"w",encoding="utf-8").write(src.replace(FIND,REPL,1))  # literal replacement, 1 occurrence
    print("MUTATED", stat(TARGET))
    for spec in ["packages/engine/src/deckBottomDraw.test.ts",
                 "packages/engine/src/optionalDraw.test.ts",
                 "packages/engine/src/censusAtHead.test.ts",
                 "packages/engine/src/exOnlyActive.test.ts",
                 "packages/engine/src/shuffleHandDraw.test.ts",
                 "packages/engine/src/handCostDraw.test.ts",
                 "packages/engine/src/runAwayDraw.test.ts"]:
        code=run(spec)
        print(f"  {'RED  ' if code!=0 else 'GREEN'}  exit={code}  {spec}")
finally:
    open(TARGET,"w",encoding="utf-8").write(src)
    after=stat(TARGET)
    print("RESTORED", after, "IDENTICAL" if after==before else "🛑 MISMATCH")
