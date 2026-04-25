// Template: scripts/lib/db.mjs
// (sibling helper that already reads SUPABASE_DB_URL from .env.local
// with the same line-by-line / startsWith / quote-strip parser shape;
// this file generalizes that pattern for the test-isolation subsystem.)
//
// Note: NOT a bulk-loader / ingest script. Filename triggers the
// citation hook because it begins with `load-`.

/**
 * scripts/lib/load-env.mjs
 *
 * Shared `.env.local` parser. Three callers in the test-isolation
 * subsystem (test-db.mjs, reap-test-runs.mjs, diag-test-pollution-status.mjs)
 * each rolled their own; consolidating to one helper.
 *
 * Round-1 deferred polish item from
 * docs/plans/2026-04-24-worry-test-pollution-cv.md.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Resolve the project's .env.local path. Helper sits at
 * `<project>/scripts/lib/load-env.mjs`, so .env.local is two dirs up.
 */
export function envLocalPath() {
  return path.resolve(__dirname, '..', '..', '.env.local');
}

/**
 * Read a single env value from `.env.local` by key.
 *
 * Returns the trimmed string value or throws when the file or key is
 * missing. Skips comment lines (`#`-prefixed after trim) and blank
 * lines. Strips matched surrounding double or single quotes. Does NOT
 * do shell-style variable expansion — values are raw literals.
 */
export function readEnvKey(key, opts = {}) {
  const file = opts.path || envLocalPath();
  if (!fs.existsSync(file)) {
    throw new Error('load-env: missing .env.local at ' + file);
  }
  const raw = fs.readFileSync(file, 'utf8');
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    if (trimmed.slice(0, eq).trim() !== key) continue;
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    return val;
  }
  throw new Error('load-env: ' + key + ' not found in ' + file);
}

/**
 * Convenience wrapper for the common case of loading SUPABASE_DB_URL.
 */
export function loadDbUrl() {
  return readEnvKey('SUPABASE_DB_URL');
}

/**
 * Read a `.env.local` into a plain object. Same parsing rules as
 * `readEnvKey`. Used by callers that need many keys at once.
 */
export function readEnvAll(opts = {}) {
  const file = opts.path || envLocalPath();
  if (!fs.existsSync(file)) {
    throw new Error('load-env: missing .env.local at ' + file);
  }
  const raw = fs.readFileSync(file, 'utf8');
  const env = {};
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    env[key] = val;
  }
  return env;
}
