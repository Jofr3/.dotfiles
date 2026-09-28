# -*- coding: utf-8 -*-
import io, json

ARM = ('      { op: "damageDefender", amount },\n'
       '      { op: "spreadDamage", target: "opponentBench", amount },\n')
AMOUNT = ('    const amount = Number(match[1]);\n'
          '    return [\n'
          '      { op: "damageDefender", amount },\n')
ANCHOR = ("  `^This attack does (\\\\d+) damage to each of your opponent['’]s Pokémon\\\\.` +\n"
          "    `(?: \\\\(Don['’]t apply Weakness and Resistance for Benched Pokémon\\\\.\\\\))?$`,\n")

SUITE = "packages/engine/src/boardWideSpread.test.ts"
GUST = "packages/engine/src/derivedDrawAndGust.test.ts"

ROWS = [
 dict(id="D482-arm-drops-the-active-half",
   what="\U0001f6d1 **THE CENTRAL ROW, AND IT IS THE NEAREST WRONG SIBLING RATHER THAN A CONSTRUCTION**: arm 6a-bis returns arm 6's program, byte for byte — `[{op:\"spreadDamage\",target:\"opponentBench\",amount}]`, the real code eighty lines up, on a sentence whose printed noun is the whole SIDE and not the Bench. **Silent in every census**: the sentence still resolves, `resolvedByAnyReader` is still true, `BUILT.attack` still steps by 1 and both instrument gates still pass — while the opponent's ACTIVE POKÉMON, the body the sentence names first, takes nothing at all. ⚠️ AND IT IS NOT MERELY \"three rows instead of four\": `attack.ts`'s `programDamage` stops firing with the `damageDefender` gone, so the printed base comes BACK and the Active is hit for the card's own number instead of the sentence's. §4's row list, §5's 60/30 pair and §8's base-drop control each redden independently.",
   find=ARM, replace='      { op: "spreadDamage", target: "opponentBench", amount },\n',
   killed=[SUITE]),
 dict(id="D482-arm-order-flips",
   what="The two ops swap places, so the Bench is walked before the Active. **The BOARD is identical and the WIRE is not** — every body ends on the same damage, no KO changes hands, and every census figure is untouched; what moves is the order of the four `DAMAGE_DEALT` rows a client and a replay read, and the order in which `spreadDamage`'s coin-flip-shield fold consumes `rngState` (D258: a spread into three holders is three flips, not one). §4.1 pins the row order EXACTLY rather than as a set, which is the only assertion in the file that can see this. ⚠️ Not an `equivalent` survivor: §8.5 resolves the Active Spot before anything splashes, so the printed order is the rule and not a preference.",
   find=ARM,
   replace='      { op: "spreadDamage", target: "opponentBench", amount },\n      { op: "damageDefender", amount },\n',
   killed=[SUITE]),
 dict(id="D482-arm-active-half-places-counters",
   what="\U0001f6d1 **D228's NAMED NEAR-MISS, MADE EXECUTABLE**: `damageDefender` becomes `damageActive` — the shipped op one screen up, which PLACES damage counters. Its own doc block says the difference in as many words: *\"no Weakness, no Resistance, no `damageReductionAfterWR` passive, a `COUNTERS_PLACED` row rather than `DAMAGE_DEALT`\"*. **This is the mutation the printed parenthetical exists to forbid** — *\"(Don't apply Weakness and Resistance for Benched Pokémon.)\"* is only meaningful if W/R DOES apply to the Active. §5 is the rung and it is a 60-versus-30 on ONE printed card in TWO spots; §8 catches the second half (the op name changes, so `programDamage` stops firing and the printed base leaks back).",
   find=ARM,
   replace='      { op: "damageActive", amount, source: "attack" },\n      { op: "spreadDamage", target: "opponentBench", amount },\n',
   killed=[SUITE]),
 dict(id="D482-arm-spread-side-flips",
   what="`target: \"opponentBench\"` becomes `\"yourBench\"` — **D425's own `D425-spread-side-flips` at a second address**, and the reason this anchor spells the possessive instead of capturing it. The Active half still lands correctly, so \"the sentence was read\" and \"the defender took damage\" are both still true; what happens is that the ATTACKER's own Bench takes the spread, which under D425's `DAMAGE_DEALT.by` renders as the attacker damaging itself and can hand the OPPONENT a Prize. §4.1 asserts P1's own board is untouched for exactly this row.",
   find=ARM,
   replace='      { op: "damageDefender", amount },\n      { op: "spreadDamage", target: "yourBench", amount },\n',
   killed=[SUITE]),
 dict(id="D482-arm-hardcodes-the-printed-amount",
   what="\U0001f6d1 THE CAPTURE BECOMES A LITERAL `30`. **SILENT IN EVERY CENSUS AND ON EVERY BOARD THIS SUITE DRIVES AT THE PRINTED AMOUNT**, because the column prints this skeleton exactly once and at 30 (§1, measured rather than implied — D400). The only thing that can see it is §2's amount rung, which drives the arm at 10, 30 and 120 and requires BOTH ops to take the same number — the distributive *\"each of\"* stated as behaviour. A row here is the claim that the capture is a parameter and not decoration on a population of one.",
   find=AMOUNT,
   replace='    const amount = 30;\n    return [\n      { op: "damageDefender", amount },\n',
   killed=[SUITE]),
 dict(id="D482-anchor-admits-also",
   what="\U0001f6d1 **THE ROW THE WHOLE ANCHOR IS SHAPED BY**: `(?:also )?` is added, which is `SPREAD_EACH_BENCH`'s own shape one screen up. The sibling admits it safely because a bench spread claims nothing; **this arm emits a `damageDefender`, which `attack.ts`'s `programDamage` reads to DROP the printed base** — so the mutant reads *\"This attack ALSO does N damage to each of your opponent's Pokémon\"* as the whole hit and DELETES the main hit the word *\"also\"* exists to announce. ⚠️ **Measured over all 640 corpus rows (§1): the wider form claims the identical 1 sentence / 1 printing**, so the generality buys nothing and costs a wrong program — D472's rule with the sign flipped, the first time this family has met a widening that is a known wrong answer rather than unpaid risk. §3's `also` rung is the killer.",
   find=ANCHOR,
   replace=("  `^This attack (?:also )?does (\\\\d+) damage to each of your opponent['’]s Pokémon\\\\.` +\n"
            "    `(?: \\\\(Don['’]t apply Weakness and Resistance for Benched Pokémon\\\\.\\\\))?$`,\n"),
   killed=[SUITE]),
 dict(id="D482-anchor-captures-the-possessive",
   what="The spelled `your opponent['’]s` becomes the alternation `SPREAD_EACH_BENCH` carries, while the arm keeps emitting `damageDefender` + `spreadDamage { target: \"opponentBench\" }`. So *\"This attack does 30 damage to each of your Pokémon.\"* — the own-side wording, which this column does not print at all — is read as an attack on the OPPONENT's whole side: the wrong Active, the wrong Bench, and a `DAMAGE_DEALT.by` that credits the right seat for the wrong table. **The seat-widening shape (`RETURN_BENCHED` / `DAMAGE_SUPPRESSION`, D467's C6) at a third address**, and measured harmless-looking: §1 shows the wider anchor claims the same 1 row, so no positive case can reveal it. §3's own-side rung is the only thing that refuses it.",
   find=ANCHOR,
   replace=("  `^This attack does (\\\\d+) damage to each of (?:your opponent['’]s|your) Pokémon\\\\.` +\n"
            "    `(?: \\\\(Don['’]t apply Weakness and Resistance for Benched Pokémon\\\\.\\\\))?$`,\n"),
   killed=[SUITE]),
 dict(id="D482-anchor-loses-its-terminator",
   what="The anchor drops its trailing `$`, so it claims any string that OPENS with the printed sentence and silently discards the rest. ⚠️ **AND THE SECOND KILLER IS A SUITE THAT IS NEITHER THIS SLICE'S NOR A CENSUS**: `derivedDrawAndGust.test.ts`'s `NEAR_MISSES` has carried *\"This attack does 10 damage to each of your opponent's Pokémon. (Don't apply …) Switch this Pokémon with 1 of your Benched Pokémon.\"* since D189 as a REAL row from the 14 remote sets, asserted `toBeNull` — so this mutant turns a compound into a spread with the whole self-switch clause deleted, and D189's own control catches the widening D482 performed near it. D234's dropped-`$` shape, inherited a sixth time.",
   find=ANCHOR,
   replace=("  `^This attack does (\\\\d+) damage to each of your opponent['’]s Pokémon\\\\.` +\n"
            "    `(?: \\\\(Don['’]t apply Weakness and Resistance for Benched Pokémon\\\\.\\\\))?`,\n"),
   killed=[SUITE, GUST]),
 dict(id="D482-anchor-loses-its-caret",
   what="The anchor drops its leading `^`, so any sentence CONTAINING the printed clause is claimed and everything in front of it is silently dropped — *\"Draw a card. This attack does 30 damage to each of your opponent's Pokémon.\"* resolves to the spread alone. A separate row from the `$` because the two fail on DIFFERENT strings and a suite could pin one and not the other; §3 drives a leading clause and a trailing clause independently, which is the only reason both rows are killable.",
   find=ANCHOR,
   replace=("  `This attack does (\\\\d+) damage to each of your opponent['’]s Pokémon\\\\.` +\n"
            "    `(?: \\\\(Don['’]t apply Weakness and Resistance for Benched Pokémon\\\\.\\\\))?$`,\n"),
   killed=[SUITE]),
]

