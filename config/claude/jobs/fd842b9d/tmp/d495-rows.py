P = "scripts/mutation/mutants.ts"
src = open(P, encoding="utf-8").read()
assert src.rstrip().endswith("];")

ANCHOR_FIND = (
  "const FLIP_HEADS_DEFENDER_CANT_ATTACK =\n"
  "  /^Flip a coin\\\\. If heads, during your opponent['\u2019]s next turn, "
  "the Defending Pok\u00e9mon can['\u2019]t attack\\\\.$/;"
)
ARM_HEAD = "  if (FLIP_HEADS_DEFENDER_CANT_ATTACK.test(effect)) {\n"
ARM_FULL = (
  ARM_HEAD
  + "    return [\n"
  + "      {\n"
  + '        op: "coinFlipGate",\n'
  + "        // biome-ignore lint/suspicious/noThenProperty: `then` is the effect contract's "
    "gated-step list, not a thenable (arrays are not callable).\n"
  + '        then: [{ op: "preventAttack", target: "defender" }],\n'
  + "      },\n"
  + "    ];\n"
  + "  }"
)

SUITE = "packages/engine/src/flipDefenderAttackLock.test.ts"
BARE = "packages/engine/src/bareAttackLock.test.ts"
CENSUS = "packages/engine/src/censusAtHead.test.ts"
EFF = "packages/engine/src/effects.ts"

