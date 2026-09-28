# D503 — work order

## The target

**1 sentence / 1 legal printing**, a `COMPOUND-head` row whose head already builds:

> *"This attack does 30 damage for each {W} Energy attached to this Pokémon. Before doing damage, you
> may attach any number of Basic {W} Energy cards from your hand to this Pokémon."*

## What I measured at `365ac08d` — re-derive every cell

| string | verdict |
|---|---|
| the full print | **REFUSED 13/13** |
| the head | **BUILDS** — `deriveAttackDamageMultiplier` |
| the tail alone | **REFUSED 13/13** |

**What already ships:**

- **`attachFromHand` is an `EffectOp`.** The attach itself is not the gap.
- **`{ kind: "basicEnergy"; energyType?: BasicEnergyType }` is a `CardFilter`**, and `effects.ts`'s
  own comment says it *"already spells the printed noun"*. **So *"Basic {W} Energy cards"* needs no
  new vocabulary** — and D500 shipped the `basic` energy category on a neighbouring axis, so check
  whether that is relevant or a red herring.
- **`AttackPreDamage` has exactly THREE kinds**, and all three are `discardOpponentActive*`. **A
  fourth would be the first non-discard member, and the first that benefits the ATTACKER.**

## 🛑 The ordering problem — measured, and it is the content

`attack.ts` derives `preDamage` at **line 1642** but **applies it at line 2568**. `scaledBase` is
computed at **line 1946** — *before* the hook runs.

**So on today's pipeline, Energy attached by a pre-damage hook would NOT be counted by the
multiplier** — which is the whole point of the printed sentence. The card says *"Before doing
damage"* precisely so the attachment counts.

🛑 **Verify that ordering yourself before designing anything** — line numbers are not execution order,
and I have not traced the control flow. **If it holds, the slice needs either the scaling recomputed
after the hook or the attach placed earlier, and BOTH are changes to a shipped pipeline that many
rows depend on.** Price them, drive the chosen one, and **say plainly what else moves.**

⚠️ **And read the invariant at `attack.ts:1636` before relying on anything near it.** It says *"ONE
`preDamage` AND ONE `program` CAN NEVER BOTH BE NON-NULL ON A PRINTED STRING TODAY … That is a fact
about the anchors, not a property worth depending on, which is why the hook below is placed by the
RULE (before §8.5) rather than by what the pool happens to print."* **This sentence pairs a
MULTIPLIER head with a pre-damage tail, which may be a new combination** — check whether it is, and
whether the comment's claim survives it.

## What you must do FIRST

1. **Build state programmatically** off the 13 `deriveAttack*` exports for every string above, plus
   all four splitters. Report verbatim.
2. 🛑 **Trace the execution ordering** of `preDamage` application against `scaledBase`/`damageMultiplier`
   computation. **Drive it on a board** — attach one Energy in the hook and see whether the damage
   reflects it — rather than reading line numbers.
3. 🛑 **THE AXIS-SUBSTITUTION LATTICE, BOTH DIRECTIONS**, reporting the **built-by-weight vector**.
   **Six shapes are now on record** — full-weight (D489/D490/D494/D501), every-segment (D495),
   prerequisite-half (D499), single-axis 2¹ (D500), and **empty-at-every-weight (D502, a claim about
   the SEAM rather than the axes)**. ⚠️ **Check each axis for DEGENERACY before listing it**, and
   **use a Set** — a degenerate axis makes the point set smaller than the bit set (D502).
4. **Price each branch ALONE as well as together**, with the **canonical residue predicate copied
   verbatim from `censusAtHead.test.ts`**.
5. 🛑 **RE-DERIVE ANY REFUSAL AND ASK WHICH CARRIER IT IS ABOUT** (D499) — ⚠️ **and if both its
   clauses survive, SAY SO** (D502): the run reports falsifications by habit, and *"the quoted price
   was real"* is what makes a refusal actionable.
6. **Run the tripwire audit over all 2,486 rows from the module**, by **SPAN** as well as by name.
   🆕 **Include the CENSUS CONSTANTS in the needle list** — `D495-census-built-attack-not-stepped`
   quotes `"  attack: 1617,"` and **rots on every census step**; D502's audit missed it and
   `precheck` found it in seconds. **Predict it.**