HEADER = """  // ── \U0001f195\U0001f195\U0001f195 D482 — THE WHOLE-SIDE SPREAD. Nine rows over ONE new anchor and ONE new
  //    arm, and the SHAPE of the set is the finding: **eight of the nine are SILENT IN
  //    EVERY CENSUS**. The sentence still resolves under all of them, `resolvedByAnyReader`
  //    is still true, `BUILT.attack` still steps by exactly 1 and both instrument gates
  //    still pass — while the derived program hits the wrong side of the table, misses the
  //    body the sentence names FIRST, places counters where the printed parenthetical
  //    demands §8.5, deletes a main hit, or stops reading the printed number. The ninth
  //    (`anchor-loses-its-terminator`) is the only one a second file can see. D479
  //    measured this ratio at 5/10 and D480 at 11/11; a reader-keyed anchor sits at 8/9,
  //    which is the reason a behavioural suite and not a census is what guards this arm.
  //
  //    ⚠ **ONE MUTATION IS DECLARED NOT A ROW RATHER THAN SHIPPED WEAK (D475).** Making
  //    the W/R clarifier MANDATORY — dropping the `(?: …)?` and requiring the
  //    parenthetical — narrows the anchor to exactly the row it already claims, because
  //    the single printed printing carries the clarifier (§1 measures all four variants and
  //    they return the identical row set). **Nothing in this repo can kill it**, and a row
  //    that cannot fail is not a weaker guard but not a guard. Named here as residual risk:
  //    the day a reprint drops the reminder text, the narrowed anchor would refuse it
  //    silently and the census would report the loss as a corpus change rather than as a
  //    defect.
  //
  //    ⚠ **AND NO ROW FOR THE `é` OR THE `['’]` CLASS.** Both are shared with
  //    `SPREAD_EACH_BENCH`'s line one screen up and are already carried by D425's rows; a
  //    copy here would be two rows testing one byte, and §1 pins both code points
  //    off the corpus with `codePointAt` rather than by eye.
"""

def row(d):
    return (
        "  {\n"
        "    id: %s,\n"
        "    decision: \"D482\",\n"
        "    what: %s,\n"
        "    file: \"packages/engine/src/effects.ts\",\n"
        "    find: %s,\n"
        "    replace: %s,\n"
        "    expectKilledBy: [%s],\n"
        "  },\n"
    ) % (
        json.dumps(d["id"]), json.dumps(d["what"]),
        json.dumps(d["find"]), json.dumps(d["replace"]),
        ", ".join(json.dumps(k) for k in d["killed"]),
    )

P = "scripts/mutation/mutants.ts"
with io.open(P, encoding="utf-8") as fh:
    src = fh.read()
assert src.endswith("];\n"), repr(src[-10:])
body = HEADER + "".join(row(d) for d in ROWS)
src = src[:-3] + body + "];\n"
with io.open(P, "w", encoding="utf-8") as fh:
    fh.write(src)
print("appended %d rows" % len(ROWS))
