import io
p='docs/progress.md'
s=io.open(p,encoding='utf-8').read()
old_row='| simulator | P3 | 🚧 **M1–M3 + M4 done; M5 in progress** (latest: **P3-M5 — D490,'
i=s.index(old_row); j=s.index('\n',i)
new_row=('| simulator | P3 | 🚧 **M1–M3 + M4 done; M5 in progress** (latest: **P3-M5 — D491, *"Each '
 'player draws 3 cards.", and the axis that decided it was the one nobody named*: the 2⁴ lattice × 13 '
 'readers split on exactly ONE axis — the CLAUSE FORM — where SCOPE and MOOD are inert and COUNT is '
 'degenerate. The recorded price did not survive re-derivation: this is a both-seats draw, not an '
 'opponent draw, and there was no park/no-park call to make. The refusal in source was not wrong, it '
 'was answering a different question. The deck-out rule cost zero engine change. 1 sentence / 1 '
 'printing, `SUBST-4` now an EMPTY class**; engine 0.386.0, corpus 2,361, check GREEN 477/10,862) |')
s=s[:i]+new_row+s[j:]

log_anchor='### 2026-09-08 — build session #430 (P3-M5 — D490)'
assert s.count(log_anchor)==1
ENTRY = r'''### 2026-09-08 — build session #431 (P3-M5 — D491)

***"EACH PLAYER DRAWS 3 CARDS." — AND THE AXIS THAT DECIDED IT WAS THE ONE NOBODY NAMED.*** Engine
**0.385.0 → 0.386.0**, **`MATCH_RECORD_VERSION` 29 UNCHANGED**, mutation corpus **2,349 → 2,361**,
archive ratchet **160 → 161**, `bun run check` GREEN at **477 files / 10,862 tests**.

**(0) BUILD STATE, OFF THE RIGHT ORACLE.** All 13 `deriveAttack*` exports run programmatically on the
printed string: **13 / 13 null**. All four splitters null, verbatim. No registry row. Corpus row
confirmed at **file line 199, 1 printing**, from `legalAttackCorpus()`. After the build,
`deriveAttackEffect` answers `[{op:"drawCards",count:3,who:"eachPlayer"}]` and **the other twelve
still refuse**.

**(1) 🛑 THE LATTICE SPLIT ON EXACTLY ONE AXIS, AND IT WAS NOT ANY OF THE THREE THE BRIEF NAMED.**
Sixteen points × 13 readers: **all EIGHT that keep the FINITE CLAUSE are refused, all EIGHT bare
imperatives build.** **SCOPE is INERT** — *"Your opponent draws 3 cards."* is refused as flatly as
the print, so the engine has an opponent-draw *op* and **no reader has ever read a sentence into
it**. **MOOD is INERT** — both *"may"* forms refused. **COUNT is DEGENERATE, not an axis at all**,
because *"Draw 3 cards."* has built since M4, so substituting it changes nothing on either side of
the split. **The deciding axis is the CLAUSE FORM**: a spelled subject with a third-person inflected
verb, against the bare imperative every built draw prints. ⚠️ **A fifth axis was looked for and
reported UNAVAILABLE rather than invented** — the subject noun has no nearest-BUILT both-seats
spelling to substitute onto, so it cannot be varied independently of SCOPE. The lattice is pinned as
a **computation, not a memory**: the pre-slice verdict is derived as `now && !ANCHOR.test(point)`,
with a rung asserting the two points the new anchor claims are exactly the two that moved.

**(2) 🛑 THE RECORDED PRICE DID NOT SURVIVE RE-DERIVATION, AND ITS CENTRAL FRAMING WAS WRONG.** It
read *"a mandatory opponent draw (`opponentMayDraw` ships but is a MAY, parks, and the opponent
answers — separable on any board where they decline) plus a six-file witness re-point and a
park/no-park design call."* **This is not an opponent draw; it is a BOTH-SEATS draw.**
`opponentMayDraw` is registry-only, ships on one card, parks with a decider, and **no anchor reads a
sentence into it** — so the *"separable on any board where they decline"* argument is about a
sentence this row is not. **There was no park/no-park call to make**: the sentence is mandatory and
nothing parks on any board, driven on four including two empty decks. ✅ **The "six-file witness
re-point" survived exactly.**

**(3) 🛑 AND THE TRIPWIRE AUDIT WAS EMPTY FOR THE SECOND SLICE RUNNING.** All 2,349 pre-existing rows
enumerated **from the module** (not by grep) and needled across `id`/`decision`/`what`/`file`/`find`/
`replace`/`survives`: *"Each player draws"* **0**, *"player draws"* **0**, *"draws 3 cards"* **0**.
**Zero rows rest on the refusal** — D478's loop closing the same way twice. ⚠️ **But D491 sharpens
the finding: the refusal in source was NOT WRONG, it was ANSWERING A DIFFERENT QUESTION.**
`opponentMayDraw`'s doc says *"Deliberately NOT a rider on `drawCards`: that op is fully automatic
and seat-fixed to the controller, and every one of its call sites relies on both."* Both halves are
still true **of the shape it refuses** — a MAY answered by the other player needs a park, and a
parking rider breaks *fully automatic*. **D450's shape exactly: a doc block that refuses a SHAPE has
refused that shape, not the axis.** Corrected in place, dated, with the surviving half named.

**(4) WITNESS LOAD — 6 FILES / 9 OCCURRENCES, ALL SENTENCE-QUOTING, NONE AMORTISING.** A raw grep
found 9 files; two are the corpus and the fixture file and one is **prose inside a comment**, not a
witness. **Five of the six hold the string as an `ATTACK_EFFECT_SKIPPED` attribution control**,
printed on four `FIXTURE_POOL` cards purely so a *"nothing was skipped"* rung has a neighbour that
does skip — **D462 predicted this slot by name for this exact string, and was right.** All six
witnesses and all four fixtures re-pointed onto *"Heal 100 damage from 1 of your Benched Ancient
Pokémon."*, chosen because it is **DATA-blocked** (the `Ancient` banner is a per-printing fact
`cardSchema` has no column for) and so cannot be built by any reader at any width (D461 rule 2).
Each site asserts the specimen **IS a row of `legalAttackCorpus()` at its committed printing count**,
not a byte pin — D452/D490's phantom-specimen rule applied.

**(5) THE DECK-OUT ANSWER, CITED — AND MY EXPECTATION THAT IT WOULD BE THE SLICE'S CONTENT WAS
WRONG.** It cost **zero engine change**. §5.1:130-134 and §14:640-649 make deck-out a **turn-start**
check, and `flow.ts:61-68` reads only the seat whose turn is **starting**. Driven: drawing 3 from a
1-card deck draws **1** per seat independently; an **empty** deck emits **no `CARDS_DRAWN` row at
all**; **an attacker who decks themselves out does NOT lose**, because the guard never looks at them;
and **when both deck out the DEFENDER loses**, the sudden-death clause not applying because the two
are not simultaneous. 🛑 **Sharper than the brief's version: an attack ENDS THE TURN, so the
defender's draw step lands INSIDE THE SAME ACTION** — pinned by event order (effect draws and the
§8.5 hit precede `TURN_ENDED`, which precedes `GAME_OVER{reason:"deckOut"}`) with a deep-deck control
so the rung cannot pass on a build that ends the game on every attack.

**(6) ⚠️ A TRAP THE BRIEF DID NOT NAME, AND IT COST A RED ROUND.** That same turn-start draw files a
**third** `CARDS_DRAWN` inside the action, so a bare row count reads `["p1","p2","p2"]` and **passes
a build that walks the seats either way**. Every draw claim in the suite filters on
`reason: "effect"`.

**(7) ORDERING RESOLVED BY D490's EMITS-PER-ITERATION TEST, NOT BY PICKING A PRECEDENT.** The two
shipped precedents disagree — `counterEachAll` walks absolute `SEATS`, `handRefresh` walks
controller-first. `counterEachAll` emits one event per **BODY** (so seat order is not row order);
this op and `handRefresh` emit one `CARDS_DRAWN` per **SEAT**, so seat order **is** the log's order →
**controller-first**, in a `switch` with an explicit `case undefined` (a ternary drops a third member
silently — D447/D490). 🛑 **The killing rung attacks from p2's chair**, where controller-first reads
`["p2","p1"]` and absolute reads `["p1","p2"]`, with a p1-chair control asserting the two readings
genuinely agree there.

**(8) THE LOG VOICE IS FREE, BUT BY A DIFFERENT ROUTE THAN THE BRIEF GUESSED.** `CARDS_DRAWN` has
**no `actor` field at all** — `{type, seat, uids, reason}`. `log.ts` files `row(event.seat, …)` with
segments carrying no subject, and `viewLog.ts` maps each row to `you`/`opponent` **per viewer**. So a
both-seats draw gets correct second-player wording for **zero `log.ts` bytes**, and it cannot render
the wrong voice for either player.

**(9) THE DESCRIBER OBLIGATION — EMPTY, TRACED NOT ASSERTED.** `withConsequence` has one call site
and needs `recordSlotOf(op)` defined **and** a `recordGate` on that slot in the queue; the executable
half is that `drawCards` cannot park on any board, including both empty-deck boards, driven from
both chairs. **Fourth consecutive slice where a brief predicted describer work and it was empty.**

**(10) `MATCH_RECORD_VERSION` 29 — AND THE ARGUMENT IS NEITHER OF THE LAST TWO SLICES'.** Not
reachability (**false here**: `drawCards` does reach storage, inside `recordGate.then` behind
`payFromHand`'s park, asserted in the suite) and not no-carrier. It is **D125's widening + D441's
absent-key DIRECTION**: a v29 continuation lacks the key, and lacking it means the controller alone,
which is what every v29 writer meant. Driven both ways on a reconstructed v29 record replayed through
the real interpreter: the old shape deals three cards to p1 and **nothing** to p2 (one row); the new
key on the same board deals to both (two rows, six cards).

**(11) THE ATTRIBUTION CONTROL, AT TWO LAYERS — AND IT NAMES WHICH LAYER EACH WITNESS COVERS.** Arm
broken to its nearest wrong sibling, restored in a `finally`, size **and** sha256 verified on both
files. Under the **reader** mutation: `censusAtHead` and all five re-pointed loud controls **GREEN**,
`optionalDraw` RED, behavioural suite RED. Under the **executor** mutation: everything green **except
the behavioural suite** — including `optionalDraw`. **So the census and the loud controls are blind
to both layers, the value re-point covers the READER only, and only the behavioural suite covers the
EXECUTOR.** D490-ii demonstrated again, this time against the value re-point D438 says to prefer.

**(12) NUMBERS.** `BUILT.attack` **1604 → 1605**; resolved **523/1554 → 524/1555**; raw residue
**117/178 → 116/177**; `residueSentences` **91/128 → 90/127**; **`OPAQUE` UNCHANGED at 65/94**,
because the row that left was `SUBST-4` and **`SUBST-4` is now an empty class**. ⚠️ The sentence and
printing steps **AGREE at 1 and 1**, measured, so `.length` and `units(…)` sites take the same term.
Tax in **three waves (18 → 10 → 1)**; the front-term pass found **21 across 8 files** by counting
**matches, not lines** (three lines carry two chains each, so `grep -n` reported 18/9); **wave 3 was
one site because D458 NAMED it** — `RAW_UNBUILT_ATTACK_UNITS`, which seven consecutive slices had
stepped as a `toBe(N)` while missing the bare arithmetic operand. `Math.round` numerator **derived by
intersection and UNMOVED at {24}**. ✅ **Version tax reported CORRECTLY for the first time: 88
occurrences / 64 files / 19 `it(` titles** with the untracked-inclusive command, against `git grep`'s
**86 / 63** — the builder named its command and honoured D489's rule rather than repeating D490's
mistake. ⚠️ **The exception list grew from 4 to 6 because the edit itself authored two** (the new
suite's header arrow and D491's changelog heading) — D488's self-reference rule firing a third time.
`it(` **+33 EXACT** (32 new suite + 1 `optionalDraw`).

**(13) WHAT THE BUILDER GOT WRONG, REPORTED.** It injected a **double-step in a mechanical census
pass** — two substitution rules in one loop where one rule's output was the next rule's input — so
one line was stepped twice and gained a duplicated comment. Caught by re-reading the patched lines
and repaired. **A mechanical pass whose replacement set is not closed under its own output is a pass
that can apply twice, and `git diff` will not flag it because the line still looks stepped.**

'''
s=s.replace(log_anchor,ENTRY+log_anchor,1)
io.open(p,'w',encoding='utf-8').write(s)
print('ok')
