// Export and import.
//
// The serialisation half is pure and always runs. The import half re-embeds, so
// it needs the cached model and skips without it — which is itself the design:
// export and dry-run import work offline, a real import does not.
//
// The test that matters is `export -> import -> export` coming back
// byte-identical. Everything else is a way of making that one honest: field
// order, omitted nulls, deterministic row order, and supersession pointers
// travelling as uids rather than as ids that mean nothing in another database.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { withDb } from '../../src/db.mjs';
import { EMB_DIM, EMB_MODEL, modelCached } from '../../src/embed.mjs';
import { resolvePaths } from '../../src/paths.mjs';
import {
  EXPORT_FIELDS,
  exportJsonl,
  importJsonl,
  normaliseRecord,
  parse,
  serialise,
  toRecord,
} from '../../src/transfer.mjs';
import { addMemory } from '../../src/write.mjs';

const paths = resolvePaths();
const needsModel = { skip: modelCached(paths) ? false : `model not cached — run 'mem warm'` };

const scratch = mkdtempSync(join(tmpdir(), 'mem-transfer-test-'));
after(() => rmSync(scratch, { recursive: true, force: true }));

let n = 0;
const scratchPaths = () => ({ ...paths, dbPath: join(scratch, `transfer-${n++}.db`) });
const ENV = { MEM_PROJECT_KEY: 'test/project-a' };
const NOW = 1_750_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

const ROW = {
  uid: 'aaaa1111-0000-4000-8000-000000000001',
  kind: 'preference',
  scope: 'project',
  project_key: 'test/project-a',
  status: 'active',
  pinned: 0,
  text: 'always use pnpm to install dependencies',
  why: null,
  salience: 0.5,
  confidence: 0.75,
  source_kind: 'user',
  source_session: null,
  created_at: NOW - 10 * DAY,
  updated_at: NOW - DAY,
  last_injected_at: null,
  injected_count: 0,
  last_used_at: null,
  useful_count: 2,
  expires_at: null,
  consolidated_at: null,
  superseded_uid: null,
};

describe('the record format', () => {
  it('omits nulls and keeps a fixed field order', () => {
    const record = toRecord(ROW);
    assert.deepEqual(Object.keys(record), [
      'uid', 'kind', 'scope', 'project_key', 'status', 'pinned', 'text',
      'salience', 'confidence', 'source_kind',
      'created_at', 'updated_at', 'injected_count', 'useful_count',
    ]);
    assert.equal('why' in record, false, 'a null field is absent, not null');
  });

  // The embedding is derivable and would dwarf the text; the id means nothing in
  // another database. Both being absent is what makes the file portable.
  it('carries neither the embedding nor the per-database id', () => {
    for (const field of ['id', 'emb', 'emb_model', 'emb_dim', 'superseded_by']) {
      assert.equal(EXPORT_FIELDS.includes(field), false, `${field} must not be exported`);
    }
    assert.equal(EXPORT_FIELDS.includes('superseded_uid'), true);
    assert.equal(toRecord({ ...ROW, emb: 'blob', id: 7 }).emb, undefined);
  });

  it('round-trips through JSONL unchanged', () => {
    const text = serialise([toRecord(ROW), toRecord({ ...ROW, uid: 'b', why: 'because' })]);
    assert.equal(text.split('\n').length - 1, 2, 'one line per record, trailing newline');
    const parsed = parse(text);
    assert.deepEqual(parsed[0].record, toRecord(ROW));
    assert.equal(parsed[1].line, 2);
    assert.equal(serialise(parsed.map((p) => p.record)), text);
  });

  it('skips blank lines and names the line that is broken', () => {
    assert.equal(parse('\n\n').length, 0);
    assert.equal(parse(`${serialiseOne()}\n\n${serialiseOne()}`).length, 2);
    assert.throws(() => parse('{"uid":"a"}\nnot json\n'), /Line 2 is not valid JSON/);
    assert.throws(() => parse('[1,2]'), /Line 1 is not a JSON object/);
  });

  function serialiseOne() {
    return JSON.stringify(toRecord(ROW));
  }
});

