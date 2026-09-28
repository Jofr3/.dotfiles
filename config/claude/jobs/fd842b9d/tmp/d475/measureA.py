import subprocess, sys
P = "packages/engine/src/attack.ts"
with open(P, "r", encoding="utf-8") as fh:
    ORIG = fh.read()
SWITCH = """  let flips: number;
  switch (count.kind) {
    case "printed":
      flips = count.count;
      break;
    case "attachedEnergy":
      flips = countAttachedEnergy(
        state,
        state.players[attackerSeat].active ?? attacker,
        count.energy,
      );
      break;"""
TERNARY = """  const flips =
    count.kind === "printed"
      ? count.count
      : countAttachedEnergy(state, state.players[attackerSeat].active ?? attacker, count.energy);
  const UNUSED_D475_PROBE = 0;
  switch (count.kind) {
    case "printed":
      break;
    case "attachedEnergy":
      break;"""
try:
    assert ORIG.count(SWITCH) == 1
    new = ORIG.replace(SWITCH, TERNARY)
    with open(P, "wb") as fh:
        fh.write(new.encode("utf-8"))
    out = subprocess.run(["bunx", "tsc", "-b"], capture_output=True, text=True)
    print("=== TSC on the PRE-D474 TERNARY, with D475's member present ===")
    print(out.stdout[:6000])
    print("STDERR", out.stderr[:1000])
finally:
    with open(P, "wb") as fh:
        fh.write(ORIG.encode("utf-8"))
    with open(P, "r", encoding="utf-8") as fh:
        back = fh.read()
    print("RESTORED identical:", back == ORIG, "len", len(back))
