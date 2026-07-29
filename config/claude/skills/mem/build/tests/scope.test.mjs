// Project-key resolution. The URL cases are pure; the rest run against real
// throwaway git repos, because the thing worth testing is what git actually
// reports, not what a stubbed runner was told to report.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';

import {
  gitAvailable,
  gitRemoteUrl,
  gitRoot,
  normaliseRemote,
  resolveProjectKey,
  resolveScope,
} from '../../src/scope.mjs';

const scratch = realpathSync(mkdtempSync(join(tmpdir(), 'mem-scope-test-')));
after(() => rmSync(scratch, { recursive: true, force: true }));

const needsGit = { skip: gitAvailable() ? false : 'git not installed' };

// No env at all: MEM_PROJECT_KEY in the ambient environment must not silently
// pass tests that are about git.
const noEnv = {};

let n = 0;
/** A fresh directory, optionally an initialised repo with the given remotes. */
function makeDir({ repo = false, remotes = {} } = {}) {
  const dir = join(scratch, `d${n++}`);
  mkdirSync(dir, { recursive: true });
  if (repo) {
    const run = (...args) => execFileSync('git', args, { cwd: dir, stdio: 'ignore' });
    run('init', '-q');
    for (const [name, url] of Object.entries(remotes)) run('remote', 'add', name, url);
  }
  return dir;
}

describe('normaliseRemote', () => {
  const cases = [
    ['git@github.com:Me/repo.git', 'github.com/Me/repo'],
    ['git@github.com:Me/repo', 'github.com/Me/repo'],
    ['https://github.com/Me/repo.git', 'github.com/Me/repo'],
    ['https://github.com/Me/repo/', 'github.com/Me/repo'],
    ['ssh://git@github.com/Me/repo.git', 'github.com/Me/repo'],
    ['ssh://git@github.com:22/Me/repo.git', 'github.com/Me/repo'],
    ['git://github.com/Me/repo.git', 'github.com/Me/repo'],
    ['https://gitlab.com/group/sub/repo.git', 'gitlab.com/group/sub/repo'],
    ['file:///srv/git/repo.git', '/srv/git/repo'],
    ['/srv/git/repo.git', '/srv/git/repo'],
  ];

  for (const [url, expected] of cases) {
    it(`normalises ${url}`, () => assert.equal(normaliseRemote(url), expected));
  }

  it('collapses every spelling of one remote to one key', () => {
    const keys = new Set(
      [
        'git@github.com:Me/repo.git',
        'https://github.com/Me/repo',
        'https://GitHub.COM/Me/repo.git',
        'https://user:tok@github.com/Me/repo.git/',
        '  ssh://git@github.com:22//Me/repo.git  ',
      ].map(normaliseRemote),
    );
    assert.deepEqual([...keys], ['github.com/Me/repo']);
  });

  // Hostnames are case-insensitive; paths are not, on a case-sensitive
  // filesystem or a forge that treats them that way.
  it('lowercases the host but preserves path case', () => {
    assert.equal(normaliseRemote('git@GitHub.com:Me/Repo.git'), 'github.com/Me/Repo');
    assert.notEqual(normaliseRemote('git@github.com:me/repo'), normaliseRemote('git@github.com:Me/Repo'));
  });

  it('strips credentials and ports rather than keying on them', () => {
    assert.equal(
      normaliseRemote('https://oauth2:ghp_deadbeef@example.com:8443/team/repo.git'),
      'example.com/team/repo',
    );
  });

  it('separates distinct repos', () => {
    assert.notEqual(normaliseRemote('git@github.com:me/a.git'), normaliseRemote('git@github.com:me/b.git'));
    assert.notEqual(
      normaliseRemote('git@github.com:me/repo.git'),
      normaliseRemote('git@gitlab.com:me/repo.git'),
    );
  });

  it('returns null for anything it cannot recognise, rather than inventing a key', () => {
    for (const bad of ['', '   ', 'nonsense', './relative', '~/repo', 'C:\\repo', 'https://', null, 42]) {
      assert.equal(normaliseRemote(bad), null, `expected null for ${JSON.stringify(bad)}`);
    }
  });
});

