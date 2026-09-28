import type { Card } from "@luminous/schema";
import { describe, expect, it } from "vitest";
import { attackReaderSurface, legalAttackCorpus, resolvedByAnyReader } from "./censusAttackCorpus";
import type { EffectOp } from "./effects";
import { deriveAttackEffect, splitAttackGateClause, splitAttackTrailingClause } from "./effects";
import type { GameEvent } from "./events";
import { applyAction, createGame } from "./index";
import type { GameState, Seat } from "./index";
import { runProgram } from "./interpreter";
import {
  FIXTURE_POOL,
  attachFromDeck,
  basicEnergy,
  battler,
  clearBench,
  deckOf,
  deckSize,
  firstBasicInHand,
  must,
  mustApply,
  setActiveFromDeck,
  types,
} from "./testFixtures";

// 0.381.0 → 0.382.0 — 🆕🆕🆕 D487: THE DECK'S OTHER END.
//
//   file line 143 (1 printing)   "Draw 3 cards from the bottom of your deck."
//
// 1 sentence / 1 legal printing over `legalAttackCorpus()`'s 640 / 1,732. The carrier id
// is UNRESOLVED and is stated as such rather than invented — this checkout has no D1
// (D425's standing limitation).
//
// 🛑 **THIS SLICE STARTED AS A MEASUREMENT AND THE MEASUREMENT KILLED ITS OWN PREMISE.**
// The work order handed this row over as one of THREE deferred *"specifically because
// building them would move `MATCH_RECORD_VERSION`"*, and priced this one at *"a source the
// op cannot name … also an op field on `drawCards`"* — the field half is right and **the
// price is wrong**. `apps/api/src/lobby/match.ts`'s own discriminator is *"WOULD AN OLD
// RECORD MEAN SOMETHING ELSE, not IS THE TYPE STILL ASSIGNABLE"* (D335), with *"a WIDENING
// is free and a RENAME is not"* (D359) and *"widening an enum is not a bump; adding a
// REQUIRED key always is"* (D326). An OPTIONAL field whose ABSENCE reproduces the
// pre-slice behaviour is the first of those, not the third. §8 drives it rather than
// arguing it, **at an address that really does persist** — D473-ii's rule, *"a rule that
// turns on persistence must be applied at an address that persists"*, applied in the
// direction that makes the argument HARDER: `drawCards` never parks, but it rides
// `recordGate.then` behind `payFromHand`, which does, so a v29 record genuinely can hold
// this op and the no-bump claim has to be earned rather than dodged.
//
// 🛑 **THE COMPOSITION QUESTION, ASKED FIRST AND DRIVEN (D482).** Seven shipped ops touch
// deck ORDER — `shuffleDeck`, `bottomDeckTop`, `reorderTop`, `lookAtTopN`, `discardDeckTop`,
// `attachFromTop`, `searchDeck` — and the near-miss is `bottomDeckTop { n }`, which moves
// the top `n` UNDER the deck and would surface the bottom three for a plain `drawCards`.
// It fails for TWO independent reasons and §5 drives both: the `n` it needs is
// `deck.length − 3`, a number no printed sentence carries and no op can compute, and the
// op **SHUFFLES its window** (its own doc block: *"an RNG consumer, which only one other
// `EffectOp` is"*), so the composition destroys the very order it was reached for.
//
// 🛑 **AND THE COUNTERWEIGHT FIRED, IN D486's ARITHMETIC-IDENTITY FORM RATHER THAN AS A
// BOARD COINCIDENCE.** Both ends of the deck share ONE cut — `max(0, deck.length − count)`
// — so on a deck of `count` OR FEWER the two arms take **the same cards in the same order,
// leave the same deck and emit the same event**: a shallow deck cannot separate a bottom
// draw from a top one AT ALL. §7 computes FIVE candidate readings as pure functions and
// shows the collision growing as the deck shrinks — **at 4 cards all five differ, at 3
// three collide, at 2 four collide, and at ONE CARD ALL FIVE ARE BYTE-IDENTICAL.** The
// board this file attacks on is therefore a deck of EIGHT, chosen from that table rather
// than from taste; a suite that reached for a small deck would have been green for
// nothing.
//
// ⚠️ **WHAT THIS SLICE COST, NAMED AS ZEROES SO THE CLAIM IS CHECKABLE:** ONE new anchor,
// ONE new `deriveAttackEffect` arm, ONE OPTIONAL key on a shipped op (`drawCards.from`),
// ONE optional parameter on `drawToHand`, and ONE widened `describeBranch` case. **ZERO**
// new `EffectOp` members, prompts, prompt fields, choice kinds, parks, events, error codes,
// `GameState`/`InPlayPokemon` fields, `BoardCondition`/`CardFilter`/`DamageCountSource`
// members, readers (the surface stands still at **13**), registry rows, `FIXTURE_POOL` ids
// (file-local `cardPool`, D414), `redact.ts` bytes, `packages/schema` bytes and
// **`MATCH_RECORD_VERSION` bytes**.
//
// SEED-FREE: neither the draw nor anything on these boards consumes RNG. The one seed
// below feeds setup's shuffle, and every board rebuilds the deck under test outright.

