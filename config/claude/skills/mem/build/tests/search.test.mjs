// Hybrid retrieval. The scoring, fusion and tokenising are pure and always run;
// anything that needs a real query vector skips without the cached model, since
// a fake embedding cannot exercise a 0.35 similarity gate.
//
// The similarity numbers asserted below were measured against the real model
// first, not assumed — see the QUERIES table. Pairs near the threshold are
// deliberately not used as fixtures.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { withDb } from '../../src/db.mjs';
import { modelCached } from '../../src/embed.mjs';
import { resolvePaths } from '../../src/paths.mjs';
import {
  DAY_MS,
  HALFLIFE_H0,
  LEXICAL_GATE_COVERAGE,
  MAX_RESULTS,
  MAX_TERMS,
  PINNED_WEIGHT,
  RRF_K,
  STRENGTH_WEIGHT,
  VECTOR_THRESHOLD,
  boostFactor,
  fuse,
  halflifeDays,
  queryTerms,
  rankLexical,
  retention,
  search,
  searchDetail,
  strength,
  tokenise,
} from '../../src/search.mjs';
import { addMemory } from '../../src/write.mjs';

const paths = resolvePaths();
const needsModel = { skip: modelCached(paths) ? false : `model not cached — run 'mem warm'` };

const scratch = mkdtempSync(join(tmpdir(), 'mem-search-test-'));
after(() => rmSync(scratch, { recursive: true, force: true }));

let n = 0;
const scratchPaths = () => ({ ...paths, dbPath: join(scratch, `search-${n++}.db`) });
const ENV = { MEM_PROJECT_KEY: 'test/project-a' };

// The store every integration test searches. Measured query→memory cosines:
//
//   'how do I install dependencies?'   → PNPM     0.534   TESTING  -0.002
//   'what do we use for testing?'      → TESTING  0.430   PNPM      0.021
//   'MEM_PROJECT_KEY'                  → SCOPE    0.766
//   'what is the capital of France?'   → best     0.092
//   'write me a haiku about otters'    → best     0.147
//
// Junk is rejected by a wide margin; nothing here sits near 0.35.
const PNPM = 'always use pnpm to install dependencies';
const TESTING = 'prefer Vitest over Jest for unit tests';
const DEPLOY = 'deploy with nix flakes, not docker images';
const SCOPE = 'set MEM_PROJECT_KEY to override the project scope';
const STAGING = 'the staging database is reset every Monday';
const COMMITS = 'I prefer terse commit messages';

const INSTALL_QUERY = 'how do I install dependencies?';
const TESTING_QUERY = 'what do we use for testing?';
const UNRELATED_QUERY = 'what is the capital of France?';
const OTTERS_QUERY = 'write me a haiku about otters';

describe('tokenise', () => {
  // These expectations mirror fts_match in this Turso build, probed directly.
  // If they drift apart the query terms stop being terms the database can match.
  it('splits on every non-alphanumeric, the way fts_match does', () => {
    assert.deepEqual(tokenise('set MEM_PROJECT_KEY here'), ['set', 'mem', 'project', 'key', 'here']);
    assert.deepEqual(tokenise('pnpm-lock.yaml is committed'), ['pnpm', 'lock', 'yaml', 'is', 'committed']);
    assert.deepEqual(tokenise("don't"), ['don']);
    assert.deepEqual(tokenise('node 22 on NixOS'), ['node', '22', 'on', 'nixos']);
  });

  it('leaves camelCase alone, because fts_match does too', () => {
    assert.deepEqual(tokenise('use getUserById'), ['use', 'getuserbyid']);
  });

  it('drops single characters and survives junk', () => {
    assert.deepEqual(tokenise('a b pnpm'), ['pnpm']);
    assert.deepEqual(tokenise('!!! ??? ---'), []);
    assert.deepEqual(tokenise(''), []);
    assert.deepEqual(tokenise(undefined), []);
  });
});

describe('queryTerms', () => {
  // fts_match does no stopword removal and is a pure OR, so leaving these in
  // matches every memory containing "use" or "this" and the fusion drowns.
  it('drops stopwords and keeps distinctive tokens', () => {
    assert.deepEqual(queryTerms('which package manager does this project use?'), [
      'package',
      'manager',
      'project',
    ]);
    assert.deepEqual(queryTerms(INSTALL_QUERY), ['install', 'dependencies']);
  });

  it('keeps domain words that look like filler', () => {
    for (const word of ['project', 'key', 'test', 'build', 'deploy']) {
      assert.deepEqual(queryTerms(`the ${word}`), [word], `${word} must survive`);
    }
  });

  it('dedupes and caps', () => {
    assert.deepEqual(queryTerms('pnpm pnpm PNPM'), ['pnpm']);
    const long = Array.from({ length: 30 }, (_, i) => `term${i}`).join(' ');
    assert.equal(queryTerms(long).length, MAX_TERMS);
  });

  it('returns nothing for an all-stopword query', () => {
    assert.deepEqual(queryTerms('what is it about?'), []);
  });
});

