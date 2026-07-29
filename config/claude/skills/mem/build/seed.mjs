#!/usr/bin/env node
// A synthetic store, for the phase-1 exit test: "seed 200 synthetic memories;
// search returns sane top-5 in <400ms from a cold process".
//
// Three things make this a fixture worth trusting rather than 200 rows of noise:
//
//   1. The corpus is 200-odd *distinct* facts a real developer's store might
//      hold, not one sentence with a counter appended. A store of near-copies
//      would flatter retrieval (every query has one obvious winner) and flatter
//      the gate (junk queries are far from a tight cluster), so it would measure
//      nothing.
//   2. Every record goes through the real write-path validation — normaliseInput
//      and the secret scrubber — so the fixture is a store `mem add` could
//      actually have produced. See seedRecords().
//   3. No pair inside a (scope, project_key, status) group is within the 0.93
//      dedup threshold, checked against the real vectors after embedding. That
//      is exactly the invariant the write path maintains, so the seeded store is
//      one the write path would have converged to. The six superseded/newer
//      pairs are *deliberately* above it and legal for the same reason the write
//      path allows them: they are in different status groups.
//
// It writes to its own data directory (<dataDir>/seed) and never to the real
// mem.db without --force. Deps and the model cache are symlinked in, so
//   CLAUDE_PLUGIN_DATA=<dataDir>/seed mem search 'how do I install dependencies?'
// works by hand against the seeded store.
//
// Timestamps are epoch milliseconds, matching write.mjs.

