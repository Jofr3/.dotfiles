import io, sys
P="/home/jofre/projects/luminous_ui/packages/engine/src/eachDeckMillBoost.test.ts"
s=io.open(P,encoding="utf-8").read()
E=[]

# §2 — the lattice, stated in its POST-BUILD form
E.append((
"""    // By Hamming weight: 0 of 1 at zero axes (the print itself), 0 of 5 at one, 0 of 10 at
    // two, 0 of 10 at three, 0 of 5 at four, and 1 of 1 at five.
    expect(byWeight).toEqual([0, 0, 0, 0, 0, 1]);
    expect(built).toEqual([(1 << AXES.length) - 1]);""",
"""    // 🛑 **BY HAMMING WEIGHT, IN THE POST-BUILD FORM, AND THE MIDDLE FOUR ROWS ARE THE
    // CLAIM.** Weight 0 is the PRINT and is built — by this slice, and by nothing else, as
    // §1 pins. Weight 5 is D488's shipped compound. **Weights 1 through 4 are THIRTY
    // points and NOT ONE of them is claimed by any of the thirteen readers**, which is the
    // measurement: *"no proper subset of this sentence already builds"* is strictly
    // stronger than *"one point builds"*, and it is what justifies a whole-sentence anchor
    // over a composition. ⚠️ Measured against the tree at HEAD the same table read
    // `[0, 0, 0, 0, 0, 1]` — weight 0 was refused too, by all thirteen — so this rung is
    // also the record of what the slice changed and what it did not.
    expect(byWeight).toEqual([1, 0, 0, 0, 0, 1]);
    expect(built).toEqual([0, (1 << AXES.length) - 1]);
    expect(byWeight.slice(1, 5)).toEqual([0, 0, 0, 0]);"""))

# §4 board C: both-piles-after is 750, not 610
E.append(("    expect(on).toEqual([330, 190, 190, 330, 280, 470, 610]);",
          "    expect(on).toEqual([330, 190, 190, 330, 280, 470, 750]);"))

# §5 board A — the DAMAGE_DEALT `base` is the OP's amount, and the zones are read AFTER the
# turn has flipped and the defender has drawn.
E.append((
"""    const state = table(A_SELF_DECK, A_FOE_DECK);
    const { state: done, events } = swing(state, TWIN_MILL);
    expect(find(events, "DAMAGE_DEALT")).toMatchObject({ seat: "p2", base: 0, dealt: 190 });
    expect(done.players.p2.active?.damage).toBe(190);
    // ⚠️ **CONTENTS, NOT ONLY THE NUMBER.** One card off EACH deck, each into ITS OWN
    // owner's pile — which is what separates the build from a mill-side filter (the
    // opponent's Pokémon would not have moved) and from a single-deck walk.
    expect(idsIn(done, "p1", "deck")).toEqual(["d490-item-1", "d490-filler"]);
    expect(idsIn(done, "p2", "deck")).toEqual(["d490-item-2", "d490-filler"]);
    expect(idsIn(done, "p1", "discard")).toEqual([...SELF_PILE, "d490-energy-1"]);
    expect(idsIn(done, "p2", "discard")).toEqual([...FOE_PILE, "d490-body-1"]);""",
"""    const state = table(A_SELF_DECK, A_FOE_DECK);
    const { state: done, events } = swing(state, TWIN_MILL);
    // `base` on the row is the OP's own amount (the whole `base + per × N` sum dealt as
    // ONE §8.5 pass), not the attack's printed 50 — which is the point of re-homing the
    // addend: Resistance and the §8.1 survival clamp are subtractions paid once PER HIT.
    expect(find(events, "DAMAGE_DEALT")).toMatchObject({ seat: "p2", by: "p1", base: 190, dealt: 190 });
    expect(done.players.p2.active?.damage).toBe(190);
    // ⚠️ **CONTENTS, NOT ONLY THE NUMBER.** One card off EACH deck, each into ITS OWN
    // owner's pile — which is what separates the build from a mill-side filter (the
    // opponent's Pokémon would not have moved) and from a single-deck walk.
    //
    // ⚠️ **AND THE DEFENDER'S DECK IS READ AFTER THEIR TURN-START DRAW.** An attack ends
    // the turn, so `done` is already p2's turn and p2 has drawn the card the mill left on
    // top. The attacker's deck is untouched by that (it is not their turn), and neither
    // DISCARD PILE is — which is why the piles carry the load-bearing half of this claim.
    expect(idsIn(done, "p1", "deck")).toEqual(["d490-item-1", "d490-filler"]);
    expect(idsIn(done, "p2", "deck")).toEqual(["d490-filler"]);
    expect(idsIn(done, "p2", "hand")).toContain("d490-item-2");
    expect(idsIn(done, "p1", "discard")).toEqual([...SELF_PILE, "d490-energy-1"]);
    expect(idsIn(done, "p2", "discard")).toEqual([...FOE_PILE, "d490-body-1"]);"""))

