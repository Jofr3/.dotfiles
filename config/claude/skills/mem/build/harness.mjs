#!/usr/bin/env node
// The retrieval harness — where its cases are authored, and the generator that
// turns them into build/harness.json.
//
// PLAN phase 3 asks for "a JSON corpus of {prompt, should_retrieve: [ids] | []}
// cases". The ids are uids of rows in the seeded store (build/seed.mjs), which
// are random hex from a seeded rng — nobody can write those by hand. So the cases
// are authored here against the memory *text*, and this script resolves each text
// to the uid the seed actually produced. `mem tune` reads only the JSON.
//
// Three things this generator is for beyond substituting uids, each of which
// would otherwise be a silent zero in the measurement:
//
//   1. A target has to be RETRIEVABLE. Twenty-six of the 200 seeded rows are
//      staged, archived or superseded and five more are active-but-expired, and
//      retrieval can see none of them. A positive case aimed at one of those is
//      not a hard case, it is an impossible one, and it would look like a recall
//      failure forever.
//   2. A target has to be IN SCOPE. Retrieval unions globals with exactly one
//      project, so a case carries the project it is asked in and the generator
//      checks the target is visible from there.
//   3. A negative that is unanswerable *because* its answer is out of scope has
//      to stay that way. Those cases name the row that blocks them, and the
//      generator asserts it is still unreachable. If a re-seed ever makes it
//      active, the case stops being a negative and this fails loudly instead of
//      quietly measuring the opposite of what it claims.
//
// Run: node build/harness.mjs           check the cases against the seeded store
//      node build/harness.mjs --write   regenerate build/harness.json

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { withDb } from '../src/db.mjs';
import { resolvePaths } from '../src/paths.mjs';
import { PROJECTS, seedPaths } from './seed.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const HARNESS_PATH = join(HERE, 'harness.json');

/** Short names for the seed's four project keys, so a case fits on one line. */
export const SHORT = {
  web: PROJECTS[0], // github.com/acme/booking-web
  api: PROJECTS[1], // github.com/acme/booking-api
  infra: PROJECTS[2], // github.com/acme/infra
  ds: PROJECTS[3], // github.com/acme/design-system
  global: null, // globals only — what `mem search --global` scopes to
};

// ------------------------------------------------------------------- cases --
//
// Field by field:
//
//   prompt   what the user types. Phrased as a prompt, not as a search query:
//            this harness measures the UserPromptSubmit path, and "which package
//            manager should I use?" is a different vector from "pnpm".
//   in       which project the prompt is asked in (SHORT above).
//   tier     literal    | the prompt reuses the memory's own words. These prove
//                       | the pipeline works, not that the model does.
//            paraphrase | the prompt shares no content word with the memory. The
//                       | real case, and where a symmetric model collapsed (1.6).
//            offtopic   | negative: nothing in the store is about this.
//            adjacent   | negative: shares vocabulary with real memories and is
//                       | still unanswerable. An easy negative set manufactures a
//                       | separation that vanishes in use.
//            filtered   | negative: the store DOES hold the answer, but it is
//                       | archived, staged, expired or in another project. Tests
//                       | the scope and status guards rather than the threshold.
//   expect   memories that MUST come back. Empty for every negative tier.
//   allow    memories that may come back without counting as a false positive.
//            This is not slack: "which package manager should I use?" pulling
//            "corepack installs the pinned package manager" is a defensible
//            answer, and scoring it as noise would measure this annotation rather
//            than the system. Anything not in expect ∪ allow is noise.
//   blocked  filtered negatives only: the row that would have answered it. The
//            generator asserts it is unreachable from `in`.

