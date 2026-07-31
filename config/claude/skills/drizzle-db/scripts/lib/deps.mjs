// Resolves drizzle-orm and its database drivers.
//
// Order: the current project's node_modules first (so a project's pinned drizzle version wins),
// then a shared cache directory, installing on demand as a last resort.

import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const CACHE_DIR = process.env.DRIZZLE_DB_CACHE_DIR
  || path.join(process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache'), 'claude-drizzle-db');

const cache = new Map();

/** "drizzle-orm/postgres-js" -> "drizzle-orm"; "@libsql/client" -> "@libsql/client" */
export function packageOf(spec) {
  const parts = spec.split('/');
  return spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

function resolveFrom(baseDir, spec) {
  try {
    return createRequire(path.join(baseDir, '__drizzle_db_resolver__.js')).resolve(spec);
  } catch {
    return null;
  }
}

function installPackages(pkgs) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const manifest = path.join(CACHE_DIR, 'package.json');
  if (!fs.existsSync(manifest)) {
    fs.writeFileSync(
      manifest,
      `${JSON.stringify({ name: 'claude-drizzle-db-cache', private: true, version: '0.0.0' }, null, 2)}\n`,
    );
  }

  process.stderr.write(`[drizzle-db] installing ${pkgs.join(' ')} into ${CACHE_DIR}\n`);
  // npm's progress summary is a diagnostic, not output — send its stdout to our
  // stderr (fd 2). Letting it inherit fd 1 corrupts `--json` for any caller
  // parsing stdout, and breaks the MCP server's JSON-RPC framing outright.
  const result = spawnSync(
    'npm',
    ['install', '--prefix', CACHE_DIR, '--no-audit', '--no-fund', '--loglevel', 'error', ...pkgs],
    { stdio: ['ignore', 2, 'inherit'] },
  );
  if (result.error) throw new Error(`Could not run npm: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`npm install failed for: ${pkgs.join(' ')}`);
}

/**
 * Import a module by specifier, installing its package if it is missing.
 * Returns the module namespace.
 */
export async function loadModule(spec, { install = true } = {}) {
  if (cache.has(spec)) return cache.get(spec);

  let file = resolveFrom(process.cwd(), spec) || resolveFrom(CACHE_DIR, spec);

  if (!file) {
    if (!install || process.env.DRIZZLE_DB_NO_INSTALL === '1') {
      throw new Error(
        `Missing dependency "${packageOf(spec)}". Install it with: npm install ${packageOf(spec)} `
        + '(auto-install is disabled via DRIZZLE_DB_NO_INSTALL).',
      );
    }
    installPackages([packageOf(spec)]);
    file = resolveFrom(CACHE_DIR, spec);
  }

  if (!file) {
    throw new Error(`Cannot resolve "${spec}" even after installing "${packageOf(spec)}".`);
  }

  const mod = await import(pathToFileURL(file).href);
  cache.set(spec, mod);
  return mod;
}

/** Pull a named export out of a module that may be CJS-interop'd. */
export function pick(mod, name) {
  const value = mod?.[name] ?? mod?.default?.[name];
  if (value === undefined) {
    throw new Error(`Module does not export "${name}" (exports: ${Object.keys(mod || {}).join(', ')})`);
  }
  return value;
}

/** Get a module's default/callable export (CJS `module.exports = fn`). */
export function pickDefault(mod) {
  const value = mod?.default ?? mod;
  // Interop can produce { default: { default: fn } } for some CJS bundles.
  if (value && typeof value === 'object' && typeof value.default === 'function') return value.default;
  return value;
}