# §5 board B contents
E.append((
"""    expect(idsIn(done, "p1", "discard")).toEqual([...SELF_PILE, "d490-item-1"]);
    expect(idsIn(done, "p2", "discard")).toEqual([...FOE_PILE, "d490-energy-2"]);
    expect(all(events, "DECK_TOP_DISCARDED")).toHaveLength(2);""",
"""    expect(idsIn(done, "p1", "discard")).toEqual([...SELF_PILE, "d490-item-1"]);
    expect(idsIn(done, "p2", "discard")).toEqual([...FOE_PILE, "d490-energy-2"]);
    expect(all(events, "DECK_TOP_DISCARDED")).toHaveLength(2);
    expect(idsIn(done, "p1", "deck")).toEqual(["d490-energy-1", "d490-filler"]);"""))

# §5 board C contents
E.append((
"""    expect(idsIn(done, "p1", "discard")).toEqual([...SELF_PILE, "d490-energy-1"]);
    expect(idsIn(done, "p2", "discard")).toEqual([...FOE_PILE, "d490-energy-2"]);
  });

  it("🛑 the PRE-SEEDED piles are load-bearing""",
"""    expect(idsIn(done, "p1", "discard")).toEqual([...SELF_PILE, "d490-energy-1"]);
    expect(idsIn(done, "p2", "discard")).toEqual([...FOE_PILE, "d490-energy-2"]);
  });

  it("🛑 the PRE-SEEDED piles are load-bearing"""))

# §5 control attack contents (the defender has drawn)
E.append((
"""    expect(all(events, "DECK_TOP_DISCARDED")).toEqual([]);
    expect(idsIn(done, "p1", "deck")).toEqual([...A_SELF_DECK]);
    expect(idsIn(done, "p2", "deck")).toEqual([...A_FOE_DECK]);""",
"""    expect(all(events, "DECK_TOP_DISCARDED")).toEqual([]);
    expect(idsIn(done, "p1", "deck")).toEqual([...A_SELF_DECK]);
    // The defender's deck is one shorter than the board's, and that ONE card is their own
    // turn-start draw rather than anything this attack did — the discard piles, which the
    // draw cannot touch, are byte-identical to the board.
    expect(idsIn(done, "p2", "deck")).toEqual([...A_FOE_DECK].slice(1));
    expect(idsIn(done, "p1", "discard")).toEqual([...SELF_PILE]);
    expect(idsIn(done, "p2", "discard")).toEqual([...FOE_PILE]);"""))

