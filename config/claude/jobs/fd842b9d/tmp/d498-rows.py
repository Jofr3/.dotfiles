import io, os
p = "/home/jofre/projects/luminous_ui/scripts/mutation/mutants.ts"
src = open(p, encoding="utf-8").read()
before_lines = src.count("\n")

FIND = '  return surface().some(([, read]) => read(text) !== null);'

R1_WHAT = (
 "\U0001f6d1 A1 — **`.some` BECOMES `.every`, AND THE CENSUS'S RESOLUTION PREDICATE COLLAPSES FROM 529 "
 "SENTENCES TO ZERO.** `resolvedByAnyReader` is the predicate behind every residue and `BUILT.attack` figure "
 "in the repo and its whole body is this one line; measured by SPAN at `8934296b` — resolving all 2,424 "
 "`find` strings to line ranges — **it carried ZERO mutant rows**, while `surface()` twenty lines above it "
 "carried six (D497) and `attackReaderSurface()` carried none. Measured over all 640 corpus sentences × 13 "
 "readers = 8,320 calls: the shipped `.some` claims **529 of 640**, `.every` claims **0** — the "
 "claims-per-sentence histogram is 0:111, 1:526, 2:3, so no sentence is claimed by more than two of thirteen "
 "readers and the conjunction is empty by a mile. The raw unbuilt residue goes 111 → 640 and `BUILT.attack` "
 "loses its whole reader summand. ⚠️ **IT IS A ONE-SIDED DEFECT AND THE KILLER SET SAYS SO** (D438): a "
 "`resolvedByAnyReader(x) === false` rung is *more* true under it and cannot fire, so only a CLAIM-TRUE or a "
 "POPULATION rung can see it. MEASURED first failures: `extraEnergyBonus.test.ts` §1, a suite whose ONLY rung "
 "on this predicate is a `toBe(true)` — *expected false to be true* on `If this Pokémon has at least 2 extra "
 "Energy attached (in addition to this attack's cost), this attack does 80 more damage.`; and "
 "`censusAtHead.test.ts` at 10 failed / 40 passed, first at *the seven readers are wired — a control sentence "
 "DOES resolve*. ⚠️ Both instrument gates also die (`residue-census-gate` §A: *residue-census.ts says 1695, "
 "the suite pins 120*; `opaque-anatomy-gate` §C), through `scripts/residue-census.ts` — the only non-test "
 "consumer this predicate has. Its one-axis mirror is `D498-resolution-compares-against-undefined`"
)

R2_WHAT = (
 "\U0001f6d1 A2 — **THE SENTINEL BECOMES `undefined`, AND THE PREDICATE CLAIMS EVERY SENTENCE IN THE CORPUS.** "
 "This is the cascade `resolvedByAnyReader`'s own doc block names — *a name lookup that missed would yield "
 "`undefined`, and `undefined !== null` is TRUE … so a typo'd or renamed reader would make this predicate claim "
 "EVERY sentence and every census figure in the repo would move at once, upward, with nothing naming the cause* "
 "— authored at the COMPARISON instead of at the lookup the block rules out. D444 is the shipped incident: "
 "`deriveAttackTimingGate` enrolled itself by NAME, answered `undefined`, and 22 rungs across 5 files went red in "
 "one run. Measured over 8,320 calls: **`undefined` returns 0, `null` returns 7,788**, so every `null` is re-read "
 "as a claim and the count goes **529 → 640 of 640**; the raw residue goes 111 → 0. ⚠️ **ITS VISIBILITY IS "
 "THE EXACT COMPLEMENT OF A1's**: a `toBe(true)` rung stays green under it, so only a CLAIM-FALSE or POPULATION "
 "rung can fire. MEASURED first failures: `selfEnergyToHand.test.ts` D405 §1, a suite whose ONLY rung on this "
 "predicate is a `toBe(false)` — *expected true to be false* on `You may put all Energy attached to this "
 "Pokémon into your hand to have this attack do 80 more damage.`; and `censusAtHead.test.ts` at 8 failed / 42 "
 "passed, first at *every printed sentence in every backlog family is refused by ALL SEVEN readers*. ⚠️ "
 "`!== null` → `=== null` was MEASURED and DELIBERATELY NOT WRITTEN: it claims the same 640 of 640 over the same "
 "corpus and expresses the same observable defect, so it would be a second row of one experiment (D484/D475)"
)

