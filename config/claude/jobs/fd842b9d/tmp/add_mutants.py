import hashlib
import os

P = "/home/jofre/projects/luminous_ui/scripts/mutation/mutants.ts"
SUITE = "packages/engine/src/typedActiveStatusGate.test.ts"
BENCH = "packages/engine/src/benchTypeBonus.test.ts"
EFF = "packages/engine/src/effects.ts"
INT = "packages/engine/src/interpreter.ts"

ARM_FIND = """    const gate = boardConditionForClause(match[1] ?? "");
    if (gate !== null) {
      return [
        {
          op: "conditionGate",
          cond: gate,
          // biome-ignore lint/suspicious/noThenProperty: `then` is the effect contract's gated-step list, not a thenable (arrays are not callable).
          then: [{ op: "applyStatus", target: "defender", status: statusOf(match[2]) }],
        },
      ];
    }"""

ANCHOR_FIND = """const CLAUSE_GATED_DEFENDER_NOW = new RegExp(
  `^If (your opponent['\u2019]s Active Pok\u00e9mon is a .+ Pok\u00e9mon), it is now (${STATUS_WORDS})\\\\.$`,
);"""

CONDITION_FIND = """      const spot = activeTop(state, otherSeat(seat));
      return spot !== null && (spot.card.types ?? []).includes(cond.type);"""


def anchor(body: str) -> str:
    return (
        "const CLAUSE_GATED_DEFENDER_NOW = new RegExp(\n"
        "  `" + body + "`,\n"
        ");"
    )