/** The printed sentence, byte for byte off `legalAttackCorpus()` (§1 asserts it, so a
    re-ingest disagrees with this line rather than with a number). */
const BOTTOM = "Draw 3 cards from the bottom of your deck.";
/** Its shipped SIBLING — the same count off the other end, `ATTACK_DRAW`'s twelve-printing
    reading. The nearest wrong sibling of this slice's arm, and a REAL printed sentence
    rather than a constructed one. */
const TOP = "Draw 3 cards.";
/** A residue sentence no reader claims, fielded as the LOUD control: it is what makes
    "no `ATTACK_EFFECT_SKIPPED`" mean something on the boards where nothing is drawn. Its
    refusal is asserted live in §9 rather than assumed (D480). */
const LOUD = "Choose 1 of your opponent's Active Pokémon's attacks and use it as this attack.";

const PROGRAM: readonly EffectOp[] = [{ op: "drawCards", count: 3, from: "bottom" }];
/** The v29 byte string: the SAME op with the key absent. §8 reads it back. */
const V29_PROGRAM: readonly EffectOp[] = [{ op: "drawCards", count: 3 }];

const SEED = 20260908;

// ── The board (D414: a file-local `cardPool`, no `FIXTURE_POOL` id). ─────────────────
const BOTTOM_DEAL = 0;
const TOP_DEAL = 1;
const NO_EFFECT_AT_ALL = 2;
const LOUD_INDEX = 3;

/** `d487-*` keys with no catalog row behind them (D425). The eight `d487-c<N>` cards are
    DISTINCT ids rather than eight copies of one, because every figure in this file is a
    statement about WHICH cards moved and in WHAT ORDER — a deck of identical cards makes
    all five candidate readings of §7 answer the same thing and every rung here vacuous. */
const BOTTOM_CARDS: Record<string, Card> = {
  "d487-diver": battler("d487-diver", {
    name: "D487 Diver",
    types: ["Colorless"],
    hp: 300,
    attacks: [
      { cost: ["Colorless"], name: "Bottom Deal", effect: BOTTOM },
      { cost: ["Colorless"], name: "Top Deal", effect: TOP },
      { cost: ["Colorless"], name: "Plain Cuff", damage: 10 },
      { cost: ["Colorless"], name: "Borrowed Blow", effect: LOUD },
    ],
  }),
  /** The defender. Big enough that nothing here Knocks it Out — index 2 prints a damage
      box, and a KO would end the batch before a deck could be read. */
  "d487-wall": battler("d487-wall", { name: "D487 Wall", types: ["Colorless"], hp: 340 }),
  "d487-c1": basicEnergy("d487-c1"),
  "d487-c2": basicEnergy("d487-c2"),
  "d487-c3": basicEnergy("d487-c3"),
  "d487-c4": basicEnergy("d487-c4"),
  "d487-c5": basicEnergy("d487-c5"),
  "d487-c6": basicEnergy("d487-c6"),
  "d487-c7": basicEnergy("d487-c7"),
  "d487-c8": basicEnergy("d487-c8"),
};

const BOTTOM_POOL: Record<string, Card> = { ...FIXTURE_POOL, ...BOTTOM_CARDS };

/** Its own deck (D270/D412), 60 counted before the first run:
    10 + 10 + 8×5 = 60. */
const BOTTOM_DECK = deckOf({
  "d487-diver": 10,
  "d487-wall": 10,
  "d487-c1": 5,
  "d487-c2": 5,
  "d487-c3": 5,
  "d487-c4": 5,
  "d487-c5": 5,
  "d487-c6": 5,
  "d487-c7": 5,
  "d487-c8": 5,
});

/** 🛑 **THE BOARD DECK, TOP FIRST — EIGHT CARDS, AND ITS DEPTH IS COMPUTED IN §7 RATHER
    THAN CHOSEN.** The three at the END are what this sentence takes; the five in front of
    them are what a top draw would take, and the file asserts both. */
const BOARD_DECK = [
  "d487-c1",
  "d487-c2",
  "d487-c3",
  "d487-c4",
  "d487-c5",
  "d487-c6",
  "d487-c7",
  "d487-c8",
] as const;
const BOTTOM_THREE = ["d487-c6", "d487-c7", "d487-c8"] as const;
const TOP_THREE = ["d487-c1", "d487-c2", "d487-c3"] as const;