describe('decay', () => {
  it('matches the halflife curve PLAN specifies', () => {
    assert.equal(halflifeDays(0), HALFLIFE_H0);
    // PLAN: "Used 5×: halflife ≈ 87 days."
    assert.ok(Math.abs(halflifeDays(5) - 87.9) < 0.5, `got ${halflifeDays(5)}`);
    assert.ok(halflifeDays(20) > halflifeDays(5), 'more use must mean more durable');
  });

  it('retains 0.5 at 30 days and 0.25 at 60, unused', () => {
    const now = 1_800_000_000_000;
    const row = (days) => ({ pinned: 0, useful_count: 0, last_used_at: now - days * DAY_MS });
    assert.ok(Math.abs(retention(row(30), now) - 0.5) < 1e-9);
    assert.ok(Math.abs(retention(row(60), now) - 0.25) < 1e-9);
    assert.ok(Math.abs(retention(row(0), now) - 1) < 1e-9);
  });

  it('never decays a pinned memory', () => {
    const now = 1_800_000_000_000;
    assert.equal(
      retention({ pinned: 1, useful_count: 0, last_used_at: now - 3650 * DAY_MS }, now),
      1,
    );
  });

  // Otherwise "never used" and "used a moment ago" would score identically.
  it('decays an unused memory from when it was last written', () => {
    const now = 1_800_000_000_000;
    const written = { pinned: 0, useful_count: 0, last_used_at: null, updated_at: now - 30 * DAY_MS };
    assert.ok(Math.abs(retention(written, now) - 0.5) < 1e-9);
  });

  it('multiplies salience, retention and confidence', () => {
    const now = 1_800_000_000_000;
    const row = { salience: 0.8, confidence: 0.5, pinned: 1, useful_count: 0, last_used_at: now };
    assert.ok(Math.abs(strength(row, now) - 0.4) < 1e-9);
  });
});

describe('boostFactor', () => {
  const now = 1_800_000_000_000;

  it('follows 1 + 0.3·strength + 0.2·pinned', () => {
    const fresh = { salience: 1, confidence: 1, pinned: 0, useful_count: 0, last_used_at: now };
    assert.ok(Math.abs(boostFactor(fresh, now) - (1 + STRENGTH_WEIGHT)) < 1e-9);

    const pinned = { ...fresh, pinned: 1 };
    assert.ok(Math.abs(boostFactor(pinned, now) - (1 + STRENGTH_WEIGHT + PINNED_WEIGHT)) < 1e-9);
  });

  // Retention already lives inside strength; multiplying a recency term in again
  // would square the decay and bury month-old memories that are still right.
  it('applies decay once, not twice', () => {
    const base = { salience: 1, confidence: 1, pinned: 0, useful_count: 0 };
    const old = boostFactor({ ...base, last_used_at: now - 30 * DAY_MS }, now);
    assert.ok(Math.abs(old - (1 + STRENGTH_WEIGHT * 0.5)) < 1e-9, `got ${old}`);
  });

  it('ranks a stale memory below a fresh one', () => {
    const base = { salience: 0.5, confidence: 0.5, pinned: 0, useful_count: 0 };
    assert.ok(
      boostFactor({ ...base, last_used_at: now }, now) >
        boostFactor({ ...base, last_used_at: now - 90 * DAY_MS }, now),
    );
  });
});

describe('fuse', () => {
  it('sums 1/(k + rank) across the legs', () => {
    const fused = fuse({ vector: [3, 1], lexical: [1, 2] });
    assert.ok(Math.abs(fused.get(1).rrf - (1 / (RRF_K + 2) + 1 / (RRF_K + 1))) < 1e-12);
    assert.ok(Math.abs(fused.get(3).rrf - 1 / (RRF_K + 1)) < 1e-12);
    assert.deepEqual(fused.get(1).ranks, { vector: 2, lexical: 1 });
    assert.deepEqual(fused.get(2).ranks, { lexical: 2 });
  });

  it('ranks an item both legs agree on above either leg is top', () => {
    const fused = fuse({ vector: [1, 2], lexical: [2, 1] });
    assert.ok(fused.get(2).rrf > 1 / (RRF_K + 1), 'agreement must beat a single first place');
  });

  it('handles empty legs', () => {
    assert.equal(fuse({ vector: [], lexical: [] }).size, 0);
  });
});

