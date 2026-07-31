# `mem` — a Turso-backed memory system for Claude Code

Design + phased build plan. Written 2026-07-29.

## Decisions taken

| Decision | Choice |
|---|---|
| Capture | Gated auto-capture — cheap regex gate, staged writes, manual promotion |
| Content | Curated facts only (preferences, decisions, constraints, corrections) |
| Storage | Local file only, no cloud sync |
| Distribution | Personal, skills-directory plugin in dotfiles |
| Surface | Skills + hooks + CLI. **No MCP server.** |

Rationale for no MCP: MCP tool schemas occupy context on every turn forever. A `bin/` CLI
costs zero tokens until invoked, and hooks cover the automatic paths.

## Measured facts this design rests on

Probed on this machine (NixOS, node v22.23.1, `@tursodatabase/database` 0.7.0):

```
Turso vector:  vector32() + vector_distance_cos()          ✅ works
Turso ANN:     libsql_vector_idx / vector_top_k            ❌ absent in the Rust rewrite
Turso FTS5:    CREATE VIRTUAL TABLE ... USING fts5         ❌ "no such module: fts5"
Turso fts_*:   fts_match(col,'term') scalar                ✅ works (hit/miss verified)
               fts_score(col)                              ⚠️  returns 0 without the
                                                              feature-gated fts index
BEGIN CONCURRENT                                           ❌ needs MVCC build flag

KNN, 20k rows × 768d, fresh process:  open 5ms · query 50ms · db 81MB
  (at 384d expect ~25ms / ~40MB — comfortably fine to ~100k rows)
Bulk-insert gotcha: querying in the same process right after a 20k-row insert
  txn took 21s (WAL spill). Checkpoint after bulk writes.

Embeddings — transformers.js, Xenova/all-MiniLM-L6-v2 q8, 384d:
  model load 222ms (cached) · single embed 11ms · batch of 32 43ms
  ⇒ hook budget: node start + load + embed + query ≈ 300ms, fully offline
```

### Measured after slice 1.5 — the bulk-insert gotcha is the foreign key, not the WAL

Re-probed at 384d through the real schema, Turso 0.7.1:

```
20k-row insert in one txn, foreign_keys ON   134 s    6.7 ms/row and climbing
                           foreign_keys OFF  ~5 s     0.28 ms/row, flat
query in the same process, before checkpoint  38 ms
                           after checkpoint   37 ms   ← the 21s stall does not reproduce
wal_checkpoint(TRUNCATE) after 20k rows         6 ms   80 MB WAL → 0 bytes
PRAGMA foreign_key_check                      returns [] even with a dangling reference
cold `mem search`, 200 memories, fresh node  ~310 ms  (the scan itself is 2 ms)
```

`superseded_by INTEGER REFERENCES memories(id)` is what costs: with `foreign_keys = ON`
every insert is O(rows already inserted) **even though the column is NULL** — 5k rows take
4.7s against 0.55s with the pragma off. It is not WAL spill: chunking the transaction and
checkpointing between chunks changes nothing, and a table without the self-reference stays
linear. So bulk loaders (`build/seed.mjs`) insert with foreign keys off and then look for
dangling references in plain SQL, because the pragma that should do that check is a no-op
in this build. `mem import` keeps them on — one transaction, correctness over speed — but a
multi-thousand-row restore will feel it.

The checkpoint stays regardless: it costs milliseconds and folds an 80 MB WAL back into the
file. The 21s query stall it was written down to prevent is not a thing in this build.

**Linear scan is the right call at this scale.** Exact KNN has zero recall loss and no index
to maintain. libSQL (`@libsql/client`) does have DiskANN, but it's the legacy path and buys
nothing below ~100k rows. Revisit only if the store grows past that.

## The real risk is precision, not performance

Memory systems fail by retrieving five stale half-relevant facts on every prompt until the
model starts obeying them. Countermeasures, built in from day one:

1. **Distance threshold, not fixed top-k.** When nothing clears the bar, inject *nothing*.
2. **Hard scoping.** Global vs per-project; recall unions only those two.
3. **Write-time dedup + supersession.** Near-duplicates update, they don't accumulate.
4. **Staging.** Auto-captured items are `status='staged'` and never injected until promoted.
5. **Framed as data.** Injected text is labelled recollection-not-instruction, with id + age.
6. **Secret scrubbing.** Reject writes matching key/token patterns rather than storing them.
7. **Plain-text export.** `mem export` to JSONL so the store is never a black box.

## Layout

```
~/.claude/skills/mem/                  ← git-tracked in dotfiles
├── .claude-plugin/plugin.json         name: "mem"
├── skills/
│   ├── remember/SKILL.md              model-invoked capture
│   ├── recall/SKILL.md                explicit search
│   └── review/SKILL.md                staging triage + hygiene
├── hooks/hooks.json                   SessionStart · UserPromptSubmit
├── hooks/*.mjs                        hook handlers
├── bin/mem                            CLI entrypoint
├── src/{db,embed,search,write,scope,scrub,deps}.mjs
└── PLAN.md

${CLAUDE_PLUGIN_DATA}/                 ← NOT git-tracked
├── mem.db                             the database
├── models/                            transformers.js cache
└── node_modules/                      lazily installed deps
```

Fall back to `$XDG_DATA_HOME/claude-mem` when `CLAUDE_PLUGIN_DATA` is unset, so the CLI
works when run by hand. Add `config/claude/skills/mem/node_modules` and `*.db*` to
`.dotfiles/.gitignore` regardless, as a belt-and-braces guard.

Slash commands land as `/mem:remember`, `/mem:recall`, `/mem:review`.

## Schema v1

```sql
CREATE TABLE memories (
  id             INTEGER PRIMARY KEY,
  uid            TEXT UNIQUE,          -- stable id, survives export/import
  kind           TEXT NOT NULL,        -- preference|decision|constraint|fact|correction|reference
  scope          TEXT NOT NULL,        -- global | project
  project_key    TEXT,                 -- normalised git remote, else abs path; NULL when global
  text           TEXT NOT NULL,        -- ONE fact, self-contained, imperative
  why            TEXT,                 -- rationale / where it came from
  emb            BLOB,                 -- vector32; NULL only for tombstoned rows (ladder rung 3)
  emb_model      TEXT NOT NULL,        -- e.g. 'Xenova/gte-small@q8'
  emb_dim        INTEGER NOT NULL,
  salience       REAL NOT NULL DEFAULT 0.5,
  confidence     REAL NOT NULL DEFAULT 0.5,
  pinned         INTEGER NOT NULL DEFAULT 0,
  status         TEXT NOT NULL DEFAULT 'active',  -- staged|active|archived|superseded
  superseded_by  INTEGER REFERENCES memories(id),
  source_kind    TEXT,                 -- user|auto|import
  source_session TEXT,
  created_at     INTEGER, updated_at INTEGER,
  last_injected_at INTEGER, injected_count INTEGER NOT NULL DEFAULT 0,
  last_used_at     INTEGER, useful_count   INTEGER NOT NULL DEFAULT 0,
  expires_at     INTEGER,
  consolidated_at INTEGER              -- watermark; skip unchanged pairs on re-run
);
CREATE INDEX memories_lookup ON memories(status, scope, project_key);

CREATE TABLE memory_links  (src INTEGER, dst INTEGER, rel TEXT, PRIMARY KEY(src,dst,rel));
CREATE TABLE memory_events (id INTEGER PRIMARY KEY, memory_id INTEGER, event TEXT,
                            detail TEXT, at INTEGER);
CREATE TABLE meta          (k TEXT PRIMARY KEY, v TEXT);  -- schema_version, emb_model
```

Storing `emb_model`/`emb_dim` per row is what makes changing embedding model later a
migration rather than a rebuild-from-scratch. Slice 1.6 exercised this for real.

**`emb` is nullable, and every vector query must say so.** The pruning ladder tombstones a
row by setting `emb = NULL` (rung 3), so the column cannot be `NOT NULL` — the original
schema here said otherwise and slices 1.3 through 1.6 each tripped over it. Two consequences,
both load-bearing:

- Any candidate query needs `emb IS NOT NULL`. **Measured in slice 5a.3, and it is worse than
  written above:** `vector_distance_cos(NULL, v)` does not return `NULL` in this Turso build,
  it *throws* (`Conversion error: Invalid vector type`) and takes the whole statement with it.
  So an unguarded query does not mis-rank one row, it fails — and since every hook fails open
  and silent, the whole store would go dark rather than one tombstone jumping the queue.
- Distances are only meaningful within one vector space, so candidates must also match on
  `emb_model` and `emb_dim`. Mid-migration, a store legitimately holds both.

Schema v1 shipped with the `NOT NULL`. **Migration v2, `emb-nullable`, is the rebuild that
drops it** (slice 5a.3) — SQLite cannot drop a column constraint, so the table is recreated,
the rows copied, the old one dropped and the new one renamed. Two steps of that are not the
textbook procedure and both were forced by this build rather than guessed:

- `PRAGMA defer_foreign_keys` has no effect inside the migration runner's transaction, so the
  copy cannot carry `superseded_by` in one pass — a row superseded by a *higher* id fails the
  self-FK the instant it is inserted. The copy leaves that column NULL and a second `UPDATE`
  fills it once every id exists.
- `DROP TABLE` runs an implicit `DELETE` with foreign keys on, so dropping a table whose rows
  still point at each other fails too. The old table's pointers are cleared first, which is
  safe because their values are already in the new one.

`ALTER TABLE … RENAME` does rewrite the new table's own FK clause to name `memories`, so the
self-reference survives; the index does not, and is recreated by hand. `db.test.mjs` asserts
all of it against a v1 fixture holding a forward self-reference, a link, an event and a NULL in
every nullable column, because a rebuild is exactly the migration where data goes missing
quietly.

## Retrieval