function openTable(first: Seat): GameState {
  const created = createGame({ seed: SEED, decks: { p1: BOTTOM_DECK, p2: BOTTOM_DECK }, cardPool: BOTTOM_POOL });
  if (!created.ok) throw new Error(`createGame failed: ${created.error.code}`);
  let table = created.state;
  if (table.phase.kind !== "setup:chooseFirst") throw new Error("expected setup:chooseFirst");
  table = must(applyAction(table, { type: "chooseFirstPlayer", seat: table.phase.coinWinner, first }));
  while (table.phase.kind === "setup:drawExtra") {
    const drawing = table.phase;
    const owing = (["p1", "p2"] as const).find((s) => !drawing.decided[s]);
    if (owing === undefined) throw new Error("setup:drawExtra with every seat decided");
    table = must(applyAction(table, { type: "setupDrawExtra", seat: owing, count: drawing.owed[owing] }));
  }
  for (const seat of ["p1", "p2"] as const) {
    table = must(applyAction(table, { type: "setupPlaceActive", seat, uid: firstBasicInHand(table, seat) }));
  }
  for (const seat of ["p1", "p2"] as const) {
    table = must(applyAction(table, { type: "setupReady", seat }));
  }
  return table;
}

/** Rebuild `seat`'s DECK outright, in the exact order named, and send every card the
    setup shuffle dealt into that deck to the DISCARD instead. The deck IS the zone under
    test here, so a residual card at an unknown depth would move a figure silently — the
    same reason `opponentHandSweep.test.ts` rebuilds a hand. */
function withDeck(state: GameState, seat: Seat, ids: readonly string[]): GameState {
  const side = state.players[seat];
  const pool = [...side.deck];
  const picked: string[] = [];
  for (const id of ids) {
    const at = pool.findIndex((uid) => state.cardIdByUid[uid] === id);
    if (at < 0) throw new Error(`${seat} deck has no ${id}`);
    const [uid] = pool.splice(at, 1);
    if (uid === undefined) throw new Error("splice returned nothing");
    picked.push(uid);
  }
  return {
    ...state,
    players: { ...state.players, [seat]: { ...side, deck: picked, discard: [...side.discard, ...pool] } },
  };
}

/** p1 owns TURN 2 with the Diver Active and `deck` as its whole library, in order. */
function table(deck: readonly string[] = BOARD_DECK, attacker: Seat = "p1"): GameState {
  const defender: Seat = attacker === "p1" ? "p2" : "p1";
  let state = openTable(defender);
  state = mustApply(state, { type: "endTurn", seat: defender }).state;
  expect(state.turn).toBe(2);
  state = setActiveFromDeck(state, attacker, "d487-diver");
  state = setActiveFromDeck(state, defender, "d487-wall");
  state = clearBench(state, attacker);
  state = clearBench(state, defender);
  state = attachFromDeck(state, attacker, "d487-c1", 1);
  return withDeck(state, attacker, deck);
}

/** The card id behind a uid, off the two persisted maps the state carries. */
function idOf(uid: string, state: GameState): string {
  const id = state.cardIdByUid[uid];
  if (id === undefined) throw new Error(`no card for uid ${uid}`);
  return id;
}
const idsIn = (state: GameState, seat: Seat, zone: "hand" | "deck" | "discard"): string[] =>
  state.players[seat][zone].map((uid) => idOf(uid, state));

function swing(state: GameState, index: number): { state: GameState; events: GameEvent[] } {
  return mustApply(state, { type: "declareAttack", seat: "p1", index });
}
function find<T extends GameEvent["type"]>(events: GameEvent[], type: T): Extract<GameEvent, { type: T }> | undefined {
  return events.find((e) => e.type === type) as Extract<GameEvent, { type: T }> | undefined;
}

/** 🛑 **THE FIVE CANDIDATE READINGS, AS PURE FUNCTIONS OF THE DECK.** Written BEFORE any
    board is chosen (D484) so §7 can prove the board separates them rather than hoping it
    does. Each answers `[handGained, deckLeft]`. */
