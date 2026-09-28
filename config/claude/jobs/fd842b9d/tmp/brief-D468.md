# D468 — the Ancient / Future card-class axis

Repo: /home/jofre/projects/luminous_ui  (branch main, tree CLEAN at 43628c21)

Read FIRST, in this order, and treat them as binding:
  - scripts/autoloop/prompt.md
  - docs/conventions.md  (all of it; it is long and it is the law)
  - the `## NEXT (resume point)` block in docs/progress.md
  - the D460..D467 rows in docs/decisions.md (tail of the file)

## Why this target — evidence, not a hunch

`bun scripts/residue-census.ts` at HEAD reports RESIDUE **115 sentences / 159
printings** (population 640/1732, minus reader 499/1523, registry 10/16, gate
5/13, trailing 11/21). Of those 115 residue sentences, **12 sentences / 16
printings** mention `Ancient` or `Future`. That is the single largest coherent
blocker left in the residue, and the classifier reaches several of them with a
ONE-TOKEN edit, which is its strongest possible signal. Verbatim classifier output:

  SUBST-2  "During your opponent's next turn, prevent all damage done to this
            Pokémon by attacks from Ancient Pokémon."
            «Ancient» → «Basic» builds: [{op:"preventDamage",fromClass:{stage:"basic"}}]

  SUBST-2  "This attack does 30 damage for each of your Ancient Pokémon in play."
            «Ancient» → «{G}» builds: deriveAttackDamageMultiplier →
            {per:30,count:{kind:"pokemonInPlay",seat:"you",filter:{kind:"typedPokemon",pokemonType:"Grass"}}}
            and deleting «Ancient» builds the same with filter {kind:"anyPokemon"}

  SUBST-2  "If your opponent has any Future Pokémon in play, this attack does 120 more damage."
            «Future» → «{W}» builds: {per:120,count:{kind:"boardCondition",
            cond:{kind:"opponentInPlayHasType",type:"Water"}}}

  SUBST-3  "Move all damage counters from 1 of your Benched Ancient Pokémon to
            your opponent's Active Pokémon."
            «Ancient» → «Team Rocket's» builds:
            [{op:"moveCountersToDefender",ownerPokemon:"Team Rocket"}]

  PHRASE-1 "Heal 100 damage from 1 of your Benched Ancient Pokémon."
            deleting «Ancient» builds: [{op:"healChosen",amount:100,zone:"bench"}]

  PHRASE-1 "Search your deck for up to 2 Basic Energy cards and attach them to
            your Future Pokémon in any way you like. Then, shuffle your deck."
            deleting «Future» builds: [{op:"attachFromDeck",filter:{kind:"basicEnergy"},max:2},{op:"shuffleDeck"}]

  PHRASE-1 "If you played a Future Supporter card from your hand during this turn,
            this attack does 100 more damage."
            deleting «Future» builds: {per:100,count:{kind:"boardCondition",
            cond:{kind:"youPlayedSupporterThisTurn"}}}

