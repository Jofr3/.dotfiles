import io
p='docs/progress.md'
s=io.open(p,encoding='utf-8').read()
old_row='| simulator | P3 | 🚧 **M1–M3 + M4 done; M5 in progress** (latest: **P3-M5 — D495,'
i=s.index(old_row); j=s.index('\n',i)
new_row=('| simulator | P3 | 🚧 **M1–M3 + M4 done; M5 in progress** (latest: **P3-M5 — D496, *the first '
 'COVERAGE slice, and it found a real suite hole 481 files and 10,969 tests could not see*: two '
 'authored mutants SURVIVED the whole suite, because a family\'s "is anchored end to end" rung '
 'spelled every probe against one of its TWO anchors. An anchor-shape defect is invisible to every '
 'census by construction — every single-axis loosening claims exactly the rows it claimed before. No '
 'sentence built; residue, `BUILT.attack`, census and engine version all UNMOVED**; corpus 2,401 → '
 '2,418, check GREEN 481/10,969) |')
s=s[:i]+new_row+s[j:]
log_anchor='### 2026-09-10 — build session #435 (P3-M5 — D495)'
assert s.count(log_anchor)==1
ENTRY = r'''### 2026-09-11 — build session #436 (P3-M5 — D496)

**THE FIRST COVERAGE SLICE OF THE RUN — AND IT FOUND A REAL SUITE HOLE THAT 481 FILES AND 10,969
TESTS COULD NOT SEE.** Engine **0.390.0, NOT BUMPED**; **`MATCH_RECORD_VERSION` 29**; mutation corpus
**2,401 → 2,418**; archive ratchet **165 → 166**; `bun run check` GREEN at **481 files / 10,969
tests — UNCHANGED**.

**(0) 🛑 WHAT THIS SLICE DELIBERATELY DID NOT DO.** No corpus sentence was built. **The residue does
not move (85 / 120), `BUILT.attack` does not move (1612), `OPAQUE` does not move (63 / 92), the
census stands still, and there is no census tax.** The engine version is unchanged because **no
engine source file was touched** — the whole diff is **two files**, one test and the mutant corpus,
verified by `git diff --name-only`. **A coverage slice that reports a residue delta has done
something wrong**, and saying so is what makes the prediction checkable.

**(1) 🛑 THE FINDING: TWO AUTHORED MUTANTS SURVIVED THE ENTIRE SUITE.**
`D496-narrow-anchor-loses-its-caret` and `D496-narrow-anchor-loses-its-terminator` each ran **481
files / 10,969 tests GREEN**. The full suite was run *before* the survival was believed (D455),
ruling out a wrong killer set. **Diagnosed as a real SUITE gap** — not an engine bug and not an
equivalent mutant: under either mutation `deriveAttackEffect("Then, " + NARROW_TEXT)` returns a live
`coinFlipGate` program where HEAD returns `null`, so both are observable at runtime (D420).

**(2) THE CAUSE, VERIFIED INDEPENDENTLY AT RITUAL TIME.** `preventBlock.test.ts`'s
*"is anchored end to end"* rung spelled **all** of its constructed probes against `WIDE_TEXT` and
**none** against `NARROW_TEXT`. Read out of the HEAD blob: **three `WIDE_TEXT` references, ZERO
`NARROW_TEXT`.** One of a **pair** of anchors carried the whole family's anchoring evidence —
**D463's finding at a new address.**

**(3) 🛑 AND THE REASON NOTHING COULD HAVE NOTICED IS WORTH MORE THAN THE DEFECT.** Measured over all
640 corpus rows **before a line was written** (D464): **every single-axis loosening of all three
anchors in this family claims exactly the rows it claimed before** — 15/15, 4/4, 1/1. So
`BUILT.attack`, the residue and `resolvedByAnyReader` are **byte-identical under all six mutations**.
**An anchor-shape defect is invisible to every census BY CONSTRUCTION, and a CONSTRUCTED near-miss is
the only instrument that exists for it.** ⚠️ **The asymmetry inside one rung is the tell**: this
family's APOSTROPHE axis was already covered, because it had a **per-anchor** rung where the
anchoring axis had a **per-family** one written against one member. **Group a family's guards by how
many members each rung NAMES, not by how many rungs there are.**

**(4) ✅ THE ROWS WERE NOT TUNED.** Their `find`/`replace` are byte-identical to what survived 10,969
tests. **The SUITE changed**: the rung now sweeps `[WIDE_TEXT, NARROW_TEXT]`, with the survival
measurement written into the rung so the override is findable. Re-measured after the repair, the
killing assertions are the narrow leading-text and truncation probes, and **the other three suites
still survive** — so the killer set is measured and minimal rather than over-broad. Before adding the
probes the builder verified all eight candidate strings are `null` at true HEAD, and that the
terminator must be pinned by **truncation** and never by a trailing compound, because
`splitAttackTrailingClause` *does* split both bodies into head/tail pairs — a trailing `toBeNull`
would have been red on its first run (D464/D495).

**(5) THE ABSENCE WAS WIDER THAN THE BRIEF SAID, AND THE INSTRUMENT HAS A FALSE-NEGATIVE HALF.** Zero
rows at **±20 lines** on all six regions — the tightest gap in the set is 31 lines — and **SEVEN**
decision ids print *"No mutants selected"* where the brief named three (D142–D146, D148, D154).
⚠️ **But `--decision D146` selects zero rows while its region carries four `D239-*` rows**: *the name
is metadata, the span is the fact* (D453). 🆕 **And `--list` IGNORES `--decision`**, so a check
spelled `--decision D142 --list` answers nothing while looking like it answered. A loosest-shape
audit over all 476 decision ids found that **from D211 onward only 12 select zero rows**, nine being
harness decisions; the three worth a look are **D364, D418, D419**.

**(6) THE STAKES, MEASURED.** `FLIP_PREVENT_DAMAGE_AND_EFFECTS` **1 sentence / 15 printings**,
`FLIP_PREVENT_DAMAGE` **1 / 4**, `FLIP_TAILS_SELF_CANT_ATTACK` **1 / 1** — **20 printings** of
shipped, green, census-complete behaviour executable by nothing for ~350 decisions. **17 rows now
cover them, each with its killing assertion MEASURED** by applying the mutation and reading vitest's
first failure — not named from a suite's name (D494). ⚠️ **My *"almost certainly
`splitAttackCancelClause`"* was FALSE**: the 16-printing sentence my over-broad pattern caught is
claimed by **`deriveAttackCoinFlip`, a DAMAGE reader**, and that splitter serves an unrelated
4-sentence / 5-printing family. 🆕 **`tailsGatedOp.test.ts` — 749 lines — was named by ZERO rows
before this slice** (D474's driven-but-unpinned); it now kills 7.

**(7) ⚠️ A TOOLING HAZARD RECORDED BECAUSE NOTHING ELSE WOULD RECORD IT.** A foreground probe was
**SIGTERM'd by a tool timeout before its `finally` ran**, and `effects.ts` had to be restored by hand
from the HEAD blob. **The tool recovers silently** (D475). **Prefer `setsid` for anything that
patches the tree.**

**(8) 🆕 A DEADLINE NOBODY WAS TRACKING.** `scripts/mutation/mutants.ts` is now **2,608,763 bytes**
against Biome's `files.maxSize` of **4,194,304**. At ~20 KB per slice that is roughly **79 slices**
of headroom before D460's failure recurs. Not urgent; not invisible either.

'''
s=s.replace(log_anchor,ENTRY+log_anchor,1)
io.open(p,'w',encoding='utf-8').write(s)
print('ok')
