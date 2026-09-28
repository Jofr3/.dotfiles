import json, os, sys

REPO = "/home/jofre/projects/luminous_ui/"
MUT = REPO + "scripts/mutation/mutants.ts"
EFFECTS = REPO + "packages/engine/src/effects.ts"

src = open(EFFECTS, encoding="utf-8").read()

ANCHOR = "const HAND_COST_THEN_DRAW = /^Discard a card from your hand\\. If you do, draw (\\d+) cards\\.$/;"
GUARD = "    const drawn = Number(match[1]);\n    if (drawn >= 1) {"
PAY = '        { op: "payFromHand", count: 1, to: "discard", recordAs: "paid" },'
GATE = '        { op: "recordGate", slot: "paid", then: [{ op: "drawCards", count: drawn }] },'
IGNORE = "        // biome-ignore lint/suspicious/noThenProperty: `then` is the effect contract's gated-step list, not a thenable (arrays are not callable).\n"
BOTH = PAY + "\n" + IGNORE + GATE

for needle in (ANCHOR, GUARD, PAY, GATE, BOTH):
    assert src.count(needle) == 1, f"needle occurs {src.count(needle)}x: {needle[:70]!r}"

EF = "packages/engine/src/effects.ts"
MINE = "packages/engine/src/handCostDraw.test.ts"
GUARDSUITE = "packages/engine/src/handEnergyCancel.test.ts"
OPTDRAW = "packages/engine/src/optionalDraw.test.ts"

