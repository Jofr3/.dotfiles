import json, re
P = "/home/jofre/projects/luminous_ui/scripts/mutation/mutants.ts"
E = "packages/engine/src/effects.ts"
I = "packages/engine/src/interpreter.ts"
SUITE = "packages/engine/src/derivedBenchSearchMove.test.ts"
BENCH = "packages/engine/src/derivedBenchSearch.test.ts"
SELF = "packages/engine/src/derivedSelfEnergyMove.test.ts"

ARM = '''  if (ATTACK_BENCH_SEARCH_THEN_MOVE.test(effect)) {
    return [
      { op: "searchDeck", filter: { kind: "basicPokemon" }, dest: "bench", max: 1, recordAs: "moved" },
      { op: "shuffleDeck" },
      {
        op: "recordGate",
        slot: "moved",
        // biome-ignore lint/suspicious/noThenProperty: `then` is the effect contract's gated-step list, not a thenable (arrays are not callable).
        then: [
          {
            op: "moveEnergy",
            filter: { kind: "anyEnergy" },
            max: 1,
            route: "selfToBench",
            destRecorded: "moved",
          },
        ],
      },
    ];
  }'''

ROWS = [
 # ── PRODUCER SIDE: the anchor ────────────────────────────────────────────────
 dict(id="D502-anchor-loses-its-caret", what=(
   "⚠️ C1 — THE `^` GOES, so any sentence ENDING in this string is claimed whole and its "
   "leading clause — a coin gate, a requirement, the §4 going-first licence — is silently "
   "discarded. The two ends of an anchor fail in OPPOSITE directions (D464/D496/D499) and only a "
   "constructed near miss can see either, which is why §2 drives both. ⚠️ AND THE `^` WITNESS "
   "HERE IS THE FAMILY'S REAL ONE: `sv06-009` Volbeat prints the §4 licence in front of this "
   "sentence's HEAD, so the hazard is a catalog row rather than an invention.",
   ), file=E,
   find='  "^Search your deck for a Basic Pokémon and put it onto your Bench',
   replace='  "Search your deck for a Basic Pokémon and put it onto your Bench',
   killers=[SUITE]),

 dict(id="D502-anchor-loses-its-terminator", what=(
   "⚠️ C2 — THE `$` GOES, so a compound whose FIRST clauses are this whole printed sentence "
   "is claimed and everything behind it is dropped. ⚠️ CONSTRUCTED WITNESS, AND SAID SO (D440): no "
   "printed sentence carries a tail behind this one, so the rung is a claim about the READER and not "
   "about the pool — which is exactly D228's finding, that a harness fed only real rows would let "
   "this one live.",
   ), file=E,
   find=' to the new Benched Pokémon\\\\.$",',
   replace=' to the new Benched Pokémon\\\\.",',
   killers=[SUITE]),

 dict(id="D502-anchor-noun-goes-wildcard", what=(
   "🛑 C3 — THE PRINTED NOUN BECOMES A WILDCARD, which is the shape a first draft writes and "
   "is the reason D472's measurement was run before a line shipped: the wider form claims the SAME 1 "
   "sentence / 1 printing over all 640 corpus rows, so it buys nothing and costs a wrong program. "
   "Under it the TYPED noun (*'a Basic {G} Pokémon'*) and a proper NAME both derive to "
   "`{kind:\"basicPokemon\"}` and the card searches for something it never named — D230's own "
   "`noun-is-a-wildcard` defect at a second anchor, and invisible to every census because the pool "
   "prints neither crossing.",
   ), file=E,
   find='  "^Search your deck for a Basic Pokémon and put it onto your Bench\\\\.',
   replace='  "^Search your deck for a .+ and put it onto your Bench\\\\.',
   killers=[SUITE]),

 dict(id="D502-anchor-destination-goes-wildcard", what=(
   "🛑 C4 — THE PRINTED DESTINATION BECOMES A WILDCARD, and this is the dangerous half of C3 "
   "because the destination is what the whole slice is ABOUT. Under it *'… move an Energy from this "
   "Pokémon to 1 of your Benched Pokémon.'* behind the same gate derives to a PINNED move — a "
   "sentence that grants a free choice among the Bench, read as a program that offers exactly one "
   "body. The census cannot see it (the sentence is not printed) and neither can any board this file "
   "fields; only the constructed rewrite in §2 can.",
   ), file=E,
   find='    " to the new Benched Pokémon\\\\.$",',
   replace='    " to .+\\\\.$",',
   killers=[SUITE]),

 # ── PRODUCER SIDE: the arm ───────────────────────────────────────────────────
 dict(id="D502-arm-drops-the-record", what=(
   "🛑 C5 — THE SEARCH STOPS FILING, which is the FIRST of D230's two named blockers deleted. "
   "The gate then reads an unfiled slot as FALSE, the `moveEnergy` never runs and there is no second "
   "park at all: the card benches a Basic and the printed Energy move silently does not happen. "
   "⚠️ EVERY CENSUS FIGURE IS UNMOVED UNDER IT — the sentence still reads, `resolvedByAnyReader` "
   "is still true and the residue still falls by one — so §8's rungs are green and only §4's board "
   "discriminates it (D469/D489's layer map).",
   ), file=E,
   find='      { op: "searchDeck", filter: { kind: "basicPokemon" }, dest: "bench", max: 1, recordAs: "moved" },',
   replace='      { op: "searchDeck", filter: { kind: "basicPokemon" }, dest: "bench", max: 1 },',
   killers=[SUITE]),

 dict(id="D502-arm-drops-the-destination-pin", what=(
   "🛑 C6 — THE DESTINATION PIN GOES, which is D230's SECOND named blocker deleted and the "
   "single most important row in this decision. The printed *'to THE NEW Benched Pokémon'* becomes "
   "`selfToBench`'s whole Bench, so the player may put the Energy on any of the attacker's Benched "
   "Pokémon. 🛑 AND IT IS BYTE-IDENTICAL ON AN EMPTY BENCH (D485: the collision board is usually "
   "the SMALLEST one), which is why §4's board fields a pre-existing Bench body and §5 drives the "
   "empty-Bench case as the labelled control rather than as the main case.",
   ), file=E,
   find='            destRecorded: "moved",',
   replace='',
   killers=[SUITE]),

 dict(id="D502-arm-drops-the-record-gate", what=(
   "🛑 C7 — THE §9.2 GATE GOES AND THE MOVE IS HOISTED TO THE TOP LEVEL, AND THIS ROW'S KILLER "
   "IS THE CAPTION RATHER THAN A BOARD. Every board is IDENTICAL under it: with the destination "
   "pinned, an unfiled record already empties `destinations` and the op whiffs, so the gate is "
   "behaviourally redundant on every board this printing can reach — measured, not assumed. What it "
   "is NOT redundant for is the DIALOG: `withConsequence` looks DOWN THE QUEUE for a `recordGate` on "
   "the slot the parking op files, so without one the search's prompt describes a deck search and "
   "says nothing about the Energy the answer buys (D473: a reader can be correct while its describer "
   "quietly says less, and only the describer is user-visible).",
   ), file=E, find=ARM,
   replace=ARM.replace('''      {
        op: "recordGate",
        slot: "moved",
        // biome-ignore lint/suspicious/noThenProperty: `then` is the effect contract's gated-step list, not a thenable (arrays are not callable).
        then: [
          {
            op: "moveEnergy",
            filter: { kind: "anyEnergy" },
            max: 1,
            route: "selfToBench",
            destRecorded: "moved",
          },
        ],
      },''', '''      {
        op: "moveEnergy",
        filter: { kind: "anyEnergy" },
        max: 1,
        route: "selfToBench",
        destRecorded: "moved",
      },'''),
   killers=[SUITE]),

 dict(id="D502-gate-reads-a-different-slot", what=(
   "⚠️ C8 — THE GATE READS `discarded` WHERE THE SEARCH WROTE `moved`. `EffectSlot` has three "
   "inhabitants and D458 measured the board that punishes a hard-coded one, so naming the wrong end "
   "of the wire is the mistake an author actually makes. The gate reads an empty slot, answers NO, "
   "and the Energy never moves — and `withConsequence` finds no gate on the slot the op files "
   "either, so the caption loses its clause as well. Two surfaces, one slip.",
   ), file=E, find='        slot: "moved",\n', replace='        slot: "discarded",\n',
   killers=[SUITE]),

 dict(id="D502-pin-reads-a-different-slot", what=(
   "⚠️ C9 — THE PIN READS `discarded` WHERE THE SEARCH WROTE `moved`, which is C8's slip at the "
   "OTHER end of the same wire and fails differently: the GATE still holds (the record is filed), so "
   "the `moveEnergy` really runs — and then narrows its destinations against an empty slot, finds "
   "none, and whiffs. There is no second park and no log row, on a board where the search worked "
   "perfectly. Written as a SEPARATE row from C8 because the two are the two ends of one channel and "
   "a suite that caught only one would leave the other open (D442's one-row-per-rider rule).",
   ), file=E, find='            destRecorded: "moved",\n', replace='            destRecorded: "discarded",\n',
   killers=[SUITE]),

 dict(id="D502-arm-emits-the-mandatory-quantifier", what=(
   "🛑 C10 — `max: 1` BECOMES `max: \"all\"`, AND THIS IS THE ARITY QUESTION AS A ROW. D441's "
   "forced arm is gated on `floor > 0 && destinations.length === 1`, and this printing is the FIRST "
   "to reach that gate with a PINNED destination: with the printed *'an Energy'* the floor is 0 and "
   "the op still PARKS, because a decline remains an answer. Under `\"all\"` the floor becomes the "
   "cap, the force fires, the player is never asked WHICH Energy, and EVERY Energy on the attacker "
   "moves. ⚠️ The mutation is observable three ways at once — no second park, two Energy instead "
   "of one, and the caption's *'Move all Energy'* — which is what a board-level rung should be able "
   "to say about a quantifier.",
   ), file=E, find='            max: 1,\n            route: "selfToBench",', replace='            max: "all",\n            route: "selfToBench",',
   killers=[SUITE]),

 dict(id="D502-arm-narrows-the-energy-filter", what=(
   "⚠️ C11 — `anyEnergy` BECOMES `basicEnergy`, which is the sibling filter this family's other "
   "arm really carries (D190b: the mistake is a neighbouring arm's REAL code copied verbatim). The "
   "printed noun is a bare *'an Energy'*, so a Special Energy on the attacker must be movable. "
   "🛑 INVISIBLE ON AN ALL-BASIC BOARD (D448: a one-print fixture makes a filter unfalsifiable) — "
   "the attacker in §4 holds one Basic and one SPECIAL Energy for exactly this row, and the offer "
   "falls from two candidates to one under it.",
   ), file=E, find='            filter: { kind: "anyEnergy" },\n            max: 1,', replace='            filter: { kind: "basicEnergy" },\n            max: 1,',
   killers=[SUITE]),

 dict(id="D502-arm-emits-the-mirror-route", what=(
   "⚠️ C12 — THE ROUTE IS READ BACKWARDS (`benchToActive`), the mirror this whole op family's "
   "suites exist to guard against and the one D229 and D441 each wrote a row for. The sources become "
   "the BENCH and the sole destination the ACTIVE, so the card takes Energy OFF the body it just "
   "benched — and the pin then narrows a destination list that holds only the Active, which carries "
   "no filed uid, so the op whiffs entirely. ⚠️ THE WHIFF IS WHAT MAKES IT QUIET: no log row, no "
   "board change, and every census figure unmoved.",
   ), file=E, find='            route: "selfToBench",\n            destRecorded: "moved",', replace='            route: "benchToActive",\n            destRecorded: "moved",',
   killers=[SUITE]),

 dict(id="D502-arm-shuffles-after-the-gate", what=(
   "⚠️ C13 — THE PRINTED ORDER IS BROKEN: the shuffle moves BEHIND the §9.2 gate. The board is "
   "identical (the deck is shuffled either way and the move touches no deck), so nothing about the "
   "zones can see it — what can is the LOG, where *'shuffled their deck'* lands after *'moved 1 "
   "energy'* on a card that prints *'Then, shuffle your deck.'* as its SECOND sentence. ⚠️ This is "
   "the one row in the decision whose only observable is a ROW ORDER, and it is why §6 asserts the "
   "rendered sequence rather than the presence of each line.",
   ), file=E, find=ARM,
   replace=ARM.replace('      { op: "shuffleDeck" },\n      {\n        op: "recordGate",', '      {\n        op: "recordGate",')
              .replace('      },\n    ];\n  }', '      },\n      { op: "shuffleDeck" },\n    ];\n  }'),
   killers=[SUITE]),
]
print(len(ROWS), "rows drafted (part 1)")
open("/home/jofre/.claude/jobs/fd842b9d/tmp/rows1.json","w").write(json.dumps(ROWS, ensure_ascii=False))
