// Pattern: cl-bulk-data-defensive #19 + no-hallucinated-legal-data
// csv-bulk-checked: none-exists — wyocourts.gov publishes judge directories as HTML only
//
// WY district-court, circuit-court, and supreme-court judge directory ingest.
// Extracts judge names from per-court pages on wyocourts.gov and INSERTs into
// judge_profiles for any name not already present for jurisdiction='WY'.
//
// Source URLs (as of 2026-04-27):
//   23 district-court pages  → https://www.wyocourts.gov/court/district-court-*/
//   27 circuit-court pages   → https://www.wyocourts.gov/court/circuit-court-*/
//    1 supreme-court page    → https://www.wyocourts.gov/supreme-court/
//
// Per followup plan docs/plans/2026-04-27-followup-judge-profiles-state-directories.md
// (G8b). Closes WY from 42 → ≥50.
//
// Usage:
//   node scripts/ingest/seed-judge-profiles-wy.mjs --dry-run
//   node scripts/ingest/seed-judge-profiles-wy.mjs

import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import pg from 'pg';
import { extractWyJudges } from './lib/judge-profiles-html.mjs';

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

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const DISTRICT_URLS = [
  'https://www.wyocourts.gov/court/district-court-1st-judicial-district-laramie-county/',
  'https://www.wyocourts.gov/court/district-court-2nd-judicial-district-albany-county/',
  'https://www.wyocourts.gov/court/district-court-2nd-judicial-district-carbon-county/',
  'https://www.wyocourts.gov/court/district-court-3rd-judicial-district-lincoln-county/',
  'https://www.wyocourts.gov/court/district-court-3rd-judicial-district-sweetwater-county/',
  'https://www.wyocourts.gov/court/district-court-3rd-judicial-district-uinta-county/',
  'https://www.wyocourts.gov/court/district-court-4th-judicial-district-johnson-county/',
  'https://www.wyocourts.gov/court/district-court-4th-judicial-district-sheridan-county/',
  'https://www.wyocourts.gov/court/district-court-5th-judicial-district-big-horn-county/',
  'https://www.wyocourts.gov/court/district-court-5th-judicial-district-hot-springs-county/',
  'https://www.wyocourts.gov/court/district-court-5th-judicial-district-park-county/',
  'https://www.wyocourts.gov/court/district-court-5th-judicial-district-washakie-county/',
  'https://www.wyocourts.gov/court/district-court-6th-judicial-district-campbell-county/',
  'https://www.wyocourts.gov/court/district-court-6th-judicial-district-crook-county/',
  'https://www.wyocourts.gov/court/district-court-6th-judicial-district-weston-county/',
  'https://www.wyocourts.gov/court/district-court-7th-judicial-district-natrona-county/',
  'https://www.wyocourts.gov/court/district-court-8th-judicial-district-converse-county/',
  'https://www.wyocourts.gov/court/district-court-8th-judicial-district-goshen-county/',
  'https://www.wyocourts.gov/court/district-court-8th-judicial-district-niobrara-county/',
  'https://www.wyocourts.gov/court/district-court-8th-judicial-district-platte-county/',
  'https://www.wyocourts.gov/court/district-court-9th-judicial-district-fremont-county/',
  'https://www.wyocourts.gov/court/district-court-9th-judicial-district-sublette-county/',
  'https://www.wyocourts.gov/court/district-court-9th-judicial-district-teton-county/',
];