export const CASES = [
  // --- literal: the prompt reuses the memory's vocabulary -------------------
  {
    prompt: 'how do I install dependencies?',
    in: 'infra',
    tier: 'literal',
    expect: ['always use pnpm to install dependencies'],
    allow: [
      'corepack installs the pinned package manager, a global install does not',
      'a new runtime dependency needs a sentence in the pull request saying why',
    ],
  },
  {
    prompt: 'what do we use for unit tests?',
    in: 'infra',
    tier: 'literal',
    expect: ['prefer Vitest over Jest for unit tests'],
  },
  {
    prompt: 'when is the staging database reset?',
    in: 'ds',
    tier: 'literal',
    expect: ['the staging database is reset every Monday morning'],
  },
  {
    prompt: 'how long does the session token last?',
    in: 'web',
    tier: 'literal',
    expect: ['the session token expires after fifteen minutes, not fifteen hours'],
  },
  {
    prompt: 'what is the rate limit?',
    in: 'global',
    tier: 'literal',
    expect: ['rate limiting allows sixty requests a minute per token'],
  },
  {
    prompt: 'which branch is the default one?',
    in: 'infra',
    tier: 'literal',
    expect: ['the default branch is main and has been since the migration'],
    allow: ['branches are named type/short-description'],
  },
  {
    prompt: 'where do the runbooks live?',
    in: 'ds',
    tier: 'literal',
    expect: ['runbooks are kept in ops/runbooks and indexed from the wiki'],
  },
  {
    prompt: 'what are the commit message conventions here?',
    in: 'api',
    tier: 'literal',
    expect: ['commit conventions are documented in CONTRIBUTING.md'],
    allow: [
      'we squash on merge and delete the branch after',
      'the changelog is generated from commit trailers',
    ],
  },
  {
    prompt: 'what is the rollback command again?',
    in: 'infra',
    tier: 'literal',
    expect: ['the rollback command is deploy --to-tag, there is no --rollback flag'],
  },
  {
    prompt: 'can I deploy this on Friday?',
    in: 'ds',
    tier: 'literal',
    expect: ['nothing goes out on a Friday afternoon'],
  },
  {
    prompt: 'how are database connections pooled?',
    in: 'web',
    tier: 'literal',
    expect: ['pgbouncer pools connections in transaction mode'],
  },
  {
    prompt: 'how long is the cold start on the serverless path?',
    in: 'infra',
    tier: 'literal',
    expect: ['cold start on the serverless path is around 300 milliseconds'],
  },

  // --- paraphrase: no content word in common with the target ----------------
  {
    prompt: 'which package manager should I use here?',
    in: 'infra',
    tier: 'paraphrase',
    expect: ['always use pnpm to install dependencies'],
    allow: ['corepack installs the pinned package manager, a global install does not'],
  },
  {
    prompt: 'what framework do we write specs with?',
    in: 'infra',
    tier: 'paraphrase',
    expect: ['prefer Vitest over Jest for unit tests'],
  },
  {
    prompt: 'are containers how we ship this?',
    in: 'infra',
    tier: 'paraphrase',
    expect: ['deploy with nix flakes rather than docker images'],
  },
  {
    prompt: 'should I build up to the answer or lead with it?',
    in: 'ds',
    tier: 'paraphrase',
    expect: ['give me the conclusion first and the reasoning after'],
    allow: ['keep an explanation under a screen unless I ask for depth'],
  },
  {
    prompt: 'should I say sorry when I get something wrong?',
    in: 'ds',
    tier: 'paraphrase',
    expect: ['do not apologise, just correct the mistake and carry on'],
  },
  {
    prompt: 'what operating system does the user run?',
    in: 'ds',
    tier: 'paraphrase',
    expect: ['I work on NixOS with home-manager managing the dotfiles'],
  },
  {
    prompt: 'is it safe to signal status with red and green?',
    in: 'infra',
    tier: 'paraphrase',
    expect: ['I cannot distinguish red from green, so never encode meaning in colour alone'],
  },
  {
    prompt: 'which latency statistic should I look at?',
    in: 'infra',
    tier: 'paraphrase',
    expect: ['watch p95 and p99, never the mean'],
    allow: ['traces are sampled at one percent in production'],
  },
  {
    prompt: 'where does asynchronous work get queued?',
    in: 'infra',
    tier: 'paraphrase',
    expect: ['background jobs run on a Postgres-backed queue instead of Redis'],
  },
  {
    prompt: 'how is the interface styled?',
    in: 'web',
    tier: 'paraphrase',
    expect: ['styling is Tailwind on top of a small set of design tokens'],
  },
  {
    prompt: 'may I leave a value untyped in TypeScript?',
    in: 'api',
    tier: 'paraphrase',
    expect: ['no any in committed code — take unknown and narrow it'],
  },
  {
    prompt: 'where do application logs end up?',
    in: 'api',
    tier: 'paraphrase',
    expect: ['logs are structured JSON shipped to Loki'],
  },
  {
    prompt: 'how many people work here?',
    in: 'web',
    tier: 'paraphrase',
    expect: ['the team is four engineers, one designer and a part-time product manager'],
  },
  {
    prompt: 'what does the company sell?',
    in: 'global',
    tier: 'paraphrase',
    expect: ['the product is a booking tool for independent clinics'],
  },
  {
    prompt: 'when is the user away for the day?',
    in: 'infra',
    tier: 'paraphrase',
    expect: ['my working hours are roughly 09:00 to 18:00 Central European Time'],
  },
  {
    prompt: 'who runs our builds?',
    in: 'global',
    tier: 'paraphrase',
    expect: ['CI runs on GitHub Actions with a self-hosted ARM runner'],
  },
  {
    prompt: 'is it fine to leave commented-out code behind?',
    in: 'ds',
    tier: 'paraphrase',
    expect: ['delete dead code instead of commenting it out'],
  },
  {
    prompt: 'how do I make this request safe to retry?',
    in: 'web',
    tier: 'paraphrase',
    expect: ['idempotency keys belong in a header, not in the body'],
  },
  {
    prompt: 'what should I use to look for a string across the tree?',
    in: 'infra',
    tier: 'paraphrase',
    expect: ['I reach for ripgrep and fd rather than grep and find'],
  },

  // --- offtopic negatives: nothing stored is about any of this --------------
  { prompt: 'what is the capital of France?', in: 'infra', tier: 'offtopic' },
  { prompt: 'write me a haiku about otters', in: 'web', tier: 'offtopic' },
  { prompt: 'how do I make a sourdough starter?', in: 'ds', tier: 'offtopic' },
  { prompt: 'who won the 1998 football world cup?', in: 'api', tier: 'offtopic' },
  { prompt: 'what is the boiling point of mercury?', in: 'infra', tier: 'offtopic' },
  { prompt: 'summarise the plot of Moby-Dick', in: 'web', tier: 'offtopic' },

  // --- adjacent negatives: real vocabulary, no answer -----------------------
  //
  // Every one of these shares a content word with a memory in scope. They are the
  // cases where a gate that measured clean on world-knowledge negatives starts
  // leaking, and they are also what the lexical leg's coverage gate has to survive.
  { prompt: 'recommend a hotel to book in Lisbon', in: 'api', tier: 'adjacent' },
  { prompt: 'what colour was Napoleon’s horse?', in: 'ds', tier: 'adjacent' },
  { prompt: 'review my landlord’s tenancy agreement', in: 'api', tier: 'adjacent' },
  { prompt: 'what is the migration route of the arctic tern?', in: 'infra', tier: 'adjacent' },
  { prompt: 'which branch of the river is deeper?', in: 'infra', tier: 'adjacent' },
  { prompt: 'I want to pin a photograph to the kitchen wall', in: 'ds', tier: 'adjacent' },
  { prompt: 'my alarm clock keeps firing in the middle of the night', in: 'web', tier: 'adjacent' },

  // --- filtered negatives: the answer is in the store and out of reach ------
  //
  // The harshest class in here. A near-perfect match exists — often the single
  // best sentence in the corpus for the prompt — and status, expiry or the project
  // union puts it out of scope. Retrieval must come back empty rather than settle
  // for the next-best thing, and "the next-best thing" is exactly what a
  // similarity ranking is built to offer.
  {
    prompt: 'am I allowed to overwrite a colleague’s remote history?',
    in: 'api',
    tier: 'filtered',
    blocked: ['never force push a branch somebody else is working on'], // archived
  },
  {
    prompt: 'which package manager should I use here?',
    in: 'web',
    tier: 'filtered',
    blocked: ['always use pnpm to install dependencies'], // another project
  },
  {
    prompt: 'how heavy may the first page load be?',
    in: 'web',
    tier: 'filtered',
    blocked: ['the initial route has a budget of 250 kilobytes gzipped'], // archived
  },
  {
    prompt: 'how does the user want dates written?',
    in: 'ds',
    tier: 'filtered',
    blocked: ['I prefer metric units and ISO dates'], // archived
  },
  {
    prompt: 'how are secrets supplied at runtime?',
    in: 'api',
    tier: 'filtered',
    blocked: ['credentials never enter the repository, sops-nix supplies them at runtime'], // expired
  },
  {
    prompt: 'which text editor does the user work in?',
    in: 'infra',
    tier: 'filtered',
    blocked: ['I use neovim with lazy.nvim and treesitter'], // staged
  },
  {
    prompt: 'what status code answers a malformed payload?',
    in: 'web',
    tier: 'filtered',
    blocked: ['answer validation failures with 422 rather than 400'], // expired
  },
  {
    prompt: 'how long is one of our iterations?',
    in: 'api',
    tier: 'filtered',
    blocked: ['we work in two-week iterations without story points'], // expired
  },
];