# §6 both decks empty — the deck-out lands at the DRAW, and it lands
E.append((
"""    // …and MILLING TO ZERO DOES NOT END THE GAME. §14.3 deck-out is a turn-START rule,
    // checked at the draw, so the loss stays owed to the next draw step (the mill's own
    // doc block, re-driven because this is the first op that can empty BOTH decks at once).
    expect(done.phase.kind).not.toBe("gameOver");
    expect(idsIn(done, "p1", "deck")).toEqual([]);
    expect(idsIn(done, "p2", "deck")).toEqual([]);""",
"""    // 🛑 **MILLING TO ZERO DOES NOT END THE GAME *ON THE SPOT*, AND THIS BOARD SHOWS BOTH
    // HALVES OF THAT RULE.** §14.3 deck-out is a turn-START rule checked at the DRAW
    // (`flow.ts startTurn`), never at the instant the deck runs dry — so the program itself
    // finishes with both decks empty and the game still live (driven through `runProgram`,
    // which does not flip the turn), and the loss then lands at the very next draw step,
    // which an attack hands straight to the DEFENDER. ⚠️ This is the first op in the engine
    // that can empty BOTH decks at once, so the rule is re-driven rather than inherited.
    const midEvents: GameEvent[] = [];
    const mid = runProgram(
      state,
      discardScaledBoostProgram({ kind: "eachDeckMill", per: PER }, PRINTED_BASE),
      { seat: "p1" },
      midEvents,
      {},
    );
    expect(mid.kind).toBe("done");
    if (mid.kind !== "done") throw new Error("expected done");
    expect(mid.state.phase.kind).not.toBe("gameOver");
    expect(idsIn(mid.state, "p1", "deck")).toEqual([]);
    expect(idsIn(mid.state, "p2", "deck")).toEqual([]);
    // …and end to end, the defender draws into an empty deck and loses — which is the
    // ATTACKER's win, not a draw, and the asymmetry is entirely in the rule rather than in
    // the op (the two directions run the same code).
    expect(done.phase.kind).toBe("gameOver");
    expect(idsIn(done, "p1", "deck")).toEqual([]);
    expect(idsIn(done, "p2", "deck")).toEqual([]);"""))

# §7 threading rung — read the zones through runProgram, which does not flip the turn
E.append((
"""    const state = table(C_SELF_DECK, C_FOE_DECK);
    const { state: done } = swing(state, TWIN_MILL);
    expect(idsIn(done, "p1", "deck")).toEqual(["d490-item-1", "d490-filler"]);
    expect(idsIn(done, "p1", "discard")).toEqual([...SELF_PILE, "d490-energy-1"]);
    expect(idsIn(done, "p2", "deck")).toEqual(["d490-item-2", "d490-filler"]);
    // …and the two decks each lost EXACTLY one card, which a clobbering write-back fails
    // on the attacker's side while leaving every damage figure untouched.
    expect(done.players.p1.deck).toHaveLength(C_SELF_DECK.length - 1);
    expect(done.players.p2.deck).toHaveLength(C_FOE_DECK.length - 1);""",
"""    // Read through `runProgram` rather than through a full swing, so the defender's
    // turn-start draw is not in the way of the zone claim — the write-back this rung is
    // about happens inside the op's own walk.
    const state = table(C_SELF_DECK, C_FOE_DECK);
    const events: GameEvent[] = [];
    const run = runProgram(
      state,
      discardScaledBoostProgram({ kind: "eachDeckMill", per: PER }, PRINTED_BASE),
      { seat: "p1" },
      events,
      {},
    );
    if (run.kind !== "done") throw new Error("expected done");
    const done = run.state;
    expect(idsIn(done, "p1", "deck")).toEqual(["d490-item-1", "d490-filler"]);
    expect(idsIn(done, "p1", "discard")).toEqual([...SELF_PILE, "d490-energy-1"]);
    expect(idsIn(done, "p2", "deck")).toEqual(["d490-item-2", "d490-filler"]);
    expect(idsIn(done, "p2", "discard")).toEqual([...FOE_PILE, "d490-energy-2"]);
    // …and the two decks each lost EXACTLY one card, which a clobbering write-back fails
    // on the attacker's side while leaving every damage figure untouched.
    expect(done.players.p1.deck).toHaveLength(C_SELF_DECK.length - 1);
    expect(done.players.p2.deck).toHaveLength(C_FOE_DECK.length - 1);"""))

for f,r in E:
    if s.count(f)!=1:
        sys.stderr.write("COUNT %d for:\n%s\n"%(s.count(f), f[:200])); raise SystemExit(2)
    s=r.join(s.split(f))
open(P,"wb").write(s.encode("utf-8")); print("patched")
