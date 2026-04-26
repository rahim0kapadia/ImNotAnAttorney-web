/**
 * apply-platform-posts-migration.mjs — one-shot application of
 * supabase/migrations/20260424c_platform_posts.sql via the Supabase
 * Management API (no exec_sql RPC available on hosted Supabase).
 *
 * Pattern source: scripts/migrate-009-tier-inclusion.mjs (cached template).
 *
 * Plan: C:/Users/email/projects/ImNotAnAttorney/docs/handoff/2026-04-24-unified-container-gap-closure.md Phase O
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Read SUPABASE_ACCESS_TOKEN from this repo's .env.local (service-role is not needed for Management API).
const envPath = path.resolve(__dirname, '..', '.env.local');
const env = fs.readFileSync(envPath, 'utf8')
  .split('\n')
  .filter(l => l && !l.trimStart().startsWith('#'))
  .reduce((m, l) => {
    const i = l.indexOf('=');
    if (i > 0) m[l.slice(0, i).trim()] = l.slice(i + 1).trim();
    return m;
  }, {});

const SUPABASE_ACCESS_TOKEN = env.SUPABASE_ACCESS_TOKEN;
if (!SUPABASE_ACCESS_TOKEN) {
  console.error('Missing SUPABASE_ACCESS_TOKEN in ImNotAnAttorney-web/.env.local');
  process.exit(1);
}

const PROJECT_REF = 'jxjbjmgdukwkoclydqdr';

const migrationPath = path.resolve(__dirname, '..', 'supabase', 'migrations', '20260424c_platform_posts.sql');
const sql = fs.readFileSync(migrationPath, 'utf8');

const res = await fetch(
  `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
  {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SUPABASE_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
      'User-Agent': 'inaa-apply-migration/1.0',
    },
    body: JSON.stringify({ query: sql }),
  },
);

const text = await res.text();
if (!res.ok) {
  console.error(`Migration failed (${res.status}):`, text.slice(0, 2000));
  process.exit(2);
}
console.log('Migration applied:', text.slice(0, 400));

// Verify table shape.
const verifyRes = await fetch(
  `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
  {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SUPABASE_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
      'User-Agent': 'inaa-apply-migration/1.0',
    },
    body: JSON.stringify({
      query: "SELECT column_name, data_type FROM information_schema.columns WHERE table_name='platform_posts' ORDER BY ordinal_position;",
    }),
  },
);
const verifyText = await verifyRes.text();
console.log('Verification:', verifyText);
