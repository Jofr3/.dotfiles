import io
p='docs/progress.md'
s=io.open(p,encoding='utf-8').read()
old_row='| simulator | P3 | 🚧 **M1–M3 + M4 done; M5 in progress** (latest: **P3-M5 — D497,'
i=s.index(old_row); j=s.index('\n',i)
new_row=('| simulator | P3 | 🚧 **M1–M3 + M4 done; M5 in progress** (latest: **P3-M5 — D498, *the '
 'predicate behind every census figure, and a POLARITY SPLIT that blinds half the witnesses*: '
 '`resolvedByAnyReader()` had zero rows, and its 330 assertions divide into CLAIM-TRUE rungs that '
 'only see a narrowing and CLAIM-FALSE rungs that only see a widening — re-driven at ritual time and '
 'exactly complementary. The region has NO count-preserving mutation at all (0 of 8,320 calls return '
 '`undefined`), so three rows, not four. The brief\'s "strictly a better guard" was wrong: `!== null`'
 '\'s failure is catastrophic but LOUD. Third and LAST coverage slice; the loop returns to building '
 'sentences**; corpus 2,424 → 2,427, survivors 46 → 47, check GREEN 481/10,969) |')
s=s[:i]+new_row+s[j:]
log_anchor='### 2026-09-11 — build session #437 (P3-M5 — D497)'
assert s.count(log_anchor)==1
ENTRY = r'''### 2026-09-11 — build session #438 (P3-M5 — D498)

**THE PREDICATE BEHIND EVERY CENSUS FIGURE IN THE REPO — AND A POLARITY SPLIT THAT MAKES HALF THE
WITNESSES BLIND TO HALF THE MUTATIONS.** **Third and LAST coverage slice; the loop returns to
building sentences.** Engine **0.390.0, NOT BUMPED**; **`MATCH_RECORD_VERSION` 29**; corpus **2,424 →
2,427**; declared survivors **46 → 47**; archive ratchet **167 → 168**; `bun run check` GREEN at
**481 files / 10,969 tests — UNCHANGED**, correctly, because the slice adds zero `it(` blocks.

**(0) WHAT DID NOT MOVE, VERIFIED.** `git diff --name-only` is **exactly one file** and `git diff
-U0` contains no version constant. **Residue 85 / 120 (§A 111 / 85 / 120 before and after),
`BUILT.attack` 1612, `OPAQUE` 63 / 92, census standing still, no census tax.**

**(1) THE TARGET.** `resolvedByAnyReader()` — a **one-line body** carrying **ZERO mutant rows**,
measured by span with all 2,424 `find` strings resolved. It is the predicate behind **every residue
and `BUILT.attack` figure in the repo**, and D497 left it as named, priced debt.

**(2) 🛑 THE FINDING: A BOOLEAN PREDICATE'S WITNESSES SPLIT BY POLARITY, AND EACH HALF IS BLIND TO
THE OTHER MUTATION.** Over **102 calling files and 330 classified assertions**: **139 CLAIM-TRUE
rungs can only see a NARROWING**, **98 CLAIM-FALSE rungs can only see a WIDENING**, and 93 population
folds see both — **12 files narrowing-only, 5 widening-only.** ✅ **Re-driven at ritual time and
exactly complementary**: `.some` → `.every` (529 → 0) reddens `extraEnergyBonus` and leaves
`selfEnergyToHand` **GREEN**; `!== null` → `!== undefined` (529 → 640) is the precise reverse; the
file restored byte-identical. **A killer set drawn from one polarity would have let the other row
survive and reported a gap that is not there** — D497's lesson reproduced on a different axis, and
D438's polarity rule arriving at a killer set instead of at a re-point.

**(3) 🛑 THE REGION HAS NO COUNT-PRESERVING MUTATION AT ALL, AND THAT IS THE HONEST OUTPUT.**
Measured over 640 sentences × 13 readers: the body admits exactly **three** behaviours — claim
**0**, **529**, **640** — and **both count-preserving candidates, `!= null` and `Boolean(…)`, are
EQUIVALENT**, because **0 of 8,320 calls return `undefined`** and 0 return a falsy non-null. **So
D497's *"aim rows at count-preserving mutations"* has NO TARGET here.** Three rows, not four, stated
with the lattice rather than padded — and two further candidates were measured and deliberately not
written, each being a second row of one experiment (D484/D475).

**(4) ⚠️ MY ONE EDITORIAL CLAIM WAS WRONG, AND THE REBUTTAL CITES A MEASURED INCIDENT.** I wrote that
`!= null` is *"strictly the better guard"*. **It is better in one direction and worse in the
other.** Under the shipped `!== null`, a mis-enrolled reader makes the predicate claim everything —
catastrophic **and LOUD**, 22 rungs across 5 files red in one run, which is what made **D444's
accident visible**. Under `!= null` that reader contributes nothing, every census figure stands
still, and the defect is **silent at this line**, caught only by the enrolment rungs, which fire on
enrolment rather than on a return value. **"Strictly better" is a claim about WHICH failure you
want**, and this repo's own doctrine — *flag loudly rather than guess* (D190b/D199), *choose the
shape so that losing the information is detectable* (D421) — points the other way. Written into the
row's `what`.

**(5) THE THREE ROWS.** `.some` → `.every` (529 → 0) **KILLED**; `!== null` → `!== undefined`
(529 → 640) **KILLED**; `!== null` → `!= null` **SURVIVES(known)**, `unreachable-population`,
confirmed **under `--full` over 481 files / 10,969 tests** rather than under a probe, because its
reason quantifies over a population (D477). Its falsifier is executable: all 13 readers declare
`X | null`, and the day one can answer `undefined` the row reports STALE-SURVIVOR. ⚠️ **Each row's
first kill arrived where aimed, but not at the assertion one would expect** — in both directions the
first failure is a **per-sentence polarity rung**, with the headline count pins failing later in the
same file.

**(6) 🆕 BOTH KILLED ROWS HAVE AN INDEPENDENT SECOND KILLER THAT NO ROW CAN NAME.**
`residue-census-gate` and `opaque-anatomy-gate` both exit 1 under either mutation — but
**`killedByCommand` REPLACES `expectKilledBy`** in the runner, so a row killed by both a suite and a
gate can only name one. Recorded in the header comment rather than lost.

**(7) ⚠️ AND THE BUILDER'S OWN CLASSIFIER WAS WRONG TWICE, IN OPPOSITE DIRECTIONS, AND IT SAYS SO.**
One suite read as a witness on a hit that is **prose inside a comment** — **D455 biting the
instrument built to apply it** — and another read as having no rung because a wrapped `expect(`
overflowed a fixed character window. **Both were found by driving the prediction, not by re-reading
the regex.** The published figures are post-repair, and the lesson is that **a classifier's error
rate is measurable in one experiment and invisible in its output.**

**(8) WHAT WAS LEFT, PRICED.** `attackReaderSurface()` still carries zero rows, and its only distinct
mutations are **type errors** — *"probably zero honest rows; measure before assuming a gap."* And
`type Reader = (text: string) => unknown` means the predicate's comparison has **no type behind
it**: the `X | null` guarantee lives at the 13 declaration sites four thousand lines away.
**Narrowing `Reader` would make the declared survivor STRUCTURAL instead of population-shaped** —
priced at one type change, and deliberately not done in a coverage slice.

'''
s=s.replace(log_anchor,ENTRY+log_anchor,1)
io.open(p,'w',encoding='utf-8').write(s)
print('ok')