describe('normaliseRecord', () => {
  it('fills in every default a hand-written line can omit', () => {
    const r = normaliseRecord({ text: 'a bare fact' }, { now: NOW });
    assert.equal(r.kind, 'fact');
    assert.equal(r.status, 'active');
    assert.equal(r.scope, 'global', 'no project_key means global');
    assert.equal(r.projectKey, null);
    assert.equal(r.salience, 0.5);
    assert.equal(r.confidence, 0.5);
    assert.equal(r.sourceKind, 'import');
    assert.equal(r.createdAt, NOW);
    assert.equal(r.updatedAt, NOW);
    assert.equal(r.injectedCount, 0);
    assert.equal(r.generatedUid, true, 'a record with no uid gets one');
    assert.match(r.uid, /^[0-9a-f-]{36}$/);
  });

  it('infers project scope from the project_key', () => {
    const r = normaliseRecord({ text: 'x', project_key: 'test/p' });
    assert.equal(r.scope, 'project');
    assert.equal(r.projectKey, 'test/p');
  });

  // The retrieval clause `scope = 'global' OR project_key = ?` depends on a
  // global memory storing NULL, so a contradictory pair cannot be tolerated.
  it('holds scope and project_key consistent', () => {
    assert.equal(normaliseRecord({ text: 'x', scope: 'global', project_key: 'p' }).projectKey, null);
    assert.throws(() => normaliseRecord({ text: 'x', scope: 'project' }), /needs one/);
  });

  it('accepts every status, unlike the add path', () => {
    for (const status of ['staged', 'active', 'archived', 'superseded']) {
      assert.equal(normaliseRecord({ text: 'x', status }).status, status);
    }
  });

  it('names the line when a field is wrong', () => {
    const bad = (record) => () => normaliseRecord(record, { line: 7 });
    assert.throws(bad({ text: 'x', kind: 'preferences' }), /Line 7: Unknown kind/);
    assert.throws(bad({ text: 'x', status: 'deleted' }), /Line 7: Unknown status/);
    assert.throws(bad({ text: 'x', salience: 2 }), /Line 7: salience must be/);
    assert.throws(bad({ text: '   ' }), /Line 7: a record needs non-empty text/);
    assert.throws(bad({ text: 'x', useful_count: -1 }), /non-negative whole number/);
    assert.throws(bad({ text: 'x', created_at: 'yesterday' }), /epoch-millisecond/);
  });

  // An import file is the easiest way to smuggle a credential past the write
  // path's scrubber, so it gets the same guard.
  it('refuses a credential', () => {
    assert.throws(
      () => normaliseRecord({ text: 'the key is sk-ant-api03-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' }, { env: {} }),
      (err) => {
        assert.equal(err.code, 'MEM_SECRET_DETECTED');
        return true;
      },
    );
  });
});

describe('export', () => {
  const dbPaths = scratchPaths();

  before(async () => {
    await withDb(async (conn) => {
      const insert = async (row, i) => {
        const v = new Float32Array(EMB_DIM).fill(0.1 * (i + 1));
        const info = await conn.run(
          `INSERT INTO memories (uid, kind, scope, project_key, text, why, emb, emb_model, emb_dim,
                                 salience, confidence, pinned, status, source_kind,
                                 created_at, updated_at, injected_count, useful_count, expires_at)
           VALUES (?,?,?,?,?,?, vector32(?), ?,?,?,?,?,?,?,?,?,?,?,?)`,
          row.uid, row.kind ?? 'fact', row.scope ?? 'project', row.project_key ?? 'test/project-a',
          row.text, row.why ?? null, Buffer.from(v.buffer), EMB_MODEL, EMB_DIM,
          row.salience ?? 0.5, row.confidence ?? 0.5, row.pinned ?? 0, row.status ?? 'active',
          'user', row.created_at ?? NOW, row.updated_at ?? NOW, 0, 0, row.expires_at ?? null,
        );
        return info.lastInsertRowid;
      };

      const older = await insert({ uid: 'old', text: 'we used yarn', status: 'superseded', created_at: NOW - DAY }, 0);
      const newer = await insert({ uid: 'new', text: 'we use pnpm now', created_at: NOW }, 1);
      await insert({ uid: 'arch', text: 'the old staging box', status: 'archived', created_at: NOW + DAY }, 2);
      await insert({ uid: 'glob', text: 'terse commits', scope: 'global', project_key: null, created_at: NOW + 2 * DAY }, 3);
      await conn.run('UPDATE memories SET superseded_by = ? WHERE id = ?', newer, older);
    }, { paths: dbPaths, env: ENV });
  });

  // A backup that quietly omits what retrieval hides is worse than no backup.
  it('exports everything by default, archived and superseded included', async () => {
    const { records, count } = await exportJsonl({ paths: dbPaths, env: ENV });
    assert.equal(count, 4);
    assert.deepEqual(records.map((r) => r.status).sort(), ['active', 'active', 'archived', 'superseded']);
  });

  it('orders by created_at, not by id', async () => {
    const { records } = await exportJsonl({ paths: dbPaths, env: ENV });
    assert.deepEqual(records.map((r) => r.uid), ['old', 'new', 'arch', 'glob']);
  });

  // ids are per-database autoincrements. Exported as integers they would point
  // at an unrelated memory after a restore, which is worse than losing the link.
  it('exports supersession as a uid', async () => {
    const { records } = await exportJsonl({ paths: dbPaths, env: ENV });
    const superseded = records.find((r) => r.uid === 'old');
    assert.equal(superseded.superseded_uid, 'new');
    assert.equal('superseded_by' in superseded, false);
  });

  it('takes the same filters as list', async () => {
    const active = await exportJsonl({ paths: dbPaths, env: ENV, statuses: ['active'] });
    assert.equal(active.count, 2);

    const globals = await exportJsonl({ paths: dbPaths, env: ENV, scope: 'global' });
    assert.deepEqual(globals.records.map((r) => r.uid), ['glob']);
  });

  it('ends every line, including the last', async () => {
    const { text } = await exportJsonl({ paths: dbPaths, env: ENV });
    assert.equal(text.endsWith('\n'), true);
    assert.equal(text.includes('\n\n'), false);
  });
});