R3_WHAT = (
 "\U0001f195 B1 — **THE STRICT COMPARISON GOES LOOSE (`!== null` → `!= null`), WHICH IS THE ONLY MUTATION OF "
 "THIS LINE THAT PRESERVES THE CLAIMED SET — AND IT SURVIVES.** Measured over all 640 corpus sentences × 13 "
 "readers = **8,320 calls: `null` 7,788, non-null 532, `undefined` ZERO** (532 against 529 claimed sentences is "
 "the known dual-claim population of 3, so the two figures cohere), and the two operators differ on exactly one "
 "value the population does not contain. Probed GREEN against `censusAtHead`, `extraEnergyBonus`, "
 "`selfEnergyToHand`, `damageSuppression`, `coinThreshold`, `discardHandDraw` and `ownBenchSnipe`, and GREEN "
 "through both instrument gates (`residue-census-gate` §A still 111 / 85 / 120; `opaque-anatomy-gate` "
 "byte-identical). \U0001f6d1 **AND THE ROW IS WORTH MORE THAN ITS VERDICT, BECAUSE THE MUTATION IS THE BETTER "
 "GUARD IN ONE DIRECTION AND THE WORSE ONE IN THE OTHER.** `!= null` would REFUSE an `undefined`-answering reader "
 "where the shipped `!== null` admits it — the doc block's hazard, caught. But the shipped predicate's "
 "catastrophic-upward failure is exactly what made D444's accident LOUD; under `!= null` a mis-enrolled reader "
 "contributes nothing, every census figure stands still, and the defect would be SILENT at this line — caught "
 "only by the `attackReaderSurface()` set rungs, which fire on ENROLMENT and not on a return value. ⚠️ "
 "`Boolean(read(text))` was MEASURED (0 falsy non-null returns in 8,320) and NOT WRITTEN: same 529, same reason, "
 "a second row of one experiment"
)

R3_REASON = (
 "unreachable-population over the READERS' RETURN VALUES rather than over printed cards: `!== null` and `!= null` "
 "differ on exactly one value, `undefined`, and no reader on the surface can produce it. Measured at D498 over "
 "all 640 legalAttackCorpus() sentences x all 13 attackReaderSurface() readers = 8,320 calls: null 7788, "
 "non-null 532, undefined 0. THE GUARANTEE LIVES AT THE 13 DECLARATION SITES AND NOT AT THIS LINE — every "
 "`export function deriveAttack*` in effects.ts declares `X | null` (13 of 13, read with `grep -n 'export "
 "function deriveAttack' packages/engine/src/effects.ts`), while surface() casts each one through `type Reader = "
 "(text: string) => unknown`, so this comparison has no type behind it whatsoever. FALSIFIER, executable and "
 "checked: the day a deriveAttack*-named export can answer `undefined` — an arm that falls through without "
 "returning, a widened return type, a 14th reader added under the reserved prefix — the two operators diverge on "
 "a real sentence, this row reports KILLED and the run fails STALE-SURVIVOR. ⚠️ This reason quantifies over a "
 "POPULATION, so a `--decision D498` probe is evidence of a DIFFERENT claim (D477); what establishes it is the "
 "8,320-call enumeration above plus `--only D498-resolution-admits-an-undefined-reader --full` over the whole "
 "suite, and only a whole-corpus sweep can show it surviving while its neighbours are killed around it."
)

def row(id_, what, replace, killers, survives=None):
    s  = "  {\n"
    s += '    id: "%s",\n' % id_
    s += '    decision: "D498",\n'
    s += '    what: %s,\n' % ts(what)
    s += '    file: "packages/engine/src/censusAttackCorpus.ts",\n'
    s += '    find: %s,\n' % ts(FIND)
    s += '    replace: %s,\n' % ts(replace)
    s += '    expectKilledBy: [\n'
    for k in killers: s += '      "%s",\n' % k
    s += '    ],\n'
    if survives:
        s += '    survives: {\n      kind: "%s",\n      reason: %s,\n    },\n' % (survives[0], ts(survives[1]))
    s += "  },\n"
    return s

def ts(v):
    return '"' + v.replace("\\", "\\\\").replace('"', '\\"') + '"'

