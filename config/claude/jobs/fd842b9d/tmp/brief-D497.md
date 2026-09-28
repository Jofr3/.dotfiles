# D497 — work order

## 🛑 This is a COVERAGE slice, and its target is THE INSTRUMENT THE WHOLE LOOP TRUSTS.

**No corpus sentence gets built. The residue does not move. `BUILT.attack` does not move. The census
stands still. There is no census tax. There should be NO ENGINE VERSION BUMP.** Say all of that in
your prediction, and verify it with `git diff --name-only` rather than asserting it (D496).

## The target

**`surface()` in `packages/engine/src/censusAttackCorpus.ts`, lines 782–797 — ZERO mutant rows.**
I verified this by span at `c083c718`, resolving all 2,418 `find` strings (2,418 of 2,418 resolved):

| region | lines | rows inside |
|---|---|---:|
| `surface()` | 782–797 | **0** |
| `attackReaderSurface()` | 801–803 | **0** |
| `legalAttackCorpus()` | 698–716 | 1 (`D274-corpus-parser-splits-at-the-wrong-space`) |

And `--decision D364`, `D418`, `D419` all print *"No mutants selected."*

🛑 **Why this matters more than the last coverage slice.** `attackReaderSurface()` is the oracle
**every slice since roughly D480 has used to derive build state** — every *"REFUSED 13/13"* claim in
this run was measured against whatever this function returned. **If it returned the wrong set,
those measurements were wrong and nothing would have caught it.** D496 guarded shipped card
behaviour; this guards the measuring apparatus.

## What `surface()` actually contains, and where the live attack surface is

```ts
if (SURFACE === null) {
  const found: [string, Reader][] = [];
  for (const [name, value] of Object.entries(effects)) {
    if (name.startsWith("deriveAttack") && typeof value === "function") {
      found.push([name, value as unknown as Reader]);
    }
  }
  found.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  SURFACE = found;
}
```

⚠️ **Measured: 86 test files reference it, with 89 length assertions. So any mutation that changes
the COUNT dies instantly in dozens of files — which means the interesting attack surface is
everything that PRESERVES the count.** Specifically:

- **the prefix filter** — `startsWith("deriveAttack")` → `includes(…)`, or a shortened/lengthened
  prefix. Does any export make the count differ? **Derive it.**
- **the type guard** — `typeof value === "function"`.
- **the sort comparator** — inverting it changes ORDER, not count. ⚠️ **And I found NO assertion
  anywhere on sortedness or on the exact contents — only on length.** `resolvedByAnyReader` uses
  `.some(…)`, which is order-independent.
- **the memo** — `if (SURFACE === null)` is very likely a genuinely **equivalent** mutation
  (recomputing gives the same answer; a module's export set is fixed at load, which the doc block
  says outright).

## 🛑 The two outcomes that matter, and neither is "author twelve rows"

1. **If a row SURVIVES, that is a real gap in the loop's own oracle** — the most valuable possible
   result. **Do not tune the row.** Report it, diagnose it, and fix the *witness*, exactly as D496
   did: its two survivors kept their `find`/`replace` byte-for-byte and the suite changed, with the
   survival measurement written into the rung.
2. **If a mutation is genuinely EQUIVALENT — say so and declare it with its KIND named** (D468),
   rather than inventing a row that cannot fail or quietly skipping the axis. The memo is the
   obvious candidate. **A declared survivor with a named kind and a stated falsifier is a better
   artefact than a row that dies for a reason nobody checked.**

⚠️ **And the converse trap**: a row that dies for the wrong reason is worse than no row. **Read
`find`/`replace`/`what` against each other before probing** (D451/D477/D479), and **name which
assertion kills each row, measured** by applying the mutation and reading the first failure — not
guessed, and never named from a suite's name (D494).

## What you must do FIRST

1. **Re-derive the absence yourself, by span**, and report the table. ⚠️ **`--decision <D>` is a
   FLOOR, not the measurement** (D496): it has a false-negative half — `--decision D146` selects zero
   rows while its region carries four `D239-*` rows — and **`--list` IGNORES `--decision`**.
2. **Derive what each candidate mutation actually does to the returned set**, over the real module.
   The count is the thing 89 assertions defend; **find the mutations that preserve it.**
3. **Find the witnesses before writing rows.** Which suite, if any, asserts *contents* rather than
   *length*? If none does, that is itself the finding, and the repair is a witness, not a row.
4. ⚠️ **Check whether `surface()` is reachable from anything other than `attackReaderSurface()`** —
   a memoised module-level cache can have more than one consumer, and a row aimed at one may be
   killed by another for a reason you did not intend.

## Hard rules — read these as written

- **Do NOT commit, do NOT `git add`, do NOT run a whole-corpus sweep.** A `--decision D497
  --allow-dirty` probe is expected; row count derived three ways.
- **`docs/` is UNTOUCHED. Do not run the end-of-session ritual.** 🛑 **`ARCHIVES` in
  `progressLog.test.ts` is the RITUAL's — leave it byte-unchanged and verify by sha256.**
- **Never `git stash` / `git checkout --` / `git reset --hard`.** Never write to the tree while the
  harness is in flight.
- 🆕 ⚠️ **A FOREGROUND PROBE CAN BE SIGTERM'd BY A TOOL TIMEOUT BEFORE ITS `finally` RUNS** (D496) —
  the tree is left mutated and **the tool recovers silently**. **Prefer `setsid` for anything that
  patches the tree**, and after any interrupted probe **verify the tree against HEAD by hash**.
- Temp files in `$CLAUDE_JOB_DIR/tmp` only.
- `--allow-dirty` MANDATORY on a dirty tree; `--decision` takes ONE value (D443); **`--only` does NOT
  accumulate**; **`--list` ignores `--decision`.**
- ⚠️ **A `replace` omitting a REQUIRED field reports ERROR — `precheck` gates `find` only.**
- ⚠️ **`partition-gate` rejects two rows that are the same experiment**; each row must differ from its
  siblings in exactly one axis (D484). **`precheck` requires each `find` to occur exactly once** — in
  a 16-line function that is a real constraint, so expect to lengthen a `find` onto a line it
  uniquely owns (D443/D446/D448).
- ⚠️ **A moved gate population must be VERIFIED, not accepted.** `patches LITERALLY` is **22**; the
  criterion is a `String.replace` special, **not a bare `$`** (which reads ~214).
- 🛑 **STATE THE COMMAND YOU USED FOR EVERY COUNT.**
- ⚠️ **`bun run check` must exit 0.** On a coverage slice, a failure means you touched behaviour —
  which is a finding, not a chore.

## Report back

The absence re-derived by span, as a table. What each candidate mutation does to the returned set,
measured over the real module. Which witnesses assert *contents* versus *length* — and if none assert
contents, say so plainly, because that is the finding. Every row authored, with **which assertion
kills it, measured**. 🛑 **Any survivor, diagnosed and NOT tuned away; any equivalent mutation,
declared with its KIND named and a falsifier.** If you conclude the region is thinner than it looks
and fewer rows are warranted, **say that with the measurement** rather than padding. What you left
and its price. The gates verbatim. **The corpus delta and a sweep prediction with its arithmetic
shown, plus an explicit statement that the residue, `BUILT.attack`, the census and the engine version
do NOT move.** **Every place this brief was wrong — assume at least one, and say which of my claims
were hedged and which were confident.**
