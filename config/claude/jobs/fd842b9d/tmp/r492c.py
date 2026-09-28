import io
p='docs/progress.md'
s=io.open(p,encoding='utf-8').read()
old_row='| simulator | P3 | 🚧 **M1–M3 + M4 done; M5 in progress** (latest: **P3-M5 — D491,'
i=s.index(old_row); j=s.index('\n',i)
new_row=('| simulator | P3 | 🚧 **M1–M3 + M4 done; M5 in progress** (latest: **P3-M5 — D492, *the '
 'filtered whole-side spread, and a confident brief claim that was half false*: the W/R tail IS a '
 'blocker, and `residue-census.ts` could not see it because its CUT experiment asks whether a '
 'remainder BUILDS, never whether it COMPOSES. Two blockers, both rows carry both. D482\'s '
 'composition does not transfer — W/R and conditionality each kill it independently, on different '
 'boards. The `to each`/`for each` collision breaks on ONE BYTE, a Weakness ×2, not on board size. '
 '2 sentences / 4 printings, `COMPOUND-tail` now EMPTY**; engine 0.387.0, corpus 2,373, check GREEN '
 '478/10,895) |')
s=s[:i]+new_row+s[j:]

log_anchor='### 2026-09-08 — build session #431 (P3-M5 — D491)'
assert s.count(log_anchor)==1
ENTRY = r'''### 2026-09-10 — build session #432 (P3-M5 — D492)

**THE FILTERED WHOLE-SIDE SPREAD — AND MY CONFIDENT CLAIM THAT THE TAIL WAS NOT A BLOCKER WAS HALF
FALSE.** Engine **0.386.0 → 0.387.0**, **`MATCH_RECORD_VERSION` 29 UNCHANGED**, mutation corpus
**2,361 → 2,373**, archive ratchet **161 → 162**, `bun run check` GREEN at **478 files / 10,895
tests**.

**(0) BUILD STATE, BOTH ROWS.** All 13 `deriveAttack*` exports looked up by name off
`attackReaderSurface()` and run: **REFUSED 13 / 13** for both, all four splitters null, no registry
row. Corpus **file lines 616 and 539**, **2 sentences / 4 legal printings**. Apostrophes measured
U+0027 by `codePointAt`.

**(1) 🛑 THE TAIL IS A BLOCKER, AND THE INSTRUMENT COULD NOT SEE IT.** My brief stated, confidently,
that `residue-census.ts`'s CUT experiment proved the head was the whole of it — quoting its own
`CUT 🛑 does NOT build:` line. Measured: substituting the **FILTER alone** onto its nearest built
spelling gives *"This attack does 100 damage to each of your opponent's Pokémon. This attack's damage
isn't affected by Weakness or Resistance."*, and that is **REFUSED by all 13 readers and all four
splitters** — while **the same head under D482's PARENTHETICAL builds.** 🛑 **The CUT experiment runs
ONE DIRECTION ONLY: it asks whether the remainder BUILDS, never whether the remainder COMPOSES.**
The reason is D466's, re-measured: `splitAttackTrailingClause` requires the tail to be a
`deriveAttackEffect` clause, and a W/R suppression is a DAMAGE reader's. **Two blockers, and both
rows carry both** — a build on *"the head is the whole of it"* would have shipped an anchor that left
both rows in the residue.

**(2) THE 2⁵ LATTICE, IDENTICAL AT ALL 32 POINTS FOR BOTH ROWS.** Axes counted from the print, each
substituted onto its nearest BUILT spelling, with the pre-slice verdict **derived** as
`now && !NEW_ANCHOR.test(point)` (D491) rather than quoted. Weight 0: 0 built. Weight 1: **0 of 5**.
Weight 2: **1 of 10** — and that single point is **FILTER + TAIL together**. Weight 3: 2 of 10.
Weight 4: 1 of 5. Weight 5: 0 of 1. Per-axis flip counts over all 16 pairs: **`amount 0, form 4,
scope 0, filter 4, tail 4`** — **five axes, two of which do no work**, with SCOPE **DEGENERATE in
D491's sense** because the whole side has built since D482. **The two rows are one slice by
measurement** (D488), and building both cost what building one would have.

**(3) 612/613 DO NOT JOIN THE CLUSTER.** They are already BUILT via `deriveAttackDamageMultiplier`,
so they share the vocabulary and the noun and nothing else. **The preposition is a different seam** —
a fold at DECLARATION versus a spread inside the program.

**(4) 🛑 D482's COMPOSITION DOES NOT TRANSFER, AND BOTH REASONS KILL IT INDEPENDENTLY.** The brief
asked which one; the answer is both, on two different boards, and the suite runs each. **W/R**:
D482's Active leg is `damageDefender`'s flat arm *precisely because* W/R apply there
(`snipeActive(state, amount, false, …)`), and `damageDefender` carries no `ignoreWR` — the
composition reads **200 where the print reads 100**. **CONDITIONALITY**: `damageDefender` has no
filter and no predicate, so it damages a non-`ex` Active — **100 where the print reads 0**. What it
is instead: **`snipeTargets` + `placeSnipe` already do exactly this**, narrowing `oppAnyRefs` (Active
**and** Bench) by D483's `damageChosen.filter`, routing an Active ref through
`snipeActive(…, ignoreWR)` and every benched ref through the flat loop. **The only gap was the
printed *"each of"* — i.e. `count: number | "all"`**, with D361's `discardEnergy.count` and D441's
`moveEnergy.max` as the two precedents. `index.ts` 0.327.0's *"`spreadDamage` only ever touches
`side.bench`"* is untouched: that op gains nothing here.

**(5) ⚠️ THE COLLISION IS REAL AND IS BROKEN BY ONE BYTE, NOT BY BOARD SIZE.** On an Active `ex` with
**no Weakness** and no benched `ex`, *"does 60 damage **TO** each"* and *"does 60 damage **FOR**
each"* both answer `[60, 0]` — identical. **A Weakness ×2 on that same one-body board splits them 60
vs 120**; a benched matching body splits them `[60,60,0]` vs `[120,0,0]` with no Weakness at all. My
brief was right that this is the natural board a suite would write and wrong about the remedy: the
fix is a byte, not a bigger board. Ten candidate readings enumerated before any board was written;
**board M separates 6 of 10 numerically plus `count: 1` by shape (it PARKS) = 7**, with the remaining
three taking their own boards. Both built siblings are driven on the load-bearing board and still
answer their own numbers (480 and 360).

**(6) COST, AND TWO THINGS NO MECHANISM COUNT PREDICTED.** ONE anchor, ONE arm, ONE two-key shortlist
over the shipped `IN_PLAY_BODY_NOUNS`, ONE widened quantifier, ONE interpreter local, ONE
`cardplay.ts` conjunct. **ZERO** new `EffectOp`/`CardFilter`/`DamageCountSource` members, readers
(**13**), prompts, choice kinds, parks, events, error codes, `GameState` fields, registry rows,
`FIXTURE_POOL` ids, `redact.ts`/`packages/schema`/`log.ts` bytes — **the only engine-source deletions
in the whole slice are THREE LINES.** The two unpredicted costs: **`cardplay.ts:1143` would have
GREYED OUT A LEGAL ATTACK** (`programPlayable` refuses a `damageChosen` with an empty candidate set —
correct for a pick, a live afford-then-reject for an *"each of"* spread whose empty set is a silent
no-op), exempted with `op.count !== "all"` and, being unobservable in both directions today, kept
with the unobservability recorded at the site and **no mutant row written** (D446). And **the op's
NAME is now a lie** — *"each of"* opens no choice — with **the rename REFUSED ON THE ADDRESS** (D443:
the op kind is a byte inside `phase.cont.pendingOp`), carrying D443's own executable falsifier.

**(7) `MATCH_RECORD_VERSION` 29 ON D125's WIDENING, WITH REACHABILITY TRUE AND DELIBERATELY NOT THE
ARGUMENT.** The address **does** persist — `damageChosen` parks, so it rides `phase.cont.pendingOp`.
`count` is a **required** field gaining a new **inhabitant**, so every value a v29 writer could hold
there is a NUMBER and still names the arity it always named; there is no absent-key direction, so
D441's question does not arise. Reachability is also true (the only producer emits a length-one
program) **and was not used**, because that is a fact about today's arms rather than about the bytes
(D463; D450's *reachability alone reads as an excuse*). Driven both ways through `runProgram`.

**(8) THE DESCRIBER TRACE — EMPTY, SIXTH CONSECUTIVE SLICE.** `snipeNote` has exactly **one** caller,
inside the park branch of the `damageChosen` arm, and `count: "all"` makes `candidates.length <=
ceiling` unconditionally true so the forced branch is taken on every board. `describeBranch` /
`describeCondition` have one caller each, `withConsequence`, which needs `recordSlotOf(op)` defined —
and `damageChosen` is not among its seven ops.

**(9) ATTRIBUTION CONTROL AT BOTH LAYERS — D491's MAP REPRODUCES EXACTLY.** Two mutations by hand,
each restored in a `finally` with size and sha256 verified. Under the READER mutation: census green,
loud control green, value re-point **RED**, behavioural **RED**. Under the EXECUTOR mutation: census
green, loud control green, value re-point **green**, behavioural **RED**. Under **either** break the
sentence still reads, `resolvedByAnyReader` is still true, and the residue still falls by 2/4. The
map is written into the suite.

**(10) 🛑 A MECHANICAL-PASS FAILURE THE BUILDER CAUSED AND CAUGHT.** A repo-wide `toBe(24) →
toBe(28)` **over-patched 7 sites in 6 files** where exactly one was the census figure — and the
obvious repair **is not an inverse**: replacing the new value back also rewrote sites that
legitimately held 28, **breaking 9 pre-existing assertions in one command**. ⚠️ **The suite was GREEN
through the over-patch**; it was caught only by reading `git diff -U0`. Repaired line-by-line.
**Verified at ritual time by paired diff analysis: `toBe(24)` net −1 and `toBe(28)` net +1 — exactly
the one intended census step, with every other changed literal paired and coherent with +2 sentences
/ +4 printings.**

**(11) NUMBERS.** `BUILT.attack` **1605 → 1609**; reader-claimed **524/1555 → 526/1559**; raw unbuilt
**116/177 → 114/173**; residue **90/127 → 88/123**; **`OPAQUE` UNCHANGED at 65/94**. 🛑
**`COMPOUND-tail` IS NOW ZERO ROWS** — D466 named these two as its only members and this slice took
both. **The two steps DISAGREE (2 and 4)**, so `.length` chains take −2 and `units(…)` chains take
−4; **21 front terms across 9 files**, enumerated programmatically because three lines carry two
chains each and `grep -n` reports 18 (D491's count-matches-not-lines, reproduced). Tax in **four
waves** (20 → 13 → 7 → 4). ✅ **Version tax reported CORRECTLY for the second consecutive slice — 91
occurrences / 65 files / 20 `it(` titles**, against `git grep`'s **87 / 64**, short by exactly the
untracked suite's 4 / 1. ⚠️ **The history-exception list grew 2 → 4 and the edit itself authored two
of them** — D488's self-reference rule firing a fourth time. `it(` **+33 EXACT**, all in the new
suite, no other suite moving.

**(12) ⚠️ `patches LITERALLY` MOVED 21 → 22 AND WAS VERIFIED RATHER THAN ACCEPTED.** Re-derived
independently at ritual time: exactly **22** rows carry a `String.replace` special in their
`replace`, and exactly one is D492's — **`D492-anchor-takes-the-parenthetical-tail-instead`**. An
AUTHORED dependency, not D491's broken-row artefact. ⚠️ **The builder's report named the wrong row**
(`anchor-loses-its-terminator`): the conclusion was right and the citation was not.

**(13) WHAT WAS LEFT, PRICED.** The **`ignoreWR` over-reach** — the flag nulls the target's installed
reduction as well as W/R, and these rows print only the W/R half — is followed because corpus line
620 has derived it off the bare wording since D400; splitting it would move that row too and touch
~15 read sites for **0 printings today**, so it is deliberately **unpinned** (D429: a guard here
would defend the gap). **Measured consequence: D483's reduction-passive discriminator is unavailable
here**, so the suite separates the two by the **EVENT** instead. And **`residue-census.ts` still
calls a two-blocker row `COMPOUND-tail`** — the instrument gap this slice found and did not close.

'''
s=s.replace(log_anchor,ENTRY+log_anchor,1)
io.open(p,'w',encoding='utf-8').write(s)
print('ok')
