# D473 — the cheap work is done; choose with the prices open

Repo: /home/jofre/projects/luminous_ui  (branch main, tree CLEAN at e7785d0f)

Read FIRST and treat as binding:
  - scripts/autoloop/prompt.md
  - docs/conventions.md — ALL of it.
  - the `## NEXT (resume point)` block in docs/progress.md (written after D472) —
    **section (4) prices every remaining `MULTI-2` row and is the most valuable
    thing in this brief's lineage. Read it before you read my shortlist below.**
  - the D470..D472 rows in docs/decisions.md.

## The state, honestly

RESIDUE **111 sentences / 154 printings**. Gate §A **137 / 111 / 154**. Corpus
**2,131**, engine **0.370.0**, `MATCH_RECORD_VERSION` **29**, `ARCHIVES` **142**
(🛑 the RITUAL's to step, never yours).

**Outside `OPAQUE` there is nothing cheap left.** `SUBST-*` and `PHRASE-1` are
almost entirely the `Ancient`/`Future` family, blocked on a schema column that does
not exist (ninth slice running; `typedSelfSwitch.test.ts` §9 already fails the day
ingest lands it). `COMPOUND-head` is 11/13 and D466 measured that "build the head
and the row leaves" is FALSE for the four it examined. `OPAQUE` is 77/110.

**And every remaining `MULTI-2` row is priced "bigger than it looks"** — see the
resume point's section (4) for six of them with their specific costs. That is not a
reason to avoid them; it is the state of the corpus after eleven slices of taking
the cheap ones. **Choose one with the price open, or find something better.**

## Where I think the value is: `MULTI-3`, which nobody has looked at

`MULTI-3` is **13 sentences / 18 printings** and has never been examined by any
slice. `bun scripts/opaque-anatomy.ts` prints it under `── MULTI-3 ──` with each
sentence's nearest built neighbour and its three region sizes. **Read it there.**

Two things in it look worth your first hour. **Both annotations are hypotheses —
check them; briefs in this run have been wrong about mechanism more often than
right, and D472's brief carried two bad citations:**

  **(i) A PAIR that may be one mechanism covering two sentences:**
      *"Discard a card from your hand. If you do, draw 2 cards."* (1p)
      *"Discard a card from your hand. If you do, draw 3 cards."* (1p)
      Identical but for the count. If one anchor with a captured number claims
      both, that is **2 sentences / 2 printings for one arm** — the best
      sentences-per-anchor ratio available anywhere in the residue right now.
      ⚠️ **But `MULTI-3` means three regions, and D472's brief was caught assuming
      a region count implied a small semantic delta when it did not.** The
      `If you do,` construction is a *conditional on whether the preceding op
      actually happened*, which may or may not be a shape this engine can express.
      **Find out before committing to it** — if it needs a new op that observes a
      prior op's success, that is a real mechanism and the pair is not cheap.

  **(ii) *"Flip a coin for each {D} Pokémon you have in play. This attack does 60
      damage for each heads."* (2p)** — the joint-highest printing count in the
      class. `{D}` is a printed TYPE, i.e. `Card.types`, a real column, so D468's
      schema test passes. ⚠️ **Related but NOT identical to `MULTI-2`'s file line
      231** (*"…for each Energy attached to both Active Pokémon"*), which D472
      priced as touching `AttackFlipCount` — a union whose `attachedEnergy` member
      is self-scoped with no seat. **Check whether a filtered in-play count is a
      new member of that union or an inhabitant of an existing one**; D472's
      `MATCH_RECORD_VERSION` argument turned on exactly that distinction.

**If your investigation shows both are dearer than a priced `MULTI-2` row, take the
`MULTI-2` row instead and say why.** A well-argued choice among expensive options
is the deliverable here — there is no cheap one left, and pretending otherwise is
how a slice ships a filter that counts 0 forever.

🛑 **Off the table:** the `Ancient`/`Future` family (file lines 134, 181, 182, 272,
287, 345, 355, 406, 435, 457, 533, 565) and the three `Tera` rows — no `cardSchema`
column carries a banner. **File line 537** is takeable but **owes a FIFTH
negative-control home** (`scaledDamage.test.ts:92` records D469 paying the fourth
onto it) — D461 prefers a witness whose blocker is DATA over one whose blocker is a
mechanism.

## Requirements

1. Build it properly: types, reader/derive, and whatever the interpreter needs so
   the op MEANS something on a real board.
2. New vitest suite in `packages/engine/src/`, behavioural on real boards. A
   ZERO-MATCH board with controls distinguishing it from silence-for-another-
   reason, and a board where several plausible wrong implementations each answer a
   DIFFERENT value. 🆕 **If your consequent is boolean or side-effecting rather than
   numeric, build a SIGNATURE instead** (D472): pick a board family each candidate
   partitions differently and read the pattern of fires as an integer — and
   **measure every wrong value against the real predicate**, never assert it in a
   comment. Prefer a file-local `cardPool` (D414) over a new `FIXTURE_POOL` id.
3. ⚠️ Mutate your central new arm to its NEAREST WRONG SIBLING and check that
   something OTHER than a census suite goes red (D469; reproduced at three
   addresses, with six blind census suites at D472).
4. 🆕 **Before generalising any anchor, measure what the generalisation would claim
   over the whole corpus** (D472). If it claims the same rows, the generality is
   pure risk. **And if your consequent contains a pronoun, the subject is not
   decoration** — an anchor that generalises the subject generalises the referent,
   and no census can see the result.
5. Hand-authored mutant rows for everything. `expectKilledBy` names your suite;
   `find` occurs exactly once; a `survives` row still needs `expectKilledBy`. Any
   `equivalent` row must state WHICH KIND of disjointness — guarded (companion
   deletion row must exist and be KILLED) or structural (no guard, correctly none).
6. Step the engine version **only if `packages/engine` behaviour actually moved**
   (D471 correctly refused; D472 correctly paid). Decide `MATCH_RECORD_VERSION`
   (**29**) on the SERIALIZED-ALPHABET argument and STATE it — a new op FIELD or a
   new union MEMBER means yes; a new INHABITANT of an existing union does not.
   **If you conclude 29 → 30, say so plainly and price it; that is a legitimate
   outcome, not a failure.**
7. Census pins in `censusAtHead.test.ts` — only if you built a sentence. ⚠️ The tax
   is not confined to that file and differs every slice (D472: **58 edits across 15
   files**, sentence chains taking `- 1` and printing chains `- 2` and **disagreeing
   on the same line in three files**). Expect several `check` rounds — the
   masked-second-failure effect has fired in every round of the last four slices.
   ⚠️ `units - built` is **400**, `BUILT.ability + BUILT.trainer + BUILT.specialEnergy`
   **STAYS 405** — anchor on whole expressions. ⚠️ **There is a `Math.round`
   percentage in that file that no grep finds and that has crossed a boundary six
   times**; only running the suite reveals it.
8. `bun scripts/opaque-anatomy-gate.ts` must still pass — a `MULTI-3` row leaving
   `OPAQUE` changes its input. The gate pins no class SIZE precisely so this is
   allowed. **Run it and report the line**; if it reddens, that is a finding.
9. `scripts/residue-census-gate.ts` holds **no pinned literals of its own** — it
   reads them from `censusAtHead.test.ts` and §A only checks AGREEMENT.

## Gates before you report

  - `bun run check` GREEN — exact counts, delta **re-derived** (the "+N = the new
    suite's own count" shape has now held five slices running; D471 broke it by
    moving neither count).
  - `bun scripts/mutation/precheck.ts` clean — report the corpus total **and the
    `patches LITERALLY (N row(s) depend on it)` count**, currently 15. **If that
    line ever disappears, those rows silently splice megabytes and ALL report
    KILLED.**
  - `bun scripts/residue-census-gate.ts` OK — §A triple.
  - `bun scripts/opaque-anatomy-gate.ts` OK — its line.
  - `bun scripts/mutation/run.ts --decision D473 --allow-dirty` — `--allow-dirty` is
    MANDATORY on a dirty tree. Check the row count three ways (includes / equality /
    id-prefix). Report killed / survivor / GAP exactly.
  - `--only D275-engine-version-drifts-again --allow-dirty` if you bump the version.
    🛑 **`--only` does NOT accumulate** — loop if you need N rows.
  - find-vs-replace diff over your new rows.
  - attribution control on your central row: apply by hand, each candidate killer
    run ALONE, restore in a `finally`, verify by size AND sha256. 🛑 **In Python,
    `str.replace` REJECTS a function second argument** — use `find`-split + join
    with a `len(parts) == 2` assertion, or you silently measure the unmutated file.

## For my sweep prediction

Report `+K killed, +S declared survivors` — exact; I commit the predicted line
before the sweep.

⚠️ **And report `git diff --numstat` PER FILE for any file with deletions.** D472's
close-out established the pre-clearance order: numstat per file → survivor file
membership → reasons. The declared survivors live in `interpreter.ts` (12),
`effects.ts` (8), `attack.ts` (7), `continuous.ts` (5), `flow.ts` (2), `redact.ts`
(1), `GameHud.tsx` (1), `splice-gate.ts` (1). **If you delete nothing in those eight
files, all 37 clear cheaply** — so tell me specifically whether you did.

## Hard rules

  - DO NOT COMMIT. DO NOT `git add`. DO NOT run a whole-corpus sweep. Leave the tree
    dirty and NAME every untracked path.
  - NEVER `git stash`, `git checkout --`, `git reset --hard`, or any wholesale
    working-tree mutation.
  - Never `String.replace(find, replacementString)` with a replacement read from a
    file — the defect D470 found in the harness itself.
  - Encode first, write second, inside `try/finally`.
  - Temp files in $CLAUDE_JOB_DIR/tmp, never /tmp.

## Report back

Which row you chose and **why, with the source evidence** — including, if you
considered the pair, whether `If you do,` is expressible today; what you built with
printings and corpus FILE LINES (fileLine = arrayIndex + 53); **what you left and
its price** in one of D469's three shapes, since the next slice inherits it; **every
place this brief was wrong**, assuming at least one; the gates verbatim; the
per-file numstat for deletions; and the corpus delta.