describe('import', needsModel, () => {
  const seedStore = async (dbPaths) => {
    const add = (input) => addMemory(input, { paths: dbPaths, env: ENV, now: NOW });
    await add({ text: 'always use pnpm to install dependencies', kind: 'preference', why: 'the lockfile is pnpm\'s' });
    await add({ text: 'prefer Vitest over Jest for unit tests', salience: 0.8 });
    await add({ text: 'I prefer terse commit messages', scope: 'global', pinned: true });
    await add({ text: 'this sprint ends on Friday', expiresAt: NOW + 7 * DAY });
    await add({ text: 'auto-captured, not reviewed yet', status: 'staged', sourceKind: 'auto' });
    await withDb(async (conn) => {
      await conn.run("UPDATE memories SET status = 'archived' WHERE id = 2");
      await conn.run('UPDATE memories SET superseded_by = 1 WHERE id = 2');
    }, { paths: dbPaths, env: ENV });
  };

  // PLAN phase 1 exit test: "export | import round-trips byte-identically".
  it('round-trips byte-identically through a fresh database', async () => {
    const source = scratchPaths();
    const restored = scratchPaths();
    await seedStore(source);

    const first = await exportJsonl({ paths: source, env: ENV });
    const result = await importJsonl(first.text, { paths: restored, env: ENV, now: NOW });
    assert.equal(result.inserted, 5);
    assert.equal(result.skipped, 0);
    assert.deepEqual(result.invalid, []);

    const second = await exportJsonl({ paths: restored, env: ENV });
    assert.equal(second.text, first.text);
  });

  it('restores the supersession link through uids', async () => {
    const source = scratchPaths();
    const restored = scratchPaths();
    await seedStore(source);

    const { text } = await exportJsonl({ paths: source, env: ENV });
    const result = await importJsonl(text, { paths: restored, env: ENV, now: NOW });
    assert.equal(result.linked, 1);

    await withDb(async (conn) => {
      const row = await conn.get(
        'SELECT m.uid AS uid, s.uid AS target FROM memories m JOIN memories s ON s.id = m.superseded_by',
      );
      assert.equal(row.target, (await conn.get("SELECT uid FROM memories WHERE text LIKE 'always use pnpm%'")).uid);
      assert.ok(row.uid);
    }, { paths: restored, env: ENV });
  });

  it('preserves status, timestamps, counters and pins', async () => {
    const source = scratchPaths();
    const restored = scratchPaths();
    await seedStore(source);
    const { text } = await exportJsonl({ paths: source, env: ENV });
    await importJsonl(text, { paths: restored, env: ENV, now: NOW + 99 * DAY });

    await withDb(async (conn) => {
      const rows = await conn.all('SELECT * FROM memories ORDER BY id');
      assert.deepEqual(rows.map((r) => r.status).sort(), ['active', 'active', 'active', 'archived', 'staged']);
      assert.equal(rows.every((r) => r.created_at === NOW), true, 'created_at comes from the file');
      assert.equal(rows.filter((r) => r.pinned === 1).length, 1);
      assert.equal(rows.filter((r) => r.scope === 'global').length, 1);
      assert.equal(rows.find((r) => r.scope === 'global').project_key, null);
      assert.equal(rows.filter((r) => r.expires_at !== null).length, 1);
      assert.equal(rows.every((r) => r.emb_model === EMB_MODEL), true, 'rows are stamped with today s model');
    }, { paths: restored, env: ENV });
  });

  // Re-importing must not be a way to double the store, and must not merge two
  // memories into one either — uid is the key, not cosine distance.
  it('skips uids it already has, and does not semantically dedup', async () => {
    const dbPaths = scratchPaths();
    await seedStore(dbPaths);
    const { text } = await exportJsonl({ paths: dbPaths, env: ENV });

    const again = await importJsonl(text, { paths: dbPaths, env: ENV, now: NOW });
    assert.equal(again.inserted, 0);
    assert.equal(again.skipped, 5);

    // Same text, different uid: the add path would merge this at 1.0 cosine.
    const twin = JSON.stringify({
      uid: 'twin-0000-4000-8000-000000000001',
      text: 'always use pnpm to install dependencies',
      project_key: 'test/project-a',
    });
    const result = await importJsonl(`${twin}\n`, { paths: dbPaths, env: ENV, now: NOW });
    assert.equal(result.inserted, 1, 'an import restores rows, it does not merge them');

    const after = await exportJsonl({ paths: dbPaths, env: ENV });
    assert.equal(after.count, 6);
  });

  it('overwrites an existing uid only when asked', async () => {
    const dbPaths = scratchPaths();
    await seedStore(dbPaths);
    const { records } = await exportJsonl({ paths: dbPaths, env: ENV });
    // By text, not by position: the export orders by (created_at, uid) and the
    // fixtures share a created_at, so position here is uid order.
    const original = records.find((r) => r.text.startsWith('always use pnpm'));
    const edited = { ...original, text: 'always use pnpm, never npm', confidence: 0.9 };

    const skipped = await importJsonl(`${JSON.stringify(edited)}\n`, { paths: dbPaths, env: ENV });
    assert.equal(skipped.updated, 0);
    assert.equal(skipped.skipped, 1);

    const updated = await importJsonl(`${JSON.stringify(edited)}\n`, {
      paths: dbPaths,
      env: ENV,
      mode: 'update',
    });
    assert.equal(updated.updated, 1);

    await withDb(async (conn) => {
      const row = await conn.get('SELECT text, confidence FROM memories WHERE uid = ?', edited.uid);
      assert.equal(row.text, 'always use pnpm, never npm');
      assert.equal(row.confidence, 0.9);
      const event = await conn.get(
        "SELECT detail FROM memory_events WHERE event = 'updated' ORDER BY id DESC LIMIT 1",
      );
      assert.match(JSON.parse(event.detail).previous.text, /^always use pnpm to install/);
    }, { paths: dbPaths, env: ENV });
  });

  // A file that fails halfway leaves a store nobody can describe.
  it('imports nothing at all when a record is invalid', async () => {
    const dbPaths = scratchPaths();
    const lines = [
      JSON.stringify({ uid: 'ok-1', text: 'a good record', project_key: 'test/project-a' }),
      JSON.stringify({ uid: 'bad', text: 'a bad one', kind: 'nonsense' }),
    ].join('\n');

    await assert.rejects(() => importJsonl(lines, { paths: dbPaths, env: ENV }), (err) => {
      assert.match(err.message, /Line 2: Unknown kind/);
      assert.equal(err.invalid.length, 1);
      return true;
    });
    assert.equal((await exportJsonl({ paths: dbPaths, env: ENV })).count, 0);

    const forced = await importJsonl(lines, { paths: dbPaths, env: ENV, skipInvalid: true });
    assert.equal(forced.inserted, 1);
    assert.equal(forced.invalid.length, 1);
  });

  it('refuses a file that repeats a uid', async () => {
    const line = JSON.stringify({ uid: 'same', text: 'once', project_key: 'test/project-a' });
    await assert.rejects(
      () => importJsonl(`${line}\n${line}\n`, { paths: scratchPaths(), env: ENV }),
      /appears more than once/,
    );
  });

  it('reports an unresolvable supersession instead of guessing', async () => {
    const dbPaths = scratchPaths();
    const line = JSON.stringify({
      uid: 'orphan',
      text: 'superseded by something that is not here',
      project_key: 'test/project-a',
      superseded_uid: 'missing',
    });
    const result = await importJsonl(`${line}\n`, { paths: dbPaths, env: ENV });
    assert.equal(result.inserted, 1);
    assert.equal(result.linked, 0);
    assert.deepEqual(result.unresolved, [{ uid: 'orphan', superseded_uid: 'missing' }]);
  });
});

