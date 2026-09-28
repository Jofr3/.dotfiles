import io, sys
P = "/home/jofre/projects/luminous_ui/packages/engine/src/benchDiscardBoost.test.ts"
s = io.open(P, encoding="utf-8").read()
E = []

# (1) the reader's family rung: 2 sentences / 8 printings -> 3 / 10, and the THIRD is
#     the mill. Re-pointed onto the KIND, not merely decremented (D418/D465/D488).
E.append((
"""  it("\U0001f6d1 this reader takes EXACTLY those two, and no other reader takes either", () => {
    const claimed = legalAttackCorpus().filter(
      ([, s]) => deriveAttackDiscardScaledBoost(s) !== null,
    );
    expect(claimed).toHaveLength(2);
    expect(units(claimed)).toBe(8);
    expect([...claimed].sort()).toEqual([...TAKEN].sort());""",
"""  it("\U0001f6d1 this reader takes EXACTLY those THREE, and no other reader takes any", () => {
    // \U0001f195\U0001f195\U0001f195 **D490 — 2 sentences / 8 printings → 3 / 10, AND THE THIRD IS THE ONE THE
    // RUNG BELOW USED TO HOLD AS REFUSED.** Re-pointed by MEMBER rather than decremented
    // (D418/D488): a bare `toHaveLength(3)` would stay green under a build that claimed
    // some *other* third sentence, so the partition is asserted by `kind` — the two
    // bench-discard heads and the one two-deck mill — which reddens the day either arm
    // eats the other's printing.
    const claimed = legalAttackCorpus().filter(
      ([, s]) => deriveAttackDiscardScaledBoost(s) !== null,
    );
    expect(claimed).toHaveLength(3);
    expect(units(claimed)).toBe(10);
    expect([...claimed].sort()).toEqual([...TAKEN, [2, MILL] as const].sort());
    expect(
      claimed.map(([, s]) => reading(s).kind).sort(),
    ).toEqual(["benchDiscard", "benchDiscard", "eachDeckMill"]);"""))

# (2) the DECK-MILL refusal rung -> the BUILD rung, keeping every refusal it carried
E.append((
"""  it("⚠️ the ONE additive sentence still refused is a DECK MILL, and it stays loud", () => {
    // The third member of D402's additive half: its record is cards off two DECKS
    // rather than Energy off a board, so it needs a recording mill this engine does
    // not have. Refused by all TWELVE readers, not merely by this one.
    const left = legalAttackCorpus().filter(
      ([, s]) =>
        s.includes("discarded in this way") &&
        s.includes("more damage for each") &&
        deriveAttackDiscardScaledBoost(s) === null,
    );
    expect(left).toHaveLength(1);
    expect(units(left)).toBe(2);
    for (const [, s] of left) {
      expect(s.startsWith("Discard the top card of each player's deck."), s).toBe(true);
      // \U0001f195\U0001f195 D419 — THE REFUSAL IS NOW ASSERTED OFF THE MODULE FIRST. The loop
      // below names WHICH reader broke and is kept for that; but it can only ever
      // walk the readers this file happens to list, which is the failure mode D418
      // measured in 38 files. This line walks whatever `effects.ts` exports today.
      expect(resolvedByAnyReader(s), s).toBe(false);
      for (const read of READERS) expect(read(s), `${read.name} :: ${s}`).toBeNull();
    }
  });""",
"""  it("\U0001f195\U0001f195\U0001f195 D490 — the additive half has NO sentence left refused, and THIS reader owns all three", () => {
    // \U0001f6d1 **THE OLD RUNG SAID THE OPPOSITE AND ITS STATED REASON WAS FALSE WHEN
    // WRITTEN.** It read: *"its record is cards off two DECKS rather than Energy off a
    // board, so it needs a recording mill this engine does not have. Refused by all
    // TWELVE readers"*. TWO of its three clauses were wrong by D490: the recording mill
    // shipped at **D488** (`discardDeckTop.recordAs`), so the engine HAD one for two
    // slices; and the surface had been THIRTEEN since D417, not twelve. What was
    // genuinely missing was the two-deck WALK (`whose: "eachPlayer"`) — one value on a
    // shipped field. The clause is corrected here rather than deleted, dated, and with
    // the measurement that falsified it (D442/D466).
    //
    // ⚠️ **RE-POINTED, NOT DELETED, AND THE NEW CLAIM KEEPS BOTH POLARITIES** (D438):
    // the population still says which sentences carry the additive marker, the OWNER is
    // named by function, and the OTHER TWELVE readers are still asserted to refuse all
    // three — which is the half a bare `.not.toBeNull()` would have discarded.
    const additive = legalAttackCorpus().filter(
      ([, s]) => s.includes("discarded in this way") && s.includes("more damage for each"),
    );
    expect(additive).toHaveLength(3);
    expect(units(additive)).toBe(10);
    // NOTHING is left refused, and the count is asserted as a POPULATION rather than as
    // a specimen (D423) so the day a fourth additive sentence is printed and unread this
    // rung names it instead of quietly staying at zero.
    const left = additive.filter(([, s]) => deriveAttackDiscardScaledBoost(s) === null);
    expect(left).toEqual([]);
    for (const [, s] of additive) {
      expect(resolvedByAnyReader(s), s).toBe(true);
      // \U0001f195\U0001f195 D419 — asserted off the MODULE first. The loop below names WHICH reader
      // answered and is kept for that; it can only walk the readers this file lists,
      // which is the failure mode D418 measured in 38 files.
      for (const read of READERS) {
        if (read === deriveAttackDiscardScaledBoost) {
          expect(read(s), `${read.name} :: ${s}`).not.toBeNull();
        } else {
          expect(read(s), `${read.name} :: ${s}`).toBeNull();
        }
      }
    }
  });

  it("\U0001f195\U0001f195\U0001f195 D490 — the mill sentence is a REAL corpus row at 2 printings, byte for byte", () => {
    // D452/D456: a refusal or a claim pinned on a HAND-RETYPED string is green by
    // construction. The specimen is asserted to be a row of the committed corpus and its
    // PRINTING COUNT is read off the corpus too — which is what tells a file-line
    // citation from an array index in one look (D448).
    const rows = legalAttackCorpus().filter(([, s]) => s === MILL);
    expect(rows.map(([n]) => n)).toEqual([2]);
    // The apostrophe is U+0027, MEASURED with `codePointAt` rather than by eye (D421,
    // D440). The whole 640-row column carries zero U+2019, so the anchor's `['’]` arm is
    // latent by design and `clauseApostrophe.test.ts`'s re-ingest sweep is what drives it.
    expect(MILL.codePointAt(MILL.indexOf("player") + 6)).toBe(0x27);
  });""")) 

