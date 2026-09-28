import io, os, sys
P = "/home/jofre/projects/luminous_ui/packages/engine/src/effects.ts"
orig = open(P, encoding="utf-8").read()
before_lines = orig.count("\n")
ANCHOR_FIND = """const DEFENDER_CANT_ATTACK_NEXT_TURN =
  /^During your opponent['’]s next turn, the Defending Pokémon can['’]t (?:attack|use attacks)\\.$/;
"""
NEW = """// ── D495: the SAME defender lock behind the WINNING face of a coin ──
//
// "Flip a coin. If heads, during your opponent's next turn, the Defending
//  Pokémon can't attack."  — `censusAttackCorpus.ts` FILE LINE 250, ONE legal
// printing. The card id is NOT RESOLVABLE in this checkout (no local D1, D425), so
// the row is cited by corpus file line and by its printing count read off
// `legalAttackCorpus()` rather than by an invented id (D490).
//
// 🛑 D408 MEASURED THIS SENTENCE AND LEFT IT OUT, AND THE REFUSAL WAS A PRICE
// RATHER THAN AN EXPRESSIBILITY CLAIM — which is the only kind that expires
// quietly (D427/D477). It is written out verbatim in `bareAttackLock.test.ts` §5:
// *"OUT on the WITNESS rather than on the arm: this suite and both suites it sits
// between are deliberately SEED-FREE … One printing against a seed sweep and a
// fourth fixture is worse than the residue head it would be taken from."* Both
// halves of that price were re-derived at D495 and only ONE of them was real:
//   • the SEED half stands — a coin-gated board needs a known face, so the board
//     does NOT go in `bareAttackLock.test.ts`. It went in its own suite, and that
//     file's §5 seed-free rung is untouched;
//   • the FOURTH FIXTURE half does NOT — D452's file-local `cardPool` idiom
//     (`createGame({… cardPool: { ...FIXTURE_POOL, ...LOCAL } })`) keeps the
//     demonstrator out of `FIXTURE_POOL` entirely, so the pool size pin, the
//     eleven-deep `ids.length` ladder in `opponentResistanceBonus.test.ts` and
//     `clauseApostrophe.test.ts`'s derivable sweep (which iterates `FIXTURE_POOL`,
//     not the corpus) all stand still. The quoted price was one fixture too high.
//
// 🛑 THE 2² AXIS-SUBSTITUTION LATTICE, RUN IN BOTH DIRECTIONS, COMES OUT THE
// OPPOSITE WAY ROUND FROM D489/D490/D494 — and that is the whole warrant for a
// whole-sentence anchor here. Both axes substituted onto their nearest BUILT
// spelling that DIFFERS from the print (GATE → absent; CONSEQUENT → the gated
// prevent clause one screen up):
//
//   w=0  the print                                                    REFUSED
//   w=1  GATE absent      → corpus line 187, the bare lock            BUILDS
//   w=1  CONSEQUENT sub'd → corpus line 248, D142's gated prevent     BUILDS
//   w=2  both                                                        REFUSED  ←
//
// BOTH weight-1 points build and the weight-2 point does not, so there is no
// "prerequisite" half and no proper superset to compose from: every SEGMENT of
// this sentence is already claimed and only the COMBINATION has no reader. (The
// w=2 string is CONSTRUCTED, not printed — D440: a verdict over unprinted text is
// a claim about the READER, not about the pool.)
//
// ⚠️ FACE IS A VALUE IN THE GATE SLOT, NOT A THIRD AXIS (D494). The slot has three
// inhabitants — absent, `If heads,`, `If tails,` — and swapping heads for tails
// refuses on BOTH consequents, so the richness lives inside an axis already
// counted. SEAT (`your opponent's`/`the Defending Pokémon` ↔ `your`/`this
// Pokémon`) and VERB (`attack` ↔ `use attacks` ↔ `retreat`) are both INERT on the
// verdict (D491): all six GATE-present points refuse and all six GATE-absent
// points build, measured over the 2×2×3 sub-lattice.
//
// ⚠️ WHY `residue-census.ts` FILED THIS `OPAQUE`, MEASURED RATHER THAN GUESSED —
// and it is ONE CHARACTER. Deleting the gate prefix leaves *"during your
// opponent's next turn, …"* with a LOWERCASE `during`, which the anchor above
// refuses on sight; re-capitalising it builds. That is a deletion PLUS a case
// change — two separated points — and all three of the instrument's probes are
// single-region, so no probe it has can reach a built string. `OPAQUE` means
// UNCLASSIFIED, never EXPENSIVE (D463/D494), for the third slice running.
//
// D472's WIDENING MEASUREMENT, over all 640 corpus rows: the verb-widened form
// `can['’]t (?:attack|use attacks)` — the alternation the BARE anchor above
// carries, because the pool prints both spellings ungated — claims EXACTLY the
// same 1 sentence / 1 printing as the tight one. It buys nothing, so the tight
// spelling ships and the measurement is pinned as a rung rather than argued.
//
// DISJOINTNESS IS STRUCTURAL, NOT GUARDED (D467/D468), so the arm's position is
// legibility and no lookahead is owed — nor could one be killed if it existed.
// Against `DEFENDER_CANT_ATTACK_NEXT_TURN` above: both are `^…$` and disagree on a
// mandatory run of bytes at position 0 (`During` vs `Flip a coin.`). Against
// `FLIP_TAILS_SELF_CANT_ATTACK`: they disagree at `If heads,`/`If tails,` AND at
// `your opponent's`/`your`. No string can match two of them.
//
// TWO apostrophe slots, both classed (D136/D137), and the corpus bytes were read
// with `codePointAt` rather than by eye (D421/D440): U+0027 at indexes 43 and 82.
const FLIP_HEADS_DEFENDER_CANT_ATTACK =
  /^Flip a coin\\. If heads, during your opponent['’]s next turn, the Defending Pokémon can['’]t attack\\.$/;
"""
assert orig.count(ANCHOR_FIND) == 1, orig.count(ANCHOR_FIND)
out = orig.replace(ANCHOR_FIND, ANCHOR_FIND + NEW, 1)
assert out != orig
payload = out.encode("utf-8")
with open(P, "wb") as fh:
    fh.write(payload)
after = open(P, encoding="utf-8").read()
print("lines", before_lines, "->", after.count("\n"), "delta", after.count("\n") - before_lines)
assert after.count("const FLIP_HEADS_DEFENDER_CANT_ATTACK") == 1
print("OK")
