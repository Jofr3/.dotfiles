import io, re
FRONT = ("1 /* \U0001f195\U0001f195\U0001f195 D493 — a `- 1` term at the FRONT: THE BENCH-COUNTER FOLD WITH ITS "
         "PRINTED WEAKNESS-ONLY SUPPRESSION RIDER, `censusAttackCorpus.ts` FILE LINE **529**, "
         "*\"This attack does 10 damage for each damage counter on all of your Benched Cynthia's "
         "Pokémon. This attack's damage isn't affected by Weakness.\"*, **1 sentence / 1 legal "
         "printing**, claimed by TWO readers over ONE new anchor — `deriveAttackDamageMultiplier` "
         "for the `per × count` fold and `deriveAttackDamageSuppression` for the §8.5 step, the "
         "corpus's SECOND dual-claimed sentence. ⚠️ **THE SENTENCE STEP AND THE PRINTING STEP AGREE "
         "AT 1 AND 1**, MEASURED at this head rather than carried (D451/D461/D465). RAW summand "
         "ALONE: registry 10/16, gate 5/13 and trailing 11/21 all re-measured UNMOVED. "
         "⚠️ EDITED AT THE FRONT, NEVER AT THE END. */ - ")
PAT = re.compile(r"(?:resolv(?:ed|ing)\.length|units\(resolv(?:ed|ing)\))\s-\s")
files = ["benchNamedBonus","inPlayTypeBonus","moreEnergyBonus","opponentBenchCount","retreatCostBonus","sameEnergyBonus"]
total = 0
for f in files:
    p = f"packages/engine/src/{f}.test.ts"
    lines = io.open(p, encoding="utf-8").read().split("\n")
    n = 0
    for i, l in enumerate(lines):
        out, last, hits = [], 0, list(PAT.finditer(l))
        if not hits: continue
        for m in hits:
            assert 0 <= m.start() < 80 or m.start() > 80, m.start()
            out.append(l[last:m.end()]); out.append(FRONT); last = m.end()
        out.append(l[last:])
        lines[i] = "".join(out); n += len(hits)
    payload = "\n".join(lines).encode("utf-8")
    with io.open(p, "wb") as fh: fh.write(payload)
    print(f"{p}: {n} front term(s)"); total += n
print("total front terms:", total)
