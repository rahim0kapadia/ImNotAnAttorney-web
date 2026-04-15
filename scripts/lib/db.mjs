/**
 * Shared direct Postgres connection for pipeline scripts.
 *
 * Replaces the Supabase Management API (api.supabase.com) pattern that
 * required a Personal Access Token (sbp_...) which could only be rotated
 * via the dashboard UI. Direct Postgres uses the database password which
 * is stable and doesn't need rotation.
 *
 * Usage:
 *   import { query, end } from './lib/db.mjs';
 *   const rows = await query('SELECT * FROM foo WHERE id = $1', [42]);
 *   await end(); // call once at script exit
 */

import pg from "pg";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load SUPABASE_DB_URL from this project's .env.local
function loadDbUrl() {
  const envPath = path.resolve(__dirname, "..", "..", ".env.local");
  if (!fs.existsSync(envPath)) {
    throw new Error("Missing .env.local at " + envPath);
  }
  const envFile = fs.readFileSync(envPath, "utf8");
  for (const line of envFile.split("\n")) {
    if (line.startsWith("SUPABASE_DB_URL=")) {
      return line.slice(line.indexOf("=") + 1).trim();
    }
  }
  throw new Error("Missing SUPABASE_DB_URL in .env.local");
}

let _client = null;

async function getClient() {
  if (!_client) {
    _client = new pg.Client({
      connectionString: loadDbUrl(),
      ssl: { rejectUnauthorized: false },
    });
    await _client.connect();
  }
  return _client;
}

/**
 * Execute a SQL query and return rows.
 * Supports parameterized queries: query('SELECT * FROM foo WHERE id = $1', [42])
 */
export async function query(sql, params = []) {
  const client = await getClient();
  const result = await client.query(sql, params);
  return result.rows;
}

/**
 * Close the connection. Call once at script exit.
 */
export async function end() {
  if (_client) {
    await _client.end();
    _client = null;
  }
}