const CIRCUIT_URLS = [
  'https://www.wyocourts.gov/court/circuit-court-of-the-1st-judicial-district-laramie-county-state-of-wyoming-cheyenne/',
  'https://www.wyocourts.gov/court/circuit-court-of-the-2nd-judicial-district-albany-county-state-of-wyoming-laramie/',
  'https://www.wyocourts.gov/court/circuit-court-of-the-2nd-judicial-district-carbon-county-state-of-wyoming-rawlins/',
  'https://www.wyocourts.gov/court/circuit-court-of-the-3rd-judicial-district-lincoln-county-state-of-wyoming-afton/',
  'https://www.wyocourts.gov/court/circuit-court-of-the-3rd-judicial-district-lincoln-county-state-of-wyoming-kemmerer/',
  'https://www.wyocourts.gov/court/circuit-court-of-the-3rd-judicial-district-sweetwater-county-state-of-wyoming-rock-springs/',
  'https://www.wyocourts.gov/court/circuit-court-of-the-3rd-judicial-district-uinta-county-state-of-wyoming-evanston/',
  'https://www.wyocourts.gov/court/circuit-court-of-the-4th-judicial-district-johnson-county-state-of-wyoming-buffalo/',
  'https://www.wyocourts.gov/court/circuit-court-of-the-4th-judicial-district-sheridan-county-state-of-wyoming-sheridan/',
  'https://www.wyocourts.gov/court/circuit-court-of-the-5th-judicial-district-big-horn-county-state-of-wyoming-basin/',
  'https://www.wyocourts.gov/court/circuit-court-of-the-5th-judicial-district-big-horn-county-state-of-wyoming-lovell/',
  'https://www.wyocourts.gov/court/circuit-court-of-the-5th-judicial-district-hot-springs-county-state-of-wyoming-thermopolis/',
  'https://www.wyocourts.gov/court/circuit-court-of-the-5th-judicial-district-park-county-state-of-wyoming-cody/',
  'https://www.wyocourts.gov/court/circuit-court-of-the-5th-judicial-district-park-county-state-of-wyoming-powell/',
  'https://www.wyocourts.gov/court/circuit-court-of-the-5th-judicial-district-washakie-county-state-of-wyoming-worland/',
  'https://www.wyocourts.gov/court/circuit-court-of-the-6th-judicial-district-campbell-county-state-of-wyoming-gillette/',
  'https://www.wyocourts.gov/court/circuit-court-of-the-6th-judicial-district-crook-county-state-of-wyoming-sundance/',
  'https://www.wyocourts.gov/court/circuit-court-of-the-6th-judicial-district-weston-county-state-of-wyoming-newcastle/',
  'https://www.wyocourts.gov/court/circuit-court-of-the-7th-judicial-district-natrona-county-state-of-wyoming-casper/',
  'https://www.wyocourts.gov/court/circuit-court-of-the-8th-judicial-district-converse-county-state-of-wyoming-douglas/',
  'https://www.wyocourts.gov/court/circuit-court-of-the-8th-judicial-district-goshen-county-state-of-wyoming-torrington/',
  'https://www.wyocourts.gov/court/circuit-court-of-the-8th-judicial-district-niobrara-county-state-of-wyoming-lusk/',
  'https://www.wyocourts.gov/court/circuit-court-of-the-8th-judicial-district-platte-county-state-of-wyoming-wheatland/',
  'https://www.wyocourts.gov/court/circuit-court-of-the-9th-judicial-district-fremont-county-state-of-wyoming-lander/',
  'https://www.wyocourts.gov/court/circuit-court-of-the-9th-judicial-district-fremont-county-state-of-wyoming-riverton/',
  'https://www.wyocourts.gov/court/circuit-court-of-the-9th-judicial-district-sublette-county-state-of-wyoming-pinedale/',
  'https://www.wyocourts.gov/court/circuit-court-of-the-9th-judicial-district-teton-county-state-of-wyoming-jackson/',
];

const SUPREME_URL = 'https://www.wyocourts.gov/supreme-court/';

const ALL_URLS = [SUPREME_URL, ...DISTRICT_URLS, ...CIRCUIT_URLS];

async function fetchPage(url) {
  const r = await fetch(url, {
    headers: { 'User-Agent': UA, 'Accept': 'text/html', 'Accept-Language': 'en-US,en;q=0.9' },
    redirect: 'follow',
  });
  if (!r.ok) throw new Error('HTTP ' + r.status + ' on ' + url);
  return await r.text();
}

async function fetchAllPages(htmlOverrides) {
  const seen = new Set();
  const candidates = [];
  for (const url of ALL_URLS) {
    let html;
    if (htmlOverrides && htmlOverrides[url]) {
      html = htmlOverrides[url];
    } else {
      html = await fetchPage(url);
    }
    const judges = extractWyJudges(html, url);
    for (const j of judges) {
      const key = j.fullName.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        candidates.push(j);
      }
    }
  }
  return candidates;
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
  const candidates = await fetchAllPages(htmlOverrides);
  console.log('extracted ' + candidates.length + ' unique candidate judges from WY directories');

  const client = await makeDbClient();
  let inserted = 0;
  try {
    const existing = await client.query(
      "SELECT LOWER(full_name) AS name FROM judge_profiles WHERE jurisdiction='WY'"
    );
    const dbNames = new Set(existing.rows.map((r) => r.name));
    const newOnes = candidates.filter((c) => !dbNames.has(c.fullName.toLowerCase()));
    console.log('  ' + newOnes.length + ' new (not in DB); ' + (candidates.length - newOnes.length) + ' already present');

    if (dryRun) {
      console.log('\nDRY-RUN preview:');
      for (const r of newOnes.slice(0, 60)) console.log('  ' + r.fullName + ' -> ' + r.bioUrl);
      return { newOnes };
    }

    for (const r of newOnes) {
      const { rowCount } = await client.query(
        `INSERT INTO judge_profiles (full_name, name_first, name_last, jurisdiction, bio_url, intelligence_status, created_at, updated_at)
         VALUES ($1,$2,$3,'WY',$4,'pending', now(), now())
         ON CONFLICT DO NOTHING`,
        [r.fullName, r.first, r.last, r.bioUrl]
      );
      if (rowCount > 0) inserted += 1;
    }
    console.log('  inserted ' + inserted + ' rows');
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
