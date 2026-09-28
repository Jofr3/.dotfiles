# D495 — work order

## The target

**1 sentence / 1 legal printing, in the `During your opponent's next turn,` family:**

> *"Flip a coin. If heads, during your opponent's next turn, the Defending Pokémon can't attack."*

## What I measured at `de45a90b` — re-verify every cell; treat it as a hypothesis

| string | verdict |
|---|---|
| the target | **REFUSED 13/13**; `splitAttackGateClause` and `splitAttackTrailingClause` both `null` |
| *"During your opponent's next turn, the Defending Pokémon can't attack."* (the bare lock) | **BUILDS** → `[{"op":"preventAttack","target":"defender"}]` |
| *"Flip a coin. If heads, your opponent's Active Pokémon is now Paralyzed."* | **BUILDS** → `[{"op":"coinFlipGate","then":[{"op":"applyStatus",…}]}]` |
| `splitAttackGateClause` on **any** coin-gated string, including ones that build | **`null`** |

🛑 **So both halves ship, the composition is representable in the op language** (`coinFlipGate.then`
is an `EffectOp[]`, and `preventAttack` is an `EffectOp`) **— and only the reader is missing.**

⚠️ **And the gate family is ANCHOR-based, not splitter-based**: the splitter returns `null` even for
coin-gated sentences that build today. **Do not assume that is an oversight** — check whether it is
the family's design (D493 found exactly that for suppression tails, at four addresses).

## 🛑 This is the FOURTH consecutive slice with this shape, and that is the question worth asking

D492, D493, D494 and now this row all reduce to *"two shipped halves, a representable composition,
and no reader."* Each time the answer was a whole-sentence anchor, and each time the general
composition path measured **0/0** on its own.

**So measure it again rather than assuming either way.** How many residue rows are
*"Flip a coin. If heads, ⟨something that builds⟩"*? I count **two** coin-gated residue rows, and the
other is a **copy-attack** whose inner half is itself unbuilt (`BLOCKED-COPY-ATTACK`) — so my count
of what a general gate-composition frees is **1**, the same as an anchor. **Derive that yourself**;
if I am right, the anchor wins on cost and you should say so with the numbers.

## What you must do FIRST

1. **Build state programmatically** for every string in my table, plus the whole
   `During your opponent's next turn,` family. Report 13/13 and all four splitters verbatim.
2. 🛑 **THE AXIS-SUBSTITUTION LATTICE, BOTH DIRECTIONS** (D489-i, D492, D493, D494). Substitute each
   axis onto its nearest **BUILT** spelling. **Count the axes from the PRINT**, and ⚠️ **check each
   for DEGENERACY before listing it** — D494's predicted fourth axis turned out to be a capture on
   an anchor that already builds, and a 2⁴ table would have been the 2³ table reported twice. **And
   check whether an apparent extra dimension is an AXIS or a VALUE.**
3. 🛑 **PRICE EACH BRANCH ALONE AS WELL AS TOGETHER** (D493, re-earned at D494). Two slices running,
   *every* branch freed 0/0 alone and only the whole freed anything. **Use the canonical residue
   predicate copied verbatim from `censusAtHead.test.ts`** (D430) — D494's hand-rolled one
   over-counted the residue by 9 sentences, and I reproduced that error today before catching it.
4. 🛑 **GREP THE MUTANT CORPUS FOR THE ROW WHOSE `replace` IS ANY WIDENING YOU CONSIDER.** Two
   consecutive slices found `D409-tail-guard-widened-to-any-reader` — the composition seam, verbatim,
   with its defect in its own `what`. **The needle is the code line, not a decision number.** Run the
   tripwire audit over all 2,391 rows from the module.
5. **Witness load, counted and divided**, each site classified predicate-held or sentence-quoting.
   🛑 **Verify every quoted specimen IS a row of `legalAttackCorpus()`** at its committed count.
   ⚠️ **And a sentence grep will not find predicate-held controls** (D465/D494) — the runner will.

## The design questions

1. **New anchor, or widen an existing coin-gate anchor?** D472's discipline: measure whether the
   wider spelling claims any sentence the tight one does not, over all 640 rows. If they claim the
   same set, ship the tight one and keep the measurement as a rung.
2. **Does a durated op inside `coinFlipGate.then` behave?** The lock is a **continuous effect with a
   lifetime**, not an instant. Drive: the gate on heads and on tails, the lock's expiry, and what
   happens if the Defending Pokémon leaves play before the duration ends. ⚠️ **`preventAttack` may
   already be reachable through a gate from the registry side — check before claiming this is its
   first gated producer.**