import { lstatSync, mkdirSync, rmSync, statSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { checkpoint, openDb } from '../src/db.mjs';
import { EMB_DIM, EMB_MODEL, cosine, embedMany, vectorBlob } from '../src/embed.mjs';
import { resolvePaths } from '../src/paths.mjs';
import { assertNoSecrets } from '../src/scrub.mjs';
import { DEDUP_THRESHOLD, KINDS, STATUSES, normaliseInput, requireOneOf } from '../src/write.mjs';

export const DEFAULT_COUNT = 200;

/** Fixed so two runs of the seed produce the same store, uids included. */
export const DEFAULT_SEED = 20260729;

/** PLAN measured a batch of 32 at 43ms, against 11ms for a single embed. */
export const EMBED_BATCH = 32;

const DAY_MS = 24 * 60 * 60 * 1000;

// ------------------------------------------------------------------ corpus --
//
// [kind, text, why?, supersededPhrasing?]
//
// A fourth element makes the entry a *pair*: the older phrasing is inserted as
// status='superseded' pointing at the newer row. Those are the only near-
// duplicates in here, and they are the shape phase 5b's contradiction judge has
// to resolve — worth having in the fixture from the start.

const CORPUS = [
  // dependencies
  ['preference', 'always use pnpm to install dependencies', 'two lockfiles in one repo is a merge conflict waiting to happen', 'always use npm to install dependencies'],
  ['constraint', 'never commit a lockfile that was edited by hand'],
  ['decision', 'the Node version is pinned to 22 in .nvmrc'],
  ['constraint', 'CI installs with --frozen-lockfile so a stale lockfile fails the build'],
  ['preference', 'reference sibling packages by the workspace protocol, not a relative path'],
  ['fact', 'the monorepo holds eleven packages under packages/'],
  ['decision', 'dependency upgrades land as one batched renovate pull request each week'],
  ['constraint', 'a new runtime dependency needs a sentence in the pull request saying why'],
  ['preference', 'keep devDependencies out of what gets published'],
  ['fact', 'a peer dependency warning fails the build'],
  ['reference', 'the dependency policy is written up in docs/deps.md'],
  ['correction', 'corepack installs the pinned package manager, a global install does not'],

  // testing
  ['preference', 'prefer Vitest over Jest for unit tests', 'the ESM story is simpler and watch mode is faster', 'use Jest for unit tests'],
  ['constraint', 'every bug fix ships with a test that fails without it'],
  ['decision', 'end-to-end coverage is Playwright against a preview deployment'],
  ['preference', 'write table-driven tests instead of one test per case'],
  ['constraint', 'integration tests talk to a throwaway schema, never to a mock'],
  ['fact', 'the unit suite finishes in about ninety seconds on this laptop'],
  ['preference', 'assert on behaviour rather than on how many times a spy was called'],
  ['decision', 'snapshot tests are allowed only inside the design system'],
  ['fact', 'coverage is reported on each run but is not a merge gate'],
  ['constraint', 'the test suite must pass with the network unplugged'],
  ['reference', 'flaky tests are triaged on the board called flaky'],
  ['correction', 'describe.concurrent parallelises a file, test.concurrent does not'],

  // continuous integration
  ['decision', 'CI runs on GitHub Actions with a self-hosted ARM runner'],
  ['constraint', 'a red build blocks merge, with no admin override'],
  ['preference', 'keep any single CI job under five minutes or split it in two'],
  ['fact', 'the cache key is the lockfile hash plus the Node version'],
  ['decision', 'only a release tag triggers publishing, never a push to a branch'],
  ['constraint', 'third-party actions must be pinned to a commit hash'],
  ['fact', 'the ARM runner has eight cores and sixteen gigabytes of memory'],
  ['preference', 'run lint before the slow matrix so failures come back quickly'],
  ['fact', 'concurrency groups cancel superseded runs on the same branch'],
  ['correction', 'the nightly job fires at 03:00 UTC, not at 03:00 local time'],

  // deployment and infrastructure
  ['decision', 'deploy with nix flakes rather than docker images', 'reproducible builds and no registry to babysit', 'deploy with docker images built in CI'],
  ['constraint', 'nothing goes out on a Friday afternoon'],
  ['fact', 'production is three nodes behind one anycast address'],
  ['preference', 'put a new path behind a flag before deleting the old one'],
  ['decision', 'staging mirrors production hardware at a third of the size'],
  ['constraint', 'a release must be revertible by redeploying the previous tag'],
  ['fact', 'a full deploy takes about four minutes end to end'],
  ['reference', 'runbooks are kept in ops/runbooks and indexed from the wiki'],
  ['preference', 'prefer blue-green cutovers over rolling restarts for the API'],
  ['fact', 'DNS lives in Cloudflare and is changed through terraform'],
  ['constraint', 'infrastructure changes need a second pair of eyes before apply'],
  ['correction', 'the rollback command is deploy --to-tag, there is no --rollback flag'],

  // database
  ['decision', 'Postgres 16 with drizzle for schema and queries'],
  ['constraint', 'migrations are forward-only and stay compatible for one release'],
  ['fact', 'the staging database is reset every Monday morning'],
  ['preference', 'reach for a partial index before filtering in application code'],
  ['constraint', 'never run a manual UPDATE on production outside a transaction'],
  ['fact', 'pgbouncer pools connections in transaction mode'],
  ['decision', 'soft deletes use a deleted_at timestamp, never a boolean'],
  ['preference', 'name a join table after the relationship, not after the two tables'],
  ['fact', 'the events table is the largest at roughly forty million rows'],
  ['constraint', 'a migration that locks a table for over a second needs a written plan'],
  ['reference', 'slow query charts are in Grafana under db/slow'],
  ['correction', 'the read replica lags by seconds, not milliseconds'],

  // API and backend
  ['decision', 'the public API is REST over JSON', 'the client needs caching more than it needs field selection', 'the public API is GraphQL'],
  ['constraint', 'a breaking API change needs a version bump and a deprecation window'],
  ['preference', 'answer validation failures with 422 rather than 400'],
  ['fact', 'every request carries a trace id in the x-request-id header'],
  ['constraint', 'never log a full request body in production'],
  ['preference', 'validate at the edge with zod schemas the client shares'],
  ['decision', 'background jobs run on a Postgres-backed queue instead of Redis'],
  ['fact', 'rate limiting allows sixty requests a minute per token'],
  ['preference', 'keep controllers thin and put the logic in services'],
  ['reference', 'the OpenAPI document is generated into docs/api/openapi.json'],
  ['correction', 'idempotency keys belong in a header, not in the body'],

  // frontend
  ['decision', 'the web app is React with Vite and TanStack Router'],
  ['preference', 'keep server state in TanStack Query rather than a global store'],
  ['constraint', 'a feature folder may not import from another feature folder'],
  ['fact', 'the initial route has a budget of 250 kilobytes gzipped'],
  ['preference', 'components are functions with typed props and a named export'],
  ['decision', 'forms use react-hook-form with a zod resolver'],
  ['constraint', 'every interactive element needs a visible focus style'],
  ['fact', 'the app supports the last two versions of Chrome, Firefox and Safari'],
  ['preference', 'keep a component test in the same folder as the component'],
  ['reference', 'the component gallery is served at /storybook on staging'],
  ['correction', 'a router loader runs before render, not after mount'],

  // styling and design
  ['decision', 'styling is Tailwind on top of a small set of design tokens'],
  ['constraint', 'no hardcoded colour values outside the token file'],
  ['preference', 'lay pages out with CSS grid instead of nested flex containers'],
  ['fact', 'dark mode follows the prefers-color-scheme media query'],
  ['preference', 'size spacing in rem and keep px for hairline borders'],
  ['constraint', 'text has to clear WCAG AA contrast against its background'],
  ['decision', 'icons come from lucide as one shared sprite'],
  ['fact', 'the type scale has six steps at a ratio of 1.25'],
  ['reference', 'the design file is in Figma under Product / Web'],
  ['correction', 'the darker green is the product brand, the brighter one is marketing'],

  // language and types
  ['preference', 'prefer type aliases to interfaces unless declaration merging is needed'],
  ['constraint', 'no any in committed code — take unknown and narrow it'],
  ['decision', 'the build targets ES2022 with bundler module resolution'],
  ['preference', 'return early instead of nesting conditionals three deep'],
  ['constraint', 'exported functions carry an explicit return type'],
  ['fact', 'strict mode has been on since the first commit'],
  ['preference', 'name booleans as questions: isReady, hasAccess, shouldRetry'],
  ['decision', 'enums are avoided in favour of const objects and unions'],
  ['preference', 'split a file once it passes four hundred lines'],
  ['reference', 'the TypeScript style guide is docs/style/typescript.md'],
  ['correction', 'satisfies checks a value against a type without widening it'],

  // git workflow
  ['preference', 'I prefer terse commit messages in the imperative mood'],
  ['constraint', 'never force push a branch somebody else is working on'],
  ['decision', 'we squash on merge and delete the branch after', 'the history reads as one change per feature', 'we merge with a merge commit and keep the branch'],
  ['preference', 'rebase a feature branch rather than merging main back into it'],
  ['constraint', 'commits have to be signed'],
  ['fact', 'the default branch is main and has been since the migration'],
  ['preference', 'one logical change per commit, even when that means five of them'],
  ['decision', 'branches are named type/short-description'],
  ['constraint', 'generated output is ignored by git, never committed'],
  ['reference', 'commit conventions are documented in CONTRIBUTING.md'],
  ['correction', 'the large-file guard is a pre-receive hook, not a pre-commit one'],

  // code review
  ['preference', 'review for correctness first and for style last'],
  ['constraint', 'a pull request over four hundred lines gets split before review'],
  ['decision', 'one approval is enough except on infrastructure changes'],
  ['preference', 'leave a suggested commit rather than prose describing the diff'],
  ['fact', 'median review turnaround is under four hours'],
  ['constraint', 'nobody approves their own pull request'],
  ['preference', 'ask a question in review instead of issuing an instruction'],
  ['reference', 'the review checklist is pinned in the team channel'],
  ['correction', 'marking a draft ready is what notifies reviewers, opening it does not'],

  // security
  ['constraint', 'credentials never enter the repository, sops-nix supplies them at runtime'],
  ['preference', 'rotate credentials on a schedule, not after an incident'],
  ['decision', 'authentication uses short-lived tokens refreshed on the server'],
  ['constraint', 'a critical advisory in a dependency blocks the release'],
  ['fact', 'the security contact is published in SECURITY.md'],
  ['constraint', 'personal data must not leave the primary region'],
  ['preference', 'prefer narrowly scoped tokens over one administrator token'],
  ['decision', 'access reviews happen once a quarter'],
  ['reference', 'incident write-ups are filed under ops/incidents by date'],
  ['correction', 'the session token expires after fifteen minutes, not fifteen hours'],

  // documentation
  ['preference', 'write docs as short task-shaped pages rather than one long guide'],
  ['constraint', 'a public behaviour change is not done until its documentation changes'],
  ['preference', 'plain words beat jargon in anything a user reads'],
  ['decision', 'the changelog is generated from commit trailers'],
  ['fact', 'the docs site rebuilds on every merge to main'],
  ['preference', 'show one runnable example before explaining the options'],
  ['constraint', 'never document a flag before it exists'],
  ['reference', 'documentation sources live in docs/ and deploy from the same repository'],
  ['correction', 'the readme is the quickstart and the wiki is the reference'],

  // environment and tooling
  ['fact', 'I work on NixOS with home-manager managing the dotfiles'],
  ['preference', 'I use neovim with lazy.nvim and treesitter'],
  ['decision', 'formatting is prettier for web code and alejandra for nix'],
  ['constraint', 'the formatter runs on save, it is never a review comment'],
  ['preference', 'I reach for ripgrep and fd rather than grep and find'],
  ['fact', 'my shell is bash with starship and fzf key bindings'],
  ['preference', 'keep the terminal at eighty columns when we are pairing'],
  ['decision', 'direnv loads the dev shell on entering the directory'],
  ['reference', 'the dotfiles repository is ~/.dotfiles and it is a flake'],
  ['correction', 'this repository uses nix develop, not nix-shell'],

  // observability
  ['decision', 'logs are structured JSON shipped to Loki', 'grep over plain text stopped scaling at three services', 'logs are plain text shipped to Elasticsearch'],
  ['preference', 'log at info for state changes and at debug for the rest'],
  ['constraint', 'an alert without a linked runbook does not get created'],
  ['fact', 'traces are sampled at one percent in production'],
  ['preference', 'watch p95 and p99, never the mean'],
  ['constraint', 'an alert firing more than twice a week gets retuned or deleted'],
  ['fact', 'the on-call rotation is weekly and starts on Wednesday'],
  ['reference', 'the service dashboard is grafana/service-overview'],
  ['correction', 'the objective covers latency and the agreement covers availability'],

  // performance
  ['preference', 'measure before optimising and keep the measurement in the repository'],
  ['constraint', 'no N+1 queries on a path that a list view hits'],
  ['fact', 'checkout has a 200 millisecond budget at p95'],
  ['decision', 'images are served as AVIF with a WebP fallback'],
  ['preference', 'cache at the edge before caching inside the application'],
  ['constraint', 'a change that blows the bundle budget cannot merge'],
  ['fact', 'cold start on the serverless path is around 300 milliseconds'],
  ['preference', 'batch writes instead of issuing one statement per item'],
  ['correction', 'the slow leg was JSON serialisation, the database was fine'],

  // how I want to be worked with
  ['preference', 'give me the conclusion first and the reasoning after'],
  ['preference', 'I prefer metric units and ISO dates'],
  ['constraint', 'do not apologise, just correct the mistake and carry on'],
  ['constraint', 'show me a destructive command before running it'],
  ['preference', 'I read a diff more easily than a description of a change'],
  ['fact', 'my working hours are roughly 09:00 to 18:00 Central European Time'],
  ['preference', 'keep an explanation under a screen unless I ask for depth'],
  ['preference', 'British spelling in prose, American spelling in code'],
  ['constraint', 'ask before creating files outside the working directory'],
  ['preference', 'one well-argued option beats five mediocre ones'],
  ['fact', 'I cannot distinguish red from green, so never encode meaning in colour alone'],
  ['preference', 'when I say quick I mean under five minutes of work'],

  // team and product
  ['fact', 'the team is four engineers, one designer and a part-time product manager'],
  ['fact', 'planning is on Tuesday and the retrospective on Friday afternoon'],
  ['decision', 'we work in two-week iterations without story points'],
  ['fact', 'the product is a booking tool for independent clinics'],
  ['constraint', 'customer data never appears in a demo or a screenshot'],
  ['fact', 'one customer accounts for about a third of revenue'],
  ['decision', 'support tickets are triaged by the on-call engineer each morning'],
  ['fact', 'the company works asynchronously across three time zones'],
  ['reference', 'the roadmap is one page in Notion under Product'],
  ['correction', 'the launch is in September; June was the beta'],

  // engineering judgement
  ['preference', 'prefer boring technology the team already understands'],
  ['constraint', 'no new service without a named owner and a runbook'],
  ['decision', 'shared code goes in a package rather than being copied between apps'],
  ['preference', 'delete dead code instead of commenting it out'],
  ['fact', 'the repository has been a monorepo since its second month'],
  ['preference', 'name things after what they do, not after the pattern they use'],
  ['constraint', 'a TODO in committed code carries an issue number'],
  ['decision', 'feature flags are removed within two releases of landing'],
  ['preference', 'prefer composition to inheritance in application code'],
  ['fact', 'the oldest service still running was written in 2019'],
  ['correction', 'the outage came from a config reload, not from the deploy'],
  ['reference', 'architecture decision records are numbered under docs/adr'],
];

/**
 * Project keys in the shape scope.mjs produces from a git remote. Four of them
 * plus the globals is enough for the scoping to be exercised — retrieval unions
 * globals with exactly one of these, so a store that was all one project would
 * never test the union.
 */
export const PROJECTS = [
  'github.com/acme/booking-web',
  'github.com/acme/booking-api',
  'github.com/acme/infra',
  'github.com/acme/design-system',
];

/**
 * Queries with a known right answer, for the cold-path test. Chosen by
 * measurement, not by eye: each of these clears the 0.35 gate against its target
 * with the other 199 memories competing. The last one has no answer at all, and
 * a seeded store returning nothing for it is the property PLAN cares about most.
 */
export const PROBES = [
  { query: 'how do I install dependencies?', text: 'always use pnpm to install dependencies' },
  { query: 'what do we use for testing?', text: 'prefer Vitest over Jest for unit tests' },
  { query: 'when is the staging database wiped?', text: 'the staging database is reset every Monday morning' },
];

export const NULL_PROBES = [
  'what is the capital of France?',
  'write me a haiku about otters',
];

// -------------------------------------------------------------- generation --

/**
 * mulberry32. Deterministic and seedable — Math.random() would make the fixture
 * different on every run, and a perf number measured against a store you cannot
 * rebuild is not a measurement.
 */
export function rng(seed = DEFAULT_SEED) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const between = (rand, lo, hi) => lo + rand() * (hi - lo);

/**
 * Which project a corpus entry belongs to. Deliberately *not* drawn from the
 * rng: a fact that reappears on a later pass through the corpus has to land in a
 * different project than last time, or the same sentence would end up twice in
 * one scope — a pair the write path would have merged, and the one thing this
 * fixture must not contain. Hashing the index instead of using `index % 4` keeps
 * the corpus's topic blocks from mapping one-to-one onto projects.
 */
function projectFor(index, cycle) {
  // Mix the high bits down before taking the modulus: with four projects,
  // `index * odd % 4` depends only on `index % 4`, which would have mapped the
  // corpus's twelve-fact topic blocks straight onto three projects each.
  let h = Math.imul(index + 1, 2654435761) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 2246822507) >>> 0;
  h ^= h >>> 13;
  return PROJECTS[((h >>> 0) % PROJECTS.length + cycle) % PROJECTS.length];
}