The remaining five (COMPOUND-head "If you played an Ancient Supporter card …
discard 3 more cards in this way"; "prevent all damage done to each of your Future
Pokémon by attacks from Pokémon ex. If this Pokémon is no longer your Active
Pokémon, this effect ends."; "If 1 of your other Ancient Pokémon used an attack
during your last turn …"; "Reveal the top 5 cards … 70 damage for each Future card
you find there …"; "This attack does 10 more damage for each Ancient card in your
discard pile.") each carry a SECOND blocker on top of the class axis. Do NOT try
to build those. Naming them here is so you do not mistake them for in-scope.

## What I am ASSERTING vs. what you must VERIFY

ASSERTED (from the instrument, re-runnable): the counts above, and the fact that
each quoted sentence builds under the quoted one-token edit.

NOT ASSERTED — you must establish these yourself from the source, and if I have
them wrong, SAY SO IN YOUR REPORT and follow the source, not this brief:
  - whether card data anywhere in the repo already carries an Ancient / Future
    marker (check packages/schema, the card corpus, `cards.ts`, `testFixtures.ts`);
  - the exact shape of `AttackerClass` (effects.ts ~:801) and whether the class
    axis belongs there, in `CardFilter`, in `BoardCondition`, or in more than one;
  - how many DISTINCT type-level additions the seven in-scope sentences actually
    need. If the honest answer is that they need three separate vocabularies and
    the slice only coherently covers two of them, BUILD THE COHERENT SUBSET and
    say plainly which sentences you left and why. A smaller true slice beats a
    larger one held together by a claim that does not survive the sweep.

My briefs have carried a false premise in a large majority of recent slices —
D461 named the wrong op outright. Assume this one is wrong somewhere and check.

## The work

1. Pick the coherent subset of the seven. Build it: the type additions, the
   reader/derive changes, and whatever the interpreter needs to make the ops
   MEAN something at runtime (a filter that parses but never narrows a board is
   not built — the conventions are explicit about this).
2. Fixtures in `packages/engine/src/testFixtures.ts` as needed; follow the
   existing `fix-*` naming.
3. A NEW test suite file for the slice (follow e.g. benchNounScaling.test.ts for
   shape and depth). Behavioural assertions on a real board, not shape snapshots.
4. Hand-author mutant rows in scripts/mutation/mutants.ts for EVERY sentence and
   EVERY field you add — one row per axis, `expectKilledBy` naming your suite.
   `find` MUST occur exactly once in its target file. A row with `survives` and
   no `expectKilledBy` crashes the runner silently.
5. Bump the archive ratchet `const ARCHIVES = 137;` → 138 in
   packages/engine/src/progressLog.test.ts, and step the engine version.
6. Update the census pins in packages/engine/src/censusAtHead.test.ts (POPULATION
   / BUILT / residue literals) to the NEW measured values. Step the FRONT terms;
   do NOT step the frozen endpoints — a red run names the endpoint, and the wrong
   edit is the one the tool names.
7. Also re-run `bun scripts/residue-census-gate.ts` and update its §A pinned
   literals (currently 141 / 115 / 159) to the new measurement.

## Gates you must pass before reporting

  - `bun run check` GREEN. Report the exact "N passed (N)" for files and tests.
  - `bun scripts/mutation/precheck.ts` clean; report the corpus total.
  - `bun scripts/residue-census-gate.ts` OK; report the §A triple.
  - a probe of your own rows ONLY:
      `bun scripts/mutation/run.ts --decision D468 --allow-dirty`
    `--allow-dirty` is MANDATORY on an uncommitted tree or every row is
    SKIPPED-DIRTY and the exit is a verdict-shaped non-result. `--decision`
    matches by String.includes, so "D468" is safe but check the row count is
    what you expect. Report `killed / survivor / GAP` exactly.
  - a find-vs-replace diff over your new rows: a row whose `replace` compiles to
    byte-equivalent code is INERT and precheck CANNOT see it.

## Hard rules

  - DO NOT COMMIT. DO NOT `git add`. DO NOT run a whole-corpus sweep. Leave the
    tree dirty; I do the ritual and the commit.
  - NEVER `git stash`, `git checkout --`, `git reset --hard`, or any wholesale
    working-tree mutation.
  - Never `String.replace(find, replacementString)` when the replacement is read
    from a file — `$&`/`$\`` splice. Use a function replacement and assert the
    resulting file size. A past slice spliced 19,000 lines of effects.ts into
    itself this way.
  - When writing a file, encode first and write second, inside try/finally. A
    past throwaway script truncated mutants.ts to 0 bytes.
  - Temp files go in $CLAUDE_JOB_DIR/tmp, never /tmp.

## Report back

Return: what you built (sentence by sentence, with the exact printings count and
the corpus file LINE — file line, not array index; fileLine = arrayIndex + 53);
what you left and why; every place this brief was wrong; the four gate results
verbatim; and the exact corpus delta as `+K killed, +S declared survivors`, since
I must commit the predicted sweep line before the sweep runs.
