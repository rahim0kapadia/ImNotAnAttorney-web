// Pattern: cl-bulk-data-defensive #19 + no-hallucinated-legal-data
// csv-bulk-checked: none-exists — poderjudicial.pr publishes judge directory as HTML only
//
// PR (Puerto Rico) judge directory ingest. Extracts judge names from two pages:
//   1. Tribunal de Apelaciones — https://poderjudicial.pr/tribunal-apelaciones/jueces-del-tribunal-de-apelaciones/
//   2. Tribunal Supremo        — https://poderjudicial.pr/tribunal-supremo/composicion-del-tribunal-supremo/
//
// INSERTs into judge_profiles for any name not already present in the DB.
//
// Per followup plan docs/plans/2026-04-27-followup-judge-profiles-state-directories.md
// (G8b). Extends PR jurisdiction coverage to ≥50 rows.
//
// Usage:
//   node scripts/ingest/seed-judge-profiles-pr.mjs --dry-run
//   node scripts/ingest/seed-judge-profiles-pr.mjs

import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import pg from 'pg';
import { extractPrJudges } from './lib/judge-profiles-html.mjs';

const envPaths = ['C:/Users/email/projects/ImNotAnAttorney-web/.env.local'];
const VALID_KEY_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ_0123456789';
function isValidEnvKey(k) {
  if (!k.length) return false;
  if (k[0] >= '0' && k[0] <= '9') return false;
  for (const ch of k) if (!VALID_KEY_CHARS.includes(ch)) return false;
  return true;
}
for (const p of envPaths) {
  if (!fs.existsSync(p)) continue;
  for (const rawLine of fs.readFileSync(p, 'utf-8').split('\n')) {
    let line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
    line = line.trim();
    if (!line || line[0] === '#') continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (val.length >= 2 && ((val[0] === '"' && val[val.length - 1] === '"') ||
        (val[0] === "'" && val[val.length - 1] === "'"))) val = val.slice(1, -1);
    if (!isValidEnvKey(key)) continue;
    if (!process.env[key]) process.env[key] = val;
  }
}

const SOURCES = [
  {
    url: 'https://poderjudicial.pr/tribunal-apelaciones/jueces-del-tribunal-de-apelaciones/',
    label: 'Tribunal de Apelaciones',
  },
  {
    url: 'https://poderjudicial.pr/tribunal-supremo/composicion-del-tribunal-supremo/',
    label: 'Tribunal Supremo',
  },
];

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function fetchPage(url) {
  const r = await fetch(url, {
    headers: {
      'User-Agent': UA,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'es-PR,es;q=0.9,en;q=0.8',
    },
    redirect: 'follow',
  });
  if (!r.ok) throw new Error('HTTP ' + r.status + ' on ' + url);
  const buf = await r.arrayBuffer();
  return new TextDecoder('utf-8').decode(buf);
}

async function makeDbClient() {
  const u = new URL(process.env.SUPABASE_DB_URL);
  u.port = '5432';
  const client = new pg.Client({ connectionString: u.toString(), ssl: { rejectUnauthorized: false } });
  await client.connect();
  await client.query("SET statement_timeout = '5min'");
  await client.query("SET idle_in_transaction_session_timeout = '5min'");
  return client;
}

export async function run({ dryRun, htmlOverrides }) {
  // htmlOverrides: { [url]: htmlString } — for tests/dry-run with fixture HTML
  const allCandidates = [];
  const seenNames = new Set();

  for (const src of SOURCES) {
    const html = (htmlOverrides && htmlOverrides[src.url]) || await fetchPage(src.url);
    const extracted = extractPrJudges(html, src.url);
    console.log(`  ${src.label}: ${extracted.length} names extracted`);
    for (const c of extracted) {
      const key = c.fullName.toLowerCase();
      if (!seenNames.has(key)) {
        seenNames.add(key);
        allCandidates.push(c);
      }
    }
  }

  console.log(`Total unique candidates: ${allCandidates.length}`);

  const client = await makeDbClient();
  let inserted = 0;
  try {
    const existing = await client.query(
      "SELECT LOWER(full_name) AS name FROM judge_profiles WHERE jurisdiction='PR'"
    );
    const dbNames = new Set(existing.rows.map((r) => r.name));
    const newOnes = allCandidates.filter((c) => !dbNames.has(c.fullName.toLowerCase()));
    console.log(`  ${newOnes.length} new (not in DB); ${allCandidates.length - newOnes.length} already present`);

    if (dryRun) {
      console.log('\nDRY-RUN preview:');
      for (const r of newOnes.slice(0, 60)) console.log(`  ${r.fullName} -> ${r.bioUrl}`);
      return { newOnes };
    }

    for (const r of newOnes) {
      const { rowCount } = await client.query(
        `INSERT INTO judge_profiles (full_name, name_first, name_last, jurisdiction, bio_url, intelligence_status, created_at, updated_at)
         VALUES ($1,$2,$3,'PR',$4,'pending', now(), now())
         ON CONFLICT DO NOTHING`,
        [r.fullName, r.first, r.last, r.bioUrl]
      );
      if (rowCount > 0) inserted += 1;
    }
    console.log(`  inserted ${inserted} rows`);
    return { inserted };
  } finally {
    await client.end();
  }
}

async function main() {
  const flags = { dryRun: process.argv.slice(2).includes('--dry-run') };
  await run(flags);
  console.log('\n=== done ===');
}

const invokedDirectly = (() => {
  if (!process.argv[1]) return false;
  try { return import.meta.url === pathToFileURL(process.argv[1]).href; }
  catch { return false; }
})();
if (invokedDirectly) main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
