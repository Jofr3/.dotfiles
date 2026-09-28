import io
p='docs/progress.md'
lines=io.open(p,encoding='utf-8').read().split('\n')
old6=lines[5]
assert old6.startswith('**Last updated:** 2026-09-10 — build session #435')
new6=('**Last updated:** 2026-09-11 — build session #436 (**P3-M5 — D496, *the first COVERAGE slice of '
 'the run — and it found a REAL SUITE HOLE that 481 files and 10,969 tests could not see.*** '
 '🛑 **NO SENTENCE WAS BUILT. The residue does NOT move (85/120), `BUILT.attack` does NOT move '
 '(1612), the census stands still, there is NO census tax, and the ENGINE VERSION STAYS 0.390.0** — '
 'no engine source file was touched. The whole diff is **two files**: one test and the mutant corpus. '
 '🛑 **THE FINDING: TWO AUTHORED MUTANTS SURVIVED THE ENTIRE SUITE — 481 files / 10,969 tests GREEN '
 'UNDER EACH.** `D496-narrow-anchor-loses-its-caret` and `D496-narrow-anchor-loses-its-terminator`. '
 '**Diagnosed as a real SUITE gap, not an engine bug and not an equivalent mutant**: under either '
 'mutation `deriveAttackEffect("Then, " + NARROW_TEXT)` returns a live `coinFlipGate` program where '
 'HEAD returns `null`, so they are observable at runtime (D420). **The cause is that '
 '`preventBlock.test.ts`\'s *"is anchored end to end"* rung spelled ALL of its constructed probes '
 'against `WIDE_TEXT` and NONE against `NARROW_TEXT`** — verified independently at ritual time by '
 'reading the HEAD blob: **three `WIDE_TEXT` references and ZERO `NARROW_TEXT`.** One of a PAIR of '
 'anchors carried the whole family\'s anchoring evidence — **D463\'s finding at a new address.** '
 '🛑 **AND THE REASON NOTHING COULD HAVE NOTICED IS WORTH MORE THAN THE DEFECT**: measured over all '
 '640 rows, **every single-axis loosening of all three anchors claims exactly the rows it claimed '
 'before** (15/15, 4/4, 1/1), so `BUILT.attack`, the residue and `resolvedByAnyReader` are '
 'byte-identical under all six mutations — **an anchor-shape defect is INVISIBLE TO EVERY CENSUS BY '
 'CONSTRUCTION, and a CONSTRUCTED near-miss is the only instrument that exists for it.** ⚠️ **The '
 'asymmetry inside one rung is the tell**: the same family\'s APOSTROPHE axis was already covered, '
 'because it had a **per-anchor** rung where the anchoring axis had a **per-family** one written '
 'against one member. ✅ **THE ROWS WERE NOT TUNED** — their `find`/`replace` are byte-identical to '
 'what survived 10,969 tests; **the SUITE changed**, and the survival measurement is written into the '
 'rung so the override is findable. **THE ABSENCE WAS WIDER THAN THE BRIEF SAID**: 0 rows at **±20 '
 'lines** on all six regions (the tightest gap in the set is 31 lines), and **SEVEN** decision ids '
 'print *"No mutants selected"* where the brief named three — D142, D143, D144, D145, D146, D148, '
 'D154. ⚠️ **AND THE INSTRUMENT\'S FALSE-NEGATIVE HALF WAS FOUND IN THE SAME PASS**: **`--decision '
 'D146` selects zero rows while its region carries four `D239-*` rows** — *the name is metadata, the '
 'span is the fact* (D453) — and **`--list` IGNORES `--decision`**, so a check spelled `--decision '
 'D142 --list` answers nothing while looking like it answered. **20 printings** of shipped, green, '
 'census-complete behaviour were executable by nothing for ~350 decisions; **17 rows now cover them, '
 'each with its killing assertion MEASURED** rather than named from a suite\'s name (D494). '
 '⚠️ **My "almost certainly `splitAttackCancelClause`" was FALSE** — the 16-printing sentence is '
 'claimed by `deriveAttackCoinFlip`, a DAMAGE reader, and that splitter serves an unrelated 4-sentence '
 'family. 🆕 **`tailsGatedOp.test.ts` — 749 lines — was named by ZERO rows before this slice** '
 '(D474\'s driven-but-unpinned); it now kills 7. `bun run check` GREEN, **481 files / 10,969 tests '
 'UNCHANGED** — the repair strengthened assertions inside existing `it` blocks rather than adding '
 'any. Corpus **2,401 → 2,418**, archive ratchet **166**.)')
lines[5]=new6
lines.insert(7,'**Last updated (was):** '+old6.split('**Last updated:** ',1)[1])
lines.insert(8,'')
io.open(p,'w',encoding='utf-8').write('\n'.join(lines))
print('ok')
