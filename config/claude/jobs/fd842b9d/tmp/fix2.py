import io
P = "packages/engine/src/boardWideSpread.test.ts"
with io.open(P, encoding="utf-8") as fh:
    src = fh.read()

def sub(find, repl):
    global src
    parts = src.split(find)
    assert len(parts) == 2, "occurrences=%d for %r" % (len(parts) - 1, find[:70])
    src = repl.join(parts)

# ── withEffect also re-prints the DAMAGE box, and the reason is the whole of §8.
sub("""/** Re-text `fix-pinpoint`'s attack INDEX 0 on a board's OWN `cardPool` copy.
    ⚠️ **NOT A FIXTURE EDIT** — `FIXTURE_POOL` is shared by every suite in this package
    and D412 reddened three of D409's boards by widening a shared one. This mutates a
    per-board clone, so nothing outside the calling `it` can see it. */
function withEffect(state: GameState, effect: string): GameState {
  const card = state.cardPool["fix-pinpoint"];
  if (card === undefined) throw new Error("no fix-pinpoint in pool");
  const attacks = card.attacks ?? [];
  const first = attacks[0];
  if (first === undefined) throw new Error("fix-pinpoint has no attack 0");
  return {
    ...state,
    cardPool: {
      ...state.cardPool,
      "fix-pinpoint": { ...card, attacks: [{ ...first, effect }, ...attacks.slice(1)] },
    },
  };
}""",
    """/** The printed damage box this suite gives its demonstrator, and it is chosen to be
    UNLIKE every other number on the board.

    \U0001f6d1 **90 RATHER THAN `fix-pinpoint`'s OWN 30, AND THE COINCIDENCE IT AVOIDS WAS FOUND
    BY RUNNING THE SUITE RATHER THAN BY READING IT.** At the fixture's printed 30 the
    two candidate programs answer IDENTICALLY on the load-bearing board — mine drops the
    base and deals the op's 30 through ×2 (60), the bench-only sibling KEEPS the base and
    deals the printed 30 through ×2 (60) — so all four `DAMAGE_DEALT` rows agree and the
    discriminator §4 exists for is silently vacuous. **That is D479's UNKILLABLE-AS-WRITTEN
    class arriving in a suite instead of in a mutant row**, and it was invisible until a
    control went green for the wrong reason. At 90 the two answer 60 and 180. */
const PRINTED_BASE = 90;

/** Re-text `fix-pinpoint`'s attack INDEX 0 — BOTH its effect string and its printed
    damage box — on a board's OWN `cardPool` copy.
    ⚠️ **NOT A FIXTURE EDIT** — `FIXTURE_POOL` is shared by every suite in this package
    and D412 reddened three of D409's boards by widening a shared one. This mutates a
    per-board clone, so nothing outside the calling `it` can see it. */
function withEffect(state: GameState, effect: string): GameState {
  const card = state.cardPool["fix-pinpoint"];
  if (card === undefined) throw new Error("no fix-pinpoint in pool");
  const attacks = card.attacks ?? [];
  const first = attacks[0];
  if (first === undefined) throw new Error("fix-pinpoint has no attack 0");
  return {
    ...state,
    cardPool: {
      ...state.cardPool,
      "fix-pinpoint": {
        ...card,
        attacks: [{ ...first, effect, damage: PRINTED_BASE }, ...attacks.slice(1)],
      },
    },
  };
}""")

