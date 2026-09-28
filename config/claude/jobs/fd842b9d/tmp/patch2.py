import pathlib, sys
NOTE = ('(\U0001f195\U0001f195\U0001f195 **D517 {d} — THE PRIZE-GATED PARALYSIS** — `censusAttackCorpus.ts` '
 '**FILE LINE 342**, *"If you have exactly 1 Prize card remaining, your opponent\'s Active Pokémon is now Paralyzed."*, '
 '**1 sentence / 1 legal printing**, claimed WHOLE by `deriveAttackEffect` arm 6a-iii through ONE new anchor '
 '(`SELF_PRIZE_GATE_PARALYZE`) and ONE new `BoardCondition` member (`yourPrizesRemaining`, the **61st**). '
 '⚠️ **THE SENTENCE STEP AND THE PRINTING STEP AGREE AT 1 AND 1**, measured at this head. '
 'RAW summand ALONE — registry 10/16, gate 5/13, trailing 11/21 all re-measured unmoved — and the reader surface stands still at **13**.)')
def patch(f, ln, subs, d):
    p = pathlib.Path(f); lines = p.read_text(encoding='utf-8').split('\n')
    i = ln - 1; new = lines[i]
    for a, b in subs:
        assert a in new, (f, ln, a, new[:200]); new = new.replace(a, b, 1)
    note = NOTE.format(d=d)
    marker = "  // (\U0001f195\U0001f195\U0001f195 **D5"
    if marker in new: new = new.replace(marker, "  // " + note + " (\U0001f195\U0001f195\U0001f195 **D5", 1)
    elif "  // " in new: new = new.replace("  // ", "  // " + note + " ", 1)
    else: new = new + "  // " + note
    lines[i] = new
    p.write_text('\n'.join(lines), encoding='utf-8'); print("patched", f, ln)
