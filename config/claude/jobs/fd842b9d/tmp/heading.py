import io
p='/home/jofre/projects/luminous_ui/packages/engine/src/index.ts'
s=open(p,encoding='utf-8').read()
anchor="    \U0001f195\U0001f195\U0001f195 engineVersion 0.402.0 → **0.403.0** (D516 — THE DRAW COUNT THAT READS THE OPPONENT'S"
assert s.count(anchor)==1
HEAD = '''    🆕🆕🆕 engineVersion 0.403.0 → **0.404.0** (THE PRIZE-GATED PARALYSIS, AND THE FIRST
    `BoardCondition` THAT READS **YOUR OWN** PRIZE COUNT. `censusAttackCorpus.ts` **FILE LINE
    342** — *"If you have exactly 1 Prize card remaining, your opponent's Active Pokémon is now
    Paralyzed."*, **1 sentence / 1 legal printing**, claimed WHOLE by `deriveAttackEffect`
    through ONE new anchor (`SELF_PRIZE_GATE_PARALYZE`) and arm **6a-iii**, deriving
    `[{op:"conditionGate", cond:{kind:"yourPrizesRemaining", counts:[1]},
    then:[{op:"applyStatus", target:"defender", status:"paralyzed"}]}]`.
    🛑 **THE PRICE IS ONE ANCHOR, ONE ARM, ONE UNION MEMBER AND TWO EVALUATOR ARMS.**
    `BoardCondition` gains its **61st** member; `conditionHolds` and `conditionNote`
    (interpreter.ts) each gain the matching `case`, and BOTH are compiler-required — the two
    switches have no `default` and non-`undefined` return types, so a member without an arm is a
    BUILD ERROR rather than a silent blank. ZERO new `EffectOp` members, op FIELDS, op VALUES on
    shipped fields, readers (surface unmoved at 13), prompts, choice kinds, events, error codes,
    `CardFilter`/`DamageCountSource`/`AttackFlipCount`/`HandRefreshDraw` members, registry rows,
    `FIXTURE_POOL` ids, decks, `redact.ts` bytes or `packages/schema` bytes.
    🛑 **THE CONSEQUENT WAS ALREADY BUILT AND THE GATE WAS THE WHOLE BLOCKER, MEASURED RATHER
    THAN INFERRED.** Driven at the pre-slice head: the bare printed *"Your opponent's Active
    Pokémon is now Paralyzed."* (**21 printings**) already resolved through THIS READER to THIS
    `applyStatus` op, while the gated row resolved through NO reader, NO registry row, NO gate
    split and NO trailing split. The new arm's `then` is `deriveAttackEffect`'s own output for
    the bare sentence, byte for byte — `prizeGateParalyze.test.ts` §2 asserts that identity
    rather than re-typing the op.
    🛑 **`splitAttackGateClause` WAS NEVER LIVE ON THIS ROW, AND A PRE-SLICE BRIEF HAD IT
    BACKWARDS.** A leading `If …,` clause is not what that splitter reads: its vocabulary is a
    CLOSED FOUR-ENTRY list of printed TIMING clauses, matched WHOLE and terminated by `. `. This
    row's leading clause is in neither the list nor the shape, so the splitter answers `null` **by
    construction** — asserted across all sixteen lattice cells rather than once on the printed
    string. The row lands on the **READER** arm, which is also the arm all three of its BUILT
    prize siblings land on: corpus `:343` and `:353` through `deriveAttackDamageBonus`, `:350`
    through `deriveAttackRequirement`. **Zero of the four are gate-arm builds**, and the gate arm
    is re-measured unmoved at 5/13.
    🛑 **A FIFTH NAME FOR A FOURTH READING OF ONE PILE, AND THE ROAD NOT TAKEN IS PRICED.**
    `registry.ts`'s D207 block says outright *"TWO SPELLINGS EXIST AND THEY ARE NOT THE SAME
    NUMBER"*, and four readings ship at this head: `BoardCondition.opponentPrizesRemaining` (the
    OPPONENT's remaining), `DamageCountSource.opponentPrizesTaken` (`6 − remaining`),
    `MaxHpScale.opponentPrizesTaken` (that number in a third union) and
    `HandRefreshDraw.prizeCount` (the AFFECTED PLAYER's remaining — **the very number this row
    needs**, under `who:"you"`). Embedding the last was refused for D516's reason, RE-DERIVED
    rather than cited: **what D159 makes single is the WALK, never the union.** This member's walk
    is `conditionHolds(state, seat, cond) → boolean`, the ONE evaluator behind all three
    `BoardCondition` consumers; `handRefreshDrawCount` takes a DEALT-TO seat and answers a COUNT.
    A boolean is not a count and the two walks cannot express each other's question — §7 drives
    that rather than asserting it. `AttackFlipCount` and `MaxHpScale` both re-spell a shipped
    member under exactly that argument, in writing. **FIVE count vocabularies at this head, still
    ZERO embeddings.**
    ⚠️ **AND THE SEAT IS A MEMBER RATHER THAN A FIELD ON THE MEMBER ABOVE, WHICH IS THIS UNION'S
    OWN IDIOM MEASURED OFF THE LIVE DESCRIBER.** `BoardCondition` already spells SIX seat mirrors
    as separate members and carries ZERO seat FIELDS (`yourActiveDamaged`/`opponentActiveDamaged`,
    `yourActiveHasEnergyAttached`/`opponentActiveHasEnergyAttached`,
    `yourActiveHasToolAttached`/`opponentActiveHasToolAttached`,
    `yourActivePoisoned`/`opponentActivePoisoned`, `yourBenchAtLeast`/`opponentBenchAtLeast`,
    `yourStadiumInPlay`/`stadiumInPlay`); this pair is the SEVENTH. Adding `seat` to
    `opponentPrizesRemaining` would also be a RENAME with live consumers — two `registry.ts`
    authorings, three `CONDITIONAL_DAMAGE_CLAUSES` rows and the `refusedPrintings.ts` row that
    cites it by name — which D362 records as the opposite of a free widening. The `counts` LIST is
    copied from the twin byte for byte so the pair cannot drift on the one property its shape
    encodes: set MEMBERSHIP, never a threshold.
    ⚠️ **THE UNION CARRIES NO NEGATION, AND THAT WAS CHECKED BEFORE THE SHAPE WAS CHOSEN.**
    `:350` prints *"doesn't have exactly 3 or 4 …, this attack does nothing"* and stores
    `{counts:[3,4]}` POSITIVE — the requirement skeleton owns the negation — while `:353`'s
    *"4 or fewer"* is stored as the SATISFYING SET `[0,1,2,3,4]`. So a `not` member would have
    been a second way to spell one answer, and none is added.
    🆕 **A TWELFTH LATTICE SHAPE: A PRINTED POINT AT HAMMING DISTANCE 2 FROM AN ADJACENT PAIR,
    WITH BOTH MIDPOINTS DARK — TWO BLOCKING AXES, NOT ONE.** WRAP × SEAT × COUNT × CONSEQUENT
    read `0/1 · 2/8 · 0/8 · 2/8 · 2/8` before the build — **2 of 16**, 16/16 distinct strings,
    and the two predicates AGREE at every point (**0 divergent**, both splitters null at
    **16/16**, for the structural reason above). The built set was `0101` and `0111`: ONE
    ADJACENT PAIR, free along COUNT and walled on the other three. **The printed row sat two
    flips away — SEAT and CONSEQUENT — with `0100` and `0001` both dark**, which is what a
    conjunction of two blockers looks like and is why this slice costs a union member as well as
    an anchor. That is the opposite of D516's eleventh shape (distance 1 from an island on ONE
    live axis, priced as *a missing cell of a table*), and the difference is the whole content of
    the price. 🆕 **AND THE SHAPE CHANGES ACROSS ITS OWN SLICE** (D513's phenomenon, fourth
    occurrence): after the build it reads **3 of 16** with flips `3 · 1 · 3 · 3` — the pair gains
    a third, non-adjacent member, so COUNT RISES from 0/8 to 1/8 (it has started to matter) while
    each of the other three gains a lit neighbour. Both readings are recorded because only the
    pair shows which axes the slice actually spent (D491).
    🛑 **`:346` SHARES THIS GATE AND IS DELIBERATELY NOT BUILT, WITH ITS PRICE ON THE RECORD.**
    Corpus **FILE LINE 346** — *"If you use this attack when you have exactly 1 Prize card
    remaining, you win this game."*, 1 sentence / 1 legal printing — wants THIS member at THIS
    value. Two of its three pieces are now paid for: the GATE is built, and the WRAPPER
    (*"If you use this attack when …"*) is ONE anchor group and a family of exactly ONE at this
    head, measured over the column. **The third piece is a whole mechanism.** There is no win,
    game-end, victory, forfeit or concede op anywhere in `EffectOp` — established by walking every
    op name every producer in the repo emits, not by grep — so §14 would have to be reachable from
    a program for the first time. **THE REFUSAL IS WRITTEN AGAINST A FUNCTION AND DRIVEN AS AN
    EXECUTABLE FALSIFIER** (`prizeGateParalyze.test.ts` §8), which is D473's and D479's shape —
    both of which aged 42 and 37 decisions because they named what was MISSING rather than what
    was spelled.
    **`MATCH_RECORD_VERSION` STAYS 30, AND THE HARD DIRECTION IS MEASURED RATHER THAN ARGUED.**
    ⚠️ **DOES A `BoardCondition` REACH A PERSISTED ADDRESS AT ALL? YES — BUT ONLY THROUGH A
    PARK**, and the question is settled here either way rather than left implied. It is in no
    `GameState` field; the one door is `EffectContinuation` (`{pendingOp, rest}`) inside
    `MatchRecord.state.phase`, where `rest` holds every op AFTER the parking one — so a
    `conditionGate` is persisted the moment any authored list places it behind another op. The
    FORWARD direction is the shipped house call, made in `match.ts` at D384, D385, D387–D390 and
    D392: a new union member is D125's WIDENING, since *"no record can contain a member no deploy
    could author"* and a new member cannot re-interpret a stored one. The ROLLBACK direction is
    the one those slices did not owe and this one does: **the serialized ALPHABET GROWS**, because
    `{"kind":"yourPrizesRemaining"}` is a byte string no v30 deploy can write, so D452's *"this
    byte already ships"* out is NOT available and the claim rests on REACHABILITY (D450) alone —
    D516's situation exactly, one union over. **REACHABILITY IS EMPTY, MEASURED OVER EVERY
    PRODUCER**: `prizeGateParalyze.test.ts` §7 walks every `registryCardIds()` program object and
    every program `deriveAttackEffect` returns over the legal column, finds the member's ONE
    carrier, and asserts BOTH halves of the invariant — it sits at index 0 of its list, and it
    encloses no op that can park. A successor who appends one after a parking op, or puts a
    parking op in the gate's `then`, reddens that rung and owes the bump. Nothing else in the repo
    would notice.
    ⚠️ **THIS HEADING NAMES NO `D<nnn>` AND THAT IS DELIBERATE, NOT AN OMISSION** —
    D507/D508/D510/D512/D513/D514/D515/D516's posture, for their reason.
    `engineVersionChangelog.test.ts`'s ATTRIBUTION case asserts `adjudicated === LABELLED.length`
    with no tolerance, so a labelled heading without its `docs/decisions.md` row ships `check`
    RED, and this slice is scoped away from that file. **The debt is D517**: whoever writes
    `| **D517** | … engine 0.403.0 → 0.404.0 … |` should rewrite this heading's opening
    parenthesis as `(D517 — THE PRIZE-GATED…` in the same commit, and not before.
    🛑 **VERSION-TAX EXCEPTION LIST FOR THIS BUMP, NAMING THE HEADING BEING WRITTEN THIS SLICE
    (D506's rule (b)).** `0.403.0` legitimately survived at NINE lines outside `docs/` BEFORE this
    paragraph existed and at **FOURTEEN** after it — the five new ones are this heading's own
    source, its labelling-debt sentence, this sentence and the two lines below that quote the two
    header arrows. ⚠️ **THE COUNT AND THE MOMENT YOU TAKE IT ARE TWO CLAIMS (D488), so both are
    written here**, which is the practice D515 started and D516 confirmed. None of the fourteen
    may be swept: **THIS HEADING'S OWN SOURCE, one line up, plus this sentence and the
    labelling-debt sentence above it**; D516's heading TARGET below together with its own debt
    sentence and one line of its exception list (three lines);
    `handRefreshOpponentHand.test.ts`'s header arrow, which reads `0.402.0 → 0.403.0`;
    `prizeGateParalyze.test.ts`'s header arrow, which reads `0.403.0 → 0.404.0` and is this
    slice's own; `mutants.ts`'s D275 re-point ledger, which is APPENDED to rather than rewritten;
    and `D506-changelog-head-unnamed`'s `what`, `find` and `replace`, which are **RE-POINTED
    WHOLESALE onto the heading above rather than value-swept** — kept in D508's trimmed,
    label-proof form `engineVersion <old> → **<new>**`, **stopping before the `(`**, which D508,
    D510, D512, D513, D514, D515 and D516 have now each proved survives the caller's labelling.
    The sweep ran as a WHITELIST of SIX exact line shapes — **written out and counted BEFORE the
    edit and re-grepped after** — and never as a value-keyed grep, which is the mechanism that ate
    D500's heading. **THE ARITHMETIC, MEASURED ON BOTH SIDES.** The six classes counted
    `76 + 5 + 25 + 1 + 1 + 1 = 109` lines, and `109 + 9 = 118`, which was the whole-literal grep
    before the edit. Afterwards the INCOMING literal greps to **119** lines (the 109 swept sites,
    plus this slice's own new suite's `expect(engineVersion)` — already counted in the 109 — plus
    **TEN** lines no class covers, ENUMERATED rather than rounded: this heading's source, its
    labelling-debt sentence, three lines of this exception list, `prizeGateParalyze.test.ts`'s
    header arrow, `mutants.ts`'s D275 ledger, and `D506-changelog-head-unnamed`'s `what`, `find`
    and `replace`) and the OUTGOING one to **FOURTEEN**, enumerated above and nothing else. That
    is the check rather than the intention (D488).
    ⚠️ **AND `precheck` WAS RE-RUN AFTER EVERY `index.ts` EDIT** (it is not part of `check`).)
'''
s=s.replace(anchor, HEAD + anchor)
s=s.replace('export const engineVersion = "0.403.0";','export const engineVersion = "0.404.0";')
open(p,'w',encoding='utf-8').write(s)
print("heading+constant written")