export const POSITIVE_TIERS = ['literal', 'paraphrase'];
export const NEGATIVE_TIERS = ['offtopic', 'adjacent', 'filtered'];

// --------------------------------------------------------------- generation --

/** Rows keyed by text, with the two facts that decide reachability. */
async function readStore(paths, now) {
  const rows = await withDb(
    (conn) =>
      conn.all(
        `SELECT id, uid, text, kind, scope, project_key, status, pinned, expires_at
           FROM memories`,
      ),
    { paths, env: { ...process.env, MEM_NO_INSTALL: '1' } },
  );

  const byText = new Map();
  for (const row of rows) {
    // A text appearing twice would make "expect: [text]" ambiguous, and the
    // generator must not pick one silently.
    if (byText.has(row.text)) byText.get(row.text).push(row);
    else byText.set(row.text, [row]);
  }
  return { rows, byText, now };
}

/**
 * Whether retrieval asked in `projectKey` could return this row at all: PLAN's
 * step 1, `status='active' AND (scope='global' OR project_key = ?)`, plus
 * search.mjs's read-time expiry guard.
 */
export function reachable(row, projectKey, now) {
  if (row.status !== 'active') return false;
  if (row.expires_at !== null && row.expires_at <= now) return false;
  return row.scope === 'global' || row.project_key === projectKey;
}

