import io

P = "packages/engine/src/index.ts"
FIND = """    INHERITED: see `shuffleHandDraw.test.ts` §7, which authors one more pin.) */
export const engineVersion = "0.378.0";"""

NEW = """    INHERITED: see `shuffleHandDraw.test.ts` §7, which authors one more pin.)
    \U0001f195\U0001f195\U0001f195 engineVersion 0.377.0 → **0.378.0** (D482 — THE WHOLE-SIDE SPREAD,
    `censusAttackCorpus.ts` **FILE LINE 572** (*"This attack does 30 damage to each of your
    opponent's Pokémon. (Don't apply Weakness and Resistance for Benched Pokémon.)"*),
    **1 sentence / 1 legal printing**, through ONE new anchor `SPREAD_EACH_OPPONENT_POKEMON`
    and ONE new `deriveAttackEffect` arm (6a-bis). Engine behaviour MOVED — a sentence that
    derived to `null` derives to `[{op:"damageDefender",amount:30},
    {op:"spreadDamage",target:"opponentBench",amount:30}]` — and it moved on **ZERO new
    vocabulary**: zero new `EffectOp` members, op FIELDS, op VALUES, readers (surface
    unmoved at 13), prompts, choices, events, error codes, registry rows, `FIXTURE_POOL`
    ids, `interpreter.ts` bytes, `redact.ts` bytes or `packages/schema` bytes.

    \U0001f6d1 **THE SLICE IS A PRICE CORRECTION, AND THE CORRECTED PRICE IS *ZERO OPS*.**
    D447 priced this row as *"a THIRD `spreadDamage.target` plus a §8.5 asymmetry between
    the Active and the Bench"*; `conventions.md` repeated it at D459 (*"D447 priced that row
    as a THIRD `spreadDamage.target` … both are true"*); D462's resume point repeated it a
    third time and added *"three mechanisms — if you take it, take it as two slices"*.
    **The printed sentence names two zones with two different §8.5 answers, and this engine
    has shipped one op for each of them since D189 and D316.** The ACTIVE half is
    `damageDefender`'s FLAT arm (`snipeActive`: attacker pre-W/R bonus → debuff → Weakness
    → Resistance → the target's reduction → §11 → the §8.1 survival clamp), which IS what
    *"apply Weakness and Resistance"* means for the body in the Active Spot; the BENCH half
    is `spreadDamage`, flat and W/R-free, which already owns every *"each of your opponent's
    Benched Pokémon"* printing in the column. **The asymmetry the price was for is the
    boundary between the two ops**, so the sentence is a two-op PROGRAM and not a third
    `target` member.

    ⚠️ **AND WIDENING THE OP WOULD HAVE COST AN INVARIANT RATHER THAN LINES.** 0.327.0
    above records *"D189's invariant survives. `spreadDamage` only ever touches `side.bench`,
    so it cannot move the actor off the Active Spot"* as the reason D425's own-side spread is
    safe, and continuous.ts leans on the same address twice (`installedReductionOf`'s *"all
    three interpreter damage sites are attack-only"*, and the `EffectContext` note that
    `snipeActive` and `spreadDamage` are different addresses). A third `target` reaching the
    Active falsifies that sentence in three files — against D425's own MEASURED price for
    widening this one op, **five mechanisms across 94 sites in 34 files**. **THE GENERAL
    SHAPE: A PRICE QUOTED AS "A NEW MEMBER ON OP X" IS A CLAIM THAT NO COMPOSITION OF
    SHIPPED OPS SPELLS THE SENTENCE, AND NOTHING IN THIS REPO EXECUTES THAT CLAIM.** It
    survived three re-statements over 35 decisions because each one copied the last.

    ⚠️ **THE ANCHOR IS NARROWER THAN ITS SIBLING ON PURPOSE, AND ONE OF THE TWO
    NARROWINGS IS LOAD-BEARING.** `SPREAD_EACH_BENCH` admits `(?:also )?` and captures the
    possessive; this one does neither. Measured over `legalAttackCorpus()`'s 640 sentences,
    **all four variants — narrow, wide-possessive, wide-"also", parenthetical-mandatory —
    claim the identical 1 sentence / 1 printing**, so by D472 the generality is unpaid risk.
    But the `also` axis is worse than unpaid: `attack.ts`'s `programDamage` is
    `program?.some((step) => step.op === "damageDefender")`, so this arm DROPS the printed
    base. That is right when the printed hit IS this op and is a **silent deletion of a whole
    main hit** on an *"also"* wording. **A wider anchor is normally pure risk; here it is a
    known wrong answer**, which is the sharper form of D472's rule and the first time this
    family has met it. The measurement is pinned in `boardWideSpread.test.ts` §1 rather than
    asserted here (D477: a deliberate refusal to generalise is a decision, and a decision
    owes an executable rung).

    `MATCH_RECORD_VERSION` **STAYS 29**, on BOTH of D463's tests: the serialized alphabet
    does not grow (this slice adds no member, field or value that could appear in a persisted
    program — both ops and every one of their field values already ship) and REACHABILITY
    (D450) is empty — `damageDefender` returns `{done}` unconditionally and `spreadDamage`
    *"NEVER PARKS"* by 0.327.0's own words, so neither can reach `phase.cont.pendingOp` or
    `rest`.

    ⚠️ **THE VERSION TAX, RE-MEASURED AT THIS HEAD AND IT HAS NEARLY DOUBLED SINCE THE
    LAST TIME ANYONE COUNTED IT.** The paragraph above forecast *"37 assertions / 41 sites"*
    for a successor of D459. At this head it is **57 assertions / 73 sites across 57 files**
    — 54 `expect(engineVersion).toBe(…)`, 3 `expect(manifest.version).toBe(…)`, **13 `it(…)`
    TITLES that spell the version** (a class the D459 count did not have at all),
    `packages/engine/package.json`, this declaration and D275's mutant `find`, re-pointed in
    the SAME edit. **The tax is not a constant and an inherited figure for it rots faster
    than the census literals do**, because every slice that authors a version pin raises it
    by one and no instrument reports the total. D482 authors one more, so a successor
    inherits **58 assertions**.) */
export const engineVersion = "0.378.0";"""

with io.open(P, encoding="utf-8") as fh:
    src = fh.read()
parts = src.split(FIND)
assert len(parts) == 2, "occurrences: %d" % (len(parts) - 1)
with io.open(P, "w", encoding="utf-8") as fh:
    fh.write(NEW.join(parts))
print("ok")
