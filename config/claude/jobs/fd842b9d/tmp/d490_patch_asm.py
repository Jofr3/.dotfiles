import io, sys
P = "/home/jofre/projects/luminous_ui/packages/engine/src/effects.ts"
src = io.open(P, encoding="utf-8").read()
before = src.count("\n")

FIND = """export function discardScaledBoostProgram(
  reading: AttackDiscardScaledBoost,
  base: number,
): EffectOp[] {
  return [
    {
      op: "discardEnergy",
      // The printed "your Benched Pokémon" — the own side MINUS the Active, which is
      // why `yours` is the wrong member: the Active's Energy paid for this attack.
      from: "yourBench",
      filter: reading.filter,
      // "You may discard up to N" is the declinable mode at a ceiling — `count: "any"`
      // plus `cap`, D97's split, and it ALWAYS parks on a non-empty Bench.
      count: "any",
      cap: reading.cap,
      recordAs: "discarded",
    },
    { op: "damageDefender", base, per: reading.per, count: "discarded" },
  ];
}"""

REPL = """export function discardScaledBoostProgram(
  reading: AttackDiscardScaledBoost,
  base: number,
): EffectOp[] {
  // \U0001f195\U0001f195 D490 — a `switch` ON THE DISCRIMINATOR and not a ternary over a payload
  // (D474): a third printed head has to be a MISSING CASE here, which is loud for every
  // member shape, rather than a field access that a compatibly-shaped member satisfies.
  switch (reading.kind) {
    case "benchDiscard":
      return [
        {
          op: "discardEnergy",
          // The printed "your Benched Pokémon" — the own side MINUS the Active, which is
          // why `yours` is the wrong member: the Active's Energy paid for this attack.
          from: "yourBench",
          filter: reading.filter,
          // "You may discard up to N" is the declinable mode at a ceiling — `count: "any"`
          // plus `cap`, D97's split, and it ALWAYS parks on a non-empty Bench.
          count: "any",
          cap: reading.cap,
          recordAs: "discarded",
        },
        { op: "damageDefender", base, per: reading.per, count: "discarded" },
      ];
    case "eachDeckMill":
      return [
        // The printed "the top card of each player's deck": ONE card, BOTH decks, and
        // one §9.2 filing holding what came off both — see the op's own block for why
        // two sequential mills cannot spell this (the slot is ASSIGNED, not appended).
        // The mill itself is UNFILTERED, exactly as `discardDeckTop`'s block says it
        // stays: the top card leaves whatever it is, and only the DAMAGE asks which of
        // the two were Energy.
        { op: "discardDeckTop", whose: "eachPlayer", count: 1, recordAs: "discarded" },
        // \U0001f6d1 THE PRINTED NOUN IS ON THE COUNT, NOT ON THE MILL, AND `countFilter` IS THE
        // SHIPPED FIELD FOR IT (D488). `base` is the attack's own printed number, KEPT
        // because the marker is a "+" — a slot of two Energy deals `base + 2 × per` as
        // ONE §8.5 pass, which is the whole reason `damageDefender.base` exists (D403).
        // An empty slot deals the printed base by the same expression, so the "nothing
        // was Energy" board needs no second arm.
        {
          op: "damageDefender",
          base,
          per: reading.per,
          count: "discarded",
          countFilter: { kind: "anyEnergy" },
        },
      ];
  }
}"""

if src.count(FIND) != 1:
    sys.stderr.write("FIND COUNT %d\n" % src.count(FIND)); raise SystemExit(2)
text = REPL.join(src.split(FIND))
payload = text.encode("utf-8")
open(P, "wb").write(payload)
print("effects.ts lines %d -> %d" % (before, text.count("\n")))