function resolveOne(store, text, where) {
  const found = store.byText.get(text);
  if (!found) throw new Error(`${where}: no memory in the seeded store says "${text}"`);
  if (found.length > 1) {
    throw new Error(`${where}: "${text}" appears ${found.length} times — the case is ambiguous`);
  }
  return found[0];
}

const brief = (row) => ({
  uid: row.uid,
  id: row.id,
  text: row.text,
  scope: row.scope,
  project_key: row.project_key,
  status: row.status,
});

/**
 * One authored case → one JSON case, with every uid resolved and every claim the
 * case makes about the store checked. Throws rather than warns: a harness that
 * silently drops the case it could not resolve reports a precision it did not
 * measure.
 */
export function resolveCase(store, authored, index) {
  const where = `case ${index} (${authored.prompt})`;
  if (!(authored.in in SHORT)) throw new Error(`${where}: unknown project '${authored.in}'`);
  const projectKey = SHORT[authored.in];

  const positive = POSITIVE_TIERS.includes(authored.tier);
  if (!positive && !NEGATIVE_TIERS.includes(authored.tier)) {
    throw new Error(`${where}: unknown tier '${authored.tier}'`);
  }

  const expect = (authored.expect ?? []).map((t) => resolveOne(store, t, where));
  const allow = (authored.allow ?? []).map((t) => resolveOne(store, t, where));
  const blocked = (authored.blocked ?? []).map((t) => resolveOne(store, t, where));

  if (positive && expect.length === 0) throw new Error(`${where}: a positive case needs an expect`);
  if (!positive && expect.length > 0) {
    throw new Error(`${where}: a ${authored.tier} case must retrieve nothing, so expect must be empty`);
  }
  if (authored.tier === 'filtered' && blocked.length === 0) {
    throw new Error(`${where}: a filtered case must name the row that blocks it`);
  }

  for (const row of [...expect, ...allow]) {
    if (!reachable(row, projectKey, store.now)) {
      throw new Error(
        `${where}: "${row.text}" is ${row.status}` +
          (row.expires_at !== null && row.expires_at <= store.now ? ' and expired' : '') +
          ` in ${row.scope === 'global' ? 'global scope' : row.project_key} — unreachable from ` +
          `${projectKey ?? 'global-only'}, so the case is impossible rather than hard`,
      );
    }
  }
  for (const row of blocked) {
    if (reachable(row, projectKey, store.now)) {
      throw new Error(
        `${where}: "${row.text}" is reachable from ${projectKey ?? 'global-only'} after all — ` +
          'this case is no longer a negative and the harness must be re-authored',
      );
    }
  }

  return {
    prompt: authored.prompt,
    project_key: projectKey,
    project: authored.in,
    tier: authored.tier,
    should_retrieve: expect.map((r) => r.uid),
    allow: allow.map((r) => r.uid),
    // Kept beside the uids so a stale harness fails loudly: `mem tune` re-reads
    // these from the store and compares. A hex uid alone cannot tell anyone what
    // the case is about, either.
    expect_text: expect.map((r) => r.text),
    allow_text: allow.map((r) => r.text),
    ...(blocked.length ? { blocked: blocked.map(brief) } : {}),
  };
}

