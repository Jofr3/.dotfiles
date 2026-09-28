import io
p='docs/progress.md'
lines=io.open(p,encoding='utf-8').read().split('\n')
old6=lines[5]
assert old6.startswith('**Last updated:** 2026-09-11 — build session #437')
new6=('**Last updated:** 2026-09-11 — build session #438 (**P3-M5 — D498, *the predicate behind every '
 'census figure in the repo — and a POLARITY SPLIT that makes half the witnesses blind to half the '
 'mutations.*** **Third and LAST coverage slice; the loop returns to building sentences.** '
 '🛑 **NO SENTENCE BUILT**: residue **85/120** (§A **111/85/120** before and after), `BUILT.attack` '
 '**1612**, `OPAQUE` **63/92**, census standing still, no census tax, engine **0.390.0 NOT BUMPED** — '
 '**verified by `git diff --name-only` being exactly one file** and `git diff -U0` containing no '
 'version constant. Target: **`resolvedByAnyReader()`**, a ONE-LINE body carrying **ZERO mutant '
 'rows**, measured by span with all 2,424 `find` strings resolved. 🛑 **THE FINDING, AND I VERIFIED '
 'IT MYSELF BY APPLYING BOTH MUTATIONS: A BOOLEAN PREDICATE\'S WITNESSES SPLIT BY POLARITY, AND EACH '
 'HALF IS BLIND TO THE OTHER MUTATION.** Over 102 calling files and 330 classified assertions: **139 '
 'CLAIM-TRUE rungs can only see a NARROWING, 98 CLAIM-FALSE rungs can only see a WIDENING**, 93 are '
 'population folds that see both — **12 files narrowing-only, 5 widening-only.** Driven, and my own '
 're-run reproduces it **exactly complementary**: `.some`→`.every` (529→0) reddens '
 '`extraEnergyBonus` and leaves `selfEnergyToHand` GREEN; `!== null`→`!== undefined` (529→640) is the '
 'precise reverse. **A killer set drawn from one polarity would have let the other row survive and '
 'reported a gap that is not there** — D497\'s lesson reproduced on a different axis. 🛑 **AND THE '
 'REGION HAS NO COUNT-PRESERVING MUTATION AT ALL, WHICH IS THE HONEST OUTPUT**: measured over 640 '
 'sentences × 13 readers, the body admits exactly **three** behaviours (claim **0**, **529**, '
 '**640**), and **both count-preserving candidates — `!= null` and `Boolean(…)` — are EQUIVALENT**, '
 'because **0 of 8,320 calls return `undefined`** and 0 return a falsy non-null. **So D497\'s "aim '
 'rows at count-preserving mutations" has NO TARGET here** — three rows, not four, stated with the '
 'lattice rather than padded. ⚠️ **MY ONE EDITORIAL CLAIM WAS WRONG, AND THE REBUTTAL CITES A '
 'MEASURED INCIDENT.** I wrote that `!= null` is *"strictly the better guard"*. **It is better in one '
 'direction and WORSE in the other**: under the shipped `!== null` a mis-enrolled reader makes the '
 'predicate claim everything — catastrophic **and LOUD**, 22 rungs across 5 files red in one run, '
 'which is what made **D444\'s accident** visible; under `!= null` that reader contributes nothing, '
 'every census figure stands still, and the defect is **SILENT at this line**. **"Strictly better" is '
 'a claim about WHICH failure you want**, and this repo\'s own doctrine — *flag loudly rather than '
 'guess* (D190b/D199), *choose the shape so that losing the information is detectable* (D421) — '
 'points the other way. Written into the row\'s `what`. 🆕 **BOTH KILLED ROWS HAVE AN INDEPENDENT '
 'SECOND KILLER NO ROW CAN NAME** — `residue-census-gate` and `opaque-anatomy-gate` both exit 1 under '
 'either mutation — because `killedByCommand` **replaces** `expectKilledBy` in the runner; recorded '
 'in the header comment rather than lost. ⚠️ **AND THE BUILDER\'S OWN CLASSIFIER WAS WRONG TWICE, IN '
 'OPPOSITE DIRECTIONS, AND IT SAYS SO**: one suite read as a witness on a hit that is **prose in a '
 'comment** (D455 biting the instrument built to apply it) and another read as having no rung because '
 'a wrapped `expect(` overflowed a fixed character window — **both found by driving the prediction, '
 'not by re-reading the regex.** **THE DECLARED SURVIVOR** (`!= null`, `unreachable-population`) was '
 'confirmed **under `--full` over 481 files / 10,969 tests**, not merely under a probe, because its '
 'reason quantifies over a population (D477); its falsifier is executable — all 13 readers declare '
 '`X | null`, and the day one can answer `undefined` the row reports STALE-SURVIVOR. Corpus **2,424 → '
 '2,427**, declared survivors **46 → 47**, archive ratchet **168**. `bun run check` GREEN, **481 '
 'files / 10,969 tests — UNCHANGED**, correctly: zero new `it(` blocks.)')
lines[5]=new6
lines.insert(7,'**Last updated (was):** '+old6.split('**Last updated:** ',1)[1])
lines.insert(8,'')
io.open(p,'w',encoding='utf-8').write('\n'.join(lines))
print('ok')