# ── §4.2 — the bench-only program KEEPS its base
sub("""  it("…and the bench-only program leaves the Active at ZERO on the same board", () => {
    // THE DISCRIMINATOR, driven rather than argued: the SAME board, the SAME amount, the
    // sibling sentence. If the arm had reused `SPREAD_EACH_BENCH`'s program this is the
    // board it would have produced, and §4.1's first row is the only thing that differs.
    const { state: done, events } = swing(loaded(BENCH_ONLY));
    expect(damage(events).map((d) => d.dealt)).toEqual([30, 30, 30]);
    expect(done.players.p2.active?.damage).toBe(0);
  });""",
    """  it("…and the bench-only program answers 180 on the Active, not 60 — a DIFFERENT board", () => {
    // THE DISCRIMINATOR, driven rather than argued: the SAME board, the SAME amount, the
    // sibling sentence. If the arm had reused `SPREAD_EACH_BENCH`'s program this is the
    // board it would have produced. ⚠️ **THE ACTIVE IS STILL HIT — by the PRINTED BASE,
    // which that program does not claim** — so the discriminator is the NUMBER and not
    // the presence of a row, and at `fix-pinpoint`'s own printed 30 the two programs
    // would have agreed on all four rows (see `PRINTED_BASE`).
    const { state: done, events } = swing(loaded(BENCH_ONLY));
    expect(damage(events).map((d) => d.dealt)).toEqual([180, 30, 30, 30]);
    expect(done.players.p2.active?.damage).toBe(180);
  });""")

# ── §5.1 card identity
sub("""    // …and the two bodies really are the same printed card, so the pair above is a
    // statement about the ZONE and not about two different fixtures.
    expect(done.players.p2.active?.cardId).toBe("fix-fighting-weak");
    expect(done.players.p2.bench[0]?.cardId).toBe("fix-fighting-weak");""",
    """    // …and the two bodies really are the same printed card, resolved through
    // `cardIdByUid` off the stack top, so the pair above is a statement about the ZONE
    // and not about two different fixtures.
    expect(done.cardIdByUid[activeUid(done, "p2")]).toBe("fix-fighting-weak");
    expect(done.cardIdByUid[benchTopUid(done, "p2", 0)]).toBe("fix-fighting-weak");""")

# ── §7.2 control
sub("""  it("…and the CONTROL: the same empty bench under the bench-only sibling does NOTHING", () => {
    // The control that makes the rung above a statement about the ACTIVE half. Under
    // `SPREAD_EACH_BENCH`'s program this board files no damage at all — so "60" above is
    // the `damageDefender` half and nothing else.
    const state = board("fix-pinpoint", "fix-fighting-weak");
    const { state: done, events } = swing(withEffect(state, BENCH_ONLY));
    expect(damage(events)).toEqual([]);
    expect(done.players.p2.active?.damage).toBe(0);
  });""",
    """  it("…and the CONTROL: the same empty bench under the bench-only sibling files the BASE", () => {
    // The control that makes the rung above a statement about the ACTIVE half. Under
    // `SPREAD_EACH_BENCH`'s program the spread half has nothing to walk and the ONE row
    // that lands is the PRINTED BASE through ×2 — 180, not 60. So the 60 above is the
    // `damageDefender` op and nothing else, which no "did anything land?" assertion
    // could have said.
    const state = board("fix-pinpoint", "fix-fighting-weak");
    const { state: done, events } = swing(withEffect(state, BENCH_ONLY));
    expect(damage(events)).toEqual([{ seat: "p2", by: "p1", dealt: 180 }]);
    expect(done.players.p2.active?.damage).toBe(180);
  });""")

# ── §7.3 printed zero: the base still lands
sub("""  it("…and a printed ZERO places nothing anywhere, on a board that is otherwise §4's", () => {
    // Both ops guard `amount <= 0` independently, so a 0 is a no-op on BOTH zones rather
    // than on one — the asymmetry that would exist if only one of them carried a guard.
    const { state: done, events } = swing(loaded(PRINTED.replace("30 damage", "0 damage")));
    expect(damage(events)).toEqual([]);
    expect(done.players.p2.active?.damage).toBe(0);
    expect(done.players.p2.bench.map((p) => p.damage)).toEqual([0, 0, 0]);
  });""",
    """  it("…and a printed ZERO places nothing FROM EITHER OP, on a board that is otherwise §4's", () => {
    // Both ops guard `amount <= 0` independently, so a 0 is a no-op on BOTH zones rather
    // than on one — the asymmetry that would exist if only one of them carried a guard.
    // ⚠️ **THE BASE IS STILL DROPPED**, because `programDamage` reads the op NAME and not
    // its amount: the program still contains a `damageDefender`, so the printed 90 does
    // not leak back in through the gap the guards open. That is the one board on which
    // "the amount is zero" and "the base is claimed" are separable, and it is here
    // rather than argued.
    const { state: done, events } = swing(loaded(PRINTED.replace("30 damage", "0 damage")));
    expect(damage(events)).toEqual([]);
    expect(done.players.p2.active?.damage).toBe(0);
    expect(done.players.p2.bench.map((p) => p.damage)).toEqual([0, 0, 0]);
  });""")

