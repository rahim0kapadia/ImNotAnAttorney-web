// csv-bulk-checked: none-exists — Prison Policy Initiative publishes parole-rate data as an HTML table at /data/parolerates_2019_2022.html; no CSV/XLSX per page inspection 2026-04-24.
// Template: scripts/ingest/scrape-flbar-discipline.mjs (fetch + regex + bulkCopyRows pattern)
// Expert: chris-dreyer (niche domination — parole-board stats deepen IB $997 appendix)
// Pattern: cl-bulk-data-defensive #18 (COPY FROM STDIN)
//
// Prison Policy Initiative — Discretionary Parole Grant Rates by State, 2019-2022.
//
// Source (confirmed 2026-04-24):
//   https://www.prisonpolicy.org/data/parolerates_2019_2022.html
//   Table id="grantrates". 43 states + DC, 4 years per state = ~172 rows.
//   Columns: state (+ optional PDF link) | 4 × decisions_count | 4 × granted_count
//            | 4 × grant_rate_pct | pct_change_approval_19_22 | pct_change_released_19_22 | notes
//
// N/A cells are stored as NULL (PPI shows "N/A" when state withheld data).
//
// Usage:
//   node scripts/ingest/scrape-ppi-parole-rates.mjs            # dry-run
//   node scripts/ingest/scrape-ppi-parole-rates.mjs --apply    # write DB

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createBulkClient, bulkCopyRows } from '../lib/pg-bulk-defaults.mjs';

const __filename = fileURLToPath(import.meta.url);

const SOURCE_URL = 'https://www.prisonpolicy.org/data/parolerates_2019_2022.html';
const USER_AGENT = 'INAA-Crawler/1.0 (+https://imnotanattorney.com; contact: noreply-legal@inaa.com)';
const YEARS = [2019, 2020, 2021, 2022];

// USPS state code lookup (includes DC).
const STATE_NAME_TO_CODE = {
  'Alabama':'AL','Alaska':'AK','Arizona':'AZ','Arkansas':'AR','California':'CA',
  'Colorado':'CO','Connecticut':'CT','Delaware':'DE','Florida':'FL','Georgia':'GA',
  'Hawaii':'HI','Idaho':'ID','Illinois':'IL','Indiana':'IN','Iowa':'IA','Kansas':'KS',
  'Kentucky':'KY','Louisiana':'LA','Maine':'ME','Maryland':'MD','Massachusetts':'MA',
  'Michigan':'MI','Minnesota':'MN','Mississippi':'MS','Missouri':'MO','Montana':'MT',
  'Nebraska':'NE','Nevada':'NV','New Hampshire':'NH','New Jersey':'NJ','New Mexico':'NM',
  'New York':'NY','North Carolina':'NC','North Dakota':'ND','Ohio':'OH','Oklahoma':'OK',
  'Oregon':'OR','Pennsylvania':'PA','Rhode Island':'RI','South Carolina':'SC',
  'South Dakota':'SD','Tennessee':'TN','Texas':'TX','Utah':'UT','Vermont':'VT',
  'Virginia':'VA','Washington':'WA','West Virginia':'WV','Wisconsin':'WI','Wyoming':'WY',
  'District of Columbia':'DC',
};

function parseArgs(argv) {
  const args = argv.slice(2);
  const out = { apply: false };
  for (const a of args) {
    if (a === '--apply') out.apply = true;
    else if (a === '--help' || a === '-h') {
      console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(0, 24).join('\n'));
      process.exit(0);
    }
  }
  return out;
}
const OPTS = parseArgs(process.argv);

