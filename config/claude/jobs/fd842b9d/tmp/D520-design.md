# D520 design — censusAttackCorpus.ts:601 (verified at HEAD 5b0ab331, read via `git show HEAD:`)

Printed, 1 legal printing:
  This attack does 50 damage to each Pokémon that has any damage counters on it
  (both yours and your opponent's), except for this Pokémon.
  (Don't apply Weakness and Resistance for Benched Pokémon.)

## Arm: reader. Not registry/gate/trailing.

## THE PROGRAM (two ops, both already shipped; zero new type bytes)
  1. { op:"damageChosen", target:"opponentAny", amount:50, count:"all",
       source:"attack", deals:true, damagedOnly:true }        // NO ignoreWR
  2. { op:"spreadDamage", target:"yourBench", amount:50, damagedOnly:true }

WHY op 1 is damageChosen and NOT damageDefender+spreadDamage:
  - D507's falsifier ("needs damagedOnly on damageDefender's FLAT arm, a two-member
    union, so it owes damagedOnly?: never on the sibling") is STILL LITERALLY TRUE —
    damageDefender is still two arms (effects.ts:5712, 5761) and carries no damagedOnly.
  - The row simply does not need damageDefender. snipeTargets (interpreter.ts:13618)
    applies damagedOnly to WHICHEVER SCOPE `target` NAMES; opponentAny -> oppAnyRefs
    (Active + Bench). Its own doc: "No printing spells the narrowing against
    opponentAny today." :601 IS that printing.
  - placeSnipe routes an Active ref through snipeActive(..., ignoreWR) and benched refs
    through a flat loop (6a-ter doc, effects.ts:24486-24494). With ignoreWR ABSENT the
    Active takes the full W/R pipeline and the Bench stays flat — which is exactly the
    printed "Don't apply W/R for BENCHED Pokémon".
  => D507 was right about damageDefender and wrong that damageDefender was the carrier.
     Second occurrence of D519's rule (grep the refusal's TYPE, not its NOUN).

## DO NOT use 6a-ter as the precedent arm
  6a-ter (:539/:616) sets ignoreWR:true because those cards print "damage isn't
  affected by Weakness or Resistance". :601 prints the BENCHED-ONLY clarifier, so W/R
  APPLIES on the Active. The correct sibling is :572 / 6a-bis.

## THE ORDER IS OBSERVABLE AND THE TWO PRECEDENTS DISAGREE — pick one and pin it
  - 6a-bis (effects.ts:24437-24446): ACTIVE HALF FIRST. "§8.5 resolves the Active Spot
    before anything splashes ... spreadDamage is a FOLD that carries rngState, so
    swapping the two ops re-orders the log AND re-draws every shield coin."
    Mutant row: D482-whole-side-spread-order-flips.
  - SPREAD_EACH_BOTH_BENCH (effects.ts:24428-24431): yourBench FIRST, then
    opponentBench.
  RECOMMENDATION: opponentAny first (6a-bis's rule is grounded in §8.5; the both-bench
  row has no Active leg so its order was unconstrained). Pin with a new mutant row.

## THE ANCHOR — NEW, and must NOT be a widening of SPREAD_EACH_BOTH_BENCH
  SPREAD_EACH_BOTH_BENCH (effects.ts:13492) matches "each BENCHED Pokémon ... (both
  yours and your opponent's)". Widening it to drop "Benched" would silently change what
  the SHIPPED row builds. Write a separate anchor. "except for this Pokémon" is
  LOAD-BEARING and must be in the pattern — without it the deriver would accept a
  sentence that includes the attacker.
  Self-exclusion is then structural: the attacker IS your Active, and neither
  `yourBench` nor `opponentAny` names it.

## PRICE
  new DamageCountSource members 0 (stays 20) | new op kinds 0 | new op FIELDS 0
  new CardFilter/BoardCondition 0/0 (BoardCondition stays 61) | new readers 0 (surface
  stays 13) | new anchors 1 | registry rows/prompts/choice kinds/events/error codes 0
  redact.ts / packages/schema bytes 0 | MATCH_RECORD_VERSION HELD at 30
  count:"all" is the promptless forced branch (effects.ts:5392) => no describer debt.

## THE FALSIFIER, AND IT IS NOT CHECKABLE OFFLINE — STATE IT, DO NOT CLAIM IT
  scaledBase (attack.ts:2037) is zeroed by programDamage =
    program?.some(step => step.op === "damageDefender")   (attack.ts:1973)
  This program contains NO damageDefender, so programDamage is FALSE and a non-zero
  printed `damage` field would land on the opponent's Active BEFORE the program.
  :572 / 6a-bis suppresses the base precisely because its program HAS damageDefender.
  NOT RESOLVABLE AT TEST TIME: the corpus format is "<legal printings> <effect>"
  (censusAttackCorpus.ts:40), its provenance query selects $.effect alone
  (censusAttackCorpus.ts:23-26), and none of :601, :572, :539, :616 is in registry.ts.
  The already-shipped 6a-ter rows share this exposure and are green only because
  nothing has ever asked. => Record as a STATED ASSUMPTION + a named census gap
  (an effect+damage column the corpus does not carry). Do not assert a check.

## VERIFIED BASELINES (derived this session, commands in transcript)
  reader surface 13 (grep -c '^export function deriveAttack')
  DamageCountSource 20 (bounded awk over the 280-line decl at effects.ts:28932;
    a naive `kind:` regex answers 18 — two arms are multi-line)
  corpus 640 rows; :601 leading "1" is the PRINTING COUNT, not text

## EXPECTED CENSUS DELTA
  reader 546/1586 -> 547/1587 | BUILT.attack 1636 -> 1637 | residue 68/96 -> 67/95
  registry 10/16, gate 5/13, trailing 11/21 all UNMOVED

## CONVENTIONS THIS SLICE OWES (before ## Git / commits)
  1. A refusal that prices ONE decomposition has not priced the row — enumerate the ops
     that can reach the ZONE, not the ops the sibling slice happened to use. (D507 ->
     D520, second occurrence of D519's rule.)
  2. During a mutation sweep, NOTHING THAT READS THE WORKING TREE IS TRUSTWORTHY —
     the harness patches files in place and restores them seconds later. Verify against
     `git show HEAD:<path>` instead.
     ⚠️ AND THIS IS NOT ONLY ABOUT COMMANDS YOU RUN. During D519's sweep the IDE's
     language server reported three `Type '"any"' is not assignable` errors in
     `prizeGateParalyze.test.ts:574-575`. At HEAD and in the tree moments later those
     lines are COMMENTS — 8 mutant rows target that file and one was patched in when
     the diagnostic was sampled. A sweep therefore manufactures plausible, specific,
     entirely false diagnostics, and the tell is that they name a file the corpus
     targets. Check `git show HEAD:` before believing ANY tool that read the tree,
     including ones you did not invoke.
  3. The pager can be the narrow instrument: `head -30` truncated a scout's grep to 0
     sites where the unbounded run had 4. Widens D519's (5) from FILE SCOPE to any
     truncating instrument.

## ANCHOR — PROBED MECHANICALLY (bun, standalone, against the HEAD corpus blob)
  const SPREAD_EACH_DAMAGED_BOTH_BOARDS = new RegExp(
    "^This attack does (\\d+) damage to each Pokémon that has any damage counters on it" +
      " \\(both yours and your opponent['’]s\\), except for this Pokémon\\." +
      " \\(Don['’]t apply Weakness and Resistance for Benched Pokémon\\.\\)$",
  );
  RESULT: matches 1 sentence / 1 printing (:601) and NOTHING else in the 640-row corpus.
  SPREAD_EACH_BOTH_BENCH keeps its 2 sentences / 2 printings; OVERLAP = 0.

  ⚠️ THE W/R CLARIFIER IS **REQUIRED** HERE, NOT OPTIONAL — and that differs
  deliberately from SPREAD_EACH_BOTH_BENCH, which makes it optional. There the
  clarifier only RESTATES the flat loop (every target is benched, so W/R never
  applied anyway) and optional is harmless. Here the clarifier is exactly what
  licenses the ASYMMETRY — the opponent's Active takes the full W/R pipeline through
  snipeActive(..., false) while every benched body stays flat. A clarifier-less
  variant would be a DIFFERENT row with different semantics, so it must be refused
  LOUDLY rather than silently built as this one. Corpus contains no such variant (0).

  ⚠️ No "(?:also )?" — :601 prints "This attack does". A hypothetical "also" variant is
  a rider on a base hit and is refused loudly, which is correct.

## TYPE + VERSION RISKS — CHECKED, ALL CLEAR
  · `damageChosen` is a FLAT object arm (target/amount/count/damagedOnly?/filter?/…),
    NOT a discriminated sub-union, so `count:"all"` and `damagedOnly:true` compose
    with no type work. (effects.ts:5379-5600.)
  · The `damagedOnly` field's own doc states this slice's premise verbatim:
    "The narrowing composes with `target` in principle; no printing spells it against
    `opponentAny` today, and `snipeTargets` applies it to whichever scope the op names
    rather than to the Bench by hand." (effects.ts:5556-5561.)
  · THE FIELD'S OWN NAMED FALSIFIER — "the bump would be owed the day `applyChoice`
    RE-DERIVES `snipeTargets`, and it is one grep" — WAS RUN: `applyChoice` does not
    call `snipeTargets`. NOT FIRING => MATCH_RECORD_VERSION HELD at 30.
  · `snipeTargets` has exactly ONE call site (interpreter.ts:2045, inside stepOp's
    damageChosen arm). One funnel, one call — the narrowing cannot be applied twice or
    skipped on some path.
  · `count:"all"` => `ceiling = candidates.length` (interpreter.ts:2052), the forced
    promptless branch: the op RESOLVES INLINE and never parks, so nothing new rides
    `GameState.phase.cont.pendingOp`. Second, independent reason the version holds.
  · op 2 is already shipped verbatim: `{op:"spreadDamage", target:"yourBench", amount,
    damagedOnly:true}` is emitted today by SPREAD_EACH_BOTH_BENCH (effects.ts:24428).

## TEST PLAN — new suite `packages/engine/src/damagedBothBoardsSpread.test.ts`

§1 THE READER IS A BICONDITIONAL, NOT A MATCH
  Drive the anchor over the WHOLE committed corpus (import censusAttackCorpus, as
  D519's suite does): assert the set of sentences this arm claims is EXACTLY {:601}.
  Both directions — every corpus row the arm claims is :601, and :601 is claimed.
  This is what makes a later widening RED instead of silently green.

§2 THE CLARIFIER IS LOAD-BEARING (the anchor's own refusal)
  Feed the clarifier-LESS variant and the "also does" variant; assert BOTH derive to
  null (loud refusal), and say in a comment WHY they must: without the clarifier the
  Active/Bench W/R asymmetry is unlicensed, and "also" makes it a rider on a base hit.

§3 THE HIT SET IS {damaged bodies} MINUS THE ATTACKER — driven BODY BY BODY
  A six-body board (your Active = attacker, 2 of your bench, opponent Active, 2 of
  their bench) over several damage patterns. For each pattern, build the candidate set
  two ways and assert them EQUAL:
    (a) what the program actually damages (read DAMAGE_DEALT rows), and
    (b) `bodies.filter(hasAnyDamageCounters).filter(b => b !== attacker)`.
  This is D519's shape — the biconditional driven per body, not a spot check.
  MUST include: the pattern where the attacker itself is damaged (it is EXCLUDED),
  and the pattern where NOTHING is damaged (zero DAMAGE_DEALT rows, state untouched).

§4 THE W/R ASYMMETRY — the reason the clarifier is required
  Opponent's Active is Weak (×2) and damaged; their bench is Weak and damaged.
  Assert the ACTIVE takes 100 (W/R applied, via snipeActive(..., false)) and each
  BENCHED body takes exactly 50 (flat). A build that passed ignoreWR:true is killed
  here and NOWHERE ELSE — so this §, not §3, is what pins the op's missing field.
  Mirror with a RESISTANT Active to pin the sign.

§5 ORDER IS OBSERVABLE (pin the choice made in "THE ORDER" above)
  Put a coin-flip shield on a body so the fold draws rng, then assert the exact
  DAMAGE_DEALT row order AND the resulting rngState. 6a-bis's precedent says the
  Active half resolves first; assert that and cite D482-whole-side-spread-order-flips.

§6 EMPTY-ZONE TOTALITY (6a-bis's §4, restated for two boards)
  Lone opponent Active + empty benches on both sides; and an opponent with NO Active
  (if reachable). Neither op may guard the other's empty case — spreadDamage early-
  returns on an empty bench, and an empty candidate set makes damageChosen a no-op.

MUTANT ROWS THE SLICE OWES (hand-authored, expectKilledBy named for each)
  · anchor: drop "except for this Pokémon"          -> §1/§3
  · anchor: make the W/R clarifier optional          -> §2
  · anchor: widen "each Pokémon" to reach :602       -> §1
  · op1: add ignoreWR:true                           -> §4   (the field this slice does NOT set)
  · op1: target opponentBench instead of opponentAny -> §3 (opponent Active never hit)
  · op2: target opponentBench instead of yourBench   -> §3 (own bench never hit)
  · op1/op2: drop damagedOnly                        -> §3 (undamaged bodies hit)
  · swap the two ops                                 -> §5
  ⚠️ BEFORE SHIPPING ANY ROW: assert `find !== replace` (D519's harness gap — a row
     that is its own experiment is a no-op precheck cannot see).

  4. 🆕 ENUMERATE THE VERDICT TOKENS; DO NOT GREP FOR THE ONE YOU EXPECT.
     Through D519's whole sweep the caller reported "0 non-KILLED" from
     `grep -cE 'SURVIVED|GAP| ERROR|STALE|CLOBBER'`. The harness prints declared
     survivors as **`SURVIVES(known)`** — present tense, parenthesised — so the
     pattern matched none of the 42 that had already been reported and the count read
     0 for hours. The run WAS clean, so the wrong number and the right number agreed
     by luck, which is why nothing caught it.
     THE FIX IS THE SAME ONE D503/D504/D516 EACH PAID FOR ONE LAYER DOWN:
       grep -oE '… +[A-Za-z()]+' log | sed 's/…  *//' | sort | uniq -c
     lists what the log ACTUALLY contains (here: exactly `KILLED` and
     `SURVIVES(known)`), which both proves cleanliness AND reports the survivor count,
     with no guess about spelling anywhere in it.
     ⚠️ A pattern built from what you expect can only ever confirm you.