ROWS = [
    dict(
        id="D472-gate-dropped-status-lands-unconditionally",
        what=(
            "\U0001f6d1 **THE CENTRAL ROW: THE GATE IS DELETED AND THE ARM BECOMES ARM 1 VERBATIM.** "
            "`conditionGate { cond, then: [applyStatus] }` becomes the bare `applyStatus "
            "{ target: \"defender\", status }` that `DEFENDER_NOW` has returned since 0.x \u2014 a "
            "neighbour's REAL code copied from twelve lines up, not a straw. **THE SENTENCE STILL "
            "READS, `resolvedByAnyReader` IS STILL TRUE, RESIDUE STILL FALLS BY ONE AND "
            "`BUILT.attack` STILL STEPS BY TWO**, so every census suite in the repo stays GREEN "
            "while the printed *\"If your opponent's Active Pok\u00e9mon is a {N} Pok\u00e9mon\"* is "
            "thrown away and every Active in the game is Paralyzed. That is D469's convention \u2014 a "
            "census measures whether a sentence is CLAIMED, never whether it is claimed CORRECTLY \u2014 "
            "at a `conditionGate` instead of a `DamageCountSource`, and it is what \u00a76's "
            "five-board signature exists to see: the correct build answers **17** and this one "
            "answers **31**, measured on the same five boards with the same op."
        ),
        file=EFF,
        find=ARM_FIND,
        replace='    return [{ op: "applyStatus", target: "defender", status: statusOf(match[2]) }];',
        expectKilledBy=[SUITE, BENCH],
    ),
    dict(
        id="D472-status-lands-on-the-attacker",
        what=(
            "\U0001f6d1 **THE STATUS CROSSES THE TABLE THE WRONG WAY.** `target: \"defender\"` becomes "
            "`target: \"self\"`, which is arm 3's real code (`SELF_NOW`) one identifier away in the "
            "same file. The gate still evaluates the OPPONENT's Active correctly, so the condition "
            "fires on exactly the right boards \u2014 and then paralyses the ATTACKER. **The log still "
            "carries a `STATUS_APPLIED` row and the board still looks busy**, which is why \u00a76 reports a "
            "PAIR of signatures rather than one: this build takes the defender's signature from 17 to "
            "**0** and the attacker's from 0 to **17**, and no single-seat rung can tell it from the "
            "wrong-type-constant build that also answers 0."
        ),
        file=EFF,
        find=ARM_FIND,
        replace=ARM_FIND.replace('target: "defender"', 'target: "self"'),
        expectKilledBy=[SUITE],
    ),
    dict(
        id="D472-arm-hardcodes-the-printed-status",
        what=(
            "\u26a0\ufe0f **THE TEMPLATE'S SECOND SLOT IS SPENT FOR A LITERAL.** `statusOf(match[2])` "
            "becomes `\"asleep\"` \u2014 arms 4 and 5 both spell `status: \"asleep\"` literally, so this is "
            "the neighbouring line rather than an invented one. The printed row still derives, still "
            "gates on the right board and still emits one `STATUS_APPLIED`; it simply applies the "
            "wrong Special Condition, and `rotation` is ONE FIELD so the board carries a plausible "
            "value rather than a broken one. Killed by \u00a75's whole-record `toEqual`, which is written "
            "on the FIELDS and not on a status list for exactly this reason."
        ),
        file=EFF,
        find=ARM_FIND,
        replace=ARM_FIND.replace("statusOf(match[2])", '"asleep"'),
        expectKilledBy=[SUITE],
    ),
    dict(
        id="D472-clause-resolved-by-a-hardcoded-member",
        what=(
            "\U0001f6d1 **THE MAP IS REPLACED BY THE ONE VALUE THE CATALOG PRINTS, WHICH IS THE DEFECT "
            "D440 REFUSED AND D462 NAMED.** `boardConditionForClause(match[1])` becomes the literal "
            "`{ kind: \"opponentActiveHasType\", type: \"Dragon\" }`. **Every printed board answers "
            "identically** \u2014 the one legal row spells `{N}`, so the census, the residue, the reader "
            "surface and all five of \u00a76's boards are byte-for-byte unchanged. What dies is the "
            "VOCABULARY: `Tera` stops being refused at the map and derives a Dragon gate, the whole "
            "clause table stops being reachable from this anchor, and the sentence's data-blocked "
            "near miss becomes a card that counts the wrong body forever. Killed by \u00a73 (the banner "
            "must be `null` and must reach `ATTACK_EFFECT_SKIPPED` on a board) and by \u00a72's `Stage 1` "
            "and `{P}` constructed rungs."
        ),
        file=EFF,
        find=ARM_FIND,
        replace=ARM_FIND.replace(
            'const gate = boardConditionForClause(match[1] ?? "");',
            'const gate = { kind: "opponentActiveHasType", type: "Dragon" } as BoardCondition;',
        ),
        expectKilledBy=[SUITE],
    ),
    dict(
        id="D472-anchor-drops-the-printed-subject",
        what=(
            "\U0001f6d1 **THE ONLY REAL DESIGN CALL IN THE SLICE, DELETED \u2014 AND IT COSTS ZERO "
            "PRINTINGS, WHICH IS WHY IT NEEDS A ROW.** The spelled subject becomes a bare capture, "
            "`^If (.+), it is now (${STATUS_WORDS})\\.$`. Measured over all 640 corpus rows the two "
            "anchors claim **exactly the same 1 sentence / 2 printings**, so no census, no residue "
            "figure and no board in the catalog can tell them apart. The difference is the ANAPHOR: "
            "*\"it\"* has one antecedent, and once the subject is a capture, a real `BoardCondition` "
            "about the ATTACKER's own Bench (*\"If you have any {M} Pok\u00e9mon on your Bench, it is now "
            "Paralyzed.\"*) resolves and paralyses the DEFENDER off a pronoun pointing across the "
            "table. A wrong-but-plausible program is strictly worse than an unbuilt one (D190b/D199). "
            "Killed by \u00a74, on a constructed string \u2014 declared, because the corpus has no near miss "
            "here and never will (D440)."
        ),
        file=EFF,
        find=ANCHOR_FIND,
        replace=anchor("^If (.+), it is now (${STATUS_WORDS})\\\\.$"),
        expectKilledBy=[SUITE],
    ),
    dict(
        id="D472-anchor-widens-the-status-slot",
        what=(
            "\u26a0\ufe0f **THE STATUS SLOT BECOMES `(.+)`,** which is the loosening `DEFENDER_STATUS_TRIPLE`'s "
            "own doc block discusses and the one an author reaches for when a sixth condition word "
            "appears. The printed row is unaffected \u2014 every single-axis loosening of this anchor "
            "claims exactly the same row, measured in \u00a74 \u2014 so the corpus is silent. Constructed, "
            "*\"\u2026, it is now Knocked Out.\"* now MATCHES, `statusOf` returns `undefined` for a word "
            "`STATUS_OF_WORD` does not carry, and the arm emits an `applyStatus` with no status: a "
            "program shaped exactly like a working one. Killed by \u00a74's one-axis rung."
        ),
        file=EFF,
        find=ANCHOR_FIND,
        replace=anchor(
            "^If (your opponent['\u2019]s Active Pok\u00e9mon is a .+ Pok\u00e9mon), it is now (.+)\\\\.$"
        ),
        expectKilledBy=[SUITE],
    ),
    dict(
        id="D472-anchor-loses-its-start-anchor",
        what=(
            "\u26a0\ufe0f **THE `^` GOES, AND THE CORPUS CANNOT SEE IT.** Measured over all 640 rows the "
            "caret-free pattern claims the same 1 sentence / 2 printings, so no census moves. What "
            "moves is a COMPOUND: *\"This attack does 30 damage. If your opponent's Active "
            "Pok\u00e9mon\u2026\"* stops being loud and derives as though the leading sentence were not "
            "printed \u2014 D278/D279's too-loose failure, which every anchor in this file is `^\u2026$` to "
            "avoid. Killed by \u00a74's leading-text rung, which varies ONLY the anchor (D452: a "
            "\"leading text pins `^`\" rung whose string also changes the case pins the case)."
        ),
        file=EFF,
        find=ANCHOR_FIND,
        replace=anchor(
            "If (your opponent['\u2019]s Active Pok\u00e9mon is a .+ Pok\u00e9mon), it is now (${STATUS_WORDS})\\\\.$"
        ),
        expectKilledBy=[SUITE],
    ),
    dict(
        id="D472-anchor-loses-its-end-anchor",
        what=(
            "\U0001f6d1 **THE `$` GOES, AND IT FAILS DIFFERENTLY FROM THE `^` \u2014 D464's FINDING, PINNED.** "
            "Without the end anchor the arm claims *\"\u2026, it is now Paralyzed. Draw a card.\"* WHOLE "
            "and silently drops the draw, where the same string under the shipped anchor is refused "
            "by `deriveAttackEffect` and handed to D409's trailing splitter as a head/tail pair. **A "
            "`$`-end refusal cannot be demonstrated on the loud path the way a `^`-end one can**, "
            "because the composition succeeds; so \u00a74 asserts the SPLIT and the whole-string `null` "
            "together, and that pair is what kills this."
        ),
        file=EFF,
        find=ANCHOR_FIND,
        replace=anchor(
            "^If (your opponent['\u2019]s Active Pok\u00e9mon is a .+ Pok\u00e9mon), it is now (${STATUS_WORDS})\\\\."
        ),
        expectKilledBy=[SUITE],
    ),
    dict(
        id="D472-anchor-loses-its-apostrophe-class",
        what=(
            "\u26a0\ufe0f **THE `['\u2019]` CLASS NARROWS TO THE STRAIGHT APOSTROPHE.** D136/D137's standing "
            "insurance: the pool carries ZERO U+2019 today, so the catalog cannot show this and no "
            "census can either \u2014 it is a claim about a re-ingest that normalises punctuation, after "
            "which this sentence would silently stop deriving and `BUILT.attack` would step back by "
            "2. Killed by \u00a72's fold rung, which asserts the two spellings produce the SAME VALUE "
            "and not merely a non-null one (D137's contract, D154's half-fix warning)."
        ),
        file=EFF,
        find=ANCHOR_FIND,
        replace=anchor(
            "^If (your opponent's Active Pok\u00e9mon is a .+ Pok\u00e9mon), it is now (${STATUS_WORDS})\\\\.$"
        ),
        expectKilledBy=[SUITE],
    ),
    dict(
        id="D472-active-type-condition-reads-the-asker-seat",
        what=(
            "\U0001f6d1 **THE IMPLEMENTATION SIDE, AND IT HAD NO ROW AT ALL FOR 352 DECISIONS.** "
            "`conditionHolds`'s `opponentActiveHasType` arm \u2014 shipped at D120 and the arm EVERY "
            "clause in this family evaluates through \u2014 is quoted by ZERO rows in the 2,120-row "
            "corpus (measured by span, D453's predicate, not by op name), while its immediate "
            "neighbour `opponentActiveHasResistance` carries five. This row is the first evidence "
            "the arm discriminates at all. It reads `state`'s ASKER seat instead of "
            "`otherSeat(seat)` \u2014 `D387-condition-reads-the-asker-seat` is the same edit on a "
            "sibling arm, so it is a defect this file has already shipped once. Killed by \u00a75's "
            "both-seats rung and by \u00a76, where it takes the defender signature from 17 to **8**."
        ),
        file=INT,
        find=CONDITION_FIND,
        replace=CONDITION_FIND.replace(
            "activeTop(state, otherSeat(seat))", "activeTop(state, seat)"
        ),
        expectKilledBy=[SUITE],
    ),
    dict(
        id="D472-active-type-condition-reads-only-the-first-type",
        what=(
            "\u26a0\ufe0f **`types` IS AN ARRAY AND DUAL TYPES ARE A REAL PRINTING.** "
            "`.includes(cond.type)` becomes `[0] === cond.type`, which is "
            "`D371-resistance-clause-reads-only-the-first-entry`'s edit one column over on the "
            "arm directly above it. **It agrees with the correct build on every single-typed body**, "
            "so it is invisible to every board in the engine except one \u2014 which is why "
            "`fix-d472-dualfoe` prints `[\"Water\", \"Dragon\"]` with `Dragon` SECOND and why \u00a75 drives "
            "it as its own case. It takes \u00a76's defender signature from 17 to **16**."
        ),
        file=INT,
        find=CONDITION_FIND,
        replace=CONDITION_FIND.replace(
            "(spot.card.types ?? []).includes(cond.type)", "(spot.card.types ?? [])[0] === cond.type"
        ),
        expectKilledBy=[SUITE],
    ),
]

