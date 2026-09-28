import subprocess
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
# D473's WORLD reconstructed: `printed` handled, `untilTails` already returned above,
# `pokemonInPlay` PEELED OFF (it did not exist at D473) — so the `:` branch faces
# exactly `attachedEnergy | bothActivesEnergy`, which is D474's predicted hazard.
TERNARY = """  const flips =
    count.kind === "printed"
      ? count.count
      : count.kind === "pokemonInPlay"
        ? 0
        : countAttachedEnergy(state, state.players[attackerSeat].active ?? attacker, count.energy);
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
    lines = out.stdout.split("\n")
    seen = set()
    for i, l in enumerate(lines):
        if "attack.ts" in l and "error" in l and l not in seen:
            seen.add(l)
            print("\n".join(lines[i:i+3]))
finally:
    with open(P, "wb") as fh:
        fh.write(ORIG.encode("utf-8"))
    with open(P, "r", encoding="utf-8") as fh:
        back = fh.read()
    print("RESTORED identical:", back == ORIG, "len", len(back))