ROWS = [
    {
        "id": "D473-arm-drops-the-record-gate",
        "decision": "D473",
        "what": (
            "🛑🛑 **THE ROW THIS SLICE EXISTS TO WRITE, AND IT DIES IN A SUITE THAT IS NEITHER A "
            "CENSUS NOR THIS SLICE'S OWN (D469/D470/D472).** The §9.2 `recordGate` is deleted and the "
            "draw runs unconditionally — every op still present, each right in isolation, and the "
            "program wrong in exactly the direction D420's structural guard was built to forbid: "
            "`attack.ts` never calls `handCostUnmet`, so `payFromHand` on an EMPTY hand pays nothing "
            "and the attack then draws for free off a price the engine never collected. ⚠️ THE "
            "MUTATION IS INVISIBLE TO THE CENSUS AND TO EVERY NON-EMPTY BOARD — the sentence still "
            "reads, `resolvedByAnyReader` is still true, RESIDUE still falls 2/2, `BUILT.attack` still "
            "steps 2, and §3's four-card board answers the IDENTICAL zone triple under both builds. "
            "It is caught by `handEnergyCancel.test.ts` §4, whose widened `handCostIsSlotGated` "
            "exemption this row is the receipt for, and by `handCostDraw.test.ts` §4's empty-hand "
            "board, where the two builds answer 0 cards and 2."
        ),
        "file": EF,
        "find": BOTH,
        "replace": PAY + "\n" + '        { op: "drawCards", count: drawn },',
        "expectKilledBy": [GUARDSUITE, MINE],
    },
    {
        "id": "D473-arm-pays-two-cards-from-hand",
        "decision": "D473",
        "what": (
            "the printed article is read as a plural: the payment takes TWO cards where the sentence "
            "prints *\"a card\"*. Not a straw — it is the count every OTHER `payFromHand` producer in "
            "this engine carries (Ultra Ball, Superior Energy Retrieval and Kofu all pay 2), so it is "
            "the number an author copies. §3's zone triple separates it by the DISCARD PILE (2 rather "
            "than 1) as well as by the hand, which is why that rung reads three zones and not one."
        ),
        "file": EF,
        "find": PAY,
        "replace": '        { op: "payFromHand", count: 2, to: "discard", recordAs: "paid" },',
        "expectKilledBy": [MINE],
    },
    {
        "id": "D473-arm-pays-to-the-deck-bottom",
        "decision": "D473",
        "what": (
            "the destination crosses to `deckBottom` — the SIBLING VALUE on the very field this arm "
            "sets, and the one Dendra prints (*\"put a card from your hand on the bottom of your "
            "deck\"*). The hand ends at the SAME size under both builds, so only the discard pile and "
            "the deck can see it: §3's triple answers `[5, 1, deck-2]` against `[5, 0, deck-1]`. "
            "⚠️ It also moves the park's CAPTION, which §5 pins to the printed sentence byte for byte."
        ),
        "file": EF,
        "find": PAY,
        "replace": '        { op: "payFromHand", count: 1, to: "deckBottom", recordAs: "paid" },',
        "expectKilledBy": [MINE],
    },
    {
        "id": "D473-arm-drops-the-payments-record-slot",
        "decision": "D473",
        "what": (
            "🛑 **THE QUIET HALF OF THE GATE.** The payment stops filing under `paid`, so "
            "`recordGateHolds` reads an empty slot on EVERY board and the draw never happens — the "
            "gate compiles, derives and reads as careful while being dead. This is the mirror of "
            "`D473-arm-drops-the-record-gate`: that one makes the draw unconditional, this one makes "
            "it unreachable, and a suite that drove only one of them would be green on the other. §2's "
            "slot-IDENTITY rung asserts the two halves as one equality rather than as two literals, so "
            "it reddens here; §3's triple answers `[3, 1, deck]` — a discard with no draw at all."
        ),
        "file": EF,
        "find": PAY,
        "replace": '        { op: "payFromHand", count: 1, to: "discard" },',
        "expectKilledBy": [MINE],
    },
    {
        "id": "D473-gate-reads-a-different-slot",
        "decision": "D473",
        "what": (
            "the gate asks about `moved` — the slot the SWITCH family files (`switchActive`, `gust`, "
            "`opponentSwitchOut`) and the one a reader who has just come from `registry.ts`'s Prime "
            "Catcher program would write. `EffectSlot` is a closed union so this compiles, and on this "
            "program nothing ever files `moved`, so the draw is silently dead. Same OBSERVED board as "
            "`D473-arm-drops-the-payments-record-slot`, opposite half of the same identity — both rows "
            "exist because the identity has two ends and a build can break either."
        ),
        "file": EF,
        "find": GATE,
        "replace": '        { op: "recordGate", slot: "moved", then: [{ op: "drawCards", count: drawn }] },',
        "expectKilledBy": [MINE],
    },
    {
        "id": "D473-gate-draws-a-hard-coded-two",
        "decision": "D473",
        "what": (
            "the captured count is replaced by the literal the first printing happens to carry. ⚠️ **A "
            "SUITE THAT ONLY EVER DRIVES `draw 2 cards` IS GREEN ON THIS**, which is the whole reason "
            "§4 fields a SECOND fixture printing the `draw 3 cards` sibling and drives it on a board of "
            "its own rather than asserting the derived value alone. D121's two-printings-one-token "
            "warrant is what justifies the capture, and this row is what makes the capture testable."
        ),
        "file": EF,
        "find": GATE,
        "replace": '        { op: "recordGate", slot: "paid", then: [{ op: "drawCards", count: 2 }] },',
        "expectKilledBy": [MINE],
    },
    {
        "id": "D473-arm-drops-the-positive-count-guard",
        "decision": "D473",
        "what": (
            "the `>= 1` floor every counted arm in `deriveAttackEffect` carries becomes `>= 0`, so a "
            "printed *\"draw 0 cards.\"* files a program whose payment is real and whose draw moves "
            "nothing — a hand discard wearing a draw's sentence, which belongs on the LOUD "
            "`ATTACK_EFFECT_SKIPPED` path where a census can see it. ⚠️ The `find` spans the `const` "
            "line as well as the `if`, deliberately: `if (drawn >= 1) {` alone would be a generic idiom "
            "this file spells at several arms (D404's own block says so), and a row anchored on it "
            "could sit on the wrong one while occurring exactly once."
        ),
        "file": EF,
        "find": GUARD,
        "replace": "    const drawn = Number(match[1]);\n    if (drawn >= 0) {",
        "expectKilledBy": [MINE],
    },
    {
        "id": "D473-anchor-widens-the-printed-subject",
        "decision": "D473",
        "what": (
            "🛑 **THE WIDENING D472's RULE SAYS TO MEASURE, INSTALLED AS THE DEFECT.** The printed "
            "*\"a card\"* becomes a NON-CAPTURING `(?:.+)`, so the group indices are untouched and the "
            "arm goes on reading `match[1]` as the count — the mutation is therefore SILENT on every "
            "board this slice drives and shows up only on a sentence the catalog does not yet print. "
            "Measured over all 640 corpus rows the widened form claims the IDENTICAL 2 sentences / 2 "
            "printings, so it buys nothing; what it costs is a wrong program, because a printed "
            "FILTERED cost (*\"Discard a Basic {G} Energy card from your hand.\"*) would derive as this "
            "arm's UNFILTERED `payFromHand` and discard a card the sentence never names (D190b/D199). "
            "§1's head-widening rung drives exactly that string."
        ),
        "file": EF,
        "find": ANCHOR,
        "replace": "const HAND_COST_THEN_DRAW = /^Discard (?:.+) from your hand\\. If you do, draw (\\d+) cards\\.$/;",
        "expectKilledBy": [MINE],
    },
    {
        "id": "D473-anchor-loses-its-end-anchor",
        "decision": "D473",
        "what": (
            "the trailing `$` goes, so the anchor claims any sentence that OPENS with these words — "
            "*\"…draw 2 cards. Then, shuffle your deck.\"* would derive to the two-op program with its "
            "whole tail silently dropped. D464's rule is why this row and its `^` twin are BOTH written: "
            "the two ends fail differently, and the trailing end is the one whose refusal cannot be shown "
            "on the loud path once the sentence itself derives."
        ),
        "file": EF,
        "find": ANCHOR,
        "replace": "const HAND_COST_THEN_DRAW = /^Discard a card from your hand\\. If you do, draw (\\d+) cards\\./;",
        "expectKilledBy": [MINE],
    },
    {
        "id": "D473-anchor-loses-its-start-anchor",
        "decision": "D473",
        "what": (
            "the leading `^` goes, so any sentence ENDING with these words is claimed and everything "
            "printed in front of it is silently discarded — *\"Draw a card. Discard a card from your "
            "hand. If you do, draw 2 cards.\"* would resolve as the bare pair. The twin of the row above, "
            "and the one whose refusal IS demonstrable on the loud path (D464)."
        ),
        "file": EF,
        "find": ANCHOR,
        "replace": "const HAND_COST_THEN_DRAW = /Discard a card from your hand\\. If you do, draw (\\d+) cards\\.$/;",
        "expectKilledBy": [MINE],
    },
    {
        "id": "D473-near-miss-list-keeps-the-built-sentence",
        "decision": "D473",
        "what": (
            "🛑 **THE RE-POINTED REFUSAL, ARMED FROM THE OTHER SIDE (D418/D438/D444).** "
            "`optionalDraw.test.ts` carried this sentence in `NEAR_MISSES` — a `toBeNull` list — with a "
            "note that correctly named every feature of the mechanism and treated none of them as a "
            "blocker. D473 re-pointed it onto the SHAPE (a §9.2 gate, never an `optional` wrapper) "
            "rather than flipping it to `.not.toBeNull()`, which would have been true under a build that "
            "wrapped the sentence instead. This row installs that very build in the ARM — the wrapper an "
            "author reaching for `optional` would write — and it is killed by the replacement rung and by "
            "this slice's own §2. ⚠️ It is not cosmetic: an `optional` gate asks the CONTROLLER a "
            "question, so on an EMPTY hand it would still offer the draw, where the printed sentence "
            "gives nothing."
        ),
        "file": EF,
        "find": BOTH,
        "replace": (
            '        { op: "optional", note: "Discard a card from your hand.", then: [\n'
            '          { op: "payFromHand", count: 1, to: "discard", recordAs: "paid" },\n'
            '          { op: "drawCards", count: drawn },\n'
            "        ] },"
        ),
        "expectKilledBy": [OPTDRAW, MINE],
    },
]

def js(s: str) -> str:
    return json.dumps(s, ensure_ascii=False)

blocks = []
for r in ROWS:
    killers = ", ".join(js(k) for k in r["expectKilledBy"])
    blocks.append(
        "  {\n"
        f"    id: {js(r['id'])},\n"
        f"    decision: {js(r['decision'])},\n"
        f"    what: {js(r['what'])},\n"
        f"    file: {js(r['file'])},\n"
        f"    find: {js(r['find'])},\n"
        f"    replace: {js(r['replace'])},\n"
        f"    expectKilledBy: [{killers}],\n"
        "  },\n"
    )

original = open(MUT, "rb").read()
try:
    text = original.decode("utf-8")
    tail = "];\n"
    assert text.endswith(tail), repr(text[-20:])
    payload = (text[: -len(tail)] + "".join(blocks) + tail).encode("utf-8")
    with open(MUT, "wb") as fh:
        fh.write(payload)
    after = os.path.getsize(MUT)
    assert after > len(original), (after, len(original))
    print(f"appended {len(ROWS)} rows; {len(original)} → {after} bytes")
except Exception as exc:
    with open(MUT, "wb") as fh:
        fh.write(original)
    print("RESTORED after failure:", exc, file=sys.stderr)
    raise
