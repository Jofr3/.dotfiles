# D478 — the other branch of a gate that already ships

Repo: /home/jofre/projects/luminous_ui  (branch main, tree CLEAN at d8e43d4e)

Read FIRST and treat as binding:
  - scripts/autoloop/prompt.md
  - docs/conventions.md — ALL of it. Four entries landed yesterday.
  - the `## NEXT (resume point)` block in docs/progress.md (written after D477) —
    **sections (4)–(8). Let them override me where we differ.**
  - the D475..D477 rows in docs/decisions.md.

## State

RESIDUE **103 sentences / 143 printings**. Gate §A **129 / 103 / 143**. `OPAQUE`
**70/101**, `MULTI-2` **9/12**, `MULTI-3` **7/10**, **`COMPOSE` is gone (0/0)**.
`COMPOUND-head` is now the largest classified class at **11/13**. Corpus **2,208**,
engine **0.375.0**, `MATCH_RECORD_VERSION` **29**, `ARCHIVES` **147** (🛑 RITUAL's).

**I read BOTH instruments this time** — that was D477's lesson, and it was mine to
learn: D477's brief named three rows of a four-row family because it read only the
anatomy's `OPAQUE` section while the census had already classified the fourth.

## The target: the `If tails` branch

From `bun scripts/residue-census.ts`, `── COMPOUND-head ──`, verbatim:

> **2p** — *"Flip a coin. If heads, your opponent's Active Pokémon is now Paralyzed
> and Poisoned. If tails, your opponent's Active Pokémon is now Confused."*
> `SEGMENT 3/3 removed.`
> `KEPT ✅ builds (reader): Flip a coin. If heads, … Paralyzed and Poisoned.`
> `      → [{"op":"coinFlipGate","then":[{applyStatus paralyzed},{applyStatus poisoned}]}]`
> `CUT  🛑 does NOT build: If tails, your opponent's Active Pokémon is now Confused.`

**The head already builds through a shipped `coinFlipGate`. Only the tails branch
is missing.** 2 Standard-legal printings.

## The hypothesis — and D477 says attack it, not confirm it

`recordGate` ships as `{ op, slot, contains?, then, otherwise? }`. **If
`coinFlipGate` gains the same `otherwise?` field, this row may cost one anchor
widening and one arm.**

⚠️ **Do not take that on my word.** The last five slices found the inherited price
wrong in its expensive clause — and D477 found one wrong in the *other* direction,
under-counting a four-row family as three. Things to check before believing me:
  - does `coinFlipGate` already have an `otherwise`, or a reason it deliberately
    does not? **Read its doc block** — this codebase argues its omissions, and D473
    found `recordGate`'s "if you do" had shipped since D48 while a brief was
    calling it unbuildable.
  - is the interpreter's `coinFlipGate` arm structured to run an else-branch, or
    does it return early on tails?
  - 🛑 **D466 measured that *"build the head and the row leaves"* is FALSE for four
    `COMPOUND-head` rows (file lines 529 / 539 / 616 / 572).** Check whether this
    row is one of them before starting. **If it is, stop and say so** — that is a
    finding, not a failure.
  - **Measure the family, do not enumerate it** (D477): publish a pattern over all
    640 rows for `If heads, … If tails, …` and report how many rows and printings
    it covers. My "2 printings" is one row's count, not the family's.

**If the hypothesis dies, take whichever row in `COMPOUND-head` or the two `MULTI`
classes is genuinely cheapest and say why.** A well-argued switch is the
deliverable.

🛑 **Off the table:** `Ancient`/`Future` and `Tera` (no `cardSchema` column carries
a banner — fifteenth slice running); **file line 111** (the `ex` narrowing needs a
new op FIELD on a PARKING op — D472's price held on inspection at D477); **file
line 537** owes a **FIFTH** negative-control home.

## Requirements

1. Build it properly; the op must MEAN something on a real board.
2. New vitest suite, behavioural. ⚠️ **For a two-branch gate the load-bearing
   boards are the two OUTCOMES driven separately with a pinned rng**, plus a board
   where the branches would be indistinguishable if swapped — if heads and tails
   both applied *some* status, a swapped-branch bug is invisible unless the two
   statuses differ observably. Drive both, and drive the AND-ness of the heads
   branch (two statuses, not one). Prefer a file-local `cardPool` (D414); check
   whether the sentence is already fielded as a refusal witness first (D475).
3. ⚠️ Mutate your central new arm to its NEAREST WRONG SIBLING (here: emitting the
   heads program on tails, or dropping `otherwise`) and check something OTHER than
   a census suite goes red. Seven slices running.
4. ⚠️ **Measure what any generalisation would claim over all 640 rows** (D472).
   ⚠️ **And if a widened anchor newly admits an op, check
   `describeBranch`/`describeCondition` has a phrase for it** (D473) — **this is a
   GATE, so the describers are live for it**, unlike D477 where the program had no
   gate and they were never reached.
5. Hand-authored mutant rows for everything. `expectKilledBy` names your suite;
   `find` occurs exactly once; a `survives` row still needs `expectKilledBy`; any
   `equivalent` row must state WHICH KIND. **No row whose mutation cannot change an
   answer** (D475). 🆕 **Read each row's `what` against its `replace`** — D477's
   find-vs-replace diff caught a row that was live and MIS-DESCRIBED, and no other
   gate reads those two fields against each other.
   ⚠️ **If you make any field REQUIRED, a dependent row's `replace` that omits it
   reports ERROR, and `precheck` gates `find` only** (D476).
6. Step the engine version only if `packages/engine` behaviour moved.
7. Census pins if you built a sentence. **Derive the tax shape** — six slices, six
   readings: `-1`/`-2`, `-2`/`-2`, `-1`/`-2`, `-1`/`-1`, `-1`/`-1`, `-3`/`-5`.
   ⚠️ **`BUILT.attack` is a RECORDED CONSTANT the chains subtract FROM — bump it
   FIRST** (D449). `units - built` is **389**;
   `BUILT.ability + BUILT.trainer + BUILT.specialEnergy` **STAYS 405**. ⚠️ **The
   `Math.round` percentage CROSSED at D477 (16 → 17) with the numerator UNMOVED** —
   derive it, and **measure the numerator** rather than inferring it from a diff.
8. `bun scripts/opaque-anatomy-gate.ts` must still pass — report its line.
9. `scripts/residue-census-gate.ts` holds no literals of its own.

## Gates before you report

  - `bun run check` GREEN — counts re-derived by counting `it(` at HEAD versus now.
  - `bun scripts/mutation/precheck.ts` clean — corpus total **and the
    `patches LITERALLY (N row(s))` count, now 16** — ⚠️ **that number would have to
    FALL for D470's splice defect to return silently.**
  - `bun scripts/residue-census-gate.ts` OK — §A triple.
  - `bun scripts/opaque-anatomy-gate.ts` OK — its line.
  - `bun scripts/mutation/run.ts --decision D478 --allow-dirty` — MANDATORY flag.
    Row count three ways. Report killed / survivor / GAP **and `error(s)`**.
  - `--only D275-engine-version-drifts-again --allow-dirty` if you bump the version.
    🛑 **`--only` does NOT accumulate.**
  - find-vs-replace diff over your new rows.
  - attribution control on your central row: by hand, each killer ALONE, restore in
    a `finally`, verify by size AND sha256. 🛑 **Python's `str.replace` REJECTS a
    function second argument** — `find`-split + join with `len(parts) == 2`.

## 🛑 The operator rule

**NEVER write to the tree while the harness is in flight.** D475 caused a CLOBBER
this way and paid a round; D476 was interrupted mid-probe, verified tree integrity
by size + sha256 on every survivor-housing file before doing anything else, and
re-probed alone — that is the correct response. Sequence edits and probes.

## For my sweep prediction

Report `+K killed, +S declared survivors` — exact, and **name `0 error(s)`
explicitly** (D476).

⚠️ **Report `git diff --numstat` per file for every file with deletions.** Declared
survivors, measured from the module at D477: `interpreter.ts` 12, `effects.ts` 11,
`attack.ts` 7, `continuous.ts` 5, `flow.ts` 2, `redact.ts` 1, `GameHud.tsx` 1,
`splice-gate.ts` 1 — **40 total**. **This slice will almost certainly touch
`interpreter.ts`, which houses the largest share and has been untouched for
several slices** — name every deleted line there and say whether a survivor's
reason touches it.

🆕 ⚠️ **And match your survivor evidence to the shape of each reason** (D477's
close-out): a reason that is local — structural disjointness, a commutative fold —
is settled by a probe; a reason that quantifies over inputs or the corpus is only
settled by the full run, so say which kind each declared survivor of yours is.

## Hard rules

  - DO NOT COMMIT. DO NOT `git add`. DO NOT run a whole-corpus sweep. Leave the tree
    dirty and NAME every untracked path.
  - NEVER `git stash`, `git checkout --`, `git reset --hard`, or any wholesale
    working-tree mutation.
  - Never `String.replace(find, replacementString)` with a replacement read from a
    file.
  - Encode first, write second, inside `try/finally`.
  - Temp files in $CLAUDE_JOB_DIR/tmp, never /tmp.
  - Do not commit or delete `tmp/mutation-journal.json.clobbered-*` (D475's
    evidence, gitignored).

## Report back

What you built; **whether the `otherwise` hypothesis survived, and what killed it
if not**; **the family measurement** (pattern, rows, printings) rather than an
enumeration; what you left and its price in one of D469's three shapes; **every
place this brief was wrong**, assuming at least one; the gates verbatim; the
per-file numstat for deletions; and the corpus delta.