3. 🛑 **`MATCH_RECORD_VERSION` — THIS IS THE FAMILY WHERE A BUMP CAN ACTUALLY BE FORCED.** D487
   measured that a bump is only forced where a repair **RESHAPES a durated record**, and this row is
   a durated effect inside a persisted gate. **Re-derive at the hard address, say WHICH argument you
   use, and do not reach for no-carrier reflexively** — D494 had to use two different arguments at
   two addresses and said so. If the honest answer is that a bump *is* required, say that and price
   it; do not contort the design to avoid one.

## Obligations

- **THE DESCRIBER: trace the call site.** Empty for eight consecutive slices — but ⚠️ **D494 found
  real describer work in `conditionNote`, where the category argument never looks.** A gate parks and
  files a record; **check `withConsequence` AND the note-rendering path**, and report both.
- **`log.ts`**: render the row rather than reasoning about it (D456/D494), and record any honest
  limit at the rung.
- **THE ATTRIBUTION CONTROL AT BOTH LAYERS**, each killer alone, restored in a `finally`, size **and**
  sha256 verified. **Name which layer each witness covers.** ⚠️ **And hunt one suite at a time** —
  D494 credited a suite on the strength of its NAME and it killed nothing.

## Hard rules — read these as written

- **Do NOT commit, do NOT `git add`, do NOT run a whole-corpus sweep.** A `--decision D495
  --allow-dirty` probe is expected; row count derived three ways.
- **`docs/` is UNTOUCHED. Do not run the end-of-session ritual.** 🛑 **`ARCHIVES` in
  `progressLog.test.ts` is the RITUAL's — leave it byte-unchanged and verify by sha256.**
- **Never `git stash` / `git checkout --` / `git reset --hard`.** Never write to the tree while the
  harness is in flight.
- Temp files in `$CLAUDE_JOB_DIR/tmp` only.
- `--allow-dirty` MANDATORY on a dirty tree; `--decision` takes ONE value (D443) and matches by
  `String.includes`; **`--only` does NOT accumulate.**
- ⚠️ **A `replace` omitting a REQUIRED field reports ERROR — `precheck` gates `find` only.**
- 🛑 **A BARE `toBe(N)` REPLACEMENT IS NOT SAFE FOR SMALL LITERALS** (D492) — **patch by line number
  from the runner's `file:line`**, and **undo LINES, never VALUES**. ⚠️ **The suite stays GREEN
  through such an over-patch**; only the diff shows it.
- ⚠️ **Census tax in WAVES** — D494 took four, and ⚠️ **waves 2 and 3 were the SAME `it` blocks**, the
  sibling assertion behind the first throw (D462). **Count MATCHES not LINES**; **`BUILT.attack`
  FIRST** (D449); **splice a twice-per-line marker at a COLUMN-ASSERTED occurrence** (D463).
  ⚠️ **A `Math.round` numerator has a SOLUTION SET** — intersect across both denominators.
- 🛑 **STATE THE COMMAND YOU USED FOR EVERY COUNT.** `git grep` misses your untracked suite. ⚠️ **An
  `it.each` is ONE site and N tests** — count with a pattern that admits it, or your delta will
  disagree with vitest for a correct reason (D494). **Re-measure the version tax AND its exception
  list after the edit; never inherit either** — the inherited total has been short by one on two
  separate slices, each time because the note counting it was itself a match.
- ⚠️ **A moved gate population must be VERIFIED, not accepted.** `patches LITERALLY` is **22**; the
  criterion is a `String.replace` special, **not a bare `$`** (which reads ~214).

## Report back

Build state for every string in my table and for the whole duration family, re-derived. The lattice
by Hamming weight, both directions, with any degenerate axis named as such. Each branch's solo payoff
and the combined payoff, measured with the canonical predicate. **Whether the anchor-vs-composition
answer is the same for the fourth time, with the numbers.** The tripwire audit. Witness load. The
three design questions — especially the version one, answered honestly. The describer trace and the
`log.ts` render. The attribution control at both layers with the layer map. What you built; what you
left and its price. **Every place this brief was wrong — assume at least one, and say which of my
claims were hedged and which were confident.** The gates verbatim. The per-file numstat for
deletions. The corpus delta and a sweep prediction with its arithmetic shown.
