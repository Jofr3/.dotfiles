import io, os, sys
P = "/home/jofre/projects/luminous_ui/packages/engine/src/effects.ts"
src = io.open(P, encoding="utf-8").read()
before_lines = src.count("\n")
edits = []

def sub(find, repl, n=1):
    edits.append((find, repl, n))

# ── A. the `THREE readers produce it` count + the D490 paragraph on the op's doc block
sub(
"""      THREE readers produce it: D130's per-heads expansion (`programPerHeads`, at
      the flip site), D131's bare `DECK_TOP_MILL` sentence and — since 0.85.0 —
      `FLIP_DECK_TOP_MILL` ("Flip a coin. If heads, discard the top card of your
      opponent's deck.", D134), which wraps the singular opponent-side reading in a
      `coinFlipGate` and changes nothing about the op. */
  | { op: "discardDeckTop"; whose: "self" | "opponent"; count: number; recordAs?: EffectSlot }""",
"""      \U0001f195\U0001f195 **D490 — `whose` GAINS A THIRD INHABITANT, `"eachPlayer"`, AND IT IS A
      VALUE OF THE SHIPPED FIELD RATHER THAN A SECOND OP FOR THE REASON THE PARAGRAPH
      ABOVE ALREADY GIVES**: *"Discard the top card of **each player's** deck. This
      attack does 140 more damage for each Energy card discarded in this way."* (corpus
      FILE LINE 130, **1 sentence / 2 legal printings**) names the same action on two
      decks, and everything downstream of picking the seats is byte-identical.

      \U0001f6d1 **AND IT IS ONE OP RATHER THAN TWO SEQUENTIAL MILLS, WHICH THE §9.2 RECORD
      DECIDES RATHER THAN TASTE.** `recordMoved` ASSIGNS (`record[slot] = [...uids]`)
      — the rule `discardPileRetrieval` states and `attachFromDeck` repeats, so that an
      op which ran and moved nothing overwrites a stale value. Two sequential
      `discardDeckTop`s filing into `discarded` therefore leave only the SECOND deck's
      card in the slot, and the trailing `damageDefender` scores one card where the
      sentence counts two. D458 measured that overwrite on a different pair; this is the
      first printing whose DAMAGE NUMBER depends on it. Filing into two different slots
      is no escape either — `damageDefender.count` is ONE `EffectSlot`, so a two-slot
      program would need the fold to sum two addresses.

      ⚠️ **THE SEATS ARE WALKED CONTROLLER-FIRST, AND THE TWO SHIPPED "both seats"
      PRECEDENTS DISAGREE ABOUT THAT** (D433: a split set is a distinction you have not
      found yet). `counterEachAll`'s `side: "both"` walks the ABSOLUTE `SEATS`
      (`["p1","p2"]`); `handRefresh`'s `who: "both"` walks `[ctx.seat,
      otherSeat(ctx.seat)]` and says so. The distinction is what the walk EMITS:
      `counterEachAll` files one event per BODY, so the seat order is not the row order,
      while this op and `handRefresh` both emit one row PER SEAT — so here the seat
      order IS the log's order, and the printed subject of *"this attack"* is the
      attacker. Absolute seats would make one printed sentence read in two orders
      depending on which chair the player sits in, off nothing the card prints.

      THREE READERS PRODUCED IT UNTIL D490 AND FOUR DO NOW: D130's per-heads expansion
      (`programPerHeads`, at the flip site), D131's bare `DECK_TOP_MILL` sentence,
      — since 0.85.0 — `FLIP_DECK_TOP_MILL` ("Flip a coin. If heads, discard the top
      card of your opponent's deck.", D134), which wraps the singular opponent-side
      reading in a `coinFlipGate` and changes nothing about the op, and — since D490 —
      `deriveAttackDiscardScaledBoost`'s mill arm, the ONLY producer of `"eachPlayer"`
      and the only one that also files a §9.2 slot from this op. */
  | {
      op: "discardDeckTop";
      whose: "self" | "opponent" | "eachPlayer";
      count: number;
      recordAs?: EffectSlot;
    }""")

