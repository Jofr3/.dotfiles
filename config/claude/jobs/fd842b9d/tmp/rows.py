import io, json, sys

PATH = "scripts/mutation/mutants.ts"
FILE = "packages/engine/src/effects.ts"
SUITE = "packages/engine/src/flipStatusHeadsTails.test.ts"
PAIR = "packages/engine/src/defenderStatusPair.test.ts"

ANCHOR_OLD = "  `^Flip a coin\\\\. If heads, your opponent['’]s Active Pokémon is now (${STATUS_WORDS}) and (${STATUS_WORDS})\\\\. If tails, your opponent['’]s Active Pokémon is now (${STATUS_WORDS})\\\\.$`,"
PAIR_ANCHOR = "  `^Flip a coin\\\\. If heads, your opponent['’]s Active Pokémon is now (${STATUS_WORDS}) and (${STATUS_WORDS})\\\\.$`,"

OTHERWISE_BLOCK = (
    "            otherwise: [\n"
    "              { op: \"applyStatus\", target: \"defender\", status: statusOf(match[3]) },\n"
    "            ],\n"
)
BOTH_ARMS = "            then: heads,\n" + OTHERWISE_BLOCK
TAILS_OP_LINE = "              { op: \"applyStatus\", target: \"defender\", status: statusOf(match[3]) },"
HEADS_LINE = "    const heads = defenderStatusOps([match[1], match[2]]);"
HEADS_PLUS = HEADS_LINE + "\n    return heads === null"

