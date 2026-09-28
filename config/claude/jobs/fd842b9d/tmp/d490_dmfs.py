import io, sys
P = "/home/jofre/projects/luminous_ui/packages/engine/src/deckMillFilteredScale.test.ts"
s = io.open(P, encoding="utf-8").read()
F = """    const read = family.filter(([, s]) => resolvedByAnyReader(s));
    expect(read).toHaveLength(11);
    expect(units(read)).toBe(25);
    // The TWO printings still refused: the two-deck additive mill alone. Named rather
    // than left as a subtraction (D400), and the sentence is spelled out so the day it
    // is built this rung says which one left rather than merely counting one fewer.
    const left = family.filter(([, s]) => !resolvedByAnyReader(s));
    expect(left).toHaveLength(1);
    expect(units(left)).toBe(2);
    expect(left.map(([, s]) => s)).toEqual([
      "Discard the top card of each player's deck. This attack does 140 more damage for each Energy card discarded in this way.",
    ]);"""
R = """    // \U0001f195\U0001f195\U0001f195 **D490 +1 sentence / +2 printings — THE FAMILY IS NOW WHOLLY BUILT AND THE
    // FOUR ARMS SUM EXACTLY**: D402's 6 / 13 (board discard) + D403's 2 / 8 (additive
    // bench) + D488's 2 / 2 (own-deck mill) + D489's 1 / 2 (hand) + D490's 1 / 2 (the
    // two-deck mill) = **12 / 27**, which is the whole family. The population figure
    // above is what tells "D490 built the last one" from "the ingest changed".
    const read = family.filter(([, s]) => resolvedByAnyReader(s));
    expect(read).toHaveLength(12);
    expect(units(read)).toBe(27);
    // \U0001f6d1 **THE LEFTOVER RUNG IS RE-POINTED ONTO ITS OWNER RATHER THAN DECREMENTED TO
    // ZERO** (D418's second half, D438's polarity rule). `left` being empty is TRUE under
    // a build that widened some reader onto the whole column, so the emptiness is stated
    // BESIDE the named owner and the two numbers above — the day a thirteenth member of
    // this family is printed and unread, THIS rung names it.
    const left = family.filter(([, s]) => !resolvedByAnyReader(s));
    expect(left).toEqual([]);
    const twoDeck = family.filter(
      ([, s]) =>
        s ===
        "Discard the top card of each player's deck. This attack does 140 more damage for each Energy card discarded in this way.",
    );
    expect(twoDeck.map(([n]) => n)).toEqual([2]);
    // …and it is `deriveAttackDiscardScaledBoost`'s, NOT this file's subject: a build
    // that let `DECK_MILL_FILTERED_SCALED_DAMAGE` reach across the sentence break would
    // pass a bare "it is read" rung and fail this one.
    expect(deriveAttackEffect(twoDeck[0]?.[1] as string)).toBeNull();
    expect(deriveAttackDiscardScaledBoost(twoDeck[0]?.[1] as string)).toEqual({
      kind: "eachDeckMill",
      per: 140,
    });"""
if s.count(F) != 1:
    sys.stderr.write("COUNT %d\n" % s.count(F)); raise SystemExit(2)
s = R.join(s.split(F))
open(P, "wb").write(s.encode("utf-8"))
print("patched deckMillFilteredScale")
