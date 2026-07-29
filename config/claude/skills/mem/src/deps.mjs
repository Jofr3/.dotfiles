// Lazy dependency bootstrap.
//
// The plugin ships no node_modules: the two heavy deps are installed on first
// use into ${dataDir}/node_modules and resolved from there. Deliberately NOT
// resolved from process.cwd() the way a project-local tool would be — whatever
// turso version some unrelated repo happens to pin must never be loaded here.
// Versions are pinned exactly (PLAN risk register: the Turso rewrite is young).

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { ensureDataDir, resolvePaths } from './paths.mjs';

export const TURSO = '@tursodatabase/database';
export const TRANSFORMERS = '@huggingface/transformers';

/** Exact pins. Bumping one here is the whole upgrade procedure. */
export const DEPS = {
  [TURSO]: '0.7.1',
  [TRANSFORMERS]: '4.2.0',
};

const INSTALL_TIMEOUT_MS = 5 * 60 * 1000;
const LOCK_WAIT_MS = 5 * 60 * 1000;
const LOCK_STALE_MS = 10 * 60 * 1000;

const moduleCache = new Map();

/** "@huggingface/transformers/foo" -> "@huggingface/transformers" */
export function packageOf(spec) {
  const parts = spec.split('/');
  return spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

function requireFrom(dir) {
  // The file need not exist; require() only uses it as a resolution anchor.
  return createRequire(join(dir, '__mem_resolver__.cjs'));
}

/** Absolute path of the entrypoint for `spec`, or null when not installed. */
export function resolveDep(spec, paths = resolvePaths()) {
  try {
    return requireFrom(paths.dataDir).resolve(spec);
  } catch {
    return null;
  }
}

/** Installed version of a package, read straight off disk (exports maps can
 *  hide ./package.json from require.resolve, so don't go through it). */
function installedVersion(name, paths) {
  try {
    const manifest = join(paths.nodeModulesDir, ...name.split('/'), 'package.json');
    return JSON.parse(readFileSync(manifest, 'utf8')).version ?? null;
  } catch {
    return null;
  }
}

/**
 * Read-only view of the dependency tree — what doctor reports. Never installs.
 * status: ok | missing | mismatch (installed, but not the pinned version)
 */
export function depStatus(paths = resolvePaths()) {
  return Object.entries(DEPS).map(([name, wanted]) => {
    const installed = installedVersion(name, paths);
    const resolved = installed !== null && resolveDep(name, paths) !== null;
    let status = 'missing';
    if (installed !== null) status = installed === wanted && resolved ? 'ok' : 'mismatch';
    return { name, wanted, installed, resolved, status };
  });
}

/** True when every pinned dependency is present at the pinned version. */
export function depsReady(paths = resolvePaths()) {
  return depStatus(paths).every((d) => d.status === 'ok');
}

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/** Cross-process mutex so two hooks starting at once can't run npm on the same
 *  prefix concurrently. mkdir is the atomic primitive; stale locks are stolen. */
function withInstallLock(paths, fn) {
  const lockDir = join(paths.dataDir, '.install.lock');
  const deadline = Date.now() + LOCK_WAIT_MS;

  for (;;) {
    try {
      mkdirSync(lockDir);
      break;
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;

      let age = 0;
      try {
        age = Date.now() - statSync(lockDir).mtimeMs;
      } catch {
        continue; // holder released it between mkdir and stat; retry immediately
      }
      if (age > LOCK_STALE_MS) {
        rmSync(lockDir, { recursive: true, force: true });
        continue;
      }
      if (Date.now() > deadline) {
        throw new Error(`Timed out waiting for another mem install (${lockDir}).`);
      }
      sleepSync(250);
    }
  }

  try {
    return fn();
  } finally {
    rmSync(lockDir, { recursive: true, force: true });
  }
}

function writeManifest(paths) {
  const manifest = join(paths.dataDir, 'package.json');
  if (existsSync(manifest)) return;
  const body = {
    name: 'claude-mem-deps',
    private: true,
    version: '0.0.0',
    description: 'Lazily installed dependencies for the mem plugin. Managed by src/deps.mjs.',
  };
  writeFileSync(manifest, `${JSON.stringify(body, null, 2)}\n`);
}

function npmInstall(specs, paths) {
  writeManifest(paths);
  process.stderr.write(`[mem] installing ${specs.join(' ')} into ${paths.nodeModulesDir}\n`);

  // stdout is piped, not inherited: hooks and `--json` need it kept clean.
  const result = spawnSync(
    'npm',
    [
      'install',
      '--prefix', paths.dataDir,
      '--no-audit',
      '--no-fund',
      '--prefer-offline',
      '--loglevel', 'error',
      ...specs,
    ],
    { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', timeout: INSTALL_TIMEOUT_MS },
  );

  if (result.error) throw new Error(`Could not run npm: ${result.error.message}`);
  if (result.status !== 0) {
    const detail = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
    throw new Error(`npm install failed for ${specs.join(' ')}${detail ? `\n${detail}` : ''}`);
  }
}

/**
 * Make sure the named packages are installed at their pinned versions.
 * Returns the names it actually installed (empty when everything was ready).
 */
export function ensureDeps(names = Object.keys(DEPS), { paths = resolvePaths(), env = process.env } = {}) {
  const wanted = names.map(packageOf);
  for (const name of wanted) {
    if (!DEPS[name]) throw new Error(`Unknown dependency "${name}" — add it to DEPS in src/deps.mjs.`);
  }

  const missing = () => depStatus(paths).filter((d) => wanted.includes(d.name) && d.status !== 'ok');
  if (missing().length === 0) return [];

  if (env.MEM_NO_INSTALL === '1') {
    const list = missing().map((d) => `${d.name}@${d.wanted}`).join(' ');
    throw new Error(`Missing dependencies: ${list} (auto-install disabled via MEM_NO_INSTALL=1).`);
  }

  ensureDataDir(paths);
  return withInstallLock(paths, () => {
    // Re-check inside the lock: another process may have just done the work.
    const todo = missing();
    if (todo.length === 0) return [];
    npmInstall(todo.map((d) => `${d.name}@${d.wanted}`), paths);

    const stillMissing = missing();
    if (stillMissing.length > 0) {
      throw new Error(`Still unresolvable after install: ${stillMissing.map((d) => d.name).join(', ')}`);
    }
    return todo.map((d) => d.name);
  });
}

/** Import a pinned dependency, installing it first if needed. */
export async function loadModule(spec, { paths = resolvePaths(), env = process.env } = {}) {
  if (moduleCache.has(spec)) return moduleCache.get(spec);

  ensureDeps([packageOf(spec)], { paths, env });
  const file = resolveDep(spec, paths);
  if (!file) throw new Error(`Cannot resolve "${spec}" from ${paths.nodeModulesDir}.`);

  const mod = await import(pathToFileURL(file).href);
  moduleCache.set(spec, mod);
  return mod;
}

export const loadTurso = (opts) => loadModule(TURSO, opts);
export const loadTransformers = (opts) => loadModule(TRANSFORMERS, opts);
