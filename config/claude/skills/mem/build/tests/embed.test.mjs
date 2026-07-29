// Embeddings. Uses the real cached model — run `mem warm` first; these tests
// never download, so a cold machine skips rather than hangs on the network.

import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';

import {
  EMB_DIM,
  EMB_MODEL,
  cosine,
  embed,
  embedMany,
  embedStatus,
  loadExtractor,
  modelCached,
  resetExtractor,
  vectorBlob,
} from '../../src/embed.mjs';
import { vectorProbe, withDb } from '../../src/db.mjs';
import { resolvePaths } from '../../src/paths.mjs';

const paths = resolvePaths();
const cached = modelCached(paths);
const needsModel = { skip: cached ? false : `model not cached — run 'mem warm'` };

const scratch = mkdtempSync(join(tmpdir(), 'mem-embed-test-'));
after(() => rmSync(scratch, { recursive: true, force: true }));

const norm = (v) => Math.sqrt(v.reduce((sum, x) => sum + x * x, 0));

describe('embedStatus', () => {
  it('describes the pinned model without loading it', () => {
    const status = embedStatus(paths);
    assert.equal(status.model, EMB_MODEL);
    assert.equal(status.dim, EMB_DIM);
    assert.equal(status.cached, cached);
    assert.ok(status.cacheDir.startsWith(paths.modelsDir));
  });

  it('reports a missing cache instead of throwing', () => {
    const status = embedStatus({ ...paths, modelsDir: join(scratch, 'nope') });
    assert.equal(status.cached, false);
    assert.equal(status.bytes, 0);
    assert.ok(status.files.every((f) => !f.present));
  });
});

describe('offline guard', () => {
  // Must run before anything memoises a real pipeline.
  it('refuses to download when offline and points at `mem warm`', async () => {
    resetExtractor();
    await assert.rejects(
      () => loadExtractor({ paths: { ...paths, modelsDir: join(scratch, 'empty') }, offline: true }),
      /mem warm/,
    );
    resetExtractor();
  });
});

describe('embed', needsModel, () => {
  it('returns a normalised vector of the declared width', async () => {
    const v = await embed('use pnpm, never npm', { offline: true });
    assert.ok(v instanceof Float32Array);
    assert.equal(v.length, EMB_DIM);
    assert.ok(Math.abs(norm(v) - 1) < 1e-5, `expected unit length, got ${norm(v)}`);
  });

  it('is deterministic', async () => {
    const a = await embed('deploy with nix, not docker', { offline: true });
    const b = await embed('deploy with nix, not docker', { offline: true });
    assert.deepEqual(Array.from(a), Array.from(b));
  });

  it('places related text nearer than unrelated text', async () => {
    const [q, near, far] = await embedMany(
      [
        'which package manager should I use?',
        'always use pnpm to install dependencies',
        'the kitchen tap is dripping again',
      ],
      { offline: true },
    );
    assert.ok(cosine(q, near) > cosine(q, far));
    assert.ok(cosine(q, near) > 0.35, 'PLAN gate assumes related text clears ~0.35');
  });

  // Measured, not assumed: the q8 kernel is batch-size sensitive, so a batched
  // vector is *close to* but not equal to the single-call one (0.97-0.99 on
  // short strings). That is well clear of the 0.93 dedup threshold, but it is
  // why the write path embeds one at a time — see embedMany's comment.
  it('batches to near-identical, not identical, vectors', async () => {
    const texts = ['first fact', 'second fact'];
    const batch = await embedMany(texts, { offline: true });
    for (const [i, text] of texts.entries()) {
      const sim = cosine(batch[i], await embed(text, { offline: true }));
      assert.ok(sim > 0.95, `batched vector drifted too far: ${sim}`);
      assert.ok(sim < 1, 'expected batching to perturb the vector at all');
    }

    const [solo] = await embedMany([texts[0]], { offline: true });
    assert.deepEqual(
      Array.from(solo),
      Array.from(await embed(texts[0], { offline: true })),
      'a batch of one must match the single-call vector exactly',
    );
  });

  it('rejects empty text rather than storing a meaningless vector', async () => {
    await assert.rejects(() => embed('', { offline: true }), /empty text/);
    await assert.rejects(() => embed('   ', { offline: true }), /empty text/);
    await assert.rejects(() => embedMany(['ok', ''], { offline: true }), /empty text/);
  });

  it('embedMany([]) does not load the model', async () => {
    assert.deepEqual(await embedMany([]), []);
  });
});

describe('cosine', () => {
  it('scores identical, orthogonal and opposite vectors', () => {
    const a = Float32Array.from([1, 0]);
    assert.equal(cosine(a, a), 1);
    assert.equal(cosine(a, Float32Array.from([0, 1])), 0);
    assert.equal(cosine(a, Float32Array.from([-1, 0])), -1);
    assert.equal(cosine(a, Float32Array.from([0, 0])), 0);
  });

  it('refuses mismatched widths', () => {
    assert.throws(() => cosine(Float32Array.from([1]), Float32Array.from([1, 2])), /mismatch/);
  });
});

describe('vectors in SQL', needsModel, () => {
  it('round-trips through vector32 and ranks the way cosine does', async () => {
    const dbPaths = { ...paths, dbPath: join(scratch, 'probe.db') };
    const facts = [
      ['pnpm', 'always use pnpm to install dependencies'],
      ['nix', 'the machine is managed with nix flakes'],
      ['tap', 'the kitchen tap is dripping again'],
    ];
    const vectors = await embedMany(facts.map(([, text]) => text), { offline: true });
    const query = await embed('what package manager do I use?', { offline: true });

    await withDb(async (conn) => {
      for (const [i, [uid, text]] of facts.entries()) {
        await conn.run(
          'INSERT INTO memories (uid, kind, scope, text, emb, emb_model, emb_dim) VALUES (?,?,?,?,vector32(?),?,?)',
          uid, 'fact', 'global', text, vectorBlob(vectors[i]), EMB_MODEL, EMB_DIM,
        );
      }

      const rows = await vectorProbe(conn, query);
      assert.equal(rows.length, 3);
      assert.equal(rows[0].uid, 'pnpm', 'nearest neighbour should be the package-manager fact');

      // vector_distance_cos is 1 - cosine; agreeing to f32 precision proves the
      // blob encoding is what Turso expects.
      const byUid = new Map(rows.map((r) => [r.uid, r.dist]));
      for (const [i, [uid]] of facts.entries()) {
        assert.ok(Math.abs(1 - cosine(query, vectors[i]) - byUid.get(uid)) < 1e-5);
      }
    }, { paths: dbPaths });
  });
});