/** A uuid-shaped id from the seeded stream, so uids are stable across runs. */
function seededUid(rand) {
  const hex = (n) => Array.from({ length: n }, () => '0123456789abcdef'[Math.floor(rand() * 16)]).join('');
  return `${hex(8)}-${hex(4)}-4${hex(3)}-8${hex(3)}-${hex(12)}`;
}

/**
 * One memory's worth of metadata. The distributions are chosen so the fixture
 * exercises what the rest of the system branches on: pinned rows (exempt from
 * decay), staged rows (never retrieved), archived rows (out of scope), expired
 * rows that are still status='active' (search.mjs's read-time guard), and a
 * spread of ages and usage counts wide enough that strength actually varies.
 */
function profile(rand, now, { pinned = false, status = 'active' } = {}) {
  const ageDays = between(rand, 0, 540);
  const createdAt = Math.round(now - ageDays * DAY_MS);
  // Most memories are never restated; the ones that are, were restated
  // somewhere between when they were written and now.
  const updatedAt = rand() < 0.25 ? Math.round(between(rand, createdAt, now)) : createdAt;

  const injectedCount = Math.floor(rand() ** 2 * 40);
  // useful_count <= injected_count by construction: a memory cannot have proved
  // useful in a turn it was never injected into. PLAN reads the ratio of these
  // two as the over-general-slop signature, so an impossible pair would poison
  // the one statistic that catches it.
  const usefulCount = injectedCount === 0 ? 0 : Math.floor(rand() * (injectedCount * 0.4 + 1));

  return {
    pinned,
    status,
    salience: Math.round(between(rand, 0.3, 0.95) * 100) / 100,
    confidence: Math.round(between(rand, 0.4, 1) * 100) / 100,
    createdAt,
    updatedAt,
    injectedCount,
    lastInjectedAt: injectedCount > 0 ? Math.round(between(rand, updatedAt, now)) : null,
    usefulCount,
    lastUsedAt: usefulCount > 0 ? Math.round(between(rand, updatedAt, now)) : null,
  };
}

