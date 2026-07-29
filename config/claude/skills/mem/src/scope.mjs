// Scope resolution — deciding which memories belong to "this project".
//
// PLAN's precision section lists hard scoping as a countermeasure: recall unions
// global memories with exactly one project's, so the project key has to be
// *stable* (the same repo answers the same key from any checkout, any
// subdirectory) and *distinct* (two repos never collide). Hence the schema's
// "normalised git remote, else abs path": the remote survives re-cloning to a
// different directory, and the path is the honest fallback for a repo with no
// remote — or a directory that is not a repo at all.
//
// Everything here is synchronous and cheap (two `git` invocations, no network),
// because the hooks pay for it on every prompt.

import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';

/** Plenty for a local `git rev-parse`; a hung git must not hang a hook. */
const GIT_TIMEOUT_MS = 1500;

/** Remotes to consult, in order, before falling back to whatever exists. */
const PREFERRED_REMOTES = ['origin', 'upstream'];

/**
 * Run git, returning trimmed stdout or null. Never throws: not being in a repo,
 * git not being installed, and git being broken are all the same answer here —
 * "no remote information", fall back to the path.
 */
function git(args, cwd) {
  try {
    const out = execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      timeout: GIT_TIMEOUT_MS,
      stdio: ['ignore', 'pipe', 'ignore'],
      // No credential prompts, no index churn: this must stay a read.
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0' },
    });
    const trimmed = out.trim();
    return trimmed === '' ? null : trimmed;
  } catch {
    return null;
  }
}

/** True when `git` can be executed at all — for tests and doctor. */
export function gitAvailable(cwd = process.cwd()) {
  return git(['--version'], cwd) !== null;
}

/** Absolute path of the working tree containing `cwd`, or null. */
export function gitRoot(cwd = process.cwd()) {
  return git(['rev-parse', '--show-toplevel'], cwd);
}

/**
 * The URL that best identifies this repo: origin, else upstream, else the first
 * remote git lists. A remote with several URLs prints several lines; the first
 * is the fetch URL.
 */
export function gitRemoteUrl(cwd = process.cwd()) {
  for (const name of PREFERRED_REMOTES) {
    const url = git(['remote', 'get-url', name], cwd);
    if (url) return url.split('\n')[0].trim();
  }
  const first = git(['remote'], cwd)?.split('\n')[0]?.trim();
  if (!first) return null;
  return git(['remote', 'get-url', first], cwd)?.split('\n')[0].trim() ?? null;
}

/** Collapse slashes, drop a trailing `.git`, drop trailing slashes. */
function tidyRepoPath(path) {
  let p = path.replace(/\/{2,}/g, '/').replace(/\/+$/, '');
  if (/\.git$/i.test(p)) p = p.slice(0, -4).replace(/\/+$/, '');
  return p;
}

/**
 * Reduce a git remote URL to a bare `host/owner/repo` key, so every way of
 * writing the same remote collapses to one string:
 *
 *   git@github.com:Me/repo.git
 *   https://token@github.com/Me/repo
 *   ssh://git@github.com:22/Me/repo.git/     →  github.com/Me/repo
 *
 * The host is lowercased (hostnames are case-insensitive); the path is not,
 * because on a case-sensitive filesystem — and on some forges — `Me/repo` and
 * `me/repo` really are different things. A `file://` or absolute-path remote has
 * no host and normalises to the path itself, which is the same shape the
 * no-remote fallback produces.
 *
 * Returns null for anything unrecognised, which means "fall back to the path"
 * rather than "invent a key".
 */
export function normaliseRemote(url) {
  if (typeof url !== 'string') return null;
  const raw = url.trim();
  if (raw === '') return null;

  let host;
  let path;

  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) {
    let parsed;
    try {
      parsed = new URL(raw);
    } catch {
      return null;
    }
    // hostname drops any user:password@ and :port for us.
    host = parsed.hostname;
    try {
      path = decodeURIComponent(parsed.pathname);
    } catch {
      path = parsed.pathname;
    }
  } else {
    // scp-like `[user@]host:path`. The host must be longer than one character
    // so a Windows drive letter (`C:\repo`) is not read as a hostname.
    const scp = /^(?:[^@/]+@)?([^@/:]{2,}):(.+)$/.exec(raw);
    if (scp) {
      [, host, path] = scp;
    } else if (raw.startsWith('/')) {
      host = '';
      path = raw;
    } else {
      return null;
    }
  }

  const cleanPath = tidyRepoPath(path.replace(/^\/+/, ''));
  if (cleanPath === '') return null;

  const cleanHost = host.toLowerCase();
  return cleanHost === '' ? `/${cleanPath}` : `${cleanHost}/${cleanPath}`;
}

/**
 * A directory as a project key: absolute and symlink-resolved, so
 * ~/code/proj and its /nix/store-style real path never split one project's
 * memories in two.
 */
function pathKey(dir) {
  const abs = resolve(dir);
  try {
    return tidyRepoPath(realpathSync(abs));
  } catch {
    return tidyRepoPath(abs);
  }
}

/**
 * Resolve the `project_key` for `cwd`.
 *
 * `source` says which rule produced it — 'env', 'git-remote', 'git-root' or
 * 'cwd' — so `doctor` and `mem add` can show *why* a memory landed where it did
 * rather than leaving a silent mis-scope to be discovered later.
 *
 * MEM_PROJECT_KEY overrides everything: hooks run with an inherited cwd that is
 * not always the project, and tests need a key without a repo.
 */
export function resolveProjectKey({ cwd = process.cwd(), env = process.env } = {}) {
  const override = env.MEM_PROJECT_KEY?.trim();
  if (override) {
    return { projectKey: override, source: 'env', root: null, remote: null };
  }

  const root = gitRoot(cwd);
  const remote = root ? gitRemoteUrl(root) : null;
  const fromRemote = remote ? normaliseRemote(remote) : null;

  if (fromRemote) return { projectKey: fromRemote, source: 'git-remote', root, remote };
  // In a repo but no usable remote: key on the working tree, not on cwd, so
  // every subdirectory of the repo agrees.
  if (root) return { projectKey: pathKey(root), source: 'git-root', root, remote };
  return { projectKey: pathKey(cwd), source: 'cwd', root: null, remote: null };
}

/**
 * Resolve the (scope, project_key) pair a write should carry. Global memories
 * store NULL — the schema says so, and retrieval's `scope = 'global' OR
 * project_key = ?` depends on it.
 */
export function resolveScope({ scope = 'project', cwd, env } = {}) {
  if (scope === 'global') {
    return { scope: 'global', projectKey: null, source: 'global', root: null, remote: null };
  }
  if (scope !== 'project') {
    throw new Error(`Unknown scope '${scope}' — expected 'global' or 'project'.`);
  }
  return { scope: 'project', ...resolveProjectKey({ cwd, env }) };
}