/** The whole harness, resolved. Deterministic given the seeded store. */
export async function buildHarness({ paths = seedPaths(resolvePaths()), now = Date.now() } = {}) {
  const store = await readStore(paths, now);
  const cases = CASES.map((c, i) => resolveCase(store, c, i));

  const count = (pred) => cases.filter(pred).length;
  return {
    generated_by: 'node build/harness.mjs --write',
    // Not for reproducibility — the cases are hand-written. It is here so a
    // harness measured against one fixture cannot be mistaken for one measured
    // against another.
    fixture: { db: paths.dbPath, memories: store.rows.length },
    shape: {
      cases: cases.length,
      positives: count((c) => POSITIVE_TIERS.includes(c.tier)),
      negatives: count((c) => NEGATIVE_TIERS.includes(c.tier)),
      expected_memories: cases.reduce((n, c) => n + c.should_retrieve.length, 0),
      by_tier: Object.fromEntries(
        [...POSITIVE_TIERS, ...NEGATIVE_TIERS].map((t) => [t, count((c) => c.tier === t)]),
      ),
    },
    cases,
  };
}

async function main(argv) {
  const write = argv.includes('--write');
  let harness;
  try {
    harness = await buildHarness();
  } catch (err) {
    console.error(`harness: ${err.message}`);
    return 1;
  }

  if (write) {
    writeFileSync(HARNESS_PATH, `${JSON.stringify(harness, null, 2)}\n`);
    console.log(`Wrote ${HARNESS_PATH}`);
  }

  const { shape } = harness;
  console.log(
    `${shape.cases} cases — ${shape.positives} positive over ${shape.expected_memories} memories, ` +
      `${shape.negatives} that must retrieve nothing`,
  );
  console.log(
    Object.entries(shape.by_tier)
      .map(([tier, n]) => `  ${tier.padEnd(11)}${n}`)
      .join('\n'),
  );
  return 0;
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = await main(process.argv.slice(2));
}
