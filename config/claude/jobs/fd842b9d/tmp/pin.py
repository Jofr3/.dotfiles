import io, sys, json

NOTE = ("(\U0001f195\U0001f195\U0001f195 **D488 +2 sentences / +2 printings — MILL YOUR OWN DECK, THEN SCALE "
        "BY WHAT WAS MILLED** — `censusAttackCorpus.ts` FILE LINES **126** and **129**, "
        "*\"Discard the top {3|7} cards of your deck, and this attack does {80|70} damage for each "
        "{Energy card|Misty's Pokémon that} you discarded in this way.\"*, **2 sentences / 2 legal "
        "printings**, both claimed WHOLE by `deriveAttackEffect` through ONE new anchor "
        "`DECK_MILL_FILTERED_SCALED_DAMAGE` and TWO OPTIONAL keys on TWO SHIPPED ops "
        "(`discardDeckTop.recordAs`, `damageDefender.countFilter`). \U0001f6d1 **THE TWO ROWS SHARE ONE "
        "BLOCKER AND IT WAS PROVED BY AXIS DELETION, NOT BY RESEMBLANCE** (D483's cluster split 2+2 under "
        "the same test). **ZERO** new `EffectOp`/`EffectSlot`/`CardFilter`/`DamageCountSource` members, "
        "readers (surface still **13**), prompts, parks, events, `FIXTURE_POOL` ids or `packages/schema` "
        "bytes. ⚠️ **THE SENTENCE STEP AND THE PRINTING STEP AGREE AT 2 AND 2**, MEASURED "
        "(D451/D461/D465).) ")

def edit(path, lineno, pairs, annotate=True):
    with io.open(path, encoding="utf-8") as fh:
        lines = fh.readlines()
    i = lineno - 1
    line = lines[i]
    for old, new in pairs:
        if old not in line:
            raise SystemExit(f"MISS {path}:{lineno} :: {old!r}\n{line[:400]}")
        line = line.replace(old, new, 1)
    if annotate:
        marker = "// "
        at = line.find(marker)
        if at < 0:
            raise SystemExit(f"NO COMMENT {path}:{lineno}")
        cut = at + len(marker)
        line = line[:cut] + NOTE + line[cut:]
    lines[i] = line
    with io.open(path, "w", encoding="utf-8") as fh:
        fh.writelines(lines)
    print("ok", path, lineno)

if __name__ == "__main__":
    spec = json.load(open(sys.argv[1]))
    for row in spec:
        edit(row["file"], row["line"], row["pairs"], row.get("annotate", True))