/**
 * Generate `count` records. Pure: same seed and same `now` give the same rows,
 * uids included, so the store can be rebuilt byte for byte.
 *
 * Records come out in insert order. A superseding entry emits its older phrasing
 * first and the replacement straight after, carrying `supersededByUid` — the
 * link is resolved after the insert, because the target does not have an id yet.
 */
export function generate({ count = DEFAULT_COUNT, seed = DEFAULT_SEED, now = Date.now() } = {}) {
  const rand = rng(seed);
  const records = [];

  for (let i = 0; records.length < count; i += 1) {
    const [kind, text, why = null, older = null] = CORPUS[i % CORPUS.length];
    const cycle = Math.floor(i / CORPUS.length);

    // Globals only on the first pass. Past the corpus the same fact reappears
    // under a different project key, which is legal — the write path dedups
    // within one scope, so the same sentence in two repos is two memories — and
    // it is the only honest way to scale past the corpus without inventing
    // filler sentences.
    const global = cycle === 0 && rand() < 0.22;
    const projectKey = global ? null : projectFor(i % CORPUS.length, cycle);
    const scope = global ? 'global' : 'project';

    const roll = rand();
    const status = roll < 0.06 ? 'staged' : roll < 0.11 ? 'archived' : 'active';
    // Pinned only where it means something: a global preference or constraint
    // the user would actually protect from decay.
    const pinned = status === 'active' && global && rand() < 0.25;

    const base = {
      uid: seededUid(rand),
      kind,
      text,
      why,
      scope,
      projectKey,
      sourceKind: status === 'staged' ? 'auto' : 'user',
      sourceSession: status === 'staged' ? `seed-session-${cycle}` : null,
      ...profile(rand, now, { pinned, status }),
    };

    // A handful of memories with a lifetime, and two already past it: an expired
    // row keeps status='active' until a tier-1 sweep runs, which is precisely the
    // case search.mjs guards at read time.
    const ttl = rand();
    base.expiresAt =
      ttl < 0.02
        ? Math.round(now - between(rand, 1, 30) * DAY_MS)
        : ttl < 0.05
          ? Math.round(now + between(rand, 7, 120) * DAY_MS)
          : null;

    if (older && records.length + 2 <= count && status === 'active') {
      const replaced = {
        ...base,
        uid: seededUid(rand),
        text: older,
        why: null,
        status: 'superseded',
        pinned: false,
        expiresAt: null,
        // The older phrasing was written before the one that replaced it.
        createdAt: Math.round(base.createdAt - between(rand, 30, 200) * DAY_MS),
        updatedAt: base.createdAt,
        supersededByUid: base.uid,
      };
      records.push(replaced, { ...base, supersededByUid: null });
    } else {
      records.push({ ...base, supersededByUid: null });
    }
  }

  return records.slice(0, count);
}

