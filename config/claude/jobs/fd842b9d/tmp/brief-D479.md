# D479 — audit the refusals first, then build whatever falls out

Repo: /home/jofre/projects/luminous_ui  (branch main, tree CLEAN at 7fffd33f)

Read FIRST and treat as binding:
  - scripts/autoloop/prompt.md
  - docs/conventions.md — ALL of it. The last three entries are this slice's brief.
  - the `## NEXT (resume point)` block in docs/progress.md (written after D478) —
    **section (4) is this slice's instruction; (5)–(8) are its constraints.**
  - the D476..D478 rows in docs/decisions.md.

## State

RESIDUE **102 sentences / 141 printings**. Gate §A **128 / 102 / 141**. `OPAQUE`
**70/101**, `COMPOUND-head` **10/11**, `MULTI-2` **9/12**, `MULTI-3` **7/10**.
Corpus **2,217**, engine **0.376.0**, `MATCH_RECORD_VERSION` **29**, `ARCHIVES`
**148** (🛑 the RITUAL's to step — ten work orders running, nine builders refusing).

## 🛑 The instruction: audit before you target

**Two shipped refusals have proved FALSE in six slices**, both expressibility
claims, both copied onward to further sites:

  - **D473** — `recordGate`'s printed *"if you do"* had shipped since **D48**, while
    a work order was calling it a mechanism that might not exist.
  - **D478** — D424 refused a row because *"`coinFlipGate` carries no tails
    branch"*. The field had shipped at **D269**, the interpreter already spliced
    it, and another arm had been producing two-armed gates since **D416**. All
    three predate the refusal.

D478's close-out explains why this keeps happening, and the loop is the point: **a
refusal stops the family being built → an unbuilt family attracts no mutant rows →
no rows means nothing ever re-derives the refusal.** It only breaks from outside.

**So: your first deliverable is an audit, not a build.** Find the refusals in the
engine that make an EXPRESSIBILITY claim — *"X carries no Y"*, *"no carrier
expresses Z"*, *"this needs a mechanism neither anchor has"*, *"the union has no
member for…"* — and **check each claim against the declaration it names.** Report
how many you checked and how many survived. That number is worth having whichever
way it comes out.

⚠️ **Two things make the audit tractable rather than boundless:**
  - **D478's corollary: an anchor with ZERO mutant rows is evidence its doc block
    has never been re-read.** Needle the corpus for anchors and helpers with no
    rows (D452's absence audit) — that set and the false-refusal set overlap by
    construction, and it gives you a ranked place to start.
  - Refusals cluster where the residue is. `COMPOUND-head` (10/11) and the two
    `MULTI` classes are where unbuilt rows live; their doc blocks are where the
    refusals will be.

**Then build whatever the audit turns up** — if a refusal falls and the row behind
it is cheap, take it. **If every refusal you check survives, that is a real result:
say so, report the count, and take the cheapest row from the instruments instead.**
Do not manufacture a false refusal to have something to report.

## Choosing, if the audit yields nothing

Run **BOTH** `bun scripts/residue-census.ts` and `bun scripts/opaque-anatomy.ts`
(D477 — reading one is a sample, not a survey), and **prefer a published PATTERN
over an enumeration** (D477, which paid out immediately at D478 by revealing that a
family's largest member had already shipped).

🛑 **Known-priced and off the table unless you re-measure:** **file line 268** —
its blocker is a **SEAM, not a vocabulary** (both halves read separately but
resolve at two seams while sharing one printed coin), and **no widening of any
anchor in that family can reach it**; it is the refusal witness in **three** files,
so a successor who builds it owes the re-point. **File line 111** — the `ex`
narrowing needs a new op FIELD on a PARKING op. **File line 537** — owes a
**FIFTH** negative-control home. **`Ancient`/`Future`/`Tera`** — no `cardSchema`
column carries a banner, sixteenth slice running.

## Requirements (if you build)

1. Build it properly; the op must MEAN something on a real board.
2. New vitest suite, behavioural, with a ZERO-MATCH board and controls separating
   it from silence-for-another-reason. Prefer a file-local `cardPool` (D414); check
   first whether the sentence is already fielded as a refusal witness (D475).
3. ⚠️ Mutate your central arm to its NEAREST WRONG SIBLING; something OTHER than a
   census suite must go red. Eight slices running.
4. ⚠️ **Measure what any generalisation claims over all 640 rows** (D472); an
   override is legitimate **only as a recorded rung** (D477). **Describer
   obligations follow the CALL PATH, not the op's category** (D478) — trace
   `withConsequence` and ask whether your program reaches it.
5. Hand-authored rows for everything; `find` occurs exactly once; a `survives` row
   needs `expectKilledBy`; any `equivalent` row states WHICH KIND; **no row whose
   mutation cannot change an answer** (D475); **read each row's `what` against its
   `replace`** — that check caught a mis-described row at D477 **and** D478.
   ⚠️ **A `replace` omitting a REQUIRED field reports ERROR; `precheck` gates `find`
   only** (D476).
6. Step the engine version only if `packages/engine` behaviour moved.
7. Census pins if you built a sentence. **Derive the tax shape** — seven slices,
   seven readings. ⚠️ **`BUILT.attack` is a RECORDED CONSTANT the chains subtract
   FROM — bump it FIRST** (D449). `units - built` is **387**;
   `BUILT.ability + BUILT.trainer + BUILT.specialEnergy` **STAYS 405**. ⚠️ **MEASURE
   the `Math.round` numerator** rather than inferring it.
8. Both gates must still pass — report their lines.

## Gates before you report

  - `bun run check` GREEN — counts re-derived by counting `it(` at HEAD vs now.
  - `bun scripts/mutation/precheck.ts` clean — corpus total **and
    `patches LITERALLY (N)`, now 18**. ⚠️ **The hazard is that number FALLING** —
    it would mean D470's splice defect had returned silently.
  - `bun scripts/residue-census-gate.ts` and `bun scripts/opaque-anatomy-gate.ts`.
  - `bun scripts/mutation/run.ts --decision D479 --allow-dirty` — MANDATORY flag,
    row count three ways, report killed / survivor / GAP **and `error(s)`**.
  - `--only D275-engine-version-drifts-again --allow-dirty` if you bump the version.
    🛑 **`--only` does NOT accumulate** — one decision per invocation.
  - find-vs-replace diff over your new rows.
  - attribution control: by hand, each killer ALONE, restore in a `finally`, verify
    by size AND sha256. 🛑 **Python's `str.replace` REJECTS a function second
    argument** — `find`-split + join with `len(parts) == 2`.

## 🛑 The operator rule

**NEVER write to the tree while the harness is in flight** — D475 caused a CLOBBER
this way. If a probe is interrupted, verify tree integrity by size + sha256 on
every survivor-housing file before doing anything else, then re-probe alone (D476).

## For my sweep prediction

Report `+K killed, +S declared survivors`, exact, **naming `0 error(s)`
explicitly** (D476). ⚠️ **And match each survivor's evidence to the shape of its
reason** (D477): local reasons are settled by a probe, reasons quantifying over a
population only by the full run.

⚠️ **Report `git diff --numstat` per file for every file with deletions.** Declared
survivors, from the module: `interpreter.ts` 12, `effects.ts` 11, `attack.ts` 7,
`continuous.ts` 5, `flow.ts` 2, `redact.ts` 1, `GameHud.tsx` 1, `splice-gate.ts` 1
— **40 total**. Name every deleted line in any of those eight.

## Hard rules

  - DO NOT COMMIT. DO NOT `git add`. DO NOT run a whole-corpus sweep. Leave the tree
    dirty and NAME every untracked path.
  - NEVER `git stash`, `git checkout --`, `git reset --hard`, or any wholesale
    working-tree mutation.
  - Never `String.replace(find, replacementString)` with a replacement read from a
    file.
  - Encode first, write second, inside `try/finally`.
  - Temp files in $CLAUDE_JOB_DIR/tmp, never /tmp.
  - Do not commit or delete `tmp/mutation-journal.json.clobbered-*`.

## Report back

**The audit first: how many expressibility refusals you checked, how many survived,
and the citation-versus-declaration verdict for each** — that is this slice's
headline whichever way it comes out. Then what you built and why; what you left and
its price in one of D469's three shapes; **every place this brief was wrong**; the
gates verbatim; the per-file numstat for deletions; and the corpus delta.
