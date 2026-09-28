# D496 — work order

## 🛑 This is a COVERAGE slice, not a build slice. Read that first.

**No corpus sentence gets built. The residue does not move. `BUILT.attack` does not move. The census
stands still. There is no census tax and — unless you change engine behaviour, which you should not —
NO ENGINE VERSION BUMP**, because nothing a card can reach changes.

**Say all of that in your sweep prediction**, and do not manufacture a residue delta to look
productive.

## The target

**Regions of `packages/engine/src/effects.ts` that no mutant row has ever touched.** I verified this
myself at `389db90b`, by span, enumerating rows from the module:

| region | line | rows within ±6 lines |
|---|---:|---:|
| `FLIP_PREVENT_DAMAGE_AND_EFFECTS` declaration | 10724 | **0** |
| `FLIP_PREVENT_DAMAGE` declaration | 10726 | **0** |
| `FLIP_TAILS_SELF_CANT_ATTACK` declaration | 11783 | **0** |
| arm 19b, the and-effects branch | 23865 | **0** |
| arm 19b, the bare branch | 23874 | **0** |
| arm 26, the tails self-lock | 24776 | **0** |

And `bun scripts/mutation/run.ts --decision D142 --allow-dirty` prints **"No mutants selected."** —
as do `--decision D144` and `--decision D148`.

**Printings at stake, measured off `legalAttackCorpus()`:**

- `FLIP_PREVENT_DAMAGE_AND_EFFECTS` — **1 sentence / 15 printings**
- `FLIP_PREVENT_DAMAGE` — **1 sentence / 4 printings**
- the tails family — ⚠️ **my pattern was over-broad and caught a cancel-clause sentence at 16
  printings that almost certainly belongs to `splitAttackCancelClause`, not to this anchor.**
  **Derive the tails figures yourself; do not take mine.**

So **at least 19 printings** of shipped, green, census-complete behaviour have been executable by
nothing for roughly 350 decisions.

## 🛑 The outcome that matters most, stated up front

**If a row you author SURVIVES, that is a real defect and the most valuable possible result of this
slice.**

**Do not adjust the row until it dies.** Report the survivor, diagnose it, and say plainly whether
it is (a) a genuine engine bug, (b) an equivalent mutant that deserves a declared-survivor row with
its KIND named (D468), or (c) a row whose killer set you got wrong. **A slice that finds one real
bug here is worth more than a slice that adds twenty rows that were always going to pass.**

⚠️ **And the reverse trap**: a row that dies for the wrong reason is worse than no row. **Read
`find`/`replace`/`what` against each other before probing** (D451/D477/D479) — none inert, none
mis-described — and **name which assertion kills each row**, measured, not guessed.

## What you must do FIRST

1. **Re-derive the absence yourself**, by span and by `--decision`. Report the table. ⚠️ **Measure by
   SPAN, not by op name** (D453) — a family can have rows that mention it in prose while nothing
   mutates the lines that implement it.
2. **Derive the printings each region claims**, off `legalAttackCorpus()`. Correct my tails figure.
3. **Read the shipped suites before writing anything.** `preventBlock.test.ts` and
   `tailsGatedOp.test.ts` are reported to field seeded boards for **both faces** already, which is
   why the killer sets should be free. **Verify that** — and ⚠️ **hunt one suite at a time** (D494):
   a killer set assembled from a suite's NAME is wrong in the direction that hides work.
4. **Check whether these regions are reachable from the registry as well as the deriver**, so a row
   that looks dead is not actually killed by a registry-side board you did not know about.

## Scope

**Author rows for the six regions above.** The builder of D495 priced this at **2–4 rows apiece**.
That is a guide, not a quota — **the right number is the number of distinct claims each region makes**,
and one well-aimed row beats three that overlap.

⚠️ **`partition-gate` will reject two rows that are the same experiment**, so each row must differ
from its siblings in exactly one axis (D484). ⚠️ **And `precheck` requires each `find` to occur
exactly once** — these anchors sit near byte-similar siblings, so expect to lengthen a `find` onto a
line it uniquely owns (D443/D446/D448), and **prefer shortening onto the line the row is about**.

**If a region turns out to be genuinely unmutatable** — every candidate mutation being equivalent —
**say so with the measurement** rather than authoring a row that cannot fail. That is D468's
structural-disjointness case and it deserves a declared survivor with its kind named, not silence.

## Hard rules — read these as written

- **Do NOT commit, do NOT `git add`, do NOT run a whole-corpus sweep.** A `--decision D496
  --allow-dirty` probe is expected; row count derived three ways.
- **`docs/` is UNTOUCHED. Do not run the end-of-session ritual.** 🛑 **`ARCHIVES` in
  `progressLog.test.ts` is the RITUAL's — leave it byte-unchanged and verify by sha256.**
- **Never `git stash` / `git checkout --` / `git reset --hard`.** Never write to the tree while the
  harness is in flight.
- Temp files in `$CLAUDE_JOB_DIR/tmp` only.
- `--allow-dirty` MANDATORY on a dirty tree; `--decision` takes ONE value (D443) and matches by
  `String.includes`; **`--only` does NOT accumulate.**
- ⚠️ **A `replace` omitting a REQUIRED field reports ERROR — `precheck` gates `find` only.**
- ⚠️ **A moved gate population must be VERIFIED, not accepted** (D492/D493). `patches LITERALLY` is
  **22**; the criterion is a `String.replace` special (`$$`, `$&`, `` $` ``, `$'`, `$n`, `$<name>`),
  **not a bare `$`**, which reads ~214. **If your rows move it, say which row and why.**
- 🛑 **STATE THE COMMAND YOU USED FOR EVERY COUNT.**
- ⚠️ **`bun run check` must still exit 0.** If it does not, something you did touched behaviour — and
  on a coverage slice that is a finding, not a chore.

## Report back

The absence, re-derived by span and by `--decision`, as a table. The printings each region claims,
with my tails figure corrected. What the shipped suites actually assert, hunted one at a time. Every
row you authored, with **which assertion kills it, measured**. 🛑 **Any survivor, diagnosed and NOT
tuned away** — and if there are none, say explicitly that you looked for real defects and found
none, so the next reader knows the absence was tested rather than assumed. What you left and its
price. The gates verbatim. **The corpus delta and a sweep prediction with its arithmetic shown, and
an explicit statement that the residue, `BUILT.attack` and the engine version do NOT move.**
**Every place this brief was wrong — assume at least one, and say which of my claims were hedged and
which were confident.**