/**
 * Run every record through the write path's own validation. Not decoration: if
 * the fixture contains something `mem add` would have rejected — an over-long
 * text, an unknown kind, a credential — then any measurement taken against it is
 * a measurement of a store that could not exist.
 */
export function seedRecords(opts) {
  return generate(opts).map((record) => {
    // normaliseInput only admits the two statuses a *write* can produce; the
    // fixture also holds end-states that pruning and consolidation produce, so
    // status is checked against the full list separately.
    const status = requireOneOf(record.status, STATUSES, 'status');
    const checked = normaliseInput({ ...record, status: 'active' });
    assertNoSecrets({ text: checked.text, why: checked.why });
    requireOneOf(record.kind, KINDS, 'kind');
    return { ...record, status, text: checked.text, why: checked.why };
  });
}

// ------------------------------------------------------------------ seeding --

/** Where the seeded store lives: beside the real one, never on top of it. */
export function seedPaths(base = resolvePaths()) {
  const dataDir = join(base.dataDir, 'seed');
  return { ...base, dataDir, dbPath: join(dataDir, 'mem.db') };
}

/**
 * Make the seed directory usable as a CLAUDE_PLUGIN_DATA of its own, by pointing
 * it at the real deps and model cache. Without this, `CLAUDE_PLUGIN_DATA=<seed>
 * mem search …` would try to install 23MB of model into the fixture directory.
 */