1. Candidates: `status='active' AND (scope='global' OR project_key = ?)`
2. Vector leg: `ORDER BY vector_distance_cos(emb, vector32(?)) LIMIT 20`
3. Lexical leg: `fts_match(text, ?)` over query terms, LIMIT 20
4. Fuse by reciprocal rank: `Σ 1/(60 + rank)`
5. Boost: `× (1 + 0.3·salience + 0.2·pinned) × recency_decay`
6. **Gate:** keep only vector-sim ≥ a threshold, or an exact lexical hit. Cap 5 items /
   ~600 tokens. Nothing clears it → inject nothing. The threshold is **0.82** since slice
   1.6 (it was 0.35 for all-MiniLM); it is model geometry, not a preference, and moves
   whenever `EMB_MODEL` does.
7. `SessionStart` injects pinned + core globals (≤3) once; `UserPromptSubmit` does the
   per-prompt retrieval.

### Measured after slice 1.3 — the threshold is not the problem

Query→memory cosine on the real build, against two stored memories:

```
query                                  relevant   irrelevant
"npm or pnpm"                            0.830       0.158
"pnpm"                                   0.673       0.127
"I use pnpm"                             0.654       0.223
"what package manager do I prefer"       0.354       0.248
"which package manager should I use"     0.345       0.244
"package manager preference"             0.273       0.256   ← barely above noise
```

**The relevant and irrelevant bands overlap**, so no threshold separates them: 0.35 gives
false negatives, lower gives false positives. Literal token overlap is carrying the passing
cases — "pnpm" verbatim scores 0.673, the paraphrase 0.273. The lexical leg didn't help
either (`lexicalHits: 0`; query terms "package"/"manager" appear nowhere in the memory).

Cause: **all-MiniLM-L6-v2 is a symmetric similarity model**, trained to compare like with
like. Retrieval here is asymmetric — a question against a stored statement — and similarity
collapses across that gap. Asymmetric models (`e5-small-v2`, `bge-small-en-v1.5`, both 384d)
exist for exactly this, using `query:`/`passage:` prefixes.

So the model gets chosen by measurement in **slice 1.6**, before the Phase 3 harness tunes a
threshold on top of it. The metric that matters is **separation** — the margin between the
worst relevant score and the best irrelevant one — not recall@5, which hides this failure.
Storing `emb_model`/`emb_dim` per row is what makes the swap a migration rather than a rebuild.

### Measured in slice 1.6 — the model was the problem, and gte-small fixes most of it

`build/embed-bench.mjs` runs each candidate in its own process against the 200-memory seed
corpus: **32 questions with a known answer** (24 of them paraphrases sharing no content word
with their target) and **9 questions the store cannot answer**, which must match nothing.
Corpus embedded as passages in batches of 32, queries one at a time — the way the system
actually uses the model. Prefixes applied per model card (`query:`/`passage:` for e5, a query
instruction for bge, none for gte or MiniLM).

All ten in one fully-cached run; timings are this machine, and the cold column varies ±5%
between runs.

```
model                 dim   r@5   MRR    worst-rel  best-irr   SEPARATION   AUC    load ms  embed ms  cold ms
all-MiniLM-L6  (old)  384   81%  0.610      0.094     0.312      -0.218    0.854     109      1.2      277
e5-small-v2           384   75%  0.580      0.750     0.826      -0.076    0.792     160      2.2      324
bge-small-en-v1.5     384   78%  0.631      0.407     0.546      -0.138    0.885     159      2.6      333
gte-small      (new)  384   81%  0.629      0.782     0.813      -0.031    0.969     157      2.0      321
multi-qa-MiniLM-L6    384   78%  0.625      0.103     0.268      -0.165    0.816     116      1.2      269
e5-small-v2    fp32   384   75%  0.596      0.753     0.828      -0.075    0.792     243      3.4      416
bge-small      fp32   384   78%  0.631      0.421     0.543      -0.121    0.878     253      5.2      416
multi-qa-MiniLM fp32  384   78%  0.607      0.099     0.268      -0.169    0.819     169      1.9      336
bge-base-en-v1.5      768   81%  0.590      0.460     0.631      -0.171    0.868     252      7.4      442
multi-qa-mpnet-base   768   81%  0.641      0.380     0.476      -0.097    0.788     277      4.7      461
```

**Strict separation is negative for every model, so recall@5 and MRR are near-useless here** —
they sit within 6 points of each other across the whole table while the models differ hugely
in whether a gate can work at all. The metric that ranks them is **AUC**: the probability that
a right answer outscores a junk query. gte-small takes it at **0.969 against the incumbent's
0.854**, and is the only model whose p10/p90 separation is positive (+0.005), meaning the
overlap is a two-query tail rather than the whole distribution.

What that buys, at the operating point each model would actually ship with — "keeps" is right
answers still retrieved, "admits" is junk prompts that would inject something:

```
all-MiniLM-L6-v2 @ 0.35 (shipped)   keeps 53%   admits 0/9
gte-small        @ 0.79             keeps 81%   admits 1/9
gte-small        @ 0.814            keeps 78%   admits 0/9   ← efficient point
gte-small        @ 0.82  (shipped)  keeps 72%   admits 0/9
gte-small        @ 0.83             keeps 63%   admits 0/9
```

**53% → 72% of right answers retrieved at zero junk admitted.** 0.82 rather than the efficient
0.814 because 0.814 sits a hair above the *maximum* of a nine-sample negative distribution,
and fitting a production threshold to a sample maximum is how a gate that measured clean
starts leaking. Phase 3.3 re-tunes it against the real harness.

Three things the same run ruled out, each of which would otherwise have been guessed at:

- **Quantisation is not the problem.** q8 vs fp32 changes AUC by at most 0.007 and in no
  consistent direction (e5 0.792/0.792, bge 0.885/0.878, multi-qa 0.816/0.819), while fp32
  costs 2–3× the embed time and pushes the cold path past the 400ms budget.
- **Dimensionality is not the problem.** Both 768d models score *worse* than gte-small at 384d
  — multi-qa-mpnet lands at 0.788 AUC, below the incumbent — and cost 440–460ms cold.
- **Score normalisation does not rescue a bad model.** Mean-centring the space and per-query
  z-scoring were both measured; both made separation *worse* for every model (gte: -0.031 raw,
  -0.251 centred, -2.686 z-scored). Raw cosine — the thing `vector_distance_cos` computes —
  is the best available scoring function, which is convenient, since it is also the only one
  expressible as a SQL `ORDER BY`.

The residual overlap is honest and worth not forgetting: two hard paraphrases ("am I allowed
to overwrite a colleague's remote history?" → *never force push a branch somebody else is
working on*) score below two word-overlap negatives ("review my landlord's tenancy agreement"
→ *review for correctness first and for style last*). The lexical leg cannot rescue the first
pair — there is no shared vocabulary to hit. Phase 3.3 inherits a trade-off, not a solved
problem.

**Consequence for the write path.** gte packs unrelated sentences far higher than MiniLM did
— an unrelated pair floors at ~0.74, not ~0.15 — so `DEDUP_THRESHOLD = 0.93` means something
quite different under it. Measured on 12 hand-written restatement pairs: 0.93 now catches
**6 of 12** restatements against MiniLM's **1 of 12**, while still clearing the closest pair of
genuinely distinct memories in the corpus (0.915). The constant survives the swap and gets
better at its job, but the headroom is only 0.015 — worth re-measuring if the model moves again.

**Cost.** Model load 157ms (vs 109ms), single embed 2.0ms (vs 1.2ms), cold end-to-end 321ms
against the 400ms hook budget. The download is 34MB rather than 23MB.

`mem reembed` rewrites rows whose `emb_model`/`emb_dim` stamp is stale — the migration this
per-row stamp existed for. Retrieval filters on the stamp, so until it runs, rows written by
the old model are invisible rather than wrong.

### Built in slice 3.1 — the session-start profile costs no embedding

Step 7's first half is `src/profile.mjs` + `hooks/session-start.mjs`. The thing worth writing
down: **this path never embeds anything.** It has no query to embed, so it is a scoped column
read — no transformers import (~100ms), no model load (~150ms). Measured over 15 spawns of the
real hook: **p95 48ms isolated, 224ms with the whole test suite loading ONNX models alongside
it**, both inside the 400ms budget with room to spare. The budget pressure in phase 3 belongs
entirely to 3.2.

Selection is a hard tier, not a score: pinned first (any scope — pinning a project memory means
exactly that inside that project), then globals ranked by `strength`, capped at 3. A 0.2 boost
would let a strong global outbid a pin, and "I pinned this" is not a preference. Unpinned
*project* memories are excluded on purpose — they are the bulk of a real store and 3.2 owns
them; injecting them unqueried is the failure the threshold gate exists to prevent.
`MIN_STRENGTH = 0.05` floors the unpinned tier (a default-scored global drops out after ~10
unused weeks) and never applies to a pin. It is a judgment call, not a measurement: 3.3's
harness tunes the *query* threshold and has no cases for this path.

The hook is read-only and never migrates — `readonly` implies `fileMustExist`, so a machine
with no store injects nothing rather than creating a database from a hook, and nothing here can
lock or corrupt. It checks `depsReady()` before the first turso import and passes
`MEM_NO_INSTALL=1`, because `loadModule()` would otherwise run `npm install` at session start.
It does **not** bump `injected_count`/`last_injected_at`: 3.2 owns injection accounting, and
5a.2's echo heuristic reads those columns to judge whether an injection was *useful* — an
unqueried session-start injection is not evidence either way.