// Validation must work with no model and no network, since that is most of what
// makes it useful before a restore.
describe('import --dry-run', () => {
  it('validates a file without writing or embedding anything', async () => {
    const dbPaths = scratchPaths();
    const lines = [
      JSON.stringify({ uid: 'd1', text: 'one', project_key: 'test/project-a' }),
      JSON.stringify({ uid: 'd2', text: 'two' }),
    ].join('\n');

    const result = await importJsonl(lines, { paths: dbPaths, env: ENV, dryRun: true });
    assert.equal(result.dryRun, true);
    assert.equal(result.inserted, 2);
    assert.equal((await exportJsonl({ paths: dbPaths, env: ENV })).count, 0, 'nothing was written');
  });

  it('still reports what is wrong', async () => {
    await assert.rejects(
      () => importJsonl('{"text":"x","status":"gone"}', { paths: scratchPaths(), env: ENV, dryRun: true }),
      /Unknown status/,
    );
  });
});

describe('mem export | mem import', needsModel, () => {
  const home = mkdtempSync(join(tmpdir(), 'mem-transfer-cli-'));
  const target = mkdtempSync(join(tmpdir(), 'mem-transfer-cli2-'));
  after(() => {
    rmSync(home, { recursive: true, force: true });
    rmSync(target, { recursive: true, force: true });
  });
  symlinkSync(paths.nodeModulesDir, join(home, 'node_modules'));
  symlinkSync(paths.modelsDir, join(home, 'models'));
  symlinkSync(paths.nodeModulesDir, join(target, 'node_modules'));
  symlinkSync(paths.modelsDir, join(target, 'models'));

  const run = (dataDir, argv, input) =>
    spawnSync(process.execPath, [join(paths.pluginRoot, 'bin', 'mem'), ...argv], {
      encoding: 'utf8',
      input,
      env: {
        ...process.env,
        CLAUDE_PLUGIN_DATA: dataDir,
        MEM_PROJECT_KEY: 'test/cli-transfer',
        MEM_NO_INSTALL: '1',
      },
    });

  before(() => {
    for (const text of [
      'always use pnpm to install dependencies',
      'deploy with nix flakes, not docker images',
      'I prefer terse commit messages',
    ]) {
      const out = run(home, ['add', text]);
      assert.equal(out.status, 0, out.stderr);
    }
  });

  it('writes JSONL to stdout, one object per line', () => {
    const out = run(home, ['export']);
    assert.equal(out.status, 0, out.stderr);
    const lines = out.stdout.trim().split('\n');
    assert.equal(lines.length, 3);
    for (const line of lines) assert.equal(typeof JSON.parse(line).uid, 'string');
    assert.equal(out.stdout.includes('emb'), false, 'no embedding in a plain-text export');
  });

  // The phase-1 exit test, as a pipeline.
  it('pipes into a fresh store and comes back identical', () => {
    const exported = run(home, ['export']);
    const imported = run(target, ['import'], exported.stdout);
    assert.equal(imported.status, 0, imported.stderr);
    assert.match(imported.stdout, /Imported 3 records from stdin: 3 added/);

    const again = run(target, ['export']);
    assert.equal(again.stdout, exported.stdout);
  });

  it('is a no-op when run twice', () => {
    const exported = run(home, ['export']);
    const second = run(target, ['import'], exported.stdout);
    assert.match(second.stdout, /0 added, 0 updated, 3 already present/);
    assert.equal(run(target, ['export']).stdout, exported.stdout);
  });

  it('reads a file and honours --dry-run', () => {
    const file = join(target, 'backup.jsonl');
    writeFileSync(file, run(home, ['export']).stdout);

    const dry = run(target, ['import', file, '--dry-run', '--json']);
    assert.equal(dry.status, 0, dry.stderr);
    assert.equal(JSON.parse(dry.stdout).dryRun, true);

    const out = run(home, ['export', '--out', join(home, 'copy.jsonl')]);
    assert.equal(out.status, 0, out.stderr);
    assert.match(out.stderr, /Exported 3 memories/);
    assert.equal(out.stdout, '', 'the file is the output, stdout stays clean');
    assert.equal(readFileSync(join(home, 'copy.jsonl'), 'utf8'), run(home, ['export']).stdout);
  });

  it('filters the export', () => {
    const globals = run(home, ['export', '--global']);
    assert.equal(globals.stdout.trim(), '', 'nothing was added globally');
    const kinds = run(home, ['export', '--kind', 'fact']);
    assert.equal(kinds.stdout.trim().split('\n').length, 3);
    assert.match(run(home, ['export', '--kind', 'nonsense']).stderr, /Unknown kind/);
    assert.equal(run(home, ['export', '--kind', 'nonsense']).status, 1);
  });

  it('rejects a broken file rather than importing half of it', () => {
    const out = run(target, ['import'], '{"text":"fine","project_key":"p"}\nnot json\n');
    assert.equal(out.status, 1);
    assert.match(out.stderr, /Line 2 is not valid JSON/);
  });
});