7. **Witness load, counted and divided**; **verify every specimen IS a row of `legalAttackCorpus()`**.

## Obligations

- **THE DESCRIBER: trace both call sites** and report both. ⚠️ **An attach from hand parks**, so
  `withConsequence` may be reachable — but trace it rather than inferring from the category.
- **`log.ts`: RENDER the rows**, and record any honest limit at the rung.
- **THE ATTRIBUTION CONTROL AT BOTH LAYERS**, each killer alone, restored in a `finally`, size **and**
  sha256 verified, with the layer map named.
- **`MATCH_RECORD_VERSION` is 30. Name the address FIRST, then the argument** — and note that an
  attach-from-hand op **parks**, so it rides `phase.cont.pendingOp`. ⚠️ **Check BOTH doors** (D502):
  the parking op in `pendingOp` *and* anything inside `rest`. **Ask what an optional shape would
  DISARM** (D501), not only what it would mean.
- ⚠️ **Read the ARITY question at the FLOOR, not the candidate count** (D502). *"You may attach **any
  number**"* is declinable — so check whether the park survives even when one card is offered.

## Hard rules — read these as written

- **Do NOT commit, do NOT `git add`, do NOT run a whole-corpus sweep.** A `--decision D503
  --allow-dirty` probe is expected; row count derived three ways.
- **`docs/` is UNTOUCHED. Do not run the end-of-session ritual.** 🛑 **`ARCHIVES` in
  `progressLog.test.ts` is the RITUAL's — leave it byte-unchanged and verify by sha256.**
- **Never `git stash` / `git checkout --` / `git reset --hard`.** Never write to the tree while the
  harness is in flight. ⚠️ **Prefer `setsid`** (D496). 🛑 **Scratch files in `$CLAUDE_JOB_DIR/tmp`.**
- `--allow-dirty` MANDATORY on a dirty tree; `--decision` takes ONE value (D443) and is a **FLOOR**
  with a false-negative half (D496); **`--only` does NOT accumulate**; **`--list` IGNORES
  `--decision`**; **`killedByCommand` REPLACES `expectKilledBy`** (D498).
- ⚠️ **A `replace` omitting a REQUIRED field reports ERROR — `precheck` gates `find` only.**
- 🆕 🛑 **A GREEN PROBE IS NOT EVIDENCE YOUR ROWS ARE WELL-FORMED** (D502). Twenty-one rows shipped a
  one-element **array** for `what`; `precheck` was clean and the probe reported 20 killed / 2 known,
  because the runner reads `what` only to print it. **`bun run check` caught it in seconds** — run it
  after authoring rows, not only after editing code.
- 🛑 **RUN THE BARE-TOKEN CENSUS FIRST AND LET THE COUNT PICK THE METHOD** (D501/D502). ⚠️ **Use a
  COMMENT-AWARE one-occurrence check**: `BUILT.attack - ` occurs 3–4× on one 67 KB line, and two
  chains share a physical line at columns 6 and ~31,900, which an `at < 80` heuristic cannot reach.
- ⚠️ **Census tax in WAVES**; **`BUILT.attack` FIRST** (D449); **check the COLLECTED-TEST count, not
  just the failure count** (D495). ⚠️ **This row is 1/1 so the two steps should AGREE — verify.**
- ⚠️ **A `Math.round` numerator has a SOLUTION SET** — intersect across both denominators (D488).
- 🛑 **STATE THE COMMAND YOU USED FOR EVERY COUNT**; `git grep` misses your untracked suite; **the
  version-tax exception list is `2 + 1` per slice — re-derive it, never inherit it** (D502).
- ⚠️ **`patches LITERALLY` is 22** — verify rather than accept.

## Report back

Build state for every string in my table, re-derived. 🛑 **The ordering, DRIVEN on a board** — and if
the pipeline must change, what else moves and how you bounded the risk. The lattice **by
built-by-weight vector**. Each branch's solo payoff. Whether the `attack.ts:1636` invariant survives
this sentence. The tripwire audit by span, **including the census constant**. Witness load. The
describer traces. The attribution control at both layers with the layer map. The version argument,
address first, both doors. What you built; what you left and its price. **Every place this brief was
wrong — assume at least one, and say which of my claims were hedged and which were confident.** The
gates verbatim. The per-file numstat for deletions. The corpus delta and a sweep prediction with its
arithmetic shown.