Framing is load-bearing and treated as part of the deliverable, not decoration.
`additionalContext` lands where a user turn lands, so a bare list of imperatives ("always use
pnpm") reads as instructions for *this* prompt and gets answered. The block is named as
recollection, marked possibly-stale with the user's present words winning, told not to act and
not to mention, and carries `#id` + a coarse age per item so a wrong memory can be corrected by
reference. Age comes from `created_at`, not `updated_at`: dedup merges and maintenance rewrites
move `updated_at`, and reporting that as the age makes an old belief look freshly held.

### Built in slice 3.2 — the per-prompt hook, and the field name nobody agrees on

Step 7's second half is `src/recall.mjs` + `hooks/prompt-recall.mjs`. It reuses the gate in
`search.mjs` unchanged and passes **no threshold override** — 3.3 owns that number — so the
new decisions are all about cost, accounting, and framing.

**Cost.** This is the one recall path that must embed, so it pays what session start does not:
the transformers import plus the model load, in a fresh process, every prompt. Measured over 9
spawns of the real hook, seeded store, cold each time:

```
p95 367ms, best 343ms   this test file alone
p95 499ms, best 406ms   with the whole suite running concurrently (9 procs, ONNX loads)
```

So the 400ms budget holds on an idle machine and does not under load. The test asserts a
tripwire (best < 700ms, p95 < 1200ms) rather than the budget, because it runs inside the
suite that causes the load; `mem tune` in 3.3 is where p95 gets measured for real.

Two refusals keep the bad cases from being worse than slow. `modelCached()` is checked before
anything imports transformers, so a machine that has never run `mem warm` skips recall instead
of pulling 34MB in front of a prompt — the same shape as the `depsReady()` check that stops
`npm install` from happening at a keystroke. And a prompt whose every token is a stopword
("yes, please do that") short-circuits before the model loads at all: `queryTerms()` returns
nothing, the lexical leg has no terms, and the vector of a sentence with no content word points
nowhere in particular. That is a good share of real turns costing ~35ms instead of ~350ms.

**The prompt is not where PLAN says it is.** Three field names for the user's text are in
circulation and this build cannot tell which the installed harness sends: the hook reference
documents `prompt`, the official `plugin-dev` skill's own fixture emits `user_prompt`, and the
line below (plus this slice's verify command) says `user_message`. Betting on one and losing is
a hook that silently never recalls anything — the failure nobody notices — so `promptText()`
reads all of them in order and takes the first that carries text. **Slice 4.1's capture gate
must use `promptText()` rather than re-reading `user_message` directly.**

**Injection accounting.** `markInjected()` bumps `injected_count` and `last_injected_at` for
exactly the rows the block contains, after the gate and the cap — PLAN's "actually injected
into context (not merely scanned)". It touches nothing else, and `last_injected_at` is
deliberately absent from `retention()`'s `last_used_at → updated_at → created_at` chain: if
injecting a memory reset its own decay clock, every memory the hook ever surfaced would stay
strong on the strength of having been surfaced, and the ranking would be a feedback loop
measuring itself. Being injected is not evidence of being useful; `useful_count` is, and 5a.2
earns it.

Writing counters means this hook cannot be read-only like 3.1's. It opens **read-write with
`runMigrations: false`, only after `existsSync(dbPath)`** — so a hook still never creates or
upgrades a store — and falls back to a read-only open if that fails, with the `UPDATE` itself
wrapped so a failure is logged and dropped. The accounting exists for the injection; losing the
injection to protect the accounting would be backwards, and there is a test that removes write
permission from the database and still expects the memory.

**The handoff to 5a.2.** One JSON record per session under `${dataDir}/turns/<session_id>.json`,
overwritten every prompt: `{session_id, at, cwd, project_key, prompt, injected:[{id, uid, text,
similarity, coverage}]}`. `recordTurn()`/`readTurn()` are both in `recall.mjs` so the format is
defined once. Three things about it are deliberate: it is written **even when nothing was
injected**, because "this turn injected nothing" is the answer the echo heuristic needs most
often and it is not the same answer as "no record"; it carries `at` and `readTurn` refuses a
record older than `maxAge`, because a hook that exits early writes nothing at all and the
previous turn's record would otherwise read as this turn's; and the session id is reduced to
`[A-Za-z0-9_-]` before it becomes a filename, dots included, since `..` survives a naive
filter. Abandoned records are swept after `TURN_TTL_MS` on the next write.

The block is *not* asking the model to call `mem touch <id>` yet — PLAN's second usefulness
signal — because that command does not exist until 5a.2. It adds the command and the line
together. What the block does add over the profile's framing is an admission that the items were
chosen by similarity and one may be beside the point: at the shipped threshold roughly a quarter
of real matches are missed and the occasional near-miss gets through, and a model told "here is
what is relevant" will work to make an irrelevant memory relevant. The `<mem-recollection>` tag
and the `#id` item shape are shared with 3.1 through `renderItems()` rather than reimplemented,
because `#id` is the handle a correction uses and two spellings of it in one context window
would make "forget #4" mean nothing.

**Still unverified:** whether a skills-dir-discovered plugin honours `hooks/hooks.json` at all.
`mem@skills-dir` is a registered plugin with usage recorded, and `UserPromptSubmit` is now wired
in `hooks/hooks.json`, but the only hook *proven* to run on this machine is
`build/session-relay.mjs`, wired by hand in `~/.claude/settings.json`. It cannot be settled from
outside a live session while the real store is empty — both hooks correctly inject nothing.
Store one memory and the next session start reveals the answer; if the answer is no, the fix is
a `settings.json` entry for the user, not a code change.

### Measured in slice 3.3 — 0.82 leaked, the threshold is 0.85, and it costs 40% of recall

`build/harness.json` is **52 prompts against the seeded store**: 31 with a known right answer
(12 literal, 19 paraphrase) and **21 that must retrieve nothing**. `mem tune` sweeps the vector
threshold from 0.74 to 0.93 in steps of 0.005 and reports precision, recall, per-tier hit rate,
admitted negatives and p95 latency per candidate. `build/harness.mjs` is where the cases are
authored, against memory *text*; it resolves each to the uid the seed produced, because those
uids are hex from a seeded rng and nobody writes them by hand.

**The headline: 0.82 does not hold up.** Slice 1.6 chose it by measuring the *model* — raw
cosine over an unscoped corpus, nine world-knowledge negatives. Measured on the *shipped path*,
0.82 admits **7 of 21** negatives, which fails this phase's own exit criterion outright.

```
threshold   served    admits   precision   mean items/prompt
0.790        28/31    12/21      0.17           3.31
0.820        22/31     7/21      0.46           1.00   ← what 1.6 predicted
0.840        18/31     2/21      0.75           0.52
0.845        18/31     0/21      0.90           0.44   ← efficient point
0.850        17/31     0/21      0.89           0.40   ← shipped
0.860        13/31     0/21      1.00           0.29
```

Two negative classes did the damage, and both are the common case in use rather than the exotic
one. **Adjacent** prompts share vocabulary with a real memory and are still unanswerable —
"which branch of the river is deeper?" reaches 0.8416 against *branches are named
type/short-description*, "my alarm clock keeps firing in the middle of the night" reaches 0.8443
against *the nightly job fires at 03:00 UTC*. **Filtered** prompts are ones the store genuinely
answers, with the answer archived, staged, expired or in another project; retrieval then offers
the nearest *available* thing, which is what a similarity ranking is built to do — "how are
secrets supplied at runtime?" pulled *show one runnable example before explaining the options*
at 0.8204. Every one of the seven admissions cleared on cosine, not coverage: `lexical_admits`
is 0 at every threshold, so the IDF coverage gate at 0.6 is not the leak.

0.850 rather than the efficient 0.845 for the reason 1.6 stepped back from 0.814: 0.845 sits
**0.0007** above the maximum of a finite negative sample, and fitting a production constant to a
sample maximum is how a gate that measured clean starts leaking. The margin costs one prompt of
31.

**What it costs, split by tier, because the aggregate describes neither half:**

```
literal      11/12 served   0.92
paraphrase    6/19 served   0.32
offtopic      0/6  admitted
adjacent      0/7  admitted
filtered      0/8  admitted
```

A prompt that reuses the memory's own words is nearly free; a paraphrase is what the threshold
is actually adjudicating, and two thirds of them are now missed. `separation` on the scoped path
is **-0.066** — the worst right answer (0.7782, "how do I make this request safe to retry?"
against *idempotency keys belong in a header*) scores *below* the best wrong one (0.8443). No
value of this constant fixes that, which is the honest statement of what phase 3 delivers:
**recall is a retrieval problem, not a threshold problem.** Buying it back needs a better query
representation — HyDE-style expansion, a cross-encoder rerank over a loose candidate set, or
storing a question form alongside each memory — and all three are phase-6 work. What the gate
does guarantee is the property PLAN says matters most: 0.40 memories per prompt on average, and
nothing at all on a prompt the store cannot answer.

**Latency, measured properly at last** — 12 cold spawns of the real `prompt-recall` hook, one
per sampled harness prompt, on an idle machine and not competing with the test suite:

```
hook    p50 344 ms   p95 379 ms      inside the 400ms budget
embed   p50 2.7 ms   p95 3.5 ms      warm, in-process
query   p50 2.1 ms   p95 2.4 ms      searchScoped over 169 retrievable rows
```

So the budget holds, and the 379ms is ~97% fixed cost — node boot, the transformers import, the
ONNX load. The `query` column is the only part that grows with the store, and at 2.1ms it has
three orders of magnitude of headroom. 3.2's in-suite tripwire (best < 700, p95 < 1200) stays as
it is; it measures a machine running nine ONNX loads at once, which is a different question.

Two implementation notes worth not rediscovering. The sweep costs **one search per case, not one
per (case × threshold)**: the gate is a pure filter on `(similarity, coverage)` applied before
the cap, and `score` is threshold-independent, so a single `searchScoped(…, {gate: false})` per
case makes all 40 grid points a filter-and-slice in memory. `replay()` is that filter, and a
test runs it against the real gated `searchScoped` at four thresholds, because "the sweep is
free" is only true while the replay stays faithful. Separately, a right answer's similarity is
queried **directly** rather than read off the candidate list: the vector leg stops at 20 rows, so
a right answer ranked 21st is absent with no score, and reporting that as 0 made the first
separation figure -0.84 instead of -0.066. It also distinguishes the one miss no threshold can
fix (cleared the gate, lost to `VECTOR_LIMIT`) from the fourteen the gate caused.

`mem tune` reads the fixture store from `build/seed.mjs` and never the user's own — a run against
a store with four memories in it would report a precision of 1.00 and mean nothing. It refuses
rather than re-seeding, and `crossCheck()` fails loudly with the two commands to re-run if any
harness uid has gone, been reworded, or become reachable when the case depends on it not being.

## Capture gate

Fire on **`UserPromptSubmit`**, not `Stop` — the user's exact words are in the hook input, no
transcript parsing, and it runs before the model call. Read them with `recall.promptText()`:
the field name is not reliably `user_message`, see slice 3.2 above.

Pure-JS regex, target <20ms, no LLM: `always|never|from now on|prefer|instead|actually|
don't |stop |I use |we use |let's go with|remember `, plus correction shapes ("no, …").

When it fires, inject `additionalContext`: *"this prompt may contain a durable preference —
if so, record it with `mem remember`"*. The model already in the loop does the extraction,
so there is **no extra API call**. Writes land as `status='staged'`. Upgrade path if
precision disappoints: switch to a `prompt`- or `agent`-type hook doing dedicated extraction.

### Measured in slice 4.1

The gate lives in `src/capture.mjs` and costs **~1µs per prompt** — worst single call 0.07ms
idle, 2.6ms with the whole test suite competing for the CPU — against the 20ms budget. Three
orders of magnitude of headroom, so the hook's cost is still entirely the model load recall pays.

Fire rates on three corpora. 17 of 17 stated preferences fire, one per shape in the vocabulary
above. 1 of 21 ordinary working prompts fires ("what do you prefer?", asking the *model's*
opinion). 0 of the 52 recall questions in `build/harness.json` fire — a free negative set,
written for slice 3.3 by someone not thinking about this gate.

Applied literally the vocabulary fires 4 times on that harness, and **all four are `I use` /
`we use` inside a question**: "what do we use for unit tests?", "which package manager should I
use here?". Asking which tool to use is the opposite of stating which one you use, and the
difference is one word in front of it — an auxiliary or a modal. So `I use`/`we use` and
`remember` are suppressed after one ("do you remember…" wants recall, not capture), and `stop`
requires an activity after it (`stop using X`, not "how do I stop the server?"). The `no, …`
shape is taken literally — sentence-initial *and* commatted, so "no idea why this fails" and
"no need to do that" stay quiet at the cost of missing an uncommatted "no it still fails".
`prefer` is deliberately left wide: "you should prefer ripgrep" is a real instruction, and
suppressing it to win that one false fire trades a miss for a nudge nobody pays for.

**The gate never touches the store.** It is computed before the hook's filesystem checks and
emitted from every exit path, including the watchdog and the no-database refusal — so it fires
on a machine with no database, no dependencies and no cached model, which is precisely the
machine with nothing stored yet. When both halves fire, the recollection is emitted first and
the cue last.

The block is written to be ignorable, because the gate is wrong often and that is the deal that
makes it free: it says it is a regex, quotes the phrase that fired, and gives an explicit
"otherwise ignore this block". It routes through the `mem:remember` skill rather than `bin/mem
add` so the durability rules apply, and names the queue as `/mem:review`.

### The review queue, built in slice 4.2

`src/review.mjs` + `mem review [promote|edit|discard]` + `skills/review/SKILL.md`. Four
decisions in it are worth not re-litigating.

**It is a list of sources, not a SELECT.** `SOURCES` holds one entry today — staged memories —
and each entry knows how to list its items, resolve a ref to one, and carry out the verbs it
supports. Items are plain data with `{type, ref, actions, when, summary}` and the handler is
looked up from `type`, so `--json` prints the whole item and slice 5b.2 adds consolidation
proposals by appending to `SOURCES`, touching neither `bin/mem` nor the skill. This is what
"proposals land in the same review queue" costs if it is designed in rather than retrofitted.

**Promoting merges.** `mem add --staged` dedups against staged rows *only*, on purpose, so a
guess never bumps the confidence of something a human approved. That leaves promotion as the
moment the row enters retrieval and therefore the moment countermeasure #3 has to apply: a
staged capture within 0.93 of an active memory in the same scope folds into it (longest
wording wins, confidence bumps, the capture becomes `superseded_by` the survivor) instead of
becoming a second copy. The distance is computed between two *stored* blobs, so triage —
listing, duplicate flagging, promoting, discarding — never loads the model. Only editing the
text does, because the embedding travels with the text.

**Flagging and merging are two thresholds, 0.85 and 0.93.** Measured on gte-small: real
restatements land at 0.94–0.97 ("use pnpm, not npm, to install dependencies" vs "always use
pnpm to install dependencies" = 0.965) and unrelated facts at 0.77, but "in this repo use pnpm
and never npm, it is the only installer we support" against that same memory measures **0.922**
— the same fact, one point below the merge line. Merging on 0.85 is what the dedup threshold
was measured to prevent. Staying silent about a 0.92 neighbour in the one surface whose job is
"should this join the store?" leaves the only party who can tell without the evidence. So the
queue shows a neighbour from 0.85, tagged `merge` or `near`, and acts only from 0.93.

**Discard writes an `archived` event, not a `discarded` one.** That is the event
`mem forget --restore` reads to decide what to restore *to*, and it carries
`previous.status = 'staged'`, so undoing a rejection puts the item back in the queue rather
than promoting something nobody reviewed. `via: 'review'` on the detail is the marker phase 5a
looks for — a review rejection is the strongest negative signal in the "measuring useful"
section, and this is where it is recorded.

**The queue lists every project and is oldest-first.** Both are the opposite of `mem list`'s
defaults and for one reason: a queue you drain has to show you the item that has been waiting
longest, and one that hides other projects' items never reaches zero.

## Consolidation and pruning

### Why this is load-bearing

Measured, 20k rows × 384d, same table:

```
no filter (20k active)                     24.7 ms
WHERE status='active' → 2k of 20k           3.0 ms
   EXPLAIN: SEARCH m USING INDEX m_status (status=?)
archived rows tombstoned (emb = NULL)       3.2 ms   ← no further gain
exp() ln() pow() log()                      ✅ present — decay computable in SQL
VACUUM                                      ❌ experimental, disabled in this build
```

**Retrieval cost is proportional to the number of *active* memories, not stored ones.**
The index prunes rows before any distance is computed. Pruning is therefore the primary
performance lever, not tidiness — and no separate archive table is needed, the composite
index `(status, scope, project_key)` already does the job. Tombstoning embeddings buys
space only; with VACUUM disabled it bounds file growth rather than shrinking the file.

### The six ways a memory store rots

| Rot | Symptom | Detector |
|---|---|---|
| Near-duplicate drift | 5 phrasings of "use pnpm", all retrieved together | cosine 0.80–0.93 pair, same scope+kind |
| **Contradiction** | "we use Vitest" *and* "we moved to bun test" both active | cosine ≥0.85 + LLM judge |
| Dead scope | memories for a deleted repo or merged branch | project path gone / TTL expired |
| Never-matched cruft | captured once, never retrieved | `injected_count = 0` + age |
| **Over-general slop** | "the user likes clean code" — matches everything, helps never | high mean cosine to a random sample |

Contradiction is the dangerous one: a confidently wrong memory is worse than no memory.
Over-general slop is the sneaky one — it clears low thresholds broadly and crowds out
specific memories in the ≤5 item budget.

### Two tiers

Split by whether the operation needs judgement, because that decides whether it can run
automatically.

**Tier 1 — maintenance.** Pure SQL/vector math, no LLM, idempotent, reversible. Cheap
enough to fire detached at `SessionStart` (never blocking) or daily.

- recompute strength from decay
- fold in usage feedback from the last session
- archive by rule; expire TTLs; flag dead project scopes
- detect and record candidate pairs for tier 2
- WAL checkpoint

**Tier 2 — consolidation.** LLM-judged, batched, **proposes rather than applies**.
Weekly, or after 25 new memories. Writes proposals into the same review queue as staged
captures, so `/mem:review` is the one triage surface.

### Decay: spaced repetition, not a linear timer

```
halflife_days = H0 × (1 + useful_count)^α           H0 = 30, α = 0.6
retention     = exp(−ln2 × days_since_last_use / halflife_days)
strength      = salience × retention × confidence
```

A memory that keeps proving useful becomes durable; one that never does fades. Never used:
retention 0.5 at 30 days, 0.25 at 60. Used 5×: halflife ≈ 87 days. `pinned = 1` forces
retention to 1.0 — never decays, never pruned, exempt from all automatic actions.

`strength` replaces raw salience in the retrieval boost, so **stale memories sink in ranking
long before pruning touches them.** Decay degrades gracefully; pruning is the backstop.

### Built in slice 5a.1 — the model is written twice, and there is no migration

`src/decay.mjs` owns the three formulas above. The JS half was already here (slice 1.3 needed
it for the boost, which has used `strength` in place of salience from the start); what 5a.1
adds is **the SQL half**, and the discipline that keeps the two honest.

Both are needed and neither can be dropped. JS scores rows already fetched — the search boost,
`mem show`, the session-start profile — where re-querying to compute a number over columns in
hand would be absurd. SQL scores rows that have *not* been fetched: `mem list --sort strength`
must order and `LIMIT` in the database rather than pull the whole store into memory to sort it
(which is what it did before), and 5a.3's archiving rule is a `WHERE` clause over every row
there is. `exp`, `ln` and `pow` are all present in this Turso build, probed rather than assumed.

Two copies of a formula in two languages drift, so `decay.test.mjs` runs them against each
other over eighteen row shapes — pinned, never-used, used a hundred times, every null the
fallback chain has to survive, a clock that ran backwards — and requires agreement to **1e-12**.
The expressions are written to associate their arithmetic identically (`(salience × retention)
× confidence`, `(−ln2 × days) / halflife`) because agreeing to the last bit is free, and an
epsilon that has to be widened later is a bug nobody goes back and investigates.

**`strength` is not a stored column, and PLAN's tier-1 "recompute strength from decay" does not
need it to be.** It is a pure function of columns the row already has plus the current time, so
computing it in the query is both cheaper than a maintenance pass and never stale between two
of them — which is what rung 1 ("Demote — strength decays; sinks in ranking. Automatic,
continuous.") actually asks for. A stored column would decay in steps at whatever hour the run
fired.

**No migration.** The slice was scoped to split `injected_count` from `useful_count` in a schema
v2, but Schema v1 above already declares both and slice 0.3 shipped them; the split has been on
disk since the first database. So v2 stays free for the `emb NOT NULL` rebuild this document
already owes to 5a.3.

`mem list` gains `--min-strength` / `--max-strength`, bounds rejected outside [0, 1] so that
`--min-strength 15` is an error rather than an empty list. `--max-strength 0.15 --sort strength`
is the archiving rule's own query shape, typed by hand against a real store before anything
automatic starts acting on it.

### Measuring "useful" without lying to yourself

`use_count` is the trap: a memory injected 200 times and acted on never looks heavily used.
Split it.

- `injected_count` — incremented when actually injected into context (not merely scanned)
- `useful_count` — incremented only on a real signal

Signals for `useful_count`, cheapest first:

1. **Echo heuristic (free, automatic).** The `Stop` hook knows what was injected this turn
   and receives `last_assistant_message`. If the response echoes the memory's distinctive
   tokens, count it. Noisy but unbiased and costs nothing.
2. **Explicit.** The injected block asks Claude to note ids it acted on → `mem touch <id>`.
3. **Negative signal, strongest of all.** `/mem:forget`, a review rejection, or a user
   correction in a turn where the memory was injected → decrement confidence hard.

`injected_count` high with `useful_count` ≈ 0 is precisely the over-general-slop signature,
and nothing else catches it.

### Built in slice 5a.2 — the prompt is not evidence

`src/echo.mjs` + `hooks/stop-echo.mjs` build signals 1 and 2. Signal 3 is **not built** and no
later slice claims it.

**Why the heuristic is fussier than "does the reply contain the memory's words".** `useful_count`
is not a statistic; it is an input to the decay model. Every count lengthens the halflife and
`last_used_at` restarts the curve, so a wrong bump keeps a memory strong that nobody used — and
5a.3's archiving rule (`useful_count = 0`) will then never reach it. The failure is asymmetric,
so the rule is: a memory's **evidence tokens** are its distinctive words *minus every word the
user just typed*. If the prompt was "how do I install dependencies?", the reply contains
"install" and "dependencies" whether or not anything was injected; what is left after the
subtraction ("pnpm") is the part the model could only have got from the memory. That is what
`recordTurn()` kept the prompt for.

An echo is **one evidence token**, and the first draft of this rule wanted two (half the
evidence, denominator capped at four). It was wrong, and only a smoke run against a real store
said so: this plugin's canonical memory — *"always use pnpm to install dependencies, never
npm"*, asked *"how do I install the dependencies here?"*, answered *"run `pnpm install`, this
project is on pnpm"* — scored 1 of 4 and went uncounted. The evidence was `always pnpm never
npm`; the reply carried the only one of those a reply would ever carry. A rule needing two is
satisfied by nothing short of quotation, and a signal that never fires is not conservative, it
is absent.

What keeps a one-token bar honest is the second subtraction: **ECHO_FRAMING**, the modality and
frequency words every stated preference is phrased in (`always`, `never`, `prefer`, `instead`,
`actually`…). Replies are full of them for reasons that have nothing to do with memory. It is
one category and contains nothing domain-shaped, because a word wrongly on that list can only
cause a miss and never a false count — while `lockfile`, `deploy` and `rebase` are what a real
echo is made of. What remains is noisy, exactly as PLAN says it is; the population being scored
is memories that already cleared the 0.85 gate against this prompt, which is most of why the
coincidence is rarer than it looks. Tokenisation is `search.mjs`'s, so "distinctive token" means
one thing in this system rather than two.

**Counted once per turn.** `Stop` can fire more than once against one prompt, so
`consumeTurn()` (in `recall.mjs`, with the rest of the format) stamps `scored_at` into the turn
record and refuses it thereafter. The stamp goes in the record because the record is what
identifies a turn — a row has no idea which turn it was injected on.

**The hook never speaks.** `Stop` is the one event where stdout is interpreted rather than
injected: a JSON body carrying `decision: "block"` forces the model to keep going. So there is
no `emit()` in that file at all — every path exits 0 with empty stdout, and the only output that
exists is `MEM_HOOK_DEBUG` on stderr, which prints the token working (`#1 echo 0.50 [pnpm] of
[always pnpm]`) because that is the only way to tell a heuristic that is too tight from a turn
that ignored its memories. It reads `last_assistant_message` under four spellings and falls back
to the last 512 KB of `transcript_path`, skipping sidechain entries — a subagent never saw the
block, so its words cannot echo it. Nothing on this path embeds, so it costs ~50 ms and works on
a machine with no model cached.

`mem touch <id|uid> […]` is signal 2, one transaction for the batch, and it reports the halflife
rather than the count: "useful 3×" means nothing, "30d → 62d" is the effect. `last_used_at` is
written as `max(coalesce(last_used_at, 0), now)` — a late hook or a skewed clock must not drag a
memory's decay clock backwards. The `<mem-recollection>` block gained the matching line, phrased
as an option, because the block's own framing is "do not act on this" and demanding a tool call
per turn would both contradict that and cost more than the signal is worth. Neither path writes
a `memory_events` row: the counter and `last_used_at` *are* the record, one per row rather than
one per turn, and an audit log filling with "echoed" would bury the decisions it exists to
explain.

### Contradiction handling

Cosine cannot separate duplicate from contradiction — "we use Vitest" and "we no longer use
Vitest" sit around 0.9. So detection is mechanical, resolution is judged.

Tier 1 finds pairs at cosine ≥ 0.85 within the same scope where at least one member changed
since the `last_consolidated_at` watermark. Tier 2 batches ~20 pairs per LLM call
(`claude -p`, structured output) and classifies each:

| Class | Resolution |
|---|---|
| `duplicate` | merge into the better-worded one; sum counts; keep earliest `created_at` |
| `contradiction` | newer supersedes older (`status='superseded'`, `superseded_by`) |
| `refinement` | keep both, link `refines`, demote the general one's salience |
| `complementary` | keep both, link `related` |
| `unrelated` | record so the pair is never re-judged |

**Recency is not automatically right.** A memory captured yesterday from a throwaway
experiment must not silently supersede a pinned constraint. Guard: if the older memory is
pinned, or has confidence more than 0.3 higher, the pair goes to human review instead of
auto-resolving. The watermark plus the `unrelated` cache keeps a weekly run at 1–3 LLM
calls, not hundreds.

### Built in slice 5b.1 — detection, and why tier 1 must not stamp what it counts

`src/pairs.mjs` is the mechanical half: the join that finds pairs, the `consolidated_at`
watermark, the verdict cache, and `mem pairs` to look at all three. Nothing in it judges
anything — the 0.85 threshold moved here from stats.mjs and `mem stats` now imports it, so
the number PLAN calls model geometry lives in one place with the mechanism it belongs to.

**Both suppressions are load-bearing and neither subsumes the other.** The watermark is
per row: a pass over a store nobody has touched finds nothing and costs no LLM call. The
cache is per pair, and it is what makes a *partial* pass resumable — a run that judged 60
of 1096 candidates cannot stamp any row (stamping hides every pair that row is in, judged
or not), so without a pair-level receipt the next run would re-judge the same 60 first.
The cache is also the only record that a `refinement`, `complementary` or `unrelated`
verdict ever happened: those three leave both rows exactly as they were.

**So tier 1 detects and reports, and never stamps.** PLAN's tier-1 list says "detect and
record candidate pairs for tier 2", and the honest reading turned out to be narrower than
it sounds: a maintenance pass that advanced the watermark over rows it had merely *counted*
would empty tier 2's queue without an LLM ever seeing it — silently, and until each row
happened to change again. `maintain`'s `pairs` step is therefore read-only, bounded lower
than the hand-typed command, wrapped so a detector failure cannot take the ladder's run
down with it, and its `note` says so in the report.

**The verdict cache lives in `meta` under `pair:<lo>:<hi>`, not in `memory_links`.** A link
row carries no date, and a verdict is about two *texts*: the entry stores when it was given
and detection skips the pair only while both members' `updated_at` sit at or before that —
restate either one and the pair comes back. Every unreadable case (a value that is not
JSON, a missing date, a row stamped in the future by a clock that went backwards) resolves
towards re-judging, where the cost is one extra call. The `CASE WHEN json_valid` from
5a.4 is mandatory here too: `json_extract` over a non-JSON value throws in this build and
would take the whole detector down.

**`mem forget --hard` now drops that memory's verdicts** — not tidiness. SQLite hands the
next insert `max(rowid) + 1`, so purging the newest row means a future memory inherits its
id, and a leftover `pair:<id>:<other>` entry would suppress a judgement between two rows
that never met.

Measured, and the reason for the budgets — two scans of (changed × eligible), ~2 µs a
distance, no ANN index in this build:

```
200-row fixture   169 eligible   every changed row            54 ms       10 pairs
5k aged fixture  3345 eligible    60 changed (tier 1)        945 ms      340 candidates
                                 200 changed (mem pairs)      2.6 s     1096 candidates
                                3345 changed (unbounded)     45.1 s    11010 candidates
```

The last line is the argument: an unbounded first pass over a never-consolidated store is
three-quarters of a minute and eleven thousand pairs, which is not a backlog anybody drains.
Bounded and ordered watermark-first (SQLite sorts NULLs first, so never-looked-at rows
lead), it drains across runs instead, and `truncated` says what was left. The count is
reported separately from the list on purpose — a pass that only reported the sixty pairs it
can show would say "sixty" whether sixty or eleven thousand were waiting.

Detection deliberately keeps two things it could cheaply drop: `pinned` rows (PLAN's guard
is *about* the pinned row — it has to be found for the guard to fire) and both rows in full
(the guard needs `pinned`, `confidence` and `created_at`, and a judge needs the text).
It drops staged, archived and superseded rows, expired ones, tombstones (`emb IS NULL`
throws in `vector_distance_cos`, 5a.3), and anything whose `emb_model`/`emb_dim` differ.

### Built in slice 5b.2 — the judge, the table, and the guard's second reason

Two files, split along the line that matters: `src/judge.mjs` is the only thing in the
plugin that spawns a process whose output it does not control, and `src/resolve.mjs` is
the only thing that can change a memory because of what that process said. Everything
between them is plain data, which is why **no test in this build spawns `claude`** — the
prompt builder and the reply parser are pure, and the two subprocess tests use `node -e` as
a stand-in binary to prove the plumbing rather than the model.

**The judge refuses three things, each because the failure would be silent.** It never
invents a verdict: a pair the model skipped comes back as `missing`, not as `unrelated` —
and `unrelated` is cached forever, so one truncated reply would bury a real contradiction
permanently. It never accepts a verdict for a pair it did not ask about; the batch's own
keys are the index, so an echoed-wrong id lands in `unknown` and is dropped. And the call
carries `--tools ""`: the text in that prompt was captured off a terminal by a hook, so a
judge with Bash is a prompt-injection surface reading the user's own memories.

The reply parser is deliberately tolerant where the rest of this plugin is strict. The
`claude -p --output-format json` envelope is another program's output format; it has carried
the structured value as a JSON string in `result` and as an object beside it under more than
one name, so every plausible shape is tried and the *content* checks stay strict. **The live
envelope shape is the one thing here that has not been verified against a real call** — this
session could not get approval to spawn `claude` — which is exactly why the parser tries all
of them and why `judgeBatch` surfaces the CLI's own error text ("usage limit reached")
instead of an exit code.

**PLAN's guard has three reasons, and only two are in the sentence above.** Older pinned,
older more than 0.3 more confident — strictly more, so a pair exactly 0.3 apart still
resolves — and a third: any resolution that would supersede, demote or rewrite a pinned row
whichever side it is on. That follows from a rule stated twice elsewhere in this document
(`pinned = 1` is "exempt from all automatic actions") and its absence would let a newly
pinned memory be merged away by an older one it happened to restate. The confidence test is
one-directional on purpose: a newer memory that is much *more* confident is the ordinary
case this subsystem exists to act on.

`contradiction` routes to review by policy even when no guard reason fires. The other four
classes are auto-safe: a merge, a link row, a salience notch, a cache entry. That is one
step wider than "applies only auto-safe classes (duplicates)" above, and the argument is
that `refinement` and `complementary` take nothing out of retrieval and invert from a single
event; `autoClasses: ['duplicate']` narrows it back to this document's letter and costs only
extra review items.

**Two records per judged pair, and they are not the same record.** The verdict cache
(`pair:<lo>:<hi>`, 5b.1) is the receipt — judged, at this time, stop offering it while
neither text has moved. The proposal (`proposal:<lo>:<hi>`) is the pending *action*. Caching
without proposing makes a routed pair vanish: judged, never resolved, never seen again.
Proposing without caching re-judges it, and pays for it, every run until somebody gets to
it. `mem forget --hard` clears both, for the id-reuse reason 5b.1 gives.

Resolutions, and the numbers that are choices rather than measurements: a duplicate merges
into the longer wording (write.mjs's proxy for specificity), sums `injected_count` and
`useful_count`, keeps the earliest `created_at`, and takes the max of salience and
confidence — never a bump, because both rows may descend from the same original statement.
A refinement demotes the general row by ×0.8 with a floor of 0.05: one notch, not a burial,
so the specific memory wins the five-item budget and the general one is still there when it
is the only thing that matches. **Neither `updated_at` is touched anywhere in this file** —
that column is the decay clock, and consolidation is the store tidying itself, not the user
restating anything.

Because the merge survivor is by definition the row whose text already wins, no text is ever
rewritten, so **nothing in resolution loads the embedding model**. Triage keeps working on a
machine whose model cache is gone, exactly as in review.mjs.

The dry run — the default — writes *nothing*: no resolution, no proposal, no verdict, no
watermark. It still pays for the LLM calls, because the judgement is the part it cannot
predict. And the watermark is stamped only when the pass was complete: nothing truncated on
either side of detection, no batch errored, no pair went unjudged, and no plan was skipped
because a row moved. That is 5b.1's one rule, and it has four tests.

The review queue grew its second producer, which is what that file was built for: the
proposal item carries `memory` (the row that would change) and `duplicate` (its counterpart),
so the existing renderer prints it without knowing what it is. `promote` bypasses the guard —
the guard's whole purpose was to get a human here — but not staleness: a proposal made before
either text was rewritten is hidden from the queue and refused by `promote`. `discard` leaves
both rows alone and keeps the cached verdict, because paying a judge to re-ask a question a
human has answered is how a review queue teaches people to ignore it.

Not built here, and 5b.3's: `mem consolidate` itself. Until it exists, tier 2 is reachable
from `consolidatePairs()` and from the queue, and nothing runs a judge unless something asks
it to.

### Built in slice 5b.3 — the command, the undo, and what a live judge changed

`src/consolidate.mjs` is the run: a `run_id`, the pre-run export, and the four sentences of
"Reversibility is non-negotiable" wired together. It is deliberately thin — everything with
a decision in it stayed in the file that owns the decision — and it is the fourth column of
a table whose other three (`pairs`, `judge`, `resolve`) do not know what a run is.

**`mem consolidate` dry-runs and `mem maintain` applies, and the asymmetry is the same
argument twice.** Tier 1 fires detached from a hook where a preview would print to a pipe
nobody reads. Tier 2 is typed by a person or a weekly cron, acts on a language model's word,
and its worst failure — a true memory retired because a judge misread a refinement — is
invisible from outside. So it previews. The preview still spawns the judge, because the
judgement is the part it cannot predict; what it skips is every write, *including* the
verdict cache and the watermark, so running it twice gives the same answer twice and neither
run silences a pair.

**No lock, unlike tier 1.** A maintenance pass is a background process that can collide with
another one mid-ladder; this is a foreground command whose every write re-reads its rows and
refuses on anything that moved. Two consolidations racing produce one set of resolutions and
one set of "could not be resolved" lines. A lock would instead make `mem consolidate` fail
while a `SessionStart` hook the user cannot see holds it.

**The pre-run export happens after the judgement and before the first write**, which is the
only moment both halves of "pre-run" are true, and it needed a seam (`onFirstWrite`) rather
than a call site. The watermark deliberately does not go through it: a pass whose only write
is a stamp is the no-op case, and backing that up would rotate the ten most recent exports
away in favour of the ten quietest weeks — 5a.4's decision, applied again.

**`mem undo` reverses a consolidation run, and slice 5a.4 asked for exactly this shape:
append to `INVERTIBLE`, do not fork it.** The eight tier-2 events (`merged`, `superseded`,
`linked`, `demoted`, `proposed`, `declined`, `pair-judged`, `consolidated`) invert in
`resolve.mjs` and `maintain.mjs` dispatches to them, because the file that knows what a
`demoted` event cost the general memory is the file that wrote it. Every inversion asserts
the state it is reversing and skips rather than overwriting a decision taken afterwards.
`declined` gained the whole proposal in its detail so a mis-click on a queue of twenty is not
the one irreversible action here, and `unmerged` refuses outright on a `text` change — the
only merge that moves text is `write.mjs`'s dedup, and reverting text without its vector
would leave the row findable as the wrong memory.

**The adversarial set is `build/adversarial.mjs`, and it is data rather than a test** because
it has two consumers: `build/tests/consolidate.test.mjs` drives it with recorded verdicts
(hermetic, free, every commit) and `node build/adversarial.mjs --live` drives it with the
real `claude -p`. Twenty memories in one scope; exactly eight of the 190 possible pairs clear
0.85 under `gte-small@q8`, measured, with the closest miss at 0.8206:

```
0.9771  dup-old / dup-new             duplicate, applied
0.9603  pin-rule / pin-challenger     contradiction vs a PINNED rule    → review
0.9541  conf-old / conf-new           duplicate, older 0.45 more confident → review
0.9505  ref-general / ref-specific    refinement, applied  ← must not read as a contradiction
0.9459  pin2-specific / pin2-general  refinement that would demote a pinned row → review
0.9089  con-old / con-new             contradiction, unguarded          → review by policy
0.8950  comp-a / comp-b               complementary, linked
0.8918  unrel-a / unrel-b             unrelated, cached, nothing changed
```

Live result: **eight of eight**, the pinned row untouched, contradictions in the queue, and
`mem undo` returning the store to a byte-for-byte identical pre-run state (every column of
every row, the links, the proposals, the verdicts and the watermark).

**Getting there cost two real bugs, and neither was findable without spawning the judge.**

The first: asked about `pair:1:2`, the model answered `"1:2"`. Every verdict correct, every
one of them dropped as an answer about a pair nobody asked about — no error, exit code 0, an
empty run. A colon-bearing id at the start of a line reads as a *label*, and tidying a label
out of an id is the sensible thing to do. The id that goes over the wire is now `12-37` in
brackets, the `pair:` cache key never leaves the process, and `normaliseLabel` accepts any
formatting of two ids while staying strict about *which* two. The second bug is the same
shape: told to copy "the bracketed id", one run in five answered `[1-2]` and lost its whole
batch. Both are now tests.

**Three of the eight texts were rewritten because the judge read them better than I did**,
and that is the more interesting half. "Force pushing is fine *when nobody else has pulled
it*" came back `refinement` — an exception to a rule is what a refinement *is*, so a case
named "genuine contradiction" had to stop containing one. "The API is written in Go" against
"the API test suite is written in Go" came back `refinement` too, reading the suite as an
instance of the API. And two facts about the same staging deploy came back `complementary`
when the set had called them `unrelated`; they were related, whatever I had labelled them.
The general lesson for anyone retuning this: at 0.85 under this model, a pair that is
genuinely *unrelated* is rare — most of what detection over-offers is complementary or
refinement, which is why those two classes being auto-safe matters more than it looks.

**The `claude -p --output-format json` envelope is now verified rather than guessed** (5b.2
could not get approval to spawn it). It carries `structured_output` as the object *and*
`result` as the same JSON in a string, plus `is_error` — the first two candidates
`extractPayload` already tried, so the tolerant parser was right and is now also confirmed.
The flags are right too: `--json-schema`, `--output-format json` and `--tools ""` all exist
on the installed CLI. One batch of eight pairs is ~12 s and ~$0.011 on `sonnet`.

### The pruning ladder — nothing is deleted

Each rung is reversible and the row survives:

1. **Demote** — strength decays; sinks in ranking. Automatic, continuous.
2. **Archive** — `status='archived'`, excluded from retrieval, fully restorable.
   Rule: `strength < 0.15 AND useful_count = 0 AND age > 60d`, or TTL expired, or dead
   project scope after a 90-day grace period with a flag first.
3. **Tombstone** — after 6 months archived, `emb = NULL`. Text and history stay; reclaims
   ~1.5KB/row. Restoring requires re-embedding, which is 11ms.
4. **Purge** — real deletion, only ever explicit: `mem forget --hard`, or
   `mem purge --archived-before=<date>` typed by a human.

Rationale: a false-positive prune is an *invisible* failure. You never notice the memory
that should have been there. Recovering disk is worth far less than that.

### Built in slice 5a.3 — the rules that spare, and the audit of every vector query

`src/prune.mjs` is rungs 2 and 3 by rule; `src/stats.mjs` is the section below; migration v2
(above) is what had to happen before either could exist. Rung 1 is decay and needs no command,
rung 4 is `forget --hard` and only a human ever types it.

**Every rule is written to under-fire, and the tests are mostly about what is spared.** The
stale rule is a conjunction of three independent conditions and each one alone spares a row: a
decayed memory that echoed once is out of reach *permanently*, a never-useful memory written
last week is too young, a strong memory is safe however old. `pinned` is exempt from all four
rungs. `prune.test.mjs` gives each of those its own test rather than one happy-path case,
because a conjunction that quietly loses a term still passes the test that only checks what it
archives.

That `useful_count = 0` term is where slice 5a.2's noisy echo heuristic gets cashed in. A memory
that echoed once is never reached by the stale rule again — so the noise in that signal spares
memories rather than archiving them, which is why a one-token bar was the right call there and
would not have been if this rule read the counter the other way round.

**The dead-scope rung has an unmounted-volume guard, and it is the most dangerous thing here.**
Only a path-shaped `project_key` is checkable at all (a git remote would need the network, which
a maintenance pass must never touch, so those are `unknown` and never flagged). But if `$HOME`
is not mounted — external disk, a container with a different layout, a machine mid-restore —
*every* path key looks deleted at once, and ninety days later the store archives itself. So a
missing directory is only `dead` when its **parent still exists**: a repo deleted out of
`~/code` leaves `~/code` behind, an unmounted volume takes the parent with it. Parent gone too →
`unknown`, because "deleted" and "not currently visible" are genuinely indistinguishable from
there and one of them must not be guessed at. The flag itself lives in `meta` under
`dead_scope:<key>` (a fact about a scope, not a row, and the grace period has to be answerable
in one lookup rather than by scanning an append-only log) with `scope-flagged` /
`scope-revived` events beside it. Reviving deletes the flag, so the grace clock **restarts** if
the path dies again rather than resuming where it left off.

**Rung 3 reads its clock from the audit log, not from the row.** `setStatus` deliberately leaves
`updated_at` alone when archiving (or archive-then-restore would reset a memory's decay clock),
so nothing on the row records *when* it was archived — the newest `archived` event does, falling
back to `updated_at` for a row that arrived archived through `mem import` and has no event.

**Reversibility, and the gap that was in it.** Every rung writes a `memory_events` row carrying
the prior state needed to invert it, with the same event name and `previous.status` shape a hand
`mem forget` writes — deliberately, so `--restore` is one code path and not two that can
disagree. But rung 3 drops a vector, and `mem forget --restore` cannot make one: manage.mjs is
model-free on purpose so curation keeps working with no model cached. A restored tombstone
therefore landed active with no embedding, findable lexically and invisible to the vector leg.
`mem reembed --tombstoned` closes it, scoped to `status <> 'archived'` so it repairs what was
restored and never resurrects a tombstone somebody meant to keep. `run_id` is threaded into
every event detail and generated nowhere — slice 5a.4 owns the run and its undo.

`mem prune` **dry-runs by default at the module level**, not just in the CLI: every rung has a
`due()` half that only reads and an `apply()` that takes what it returned, which is the same
split that let the stale rule be typed by hand against a real store
(`mem list --max-strength 0.15 --sort strength`, slice 5a.1) before anything automatic acted on
it. Rows are claimed by the first rung that reaches them — TTL and dead scope before the
statistical rule, because those are *reasons a human gave* — and a rung that fills its row
budget says so instead of returning a truncated list that reads like a complete one.

### Reversibility is non-negotiable

An LLM judge will get some calls wrong, and discovering it three weeks later with no undo is
the failure mode that makes people abandon the system.

- Every consolidation run gets a `run_id`; every action writes a `memory_events` row
  carrying enough prior state to invert it.
- `mem undo <run_id>` reverses an entire run.
- `mem consolidate` **dry-runs by default**; `--apply` applies only auto-safe classes
  (duplicates); contradictions always route through `/mem:review`.
- Automatic pre-run JSONL export to the data dir, last 10 kept.

### Built in slice 5a.4 — the run, and the two directions an undo can be wrong

`src/maintain.mjs` is tier 1 as one unit: `mem maintain` runs the five steps this document
lists, under one `run_id` that every `memory_events` row it writes carries, and `mem undo
<run_id>` reverses the lot. `hooks/session-maintain.mjs` fires it **detached** at
`SessionStart` — a second entry beside the recollection hook rather than a few lines inside
it, because that one has a hard 400 ms budget and a pass over five thousand rows is seconds.

**`mem maintain` applies by default and `mem prune` does not.** The asymmetry is deliberate
and it is the one decision in this slice worth arguing with. `prune`'s rules were being read
by hand when it shipped, and a rule nobody has checked should not act. But tier 1 is specified
to "fire detached at SessionStart (never blocking) or daily", and a pass that dry-runs by
default fires detached, prints to a pipe nobody reads and changes nothing — the wiring would
be theatre. Three things make applying acceptable, none of them optimism: every action is
invertible from its own event under one run id; the whole store is exported to JSONL before
anything is applied (last 10 kept, PLAN's own line above), which is the floor under the one
inversion that cannot be exact; and nothing on this path deletes anything, rung 4 still being
a human typing `forget --hard`.

**A background pass takes a copy before it migrates.** Opening the store writably is what
migrates it — that is how every write path here works, and it is why a v1 store keeps serving
recall and migrates on its next write rather than needing a flag day. But this write path is a
process nobody asked to run, and migration v2 *rebuilds the memories table*. So `maintain`
probes the schema version through a read-only handle first and, if anything is pending, exports
the whole store to `backups/<run_id>-pre-v<n>.jsonl` before opening writably. Skipping the
migration instead would be worse than doing it: a v1 store cannot tombstone at all (`emb BLOB
NOT NULL`), so an unmigrated store that is nonetheless maintained would fail rung 3 rather than
decline it.

**The throttle is part of the contract.** `SessionStart` fires on startup, resume, clear and
compact, so a working day is a dozen firings and a pass per firing would be a dozen audit-log
bursts and a dozen exports of a store nobody changed. One pass per store per 20 hours (not 24,
so a daily cadence survives sessions that start earlier each morning), recorded in `meta`
because the store is the unit of maintenance rather than the machine. The hook reads a *stamp
file* beside the database instead — one `stat()` against a turso import plus a migration check
— and `maintain()` re-reads `meta` itself, so the worst a stale or hand-deleted stamp can do is
spawn a process that declines. An unreadable record reads as *due*, never as recently done: the
other direction stops maintenance forever, silently.

**Two of the five steps do nothing and one is not built, and all three say so every run.**
Decay needs no recomputation (5a.1: strength is a query-time expression, never stale between
passes) and usage feedback is folded live by the `Stop` hook (5a.2: the injected set and the
reply only exist together in that turn), so those two report the numbers that prove the
mechanism is alive — how many active rows have decayed under the archive threshold, and how
many counters moved since the last run. Pair detection belongs to 5b.1 and is reported as
skipped, by name. A run that listed only the steps it performed would make all three invisible
exactly where somebody would look for them.

**The undo checks its preconditions and skips rather than winning.** An undo runs against a
store that kept living: a row may have been restored by hand, purged, pinned, or archived again
by a later pass. So each inversion asserts the state it is about to reverse and reports what it
could not do — an undo that overwrites a decision taken afterwards is worse than one that says
it declined. What was not inverted is *not* recorded as undone, so re-running the same undo
picks up exactly the rest, which is what makes "run `mem warm`, then undo again" a real
instruction rather than advice.

**Rung 3 is the inversion that cannot be exact, and the log says so.** The tombstone event
records which model made the vector it dropped, not the vector — 1.5 KB a row in an append-only
table is the cost that rung exists to avoid — so undoing it *recomputes* the vector from the
text. On a machine with no model cached those rows come back blocked (statuses still restored)
rather than half-restored; when the pinned model has changed since, the row rejoins the store in
the current space and the `untombstoned` event carries `recomputed: true` and `model_changed`.

**Undo does not touch the throttle.** The rows it restores still match the rules that archived
them, so the next pass will archive them again; resetting the stamp would make that happen at
the next session start instead of in twenty hours. `mem pin` or `mem touch` is what changes the
answer, and the command says so in its output rather than leaving it to be discovered.

**`json_extract` throws on a `detail` that is not JSON in this build** — "Parse error: malformed
JSON", the whole statement down, the same failure shape 5a.3 found in `vector_distance_cos(NULL,
…)`. Every run_id lookup is therefore `CASE WHEN json_valid(detail) THEN json_extract(…) END`,
not a bare `AND json_valid(detail)` conjunct, because the planner may evaluate conjuncts in
either order. One legacy or hand-edited event row would otherwise make every run unlistable and
every undo impossible, which is precisely when one is needed. `stats.mjs`'s run counter had the
unguarded form since 5a.3 and now has the guard.

**Measured on `build/seed.mjs --count 5000 --aged`** (the flag is new: the same corpus aged the
way a store running for two years would be — ages to 900 days, three quarters of rows never
useful, a quarter already archived *with dated `archived` events*, which is what exercises rung
3's audit-log clock rather than its `updated_at` fallback):

```
                     active   scoped scan            every-row scan        speedup
before                 3411   3.18 ms over 860       7.84 ms over 5000       2.46×
after one pass         1385   1.49 ms over 370       7.14 ms over 4477       4.80×
after mem undo         3411   3.54 ms over 860       7.88 ms over 5000       2.23×
```

Row counts are exact and reproducible from the seed; the millisecond figures move ~15% between
runs of the identical store, so the effect to read is the 2.1× on the scoped scan and not the
third decimal.

2026 archived and 523 tombstoned in 1.8 s; the every-row scan still covers every embedded row,
because nothing was deleted — the 4477 is the 523 tombstones, which have no vector to scan.
`undo` restored all 2549 actions with none blocked and the status counts came back identical row
for row. The first pass hit the 2000-row `APPLY_LIMIT` on the stale rung and said so
(`truncated: ['stale']`); the next pass took the remaining 556. That is the intended shape — a
first run against a store that has never been maintained is bounded, and it reports what it left.

### Knowing whether it's working

`mem stats` turns "is my memory rotting?" into numbers:

```
active / staged / archived / superseded counts
active-row scan time (the number that matters — see benchmark above)
duplicate pairs ≥0.85 outstanding
injected:useful ratio, p50 and worst 10
memories never injected, by age bucket
mean-cosine-to-sample distribution (slop detector)
consolidation runs: proposed / accepted / undone
```

If outstanding duplicate pairs trend up, consolidation isn't keeping pace. If the
injected:useful ratio worsens, the retrieval threshold is too loose.

#### Built in slice 5a.3 — what each number is guarding against

`src/stats.mjs`, read-only by construction: `openDb({ readonly: true })` also means
`fileMustExist`, so a command someone typed to look at numbers can neither create a store nor
migrate one. A pending migration is *reported* instead. Nothing on this path embeds either — the
probe vector is an existing row's stored blob — so every number is measurable on a machine with
no model cached.

**Scan time is reported as a pair, and that is the whole point.** The benchmark this section
opens with is 20k rows at 24.7 ms against the 2k active ones at 3.0 ms, so on its own the active
figure only says "retrieval is fast". Beside the same scan with the status and scope filters off
it says whether that is *because of* the archiving. Measured on a 5k-row seed:
`active 3.33 ms over 1086 rows · every-row 7.24 ms over 5000 · 2.17×`, and after a
`prune --apply` on the 200-row seed the active count went 174 → 124 with the every-row scan
still covering all 192 embedded rows. Nothing is deleted; the scan just stops paying for it.

**Both pairwise metrics are capped, and both say so.** The duplicate-pair self-join is
quadratic — measured at ~0.6 µs a pair, which is 10 ms at 174 active rows and would be eight
seconds at five thousand — so it runs over the oldest 1200 active rows and reports
`exact: false` with the sample size when that bites. The slop scan is rows × 32 and capped at
2000 rows. Together they bound `mem stats` at about 2 s *however large the store gets*
(measured 2.29 s at 5k rows: pairs 1.2 s, slop 0.73 s, everything else under 250 ms). Both
samples are taken by id rather than at random, because PLAN asks for these to be **trended**
("if outstanding duplicate pairs trend up") and a moving sample cannot be.

**Two slop detectors, because neither is sufficient.** The injected:useful ratio needs the
memory to have been injected, so it says nothing about a store nobody has queried yet; the
mean-cosine-to-sample figure is a property of the vector alone and works on a virgin store, but
cannot tell "matches everything" from "this store is about one subject". Hence the *distribution*
rather than a number: a row well above its own store's p90 is the finding, a whole store at 0.77
is a corpus. Two ratios are reported for the same reason — `injections/usefuls` store-wide
answers "how often does an injection land", the median row answers "how does a typical memory
do", and a few heavily-injected rows pull them apart.

The consolidation block is structurally zero today and says so rather than being omitted. It is
derived from `memory_events` and from `run_id` in the event detail — the shape 5a.4 and 5b are
both specified to write — so it starts reporting the moment they land instead of needing to be
remembered. The `ladder` block is the join between the two halves of this slice: the detectors
above say the store is rotting, that one says whether anything is going to reach it.

---

# Phases

Each phase ends with something usable and a concrete exit test.

### Phase 0 — Foundation (½ day)
Plugin skeleton, `plugin.json`, dependency bootstrap into `CLAUDE_PLUGIN_DATA`, `db.mjs`
with schema + a real migration runner (`meta.schema_version`), `embed.mjs`.
**Exit:** `mem doctor` prints resolved paths, turso version, embed model, and cold-path
timings. Plugin shows up in `/plugin` as `mem@skills-dir`.

### Phase 1 — CLI core (1 day)
`mem add | search | list | show | forget | export | import`. Write-time dedup (cosine ≥ 0.93
in same scope → update + bump confidence, don't insert), secret scrubbing, project-key
resolution from git remote.
**Exit:** seed 200 synthetic memories; search returns sane top-5 in <400ms from a cold
process; `export | import` round-trips byte-identically; a fake `sk-...` is rejected.

### Phase 2 — Skills (½ day)
`remember`, `recall`, `forget` SKILL.md files. Descriptions written to trigger on the right
phrasings. No hooks yet — pure model-invoked.
**Exit:** in a live session, "remember that I …" persists; after `/clear`, `/mem:recall`
finds it.

### Phase 3 — Recall hooks (1 day)
`SessionStart` core-profile injection; `UserPromptSubmit` threshold retrieval. Build a
tuning harness: a JSON corpus of `{prompt, should_retrieve: [ids] | []}` cases, and
`mem tune` reporting precision/recall across candidate thresholds.
**Exit:** measured precision on the harness; p95 hook latency <400ms; **injects nothing**
on prompts unrelated to any stored memory (this is the test that matters most).

### Phase 4 — Gated capture (1 day)
Regex gate, staged writes, `/mem:review` triage UI (list staged, promote/edit/discard in
batch).
**Exit:** after a week of real use, staged candidates have ≥50% promote rate. Below that,
tighten the gate rather than living with the noise.

### Phase 5a — Maintenance tier (1 day, no LLM)
Decay + strength ranking, `injected_count`/`useful_count` split, echo heuristic in the `Stop`
hook, rule-based archiving, TTL expiry, dead-scope flagging, candidate pair detection,
`mem stats`. Runs detached at `SessionStart`, never blocking. Fully mechanical,
so it can be trusted to run unattended.
**Exit:** seed 5k memories with synthetic age/usage profiles; verify active count drops and
measured scan time falls proportionally (the 24.7ms → 3.0ms effect); verify nothing pinned
or recently-useful is archived; `mem undo` restores an entire maintenance run.

### Phase 5b — Consolidation tier (1–2 days, LLM-judged)
Pair classification via `claude -p` with structured output, resolution rules, the pinned /
confidence guard, proposals into the `/mem:review` queue, `run_id` + `mem undo`, pre-run
export. Dry-run by default. Weekly via `/loop` or cron, or after 25 new memories.
**Exit:** run against a hand-built adversarial set — genuine duplicates, genuine
contradictions, refinements that must *not* be treated as contradictions, and a
newer-but-wrong memory facing a pinned one. Old memories end up `superseded_by`, never
duplicated alongside; the pinned guard holds; `mem undo` restores the pre-run state exactly.

### Phase 6 — Optional hardening
`vector8` quantisation (4× smaller) if the store passes ~50k rows · re-embed migration when
changing model · import existing `~/.claude/projects/*/memory/*.md` files · Turso Cloud sync
(revisit only with a deliberate decision about memories leaving the device).

---

## Risk register

| Risk | Mitigation |
|---|---|
| Retrieval noise poisons turns | Threshold gate, hard scoping, staging, ≤5 items |
| Hook latency drags every prompt | Measured 300ms budget; hard timeout, fail-open silently |
| Turso rewrite is young (v0.6.x) | Pin the version; schema is plain SQLite, portable to libSQL or better-sqlite3 + a JS cosine loop if needed |
| No ANN index | Exact scan measured fine to ~100k rows; quantise or move to libSQL past that |
| Secrets captured into the DB | Scrub-on-write, reject rather than store; `mem export` for audit |
| DB committed to dotfiles | Data lives in `CLAUDE_PLUGIN_DATA`; `.gitignore` guard |
| Embedding model change invalidates vectors | `emb_model`/`emb_dim` per row + re-embed command |
| Memory rot / staleness | Decay + supersession + weekly consolidation (Phase 5) |
| LLM judge mis-merges memories | Dry-run default, `run_id` + `mem undo`, pre-run export, pinned/confidence guard, contradictions always human-reviewed |
| Retrieval slows as the store grows | Cost tracks *active* rows only (measured); archiving is the lever, tracked in `mem stats` |
| Over-general memories crowd out specific ones | injected:useful ratio + mean-cosine-to-sample slop detector |
