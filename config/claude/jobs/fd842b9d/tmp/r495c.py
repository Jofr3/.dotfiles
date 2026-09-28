import io
p='docs/progress.md'
s=io.open(p,encoding='utf-8').read()
old_row='| simulator | P3 | 🚧 **M1–M3 + M4 done; M5 in progress** (latest: **P3-M5 — D494,'
i=s.index(old_row); j=s.index('\n',i)
new_row=('| simulator | P3 | 🚧 **M1–M3 + M4 done; M5 in progress** (latest: **P3-M5 — D495, *the '
 'defender attack lock behind the winning face of a coin, and a lattice shape no convention had '
 'predicted*: built by Hamming weight 0/1 · 2/2 · 0/1 — every segment already claimed, only the '
 'combination unread, the opposite of D489/D490/D494. `effects.ts` 110/0 pure addition, zero '
 'interpreter bytes. Version 29 on the serialized alphabet, derived at the hard address because the '
 'durated record is a persisted REQUIRED field. 🛑 And D142/D144/D148 each report "No mutants '
 'selected" — 19 legal printings executable by NOTHING for ~350 decisions**; engine 0.390.0, corpus '
 '2,401, check GREEN 481/10,969) |')
s=s[:i]+new_row+s[j:]
log_anchor='### 2026-09-10 — build session #434 (P3-M5 — D494)'
assert s.count(log_anchor)==1
ENTRY = r'''### 2026-09-10 — build session #435 (P3-M5 — D495)

**THE DEFENDER ATTACK LOCK BEHIND THE WINNING FACE OF A COIN — AND A LATTICE SHAPE NO CONVENTION HAD
PREDICTED.** Engine **0.389.0 → 0.390.0**, **`MATCH_RECORD_VERSION` 29 UNCHANGED**, mutation corpus
**2,391 → 2,401**, archive ratchet **164 → 165**, `bun run check` GREEN at **481 files / 10,969
tests**.

**(0) BUILD STATE.** Corpus **file line 250**, 1 printing: **REFUSED 0/13**, all four splitters null.
The bare lock (line 187, 3 printings) builds to `[{op:"preventAttack",target:"defender"}]`; the coin
gate builds with a status inside. **The whole `During your opponent's next turn,` family is 42
sentences / 151 printings, 27 built / 15 not** — the largest reachable group in the residue.

**(1) 🛑 THE LATTICE IS WEIGHT-1-ONLY, THE OPPOSITE SHAPE FROM D489, D490 AND D494.** Built by
Hamming weight: **0/1 · 2/2 · 0/1**. **Every segment of the print is already claimed and only the
COMBINATION has no reader**, where those three slices each had exactly one built point at *full*
weight. **So there is no prerequisite half and no proper superset to compose from** — a genuinely
different warrant for a whole-sentence anchor than *"no proper subset builds"*, and one no convention
had anticipated. ⚠️ **FACE is a VALUE, not an axis** (D494): the gate slot has three inhabitants and
`If tails,` refuses on both consequents, so a 2³ table would be the 2² table twice. **SEAT and VERB
are INERT** — all six gate-present points refuse, all six gate-absent points build.

**(2) ✅ THE ANCHOR BEAT THE COMPOSITION FOR THE FOURTH CONSECUTIVE SLICE, AND THIS TIME THE NUMBERS
ARE EQUAL.** Priced with the residue predicate **copied verbatim** from `censusAtHead.test.ts` and
validated against that suite's own pins: a whole-sentence anchor frees **1 / 1**, a general
coin-gate composition frees **1 / 1 — the same row**. The composition frees nothing the anchor does
not and costs a seam. ⚠️ **The builder also caught a parsing trap in its own tooling**: a naive
extraction of the registry sentences returned 17 entries including `"Leafage"` and `"unspellable"` —
**D430's grep-counts-text trap**, fixed by stripping comments first.

**(3) 🛑 MY COUNT WAS WRONG, AND THE PATTERN THAT MADE IT WRONG IS THE FINDING.** I briefed that
there were two coin-gated residue rows. There are **three**. The third is **invisible to a
`^Flip a coin\. If heads,` pattern because it opens `If tails,`** — *"Flip a coin. If tails, this
attack does nothing. If heads, during your opponent's next turn, prevent all damage…"* (2 printings)
— and `effects.ts:10711` already names it as a standing refusal. **The conclusion survived; the
enumeration did not.** **Enumerate a gated family by BOTH faces.**

**(4) ⚠️ AND MY BRIEF OMITTED THE SINGLE MOST IMPORTANT PIECE OF PRIOR ART.**
`bareAttackLock.test.ts` §5 carries a **named, explicit refusal for exactly this sentence**, with its
reason written out — and that reason is a **PRICE**, not an expressibility claim. **Re-derived, and
only half was real**: the SEED half stands (that suite pins a seed-free claim, so the board belongs
in a new file), but the **FOURTH-FIXTURE half was WRONG** — D452's file-local `cardPool` idiom keeps
the demonstrator out of `FIXTURE_POOL` entirely, so the pool-size pin, an **eleven-deep `ids.length`
ladder** and a derivable sweep all take a **ZERO** term. **The quoted price was one fixture too
high.** The witness was **re-pointed onto the OP by value**, keeping the twelve-way refusal a bare
`.not.toBeNull()` would have discarded.

**(5) 🛑 THE HEDGE CARRIED AGAIN — SIXTH TIME — WITH ITS LOCATION WRONG.** I hedged that
`preventAttack` *"may already be reachable through a gate from the REGISTRY side"*. It is reachable
**since D144**, from the **DERIVER**, arm 26, **one screen up in the same file**. D443's rule paid:
*"this would be the first X"* is a claim about a CLASS and must be checked as one.

**(6) `MATCH_RECORD_VERSION` 29 ON THE SERIALIZED ALPHABET, DERIVED AT THE HARD ADDRESS AND NAMED
FIRST.** The brief said this is the family where a bump can be forced, so the builder named the
address before arguing: **the durated record is `InPlayPokemon.attackLockedTurn`, a REQUIRED field
persisted directly in `MatchRecord.state`, every save, park or no park.** 🛑 **So D450/D452's
reachability argument is INAPPLICABLE ON ITS OWN** — it is about `EffectOp`s and says nothing about a
`GameState` field — and it is stated **second**, as the weaker half (D452: state both). The field is
**UNRESHAPED**, asserted as an **equality of two boards** (gated versus bare, same seed, same text
otherwise) rather than as a claim about code. **No bump owed, and nothing was contorted to avoid
one** — the alphabet argument would have failed loudly had the arm needed a new field, and the field
was checked first.

**(7) 🛑 THE ABSENCE FINDING IS THE BIGGEST ITEM, AND IT IS VERIFIED AT RITUAL TIME.**
`--decision D142`, `--decision D144` and `--decision D148` each print **"No mutants selected."**
**D142's gated-prevent family is 19 legal printings — the largest single mapping in D134's census —
and has been executable by NOTHING for ~350 decisions.** Every green sweep in that span said nothing
about it. **Declined here as scope, not difficulty**: 2–4 rows apiece, both arms `test`-only with no
captures, and `preventBlock.test.ts` / `tailsGatedOp.test.ts` already field seeded boards for both
faces, **so the killer sets are free.** 🆕 **The general rule: a family can be BUILT, GREEN and
CENSUS-COMPLETE while being executable by nothing**, and `--decision <D>` printing *"No mutants
selected"* is the cheapest audit in the toolkit — which nothing runs on a cadence.

**(8) DRIVEN, NOT ASSERTED.** Heads: coin row then lock row in printed order, filed on the
**defender's** seat and uid, stamped `state.turn + 1`, installer's own body untouched, §8 answering
`ATTACK_PREVENTED` on a **costless** index, **zero `ATTACK_EFFECT_SKIPPED`**. Tails: no lock, no
`ATTACK_LOCKED`, victim attacks freely, and **zero `ATTACK_EFFECT_SKIPPED`** because a tails is a
resolved attack, not a skipped effect (D134) — with the **ungated sibling on the same body** as the
control, so *"tails installs nothing"* cannot pass on a build where nothing installs. Expiry driven
**past** the boundary (D434). Retreat clears it; a Knock Out takes it out with the stack, asserted
unconditionally rather than behind an `if`. **Seeds were SEARCHED, never stubbed**, because the RNG
is part of what the file claims.

**(9) THE OBLIGATIONS, TRACED.** `withConsequence` **EMPTY** — one call site, inside
`if ("park" in stepped)`, and this program has no parking op; driven on **both faces**, because a
whiff is not a park (D465). `conditionNote` **also EMPTY**, and the brief was right to make the
builder look: it takes a `BoardCondition` and this program carries none — **the category argument
looks plausible only because the SIBLING arm emits a `conditionGate` whose `cond` does reach it**,
which is asserted at the rung. **`log.ts` RENDERED, not reasoned about** (D456), with **zero diff**.
🆕 **The honest limit recorded at the rung**: the `ATTACK_LOCKED` row says *"next turn"* with **no
mention of the coin**, so a reader who missed the flip row cannot tell a gated install from an
unconditional one — not false, and it is *why* no `log.ts` byte is owed.

**(10) ⚠️ A VACUOUS RUNG WAS DECLINED RATHER THAN SHIPPED.** The builder's first §11 shield draft set
a **made-up field** on the victim and **passed while asserting nothing** — D200's failure — caught by
**reading, not by a red run**. The shield is driven by a **registry** lookup a per-board `cardPool`
clone cannot inject. **The decline carries an executable falsifier**: every id in the deck is
asserted registry-free, so the day one gains a row the rung goes RED and names it.

**(11) 🆕 D463's EATEN-MINUS-SIGN TRAP DOES NOT FAIL LOUDLY — AND THE CONVENTION'S CORRECT FORM WAS
READ AND STILL GOT WRONG ON THE FIRST PASS.** A front-term splice whose marker *included* the `- `
produced `resolving.length - - 1 /*D495*/ 1 /*D494*/…`. **`git diff` looked plausible.** What
surfaced it was a **`PARSE_ERROR` in 8 files with 210 tests silently NOT COLLECTED, while the summary
still read "15 failed."** **After any front-term pass, check the COLLECTED-TEST count, not just the
failure count.**

**(12) NUMBERS.** `effects.ts` **110 / 0, PURE ADDITION**; **ZERO** bytes in `interpreter.ts`,
`continuous.ts`, `log.ts`, `turn.ts`, `types.ts`, `redact.ts` or `packages/schema`; **ZERO** new op
members, fields, values, readers (**13**), prompts, parks, events, error codes, `GameState` fields,
registry rows or `FIXTURE_POOL` ids. `BUILT.attack` **1611 → 1612**; residue **86/121 → 85/120**;
**`OPAQUE` 64/93 → 63/92**, with the instrument standing still, so per D465 the delta is about the
work. 🆕 **Why the row was `OPAQUE`, measured to ONE CHARACTER**: deleting the gate prefix leaves
*"**d**uring your opponent's next turn…"* — lowercase, refused by `^During` — and re-capitalising
builds, so the edit is a deletion **plus** a case change, two separated points against three
single-region probes. **`OPAQUE` means unclassified, never expensive — third slice running.** The two
steps **AGREE at 1 and 1**. Tax in four waves; **43 literals patched by LINE NUMBER** and verified by
**paired analysis**, every value netting exactly ±1. ✅ **Version tax 97 / 68 / 23, PREDICTED AT
97/68/23 BEFORE THE SUITE EXISTED** and landed exactly; `git grep` reads 94 / 67.

'''
s=s.replace(log_anchor,ENTRY+log_anchor,1)
io.open(p,'w',encoding='utf-8').write(s)
print('ok')
