// Template: scripts/ingest/fjc-refresh.mjs
// Expert: lukas-fittl
// Pattern: cl-bulk-data-defensive #18
// csv-bulk-checked: none-exists — source is HTML pages, no CSV available
//
// A4 — Brady VT + Innocence Project HTML scrapes.
// Small targeted parses for Defense Playbook ammunition.

import { createBulkClient, bulkCopyRows } from '../lib/pg-bulk-defaults.mjs';
import dotenv from 'dotenv';
dotenv.config({ path: new URL('../../.env.local', import.meta.url) });

const UA = 'Mozilla/5.0 INAA-data-pipeline/1.0 (admin@imnotanattorney.com)';

async function fetchHtml(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'text/html' } });
  if (!res.ok) throw new Error(`${url} ${res.status}`);
  return await res.text();
}

// Naive table-row + link extractors. Avoiding cheerio/jsdom to keep deps minimal.
function extractRows(html, pattern) {
  const out = [];
  const re = new RegExp(pattern, 'gis');
  let m;
  while ((m = re.exec(html)) !== null) {
    out.push(m.slice(1).map(s => s?.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() || ''));
  }
  return out;
}

async function ingestBradyVt(client) {
  console.log(`--- brady_letters_vt ---`);
  const html = await fetchHtml('https://www.acluvt.org/vermont-brady-letter-database/');
  // ACLU VT Brady DB is rendered as a table; extract <tr> rows with cells.
  const rows = extractRows(html, '<tr[^>]*>\\s*<td[^>]*>([^<]+)</td>\\s*<td[^>]*>([^<]+)</td>\\s*<td[^>]*>([^<]+)</td>\\s*<td[^>]*>([^<]+)</td>');
  console.log(`  ${rows.length} rows extracted`);
  if (rows.length === 0) { console.warn(`  WARN: extractor found no rows — table layout may have changed. Check HTML manually.`); return; }

  await client.query(`DROP TABLE IF EXISTS brady_letters_vt`);
  await client.query(`CREATE TABLE brady_letters_vt (
    officer_name TEXT, agency TEXT, letter_date TEXT, reason TEXT,
    fetched_at TIMESTAMPTZ DEFAULT now()
  )`);
  async function* gen() { for (const r of rows) yield [r[0], r[1], r[2], r[3]]; }
  const res = await bulkCopyRows(client, 'brady_letters_vt', ['officer_name', 'agency', 'letter_date', 'reason'], gen());
  console.log(`  COPY ${res.rowCount} rows`);
}

async function ingestInnocenceProject(client) {
  console.log(`--- innocence_project_resources ---`);
  const html = await fetchHtml('https://innocenceproject.org/research-resources/');
  // Extract <a href="..."> blocks inside article body
  const linkRe = /<a[^>]+href="(https?:\/\/[^"]+)"[^>]*>([^<]{10,300})<\/a>/gi;
  const seen = new Set();
  const rows = [];
  let m;
  while ((m = linkRe.exec(html)) !== null) {
    const url = m[1];
    const title = m[2].trim().replace(/\s+/g, ' ');
    if (seen.has(url)) continue;
    if (!/innocenceproject\.org|nij\.gov|\.edu|doj\.gov|archive\.org/.test(url)) continue;
    seen.add(url);
    rows.push([title, url]);
  }
  console.log(`  ${rows.length} research links extracted`);
  if (rows.length === 0) { console.warn(`  WARN: no links matched filter — layout may have changed.`); return; }

  await client.query(`DROP TABLE IF EXISTS innocence_project_resources`);
  await client.query(`CREATE TABLE innocence_project_resources (
    title TEXT, url TEXT, fetched_at TIMESTAMPTZ DEFAULT now()
  )`);
  async function* gen() { for (const r of rows) yield r; }
  const res = await bulkCopyRows(client, 'innocence_project_resources', ['title', 'url'], gen());
  console.log(`  COPY ${res.rowCount} rows`);
}

const { client, cleanup } = await createBulkClient({ workMemMB: 256, maintWorkMemMB: 256, statementTimeout: '10min' });
try {
  console.log(`=== A4 brady-innocence-html ${new Date().toISOString()} ===`);
  await ingestBradyVt(client).catch(e => console.error(`FAIL brady: ${e.message}`));
  await ingestInnocenceProject(client).catch(e => console.error(`FAIL innocence: ${e.message}`));
} finally { await cleanup(); }