type Reading = (deck: readonly string[], count: number) => readonly [readonly string[], readonly string[]];
const READINGS: Record<string, Reading> = {
  /** ① SHIPPED — the bottom `count`, in DECK order, cut off the bottom. */
  bottomInDeckOrder: (deck, count) => {
    const cut = Math.max(0, deck.length - count);
    return [deck.slice(cut), deck.slice(0, cut)];
  },
  /** ② THE NEAREST WRONG SIBLING — the top `count`. What `from` being dropped means. */
  top: (deck, count) => [deck.slice(0, count), deck.slice(count)],
  /** ③ the bottom `count`, BOTTOM-MOST FIRST — the other reading of the printed words,
      separated from ① only by the ORDER cards enter the hand. */
  bottomReversed: (deck, count) => {
    const cut = Math.max(0, deck.length - count);
    return [[...deck.slice(cut)].reverse(), deck.slice(0, cut)];
  },
  /** ④ THE HALF-CONVERTED BUILD — draws the bottom and cuts the TOP. The shape of a
      change that threaded `from` into the slice and forgot the splice. */
  bottomDrawTopCut: (deck, count) => {
    const cut = Math.max(0, deck.length - count);
    return [deck.slice(cut), deck.slice(count)];
  },
  /** ⑤ THE UNFLOORED CUT — `deck.slice(deck.length - count)` with a negative index, which
      on a shallow deck silently takes the WHOLE deck from the wrong end. */
  unfloored: (deck, count) => [deck.slice(deck.length - count), deck.slice(0, deck.length - count)],
};
const answer = (name: string, deck: readonly string[], count: number): string => {
  const reading = READINGS[name];
  if (reading === undefined) throw new Error(`no reading ${name}`);
  return JSON.stringify(reading(deck, count));
};

// ─────────────────────────────────────────────────────────────────────────────
// §1 — THE PRINTED DATA, MEASURED OVER THE POPULATION (D423)
// ─────────────────────────────────────────────────────────────────────────────

