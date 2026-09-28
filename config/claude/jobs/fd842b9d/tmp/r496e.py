import io
p='docs/conventions.md'
s=io.open(p,encoding='utf-8').read()
anchor='## Git / commits'
NEW = r'''### A PAIR of anchors needs a PAIR of probes — and no census can tell you which one is bare (D496, re-earning D463)

`preventBlock.test.ts` had driven both coin faces, both spellings and eleven behavioural sections of
its family since it was written. Its *"is anchored end to end"* rung still spelled **every**
constructed probe against `WIDE_TEXT` and **none** against `NARROW_TEXT`. Two mutants — the narrow
anchor's `^` and its terminator — **survived 481 files / 10,969 tests.**

🛑 **The reason nothing could have noticed is worth more than the defect.** Measured over all 640
corpus rows: **every single-axis loosening of all three anchors in that family claims exactly the
rows it claimed before.** `BUILT.attack`, the residue and `resolvedByAnyReader` are byte-identical
under all six mutations.

**An anchor-shape defect is invisible to every census by construction.** A census asks whether a
sentence is claimed; a loosened anchor claims the same sentences. **A constructed near-miss is the
only instrument that exists for it**, which is why these rungs are load-bearing in a way their line
count does not suggest.

⚠️ **The asymmetry inside one file is the tell.** The same slice's apostrophe axis *was* covered —
because it had a **per-anchor** rung, where the anchoring axis had a **per-family** rung written
against one member. **When auditing a family's guards, group the rungs by how many members each one
NAMES, not by how many rungs there are.** A `for (const text of [...])` sweep is what stops the count
drifting when a third spelling lands.

🛑 **And when a row survives, do not tune the row.** D496's two survivors kept their `find`/`replace`
byte-for-byte; the *suite* changed, with the survival measurement written into the rung so the
override stays findable.

### `--decision <D>` printing "No mutants selected" is a FLOOR, not the measurement (D496, refining D495)

D495 made the empty-`--decision` sweep the cheapest audit available. D496 ran it properly and found
both halves of its error bar:

- **It under-reports.** Seven ids print *"No mutants selected"* where three were expected.
- ⚠️ **It over-reports too.** `--decision D146` selects zero rows **while D146's region carries four
  `D239-*` rows**. The decision id on a row is metadata about who wrote it; **the span is the fact**
  (D453). A region is covered by whatever mutates its lines, whoever authored that.

🛑 **And `--list` ignores `--decision`** — it prints the whole corpus. A check spelled
`--decision D142 --list` answers nothing while looking like it answered.

**Measure coverage by resolving each row's `find` to a line span and intersecting against the region.**
The id sweep is how you find candidates; the span sweep is how you confirm one.

### A coverage slice must state what does NOT move (D496)

A slice that authors mutant rows and touches no engine source has a prediction with a different
shape, and it has to say so: **the residue does not move, `BUILT.attack` does not move, the census
stands still, there is no census tax, and the engine version is not bumped** — the last because
nothing a card can reach changed.

**Verify it rather than asserting it**: `git diff --name-only` should contain no engine source file,
and the version constants should be absent from the diff entirely.

⚠️ **The test count may also be unchanged and still be correct** — strengthening assertions inside
existing `it` blocks adds no tests, so there is no `it(` delta to reconcile. **Say that explicitly**,
or the next reader will hunt for a missing number.

### A foreground probe can be SIGTERM'd before its `finally` runs (D496, applying D475)

A tool timeout killed a foreground mutation probe between patch and restore, leaving a mutated
`effects.ts` that had to be restored by hand from the HEAD blob. **The tool recovers silently**, so
nothing in the normal record would have shown it.

🛑 **Prefer `setsid` for anything that patches the tree**, not only for long sweeps — the hazard is
the timeout, not the duration. And after any interrupted probe, verify the tree against HEAD by hash
before trusting a green run.

'''
s=s.replace(anchor,NEW+anchor,1)
io.open(p,'w',encoding='utf-8').write(s)
print('ok')