# (3) the two reading literals gain the discriminator
E.append((
"""    expect(deriveAttackDiscardScaledBoost(BARE)).toEqual({
      cap: 2,
      per: 60,
      filter: { kind: "anyEnergy" },
    });
    expect(deriveAttackDiscardScaledBoost(BASIC)).toEqual({
      cap: 2,
      per: 90,
      filter: { kind: "basicEnergy" },
    });""",
"""    expect(deriveAttackDiscardScaledBoost(BARE)).toEqual({
      kind: "benchDiscard",
      cap: 2,
      per: 60,
      filter: { kind: "anyEnergy" },
    });
    expect(deriveAttackDiscardScaledBoost(BASIC)).toEqual({
      kind: "benchDiscard",
      cap: 2,
      per: 90,
      filter: { kind: "basicEnergy" },
    });
    // \U0001f195\U0001f195\U0001f195 D490 — the SECOND member, beside its siblings so the discriminator is
    // visible as a partition rather than as a field one arm happens to carry. It has no
    // `cap` and no `filter` at all: the mill is mandatory and unfiltered, and the printed
    // noun narrows the COUNT, not the movement.
    expect(deriveAttackDiscardScaledBoost(MILL)).toEqual({ kind: "eachDeckMill", per: 140 });"""))

# (4) the demonstrator constant
E.append((
"""const BARE = TAKEN[0]?.[1] as string;
const BASIC = TAKEN[1]?.[1] as string;""",
"""const BARE = TAKEN[0]?.[1] as string;
const BASIC = TAKEN[1]?.[1] as string;

/** \U0001f195\U0001f195\U0001f195 D490 — the THIRD printed head of this reader, `censusAttackCorpus.ts` FILE
    LINE 130 at **2 legal printings**, and the row this file held as REFUSED from D403 to
    D489. Asserted to be a corpus row below rather than trusted as typed (D452/D456). */
const MILL =
  "Discard the top card of each player's deck. This attack does 140 more damage for each Energy card discarded in this way.";"""))

for find, repl in E:
    if s.count(find) != 1:
        sys.stderr.write("COUNT %d for:\n%s\n" % (s.count(find), find[:220])); raise SystemExit(2)
    s = repl.join(s.split(find))
open(P, "wb").write(s.encode("utf-8"))
print("benchDiscardBoost.test.ts patched, lines now", s.count("\n"))
