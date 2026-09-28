import io
def patch(path, edits):
    lines = io.open(path, encoding="utf-8").read().split("\n")
    for ln, old, new in edits:
        i = ln-1
        assert lines[i].count(old)==1, f"{path}:{ln} {old!r} count={lines[i].count(old)} in {lines[i][:170]!r}"
        lines[i]=lines[i].replace(old,new,1)
    payload="\n".join(lines).encode("utf-8")
    with io.open(path,"wb") as fh: fh.write(payload)
    print("patched",path,len(edits))
E="packages/engine/src/"
patch(E+"defenderStatusTriple.test.ts",[(546,"[525, 1557]","[526, 1558]")])
patch(E+"flipStatusEnergyDiscard.test.ts",[(565,"[525, 1557]","[526, 1558]")])
patch(E+"flipStatusHeadsTails.test.ts",[(735,"[525, 1557]","[526, 1558]")])
patch(E+"perHeadsEnergyDiscard.test.ts",[(667,"[524, 1557]","[525, 1558]")])
patch(E+"selfDamagePerCounter.test.ts",[(190,"[525, 1558]","[526, 1559]")])
patch(E+"exOnlyActive.test.ts",[(214,"toHaveLength(114)","toHaveLength(113)")])
patch(E+"sawkRequirementSplit.test.ts",[(269,"toHaveLength(114)","toHaveLength(113)")])
patch(E+"classedBoardSpread.test.ts",[(1004,"[114, 173]","[113, 172]")])
patch(E+"precociousEvolution.test.ts",[(635,"toBe(1609)","toBe(1610)")])
patch(E+"censusAtHead.test.ts",[(4231,"toBe(2014)","toBe(2015)")])
patch(E+"compoundCompose.test.ts",[(612,"toHaveLength(198)","toHaveLength(199)")])
patch(E+"opponentBoardCounterScaling.test.ts",[(588,"toHaveLength(2)","toHaveLength(3)")])
