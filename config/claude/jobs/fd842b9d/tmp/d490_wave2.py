import io, os, sys
ROOT="/home/jofre/projects/luminous_ui/packages/engine/src/"
ANN=("  // \U0001f195\U0001f195\U0001f195 **D490 +1 sentence / +2 printings — THE MILL OF BOTH DECKS, SCALED BY THE "
     "ENERGY AMONG WHAT IT MILLED** (`censusAttackCorpus.ts` FILE LINE 130). ⚠️ THE TWO STEPS DISAGREE, 1 AND 2.")
E=[
 ("benchDiscardBoost.test.ts",
  '    ).toEqual({ cap: 1, per: 1, filter: { kind: "anyEnergy" } });',
  '    ).toEqual({ kind: "benchDiscard", cap: 1, per: 1, filter: { kind: "anyEnergy" } });'),
 ("censusAtHead.test.ts",
  "    expect(built).toBe(2007);  // (",
  "    expect(built).toBe(2009);  //" + ANN + " ("),
 ("censusAtHead.test.ts",
  "    expect(residueSentences.length).toBe(92); // (",
  "    expect(residueSentences.length).toBe(91); //" + ANN + " ("),
 ("compoundCompose.test.ts",
  "    expect(claimedWhole).toHaveLength(195);  // (",
  "    expect(claimedWhole).toHaveLength(196);  // \U0001f195\U0001f195\U0001f195 **D490 +1 — THE MILL OF BOTH DECKS: this sentence is MULTI-CLAUSE (a period joiner) AND claimed WHOLE, so it enters this population as well as the resolving one. ⚠️ A census site is its PREDICATE, not its unit (D461) — the +1 here is a SENTENCE step even though the resolving chains take +2 printings.** ("),
 ("defenderStatusTriple.test.ts", "toEqual([521, 1550]); // (", "toEqual([522, 1552]); //" + ANN + " ("),
 ("flipStatusEnergyDiscard.test.ts", "toEqual([521, 1550]); // (", "toEqual([522, 1552]); //" + ANN + " ("),
 ("flipStatusHeadsTails.test.ts", "toEqual([521, 1550]); // (", "toEqual([522, 1552]); //" + ANN + " ("),
 ("perHeadsEnergyDiscard.test.ts", "toEqual([520, 1550]); // (", "toEqual([521, 1552]); //" + ANN + " ("),
 ("selfDamagePerCounter.test.ts", "toEqual([521, 1551]); // (", "toEqual([522, 1553]); //" + ANN + " ("),
]
for fname, find, repl in E:
    p=ROOT+fname; s=io.open(p,encoding="utf-8").read()
    if s.count(find)!=1:
        sys.stderr.write("COUNT %d %s :: %s\n"%(s.count(find),fname,find[:80])); raise SystemExit(2)
    open(p,"wb").write(repl.join(s.split(find)).encode("utf-8")); print("ok",fname)