describe("D487 §1 — the sentence and its family, measured rather than quoted", () => {
  it("the printed sentence is IN the legal attack column at exactly 1 printing", () => {
    const row = legalAttackCorpus().find(([, sentence]) => sentence === BOTTOM);
    expect(row).toBeDefined();
    expect(row?.[0]).toBe(1);
  });

  it("🛑 it is the ONLY printed draw in the whole 640-row column that names a SOURCE", () => {
    // ⚠️ THE PATTERN, PUBLISHED SO ITS EDGES ARE VISIBLE (D424/D428): every corpus row
    // that mentions either end of a deck. What it CANNOT see: a sentence that names an end
    // some other way ("the last card of your deck"), and a draw whose source is implied by
    // an earlier clause. TWO rows in 640, and only one of them is a DRAW — the other puts
    // a card on the bottom of the OPPONENT's deck and has been built since D232.
    const ends = legalAttackCorpus().filter(([, s]) => /bottom of|top of (?:your|their) deck/.test(s));
    expect(ends.map(([n, s]) => `${String(n)} ${s}`).sort()).toEqual(
      [
        "1 Draw 3 cards from the bottom of your deck.",
        "1 Your opponent reveals their hand, and you choose a card you find there and put it on the bottom of their deck.",
      ].sort(),
    );
    // …and the whole DRAW family beside it, so "the only one" is a measurement rather
    // than a claim: every corpus row whose first word is `Draw`.
    const draws = legalAttackCorpus().filter(([, s]) => s.startsWith("Draw "));
    expect(draws.map(([n, s]) => `${String(n)} ${s}`).sort()).toEqual(
      [
        "1 Draw 3 cards from the bottom of your deck.",
        "12 Draw a card.",
        "3 Draw cards until you have 7 cards in your hand.",
        "5 Draw 2 cards.",
      ].sort(),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §2 — BUILD STATE, WITH THE ORACLE THIS SURFACE ACTUALLY HAS (D480)
// ─────────────────────────────────────────────────────────────────────────────

describe("D487 §2 — the thirteen readers, run rather than read", () => {
  it("🛑 EXACTLY ONE of the 13 readers claims it, and it is `deriveAttackEffect`", () => {
    // `programFor` is not the oracle for an ATTACK sentence — `refusedPrintings.ts`'s own
    // limit 1 says so and the table deliberately carries no `"attack"` surface. The oracle
    // is the reader surface, run programmatically against the printed string.
    const surface = attackReaderSurface();
    expect(surface).toHaveLength(13);
    const claimers = surface.filter(([, read]) => read(BOTTOM) !== null);
    expect(claimers.map(([name]) => name)).toEqual(["deriveAttackEffect"]);
  });

  it("🛑 and NEITHER SPLITTER reaches it, so the row leaves the residue by the READER arm", () => {
    // The census subtracts four ways (reader, registry, gate splitter, trailing splitter).
    // A row freed by a splitter is a head-plus-tail claim, not an end-to-end one; this one
    // is claimed whole, and the difference is what makes §6's board mean anything.
    expect(splitAttackGateClause(BOTTOM)).toBeNull();
    expect(splitAttackTrailingClause(BOTTOM)).toBeNull();
  });

  it("the derived program is the op, the count and the end — nothing else", () => {
    expect(deriveAttackEffect(BOTTOM)).toEqual(PROGRAM);
    // …and the SIBLING still derives to the un-keyed op, which is the whole no-bump claim
    // in one line: the twelve printings that were authored before this slice are byte
    // identical after it.
    expect(deriveAttackEffect(TOP)).toEqual(V29_PROGRAM);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §3 — WHAT THE ANCHOR CLAIMS OVER ALL 640 ROWS, AND WHAT EVERY WIDENING WOULD (D472)
// ─────────────────────────────────────────────────────────────────────────────

describe("D487 §3 — the yield, and five widenings that buy nothing", () => {
  it("🛑 the anchor claims EXACTLY this row — 1 sentence / 1 printing over 640", () => {
    const claimed = legalAttackCorpus().filter(([, s]) => {
      const program = deriveAttackEffect(s);
      return program !== null && program.some((op) => op.op === "drawCards" && op.from === "bottom");
    });
    expect(claimed.map(([, s]) => s)).toEqual([BOTTOM]);
    expect(claimed.reduce((sum, [n]) => sum + n, 0)).toBe(1);
  });

  it("🛑 EVERY widening of the anchor claims the IDENTICAL 1 / 1 — measured, not argued", () => {
    // D473's finding at a second address: a widening that claims the same rows buys
    // nothing and costs a wrong program. All five are asked over the whole column.
    const column = legalAttackCorpus();
    const yields = (re: RegExp): string => JSON.stringify(column.filter(([, s]) => re.test(s)).map(([, s]) => s));
    const mine = JSON.stringify([BOTTOM]);
    // ① a singular alternation, `ATTACK_DRAW`'s own shape;
    expect(yields(/^Draw (?:(\d+) cards|a card) from the bottom of your deck\.$/)).toBe(mine);
    // ② either end of the deck;
    expect(yields(/^Draw (\d+) cards from the (?:top|bottom) of your deck\.$/)).toBe(mine);
    // ③ either owner;
    expect(yields(/^Draw (\d+) cards from the bottom of (?:your|their) deck\.$/)).toBe(mine);
    // ④ an unanchored tail — the shape that reads a compound sentence as its first clause;
    expect(yields(/^Draw (\d+) cards from the bottom of your deck\./)).toBe(mine);
    // ⑤ an unanchored head.
    expect(yields(/Draw (\d+) cards from the bottom of your deck\.$/)).toBe(mine);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §4 — THE ONE-AXIS REFUSALS (D484: every rung differs from its control in ONE axis)
// ─────────────────────────────────────────────────────────────────────────────

describe("D487 §4 — the axes, refused independently", () => {
  it("🛑 the SOURCE alone: `top` is the un-keyed op's reading and must not be spelled", () => {
    // The control is the shipped sentence one token away. A widened `(?:top|bottom)` would
    // derive `from: "top"` — a value the op does not carry and the interpreter would read
    // as "not bottom", i.e. correct by accident on a spelling nothing prints.
    expect(deriveAttackEffect("Draw 3 cards from the top of your deck.")).toBeNull();
    expect(deriveAttackEffect(BOTTOM)).toEqual(PROGRAM);
  });

  it("🛑 the OWNER alone, both spellings — you never draw off the other seat's deck", () => {
    expect(deriveAttackEffect("Draw 3 cards from the bottom of your opponent's deck.")).toBeNull();
    expect(deriveAttackEffect("Draw 3 cards from the bottom of their deck.")).toBeNull();
  });

  it("the ARTICLE alone — no singular branch, because no printing spells one (D104)", () => {
    // `ATTACK_DRAW` carries `(?:(\d+) cards|a card)` because BOTH spellings are printed.
    // Here only the plural is, so a singular branch would invent a `1` no census reaches
    // and no mutant can kill — D231's unkillable-arm test on an alternation.
    expect(deriveAttackEffect("Draw a card from the bottom of your deck.")).toBeNull();
    expect(legalAttackCorpus().some(([, s]) => s === "Draw a card from the bottom of your deck.")).toBe(false);
  });

  it("the COUNT alone — 0 is refused by the family's `>= 1` guard, 1 and 5 are read", () => {
    expect(deriveAttackEffect("Draw 0 cards from the bottom of your deck.")).toBeNull();
    expect(deriveAttackEffect("Draw 1 cards from the bottom of your deck.")).toEqual([
      { op: "drawCards", count: 1, from: "bottom" },
    ]);
    expect(deriveAttackEffect("Draw 5 cards from the bottom of your deck.")).toEqual([
      { op: "drawCards", count: 5, from: "bottom" },
    ]);
  });

  it("🛑 the ANCHORING alone, both ends — a compound sentence is not read as its head", () => {
    expect(deriveAttackEffect(`${BOTTOM} Then, shuffle your deck.`)).toBeNull();
    expect(deriveAttackEffect(`Discard your hand. ${BOTTOM}`)).toBeNull();
    expect(deriveAttackEffect("Draw 3 cards from the bottom of your deck")).toBeNull();
  });

  it("🛑 the two anchors are STRUCTURALLY disjoint, so neither owes the other a guard", () => {
    // D467's first preference. `ATTACK_DRAW` ends at `\.$` right after its count and cannot
    // reach a string that continues; this one cannot reach a string that stops. Asserted
    // from BOTH sides, so the ORDER of the two arms is legibility rather than behaviour.
    expect(deriveAttackEffect(TOP)).toEqual(V29_PROGRAM);
    expect(deriveAttackEffect(BOTTOM)).not.toEqual(V29_PROGRAM);
    expect(BOTTOM.startsWith(TOP.slice(0, -1))).toBe(true);
    expect(TOP.endsWith(".")).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §5 — THE COMPOSITION QUESTION, DRIVEN (D482)
// ─────────────────────────────────────────────────────────────────────────────

describe("D487 §5 — no composition of shipped ops spells a bottom draw", () => {
  it("🛑 `bottomDeckTop` + `drawCards` needs a number no sentence carries, and SHUFFLES", () => {
    // The near-miss, driven rather than dismissed. Rotating the bottom three to the top
    // needs `n = deck.length − 3`; the op's `n` is a printed literal on an authored row,
    // and no printed sentence carries a deck size. Even given the number, the op shuffles
    // its own window (its doc block: "an RNG consumer") — so the composition destroys the
    // order it was reached for. DRIVEN: run it and watch the deck.
    const state = table();
    const events: GameEvent[] = [];
    const rotated = runProgram(
      state,
      [{ op: "bottomDeckTop", n: 5 }, { op: "drawCards", count: 3 }],
      { seat: "p1", source: "effect" },
      events,
    );
    const hand = idsIn(rotated.state, "p1", "hand").slice(-3);
    // The three cards DO arrive — and the deck underneath them is no longer the deck the
    // sentence left alone: the five rotated cards are in RNG order, not printed order.
    expect(hand.slice().sort()).toEqual([...BOTTOM_THREE].sort());
    expect(idsIn(rotated.state, "p1", "deck")).not.toEqual([...TOP_THREE, "d487-c4", "d487-c5"]);
    // …while the shipped arm leaves the survivors in their printed order.
    const straight: GameEvent[] = [];
    const drawn = runProgram(state, PROGRAM, { seat: "p1", source: "effect" }, straight);
    expect(idsIn(drawn.state, "p1", "deck")).toEqual([...TOP_THREE, "d487-c4", "d487-c5"]);
  });

  it("the RNG is the separating fact, and it is measured on `rngState` rather than argued", () => {
    const state = table();
    const a: GameEvent[] = [];
    const rotated = runProgram(state, [{ op: "bottomDeckTop", n: 5 }], { seat: "p1", source: "effect" }, a);
    expect(rotated.state.rngState).not.toBe(state.rngState);
    const b: GameEvent[] = [];
    const drawn = runProgram(state, PROGRAM, { seat: "p1", source: "effect" }, b);
    expect(drawn.state.rngState).toBe(state.rngState);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §6 — THE BOARD: the op MEANS something (three cards, and WHICH three)
// ─────────────────────────────────────────────────────────────────────────────

describe("D487 §6 — the printed sentence on a real board", () => {
  it("🛑 the BOTTOM three arrive, in DECK order, and the top five are untouched", () => {
    const before = table();
    expect(idsIn(before, "p1", "deck")).toEqual([...BOARD_DECK]);
    const handBefore = idsIn(before, "p1", "hand");
    const { state, events } = swing(before, BOTTOM_DEAL);
    expect(idsIn(state, "p1", "hand")).toEqual([...handBefore, ...BOTTOM_THREE]);
    expect(idsIn(state, "p1", "deck")).toEqual([...TOP_THREE, "d487-c4", "d487-c5"]);
    // …and the EVENT names them, in the same order, so the log and the zone agree.
    const drawn = find(events, "CARDS_DRAWN");
    expect(drawn?.seat).toBe("p1");
    expect(drawn?.uids.map((uid) => idOf(uid, state))).toEqual([...BOTTOM_THREE]);
    expect(drawn?.reason).toBe("effect");
  });

  it("🛑 THE NEAREST WRONG SIBLING, ON THE SAME BOARD — the top three, and it is PRINTED", () => {
    // Index 1 prints "Draw 3 cards." — the shipped twelve-printing reading. Same board,
    // same count, one axis: which end. If this rung and the one above ever agree, the
    // slice has bought nothing.
    const before = table();
    const handBefore = idsIn(before, "p1", "hand");
    const { state } = swing(before, TOP_DEAL);
    expect(idsIn(state, "p1", "hand")).toEqual([...handBefore, ...TOP_THREE]);
    expect(idsIn(state, "p1", "deck")).toEqual(["d487-c4", "d487-c5", ...BOTTOM_THREE]);
  });

  it("the two arms take DISJOINT card sets on this board, which is what makes it a board", () => {
    const bottom = idsIn(swing(table(), BOTTOM_DEAL).state, "p1", "hand");
    const top = idsIn(swing(table(), TOP_DEAL).state, "p1", "hand");
    expect(bottom).not.toEqual(top);
    expect(BOTTOM_THREE.some((id) => TOP_THREE.includes(id as never))).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §7 — THE COUNTERWEIGHT: five readings, and the depth at which they collide (D486)
// ─────────────────────────────────────────────────────────────────────────────

describe("D487 §7 — the collision table, computed before the board was chosen", () => {
  it("🛑 at EIGHT cards the five readings answer FIVE DIFFERENT things", () => {
    const answers = Object.keys(READINGS).map((name) => answer(name, BOARD_DECK, 3));
    expect(new Set(answers).size).toBe(5);
  });

  it("🛑 AT A ONE-CARD DECK ALL FIVE ARE BYTE-IDENTICAL — no board there separates anything", () => {
    // D486's shape at a new address, and it is an ARITHMETIC identity rather than a board
    // coincidence: both ends share the cut `max(0, len − count)`, which is 0 whenever the
    // deck is no deeper than the count, so every reading takes the whole deck in the one
    // order it has. A suite that reached for a small deck would have been green for
    // nothing at all.
    const answers = Object.keys(READINGS).map((name) => answer(name, ["d487-c1"], 3));
    expect(new Set(answers).size).toBe(1);
  });

  it("🛑 the collision SHRINKS as the deck deepens, and the table is computed not asserted", () => {
    const distinct = (deck: readonly string[]): number =>
      new Set(Object.keys(READINGS).map((name) => answer(name, deck, 3))).size;
    expect(distinct(BOARD_DECK.slice(0, 1))).toBe(1);
    expect(distinct(BOARD_DECK.slice(0, 2))).toBe(2);
    expect(distinct(BOARD_DECK.slice(0, 3))).toBe(3);
    expect(distinct(BOARD_DECK.slice(0, 4))).toBe(5);
    expect(distinct(BOARD_DECK)).toBe(5);
    // 🛑 THE ONE THAT MATTERS: at THREE cards the shipped reading and the nearest wrong
    // sibling are the SAME ANSWER, so a three-card board cannot fail on the defect this
    // whole slice is about. FOUR is the first depth at which it can.
    expect(answer("bottomInDeckOrder", BOARD_DECK.slice(0, 3), 3)).toBe(answer("top", BOARD_DECK.slice(0, 3), 3));
    expect(answer("bottomInDeckOrder", BOARD_DECK.slice(0, 4), 3)).not.toBe(
      answer("top", BOARD_DECK.slice(0, 4), 3),
    );
  });

  it("🛑 the ENGINE agrees with reading ① on the deep board and with BOTH on the shallow one", () => {
    // The pure table above is only worth something if the engine is on it. Driven at both
    // depths through the real attack, not through `runProgram`.
    const deep = swing(table(), BOTTOM_DEAL).state;
    const [gainedDeep, leftDeep] = READINGS.bottomInDeckOrder?.(BOARD_DECK, 3) ?? [[], []];
    expect(idsIn(deep, "p1", "deck")).toEqual([...leftDeep]);
    expect(idsIn(deep, "p1", "hand").slice(-3)).toEqual([...gainedDeep]);
    // …and on a three-card deck the two PRINTED sentences become indistinguishable: same
    // hand, same empty deck. The identity is REAL, not a gap in this file.
    const shallow = BOARD_DECK.slice(0, 3);
    const viaBottom = swing(table(shallow), BOTTOM_DEAL).state;
    const viaTop = swing(table(shallow), TOP_DEAL).state;
    expect(idsIn(viaBottom, "p1", "hand")).toEqual(idsIn(viaTop, "p1", "hand"));
    expect(idsIn(viaBottom, "p1", "deck")).toEqual([]);
    expect(idsIn(viaTop, "p1", "deck")).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §8 — `MATCH_RECORD_VERSION` STAYS 29, DRIVEN AT AN ADDRESS THAT PERSISTS
// ─────────────────────────────────────────────────────────────────────────────

describe("D487 §8 — the version question, asked at the hard address", () => {
  it("🛑 `drawCards` REALLY DOES ride a persisted continuation — the claim is not dodged", () => {
    // D473-ii: a rule that turns on persistence must be applied at an address that
    // persists. `drawCards` never parks itself, but D473's pair puts it inside
    // `recordGate.then` behind `payFromHand`, which DOES — so the op lands in
    // `state.phase`, which `MatchRecord.state` saves whole. Driven, so the no-bump
    // argument below is earned rather than inherited from "it never parks".
    const state = table();
    const events: GameEvent[] = [];
    const run = runProgram(
      state,
      [
        { op: "payFromHand", count: 1, to: "discard", recordAs: "paid" },
        { op: "recordGate", slot: "paid", then: [{ op: "drawCards", count: 3, from: "bottom" }] },
      ],
      { seat: "p1", source: "effect" },
      events,
    );
    expect(run.state.phase.kind).toBe("effect:prompt");
    expect(JSON.stringify(run.state.phase)).toContain('"from":"bottom"');
  });

  it("🛑 a v29 byte string — the SAME op with the key ABSENT — still means the TOP draw", () => {
    // This block's discriminator is "would an OLD RECORD MEAN SOMETHING ELSE", not "is the
    // type still assignable". The un-keyed op is what every deploy before this slice
    // wrote; run it and it takes the top three, exactly as it did.
    const state = table();
    const events: GameEvent[] = [];
    const run = runProgram(state, V29_PROGRAM, { seat: "p1", source: "effect" }, events);
    expect(idsIn(run.state, "p1", "deck")).toEqual(["d487-c4", "d487-c5", ...BOTTOM_THREE]);
    expect(idsIn(run.state, "p1", "hand").slice(-3)).toEqual([...TOP_THREE]);
  });

  it("the ABSENT key and an explicit top draw are the same bytes — there is no `\"top\"`", () => {
    // A `from: "top"` value would be a SECOND spelling of one state, and two spellings of
    // one state is how a wire and a reader drift apart. The union has one member and the
    // absence; the corpus and the registry are swept for the other spelling.
    expect(JSON.stringify(deriveAttackEffect(TOP))).not.toContain("from");
    for (const [, sentence] of legalAttackCorpus()) {
      expect(JSON.stringify(deriveAttackEffect(sentence) ?? [])).not.toContain('"from":"top"');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §9 — THE ZERO-MATCH BOARD, and the controls that separate it from silence
// ─────────────────────────────────────────────────────────────────────────────

describe("D487 §9 — an empty deck, and three silences that are not the same silence", () => {
  it("🛑 an EMPTY deck draws NOTHING and emits no `CARDS_DRAWN` — a short draw, not a throw", () => {
    // §14.3 deck-out is a turn-START rule, so attacking on an empty deck is legal and the
    // draw simply finds nothing. The shipped arm and the sibling agree here — which is
    // exactly why this board needs the controls below to mean anything.
    const { state, events } = swing(table([]), BOTTOM_DEAL);
    expect(idsIn(state, "p1", "deck")).toEqual([]);
    expect(types(events)).not.toContain("CARDS_DRAWN");
  });

  it("🛑 THE ATTRIBUTION CONTROL — the program RAN, so no `ATTACK_EFFECT_SKIPPED` fires", () => {
    // Without this the rung above passes on a build where the arm was never reached at
    // all, which is the vacuous-guard shape this repo keeps finding (D200 → D214).
    const { events } = swing(table([]), BOTTOM_DEAL);
    expect(types(events)).not.toContain("ATTACK_EFFECT_SKIPPED");
    // …and index 3's sentence, which NO reader claims, still reports itself as unread on
    // the same body and the same board. Two silences told apart in one board.
    const loud = swing(table([]), LOUD_INDEX);
    const skipped = find(loud.events, "ATTACK_EFFECT_SKIPPED");
    expect(skipped?.effect).toBe(LOUD);
    expect(resolvedByAnyReader(LOUD)).toBe(false);
  });

  it("the THIRD silence: an attack printing no effect text at all reports nothing either", () => {
    // `ATTACK_EFFECT_SKIPPED` is about an effect that was PRINTED and not read. Index 2
    // prints a damage box and no effect, so it is silent for a third reason — the one that
    // makes "no skip row" on the bottom-draw index a fact about the reader rather than
    // about the event.
    const { events } = swing(table([]), NO_EFFECT_AT_ALL);
    expect(types(events)).not.toContain("ATTACK_EFFECT_SKIPPED");
    expect(types(events)).not.toContain("CARDS_DRAWN");
    expect(types(events)).toContain("ATTACK_DAMAGE");
  });

  it("a deck SHALLOWER than the count short-draws what is there, off the same cut", () => {
    const { state, events } = swing(table(BOARD_DECK.slice(0, 2)), BOTTOM_DEAL);
    expect(idsIn(state, "p1", "deck")).toEqual([]);
    const drawn = find(events, "CARDS_DRAWN");
    expect(drawn?.uids).toHaveLength(2);
  });
});