ROWS = [
  dict(
    id="D495-gate-dropped-lock-lands-unconditionally",
    what="\U0001f6d1 C1 \u2014 **THE COIN GOES AND THE LOCK LANDS ON EVERY SWING**: the arm returns the BARE program, so a printing the card gives a 50% chance of stopping turns the opponent 100% of the time. This is the build a slice that read the bare arm and stopped looking actually ships \u2014 it is `DEFENDER_CANT_ATTACK_NEXT_TURN`'s own return statement, verbatim, one arm over (D190b: a mutant is a neighbouring arm's REAL code). \u26a0\ufe0f **SILENT IN EVERY CENSUS FIGURE**: the sentence still resolves, `BUILT.attack` is unmoved, the residue is unmoved, and `resolvedByAnyReader` is still true \u2014 only a BOARD on the losing face can see it, which is what \u00a74 is",
    file=EFF,
    find=ARM_FULL,
    replace=ARM_HEAD + '    return [{ op: "preventAttack", target: "defender" }];\n  }',
    killers=[SUITE],
  ),
  dict(
    id="D495-gated-lock-loses-its-seat",
    what="\U0001f6d1 C2 \u2014 **D143's OWN ARM COPIED INSIDE THE GATE**: `target` is dropped, so the printed *\"your opponent's next turn\"* installs on the INSTALLER's own body at `state.turn + 2`. D408 caught exactly this on the UNGATED anchor (`D408-defender-lock-loses-its-seat`) and the gated arm is a fresh address for it \u2014 the coin still flips, the `ATTACK_LOCKED` row is still filed, and the victim plays freely through a turn it is printed to be barred from. \u26a0\ufe0f SILENT IN EVERY CENSUS: the sentence resolves either way",
    file=EFF,
    find=ARM_FULL,
    replace=ARM_FULL.replace('{ op: "preventAttack", target: "defender" }', '{ op: "preventAttack" }'),
    killers=[SUITE, BARE],
  ),
  dict(
    id="D495-gate-gains-ontails",
    what="\U0001f6d1 C3 \u2014 **THE FACE IS INVERTED**: `onTails: true` is added, so the lock lands on the LOSING flip. D144's sibling arm one screen up carries that exact field and this file has FOUR heads-gated arms that must not, so copying the neighbour is the mistake an author makes here (`D317-coin-gate-reads-the-losing-face` and `D355-energycoin-gains-ontails` are the same defect at two other addresses). \u26a0\ufe0f The board looks entirely normal on a heads flip \u2014 nothing installs and nothing is skipped \u2014 so only a PAIR of boards, one per face, separates it",
    file=EFF,
    find=ARM_FULL,
    replace=ARM_FULL.replace('        op: "coinFlipGate",\n', '        op: "coinFlipGate",\n        onTails: true,\n'),
    killers=[SUITE],
  ),
  dict(
    id="D495-arm-emits-the-neighbours-op",
    what="\u26a0\ufe0f C4 \u2014 the neighbouring arm's REAL op copied verbatim: `preventRetreat` where `preventAttack` belongs. Both are opponent-seat locks installed by a sentence carrying `during your opponent's next turn,` and both write one field on one body, so nothing about the arm's SHAPE objects \u2014 only a board does. `D410-pronoun-lock-installs-the-attack-lock` is this same swap in the opposite direction, one family over",
    file=EFF,
    find=ARM_FULL,
    replace=ARM_FULL.replace('{ op: "preventAttack", target: "defender" }', '{ op: "preventRetreat" }'),
    killers=[SUITE],
  ),
  dict(
    id="D495-anchor-loses-its-caret",
    what="\u26a0\ufe0f C5 \u2014 the `^` goes, so any sentence ENDING in this one is claimed and its leading matter is silently dropped. The `^` end and the `$` end of an anchor fail differently (D464): a LEADING near miss stays on the loud path and a rung can assert it, which is why this row's killer is the prefix refusal and not a board",
    file=EFF,
    find=ANCHOR_FIND,
    replace=ANCHOR_FIND.replace("/^Flip a coin", "/Flip a coin"),
    killers=[SUITE],
  ),
  dict(
    id="D495-anchor-loses-its-terminator",
    what="\u26a0\ufe0f C6 \u2014 the `\\\\.$` goes, so the anchor stops demanding that the sentence END where the print ends and claims the TRUNCATED string as well. \u26a0\ufe0f **The rung that kills this is the TRUNCATION and not a trailing compound** \u2014 D464's finding: once a sentence derives, `splitAttackTrailingClause` composes `\u27e8it\u27e9. \u27e8claimed tail\u27e9` for free, so a `$`-end refusal written as a trailing near-miss would go RED on its first run",
    file=EFF,
    find=ANCHOR_FIND,
    replace=ANCHOR_FIND.replace("attack\\\\.$/;", "attack/;"),
    killers=[SUITE],
  ),
  dict(
    id="D495-anchor-widens-the-verb",
    what="\U0001f6d1 C7 \u2014 **THE D472 WIDENING, INSTALLED AS A TRIPWIRE**: the verb becomes the `(?:attack|use attacks)` alternation the UNGATED sibling carries, because the pool prints both spellings ungated and copying the neighbour looks like completeness. Measured over all 640 corpus rows the wide form claims **exactly the same 1 sentence / 1 printing** as the tight one \u2014 so it buys nothing and costs a program for a sentence nobody prints (D472: a wider anchor that claims the same rows is pure risk). \u26a0\ufe0f **THIS ROW EXISTS SO THE NEXT SLICE THAT CONSIDERS THE WIDENING FINDS IT BY GREPPING FOR THE CODE LINE** rather than for a decision number (D493)",
    file=EFF,
    find=ANCHOR_FIND,
    replace=ANCHOR_FIND.replace("can['\u2019]t attack\\\\.$/;", "can['\u2019]t (?:attack|use attacks)\\\\.$/;"),
    killers=[SUITE],
  ),
  dict(
    id="D495-anchor-drops-the-possessive-apostrophe-class",
    what="\u26a0\ufe0f C8 \u2014 `['\u2019]` collapses to a bare `'` on the POSSESSIVE slot, so the sentence falls silently off the built set under a punctuation-normalising re-ingest. \U0001f6d1 **`clauseApostrophe.test.ts` CANNOT SEE THIS ROW** \u2014 its derivable sweep iterates `FIXTURE_POOL` and this slice's demonstrator is a per-board `cardPool` clone, so the file-wide re-ingest guard has no subject here. The killing rung is the slice's own U+2019 pair in \u00a71, written BECAUSE this row would otherwise have been UNKILLABLE-AS-WRITTEN (D479)",
    file=EFF,
    find=ANCHOR_FIND,
    replace=ANCHOR_FIND.replace("your opponent['\u2019]s next turn", "your opponent's next turn"),
    killers=[SUITE],
  ),
  dict(
    id="D495-anchor-drops-the-contraction-apostrophe-class",
    what="\u26a0\ufe0f C9 \u2014 C8's twin on the OTHER slot: `can['\u2019]t` becomes `can't`. Two rows and not one, because the slice's own rung varies the two slots SEPARATELY (D427: a near miss that differs on more than one axis tests neither), and because a class kept on one slot and lost on the other is exactly what a hand edit produces",
    file=EFF,
    find=ANCHOR_FIND,
    replace=ANCHOR_FIND.replace("can['\u2019]t attack", "can't attack"),
    killers=[SUITE],
  ),
  dict(
    id="D495-census-built-attack-not-stepped",
    what="\u26a0\ufe0f C10 \u2014 the census constant is put back to its pre-slice value while the arm stays. This is the row that proves the CENSUS moved for this build rather than the suite merely agreeing with itself \u2014 the live sum is derived from the readers over the committed corpus, so a stale constant is the one thing that cannot be true at both heads",
    file=CENSUS,
    find="  attack: 1612,",
    replace="  attack: 1611,",
    killers=[CENSUS],
  ),
]

def esc(s: str) -> str:
    return s.replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\\n")

out = []
for r in ROWS:
    killers = "".join(f'      "{k}",\n' for k in r["killers"])
    out.append(
        "  {\n"
        f'    id: "{r["id"]}",\n'
        '    decision: "D495",\n'
        f'    what: "{esc(r["what"])}",\n'
        f'    file: "{r["file"]}",\n'
        f'    find: "{esc(r["find"])}",\n'
        f'    replace: "{esc(r["replace"])}",\n'
        "    expectKilledBy: [\n" + killers + "    ],\n"
        "  },\n"
    )
new = src.rstrip()[:-2] + "".join(out) + "];\n"
open(P, "wb").write(new.encode("utf-8"))
print(f"appended {len(ROWS)} rows")