function linkSharedCaches(paths, base) {
  mkdirSync(paths.dataDir, { recursive: true });
  for (const [target, name] of [[base.nodeModulesDir, 'node_modules'], [base.modelsDir, 'models']]) {
    const link = join(paths.dataDir, name);
    try {
      if (!lstatSync(link, { throwIfNoEntry: false })) symlinkSync(target, link);
    } catch {
      // A fixture that cannot be browsed by hand is still a usable fixture.
    }
  }
}

const fileSize = (path) => {
  try {
    return statSync(path).size;
  } catch {
    return 0;
  }
};

const INSERT = `
  INSERT INTO memories (uid, kind, scope, project_key, text, why,
                        emb, emb_model, emb_dim,
                        salience, confidence, pinned, status,
                        source_kind, source_session,
                        created_at, updated_at,
                        last_injected_at, injected_count,
                        last_used_at, useful_count, expires_at)
  VALUES (?, ?, ?, ?, ?, ?, vector32(?), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

/**
 * The invariant that makes this a fixture rather than noise: within a
 * (scope, project_key, status) group — the exact set the write path compares a
 * new memory against — nothing sits at or above the dedup threshold. Returns the
 * offending pairs and the worst similarity seen.
 *
 * O(n²) inside each group, so it is skipped for large counts; at 200 rows it is
 * a few milliseconds and worth paying every run.
 */
export function findNearDuplicates(records, vectors, threshold = DEDUP_THRESHOLD) {
  const groups = new Map();
  records.forEach((record, i) => {
    const key = `${record.scope} ${record.projectKey ?? ''} ${record.status}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(i);
  });

  const pairs = [];
  let worst = 0;
  for (const members of groups.values()) {
    for (let a = 0; a < members.length; a += 1) {
      for (let b = a + 1; b < members.length; b += 1) {
        const similarity = cosine(vectors[members[a]], vectors[members[b]]);
        if (similarity > worst) worst = similarity;
        if (similarity >= threshold) {
          pairs.push({ similarity, a: records[members[a]].text, b: records[members[b]].text });
        }
      }
    }
  }
  return { pairs, worst };
}

/** Embed every text, in batches, reporting how long the model actually took. */
async function embedAll(texts, { paths, env, batch }) {
  const vectors = [];
  for (let i = 0; i < texts.length; i += batch) {
    vectors.push(...(await embedMany(texts.slice(i, i + batch), { paths, env })));
  }
  return vectors;
}

/**
 * Build the store. Returns the stats the perf test asserts on and the seed
 * command prints.
 *
 * Two measured facts shape the insert, both probed on this machine against
 * Turso 0.7.1 rather than assumed:
 *
 *   - `superseded_by INTEGER REFERENCES memories(id)` with foreign_keys ON makes
 *     every insert cost O(rows already inserted) *even when the column is NULL*:
 *     5k rows take 4.7s with the pragma on and 0.55s with it off, and 20k rows
 *     take 134s. So the bulk load runs with foreign keys off and the dangling-
 *     reference check is done afterwards in plain SQL — `PRAGMA foreign_key_check`
 *     returns an empty result in this build even when a reference really is
 *     dangling, so it cannot be the check.
 *   - PLAN's "querying right after a bulk insert took 21s (WAL spill)" does not
 *     reproduce here: at 20k rows the same-process query took 38ms before the
 *     checkpoint and 37ms after. What the checkpoint does do is fold an 80MB WAL
 *     back into the file in ~6ms, so it stays — bounded file growth is reason
 *     enough — and the timings are reported either way rather than assumed.
 */
