# D472 — the first slice with a shortlist that did not exist a week ago

Repo: /home/jofre/projects/luminous_ui  (branch main, tree CLEAN at 620ae726)

Read FIRST and treat as binding:
  - scripts/autoloop/prompt.md
  - docs/conventions.md — ALL of it. Six entries landed yesterday alone.
  - the `## NEXT (resume point)` block in docs/progress.md (written after D471) —
    sections (4), (5), (6) and (8) are this brief's source and are fuller than the
    summary here.
  - the D469..D471 rows in docs/decisions.md.

## Where the target comes from

D471 established that `OPAQUE` — 78 sentences / 112 printings, static for four
slices — is **not one population**. All three probes in `residue-census.ts` are
single-region, so a sentence differing from a built one at **two separated points**
is invisible to all of them however small each difference is. `OPAQUE` is
**33 REACHED / 45 FAR**, and the reached half is the work.

**`MULTI-2` is 11 sentences / 15 printings that are two small edits from a built
string.** Run `bun scripts/opaque-anatomy.ts` and read its `── MULTI-2 ──` section
yourself — it prints each sentence, its nearest built neighbour, and the two region
sizes. Do not work from my transcription below; it is a map, not the territory.

For orientation only, the eleven, with what I believe blocks each. **Every one of
these annotations is a hypothesis you must check** — briefs in this run have been
wrong about mechanism more often than right, and D471's decisive claim was false:

  1. *"Shuffle your hand into your deck. Then, draw 6 cards."* (1p) — looks like
     **pure game state**, no card data at all. Nearest built neighbour is
     *"Discard your hand and draw 6 cards."*, so the draw half already ships and
     the delta is the disposal verb.
  2. *"Flip a coin for each Energy attached to both Active Pokémon. This attack
     does 60 damage for each heads."* (1p) — a both-seats energy count feeding a
     per-heads fold. Pure game state; both halves look shipped separately.
  3. *"If your opponent's Active Pokémon is a {N} Pokémon, it is now Paralyzed."*
     (**2p** — the joint-highest printing count here) — `{N}` is a printed TYPE,
     i.e. `Card.types`, **a real column**. D468 built exactly this axis for `{L}`,
     so the schema test passes and there is precedent for the shape.
  4. *"You may search your deck for any number of Fennel cards, reveal them…"*
     (2p) — a card-NAME filter plus an unbounded count.
  5. *"Discard all Energy from this Pokémon, and this attack does 210 damage to 1
     of your opponent's Benched Pokémon ex."* (1p)
  6. *"Look at 1 of your opponent's face-down Prize cards."* (1p) — note its
     nearest neighbour is *"Discard an Energy from your opponent's Active Pokémon
     ex."*, which is **evidence about region count, not about meaning**. D471 flags
     this alignment explicitly as not a work order.

  🛑 **BLOCKED — do not take these five:**
  7/8. the two **Tera** rows and 9. the **Tera** deck-search row — `Tera` is a
     printed banner, and D471's instrument independently reached the same refusal
     the `Ancient`/`Future` investigation did (`BLOCKED-SCHEMA-BANNER` 3/4). Apply
     D468's schema test and you will get the same answer: `cardSchema` has 21 keys
     and none classifies a banner.
  10. *"…10 more damage for each Ancient card in your discard pile."* — the
     `Ancient` family, off the table for eight slices running.
  11. 🛑 *"This attack does 100 damage for each Special Condition affecting your
     opponent's Active Pokémon."* (2p) — **THIS IS A TRAP.** It is corpus **file
     line 537**, where D469 re-pointed `scaledDamage.test.ts`'s negative control
     after building file line 534. **A successor that builds it OWES A FOURTH
     HOME**, exactly as D469 owed one and paid it. Taking it is legitimate *if you
     pay that bill* — and D469's own lesson is that an entry naming a price is an
     invoice, not a prohibition. But do not take it by accident.

⚠️ **`MULTI-k` is a LOWER BOUND on the work, never an estimate.** *"Discard a card
from your hand. If you do, draw 2 cards."* is `MULTI-2` by region count and holds
two mechanisms. **Read the sentence, not the k.**

## Your job

**Pick one, justify it from source, and build it.** Prefer printings where the
choice is otherwise close. If your investigation shows every candidate is bigger
than it looks, say so with the evidence and take the cheapest true thing you can
find — a well-argued decline with a test behind it is an acceptable outcome (D468),
but only if the source actually refuses.

## Requirements

1. Build it properly: types, reader/derive, and whatever the interpreter needs so
   the op MEANS something on a real board. A filter that parses but never narrows
   is not built.
