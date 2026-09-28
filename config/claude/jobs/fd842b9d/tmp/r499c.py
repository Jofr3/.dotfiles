import io
p='docs/progress.md'
s=io.open(p,encoding='utf-8').read()
old_row='| simulator | P3 | 🚧 **M1–M3 + M4 done; M5 in progress** (latest: **P3-M5 — D498,'
i=s.index(old_row); j=s.index('\n',i)
new_row=('| simulator | P3 | 🚧 **M1–M3 + M4 done; M5 in progress** (latest: **P3-M5 — D499, *the cancel '
 'and the shield on ONE coin*: a THIRD lattice shape (`0/1 · 1/3 · 0/1` — a PREREQUISITE HALF, so the '
 'blocker is the JOIN), a 57-decision refusal overturned because every clause was true of its CARRIER '
 'and false of the engine, and a mutant that SURVIVED 482 files / 11,001 tests on a 373-decision span '
 'absence — the row kept, the suite fixed. The two-reader idiom does NOT transfer, because both '
 'readers spend `rngState`. 1 sentence / 2 printings**; engine 0.391.0, corpus 2,439, check GREEN '
 '482/11,002) |')
s=s[:i]+new_row+s[j:]
log_anchor='### 2026-09-11 — build session #438 (P3-M5 — D498)'
assert s.count(log_anchor)==1
ENTRY = r'''### 2026-09-11 — build session #439 (P3-M5 — D499)

**THE CANCEL AND THE SHIELD ON ONE COIN — A THIRD LATTICE SHAPE, A 57-DECISION REFUSAL OVERTURNED,
AND A MUTANT THAT SURVIVED 11,001 TESTS.** **The loop is back to building sentences.** Engine
**0.390.0 → 0.391.0**, **`MATCH_RECORD_VERSION` 29 UNCHANGED**, corpus **2,427 → 2,439**, declared
survivors **47 → 48**, archive ratchet **168 → 169**, `bun run check` GREEN at **482 files / 11,002
tests**.

**(0) BUILD STATE.** Corpus **file line 268**, 2 printings: **REFUSED 13/13**, all four splitters
null. ⚠️ **And the two halves are not constructed spellings — they are printed corpus rows**: the
heads consequent is **line 249 at 15 printings** and the bare cancel is **line 267 at 16**.

**(1) 🛑 A THIRD LATTICE SHAPE, AND MY PREDICTION OF D495's WAS WRONG.** Built-by-weight
**`0/1 · 1/3 · 0/1`**: exactly one point builds, at **weight 1**, reached by **deleting the cancel
arm** — and that arm's complement is a printed 15-printing corpus row. **So there IS a prerequisite
half**, unlike D495's *every-segment-builds*, and it is not D489/D490/D494's *one built point at full
weight* either. **The blocker is the JOIN — a seam question, which is why the answer was a coin
member rather than an anchor.** A fourth candidate axis was **DEGENERATE** (the heads consequent's
nearest built spelling *is* its printed value), so a 2⁴ table would have been the 2³ twice. Direction
2: cancel held, heads consequent varied over six printed alternatives — **all six build alone, none
builds with the cancel in front, all six mirrors refuse.**

**(2) 🛑 A 57-DECISION REFUSAL OVERTURNED, AND THE DISPROOF IS ONE QUESTION.** D142's block listed
this row LOUD (*"a SECOND consequent on the same flip"*), four suites carried it, and one called it
*"a durable witness rather than a treadmill"*. **Every clause is TRUE of `deriveAttackEffect` and
FALSE as a claim about the engine** (D456/D457): that reader's program runs at the **tail**, after
§8.5, so an `otherwise` **cannot retract damage already dealt** — while the carrier that can is
`deriveAttackCoinFlip`, read ~1,000 lines earlier, **in front of §8.5**. **The question that
disproves it: which carrier is read AT THE SEAM the rule resolves at?** ✅ **And because the refusal
was carrier-scoped, FIVE shipped `toBeNull` witnesses stayed green and armed** — which is exactly
what a correctly-scoped refusal buys.

**(3) 🛑 THE TWO-READER IDIOM DOES NOT TRANSFER, AND THE REASON IS A RESOURCE.** D493/D494 shipped
sentences claimed by two readers because `attack.ts` broadcasts `effect`. Here **both readers consume
`state.rngState`**, and `attack.ts` runs both blocks unconditionally — so a dual claim spends **two
rng steps and emits two `ATTACK_EFFECT_COIN_FLIP` rows for one printed flip**, and the faces could
disagree. **Before reaching for that idiom, ask what each reader SPENDS.** Driven: post-swing
`rngState` is **byte-identical to the bare cancel's on the same seed, on both faces**, exactly one
flip row, **seeds searched, never stubbed**.

**(4) WHAT SHIPPED.** One anchor, one new `AttackCoinFlip` member `cancelOnTailsElseProgram { ops }`
— **two members rather than an optional rider**, because the payload is asymmetric and a **required**
field makes a lost payload a compile error rather than a silent no-install (D440 as D460 applied it)
— one `if` at the flip site, `printedFlips()` converted from a ternary to a **total `switch`**
(D474's rule at the function it was written about), and a third exception in `coinExplainsModifier`.

**(5) 🛑 A MUTANT SURVIVED 482 FILES / 11,001 TESTS — A REAL SUITE HOLE.** The first probe returned
**1 GAP**, and `--only … --full` **discriminated it** (D455) rather than a narrow killer set being
blamed. `ATTACK_COIN_CANCEL`'s `^` had **ZERO rows intersecting it by SPAN for 373 decisions**,
measured over all 2,427 pre-existing `find`s **by span, not by name** (D453). **The row was NOT
tuned; the SUITE was** — D496's pattern on its second use — and the re-probe is 11 killed · 1 known ·
0 GAP.

**(6) `MATCH_RECORD_VERSION` 29 ON THE SERIALIZED ALPHABET, ADDRESS NAMED FIRST.**
**`InPlayPokemon.attackBlock`**, a `GameState` field persisted **directly** in `MatchRecord.state`
with **no park in front** — so D450's reachability is the wrong shape and is stated **second** as the
weaker half. `{"op":"preventDamage","effects":true}` is what line 249's 15 printings already write
inside a `coinFlipGate.then`, and the record is `{"turn":3,"effects":true}` **either way**, driven
against the sibling sentence on the same seed. **No bump owed, none contorted around.**

**(7) OBLIGATIONS.** `describeBranch`/`describeCondition` **empty**, traced to their single call site;
`conditionNote`'s seven call sites all take a `BoardCondition` and this slice produces none.
**`log.ts` is BYTE-IDENTICAL to HEAD** and both rows were **rendered** rather than reasoned about
(D456), with the honest limit recorded at the rung: no row states the damage-before-install ordering,
so §5 pins the **event sequence** instead.

**(8) ⚠️ THREE OF MY CONFIDENT CLAIMS WERE WRONG AND BOTH MY HEDGES CARRIED** — D487's pattern, not
D494's inverse. The **lattice shape**; *"the largest reachable row left"* (it is **tied** at 2
printings with three others, harmless); and the **family split**, which I gave as 27 built / 15 not.
**Verified at ritual time: 42 / 151 with 31 built / 11 unread now, so 30 / 12 pre-slice** — each half
wrong by 3, **and they summed to 42, which is exactly what hid it.**

**(9) STALE FIGURES CORRECTED AT THEIR SITES, NOT IN PROSE.** `effects.ts`'s D126 block and
`coinFlipDamage.test.ts` said the bare cancel is **11 printings** (it is **16**); D142's block said
the gated prevent is 11 (it is **15**) and called line 268 *"(1 —…)"* (it is **2**). All measured on
the local 978-card pool before the legal column was committed — **dated, not deleted** (D413's two
populations).

**(10) LEFT, PRICED.** `coinExplainsModifier`'s new exception has **no mutant row, deliberately** —
the two printings' damage markers are unresolvable in this checkout and `parseAttackDamage` yields no
modifier on any board buildable here, so the mutation is **unobservable today** and a row would
survive for a reason indistinguishable from equivalence (D420/D442/D446). Same for
`program = [...ops]`. Both recorded at the guard.

'''
s=s.replace(log_anchor,ENTRY+log_anchor,1)
io.open(p,'w',encoding='utf-8').write(s)
print('ok')
