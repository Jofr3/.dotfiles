import json
E = "packages/engine/src/effects.ts"
I = "packages/engine/src/interpreter.ts"
SUITE = "packages/engine/src/derivedBenchSearchMove.test.ts"
SELF = "packages/engine/src/derivedSelfEnergyMove.test.ts"

ROWS2 = [
 dict(id="D502-narrowing-admits-every-body", what=(
   "🛑 C14 — THE NARROWING IS MADE VACUOUS AT THE IMPLEMENTATION SEAT: the `stack` membership "
   "test becomes a length test every body passes, so `destRecorded` is read, the field is honoured in "
   "the type system, and `destinations` comes back UN-NARROWED. This is C6's defect from the other "
   "seat and it is written as a SEPARATE row because D453's rule is to count a family's rows by SEAT "
   "rather than by total: C6 is a row about the ARM that emits the field, this is a row about the code "
   "that reads it, and a producer-only corpus proves nothing about the reader.",
   ), file=I,
   find="          (refPokemon(state, ref)?.stack ?? []).some((uid) => filed.has(uid)),",
   replace="          (refPokemon(state, ref)?.stack ?? []).length >= 0,",
   killers=[SUITE]),

 dict(id="D502-narrowing-is-inverted", what=(
   "🛑 C15 — THE NARROWING IS INVERTED, so the Energy may go anywhere EXCEPT the body the search "
   "just benched. The polarity slip is the realistic one here because the shipped field this rider is "
   "the complement of — `discardPileRetrieval.exclude` — really does subtract a slot from a candidate "
   "set, so an author who reached for that precedent writes exactly this. ⚠️ IT IS INVISIBLE ON AN "
   "EMPTY BENCH IN THE OTHER DIRECTION FROM C6: there `destinations` comes back EMPTY and the op "
   "whiffs silently, so only §4's board — which fields a pre-existing Bench body — can see the Energy "
   "land on the wrong Pokémon rather than on none.",
   ), file=I,
   find="          (refPokemon(state, ref)?.stack ?? []).some((uid) => filed.has(uid)),",
   replace="          !(refPokemon(state, ref)?.stack ?? []).some((uid) => filed.has(uid)),",
   killers=[SUITE]),

 dict(id="D502-recordslot-forgets-the-search", what=(
   "🛑 C16 — `recordSlotOf` NAMES `drawCards` WHERE IT MEANT `searchDeck`, which is the slip an "
   "author makes reaching for the wrong recording op (`drawCards` carries a `recordAs` and is NOT in "
   "this list — checked). The omission is SILENT in exactly the way D206 named when it added "
   "`switchActive` as the sixth recorder: `withConsequence` simply drops the clause and the dialog "
   "describes half the card. 🛑 AND THE REGION HAD **ZERO MUTANT ROWS** BEFORE THIS ONE — a shipped "
   "seven-op list, span-audited against all 2,464 pre-existing rows, intersected by none (D452/D495: "
   "a family with no rows is indistinguishable from a family that passes).",
   ), file=I,
   find='    op.op === "searchDeck"\n    ? op.recordAs',
   replace='    op.op === "drawCards"\n    ? op.recordAs',
   killers=[SUITE]),

 dict(id="D502-describe-condition-falls-through-to-if-you-do", what=(
   "⚠️ C17 — THE PRINTED CONDITION IS LOST AND THE CAPTION SAYS *'If you do'*. The clause is "
   "printed LONG on this card (*'If you put any Pokémon onto your Bench in this way'*) exactly as it "
   "is on Ortega's, and `describeCondition`'s own rule is that the note is the printed text. A "
   "paraphrase in a dialog is not a wording preference: the player is told the consequence follows "
   "from the SEARCH rather than from a Pokémon actually landing, which is the misreading the printed "
   "*'any'* exists to prevent. 🛑 `describeCondition` ALSO HAD ZERO ROWS BEFORE THIS ONE.",
   ), file=I,
   find='  if (gate.contains === undefined && op.op === "searchDeck" && op.dest === "bench") {',
   replace='  if (gate.contains === undefined && op.op === "searchDeck" && op.dest === "hand") {',
   killers=[SUITE]),

 dict(id="D502-describe-condition-ignores-the-destination", what=(
   "⚠️ C18 — THE DESTINATION CONJUNCT GOES, so a `dest: \"hand\"` or `dest: \"deckTop\"` search "
   "with a `recordAs` and a gate would be announced as having *'put any Pokémon onto your Bench'*. "
   "That is the honesty guard `bottomFromOpponentHand`'s neighbouring arm carries for the same reason "
   "one line up, and it is DECLARED as a survivor rather than tested around: no printed sentence and "
   "no registry row pairs a non-Bench search with a §9.2 gate, so nothing can reach the difference. "
   "🛑 IT SELF-INVALIDATES (D427): the day one does, this row is KILLED and the run reports "
   "STALE-SURVIVOR by name. ⚠️ AND IT IS THE HONEST OUTPUT RATHER THAN A SEVENTH ROW — D497's "
   "rule: the region is thinner than it looks, so say so with the measurement instead of filling a "
   "quota.",
   ), file=I,
   find=' && op.op === "searchDeck" && op.dest === "bench") {',
   replace=' && op.op === "searchDeck") {',
   killers=[SUITE],
   survives=dict(kind="unreachable-population", reason=(
     "No printed corpus sentence and no registry row pairs a `searchDeck` carrying a `recordAs` with "
     "a `recordGate`, except this decision's own — and that one is `dest: \"bench\"`, so the dropped "
     "conjunct is true on every board the engine can reach. Measured over all 640 rows of "
     "`legalAttackCorpus()` and every `programFor(id)`: exactly ONE `searchDeck` carries a "
     "`recordAs`, and its `dest` is `\"bench\"`. The row is KILLED — and reports STALE-SURVIVOR — the "
     "day a hand or deck-top search gains one."))),

 dict(id="D502-describe-branch-forgets-the-move", what=(
   "🛑 C19 — `describeBranch`'s NEW ARM REFUSES ITS OWN OP: the guard's polarity is flipped, so "
   "the pinned move — the one destination that is NOT a second question and therefore the only one "
   "this clause may state flat — is the one shape it turns away. `describeBranch` answers `null`, "
   "`withConsequence` returns the prompt unchanged, and the search's dialog names a deck search while "
   "the answer silently decides whether an Energy moves. ⚠️ EVERY BOARD ASSERTION IN THIS FILE IS "
   "GREEN UNDER IT — the program is untouched — which is D473's finding in its purest form.",
   ), file=I,
   find='        if (op.destRecorded === undefined || op.route !== "selfToBench") return null;',
   replace='        if (op.destRecorded !== undefined || op.route !== "selfToBench") return null;',
   killers=[SUITE]),

 dict(id="D502-move-note-keeps-the-family-phrase", what=(
   "🛑 C20 — THE CAPTION OVERRIDE'S POLARITY IS FLIPPED, and it is wrong at BOTH ends at once, "
   "which is what makes it worth a row rather than a comment. THIS card's park goes back to reading "
   "*'to 1 of your Benched Pokémon'* over a dialog offering exactly ONE body — a caption promising a "
   "choice the prompt does not offer, on an attacker whose Bench holds another Pokémon (D421/D456: "
   "the test is not whether a row is stilted but whether it asserts something this path makes "
   "untrue). And EVERY shipped `selfToBench` printing — D229's eight, Castform's two — gets the "
   "PINNED phrase instead, which is why the killer set names the sibling suite as well as this one.",
   ), file=I,
   find='  if (op.destRecorded !== undefined) where = "from this Pokémon to the new Benched Pokémon";',
   replace='  if (op.destRecorded === undefined) where = "from this Pokémon to the new Benched Pokémon";',
   killers=[SUITE, SELF]),

 dict(id="D502-search-move-reports-nothing-moved", what=(
   "⚠️ C21 — `searchMove` REPORTS AN EMPTY MOVE while really moving the cards, so the §9.2 record "
   "is filed as `[]` on every search that succeeds and the printed *'if you put any Pokémon … in this "
   "way'* answers NO about a Pokémon that is standing on the Bench. The Bench, the deck and the "
   "`DECK_SEARCHED` row are all CORRECT under it — which is why this row sits on the function's "
   "RETURN rather than on its body: the three pre-existing rows in this span are about the bench "
   "clamp and the deck-top splice, and none of them could see a wrong `moved`.",
   ), file=I,
   find="  return { state: withSide(state, ctx.seat, updated), moved }; // searchMove",
   replace="  return { state: withSide(state, ctx.seat, updated), moved: [] }; // searchMove",
   killers=[SUITE]),
]
old = json.load(open("/home/jofre/.claude/jobs/fd842b9d/tmp/rows1.json"))
allrows = old + ROWS2
json.dump(allrows, open("/home/jofre/.claude/jobs/fd842b9d/tmp/rows.json","w"), ensure_ascii=False)
print(len(allrows), "rows total")
