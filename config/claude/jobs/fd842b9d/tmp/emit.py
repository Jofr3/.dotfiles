import json
ROWS = json.load(open("/home/jofre/.claude/jobs/fd842b9d/tmp/rows.json"))

E = "packages/engine/src/effects.ts"
SUITE = "packages/engine/src/derivedBenchSearchMove.test.ts"
ARM_HOIST_FIND = "  match = ATTACK_BENCH_SEARCH.exec(effect);"
ARM_HOIST_REPLACE = (
    '  if (ATTACK_BENCH_SEARCH_THEN_MOVE.test(effect)) {\n'
    '    return [\n'
    '      { op: "searchDeck", filter: { kind: "basicPokemon" }, dest: "bench", max: 1, recordAs: "moved" },\n'
    '      { op: "shuffleDeck" },\n'
    '      // biome-ignore lint/suspicious/noThenProperty: the effect contract\'s gated-step list.\n'
    '      { op: "recordGate", slot: "moved", then: [{ op: "moveEnergy", filter: { kind: "anyEnergy" }, max: 1, route: "selfToBench", destRecorded: "moved" }] },\n'
    '    ];\n'
    '  }\n'
    "  match = ATTACK_BENCH_SEARCH.exec(effect);"
)
ROWS.append(dict(
  id="D502-anchor-read-before-the-head-search",
  what=(
    "⚠️ C22 — THE ORDER PERMUTATION, DECLARED. A copy of this decision's arm is hoisted ABOVE "
    "`ATTACK_BENCH_SEARCH`'s, which is the placement a successor would reach for by habit (the narrow "
    "arm first). It SURVIVES, and the kind is D468's STRUCTURAL disjointness rather than D467's "
    "guarded kind: both anchors are `^…$` and they disagree on a mandatory run of bytes at the same "
    "position — `BENCH_SEARCH_TAIL` demands the string END after *'shuffle your deck.'* where this one "
    "demands eleven more words — so NO STRING CAN MATCH BOTH and no guard exists or should. "
    "🛑 THE PAIR IS THE CLAIM (D467): the ORDER is legibility and the TERMINATOR is behaviour, and "
    "the behavioural half is `D230-anchor-drops-the-tail`, whose own `what` names THIS printing as its "
    "witness. The shipped order is what keeps that true: read the head anchor first and a `$`-less "
    "`BENCH_SEARCH_TAIL` claims this sentence and drops its §9.2 tail, which "
    "`derivedBenchSearchMove.test.ts` §2 reddens on; hoist this arm and the D230 mutation goes INERT on "
    "the one card it cites."
  ),
  file=E, find=ARM_HOIST_FIND, replace=ARM_HOIST_REPLACE, killers=[SUITE],
  survives=dict(kind="equivalent", reason=(
    "STRUCTURAL disjointness (D468's kind, stated because the verdict column cannot preserve it): "
    "`ATTACK_BENCH_SEARCH` is `^…onto your Bench\\. Then, shuffle your deck\\.$` and "
    "`ATTACK_BENCH_SEARCH_THEN_MOVE` is `^…shuffle your deck\\. If you put any Pokémon…\\.$`, so a "
    "string matching either cannot match the other and dispatch order changes no answer. No guard "
    "exists and correctly none does — one would be unkillable by construction. ⚠️ IT SELF-INVALIDATES: "
    "the day either anchor loses its terminator, or either is generalised so the two overlap, the two "
    "orders answer differently and this row is KILLED, which the run reports as STALE-SURVIVOR."))))

def lit(s: str) -> str:
    return json.dumps(s, ensure_ascii=False)

out = []
for r in ROWS:
    what = r["what"]
    if isinstance(what, tuple):
        what = "".join(what)
    out.append("  {")
    out.append(f'    id: {lit(r["id"])},')
    out.append('    decision: "D502",')
    out.append(f'    what: {lit(what)},')
    out.append(f'    file: {lit(r["file"])},')
    out.append(f'    find: {lit(r["find"])},')
    out.append(f'    replace: {lit(r["replace"])},')
    out.append(f'    expectKilledBy: {json.dumps(r["killers"], ensure_ascii=False)},')
    if "survives" in r:
        out.append("    survives: {")
        out.append(f'      kind: {lit(r["survives"]["kind"])},')
        out.append(f'      reason: {lit(r["survives"]["reason"])},')
        out.append("    },")
    out.append("  },")
block = "\n".join(out)

P = "/home/jofre/projects/luminous_ui/scripts/mutation/mutants.ts"
s = open(P, encoding="utf-8").read()
assert s.rstrip().endswith("];")
tail = "];\n"
idx = s.rindex("];")
header = (
  "  // ────────────────────────────────────────────────────────────────────────────\n"
  "  // D502 — THE DECK SEARCH THAT ENERGISES WHAT IT BENCHED (Jynx `sv06-046`,\n"
  "  // `censusAttackCorpus.ts` FILE LINE 440, 1 sentence / 1 legal printing).\n"
  "  //\n"
  "  // BY SEAT (D453): 14 PRODUCER-side rows on `effects.ts` (the anchor and the arm)\n"
  "  // and 8 IMPLEMENTATION-side rows on `interpreter.ts` (the narrowing, the record\n"
  "  // filing, `recordSlotOf`, `describeCondition`, `describeBranch`, `moveNote`,\n"
  "  // `searchMove`). Four of those interpreter regions had ZERO rows intersecting\n"
  "  // them by SPAN across all 2,464 pre-existing rows, which is the absence half of\n"
  "  // D452/D495 rather than a coverage claim.\n"
  "  //\n"
  "  // THREE CANDIDATE ROWS WERE DECLINED WITH THEIR MEASUREMENT RATHER THAN WRITTEN\n"
  "  // (D440/D475/D497 — a mutation that cannot change an answer is not a weak row, it\n"
  "  // is not a row):\n"
  "  //   · the WHIFF path's `recordMoved(record, op.recordAs, [])` — `recorded()`\n"
  "  //     defaults an ABSENT key to `[]`, so filing the empty array and not filing it\n"
  "  //     are the same input to `recordGateHolds`. The line is kept because it is the\n"
  "  //     family's convention and because it is what a SECOND recorder on the slot\n"
  "  //     would need; it is unobservable today and the site says so.\n"
  "  //   · the resume arm's `searched.moved` vs `choice.uids` — `validateChoice` proves\n"
  "  //     every answered uid was OFFERED and the bench clamp is applied upstream in\n"
  "  //     `stepOp`, so no board reachable through the action API separates them.\n"
  "  //   · `stack.includes(uid)` vs `stack[0] === uid` — the recorded uid IS the bottom\n"
  "  //     card on every board this sentence reaches, and nothing inside one program\n"
  "  //     can evolve the body between the park and the resolve.\n"
)
s = s[:idx] + header + block + "\n" + s[idx:]
open(P, "wb").write(s.encode("utf-8"))
print("appended", len(ROWS), "rows")
