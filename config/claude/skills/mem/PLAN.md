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

- Any candidate query needs `emb IS NOT NULL`. `NULL` sorts *ahead of* every real distance in
  an `ASC` ordering, so a single tombstone would otherwise come back as the nearest neighbour
  to everything. Silent, not loud.
- Distances are only meaningful within one vector space, so candidates must also match on
  `emb_model` and `emb_dim`. Mid-migration, a store legitimately holds both.

Schema v1 shipped with the `NOT NULL`; phase 5a.3 owes the v2 rebuild that drops it.

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

## Capture gate

Fire on **`UserPromptSubmit`**, not `Stop` — the user's exact words are in the hook input
(`user_message`), no transcript parsing, and it runs before the model call.

Pure-JS regex, target <20ms, no LLM: `always|never|from now on|prefer|instead|actually|
don't |stop |I use |we use |let's go with|remember `, plus correction shapes ("no, …").

When it fires, inject `additionalContext`: *"this prompt may contain a durable preference —
if so, record it with `mem remember`"*. The model already in the loop does the extraction,
so there is **no extra API call**. Writes land as `status='staged'`. Upgrade path if
precision disappoints: switch to a `prompt`- or `agent`-type hook doing dedicated extraction.

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

### Reversibility is non-negotiable

An LLM judge will get some calls wrong, and discovering it three weeks later with no undo is
the failure mode that makes people abandon the system.

- Every consolidation run gets a `run_id`; every action writes a `memory_events` row
  carrying enough prior state to invert it.
- `mem undo <run_id>` reverses an entire run.
- `mem consolidate` **dry-runs by default**; `--apply` applies only auto-safe classes
  (duplicates); contradictions always route through `/mem:review`.
- Automatic pre-run JSONL export to the data dir, last 10 kept.

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