function stripTags(s) {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseIntCell(s) {
  if (s === null || s === undefined) return null;
  const t = String(s).trim();
  if (!t || t.toUpperCase() === 'N/A' || t === '—' || t === '-') return null;
  const clean = t.replace(/,/g, '');
  const n = parseInt(clean, 10);
  return Number.isFinite(n) ? n : null;
}

function parsePctCell(s) {
  if (s === null || s === undefined) return null;
  const t = String(s).trim();
  if (!t || t.toUpperCase() === 'N/A' || t === '—' || t === '-') return null;
  const clean = t.replace(/%/g, '').replace(/,/g, '').trim();
  const n = parseFloat(clean);
  return Number.isFinite(n) ? n : null;
}

async function fetchTable() {
  const resp = await fetch(SOURCE_URL, { headers: { 'User-Agent': USER_AGENT } });
  if (!resp.ok) throw new Error(`HTTP ${resp.status} — ${SOURCE_URL}`);
  const html = await resp.text();
  const tableStart = html.indexOf('id="grantrates"');
  if (tableStart === -1) throw new Error('table id="grantrates" not found');
  const tbodyStart = html.indexOf('<tbody>', tableStart);
  const tbodyEnd = html.indexOf('</tbody>', tbodyStart);
  if (tbodyStart === -1 || tbodyEnd === -1) throw new Error('tbody markers missing');
  return html.slice(tbodyStart + 7, tbodyEnd);
}

function extractRows(tbodyHtml) {
  const rows = [];
  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
  for (const match of tbodyHtml.matchAll(trRe)) {
    const cells = [];
    const tdRe = /<td[^>]*>([\s\S]*?)<\/td>/g;
    for (const m of match[1].matchAll(tdRe)) {
      cells.push(m[1]);
    }
    if (cells.length === 0) continue;
    rows.push(cells);
  }
  return rows;
}

function parseRow(rawCells) {
  // Column layout (empty "spacer" cells omitted by html filter below):
  //   0:   state  (may contain <a href>)
  //   1:   decisions 2019
  //   2:   decisions 2020
  //   3:   decisions 2021
  //   4:   decisions 2022
  //   5:   granted 2019
  //   6:   granted 2020
  //   7:   granted 2021
  //   8:   granted 2022
  //   9:   rate 2019
  //  10:   rate 2020
  //  11:   rate 2021
  //  12:   rate 2022
  //  13:   %change approval 19-22
  //  14:   %change released 19-22
  //  15:   notes
  // PPI table includes interspersed `<td class="empty">` spacer cells — we
  // filter those out first.
  const dataCells = rawCells.filter((raw) => {
    // keep cells that contain something non-empty after stripping tags
    return stripTags(raw).length > 0 || /<a /.test(raw);
  });

  if (dataCells.length < 15) return null;

  // State + optional PDF link
  let sourcePdf = null;
  const stateRaw = dataCells[0];
  const pdfMatch = stateRaw.match(/<a[^>]+href=["']([^"']+)["']/);
  if (pdfMatch) sourcePdf = pdfMatch[1];
  const stateName = stripTags(stateRaw);
  const stateCode = STATE_NAME_TO_CODE[stateName];
  if (!stateCode) return null;

  const decisions = [1, 2, 3, 4].map((i) => parseIntCell(stripTags(dataCells[i])));
  const granted   = [5, 6, 7, 8].map((i) => parseIntCell(stripTags(dataCells[i])));
  const rates     = [9, 10, 11, 12].map((i) => parsePctCell(stripTags(dataCells[i])));
  const pctApproval = parsePctCell(stripTags(dataCells[13]));
  const pctReleased = parsePctCell(stripTags(dataCells[14]));
  const notes = dataCells.length >= 16 ? stripTags(dataCells[15]) : null;

  const rows = [];
  for (let i = 0; i < YEARS.length; i++) {
    rows.push({
      state_code: stateCode,
      year: YEARS[i],
      decisions_count: decisions[i],
      granted_count: granted[i],
      grant_rate_pct: rates[i],
      pct_change_approval_19_22: pctApproval,
      pct_change_released_19_22: pctReleased,
      source_pdf_url: sourcePdf,
      notes: notes && notes.length > 0 ? notes : null,
    });
  }
  return { stateCode, stateName, rows };
}

async function load(records) {
  const { client, cleanup } = await createBulkClient();
  try {
    await client.query(`DROP TABLE IF EXISTS public._stg_ppi_parole`);
    await client.query(`
      CREATE UNLOGGED TABLE public._stg_ppi_parole (
        state_code                  char(2),
        year                        smallint,
        decisions_count             int,
        granted_count               int,
        grant_rate_pct              numeric(5,2),
        pct_change_approval_19_22   numeric(6,2),
        pct_change_released_19_22   numeric(6,2),
        source_pdf_url              text,
        notes                       text
      );
    `);

    const rowsForCopy = records.map((r) => [
      r.state_code, r.year, r.decisions_count, r.granted_count, r.grant_rate_pct,
      r.pct_change_approval_19_22, r.pct_change_released_19_22, r.source_pdf_url, r.notes,
    ]);
    await bulkCopyRows(
      client,
      '_stg_ppi_parole',
      ['state_code','year','decisions_count','granted_count','grant_rate_pct','pct_change_approval_19_22','pct_change_released_19_22','source_pdf_url','notes'],
      rowsForCopy,
    );

    const upsert = await client.query(`
      INSERT INTO public.ppi_parole_rates
        (state_code, year, decisions_count, granted_count, grant_rate_pct,
         pct_change_approval_19_22, pct_change_released_19_22, source_pdf_url, notes)
      SELECT state_code, year, decisions_count, granted_count, grant_rate_pct,
             pct_change_approval_19_22, pct_change_released_19_22, source_pdf_url, notes
      FROM _stg_ppi_parole
      ON CONFLICT (state_code, year) DO UPDATE SET
        decisions_count             = EXCLUDED.decisions_count,
        granted_count               = EXCLUDED.granted_count,
        grant_rate_pct              = EXCLUDED.grant_rate_pct,
        pct_change_approval_19_22   = EXCLUDED.pct_change_approval_19_22,
        pct_change_released_19_22   = EXCLUDED.pct_change_released_19_22,
        source_pdf_url              = COALESCE(EXCLUDED.source_pdf_url, public.ppi_parole_rates.source_pdf_url),
        notes                       = COALESCE(NULLIF(EXCLUDED.notes, ''), public.ppi_parole_rates.notes),
        ingested_at                 = NOW()
      RETURNING state_code;
    `);
    console.error(`[db] ppi_parole_rates upserted: ${upsert.rowCount}`);
    await client.query(`DROP TABLE IF EXISTS public._stg_ppi_parole`);
  } finally {
    await cleanup();
  }
}

async function main() {
  console.error(`[ppi] start — apply=${OPTS.apply} source=${SOURCE_URL}`);

  const tbody = await fetchTable();
  const rawRows = extractRows(tbody);
  console.error(`[ppi] parsed ${rawRows.length} raw table rows`);

  const allRecords = [];
  const stateSummary = [];
  let skippedRows = 0;
  for (const cells of rawRows) {
    const parsed = parseRow(cells);
    if (!parsed) { skippedRows++; continue; }
    allRecords.push(...parsed.rows);
    stateSummary.push(`${parsed.stateCode}(${parsed.stateName})`);
  }
  console.error(`[ppi] parsed ${stateSummary.length} states, ${allRecords.length} yearly records (${skippedRows} rows skipped)`);
  console.error(`[ppi] states: ${stateSummary.slice(0, 10).join(', ')}...`);

  if (!OPTS.apply) {
    console.error(`[ppi] dry-run — sample of first 5 records:`);
    for (const r of allRecords.slice(0, 5)) {
      console.error(`  · ${r.state_code} ${r.year}: decisions=${r.decisions_count ?? 'N/A'} granted=${r.granted_count ?? 'N/A'} rate=${r.grant_rate_pct ?? 'N/A'}%`);
    }
    console.error(`[ppi] dry-run — pass --apply to write to DB`);
    return;
  }

  if (allRecords.length === 0) {
    console.error(`[ppi] no records — nothing to load`);
    return;
  }
  await load(allRecords);
  console.error(`[ppi] done`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
