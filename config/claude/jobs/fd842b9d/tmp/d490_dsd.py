import io, sys
P = "/home/jofre/projects/luminous_ui/packages/engine/src/discardScaledDamage.test.ts"
s = io.open(P, encoding="utf-8").read()
FIND = """    // …and the REFUSALS the old rung carried are kept rather than discarded (D438's
    // second half): the ADDITIVE half's leftover is still unread by every reader, and
    // it is a different mechanism again — a mill of BOTH decks with a kept base.
    const additiveLeft = legalAttackCorpus().filter(
      ([, s]) =>
        s.includes("discarded in this way") &&
        s.includes("more damage for each") &&
        !readByAny(s),
    );
    expect(additiveLeft).toHaveLength(1);
    expect(units(additiveLeft)).toBe(2);
    for (const [, s] of additiveLeft) {
      expect(readByAny(s), s).toBe(false);
      expect(s.startsWith("Discard the top card of each player's deck."), s).toBe(true);
    }"""
REPL = """    // \U0001f195\U0001f195\U0001f195 **D490 — THE ADDITIVE HALF'S LEFTOVER IS BUILT, SO THE REFUSAL BECOMES A
    // PARTITION RATHER THAN A SHORTER LIST.** D489 kept this as *"still unread by every
    // reader … a mill of BOTH decks with a kept base"*, which was an exact description of
    // the price and is now paid: `discardDeckTop.whose` gained `"eachPlayer"` and the
    // additive reader gained a second member. Re-pointing to `toHaveLength(0)` alone would
    // have been true under a build that stopped matching the population at all, so the
    // POPULATION and its OWNER are both named (D438/D423).
    const additive = legalAttackCorpus().filter(
      ([, s]) => s.includes("discarded in this way") && s.includes("more damage for each"),
    );
    expect(additive).toHaveLength(3);
    expect(units(additive)).toBe(10);
    const additiveLeft = additive.filter(([, s]) => !readByAny(s));
    expect(additiveLeft).toEqual([]);
    // …and the OWNER is `deriveAttackDiscardScaledBoost` on all three, `deriveAttackEffect`
    // on NONE — which is the refusal this rung has really carried since D402: the printed
    // *"more"* keeps the attack's base, and `deriveAttackEffect` takes only a STRING, so an
    // arm there could never populate it. That claim survives the build intact.
    for (const [, s] of additive) {
      expect(deriveAttackEffect(s), s).toBeNull();
      expect(deriveAttackDiscardScaledBoost(s), s).not.toBeNull();
    }
    expect(
      additive.filter(([, s]) => s.startsWith("Discard the top card of each player's deck.")),
    ).toHaveLength(1);"""
if s.count(FIND) != 1:
    sys.stderr.write("COUNT %d\n" % s.count(FIND)); raise SystemExit(2)
s = REPL.join(s.split(FIND))
open(P, "wb").write(s.encode("utf-8"))
print("patched discardScaledDamage")