export async function seedDatabase({
  paths = seedPaths(),
  base = resolvePaths(),
  count = DEFAULT_COUNT,
  seed = DEFAULT_SEED,
  now = Date.now(),
  env = process.env,
  batch = EMBED_BATCH,
  reset = true,
  doCheckpoint = true,
  verifyDistinct = count <= 1000,
  link = true,
  force = false,
} = {}) {
  if (!force && paths.dbPath === base.dbPath) {
    throw new Error(
      `Refusing to seed the real store at ${paths.dbPath}. Pass --force if that is genuinely what you want.`,
    );
  }

  if (link) linkSharedCaches(paths, base);
  else mkdirSync(paths.dataDir, { recursive: true });

  if (reset) for (const suffix of ['', '-wal', '-shm']) rmSync(paths.dbPath + suffix, { force: true });

  const t0 = performance.now();
  const records = seedRecords({ count, seed, now });
  const generateMs = performance.now() - t0;

  const t1 = performance.now();
  const vectors = await embedAll(records.map((r) => r.text), { paths, env, batch });
  const embedMs = performance.now() - t1;

  const duplicates = verifyDistinct
    ? findNearDuplicates(records, vectors)
    : { pairs: [], worst: null };

  const conn = await openDb({ paths, env });
  try {
    await conn.exec('PRAGMA foreign_keys = OFF');

    const t2 = performance.now();
    const work = conn.transactionAsync(async (tx) => {
      for (let i = 0; i < records.length; i += 1) {
        const r = records[i];
        await tx.run(
          INSERT,
          r.uid, r.kind, r.scope, r.projectKey, r.text, r.why,
          vectorBlob(vectors[i]), EMB_MODEL, EMB_DIM,
          r.salience, r.confidence, r.pinned ? 1 : 0, r.status,
          r.sourceKind, r.sourceSession,
          r.createdAt, r.updatedAt,
          r.lastInjectedAt, r.injectedCount,
          r.lastUsedAt, r.usefulCount, r.expiresAt,
        );
        await tx.run(
          'INSERT INTO memory_events (memory_id, event, detail, at) VALUES (last_insert_rowid(), ?, ?, ?)',
          'created',
          // Marked as generated: an audit log that let synthetic rows pass for
          // captured ones would make every later question about provenance
          // unanswerable.
          JSON.stringify({ generator: 'build/seed.mjs', seed, index: i, uid: r.uid }),
          r.createdAt,
        );
      }

      for (const r of records) {
        if (!r.supersededByUid) continue;
        await tx.run(
          'UPDATE memories SET superseded_by = (SELECT id FROM memories WHERE uid = ?) WHERE uid = ?',
          r.supersededByUid,
          r.uid,
        );
      }
    });
    try {
      await work.immediate();
    } catch (err) {
      // The one way --keep goes wrong: uids are derived from the seed, so
      // adding the same seed twice collides on every row.
      if (/UNIQUE/i.test(err.message)) {
        throw new Error(
          `${paths.dbPath} already holds the memories seed ${seed} generates. ` +
            'Use a different --seed to add more, or drop --keep to rebuild.',
        );
      }
      throw err;
    }
    const insertMs = performance.now() - t2;

    await conn.exec('PRAGMA foreign_keys = ON');
    const dangling = await conn.get(
      `SELECT count(*) AS n FROM memories m
        WHERE m.superseded_by IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM memories p WHERE p.id = m.superseded_by)`,
    );
    if (dangling.n > 0) {
      throw new Error(`Seed left ${dangling.n} dangling superseded_by references.`);
    }

    // PLAN's bulk-insert note, measured rather than trusted: the same-process
    // query time on either side of the checkpoint.
    const probe = vectors[0];
    const timeQuery = async () => {
      const t = performance.now();
      await conn.all(
        `SELECT id, vector_distance_cos(emb, vector32(?)) AS dist
           FROM memories WHERE status = 'active' ORDER BY dist LIMIT 20`,
        vectorBlob(probe),
      );
      return performance.now() - t;
    };

    const walBefore = fileSize(`${paths.dbPath}-wal`);
    const queryBeforeCheckpointMs = await timeQuery();

    let checkpointMs = null;
    let queryAfterCheckpointMs = null;
    if (doCheckpoint) {
      const t3 = performance.now();
      await checkpoint(conn);
      checkpointMs = performance.now() - t3;
      queryAfterCheckpointMs = await timeQuery();
    }

    const counts = await conn.all(
      'SELECT status, count(*) AS n FROM memories GROUP BY status ORDER BY status',
    );
    const total = await conn.get('SELECT count(*) AS n FROM memories');
    const pinned = await conn.get('SELECT count(*) AS n FROM memories WHERE pinned = 1');
    const globals = await conn.get("SELECT count(*) AS n FROM memories WHERE scope = 'global'");
    const expired = await conn.get(
      'SELECT count(*) AS n FROM memories WHERE expires_at IS NOT NULL AND expires_at <= ?',
      now,
    );
    const superseded = await conn.get('SELECT count(*) AS n FROM memories WHERE superseded_by IS NOT NULL');

    return {
      dbPath: paths.dbPath,
      dataDir: paths.dataDir,
      seed,
      count: total.n,
      requested: count,
      statuses: Object.fromEntries(counts.map((r) => [r.status, r.n])),
      projects: PROJECTS.length,
      pinned: pinned.n,
      globals: globals.n,
      expired: expired.n,
      supersededPairs: superseded.n,
      duplicates: { threshold: DEDUP_THRESHOLD, worst: duplicates.worst, pairs: duplicates.pairs },
      wal: { beforeCheckpointBytes: walBefore, afterCheckpointBytes: fileSize(`${paths.dbPath}-wal`) },
      dbBytes: fileSize(paths.dbPath),
      timings: {
        generateMs,
        embedMs,
        insertMs,
        checkpointMs,
        queryBeforeCheckpointMs,
        queryAfterCheckpointMs,
      },
    };
  } finally {
    await conn.close();
  }
}

