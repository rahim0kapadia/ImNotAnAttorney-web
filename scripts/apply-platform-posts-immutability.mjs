/**
 * apply-platform-posts-immutability.mjs — one-shot apply of
 * supabase/migrations/20260424e_platform_posts_immutability_triggers.sql
 * via Supabase Management API. Phase X-R2 (2026-04-24).
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
if (!SUPABASE_ACCESS_TOKEN) { console.error('missing SUPABASE_ACCESS_TOKEN'); process.exit(1); }

const PROJECT_REF = 'jxjbjmgdukwkoclydqdr';
const migrationPath = path.resolve(__dirname, '..', 'supabase', 'migrations', '20260424e_platform_posts_immutability_triggers.sql');
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
  console.error(`migration failed (${res.status}):`, text.slice(0, 2000));
  process.exit(2);
}
console.log('migration applied:', text.slice(0, 400));

// Verify triggers
const verify = await fetch(
  `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
  {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SUPABASE_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
      'User-Agent': 'inaa-apply-migration/1.0',
    },
    body: JSON.stringify({
      query: "SELECT tgname FROM pg_trigger WHERE tgrelid='platform_posts'::regclass AND NOT tgisinternal;",
    }),
  },
);
console.log('triggers:', (await verify.text()).slice(0, 500));
