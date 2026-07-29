// Path resolution for the `mem` plugin.
//
// Code lives in the git-tracked plugin root; data (db, model cache, lazily
// installed deps) lives in CLAUDE_PLUGIN_DATA. When the CLI is run by hand
// that env var is unset, so fall back to XDG.

import { homedir } from 'node:os';
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Root of the plugin checkout — the directory holding bin/, src/, PLAN.md. */
export const pluginRoot = dirname(dirname(fileURLToPath(import.meta.url)));

/**
 * Resolve the data directory and record which rule produced it, so `doctor`
 * can say why it landed where it did.
 */
export function resolveDataDir(env = process.env) {
  const explicit = env.CLAUDE_PLUGIN_DATA?.trim();
  if (explicit) return { dir: resolve(explicit), source: 'CLAUDE_PLUGIN_DATA' };

  const xdg = env.XDG_DATA_HOME?.trim();
  if (xdg) return { dir: resolve(xdg, 'claude-mem'), source: 'XDG_DATA_HOME' };

  return { dir: join(homedir(), '.local', 'share', 'claude-mem'), source: 'default' };
}

export function resolvePaths(env = process.env) {
  const { dir: dataDir, source: dataDirSource } = resolveDataDir(env);
  return {
    pluginRoot,
    dataDir,
    dataDirSource,
    dbPath: join(dataDir, 'mem.db'),
    modelsDir: join(dataDir, 'models'),
    nodeModulesDir: join(dataDir, 'node_modules'),
  };
}

/** Create the data directory tree. Idempotent; safe to call on every command. */
export function ensureDataDir(paths = resolvePaths()) {
  mkdirSync(paths.dataDir, { recursive: true });
  mkdirSync(paths.modelsDir, { recursive: true });
  return paths;
}

export const paths = resolvePaths();
