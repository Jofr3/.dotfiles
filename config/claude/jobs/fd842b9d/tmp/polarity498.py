import re, pathlib, subprocess
root = pathlib.Path("packages/engine/src")
src = root/"censusAttackCorpus.ts"
orig = src.read_text()
line = "  return surface().some(([, read]) => read(text) !== null);"
assert orig.count(line) == 1
cases = {
  "every (narrowing 529->0)":   line.replace(".some(", ".every("),
  "undefined (widening 529->640)": line.replace("!== null", "!== undefined"),
}
suites = ["extraEnergyBonus","selfEnergyToHand"]
for name, mut in cases.items():
    src.write_text(orig.replace(line, mut))
    try:
        out=[]
        for s in suites:
            r = subprocess.run(["bunx","vitest","run",f"packages/engine/src/{s}.test.ts"],
                               capture_output=True, text=True, timeout=300)
            out.append(f"{s}={'RED' if r.returncode!=0 else 'green'}")
        print(f"{name:32} " + "  ".join(out))
    finally:
        src.write_text(orig)
print("restored identical:", src.read_text()==orig)
