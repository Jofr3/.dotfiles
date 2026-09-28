P = "packages/engine/src/censusAtHead.test.ts"
orig = open(P, "rb").read(); text = orig.decode("utf-8")
FIND = "  attack: 1580, // \U0001f195\U0001f195 D473 "
NOTE = ("  attack: 1582, // \U0001f195\U0001f195 D474 +1 sentence / +2 printings (THE BOARD-COUNTED COIN FLIP OVER BODIES "
        "— `censusAttackCorpus.ts` **FILE LINE 233**, *\"Flip a coin for each {D} Pokémon you have in play. This attack does 60 "
        "damage for each heads.\"*, **1 sentence / 2 legal printings**, claimed WHOLE by `deriveAttackCoinFlip` through the new "
        "`ATTACK_COIN_PER_BODY_IN_PLAY` anchor and the new fourth `AttackFlipCount` member `pokemonInPlay`. RAW summand ALONE: no "
        "registry row, no gate split and no trailing split is involved — measured, not assumed: no corpus row is this sentence "
        "followed by a `deriveAttackEffect` tail, so D464's compound route contributes nothing — and the reader surface stands "
        "still at 13. ⚠️ **THE SENTENCE STEP AND THE PRINTING STEP DISAGREE HERE, 1 AND 2**, the opposite of D473's 2-and-2 and "
        "of D472's 1-and-2 in the other direction: read the head name at every site (D451/D461/D464). **THE OTHER THREE `BUILT` "
        "COLUMNS STAND STILL** — this slice adds no registry row, no ability text and no Special Energy text.) // \U0001f195\U0001f195 D473 ")
parts = text.split(FIND)
assert len(parts) == 2, f"find occurs {len(parts)-1}x"
payload = NOTE.join(parts).encode("utf-8")
open(P, "wb").write(payload)
print("ok", len(orig), "->", len(open(P,"rb").read()))