# ── B. the reading type becomes a discriminated union
sub(
"""export interface AttackDiscardScaledBoost {
  /** The printed ceiling of the declinable discard (the "up to N"), which rides the
      op's `cap` — the pick stays 0..min(cap, matches) and stays declinable. */
  cap: number;
  /** What may come off the Bench: the bare printed noun, or the Basic-Energy card. */
  filter: CardFilter;
  /** The printed extra damage EACH discarded card buys — the "+" of the attack's
      own printed marker, which is why this reading claims that marker at the read
      site the way `optionalBoost` and `bonusConsequent` do. */
  per: number;
}""",
"""export interface AttackBenchDiscardScaledBoost {
  /** \U0001f195\U0001f195 D490 — the discriminator, and it is a `switch`ed FIELD rather than a
      shape the assembler sniffs (D474): a third printed head must stop compiling in
      `discardScaledBoostProgram` instead of falling into whichever arm its payload
      happens to satisfy. */
  kind: "benchDiscard";
  /** The printed ceiling of the declinable discard (the "up to N"), which rides the
      op's `cap` — the pick stays 0..min(cap, matches) and stays declinable. */
  cap: number;
  /** What may come off the Bench: the bare printed noun, or the Basic-Energy card. */
  filter: CardFilter;
  /** The printed extra damage EACH discarded card buys — the "+" of the attack's
      own printed marker, which is why this reading claims that marker at the read
      site the way `optionalBoost` and `bonusConsequent` do. */
  per: number;
}

/** \U0001f195\U0001f195 D490 — THE SECOND PRINTED HEAD OF THE SAME ADDITIVE FOLD: a MANDATORY,
    UNFILTERED mill of ONE card off **each player's** deck, whose damage counts only the
    ENERGY among what the mill filed.

    *"Discard the top card of each player's deck. This attack does 140 more damage for
    each Energy card discarded in this way."* — **1 sentence / 2 legal printings**,
    `censusAttackCorpus.ts` FILE LINE 130, transcribed byte for byte and verified
    against `legalAttackCorpus()` rather than retyped (the apostrophe is U+0027 at index
    35, measured with `codePointAt`; the whole committed column carries ZERO U+2019, so
    the `['’]` class here is latent by design, as it is at every sibling anchor).

    \U0001f6d1 **IT IS A MEMBER OF *THIS* READING RATHER THAN A FOURTEENTH READER, AND THE
    ARGUMENT IS MARGINAL SITES (D424) BACKED BY A MEASUREMENT.** A new `deriveAttack*`
    export enrols itself in `attackReaderSurface()` by NAME (D444), which at this head
    would move **75 `expect(attackReaderSurface()).toHaveLength(13)` assertions across 74
    files** plus each of those files' hand-listed `READERS` array — D418's 12→13 step
    cost 48 rungs and the surface has grown since. Riding this reader instead costs
    **ZERO bytes in `attack.ts`**: the three terms that matter there
    (`scaledBase`, `effectSimulated`, `modifierSimulated`) are all spelled
    `discardScaledBoost !== null`, and the assembler is already called with the printed
    `base` in scope.

    \U0001f6d1 **AND IT CANNOT BE A `deriveAttackEffect` ARM, WHICH IS D403's ARGUMENT
    VERBATIM AND NOT A PREFERENCE.** The printed *"more"* KEEPS the attack's base;
    `deriveAttackEffect` takes only a STRING, so an arm there would emit a
    `damageDefender` whose `base` nothing could populate. The base is a field on the
    attack and lives in `attack.ts`, so the value that crosses the gap is the PROGRAM.

    ⚠️ **STRUCTURALLY DISJOINT FROM ITS SIBLING ANCHOR, SO THE ORDER IS LEGIBILITY AND
    CARRIES NO GUARD** (D467's first preference). `BENCH_DISCARD_SCALED_BOOST` demands
    `^You may discard up to` and this one demands `^Discard the top card of each
    player['’]s deck\\.`; no string can match both, so no lookahead exists here to rot
    and no order-permutation can change an answer.

    ⚠️ **EVERY TOKEN BUT THE AMOUNT IS A LITERAL, D121's RULE ON A POOL OF ONE
    SENTENCE.** The count (*"the top card"*, singular, no digit), the seats (*"each
    player's"*), the joiner (a PERIOD, where D488's mill compound prints a comma) and the
    counted noun (*"Energy card"*) each vary in exactly ZERO printed rows, so capturing
    any of them would author sentences the column does not print (D440/D361) — and the
    refusals a capture would keep reachable are already reachable from D488's anchor,
    which drives `milledCardFilter`'s null on a real board. `deckTopMill.test.ts` already
    pins *"Discard the top 2 cards of each player's deck."* as a THIRD-PARTY reading
    nothing prints, and this anchor leaves that refusal exactly where it was. */
export interface AttackEachDeckMillScaledBoost {
  kind: "eachDeckMill";
  /** The printed extra damage each ENERGY card milled buys. The only capture in the
      anchor, guarded `>= 1` like every captured amount in this file. */
  per: number;
}

/** \U0001f195\U0001f195 D490 — the additive §9.2 fold, read from either of its two printed heads.
    Asymmetric payloads (a declinable ceiling and a movement filter against a bare
    per-card amount) ⇒ TWO MEMBERS with the discriminator as a field, which is D440's
    union rule and NOT the "one member, discriminator as a field" branch of it. */
export type AttackDiscardScaledBoost =
  | AttackBenchDiscardScaledBoost
  | AttackEachDeckMillScaledBoost;""")