HEADER = """  // \u2500\u2500 D472 \u2014 THE BOARD-CLAUSE GATE OVER THIS FAMILY'S STATUS CONSEQUENT. Eleven rows,
  //    NINE on the producer side and TWO on the implementation side \u2014 a ratio chosen
  //    rather than inherited (D453: coverage is a CHAIN and the habit is producer-only).
  //    The two implementation rows are the first any row has ever placed on
  //    `conditionHolds`'s `opponentActiveHasType` arm, which has carried this whole
  //    clause family since D120 with ZERO rows intersecting it by span.
  //
  //    \u26a0\ufe0f **FOUR ROWS SHARE THE ARM'S `find` AND FIVE SHARE THE ANCHOR'S**, because the
  //    claims are independent and D446's rule is to anchor on the line the row is ABOUT
  //    rather than on a longer block: the arm is one statement, so the statement is the
  //    anchor for every claim it carries.
  //
  //    \U0001f6d1 **SEVEN OF THE ELEVEN ARE SILENT IN EVERY CENSUS.** The sentence still matches,
  //    `resolvedByAnyReader` is still true, RESIDUE still falls by one and `BUILT.attack`
  //    still steps by two \u2014 while the program throws the printed condition away, paralyses
  //    the wrong seat, applies the wrong Special Condition, or kills the clause vocabulary
  //    outright. D469's convention, at a `conditionGate` instead of a `DamageCountSource`.
"""


def esc(s: str) -> str:
    return s.replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\\n")


def render(row: dict) -> str:
    parts = [
        "  {",
        f'    id: "{row["id"]}",',
        '    decision: "D472",',
        f'    what: "{esc(row["what"])}",',
        f'    file: "{row["file"]}",',
        f'    find: "{esc(row["find"])}",',
        f'    replace: "{esc(row["replace"])}",',
        "    expectKilledBy: ["
        + ", ".join(f'"{k}"' for k in row["expectKilledBy"])
        + "],",
        "  },",
    ]
    return "\n".join(parts)


with open(P, encoding="utf-8") as fh:
    text = fh.read()

TAIL = "\n];\n"
assert text.endswith(TAIL), repr(text[-20:])
body = text[: -len(TAIL)]
addition = "\n" + HEADER + "\n".join(render(r) for r in ROWS) + TAIL
new = body + addition

payload = new.encode("utf-8")
before = len(text.encode("utf-8"))
tmp = P + ".d472.tmp"
with open(tmp, "wb") as fh:
    fh.write(payload)
os.replace(tmp, P)
print(
    f"rows added: {len(ROWS)}  bytes {before} -> {len(payload)}  "
    f"sha256 {hashlib.sha256(payload).hexdigest()[:12]}"
)