HEADER = (
 "\n"
 "  // ── D498 · resolvedByAnyReader — the census's RESOLUTION PREDICATE ────────────────\n"
  "  //  A COVERAGE slice. D497 guarded `surface()` and left this line as named, priced\n"
  "  //  debt; measured by SPAN at 8934296b, with all 2,424 `find` strings resolved to line\n"
  "  //  ranges, `resolvedByAnyReader` (censusAttackCorpus.ts:814-816) carried ZERO rows.\n"
  "  //\n"
  "  //  \U0001f6d1 THE REGION IS THINNER THAN IT LOOKS, AND THE MEASUREMENT IS THE FINDING (D497).\n"
  "  //  Over all 640 corpus sentences the one-line body admits exactly THREE observable\n"
  "  //  behaviours — claim 0, claim 529 (shipped), claim 640 — and EVERY count-preserving\n"
  "  //  mutation of it is equivalent, measured: `!= null` and `Boolean(...)` both answer the\n"
  "  //  same 529 because 0 of 8,320 reader calls return `undefined` and 0 return a falsy\n"
  "  //  non-null. So D497's advice to aim rows at count-PRESERVING mutations has no target\n"
  "  //  here; there are three rows and the third is a declared survivor.\n"
  "  //\n"
  "  //  ⚠️ THE TWO KILLED ROWS ARE ONE-SIDED AND THEIR KILLER SETS SAY SO (D438). A boolean\n"
  "  //  predicate's witnesses split by POLARITY: measured over the 102 files that CALL it\n"
  "  //  (97 suites + 5 non-test files, 3 of which turn out to be prose only), there are 139\n"
  "  //  CLAIM-TRUE rungs, 98 CLAIM-FALSE rungs and 93 POPULATION folds; 12 files can see a\n"
  "  //  NARROWING only, 5 can see a WIDENING only, 79 see both and 6 see neither. A killer\n"
  "  //  set drawn from one polarity lets the other mutation live, so each row names an\n"
  "  //  axis-PURE suite first and `censusAtHead.test.ts` second.\n"
  "  //\n"
  "  //  ⚠️ AND THE SECOND CONSUMER IS NOT A SUITE. Outside the 97 test files the only real\n"
  "  //  call sites are `scripts/residue-census.ts` (4) and `scripts/residue-census-gate.ts`\n"
  "  //  (1); the hits in index.ts, registry.ts, effects.ts, testFixtures.ts and this file\n"
  "  //  are PROSE. Both `bun scripts/residue-census-gate.ts` and `bun\n"
  "  //  scripts/opaque-anatomy-gate.ts` were measured RED under A1 and A2 and GREEN under\n"
  "  //  B1 — an independent second killer for both rows, reachable only by `killedByCommand`,\n"
  "  //  which cannot coexist with `expectKilledBy`. Recorded here rather than lost.\n"
)

block  = HEADER
block += row("D498-resolution-demands-every-reader", R1_WHAT,
             "  return surface().every(([, read]) => read(text) !== null);",
             ["packages/engine/src/extraEnergyBonus.test.ts",
              "packages/engine/src/censusAtHead.test.ts"])
block += row("D498-resolution-compares-against-undefined", R2_WHAT,
             "  return surface().some(([, read]) => read(text) !== undefined);",
             ["packages/engine/src/selfEnergyToHand.test.ts",
              "packages/engine/src/censusAtHead.test.ts"])
block += row("D498-resolution-admits-an-undefined-reader", R3_WHAT,
             "  return surface().some(([, read]) => read(text) != null);",
             ["packages/engine/src/censusAtHead.test.ts",
              "packages/engine/src/extraEnergyBonus.test.ts",
              "packages/engine/src/selfEnergyToHand.test.ts"],
             survives=("unreachable-population", R3_REASON))

TAIL = "];\n"
assert src.endswith(TAIL), repr(src[-20:])
out = src[: -len(TAIL)] + block + TAIL
payload = out.encode("utf-8")           # ENCODE FIRST (D463)
assert len(payload) > len(src.encode("utf-8"))
with open(p, "wb") as fh:
    fh.write(payload)
after = open(p, encoding="utf-8").read()
print("lines %d -> %d (+%d)" % (before_lines, after.count("\n"), after.count("\n") - before_lines))
print("find occurrences in target:",
      open("/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus.ts",encoding="utf-8").read().count(FIND))
