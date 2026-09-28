import io, sys
P = "/home/jofre/projects/luminous_ui/packages/engine/src/deckTopMill.test.ts"
s = io.open(P, encoding="utf-8").read()
E = []

# (1) the doc bullet — the PHANTOM corrected, dated, with the measurement
E.append((
"""      • Camerupt sv03-032 — "Discard the top card of EACH PLAYER'S deck. This attack
        does 100 more damage for each Energy card discarded in this way." Two decks
        AND a damage bonus that reads WHAT was discarded. The dangerous one: a
        loosened anchor would mill one deck and silently drop the bonus. */""",
"""      • corpus FILE LINE 130 — "Discard the top card of EACH PLAYER'S deck. This attack
        does 140 more damage for each Energy card discarded in this way." Two decks
        AND a damage bonus that reads WHAT was discarded. The dangerous one: a
        loosened anchor would mill one deck and silently drop the bonus.

    \U0001f6d1\U0001f6d1 **D490 — THE FIFTH ENTRY WAS A PHANTOM, AND THE BLOCK ABOVE CALLED IT
    "verbatim off the local D1".** It read **100** more damage; the committed
    `legal_standard = 1` column prints **140**, on the one and only row containing
    *"each player's deck"* (measured by `legalAttackCorpus().filter(…)`, and the rung
    below now asserts corpus membership rather than trusting the bytes). That is D452's
    defect exactly — *a byte pin on an invented string is green by construction*, because
    the pin measures the invention as faithfully as it would measure the truth — arriving
    through a hand-retyped DAMAGE FIGURE rather than a hand-retyped opening. ⚠️ The
    slice number is stated rather than the card: this checkout has no D1, so whether the
    row is Camerupt `sv03-032` is UNRESOLVABLE here and the id has been replaced by the
    corpus FILE LINE, which is (D448) the citation convention this repo mandates.

    \U0001f6d1 **AND THE ENTRY IS NO LONGER A "genuine gap": D490 BUILT IT.** It is kept in
    this list, and the rung below is re-pointed rather than deleted (D444/D482), because
    what it has always really guarded is DISJOINTNESS — that the bare `\\.$`-anchored mill
    does not reach across a sentence break — and that claim is STRONGER now that a
    different reader owns the whole string. */""")) 

# (2) the string itself
E.append((
'  "Discard the top card of each player\'s deck. This attack does 100 more damage for each Energy card discarded in this way.",',
'  "Discard the top card of each player\'s deck. This attack does 140 more damage for each Energy card discarded in this way.",'))

# (3) the rung
E.append((
"""    // Camerupt's second sentence is a `+` clause, and the bonus reader does not claim
    // the printing either (its subject is "each Energy card discarded in this way",
    // which nothing counts). So the whole row stays loud on BOTH readers — a genuine
    // gap, not a half-simulation.
    expect(deriveAttackDamageBonus(REAL_NEAR_MISSES[4])).toBeNull();""",
"""    // \U0001f195\U0001f195\U0001f195 **D490 — RE-POINTED, AND THE OLD CLAIM'S REFUSALS ARE ALL KEPT.** The
    // old rung said the two-deck row *"stays loud on BOTH readers — a genuine gap"*. It
    // is BUILT now, by `deriveAttackDiscardScaledBoost`'s `eachDeckMill` member, so the
    // "genuine gap" half is false. The half that was load-bearing is not: this file's
    // bare anchor still refuses it (`\\.$` against a sentence break) and so does the
    // ADDITIVE damage-bonus reader (its count sources are board facts read at
    // DECLARATION, where a §9.2 record can only be read from inside the program). Both
    // are kept, and the OWNER is named beside them — a bare `.not.toBeNull()` re-point
    // would have been true under a build that widened THIS anchor across the break,
    // which is exactly the defect the entry was written for (D438).
    expect(deriveAttackEffect(REAL_NEAR_MISSES[4])).toBeNull();
    expect(deriveAttackDamageBonus(REAL_NEAR_MISSES[4])).toBeNull();
    expect(deriveAttackDiscardScaledBoost(REAL_NEAR_MISSES[4])).toEqual({
      kind: "eachDeckMill",
      per: 140,
    });
    // \U0001f6d1 **AND THE SPECIMEN IS A ROW OF THE COMMITTED CORPUS, WITH ITS PRINTING COUNT
    // READ OFF THE CORPUS TOO** (D452/D456/D448). This is the repair for the phantom the
    // block at the top of the file describes: an entry that is merely byte-pinned can
    // drift onto a sentence nobody prints and take a refusal with it.
    expect(
      legalAttackCorpus()
        .filter(([, t]) => t === REAL_NEAR_MISSES[4])
        .map(([n]) => n),
    ).toEqual([2]);"""))

for find, repl in E:
    if s.count(find) != 1:
        sys.stderr.write("COUNT %d for:\n%s\n" % (s.count(find), find[:200])); raise SystemExit(2)
    s = repl.join(s.split(find))
open(P, "wb").write(s.encode("utf-8"))
print("patched deckTopMill")
