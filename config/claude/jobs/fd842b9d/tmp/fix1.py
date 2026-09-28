import io
P = "packages/engine/src/boardWideSpread.test.ts"
with io.open(P, encoding="utf-8") as fh:
    src = fh.read()

def sub(find, repl):
    global src
    parts = src.split(find)
    assert len(parts) == 2, "occurrences=%d for %r" % (len(parts) - 1, find[:70])
    src = repl.join(parts)

# ── imports: add activeUid / benchTopUid
sub("""  OWN_BENCH_SNIPE_DECK,
  attachFromDeck,""",
    """  OWN_BENCH_SNIPE_DECK,
  activeUid,
  attachFromDeck,""")
sub("""  benchFromDeck,
  clearBench,""",
    """  benchFromDeck,
  benchTopUid,
  clearBench,""")

# ── BENCH_ONLY is a CONSTRUCTED control; name the printed row beside it
sub("""/** The SHIPPED bench-only sibling at the same amount — `SPREAD_EACH_BENCH`'s string.
    The control without which every "the Active is reached" rung below would be
    consistent with a reader that claims everything (D424's rule). */
const BENCH_ONLY =
  "This attack does 30 damage to each of your opponent's Benched Pokémon. (Don't apply Weakness and Resistance for Benched Pokémon.)";""",
    """/** The SHIPPED bench-only sibling AT THIS SUITE'S AMOUNT — `SPREAD_EACH_BENCH`'s
    string. The control without which every "the Active is reached" rung below would be
    consistent with a reader that claims everything (D424's rule).
    ⚠️ **CONSTRUCTED, AND SAID SO** (D452: a byte pin on an invented string is green by
    construction). The column prints this skeleton at 50/10/20 and NOT at 30, so the
    30 here is a board parameter and only `BENCH_ONLY_PRINTED` below is corpus data. */
const BENCH_ONLY =
  "This attack does 30 damage to each of your opponent's Benched Pokémon. (Don't apply Weakness and Resistance for Benched Pokémon.)";
/** …and the REAL printed row of that skeleton, 3 legal printings, which is what §1
    pins. The amount is the only difference, and `SPREAD_EACH_BENCH` captures it. */
const BENCH_ONLY_PRINTED =
  "This attack does 50 damage to each of your opponent's Benched Pokémon. (Don't apply Weakness and Resistance for Benched Pokémon.)";""")

# ── §1 printed-bytes rung: real counts
sub("""    expect(rows.get(CHOSEN_ONE)).toBe(3);
    expect(rows.get(BENCH_ONLY)).toBe(3);""",
    """    expect(rows.get(CHOSEN_ONE)).toBe(2);
    expect(rows.get(BENCH_ONLY_PRINTED)).toBe(3);
    // ⚠️ …and the amount this suite's boards use for that skeleton is NOT printed at
    // all, which is stated rather than left for a reader to assume (D452).
    expect(rows.get(BENCH_ONLY)).toBeUndefined();""")

with io.open(P, "w", encoding="utf-8") as fh:
    fh.write(src)
print("ok")
