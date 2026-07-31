// The hand-built adversarial set — phase 5b's exit criterion, as data.
//
// PLAN: "run against a hand-built adversarial set — genuine duplicates, genuine
// contradictions, refinements that must *not* be treated as contradictions, and a
// newer-but-wrong memory facing a pinned one. Old memories end up
// `superseded_by`, never duplicated alongside; the pinned guard holds; `mem undo`
// restores the pre-run state exactly."
//
// It lives in build/ rather than in the test file because it has two consumers
// and they test different things:
//
//   build/tests/consolidate.test.mjs   drives it with RECORDED verdicts, so the
//                                      suite exercises detection, the guard, the
//                                      resolutions and the undo without spawning
//                                      anything. Runs on every commit.
//   node build/adversarial.mjs --live  drives it with the real `claude -p` judge,
//                                      which is the only way to find out whether a
//                                      model actually calls REF a refinement
//                                      instead of a contradiction. Costs money and
//                                      needs approval, so it is a command and not
//                                      a test.
//
// The recorded verdicts are what a correct judge would say, keyed on the two
// TEXTS rather than on ids, so the same table answers both runs and a live answer
// can be diffed against it pair for pair.
//
// EVERY PAIR'S COSINE WAS MEASURED, NOT ASSUMED (Xenova/gte-small@q8, the model
// pinned in embed.mjs). The set is 20 memories in one scope and exactly eight of
// the 190 possible pairs clear the 0.85 detection threshold:
//
//   0.9771  dup-old / dup-new                 genuine duplicate
//   0.9603  pin-rule / pin-challenger         newer-but-wrong facing a pinned rule
//   0.9541  conf-old / conf-new               duplicate the confidence guard stops
//   0.9505  ref-general / ref-specific        refinement — must NOT read as a contradiction
//   0.9459  pin2-specific / pin2-general      refinement that would demote a pinned row
//   0.9089  con-old / con-new                 genuine contradiction
//   0.8950  comp-a / comp-b                   complementary
//   0.8918  unrel-a / unrel-b                 near in wording, different subjects
//
//   highest pair that must NOT be offered:    0.8206  comp-a / noise-2
//
// That last line is the fixture's own invariant and `checkMatrix()` re-measures it
// every run. Three of the eight texts were rewritten because a LIVE judge read
// them differently and was not wrong to — the notes are on the rows themselves.
// If a future model swap moves the threshold, this is the fixture that says so
// first.

import { mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { consolidate } from '../src/consolidate.mjs';
import { withDb } from '../src/db.mjs';
import { EMB_DIM, EMB_MODEL, cosine, embed, modelCached } from '../src/embed.mjs';
import { undo } from '../src/maintain.mjs';
import { PAIR_THRESHOLD, readVerdict } from '../src/pairs.mjs';
import { resolvePaths } from '../src/paths.mjs';
import { readProposals } from '../src/resolve.mjs';

const DAY = 24 * 60 * 60 * 1000;

/**
 * The set. `at` is days before "now", so the fixture ages with the clock the
 * caller passes and a contradiction is always older than what replaced it.
 *
 * Confidences and pins are the adversarial half of the data: `conf-old` is a
 * memory the store trusts far more than the one restating it, and `pin-rule` and
 * `pin2-general` are the constraints PLAN's guard exists to protect.
 */
export const ROWS = [
  // Genuine duplicate — the same fact, said twice. Merges; nothing is lost.
  { tag: 'dup-old', at: 90, text: 'always use pnpm to install dependencies in this repo' },
  { tag: 'dup-new', at: 10, text: 'in this repo dependencies are installed with pnpm, always' },

  // Genuine contradiction — both cannot be true now. The older is retired.
  { tag: 'con-old', at: 200, text: 'we use Vitest for unit tests in this project' },
  { tag: 'con-new', at: 5, text: 'we moved off Vitest to bun test for unit tests' },

  // THE ONE THAT MUST NOT BE READ AS A CONTRADICTION. An exception added to a
  // rule is the rule with more detail, and both statements stay true.
  { tag: 'ref-general', at: 120, text: 'run the formatter before committing' },
  {
    tag: 'ref-specific',
    at: 3,
    text: 'run the formatter before committing, except on generated files under src/gen',
  },

  // A newer-but-wrong memory facing a pinned one — PLAN's own sentence.
  { tag: 'pin-rule', at: 300, pinned: 1, confidence: 0.8, text: 'never force push to a shared branch' },
  // No exception clause anywhere in it, and that wording is the result of a live
  // run: "…is fine when nobody else has pulled it" came back as a `refinement`,
  // and the model was not being unreasonable — an exception to a rule is what a
  // refinement IS. A case named "genuine contradiction" has to be one.
  {
    tag: 'pin-challenger',
    at: 2,
    confidence: 0.5,
    text: 'force pushing to a shared branch is fine, we do it all the time',
  },

  // A duplicate the store is far more confident about on the older side. Auto-safe
  // by class, routed by the 0.3 confidence margin.
  { tag: 'conf-old', at: 150, confidence: 0.95, text: 'the primary Postgres instance runs version 16' },
  { tag: 'conf-new', at: 4, confidence: 0.5, text: 'production Postgres is on version 16' },

  // A refinement whose GENERAL side is the pinned one, and the newer of the two:
  // the guard's third reason, which fires on the row a resolution would change
  // rather than on the older row.
  { tag: 'pin2-specific', at: 250, text: 'keep pull requests under 400 lines of diff, excluding lockfiles and snapshots' },
  { tag: 'pin2-general', at: 6, pinned: 1, text: 'keep pull requests under 400 lines' },

  // Near in wording, different subjects. Detection is meant to over-offer; this is
  // the pair whose right answer is "nothing to do", cached so it is never
  // re-judged. Two sentences of the same shape about a meeting and a cron job —
  // the first draft ("the deploy key rotates" / "the deploy pipeline is
  // triggered") came back `complementary` from a live judge, correctly: two facts
  // about the same staging deploy are related, whatever I had labelled them.
  { tag: 'unrel-a', at: 40, text: 'the standup is at 9:30 every weekday' },
  { tag: 'unrel-b', at: 20, text: 'the backup runs at 9:30 every weekday' },

  // Related, both true, neither contains the other. Also live-corrected: against
  // "the API test suite is written in Go" the judge said `refinement`, reading the
  // test suite as an instance of the API — so the second fact is now about a
  // different property of the same thing, which is what complementary means.
  { tag: 'comp-a', at: 60, text: 'the API is written in Go' },
  { tag: 'comp-b', at: 30, text: 'the API is deployed to fly.io' },

  // Rows that must pair with nothing. A detector that returned everything would
  // pass every assertion above.
  { tag: 'noise-1', at: 80, text: 'my editor is neovim with lazy.nvim' },
  { tag: 'noise-2', at: 70, text: 'the design tokens come from Figma, exported nightly' },
  { tag: 'noise-3', at: 45, text: 'invoices are due on the 15th of the month' },
  { tag: 'noise-4', at: 25, text: 'prefer plain SQL over an ORM for reporting queries' },
];

export const byTag = new Map(ROWS.map((row) => [row.tag, row]));
export const tagOf = new Map(ROWS.map((row) => [row.text, row.tag]));

/**
 * What a correct judge says, and what the exit test expects to happen next.
 *
 * `route` is where resolve.mjs sends it: `apply` acts now, `review` parks a
 * proposal. `guard` is the reason it was parked, or null for the two that wait by
 * policy rather than because a guard fired.
 */
export const CASES = [
  {
    pair: ['dup-old', 'dup-new'],
    similarity: 0.9771,
    verdict: { class: 'duplicate', general: 'neither', why: 'the same instruction about pnpm, worded twice' },
    route: 'apply',
    action: 'merge',
    guard: null,
    // The longer wording survives (resolve.mjs's proxy for specificity) and the
    // other becomes superseded_by it — PLAN's "never duplicated alongside".
    survivor: 'dup-new',
    loser: 'dup-old',
  },
  {
    pair: ['con-old', 'con-new'],
    similarity: 0.9089,
    verdict: {
      class: 'contradiction',
      general: 'neither',
      why: 'the project cannot be on Vitest and off it at the same time',
    },
    // Contradictions wait for a human even when no guard fires. Policy, not guard.
    route: 'review',
    action: 'supersede',
    guard: null,
    survivor: 'con-new',
    loser: 'con-old',
  },
  {
    pair: ['ref-general', 'ref-specific'],
    similarity: 0.9505,
    verdict: {
      class: 'refinement',
      general: 'a',
      why: 'the second is the first with an exception; both still hold',
    },
    route: 'apply',
    action: 'refine',
    guard: null,
    general: 'ref-general',
    specific: 'ref-specific',
  },
  {
    pair: ['pin-rule', 'pin-challenger'],
    similarity: 0.9603,
    verdict: {
      class: 'contradiction',
      general: 'neither',
      why: 'one forbids force pushing a shared branch and the other permits it',
    },
    route: 'review',
    action: 'supersede',
    guard: 'older-pinned',
    survivor: 'pin-challenger',
    loser: 'pin-rule',
  },
  {
    pair: ['conf-old', 'conf-new'],
    similarity: 0.9541,
    verdict: { class: 'duplicate', general: 'neither', why: 'both say the Postgres version is 16' },
    route: 'review',
    action: 'merge',
    guard: 'older-more-confident',
    survivor: 'conf-old',
    loser: 'conf-new',
  },
  {
    pair: ['pin2-specific', 'pin2-general'],
    similarity: 0.9459,
    verdict: {
      class: 'refinement',
      general: 'b',
      why: 'the older one qualifies the same limit with what does not count',
    },
    route: 'review',
    action: 'refine',
    guard: 'pinned-row-changed',
    general: 'pin2-general',
    specific: 'pin2-specific',
  },
  {
    pair: ['unrel-a', 'unrel-b'],
    similarity: 0.8918,
    verdict: {
      class: 'unrelated',
      general: 'neither',
      why: 'a meeting and a backup job that happen to share a time of day',
    },
    route: 'apply',
    action: 'none',
    guard: null,
  },
  {
    pair: ['comp-a', 'comp-b'],
    similarity: 0.895,
    verdict: {
      class: 'complementary',
      general: 'neither',
      why: 'the language it is written in and where it runs are different facts about the same API',
    },
    route: 'apply',
    action: 'relate',
    guard: null,
  },
];

export const caseFor = (tagA, tagB) =>
  CASES.find((c) => c.pair.includes(tagA) && c.pair.includes(tagB)) ?? null;

/** The pairs, as `<tag>|<tag>` in the fixture's own order. What detection must find. */
export const EXPECTED_KEYS = CASES.map((c) => [...c.pair].sort().join('|'));

// ------------------------------------------------------------------ vectors --

/**
 * Two ways to give the fixture embeddings, and the difference matters.
 *
 * `model` runs the real pinned model over the real texts, so detection is being
 * asked the question a live store asks: are these eight pairs, and only these
 * eight, within 0.85 of each other? That is the fixture's whole claim to being
 * adversarial, and it needs `mem warm`.
 *
 * `synthetic` places each pair in its own two-dimensional plane at the angle the
 * measurement above recorded. Cross-pair cosine is then exactly 0 rather than the
 * 0.83 a real model produces — a weaker test of detection, and an identical one of
 * everything after it. It exists so the suite still runs the guard, the
 * resolutions and the undo on a machine with no model cached, where the
 * alternative is skipping phase 5b's exit criterion altogether.
 */
export const VECTOR_MODES = ['model', 'synthetic'];

export const defaultVectorMode = () => (modelCached() ? 'model' : 'synthetic');

function syntheticVectors() {
  const vectors = new Map();
  let plane = 0;
  const place = (tag, theta) => {
    const v = new Float32Array(EMB_DIM);
    v[plane * 2] = Math.cos(theta);
    v[plane * 2 + 1] = Math.sin(theta);
    vectors.set(tag, v);
  };

  for (const c of CASES) {
    // cos(θ) = the measured similarity, split either side of the plane's axis.
    const theta = Math.acos(Math.min(1, Math.max(-1, c.similarity))) / 2;
    place(c.pair[0], -theta);
    place(c.pair[1], theta);
    plane += 1;
  }
  for (const row of ROWS) {
    if (!vectors.has(row.tag)) {
      place(row.tag, 0);
      plane += 1;
    }
  }
  return vectors;
}

export async function vectorsFor(mode = defaultVectorMode(), { paths, env } = {}) {
  if (mode === 'synthetic') return syntheticVectors();
  if (mode !== 'model') throw new Error(`unknown vector mode '${mode}'.`);
  const vectors = new Map();
  // One at a time, not embedMany: slice 0.4 measured that batching perturbs a
  // vector by 0.01–0.03, which is a third of this fixture's headroom.
  for (const row of ROWS) vectors.set(row.tag, await embed(row.text, { role: 'passage', paths, env }));
  return vectors;
}

/**
 * Re-measure the fixture's own invariant: exactly the eight designed pairs clear
 * the threshold, and nothing else comes close enough to be luck.
 */
export function checkMatrix(vectors, { threshold = PAIR_THRESHOLD } = {}) {
  const above = [];
  const below = [];
  for (let i = 0; i < ROWS.length; i += 1) {
    for (let j = i + 1; j < ROWS.length; j += 1) {
      const a = ROWS[i].tag;
      const b = ROWS[j].tag;
      const c = cosine(vectors.get(a), vectors.get(b));
      (c >= threshold ? above : below).push({ a, b, similarity: Math.round(c * 1e4) / 1e4 });
    }
  }
  above.sort((x, y) => y.similarity - x.similarity);
  below.sort((x, y) => y.similarity - x.similarity);

  const found = new Set(above.map((p) => [p.a, p.b].sort().join('|')));
  const missing = EXPECTED_KEYS.filter((k) => !found.has(k));
  const extra = [...found].filter((k) => !EXPECTED_KEYS.includes(k));
  return { above, missing, extra, headroom: below[0] ?? null, ok: missing.length === 0 && extra.length === 0 };
}

// -------------------------------------------------------------- the seeding --

const SEED_SQL = `
  INSERT INTO memories (uid, kind, scope, project_key, text, why, emb, emb_model, emb_dim,
                        salience, confidence, pinned, status, source_kind,
                        created_at, updated_at, consolidated_at)
  VALUES (?, ?, ?, ?, ?, ?, vector32(?), ?, ?, ?, ?, ?, 'active', 'user', ?, ?, NULL)`;

/**
 * Write the set into an open store and hand back `tag -> id`.
 *
 * Rows go in through raw SQL rather than `addMemory` on purpose: `mem add` would
 * merge `dup-old` and `dup-new` on the spot (0.977 is well over the 0.93 dedup
 * threshold) and the fixture would lose the case it exists to test. A store
 * reaches this state the way real ones do — the two facts arrive months apart,
 * from different sessions, and only the consolidation tier ever sees them side by
 * side.
 */
export async function seedAdversarial(conn, { now = Date.now(), projectKey, vectors, scope = 'project' } = {}) {
  const ids = new Map();
  for (const row of ROWS) {
    const vector = vectors.get(row.tag);
    if (!vector) throw new Error(`no vector for '${row.tag}'.`);
    const at = now - row.at * DAY;
    const info = await conn.run(
      SEED_SQL,
      `adversarial-${row.tag}`,
      row.kind ?? 'preference',
      scope,
      scope === 'global' ? null : projectKey,
      row.text,
      row.why ?? null,
      Buffer.from(Float32Array.from(vector).buffer),
      EMB_MODEL,
      EMB_DIM,
      row.salience ?? 0.5,
      row.confidence ?? 0.6,
      row.pinned ?? 0,
      at,
      // Written once and never restated: updated_at == created_at, so the decay
      // clock and the watermark predicate both read the fixture the same way.
      at,
    );
    ids.set(row.tag, Number(info.lastInsertRowid));
  }
  return ids;
}

// --------------------------------------------------------------- the judge --

/**
 * A judge that answers from the table above, keyed on the pair's two texts.
 *
 * Shaped exactly like `judgePairs` so `consolidate({ judge })` cannot tell them
 * apart. A pair it does not recognise is left OUT of the verdicts — the same
 * thing a real model does when it skips one — which surfaces as `unjudged`,
 * blocks the watermark, and makes "detection found a pair we did not design"
 * a loud failure rather than a silent verdict.
 */
export function recordedJudge(rowsById) {
  const judge = async (pairs) => {
    const verdicts = new Map();
    const unjudged = [];
    for (const pair of pairs) {
      const [lo, hi] = pair.rows;
      const c = caseFor(tagOf.get(lo.text), tagOf.get(hi.text));
      if (!c) {
        unjudged.push(pair.key);
        continue;
      }
      // `general` is 'a' or 'b' relative to the CASE's own pair order, which is
      // not necessarily the id order the detector hands back.
      const general =
        c.verdict.general === 'neither'
          ? 'neither'
          : (c.pair[c.verdict.general === 'a' ? 0 : 1] === tagOf.get(lo.text) ? 'a' : 'b');
      verdicts.set(pair.key, { pair: pair.key, class: c.verdict.class, why: c.verdict.why, general });
    }
    judge.saw = pairs.map((p) => p.key);
    return {
      verdicts,
      pairs: pairs.length,
      batches: 1,
      calls: 0,
      judged: verdicts.size,
      unjudged,
      unknown: [],
      invalid: [],
      errors: [],
      ms: 0,
    };
  };
  judge.rows = rowsById;
  return judge;
}

// ----------------------------------------------------------------- the run --

export const PROJECT_KEY = 'test/adversarial';

/**
 * A throwaway data directory that can still reach the deps and the model cache.
 *
 * Symlinks rather than copies, which is slice 1.2's pattern: the store is its own
 * file so nothing here can touch the real one, and `node_modules` and `models`
 * point at the shared ones so a run costs no npm install and no 34 MB download.
 */
export function scratchPaths({ from = resolvePaths(), label = 'mem-adversarial-' } = {}) {
  const dir = mkdtempSync(join(tmpdir(), label));
  for (const name of ['node_modules', 'models']) {
    try {
      symlinkSync(join(from.dataDir, name), join(dir, name));
    } catch {
      // Absent on a machine that has never installed or warmed. `model` mode
      // will fail loudly there; `synthetic` mode will not need them.
    }
  }
  return {
    paths: { ...from, dataDir: dir, dbPath: join(dir, 'mem.db'), modelsDir: join(dir, 'models') },
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

/**
 * Seed the set into a store and run one consolidation pass over it.
 *
 * The store is left behind for the caller to inspect — every assertion the exit
 * test makes is about what is in it afterwards, not about what the report says
 * happened.
 */
export async function runAdversarial({
  paths,
  env = { MEM_PROJECT_KEY: PROJECT_KEY },
  now = Date.now(),
  vectorMode = defaultVectorMode(),
  judge = null,
  apply = true,
  duplicatesOnly = false,
  backup = true,
} = {}) {
  const vectors = await vectorsFor(vectorMode, { paths, env });
  const matrix = checkMatrix(vectors);
  const ids = await withDb((conn) => seedAdversarial(conn, { now, projectKey: PROJECT_KEY, vectors }), {
    paths,
    env,
  });
  // Taken here rather than by the caller: "the pre-run state" is the state before
  // the pass, and the only way to be sure of that is to read it before the call.
  const before = await readState(paths, ids, { env });

  const report = await consolidate({
    paths,
    env,
    now,
    apply,
    backup,
    duplicatesOnly,
    ...(judge ? { judge } : {}),
  });
  return { ids, vectors, matrix, before, report, vectorMode };
}

/**
 * Everything a consolidation run can change, in one comparable object.
 *
 * PLAN's exit criterion is "`mem undo` restores the pre-run state exactly", and
 * "exactly" is only checkable against something that carries every column rather
 * than the three a spot check would think of — the merge moves counts and
 * `created_at`, the refinement moves salience, the supersession moves status and
 * `superseded_by`, and the pass moves `consolidated_at` on all twenty rows. `emb`
 * is dropped because it is a blob that never changes here (resolution rewrites no
 * text), and comparing 20 × 1.5 KB of float noise would only make a failure
 * unreadable.
 */
export async function readState(paths, ids, { env = { MEM_PROJECT_KEY: PROJECT_KEY } } = {}) {
  return withDb(
    async (conn) => {
      const rows = {};
      for (const [tag, id] of ids) {
        const { emb, ...row } = await conn.get('SELECT * FROM memories WHERE id = ?', id);
        rows[tag] = row;
      }
      const links = await conn.all('SELECT src, dst, rel FROM memory_links ORDER BY src, dst, rel');
      const proposals = (await readProposals(conn)).map((p) => p.key);
      const verdicts = [];
      for (const c of CASES) {
        const entry = await readVerdict(conn, ids.get(c.pair[0]), ids.get(c.pair[1]));
        if (entry) verdicts.push({ pair: c.pair.join('|'), verdict: entry.verdict });
      }
      return { rows, links, proposals, verdicts };
    },
    { paths, env },
  );
}

/** Which tags differ between two `readState` snapshots, and in which columns. */
export function diffState(before, after) {
  const rows = [];
  for (const [tag, row] of Object.entries(before.rows)) {
    const other = after.rows[tag] ?? {};
    const fields = Object.keys(row).filter((f) => (row[f] ?? null) !== (other[f] ?? null));
    if (fields.length > 0) rows.push({ tag, fields });
  }
  return {
    rows,
    links: JSON.stringify(before.links) === JSON.stringify(after.links) ? [] : after.links,
    proposals: JSON.stringify(before.proposals) === JSON.stringify(after.proposals) ? [] : after.proposals,
    verdicts: JSON.stringify(before.verdicts) === JSON.stringify(after.verdicts) ? [] : after.verdicts,
    clean:
      rows.length === 0 &&
      JSON.stringify(before.links) === JSON.stringify(after.links) &&
      JSON.stringify(before.proposals) === JSON.stringify(after.proposals) &&
      JSON.stringify(before.verdicts) === JSON.stringify(after.verdicts),
  };
}

/**
 * What the pass actually decided per case, against what the set says it should
 * have. The row a live judge disagrees on is the interesting output of `--live`.
 */
export function compare(report, ids) {
  const idTag = new Map([...ids].map(([tag, id]) => [id, tag]));
  const planned = new Map(report.planned.map((p) => [[idTag.get(p.a), idTag.get(p.b)].sort().join('|'), p]));

  return CASES.map((c) => {
    const key = [...c.pair].sort().join('|');
    const plan = planned.get(key) ?? null;
    const guard = plan?.guard?.reason ?? null;
    return {
      pair: c.pair,
      expected: { class: c.verdict.class, route: c.route, action: c.action, guard: c.guard },
      actual: plan ? { class: plan.class, route: plan.route, action: plan.action, guard } : null,
      why: plan?.why ?? null,
      ok:
        plan !== null &&
        plan.class === c.verdict.class &&
        plan.route === c.route &&
        plan.action === c.action &&
        guard === c.guard,
    };
  });
}

// ----------------------------------------------------------------- the CLI --

const HELP = `build/adversarial.mjs — phase 5b's exit criterion, run against a throwaway store

  node build/adversarial.mjs            recorded verdicts, no LLM, no cost
  node build/adversarial.mjs --live     the real \`claude -p\` judge (spawns, costs money)
  node build/adversarial.mjs --keep     leave the store behind and print its path
  node build/adversarial.mjs --json     the comparison as JSON

  --synthetic   hand-built vectors instead of the real model (no \`mem warm\` needed)
  --duplicates-only   narrow --apply to PLAN's letter

It seeds ${ROWS.length} memories, consolidates them with --apply, checks every case against
the table in this file, then runs \`mem undo\` and checks the store came back.`;

const line = (label, value) => `  ${String(label).padEnd(26)}${value}`;

async function main(argv) {
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(HELP);
    return 0;
  }
  const live = argv.includes('--live');
  const json = argv.includes('--json');
  const keep = argv.includes('--keep');
  const vectorMode = argv.includes('--synthetic') ? 'synthetic' : 'model';
  const duplicatesOnly = argv.includes('--duplicates-only');

  if (vectorMode === 'model' && !modelCached()) {
    console.error("The embedding model is not cached — run `mem warm`, or pass --synthetic.");
    return 1;
  }

  const { paths, cleanup } = scratchPaths();
  const now = Date.now();
  let failures = 0;

  try {
    const judge = live ? null : recordedJudge();
    const { ids, matrix, before, report } = await runAdversarial({ paths, now, vectorMode, judge, duplicatesOnly });
    const cases = compare(report, ids);
    const during = await readState(paths, ids);
    const changedByRun = diffState(before, during);

    const undone = await undo(report.run_id, { paths, env: { MEM_PROJECT_KEY: PROJECT_KEY } });
    const after = await readState(paths, ids);
    const left = diffState(before, after);

    const result = {
      vector_mode: vectorMode,
      judge: live ? 'claude -p' : 'recorded',
      matrix,
      cases,
      report: {
        run_id: report.run_id,
        counts: report.counts,
        by_class: report.by_class,
        stamped: report.stamped,
        errors: report.errors,
        unjudged: report.unjudged,
        // Answers about a pair nobody asked about, and answers with a class that
        // is not one. Both are how a live batch fails quietly, so both are in the
        // output rather than only in the counts.
        unknown: report.unknown ?? [],
        invalid: report.invalid ?? [],
        backup: report.backup?.path ?? null,
      },
      changed_by_run: changedByRun,
      undo: { complete: undone.complete, undone: undone.undone.length, blocked: undone.blocked },
      left_over: left,
      store: paths.dbPath,
    };

    failures =
      (matrix.ok ? 0 : 1) +
      cases.filter((c) => !c.ok).length +
      (undone.complete ? 0 : 1) +
      (left.clean ? 0 : 1) +
      (changedByRun.clean ? 1 : 0) +
      report.errors.length +
      report.unjudged.length;

    if (json) {
      console.log(JSON.stringify({ ...result, failures }, null, 2));
    } else {
      console.log(`adversarial set — ${ROWS.length} memories, ${CASES.length} designed pairs`);
      console.log(line('vectors', vectorMode));
      console.log(line('judge', live ? 'claude -p (live)' : 'recorded verdicts'));
      console.log(
        line(
          'detection',
          matrix.ok
            ? `all ${CASES.length} pairs found, nothing spurious` +
              (matrix.headroom ? ` (closest miss ${matrix.headroom.similarity})` : '')
            : `MISSING ${matrix.missing.join(', ')}  EXTRA ${matrix.extra.join(', ')}`,
        ),
      );
      console.log('');
      for (const c of cases) {
        const a = c.actual;
        console.log(
          `  ${c.ok ? 'ok  ' : 'FAIL'} ${c.pair.join(' / ').padEnd(32)}` +
            `${(a ? `${a.class} → ${a.route}${a.guard ? ` (${a.guard})` : ''}` : 'not judged').padEnd(46)}` +
            (c.ok ? '' : `expected ${c.expected.class} → ${c.expected.route}` +
              `${c.expected.guard ? ` (${c.expected.guard})` : ''}`),
        );
        if (live && c.why) console.log(`       ${c.why}`);
      }
      console.log('');
      if (result.report.unknown.length > 0 || result.report.invalid.length > 0 || report.errors.length > 0) {
        console.log('');
        for (const e of report.errors) console.log(line('judge error', `${e.code ?? ''} ${e.message}`));
        for (const u of result.report.unknown) console.log(line('answered an unknown id', JSON.stringify(u)));
        for (const i of result.report.invalid) console.log(line('answered a bad class', JSON.stringify(i)));
      }
      console.log('');
      console.log(line('applied', report.counts.applied));
      console.log(line('proposed for review', report.counts.proposed));
      console.log(line('pre-run export', report.backup?.path ?? 'none'));
      console.log(line('watermark', `${report.stamped?.stamped ?? 0} rows`));
      console.log(line('the run changed', `${changedByRun.rows.length} rows, ${during.links.length} links, ${during.proposals.length} proposals`));
      console.log(
        line('undo', `${undone.undone.length} reversed, ${undone.blocked.length} blocked`),
      );
      console.log(
        line(
          'back to pre-run state',
          left.clean
            ? 'exactly'
            : `NO — ${left.rows.map((r) => `${r.tag}(${r.fields.join(',')})`).join(' ') || ''}` +
              `${left.links.length ? ` links:${left.links.length}` : ''}` +
              `${left.proposals.length ? ` proposals:${left.proposals.length}` : ''}` +
              `${left.verdicts.length ? ` verdicts:${left.verdicts.length}` : ''}`,
        ),
      );
      console.log('');
      console.log(failures === 0 ? 'PASS' : `FAIL — ${failures} problem${failures === 1 ? '' : 's'}`);
      if (keep) console.log(`store kept at ${paths.dbPath}`);
    }
  } finally {
    if (!keep) cleanup();
  }

  return failures === 0 ? 0 : 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = await main(process.argv.slice(2));
}
