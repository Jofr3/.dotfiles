# D501 — work order

## The target

**1 sentence / 1 legal printing**, a `COMPOUND-head` row whose head already builds:

> *"Your opponent's Active Pokémon is now Confused. Put 8 damage counters instead of 3 on that
> Pokémon for this Special Condition."*

## What I measured at `34e3571b` — re-derive every cell

| string | verdict |
|---|---|
| the full print | **REFUSED 13/13** |
| the tail alone | **REFUSED 13/13** |
| *"…is now Confused."* (head) | **BUILDS** |
| 🛑 *"…is now Poisoned. During Pokémon Checkup, put **2** damage counters on that Pokémon **instead of 1**."* | **BUILDS** → `[{op:"applyStatus", target:"defender", status:"poisoned", poisonDamage:20}]` |
| 🛑 the same with **8** counters (4 printings) | **BUILDS** |

🛑 **So the SIBLING MECHANISM ALREADY SHIPS.** The *"instead of"* override exists for **Poison**,
carried by `applyStatus.poisonDamage` and backed by **`Conditions.poisonDamage: number`** — a
per-body field seeded by `freshConditions()` as `{ rotation: "none", poisonDamage: 0, burned: false }`.

**Confusion has no equivalent.** `attack.ts` (~line 1373) hard-codes the self-damage:

```ts
if (rotation === "confused") { … if (face === "tails") { … const hurt = { ...active, damage: active.damage + 30 }; … } }
```

**Three corpus rows use *"instead of"*: two Poison rows build, this Confusion row does not.**

## 🛑 THE VERSION QUESTION IS LIVE HERE — DO NOT REACH FOR A HABITUAL ANSWER

`Conditions` is persisted in `GameState` → `MatchRecord.state`, and **`poisonDamage` is a REQUIRED
field there**. D487's measured rule is that a bump is forced by *a new REQUIRED key at a persisted
address, a RENAME there, or a re-meaning of an existing byte string* — **and a required
`confusionDamage` on `Conditions` is precisely the first of those.**

**Name the address FIRST, then say which argument you use** (D499/D500). ⚠️ **The last four slices
all held 29, and three of them held it on arguments that would NOT apply here** — no-carrier
(D498's), serialized-alphabet (D499's) and reachability all assume the byte does not reach a
persisted required slot. **If a bump is honestly owed, say so and PRICE IT.** 🛑 **Do not contort the
design to avoid one** — and equally, do not bump reflexively if an optional key or a derived default
is the honest shape. **Whichever you choose, drive a reconstructed v29 record and show it answers a
DIFFERENT NUMBER if the reading is wrong.**

⚠️ **And check what `poisonDamage` did about this** — it is the shipped precedent at the same
address, so **whatever argument it made is the one to re-derive rather than reinvent.** If its
introduction bumped the version, say so; if it did not, say why not.

## What you must do FIRST

1. **Build state programmatically** off the 13 `deriveAttack*` exports for every string above, plus
   all four splitters. Report verbatim.