ROWS = [
    dict(
        id="D478-arm-drops-the-tails-branch",
        what="The `otherwise` key goes and the arm emits a ONE-ARMED gate — which is arm 2b's real code, eleven lines up, copied onto a sentence that prints a second consequent. THE CENTRAL ROW. Both printings still resolve, still land Paralyzed+Poisoned on heads, still report nothing skipped, and move EVERY census figure by exactly the same amount: RESIDUE still falls 1/2 and `BUILT.attack` still steps 2. **The only board that can tell the two builds apart is the TAILS one**, where the card says Confused and the mutant does nothing at all.",
        find=OTHERWISE_BLOCK,
        replace="",
        killers=[SUITE, PAIR],
    ),
    dict(
        id="D478-arm-swaps-the-two-branches",
        what="The two arms are exchanged: the printed HEADS pair runs on tails and the printed TAILS single runs on heads. A genuine SWAP, so the `find` spans BOTH operands — a swap cannot be spelled by anything shorter (D477). Every board still lands a Special Condition and the coin row is unchanged, so a suite asserting *“a status landed”* is green on it; §4's paired reading is what sees it, because exactly one face carries Poison and exactly one carries Confusion.",
        find=BOTH_ARMS,
        replace=(
            "            then: [{ op: \"applyStatus\", target: \"defender\", status: statusOf(match[3]) }],\n"
            "            otherwise: heads,\n"
        ),
        killers=[SUITE],
    ),
    dict(
        id="D478-arm-drops-the-second-heads-status",
        what="The heads list loses its second slot, so *“is now Paralyzed and Poisoned”* lands Paralysis alone — the AND-ness of the printed conjunction silently gone. The mutation is `FLIP_DEFENDER_NOW`'s real arm shape (one status behind one gate, 29 printings) applied to a two-status sentence. `poisonDamage` is a NUMBER, so §4 sees it; a status-LIST assertion would not, which is why that rung reads the field.",
        find=HEADS_LINE,
        replace="    const heads = defenderStatusOps([match[1]]);",
        killers=[SUITE],
    ),
    dict(
        id="D478-arm-reverses-the-printed-heads-order",
        what="The heads pair is emitted in the order `[match[2], match[1]]` — Poisoned before Paralyzed, where the card prints the reverse. D424's `pair-ops-not-in-printed-order` at a second address. The END BOARD is identical (the two ops touch disjoint `SpecialConditions` fields, which §4 of `defenderStatusPair.test.ts` pins as a property of the MODEL), so only the `STATUS_APPLIED` row ORDER can see it — which is the faithfulness claim this arm makes and the reason the rung reads the events rather than the board.",
        find=HEADS_PLUS,
        replace="    const heads = defenderStatusOps([match[2], match[1]]);\n    return heads === null",
        killers=[SUITE],
    ),
    dict(
        id="D478-arm-hardcodes-the-printed-tails-status",
        what="The tails slot's capture stops reaching the op and the arm always emits `confused` — correct on the ONE printed row and wrong on every other inhabitant of the template. That is the defect a LITERAL anchor would have shipped by construction, so this row is what makes the template's third slot a claim rather than decoration. ⚠ It can only be driven on CONSTRUCTED text (D440), because the column prints exactly one member of this family; §2's template rung says so at the site.",
        find=TAILS_OP_LINE,
        replace="              { op: \"applyStatus\", target: \"defender\", status: \"confused\" },",
        killers=[SUITE],
    ),
    dict(
        id="D478-anchor-loses-its-caret",
        what="The whole-sentence `^` goes, so any string ENDING in this sentence is claimed and whatever precedes it is thrown away in silence. The `^` end is the half that stays on the LOUD path (D464), so it can be demonstrated by a leading-text near miss: §5's `CONSTRUCTED_MISSES` (b) prefixes *“This attack does nothing.”* and expects null. ⚠ Measured over all 640 rows the loosening claims the SAME 1 row / 2 printings, so no census can see it — it needed a rung, not a count.",
        find=ANCHOR_OLD,
        replace=ANCHOR_OLD.replace("`^Flip a coin", "`Flip a coin"),
        killers=[SUITE],
    ),
    dict(
        id="D478-anchor-loses-its-terminator",
        what="The whole-sentence `\\.$` goes, turning the anchor into a PREFIX match, so *“…is now Confused. Draw a card.”* is claimed WHOLE and the printed draw is dropped without a word. ⚠ THE FAILURE THAT LOOKS LIKE A COVERAGE WIN, and the end of the anchor that CANNOT be pinned by nullity (D464): with the terminator intact D409's splitter composes that compound, so the honest rung asserts the SPLIT plus `deriveAttackEffect` refusing the compound whole — the second half is what reddens here.",
        find=ANCHOR_OLD,
        replace=ANCHOR_OLD.replace("(${STATUS_WORDS})\\\\.$`,", "(${STATUS_WORDS})\\\\.`,"),
        killers=[SUITE],
    ),
    dict(
        id="D478-anchor-widens-the-tails-slot",
        what="The tails slot goes from `(${STATUS_WORDS})` to `(.+)`, so a sentence naming something that is not a Special Condition is claimed and `statusOf` answers `undefined` — a program that RESOLVES, emits a `STATUS_APPLIED` row and sets a condition field to nothing. D190b's wrong-but-plausible program, and the one loosening of this anchor whose damage is not visible in any corpus count: measured, it still claims exactly 1 row / 2 printings.",
        find=ANCHOR_OLD,
        replace=ANCHOR_OLD.replace(
            "If tails, your opponent['’]s Active Pokémon is now (${STATUS_WORDS})\\\\.$`,",
            "If tails, your opponent['’]s Active Pokémon is now (.+)\\\\.$`,",
        ),
        killers=[SUITE],
    ),
    dict(
        id="D478-pair-anchor-drift-eats-the-tails-branch",
        what="🛑 `FLIP_DEFENDER_STATUS_PAIR` drops its `\\.$` — an anchor shipped at D424 that had **ZERO mutant rows in the whole corpus** until this slice (needled at this head: 0 hits for its name). Arm 2b runs BEFORE arm 2b-bis, so the drifted anchor claims corpus FILE LINE 263 FIRST and emits the HEADS ARM ALONE, silently discarding the tails branch. ⚠ THIS IS THE DISCRIMINATION A `toBeNull` USED TO CARRY: three files pinned that sentence as unread precisely to catch this drift, and building it turned nullity into a VALUE claim — stronger, because it separates *heads-only* from *both arms*, which nullity never could (D418/D438/D449).",
        find=PAIR_ANCHOR,
        replace=PAIR_ANCHOR.replace("(${STATUS_WORDS})\\\\.$`,", "(${STATUS_WORDS})`,"),
        killers=[SUITE, PAIR],
    ),
]

def ts(s: str) -> str:
    return json.dumps(s, ensure_ascii=False)

def main():
    with open(PATH, "rb") as fh:
        text = fh.read().decode("utf-8")
    original = text
    marker = "];\n"
    if not text.endswith(marker):
        raise SystemExit("mutants.ts does not end with the expected closing bracket")
    body = []
    for r in ROWS:
        body.append("  {\n")
        body.append(f"    id: {ts(r['id'])},\n")
        body.append('    decision: "D478",\n')
        body.append(f"    what: {ts(r['what'])},\n")
        body.append(f"    file: {ts(FILE)},\n")
        body.append(f"    find: {ts(r['find'])},\n")
        body.append(f"    replace: {ts(r['replace'])},\n")
        body.append("    expectKilledBy: [" + ", ".join(ts(k) for k in r["killers"]) + "],\n")
        body.append("  },\n")
    new = text[: -len(marker)] + "".join(body) + marker
    payload = new.encode("utf-8")
    try:
        with open(PATH, "wb") as fh:
            fh.write(payload)
    except BaseException:
        with open(PATH, "wb") as fh:
            fh.write(original.encode("utf-8"))
        raise
    print(f"appended {len(ROWS)} rows; {len(original.splitlines())} -> {len(new.splitlines())} lines")

main()