describe('rankLexical', () => {
  const rows = [
    { id: 1, text: 'always use pnpm to install dependencies' },
    { id: 2, text: 'run the test suite before pushing' },
    { id: 3, text: 'test the build output' },
    { id: 4, text: 'test everything twice' },
  ];

  // The whole reason the lexical leg exists: a rare identifier the embedding
  // model represents badly must outrank a word half the store contains.
  it('scores by IDF mass, so a rare term beats a common one', () => {
    const ranked = rankLexical(rows, ['pnpm', 'test'], 10);
    assert.equal(ranked[0].id, 1, 'the row with the rare term must come first');
    assert.ok(ranked[0].coverage > ranked[1].coverage);
    assert.deepEqual(ranked.map((r) => r.id), [1, 2, 3, 4]);
    assert.deepEqual(ranked[0].terms, ['pnpm']);
  });

  it('gives a row matching every term full coverage', () => {
    const ranked = rankLexical([{ id: 9, text: 'pnpm test' }, ...rows], ['pnpm', 'test'], 10);
    assert.equal(ranked[0].id, 9);
    assert.ok(Math.abs(ranked[0].coverage - 1) < 1e-12);
  });

  it('drops rows that match nothing and copes with no terms', () => {
    assert.deepEqual(rankLexical(rows, ['kubernetes'], 10), []);
    assert.deepEqual(rankLexical(rows, [], 10), []);
    assert.deepEqual(rankLexical([], ['pnpm'], 10), []);
  });

  it('breaks ties by id so the same store answers identically', () => {
    const ranked = rankLexical(rows, ['test'], 10);
    assert.deepEqual(ranked.map((r) => r.id), [2, 3, 4]);
  });
});