// ---------------------------------------------------------------------- cli --

function parseArgs(argv) {
  const opts = { json: false, force: false, reset: true, checkpoint: true };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const value = () => {
      const v = argv[i + 1];
      if (v === undefined) throw new Error(`${arg} needs a value.`);
      i += 1;
      return v;
    };
    switch (arg) {
      case '--count': opts.count = Number(value()); break;
      case '--seed': opts.seed = Number(value()); break;
      case '--data-dir': opts.dataDir = value(); break;
      case '--json': opts.json = true; break;
      case '--force': opts.force = true; break;
      case '--keep': opts.reset = false; break;
      case '--no-checkpoint': opts.checkpoint = false; break;
      case '-h':
      case '--help': opts.help = true; break;
      default: throw new Error(`unknown option '${arg}'.`);
    }
  }
  if (opts.count !== undefined && (!Number.isInteger(opts.count) || opts.count < 1)) {
    throw new Error('--count must be a positive whole number.');
  }
  if (opts.seed !== undefined && !Number.isInteger(opts.seed)) {
    throw new Error('--seed must be a whole number.');
  }
  return opts;
}

const HELP = `seed — build a synthetic mem store for benchmarking

Usage: node build/seed.mjs [--count 200] [--seed <int>] [--data-dir <dir>]
                           [--keep] [--no-checkpoint] [--force] [--json]

  --count N        how many memories (default ${DEFAULT_COUNT})
  --seed N         PRNG seed; the same seed rebuilds the same store
  --data-dir DIR   where to put it (default <dataDir>/seed)
  --keep           add to the existing store instead of rebuilding it
  --no-checkpoint  skip the WAL checkpoint after the bulk insert
  --force          allow writing to the real mem.db
  --json           machine-readable stats`;

const ms = (n) => (n === null || n === undefined ? 'n/a' : `${n.toFixed(1)} ms`);
const mb = (n) => `${(n / 1e6).toFixed(1)} MB`;

async function main(argv) {
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (err) {
    console.error(`seed: ${err.message}`);
    return 1;
  }
  if (opts.help) {
    console.log(HELP);
    return 0;
  }

  const base = resolvePaths();
  const paths = opts.dataDir
    ? { ...base, dataDir: opts.dataDir, dbPath: join(opts.dataDir, 'mem.db') }
    : opts.force
      ? base
      : seedPaths(base);

  let stats;
  try {
    stats = await seedDatabase({
      paths,
      base,
      force: opts.force,
      count: opts.count,
      seed: opts.seed,
      reset: opts.reset,
      doCheckpoint: opts.checkpoint,
    });
  } catch (err) {
    console.error(`seed: ${err.message}`);
    return 1;
  }

  if (opts.json) {
    console.log(JSON.stringify(stats, null, 2));
    return stats.duplicates.pairs.length === 0 ? 0 : 1;
  }

  const t = stats.timings;
  console.log(
    [
      `Seeded ${stats.count} memories into ${stats.dbPath}  (seed ${stats.seed}, ${mb(stats.dbBytes)})`,
      `  status      ${Object.entries(stats.statuses).map(([k, v]) => `${k} ${v}`).join(' · ')}`,
      `  scope       ${stats.globals} global · ${stats.count - stats.globals} across ${stats.projects} projects`,
      `  flags       ${stats.pinned} pinned · ${stats.expired} expired · ${stats.supersededPairs} superseded`,
      `  distinct    worst in-group similarity ${
        stats.duplicates.worst === null ? 'not checked' : stats.duplicates.worst.toFixed(3)
      } (dedup threshold ${stats.duplicates.threshold})`,
      '',
      `  generate    ${ms(t.generateMs)}`,
      `  embed       ${ms(t.embedMs)}   (${stats.count} texts in batches of ${EMBED_BATCH})`,
      `  insert      ${ms(t.insertMs)}`,
      `  query       ${ms(t.queryBeforeCheckpointMs)} before checkpoint · ${ms(t.queryAfterCheckpointMs)} after`,
      `  checkpoint  ${ms(t.checkpointMs)}   wal ${mb(stats.wal.beforeCheckpointBytes)} → ${mb(
        stats.wal.afterCheckpointBytes,
      )}`,
      '',
      `Search it with:  CLAUDE_PLUGIN_DATA=${stats.dataDir} ${join(base.pluginRoot, 'bin', 'mem')} search '${PROBES[0].query}'`,
      ...(stats.duplicates.pairs.length > 0
        ? [
            '',
            `WARNING: ${stats.duplicates.pairs.length} pairs are within the dedup threshold — the write path would have merged them:`,
            ...stats.duplicates.pairs.slice(0, 5).map((p) => `  ${p.similarity.toFixed(3)}  ${p.a}  ||  ${p.b}`),
          ]
        : []),
    ].join('\n'),
  );
  return stats.duplicates.pairs.length === 0 ? 0 : 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = await main(process.argv.slice(2));
}