2. New vitest suite in `packages/engine/src/`. Behavioural on real boards. Include
   a ZERO-MATCH board with controls distinguishing it from silence-for-another-
   reason, and a board where several plausible wrong implementations each answer a
   DIFFERENT number. Prefer a file-local `cardPool` (D414) over a new
   `FIXTURE_POOL` id; if you add a pool id, pay `opponentResistanceBonus.test.ts`'s
   ladder (its eleven `- 1` terms are D467's — check, do not sweep).
3. ⚠️ **The convention to honour hardest (D469, reproduced by D470, inverted by
   D471):** mutate your central new arm to its NEAREST WRONG SIBLING and check that
   something OTHER than a census suite goes red. If only the census reddens, the
   sentence is claimed but not built.
4. Hand-authored mutant rows for every sentence and field you add. `expectKilledBy`
   names your suite; `find` must occur exactly once in its target; a `survives` row
   still needs `expectKilledBy` or the runner crashes silently. Any row declared
   `equivalent` MUST state WHICH KIND of disjointness it rests on — guarded (then a
   companion deletion row must exist and be KILLED) or structural (no guard, and
   correctly none).
5. Step the engine version **if and only if `packages/engine` behaviour actually
   moved** — D471 correctly refused this when it had not. Decide
   `MATCH_RECORD_VERSION` (**29**) on the SERIALIZED-ALPHABET argument and STATE
   it: is there a byte a v29 record can hold after this slice that it could not
   hold before? A new op FIELD or a new `CardFilter` MEMBER means yes; a new
   inhabitant of an existing union does not.
6. Census pins in `censusAtHead.test.ts` — **only if you built a sentence.** ⚠️ The
   tax is NOT confined to that file and its shape has differed every slice (D469:
   54 edits / 14 files; D470: 21 front terms / 8 files, 20 live heads, and eight
   distinct literals in `censusAtHead.test.ts` alone, two of which **no grep for
   the headline figures finds**). Expect several `check` rounds — the
   masked-second-failure effect (D431/D464) has fired in every round of the last
   three slices. ⚠️ That file holds two numerically-close quantities that must not
   be swept together: `units - built` is **402**, while
   `BUILT.ability + BUILT.trainer + BUILT.specialEnergy` STAYS **405**. Anchor on
   whole expressions.
7. ⚠️ `scripts/residue-census-gate.ts` holds **NO pinned literals of its own** — it
   reads them from `censusAtHead.test.ts` and §A only checks AGREEMENT. §A is
   currently **138 / 112 / 156**.
8. 🆕 **If you build a sentence, `bun scripts/opaque-anatomy-gate.ts` must still
   pass** — a `MULTI-2` row leaving `OPAQUE` changes that instrument's input. The
   gate pins no class SIZE precisely so this is allowed, but **run it and report
   the line**; if it reddens, that is a finding, not a chore.
9. 🛑 **DO NOT touch `ARCHIVES` in `progressLog.test.ts`.** It is **141** and counts
   `### Prior resume point (` blocks, which only the ritual writes. Three work
   orders running have said this and two builders correctly refused the instruction
   anyway.

## Gates before you report

  - `bun run check` GREEN — exact counts, delta **re-derived** not carried.
  - `bun scripts/mutation/precheck.ts` clean — report the corpus total. It also
    reports that `run.ts` patches LITERALLY; **if that line ever disappears, eleven
    rows are silently splicing megabytes again and all report KILLED.**
  - `bun scripts/residue-census-gate.ts` OK — report the §A triple.
  - `bun scripts/opaque-anatomy-gate.ts` OK — report its line.
  - `bun scripts/mutation/run.ts --decision D472 --allow-dirty` — `--allow-dirty` is
    MANDATORY on a dirty tree. `--decision` matches by `String.includes`; check the
    row count both ways. Report killed / survivor / GAP exactly.
  - `--only D275-engine-version-drifts-again --allow-dirty` if you bump the version.
    🛑 **`--only` does NOT accumulate** — several flags silently run ONE row and
    print a green-looking total. Loop if you need N rows.
  - find-vs-replace diff over your new rows (an INERT row is invisible to precheck).
  - attribution control on your central row: apply by hand, run each candidate
    killer ALONE, restore in a `finally`, verify by size AND sha256.
    🆕 ⚠️ **If you do this in Python, note that D462's "use a function replacement"
    rule is JS-SPECIFIC**: Python's `str.replace` REJECTS a function second argument
    with a `TypeError`, and a probe that swallows it silently measures the
    UNMUTATED file — a green-looking non-result. Python never interprets `$`; use
    `find`-split + join with a `len(parts) == 2` assertion.

## For my sweep prediction

Report the corpus delta as `+K killed, +S declared survivors` — I commit the
predicted line BEFORE the sweep runs, so it must be exact.

⚠️ **And run `git diff --numstat` and report it.** If the slice deletes nothing, all
declared survivors clear cheaply; if you modified existing lines, name every file
and line so I re-read the right reasons instead.

## Hard rules

  - DO NOT COMMIT. DO NOT `git add`. DO NOT run a whole-corpus sweep. Leave the tree
    dirty and NAME every untracked path — `git commit -a` cannot see them.
  - NEVER `git stash`, `git checkout --`, `git reset --hard`, or any wholesale
    working-tree mutation.
  - Never `String.replace(find, replacementString)` with a replacement read from a
    file — this is the defect D470 found in the harness itself, eight slices after
    the rule went into the conventions.
  - Encode first, write second, inside `try/finally`.
  - Temp files in $CLAUDE_JOB_DIR/tmp, never /tmp.

## Report back

Which of the eleven you chose and **why, with the source evidence that decided it**;
what you built, with printings and corpus FILE LINES (fileLine = arrayIndex + 53);
what you left and its price in one of D469's three shapes (bigger than it looks /
smaller than its reputation / version-costing) — **the next slice inherits these, so
they are a deliverable, not a footnote**; **every place this brief was wrong**,
assuming at least one; the gate results verbatim; the `git diff --numstat`; and the
corpus delta.
