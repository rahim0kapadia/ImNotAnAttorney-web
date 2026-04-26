/**
 * apply-platform-posts-length-checks.mjs — one-shot apply of
 * supabase/migrations/20260424d_platform_posts_length_checks.sql via
 * the Supabase Management API.
 *
 * Phase X-R1 (2026-04-24).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
const migrationPath = path.resolve(__dirname, '..', 'supabase', 'migrations', '20260424d_platform_posts_length_checks.sql');
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
      query: "SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='platform_posts'::regclass AND contype='c' ORDER BY conname;",
    }),
  },
);
console.log('Constraints:', (await verifyRes.text()).slice(0, 1500));
