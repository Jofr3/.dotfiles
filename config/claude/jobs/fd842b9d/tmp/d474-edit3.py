import hashlib
P = "/home/jofre/projects/luminous_ui/packages/engine/src/attack.ts"
orig = open(P, "rb").read()
text = orig.decode("utf-8")

FIND = """  const flips =
    count.kind === "printed"
      ? count.count
      : countAttachedEnergy(state, state.players[attackerSeat].active ?? attacker, count.energy);
"""
REPL = """  // 🆕🆕🛑 **D474 — A `switch` AND NOT A TERNARY, AND THE MEASUREMENT THAT DECIDED
  // IT IS WORTH KEEPING.** This was `count.kind === "printed" ? count.count :
  // countAttachedEnergy(…, count.energy)` — a two-way test standing in for a
  // three-way union, which is D222's closed-world hazard and D447's *"a total
  // `switch` is the only thing that sees a new union member"*.
  //
  // ⚠️ **THE TERNARY WAS NOT SILENT, AND THAT IS THE INTERESTING PART.** Measured on
  // THIS file before the conversion — the fourth member added to `AttackFlipCount`
  // and nothing else changed — `bunx tsc -b` answered **TS2339 at `count.energy`**:
  // *"Property 'energy' does not exist on type … | { kind: "pokemonInPlay"; filter:
  // CardFilter }"*. So the `:` branch really did go LOUD rather than swallowing the
  // new member.
  //
  // 🛑 **IT WAS LOUD FOR A REASON THAT DOES NOT GENERALISE, WHICH IS EXACTLY WHY
  // THE `switch` IS OWED ANYWAY.** The narrowing that saved it is the FIELD ACCESS,
  // not the discriminator: `count.energy` fails only because the new member has no
  // `energy` key. A fifth member carrying an `energy` field of a compatible type —
  // say a per-Energy count scoped to BOTH Actives, which is corpus file line 231 and
  // is exactly the next thing anyone will add here — would satisfy `count.energy`
  // and fall SILENTLY into the self-attached reading, computing a different number
  // on every board with no compile error anywhere. The ternary's exhaustiveness
  // rested on a payload coincidence; the `switch` rests on the discriminator, so the
  // next member is a compile error whatever it carries.
  let flips: number;
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
      break;
    // 🆕🆕 D474 — the BODY count. `countPokemonInPlay` (interpreter.ts) and NOT
    // `benchBodies` above: the printed noun is *"you have in play"*, which is §4's
    // Active + Bench, and the Bench-only walk would answer one lower on every board
    // with a matching Active. It is the same walk the `DamageCountSource.pokemonInPlay`
    // fold uses, so *"how many of my {D} Pokémon are in play"* has ONE answer no
    // matter which vocabulary asks (D159).
    //
    // ⚠️ **`attackerSeat` AND NOT `attacker`.** Every other arm here reads a BODY;
    // this one reads a SIDE, so the seat is the whole of what it needs and the
    // `attacker` parameter is untouched. Crossing it to `otherSeat(attackerSeat)`
    // would count the defender's board — the seat crossing D447/D454 name as this
    // engine's two worst uncaught defects — and is pinned by its own row.
    case "pokemonInPlay":
      flips = countPokemonInPlay(state, attackerSeat, count.filter);
      break;
  }
"""
parts = text.split(FIND)
assert len(parts) == 2, f"find occurs {len(parts) - 1}x"
out = REPL.join(parts)
payload = out.encode("utf-8")
with open(P, "wb") as fh:
    fh.write(payload)
now = open(P, "rb").read()
print("before", len(orig), "after", len(now), "delta", len(now) - len(orig))
print("sha", hashlib.sha256(now).hexdigest()[:16])