describe('search', needsModel, () => {
  let dbPaths;

  before(async () => {
    dbPaths = scratchPaths();
    const seed = (text, over = {}) =>
      addMemory({ text, ...over }, { paths: dbPaths, env: ENV, now: 1_750_000_000_000 });

    await seed(PNPM, { kind: 'preference' });
    await seed(TESTING);
    await seed(DEPLOY);
    await seed(SCOPE);
    await seed(STAGING);
    await seed(COMMITS, { scope: 'global', pinned: true });
  });

  const find = (query, opts = {}) =>
    searchDetail(query, { paths: dbPaths, env: ENV, now: 1_750_000_000_000, ...opts });

  it('finds the memory a query is actually about', async () => {
    const { results, terms } = await find(INSTALL_QUERY);
    assert.equal(results.length, 1);
    assert.equal(results[0].text, PNPM);
    assert.ok(results[0].similarity > VECTOR_THRESHOLD);
    assert.deepEqual(terms, ['install', 'dependencies']);
  });

  // Two different questions over the same store must not answer the same way —
  // the trap being a retrieval that returns its favourite memory regardless.
  it('answers a different question with a different memory', async () => {
    const { results } = await find(TESTING_QUERY);
    assert.equal(results.length, 1);
    assert.equal(results[0].text, TESTING);
  });

  // PLAN phase 3: "injects nothing on prompts unrelated to any stored memory —
  // this is the test that matters most." Five stale half-relevant facts on every
  // prompt is how a memory system fails.
  it('returns nothing at all when nothing is relevant', async () => {
    for (const query of [UNRELATED_QUERY, OTTERS_QUERY]) {
      assert.deepEqual(await search(query, { paths: dbPaths, env: ENV }), [], `leaked on: ${query}`);
    }
  });

  it('reports what it rejected, so a threshold can be tuned', async () => {
    const { results, stats } = await find(UNRELATED_QUERY);
    assert.equal(results.length, 0);
    assert.equal(stats.gated, stats.fused, 'everything considered was rejected');
    assert.ok(stats.candidates >= 6);
    assert.equal(stats.threshold, VECTOR_THRESHOLD);
  });

  it('unions globals with this project and no other', async () => {
    const mine = await find(INSTALL_QUERY);
    assert.equal(mine.stats.candidates, 6, '5 project + 1 global');

    const elsewhere = await find(INSTALL_QUERY, { env: { MEM_PROJECT_KEY: 'test/project-b' } });
    assert.equal(elsewhere.stats.candidates, 1, 'another project sees only the global');
    assert.deepEqual(elsewhere.results, []);

    const globals = await find(INSTALL_QUERY, { scope: 'global' });
    assert.equal(globals.stats.candidates, 1);
  });

  // Embeddings represent rare identifiers worst, which is exactly where a
  // literal token match has to carry the result.
  it('rescues an identifier through the lexical leg alone', async () => {
    // vectorLimit 1 leaves only the single closest row in the vector leg, so a
    // hit on MEM_PROJECT_KEY can only have arrived lexically.
    const { results } = await find('MEM_PROJECT_KEY', { vectorLimit: 1, threshold: 0.99 });
    const hit = results.find((r) => r.text === SCOPE);
    assert.ok(hit, 'the identifier match must survive an impossible vector gate');
    assert.ok(hit.coverage >= LEXICAL_GATE_COVERAGE);
    assert.deepEqual(hit.terms, ['mem', 'project', 'key']);
  });

  // With OR semantics one shared common word is not evidence of anything.
  it('does not let a single common word clear the gate', async () => {
    const { results } = await find('what should I prefer for my commit workflow?', {
      threshold: 0.99,
    });
    assert.deepEqual(results, [], 'a bare "prefer"/"commit" overlap must not pass');
  });

  it('caps at five even when everything qualifies', async () => {
    const { results } = await find(INSTALL_QUERY, { gate: false });
    assert.equal(results.length, MAX_RESULTS);
    const scores = results.map((r) => r.score);
    assert.deepEqual(scores, [...scores].sort((a, b) => b - a), 'must come back ranked');
  });

  it('honours an explicit limit', async () => {
    assert.equal((await find(INSTALL_QUERY, { gate: false, limit: 2 })).results.length, 2);
  });

  // The gate is a disjunction — PLAN: "vector-sim >= ~0.35 *or* an exact lexical
  // hit" — so tightening one leg alone does not empty the results, and a test
  // that assumed it did was asserting the wrong shape.
  it('lets either leg alone clear the gate', async () => {
    const vectorOnly = await find(INSTALL_QUERY, { threshold: 0.99 });
    assert.equal(vectorOnly.results.length, 1, 'the lexical hit survives an impossible vector gate');
    assert.ok(vectorOnly.results[0].coverage >= LEXICAL_GATE_COVERAGE);

    const lexicalOnly = await find(INSTALL_QUERY, { coverage: 1.01 });
    assert.equal(lexicalOnly.results.length, 1, 'the vector hit survives an impossible lexical gate');
    assert.ok(lexicalOnly.results[0].similarity >= VECTOR_THRESHOLD);

    assert.deepEqual(
      (await find(INSTALL_QUERY, { threshold: 0.99, coverage: 1.01 })).results,
      [],
      'closing both legs must return nothing',
    );
  });

  it('ranks a pinned memory above an identical unpinned one', async () => {
    const { results } = await find(INSTALL_QUERY, { gate: false });
    const pinned = results.find((r) => r.pinned === 1);
    assert.ok(pinned, 'the pinned global should be in an ungated result set');
    assert.ok(pinned.boost > 1 + PINNED_WEIGHT * 0.5);
  });

  it('never returns a staged memory unless asked', async () => {
    const staged = scratchPaths();
    await addMemory({ text: PNPM, status: 'staged' }, { paths: staged, env: ENV });

    assert.deepEqual(await search(INSTALL_QUERY, { paths: staged, env: ENV }), []);
    const queued = await searchDetail(INSTALL_QUERY, {
      paths: staged,
      env: ENV,
      statuses: ['staged'],
    });
    assert.equal(queued.results.length, 1);
  });

  // TTL expiry is a scheduled maintenance job; between two runs an expired row
  // is still status='active', and injecting a fact the user gave a lifetime to
  // is an error nobody would notice.
  it('never returns an expired memory', async () => {
    const expiring = scratchPaths();
    const now = 1_750_000_000_000;
    await addMemory(
      { text: PNPM, expiresAt: now - DAY_MS },
      { paths: expiring, env: ENV, now: now - 2 * DAY_MS },
    );

    await withDb(async (conn) => {
      assert.equal((await conn.get('SELECT count(*) AS n FROM memories')).n, 1);
    }, { paths: expiring, env: ENV });

    const { results, stats } = await searchDetail(INSTALL_QUERY, { paths: expiring, env: ENV, now });
    assert.equal(stats.candidates, 0, 'an expired row is not even a candidate');
    assert.deepEqual(results, []);
  });

  it('refuses an empty query rather than returning the whole store', async () => {
    await assert.rejects(() => search('   ', { paths: dbPaths, env: ENV }), /empty query/);
  });

  it('works on a query with no lexical terms at all', async () => {
    const { terms, results } = await find('what is it about?');
    assert.deepEqual(terms, []);
    assert.ok(Array.isArray(results), 'the vector leg must still run');
  });
});

