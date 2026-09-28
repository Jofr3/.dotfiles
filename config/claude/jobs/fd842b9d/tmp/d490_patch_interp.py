import io, sys
P = "/home/jofre/projects/luminous_ui/packages/engine/src/interpreter.ts"
src = io.open(P, encoding="utf-8").read()
before = src.count("\n")

FIND = """      const victim = op.whose === "self" ? ctx.seat : otherSeat(ctx.seat);
      const side = state.players[victim];
      const milled = side.deck.slice(0, Math.max(0, op.count));
      if (milled.length === 0) {
        recordMoved(record, op.recordAs, []);
        return { done: state };
      }
      recordMoved(record, op.recordAs, milled);
      // `seat` is the deck's OWNER and `actor` the player whose card did it, so the
      // two coincide on `whose: "self"` and diverge on `whose: "opponent"` — the same
      // one ternary, read a second time. The log's voice hangs off that comparison
      // (D153): Wild Splash's own-deck cost reads ACTIVE under the attacker's name,
      // the mill reads PASSIVE under the victim's.
      events.push({ type: "DECK_TOP_DISCARDED", seat: victim, actor: ctx.seat, uids: milled });
      return {
        done: withSide(state, victim, {
          ...side,
          deck: side.deck.slice(milled.length),
          discard: [...side.discard, ...milled],
        }),
      };
    }"""

REPL = """      //
      // \U0001f195\U0001f195 D490 — AND `whose` PICKS A **LIST** OF SEATS NOW, WHICH IS THE ONE THING
      // ABOVE THAT MOVED AGAIN. *"Discard the top card of each player's deck. This
      // attack does 140 more damage for each Energy card discarded in this way."* mills
      // BOTH decks and scores the Energy across both, so the slot has to hold what came
      // off each of them — and `recordMoved` ASSIGNS, so two sequential mills would
      // leave only the second deck's card in it.
      //
      // \U0001f6d1 **A `switch` AND NOT THE TERNARY IT REPLACES.** The old line was
      // `op.whose === "self" ? ctx.seat : otherSeat(ctx.seat)`, and a third member would
      // have fallen silently out of the wrong side of it — aiming the two-deck mill at
      // the opponent alone, with `tsc` reporting nothing (D222/D425/D447, the defect
      // D447 measured at `snipeTargets` one op over). A missing case is a compile error.
      //
      // ⚠️ **CONTROLLER-FIRST, and `handRefresh`'s `who: "both"` is the precedent rather
      // than `counterEachAll`'s `side: "both"`** — see the op's own doc block for the
      // distinction between the two (one row per SEAT against one row per BODY).
      //
      // ⚠️ **THE STATE IS THREADED THROUGH THE LOOP (`next`), NEVER `state`.** A second
      // `withSide(state, …)` would write the second deck's board on top of a snapshot
      // taken before the first mill and put the attacker's milled card back on top of
      // their deck — D429's stale write-back, which corrupts the board rather than
      // merely failing to see it, and which every count assertion in a one-deck suite
      // is blind to.
      const victims = ((): readonly Seat[] => {
        switch (op.whose) {
          case "self":
            return [ctx.seat];
          case "opponent":
            return [otherSeat(ctx.seat)];
          case "eachPlayer":
            return [ctx.seat, otherSeat(ctx.seat)];
        }
      })();
      let milledState = state;
      const filed: string[] = [];
      for (const victim of victims) {
        const side = milledState.players[victim];
        const milled = side.deck.slice(0, Math.max(0, op.count));
        if (milled.length === 0) continue;
        filed.push(...milled);
        // `seat` is the deck's OWNER and `actor` the player whose card did it, so the
        // two coincide on `whose: "self"` and diverge on `whose: "opponent"` — and
        // `"eachPlayer"` emits ONE ROW OF EACH, which is why no wording in log.ts moved.
        // The log's voice hangs off that comparison (D153): Wild Splash's own-deck cost
        // reads ACTIVE under the attacker's name, the mill reads PASSIVE under the
        // victim's.
        events.push({ type: "DECK_TOP_DISCARDED", seat: victim, actor: ctx.seat, uids: milled });
        milledState = withSide(milledState, victim, {
          ...side,
          deck: side.deck.slice(milled.length),
          discard: [...side.discard, ...milled],
        });
      }
      // ONE filing, after the walk, and it runs on the empty-deck path too — the rule
      // `discardPileRetrieval` states and `attachFromDeck` repeats: an op that RAN and
      // moved nothing must OVERWRITE its slot, or a stale value from an earlier writer
      // survives and the count answers for the wrong op.
      recordMoved(record, op.recordAs, filed);
      return { done: milledState };
    }"""

if src.count(FIND) != 1:
    sys.stderr.write("FIND COUNT %d\n" % src.count(FIND)); raise SystemExit(2)
text = REPL.join(src.split(FIND))
payload = text.encode("utf-8")
open(P, "wb").write(payload)
print("interpreter.ts lines %d -> %d" % (before, text.count("\n")))