2. 🛑 **THE AXIS-SUBSTITUTION LATTICE, BOTH DIRECTIONS**, reporting the **built-by-weight vector**.
   **Four shapes are now on record** (D489/D490/D494's full-weight; D495's every-segment; D499's
   prerequisite-half; D500's single-axis 2¹) — **and they say different things about why**.
   **Count the axes from the PRINT and check each for DEGENERACY before listing it** (D491/D494/D500:
   three of four were degenerate last slice).
3. **Price each branch ALONE as well as together**, with the **canonical residue predicate copied
   verbatim from `censusAtHead.test.ts`** (D430/D494).
4. 🛑 **RE-DERIVE ANY REFUSAL YOU FIND AND ASK WHICH CARRIER IT IS ABOUT** (D499) — that question
   overturned a 57-decision refusal two slices ago.
5. **Grep the mutant corpus for the row whose `replace` IS any widening you consider** (D493), and
   run the tripwire audit over all 2,446 rows **from the module**.
6. **Witness load, counted and divided**; **verify every specimen IS a row of `legalAttackCorpus()`**
   at its committed count (D490).

## Obligations

- **THE DESCRIBER: trace both call sites** (`withConsequence` and `conditionNote`) and report both.
- **`log.ts`: RENDER the rows** rather than reasoning about them (D456/D499/D500). ⚠️ **Confusion
  already emits `CONFUSION_CHECK`, `ATTACK_FAILED` and `COUNTERS_PLACED` with a hard-coded
  `amount: 30`** — **check what the renderer says when that number changes**, and record any honest
  limit at the rung.
- **THE ATTRIBUTION CONTROL AT BOTH LAYERS**, each killer alone, restored in a `finally`, size **and**
  sha256 verified, with the layer map named.
- ⚠️ **If a row survives its first probe, discriminate it with `--only … --full`** before blaming the
  killer set. **Three diagnoses are now on record**: a real suite gap (D499), a narrow killer set
  (D455), and **inert on the board the suite fields** (D500) — the last needs a *fixture*, not a
  wider killer set.

## Hard rules — read these as written

- **Do NOT commit, do NOT `git add`, do NOT run a whole-corpus sweep.** A `--decision D501
  --allow-dirty` probe is expected; row count derived three ways.
- **`docs/` is UNTOUCHED. Do not run the end-of-session ritual.** 🛑 **`ARCHIVES` in
  `progressLog.test.ts` is the RITUAL's — leave it byte-unchanged and verify by sha256.**
- **Never `git stash` / `git checkout --` / `git reset --hard`.** Never write to the tree while the
  harness is in flight. ⚠️ **Prefer `setsid`** — a foreground probe can be SIGTERM'd before its
  `finally` runs and the tool recovers silently (D496).
- 🛑 **Scratch files belong in `$CLAUDE_JOB_DIR/tmp`, NOT in the repo.**
- `--allow-dirty` MANDATORY on a dirty tree; `--decision` takes ONE value (D443) and is a **FLOOR**
  with a false-negative half (D496); **`--only` does NOT accumulate**; **`--list` IGNORES
  `--decision`**; **`killedByCommand` REPLACES `expectKilledBy`** (D498).
- ⚠️ **A `replace` omitting a REQUIRED field reports ERROR — `precheck` gates `find` only.**
- 🛑 **A BARE `toBe(N)` REPLACEMENT IS NOT SAFE FOR SMALL LITERALS** (D492) — patch **by line
  number**, **undo LINES not VALUES**, verify by **paired diff analysis**. ⚠️ **This slice touches a
  hard-coded `30` and an `amount: 30` in `attack.ts` — exactly the hazard D492 names.**
- ⚠️ **Census tax in WAVES** — grep OLD VALUES as bare tokens first, **counting MATCHES not LINES**;
  **`BUILT.attack` FIRST** (D449); splice a twice-per-line marker at a **column-asserted** occurrence
  (D463); **check the COLLECTED-TEST count, not just the failure count** (D495). ⚠️ **This row is
  1/1, so the two steps should AGREE — verify rather than trust.**
- ⚠️ **A `Math.round` numerator has a SOLUTION SET** — intersect across both denominators (D488).
- 🛑 **STATE THE COMMAND YOU USED FOR EVERY COUNT**; `git grep` misses your untracked suite; an
  `it.each` is ONE site and N tests (D494); **re-measure the version tax AND its exception list after
  the edit** — 🆕 **spelling the note entirely in ESCAPED patterns keeps the figure stable under its
  own text** (D499).
- ⚠️ **`patches LITERALLY` is 22** — verify rather than accept; the criterion is a `String.replace`
  special, **not a bare `$`**.

## Report back

Build state for every string in my table, re-derived. The lattice **by built-by-weight vector**, both
directions, with any degenerate axis named. Each branch's solo payoff and the combined payoff.
🛑 **The version argument, address named FIRST, with `poisonDamage`'s own precedent re-derived — and
an honest bump if one is owed.** What `log.ts` does when the confusion number changes. The tripwire
audit. Witness load. The describer traces. The attribution control at both layers with the layer map.
What you built; what you left and its price. **Every place this brief was wrong — assume at least
one, and say which of my claims were hedged and which were confident.** The gates verbatim. The
per-file numstat for deletions. The corpus delta and a sweep prediction with its arithmetic shown.
