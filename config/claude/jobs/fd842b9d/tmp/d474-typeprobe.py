import subprocess, hashlib, os
P = "/home/jofre/projects/luminous_ui/packages/engine/src/effects.ts"
orig = open(P, "rb").read()
print("baseline size", len(orig), "sha", hashlib.sha256(orig).hexdigest()[:16])
FIND = '''export type AttackFlipCount =
  | { kind: "printed"; count: number }
  | { kind: "attachedEnergy"; energy: BasicEnergyType | "special" | null }
  | { kind: "untilTails" };'''
REPL = '''export type AttackFlipCount =
  | { kind: "printed"; count: number }
  | { kind: "attachedEnergy"; energy: BasicEnergyType | "special" | null }
  | { kind: "pokemonInPlay"; filter: CardFilter }
  | { kind: "untilTails" };'''
text = orig.decode("utf-8")
parts = text.split(FIND)
assert len(parts) == 2, f"find occurs {len(parts)-1}x"
try:
    payload = (REPL.join(parts)).encode("utf-8")
    with open(P, "wb") as fh:
        fh.write(payload)
    r = subprocess.run(["bunx", "tsc", "-b"], cwd="/home/jofre/projects/luminous_ui",
                       capture_output=True, text=True, timeout=900)
    print("EXIT", r.returncode)
    print(r.stdout[-6000:])
    print(r.stderr[-3000:])
finally:
    with open(P, "wb") as fh:
        fh.write(orig)
    now = open(P, "rb").read()
    print("restored size", len(now), "sha", hashlib.sha256(now).hexdigest()[:16], "IDENTICAL" if now == orig else "MISMATCH")