# ── C. the new anchor, beside its sibling
sub(
"""const BENCH_DISCARD_SCALED_BOOST =
  /^You may discard up to (\\d+) (Basic )?Energy from your Benched Pokémon\\. This attack does (\\d+) more damage for each card you discarded in this way\\.$/;""",
"""const BENCH_DISCARD_SCALED_BOOST =
  /^You may discard up to (\\d+) (Basic )?Energy from your Benched Pokémon\\. This attack does (\\d+) more damage for each card you discarded in this way\\.$/;
// \U0001f195\U0001f195 D490 — the same additive fold behind a MANDATORY two-deck mill. One capture (the
// per-card amount) and every other token spelled out; see `AttackEachDeckMillScaledBoost`
// for why. No /i, on this file's standing reason. `['’]` on the family's standing choice
// — the printed byte is U+0027 and the column holds no U+2019, so the curly arm is latent
// and `clauseApostrophe.test.ts`'s re-ingest sweep is what keeps it honest.
const EACH_DECK_MILL_SCALED_BOOST =
  /^Discard the top card of each player['’]s deck\\. This attack does (\\d+) more damage for each Energy card discarded in this way\\.$/;""")

# ── D. the reader gains the mill arm FIRST (the bench block below stays byte-identical
#       apart from the one added discriminator line)
sub(
"""export function deriveAttackDiscardScaledBoost(text: string): AttackDiscardScaledBoost | null {
  const match = BENCH_DISCARD_SCALED_BOOST.exec(text.trim());""",
"""export function deriveAttackDiscardScaledBoost(text: string): AttackDiscardScaledBoost | null {
  // \U0001f195\U0001f195 D490 — the two-deck mill, asked FIRST purely for legibility: the two anchors
  // are structurally disjoint (`^You may discard up to` against `^Discard the top card of
  // each player`), so no string reaches both and no order here can change an answer.
  const mill = EACH_DECK_MILL_SCALED_BOOST.exec(text.trim());
  if (mill !== null) {
    const perMilled = Number(mill[1]);
    // ONE printed number, ONE positivity guard — D145's standing rule. A printed 0 per
    // card is a clause that buys nothing however many Energy come off, which is a SILENT
    // no-op where the loud `ATTACK_EFFECT_SKIPPED` path is the whole point.
    return perMilled < 1 ? null : { kind: "eachDeckMill", per: perMilled };
  }
  const match = BENCH_DISCARD_SCALED_BOOST.exec(text.trim());""")

sub(
"""  if (cap < 1 || per < 1) return null;
  return {
    cap,
    per,""",
"""  if (cap < 1 || per < 1) return null;
  return {
    kind: "benchDiscard",
    cap,
    per,""")

text = src
for find, repl, n in edits:
    if text.count(find) != n:
        sys.stderr.write("FIND COUNT %d (want %d) for:\n%s\n" % (text.count(find), n, find[:200]))
        raise SystemExit(2)
    if find == repl:
        raise SystemExit("find === replace")
    parts = text.split(find)
    assert len(parts) == n + 1
    text = repl.join(parts)

payload = text.encode("utf-8")     # ENCODE FIRST (D463)
with open(P, "wb") as fh:
    fh.write(payload)
print("effects.ts lines %d -> %d (+%d)" % (before_lines, text.count("\n"), text.count("\n") - before_lines))