# ── §8
sub("""  it("\U0001f6d1 `fix-pinpoint` prints `damage: 30` and the Active still takes ONE hit, not two", () => {
    // \U0001f6d1 THE MECHANISM BEHIND §3's `also` REFUSAL, DRIVEN. The demonstrator prints a
    // `damage` of 30 at index 0. `attack.ts`'s `programDamage` sees the `damageDefender`
    // in this program and zeroes the base, so the Active takes the OP's 30 (×2 = 60) and
    // nothing else. Were the base kept, this board would file TWO rows of 60 and the
    // Active would sit at 120 — which is exactly what an admitted "also" wording would
    // deserve and this one would not.
    const state = loaded();
    expect(state.cardPool["fix-pinpoint"]?.attacks?.[0]?.damage).toBe(30);
    const { state: done, events } = swing(state);
    expect(damage(events).filter((d) => d.dealt === 60)).toHaveLength(1);
    expect(done.players.p2.active?.damage).toBe(60);
  });

  it("…and the sibling KEEPS its base on the identical board, which is the control", () => {
    // `spreadDamage` alone does NOT satisfy `programDamage`, so the printed 30 lands as
    // the main hit and doubles to 60 on the ×2 Active — the same 60, arriving by a
    // completely different route, plus the three flat bench rows. Without this control,
    // §8.1 is consistent with an engine that never deals a printed base at all.
    const { state: done, events } = swing(loaded(BENCH_ONLY));
    expect(damage(events).map((d) => d.dealt)).toEqual([30, 30, 30]);
    expect(done.players.p2.active?.damage).toBe(60);
  });""",
    """  it("\U0001f6d1 the demonstrator prints `damage: 90` and the Active takes 60 — the OP's number", () => {
    // \U0001f6d1 THE MECHANISM BEHIND §3's `also` REFUSAL, DRIVEN. `attack.ts`'s
    // `programDamage` sees the `damageDefender` in this program and zeroes the printed
    // base, so the Active takes the OP's 30 through ×2 (60) and the printed 90 never
    // lands. Were the base kept — which is exactly what an admitted "also" wording would
    // deserve and this one would not — this board would file 180 first and 60 after it.
    const state = loaded();
    expect(state.cardPool["fix-pinpoint"]?.attacks?.[0]?.damage).toBe(PRINTED_BASE);
    const { state: done, events } = swing(state);
    expect(damage(events).map((d) => d.dealt)).toEqual([60, 30, 30, 30]);
    expect(damage(events).some((d) => d.dealt === 180)).toBe(false);
    expect(done.players.p2.active?.damage).toBe(60);
  });

  it("…and the sibling KEEPS its base on the identical board, which is the control", () => {
    // `spreadDamage` alone does NOT satisfy `programDamage`, so the printed 90 lands as
    // the main hit and doubles to 180 on the ×2 Active, plus the three flat bench rows.
    // Without this control, §8.1 is consistent with an engine that never deals a printed
    // base at all — and at `fix-pinpoint`'s own printed 30 the two boards would have been
    // byte-identical (see `PRINTED_BASE`).
    const { state: done, events } = swing(loaded(BENCH_ONLY));
    expect(damage(events).map((d) => d.dealt)).toEqual([180, 30, 30, 30]);
    expect(done.players.p2.active?.damage).toBe(180);
  });""")

with io.open(P, "w", encoding="utf-8") as fh:
    src2 = src
    fh.write(src2)
print("ok")