describe('resolveProjectKey', needsGit, () => {
  it('prefers the normalised remote', () => {
    const dir = makeDir({ repo: true, remotes: { origin: 'git@github.com:me/proj.git' } });
    assert.deepEqual(resolveProjectKey({ cwd: dir, env: noEnv }), {
      projectKey: 'github.com/me/proj',
      source: 'git-remote',
      root: dir,
      remote: 'git@github.com:me/proj.git',
    });
  });

  it('gives every subdirectory of a repo the same key', () => {
    const dir = makeDir({ repo: true, remotes: { origin: 'https://github.com/me/proj.git' } });
    const deep = join(dir, 'src', 'nested');
    mkdirSync(deep, { recursive: true });
    assert.equal(resolveProjectKey({ cwd: deep, env: noEnv }).projectKey, 'github.com/me/proj');
  });

  it('gives two checkouts of one repo the same key', () => {
    const url = 'git@github.com:me/same.git';
    const a = makeDir({ repo: true, remotes: { origin: url } });
    const b = makeDir({ repo: true, remotes: { origin: url } });
    assert.equal(
      resolveProjectKey({ cwd: a, env: noEnv }).projectKey,
      resolveProjectKey({ cwd: b, env: noEnv }).projectKey,
    );
  });

  it('prefers origin over upstream, and upstream over the rest', () => {
    const all = makeDir({
      repo: true,
      remotes: {
        origin: 'git@github.com:me/fork.git',
        upstream: 'git@github.com:them/orig.git',
        other: 'git@github.com:x/other.git',
      },
    });
    assert.equal(resolveProjectKey({ cwd: all, env: noEnv }).projectKey, 'github.com/me/fork');

    const noOrigin = makeDir({
      repo: true,
      remotes: { upstream: 'git@github.com:them/orig.git', other: 'git@github.com:x/other.git' },
    });
    assert.equal(resolveProjectKey({ cwd: noOrigin, env: noEnv }).projectKey, 'github.com/them/orig');

    const neither = makeDir({ repo: true, remotes: { other: 'git@github.com:x/other.git' } });
    assert.equal(resolveProjectKey({ cwd: neither, env: noEnv }).projectKey, 'github.com/x/other');
  });

  it('falls back to the working tree when there is no remote', () => {
    const dir = makeDir({ repo: true });
    const deep = join(dir, 'a', 'b');
    mkdirSync(deep, { recursive: true });

    const fromRoot = resolveProjectKey({ cwd: dir, env: noEnv });
    assert.deepEqual(fromRoot, { projectKey: dir, source: 'git-root', root: dir, remote: null });
    // The whole point of keying on the root: a subdirectory is the same project.
    assert.equal(resolveProjectKey({ cwd: deep, env: noEnv }).projectKey, dir);
  });

  it('falls back to an absolute cwd outside any repo', () => {
    const dir = makeDir();
    const resolved = resolveProjectKey({ cwd: dir, env: noEnv });
    assert.deepEqual(resolved, { projectKey: dir, source: 'cwd', root: null, remote: null });
    assert.ok(resolved.projectKey.startsWith('/'));
  });

  it('falls back to a remote git cannot make sense of', () => {
    const dir = makeDir({ repo: true, remotes: { origin: 'nonsense' } });
    const resolved = resolveProjectKey({ cwd: dir, env: noEnv });
    assert.equal(resolved.source, 'git-root');
    assert.equal(resolved.projectKey, dir);
    assert.equal(resolved.remote, 'nonsense');
  });

  it('is overridden by MEM_PROJECT_KEY', () => {
    const dir = makeDir({ repo: true, remotes: { origin: 'git@github.com:me/proj.git' } });
    assert.deepEqual(resolveProjectKey({ cwd: dir, env: { MEM_PROJECT_KEY: ' forced ' } }), {
      projectKey: 'forced',
      source: 'env',
      root: null,
      remote: null,
    });
    // Blank is not an override.
    assert.equal(
      resolveProjectKey({ cwd: dir, env: { MEM_PROJECT_KEY: '  ' } }).source,
      'git-remote',
    );
  });
});

describe('gitRoot / gitRemoteUrl', needsGit, () => {
  it('report null outside a repo instead of throwing', () => {
    const dir = makeDir();
    assert.equal(gitRoot(dir), null);
    assert.equal(gitRemoteUrl(dir), null);
  });
});

describe('resolveScope', () => {
  it('stores NULL for global, as the schema requires', () => {
    assert.deepEqual(resolveScope({ scope: 'global' }), {
      scope: 'global',
      projectKey: null,
      source: 'global',
      root: null,
      remote: null,
    });
  });

  it('defaults to project scope', () => {
    const scoped = resolveScope({ env: { MEM_PROJECT_KEY: 'k' } });
    assert.equal(scoped.scope, 'project');
    assert.equal(scoped.projectKey, 'k');
  });

  it('rejects an unknown scope rather than defaulting', () => {
    assert.throws(() => resolveScope({ scope: 'session' }), /Unknown scope/);
  });
});