describe('mem search', needsModel, () => {
  const home = mkdtempSync(join(tmpdir(), 'mem-search-cli-'));
  after(() => rmSync(home, { recursive: true, force: true }));
  symlinkSync(paths.nodeModulesDir, join(home, 'node_modules'));
  symlinkSync(paths.modelsDir, join(home, 'models'));

  const cli = (...argv) =>
    spawnSync(process.execPath, [join(paths.pluginRoot, 'bin', 'mem'), ...argv], {
      encoding: 'utf8',
      env: {
        ...process.env,
        CLAUDE_PLUGIN_DATA: home,
        MEM_PROJECT_KEY: 'test/cli-search',
        MEM_NO_INSTALL: '1',
      },
    });

  before(() => {
    for (const text of [PNPM, TESTING, DEPLOY, SCOPE]) {
      const out = cli('add', text);
      assert.equal(out.status, 0, out.stderr);
    }
  });

  it('prints the memory it found', () => {
    const out = cli('search', INSTALL_QUERY);
    assert.equal(out.status, 0, out.stderr);
    assert.match(out.stdout, /^1 memory for/);
    assert.match(out.stdout, new RegExp(PNPM));
    // Score, kind and scope in that order — but NOT a particular score band.
    // What counts as a high cosine is the embedding model's geometry (0.5x under
    // all-MiniLM, 0.8x under gte-small), so pinning digits here makes a model
    // swap look like a formatting regression.
    assert.match(out.stdout, /#\d+ {2}0\.\d\d {2}\w+ {2}project test\/cli-search/);
  });

  // A hook asks on every prompt; "nothing matched" is the designed answer, and
  // a non-zero exit would make it look like a failure most of the time.
  it('exits 0 and says so when nothing clears the gate', () => {
    const out = cli('search', UNRELATED_QUERY);
    assert.equal(out.status, 0, out.stderr);
    assert.match(out.stdout, /Nothing relevant to "what is the capital of France\?"/);
    assert.match(out.stdout, /fell below the gate/);
  });

  it('emits JSON with the diagnostics a tuning run needs', () => {
    const out = cli('search', INSTALL_QUERY, '--json');
    assert.equal(out.status, 0, out.stderr);
    const parsed = JSON.parse(out.stdout);
    assert.equal(parsed.count, 1);
    assert.deepEqual(parsed.terms, ['install', 'dependencies']);
    assert.equal(parsed.results[0].text, PNPM);
    assert.equal(parsed.results[0].emb, undefined, 'the blob has no business in --json');
    assert.ok(parsed.results[0].similarity > VECTOR_THRESHOLD);
    assert.equal(parsed.stats.threshold, VECTOR_THRESHOLD);
    assert.equal(parsed.stats.projectKey, 'test/cli-search');
  });

  it('returns an empty result set as JSON, not an error', () => {
    const out = cli('search', OTTERS_QUERY, '--json');
    assert.equal(out.status, 0, out.stderr);
    const parsed = JSON.parse(out.stdout);
    assert.equal(parsed.count, 0);
    assert.deepEqual(parsed.results, []);
  });

  it('shows the legs under --explain', () => {
    const out = cli('search', 'MEM_PROJECT_KEY', '--explain');
    assert.equal(out.status, 0, out.stderr);
    assert.match(out.stdout, /rrf 0\.\d+ \(vector #1, lexical #1\)/);
    assert.match(out.stdout, /terms mem\/project\/key/);
  });

  it('honours --limit and --no-gate', () => {
    const out = cli('search', INSTALL_QUERY, '--no-gate', '--limit', '3', '--json');
    assert.equal(out.status, 0, out.stderr);
    assert.equal(JSON.parse(out.stdout).count, 3);
  });

  it('rejects a bad flag rather than searching for it', () => {
    const unknown = cli('search', 'pnpm', '--limt', '3');
    assert.equal(unknown.status, 1);
    assert.match(unknown.stderr, /unknown option '--limt'/);

    assert.match(cli('search').stderr, /nothing to search for/);
    assert.equal(cli('search').status, 1);
    assert.match(cli('search', 'x', '--limit', '0').stderr, /positive whole number/);
  });
});
