import io, json, sys
P = "/home/jofre/projects/luminous_ui/scripts/mutation/mutants.ts"
s = io.open(P, encoding="utf-8").read()
EFF = "packages/engine/src/effects.ts"
INT = "packages/engine/src/interpreter.ts"
MINE = "packages/engine/src/eachDeckMillBoost.test.ts"
DMFS = "packages/engine/src/deckMillFilteredScale.test.ts"
BENCH = "packages/engine/src/benchDiscardBoost.test.ts"
DTM = "packages/engine/src/deckTopMill.test.ts"
DSD = "packages/engine/src/discardScaledDamage.test.ts"

ANCHOR = "/^Discard the top card of each player['’]s deck\\\\. This attack does (\\\\d+) more damage for each Energy card discarded in this way\\\\.$/;"

ROWS = [
  # ── PRODUCER SIDE (effects.ts) ────────────────────────────────────────────────────
  dict(id="D490-anchor-loses-its-caret",
    what="⚠️ **THE `^` DROPPED, so a mid-sentence clause reaches a WHOLE-SENTENCE reader.** The family's standing guard is the pair `^…$` plus the capital first word; this is the half a leading rider defeats. With it gone, *\"Before doing damage, discard the top card of each player's deck. …\"* would derive — a compound whose leading clause nothing simulated, resolved silently instead of landing on the loud `ATTACK_EFFECT_SKIPPED` path. Killed by §3's one-axis refusal loop, which spells exactly that leading text.",
    file=EFF,
    find="const EACH_DECK_MILL_SCALED_BOOST =\n  /^Discard the top card",
    replace="const EACH_DECK_MILL_SCALED_BOOST =\n  /Discard the top card",
    killers=[MINE]),
  dict(id="D490-anchor-loses-its-dollar",
    what="⚠️ **THE `\\\\.$` DROPPED — the OTHER half of the whole-sentence guard, and the one whose failure is quiet.** A trailing clause (*\"… Then, shuffle your deck.\"*) would be swallowed whole: the reader answers, the census counts the sentence BUILT, and the rider the engine never saw is simply absent. ⚠️ Note the asymmetry D464 names: the `^` end can be demonstrated on the loud path and the `$` end cannot, because once a head derives the trailing splitter may compose it — so §1 asserts the SPLIT is null as well.",
    file=EFF,
    find="more damage for each Energy card discarded in this way\\.$/;",
    replace="more damage for each Energy card discarded in this way\\./;",
    killers=[MINE]),
  dict(id="D490-anchor-reads-the-wrong-noun",
    what="⚠️ **THE COUNTED NOUN IS A LITERAL AND THIS IS THE NEAREST WRONG ONE.** `Item card` is a real key of `DISCARD_PILE_NOUNS` — the map D488's sibling anchor resolves its captured noun through — so it is exactly the token an author reaching for the neighbouring family would write. The printed sentence then derives to NOTHING and falls to the loud path, which is the LOUD direction of the defect: `BUILT.attack` steps back by 2 and §1's owner rung names the reader that stopped answering.",
    file=EFF,
    find="more damage for each Energy card discarded in this way\\.$/;",
    replace="more damage for each Item card discarded in this way\\.$/;",
    killers=[MINE]),
  dict(id="D490-anchor-drops-the-printed-more",
    what="🛑 **THE `more` DELETED, WHICH IS THE SPLIT THIS WHOLE FAMILY TURNS ON.** With `more` the fold is ADDITIVE and the printed base is KEPT; without it the printed N IS the per-unit and the base is DROPPED. The mutated anchor claims the MULTIPLY spelling of the same sentence — a string the column does not print — while `attack.ts` still re-homes the base through this reading, so a card printing the multiply form would be paid its base twice over. §3's one-axis loop drives the no-`more` spelling directly.",
    file=EFF,
    find="deck\\. This attack does (\\d+) more damage for each Energy card discarded",
    replace="deck\\. This attack does (\\d+) ?m?o?r?e? ?damage for each Energy card discarded",
    killers=[MINE]),
  dict(id="D490-per-guard-admits-zero",
    what="⚠️ **THE POSITIVITY GUARD ADMITS A PRINTED ZERO** — D145's standing rule for every captured amount in this file. A printed *\"0 more damage for each…\"* would then derive a program that mills BOTH decks and deals exactly the printed base however many Energy come off: a SILENT no-op where the loud `ATTACK_EFFECT_SKIPPED` path is the whole point of the coverage strategy. Unreachable from the pool today and written from the rule, like every sibling guard in the file.",
    file=EFF,
    find="    return perMilled < 1 ? null : { kind: \"eachDeckMill\", per: perMilled };",
    replace="    return perMilled < 0 ? null : { kind: \"eachDeckMill\", per: perMilled };",
    killers=[MINE]),
  dict(id="D490-assembler-mills-the-attackers-deck-only",
    what="🛑 **THE CENTRAL ATTRIBUTION MUTANT: THE TWO-DECK WALK COLLAPSES TO THE NEAREST WRONG SIBLING.** `whose: \"self\"` is what the SHIPPED D488 mill compound emits one screen up and what `DECK_TOP_MILL` has emitted since D131, so it is the single most likely edit an author makes here. The opponent's deck is never touched and the count loses their card: board B deals 50 where the sentence deals 190, and the CONTENTS assertions catch it on every board. ⚠️ `censusAtHead` stays GREEN under it — the sentence still reads and the residue still falls — which is D469's rule and is why the behavioural rungs exist.",
    file=EFF,
    find="        { op: \"discardDeckTop\", whose: \"eachPlayer\", count: 1, recordAs: \"discarded\" },",
    replace="        { op: \"discardDeckTop\", whose: \"self\", count: 1, recordAs: \"discarded\" },",
    killers=[MINE]),
  dict(id="D490-assembler-mills-the-opponents-deck-only",
    what="🛑 **THE MIRROR, AND IT IS ITS TWIN'S CONTROL** (D443: a one-sided rung is green under BOTH defects). *\"Each player's deck\"* read as *\"your opponent's deck\"* is the other half of the same wrong reading, and on a suite whose boards all put the Energy on the attacker's side it is invisible. Board A deals 50 where the sentence deals 190; board B agrees with the correct build on the NUMBER and disagrees on which pile grew, which is why the pair needs both boards and the contents.",
    file=EFF,
    find="        { op: \"discardDeckTop\", whose: \"eachPlayer\", count: 1, recordAs: \"discarded\" },\n        // 🛑 THE PRINTED NOUN",
    replace="        { op: \"discardDeckTop\", whose: \"opponent\", count: 1, recordAs: \"discarded\" },\n        // 🛑 THE PRINTED NOUN",
    killers=[MINE]),
  dict(id="D490-assembler-drops-the-count-filter",
    what="⚠️ **THE PRINTED NOUN DROPPED FROM THE COUNT, so every milled card scores rather than the Energy among them.** `countFilter` is D488's field and an ABSENT one is deliberately *every uid in the slot* — which is what makes the omission SILENT rather than a type error, and the reason this row exists at all. Board A then deals 330 where the sentence deals 190. The two decks are milled correctly and only the number is wrong, so no zone assertion anywhere can see it.",
    file=EFF,
    find="          count: \"discarded\",\n          countFilter: { kind: \"anyEnergy\" },\n        },\n      ];\n  }",
    replace="          count: \"discarded\",\n        },\n      ];\n  }",
    killers=[MINE]),
  dict(id="D490-assembler-drops-the-printed-base",
    what="🛑 **THE ADDITIVE HALF COLLAPSES INTO THE MULTIPLY FAMILY'S FOLD.** An ABSENT `base` means something specific on this op — the multiply family's DROPPED base (D403) — so omitting it compiles, runs, and reads as the neighbouring family: the attack deals `per × N` and its printed 50 vanishes. On the board where NOTHING milled was an Energy it deals **zero**, which is the sharpest form: an attack that prints a damage number and does nothing at all.",
    file=EFF,
    find="          op: \"damageDefender\",\n          base,\n          per: reading.per,",
    replace="          op: \"damageDefender\",\n          per: reading.per,",
    killers=[MINE]),
  dict(id="D490-assembler-drops-the-record",
    what="⚠️ **THE MILL STOPS FILING ITS §9.2 SLOT, so the printed *\"in this way\"* has nothing to refer to.** The mill still happens — both decks lose their top card and both log rows print — and only the DAMAGE collapses to the bare printed base on every board. This is `D488-arm-drops-the-record` one head over, and it is the direction that looks like a working card: the board is right, the log is right, the number is quietly the floor.",
    file=EFF,
    find="whose: \"eachPlayer\", count: 1, recordAs: \"discarded\" },",
    replace="whose: \"eachPlayer\", count: 1 },",
    killers=[MINE]),
  dict(id="D490-assembler-reads-the-wrong-slot",
    what="⚠️ **THE FOLD READS `paid` WHERE THE MILL FILED `discarded`.** `EffectSlot` has three inhabitants and the two ops must agree on ONE address — which is exactly why `damageDefender.count` is a NAMED slot rather than a boolean (D489's argument at the sibling op). The mutation is invisible in the program's shape: both ops are present, both are well-formed, and the count is 0 on every board because nothing ever wrote `paid`.",
    file=EFF,
    find="          per: reading.per,\n          count: \"discarded\",\n          countFilter: { kind: \"anyEnergy\" },",
    replace="          per: reading.per,\n          count: \"paid\",\n          countFilter: { kind: \"anyEnergy\" },",
    killers=[MINE]),
  # ── IMPLEMENTATION SIDE (interpreter.ts) — D453's rule: count a family's rows by SEAT,
  #    because the authoring habit puts them all on the producer side.
  dict(id="D490-eachplayer-walks-the-attacker-only",
    what="🛑 **THE NEW `switch` CASE COLLAPSES TO ITS `self` NEIGHBOUR — the defect the old TERNARY would have shipped SILENTLY.** Before D490 this arm read `op.whose === \"self\" ? ctx.seat : otherSeat(ctx.seat)`, so a third member fell out of the wrong side with `tsc` reporting nothing (D222/D425/D447). The switch makes an omission loud; this row is what proves the CASE BODY is checked and not merely present. Board B deals 50 against a printed 190, and the opponent's deck keeps its top card.",
    file=INT,
    find="          case \"eachPlayer\":\n            return [ctx.seat, otherSeat(ctx.seat)];",
    replace="          case \"eachPlayer\":\n            return [ctx.seat];",
    killers=[MINE]),
  dict(id="D490-eachplayer-walks-the-opponent-only",
    what="🛑 **THE MIRROR OF THE ROW ABOVE, AND ITS CONTROL** — the same collapse toward the other shipped member. A suite whose boards all put the Energy on one side is green under exactly one of the two, which is why both are written: each is the other's one-axis control (D443).",
    file=INT,
    find="            return [ctx.seat, otherSeat(ctx.seat)];\n        }\n      })();",
    replace="            return [otherSeat(ctx.seat)];\n        }\n      })();",
    killers=[MINE]),
  dict(id="D490-eachplayer-walks-the-absolute-seats",
    what="🛑 **CONTROLLER-FIRST BECOMES ABSOLUTE SEAT ORDER, WHICH IS THE OTHER SHIPPED PRECEDENT AND IS WRONG HERE.** `counterEachAll`'s `side: \"both\"` walks `SEATS` (`[\"p1\",\"p2\"]`) and `handRefresh`'s `who: \"both\"` walks the controller first; D433's rule says a split set is a distinction nobody has found yet, and the distinction is that this op emits one row PER SEAT, so the seat order IS the log's order. ⚠️ **THE MUTATION IS INERT ON EVERY BOARD WHERE p1 ATTACKS**, which is every board a suite writes by default — the killing rung is the p2-controller run in §5, and without it this row would survive against a file that looks thorough.",
    file=INT,
    find="          case \"eachPlayer\":\n            return [ctx.seat, otherSeat(ctx.seat)];\n        }",
    replace="          case \"eachPlayer\":\n            return [...SEATS];\n        }",
    killers=[MINE]),
  dict(id="D490-walk-clobbers-the-first-mill",
    what="🛑 **D429's STALE WRITE-BACK, ON THE FIRST OP IN THIS ENGINE THAT WRITES TWO SEATS IN ONE WALK.** The second iteration's `withSide` is taken from the PRISTINE `state` rather than from the threaded `milledState`, so the attacker's milled card is put back on top of their deck ~one iteration after it left — one physical card in two zones. ⚠️ **EVERY DAMAGE FIGURE IS IDENTICAL UNDER BOTH BUILDS**, because the record is filed from `milled` and not from the board, so only a ZONE assertion can see it: a stale read is invisible-but-inert, a stale write-back is a resurrection.",
    file=INT,
    find="        milledState = withSide(milledState, victim, {",
    replace="        milledState = withSide(state, victim, {",
    killers=[MINE]),
  dict(id="D490-files-only-the-last-seat",
    what="🛑 **THE SLOT KEEPS ONLY THE LAST DECK'S CARD, WHICH IS EXACTLY WHAT TWO SEQUENTIAL MILLS WOULD HAVE PRODUCED** — the defect §7 drives by hand as the reason this is ONE op rather than two. `recordMoved` ASSIGNS, so a program spelling the sentence as two mills leaves one uid in `discarded`; this row reproduces that inside the single op. Both decks are still milled and both rows still print, so the board and the log are byte-perfect and only the number is halved: 190 where the sentence deals 330.",
    file=INT,
    find="      recordMoved(record, op.recordAs, filed);\n      return { done: milledState };\n    }",
    replace="      recordMoved(record, op.recordAs, filed.slice(-1));\n      return { done: milledState };\n    }",
    killers=[MINE, DMFS]),
  dict(id="D490-empty-deck-aborts-the-whole-walk",
    what="⚠️ **THE `continue` BECOMES A RETURN, so one empty deck cancels the OTHER player's mill.** This is the shape the pre-D490 arm really had — an early `return` on the zero-card path — and it was correct for a one-seat walk and is a live defect for a two-seat one. §8.6's *\"do as much as you can\"*: an attacker who has milled themselves out still mills the opponent, and the count still scores their card. The board where the ATTACKER's deck is empty deals 50 under the mutant and 190 under the build.",
    file=INT,
    find="        if (milled.length === 0) continue;",
    replace="        if (milled.length === 0) return { done: milledState };",
    killers=[MINE]),
  dict(id="D490-arm-order-swapped",
    what="⚠️ **THE TWO ANCHORS' ORDER PERMUTED, AND IT IS DECLARED `equivalent` RATHER THAN TESTED AROUND.** The pair is STRUCTURALLY disjoint in D468's sense: `BENCH_DISCARD_SCALED_BOOST` demands `^You may discard up to` and `EACH_DECK_MILL_SCALED_BOOST` demands `^Discard the top card of each player['’]s deck\\\\.`, both `^…$`, and the two disagree on a mandatory run of bytes at the same position — so NO string can match both and no input distinguishes the orders. D467's fork answered the other way: there is no lookahead here to delete, because none is needed, and writing one would be a vacuous guard by construction. 🛑 The declaration SELF-INVALIDATES (D427): the day either anchor is loosened at its leading literal, some string reaches both and this row reports `STALE-SURVIVOR`.",
    file=EFF,
    find="  const mill = EACH_DECK_MILL_SCALED_BOOST.exec(text.trim());\n  if (mill !== null) {",
    replace="  const mill = text.trim().startsWith(\"You may\") ? null : EACH_DECK_MILL_SCALED_BOOST.exec(text.trim());\n  if (mill !== null) {",
    killers=[MINE, BENCH],
    survives=dict(kind="equivalent",
      reason="STRUCTURAL disjointness, not guarded disjointness (D468). The two anchors are both `^…$` and disagree on a mandatory literal at position 0 — `You may discard up to ` against `Discard the top card of each player` — so no string matches both and pre-filtering the mill arm on the sibling's own leading words removes nothing. Measured over all 640 rows of `legalAttackCorpus()`: the two arms claim disjoint sets (2 and 1) under both orders. The row is kept rather than deleted because it goes STALE the day either anchor loosens its leading literal, which is the only change that could make the order observable.")),
]

def esc(x):
    return json.dumps(x, ensure_ascii=False)

out = []
for r in ROWS:
    lines = ["  {",
             "    id: %s," % esc(r["id"]),
             "    decision: \"D490\",",
             "    what: %s," % esc(r["what"]),
             "    file: %s," % esc(r["file"]),
             "    find: %s," % esc(r["find"]),
             "    replace: %s," % esc(r["replace"])]
    if "survives" in r:
        lines.append("    survives: {")
        lines.append("      kind: %s," % esc(r["survives"]["kind"]))
        lines.append("      reason: %s," % esc(r["survives"]["reason"]))
        lines.append("    },")
    lines.append("    expectKilledBy: [")
    for k in r["killers"]:
        lines.append("      %s," % esc(k))
    lines.append("    ],")
    lines.append("  },")
    out.append("\n".join(lines))

TAIL = "];\n"
assert s.endswith(TAIL), repr(s[-20:])
s = s[: -len(TAIL)] + "\n".join(out) + "\n" + TAIL
open(P, "wb").write(s.encode("utf-8"))
print("added", len(ROWS), "rows")
