// csv-bulk-checked: https://www.uscourts.gov/statistics-reports/caseload-statistics-data-tables — AO publishes XLSX per quarter, confirmed 2026-04-24.
// Template: scripts/ingest/scrape-ppi-parole-rates.mjs (fetch + parse + bulkCopyRows pattern)
// Expert: chris-dreyer (niche domination — per-district offense mix deepens IB $997 appendix)
// Pattern: cl-bulk-data-defensive #18 (COPY FROM STDIN)
//
// AO Table D-3 loader — Federal Criminal Defendants Commenced by Offense and District.
// Quarterly XLSX published by uscourts.gov. Scrape per period_end date.
//
// Usage:
//   node scripts/ingest/load-ao-criminal-by-district.mjs                    # dry-run latest
//   node scripts/ingest/load-ao-criminal-by-district.mjs --apply
//   node scripts/ingest/load-ao-criminal-by-district.mjs --period 1231.2025 --apply

import { createRequire } from 'node:module';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createBulkClient, bulkCopyRows } from '../lib/pg-bulk-defaults.mjs';

const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

const __filename = fileURLToPath(import.meta.url);
const USER_AGENT = 'INAA-Crawler/1.0 (+https://imnotanattorney.com; contact: noreply-legal@inaa.com)';

// Latest annual period published as of 2026-04-24.
const DEFAULT_PERIOD = '1231.2025';

function urlForPeriod(period) {
  return `https://www.uscourts.gov/sites/default/files/document/stfj_d3_${period}.xlsx`;
}

function periodToDateISO(period) {
  // "1231.2025" → 2025-12-31 ; "0630.2024" → 2024-06-30
  const m = period.match(/^(\d{2})(\d{2})\.(\d{4})$/);
  if (!m) throw new Error(`invalid --period: ${period}`);
  return `${m[3]}-${m[1]}-${m[2]}`;
}

// Column index → offense_category slug (column layout confirmed from probe 2026-04-24).
const OFFENSE_COLUMNS = [
  // col 1 is "Total" — skipped in emit loop
  { col: 2,  slug: 'homicide' },
  { col: 3,  slug: 'robbery' },
  { col: 4,  slug: 'assault' },
  { col: 5,  slug: 'other_violent' },
  { col: 6,  slug: 'burglary_larceny_theft' },
  { col: 7,  slug: 'embezzlement' },
  { col: 8,  slug: 'fraud' },
  { col: 9,  slug: 'forgery_counterfeiting' },
  { col: 10, slug: 'other_property' },
  { col: 11, slug: 'marijuana' },
  { col: 12, slug: 'all_other_drugs' },
  { col: 13, slug: 'firearms_explosives' },
  { col: 14, slug: 'sex_offenses' },
  { col: 15, slug: 'justice_system' },
  { col: 16, slug: 'improper_reentry_alien' },
  { col: 17, slug: 'other_immigration' },
  { col: 18, slug: 'general' },
  { col: 19, slug: 'regulatory' },
  { col: 20, slug: 'traffic' },
];

// DC circuit is circuit 12 per AO standard.
const CIRCUIT_FOR_DISTRICT = {
  'DC': 12,
  // 1st
  'ME': 1, 'MA': 1, 'NH': 1, 'RI': 1, 'PR': 1,
  // 2nd
  'CT': 2, 'NY,N': 2, 'NY,E': 2, 'NY,S': 2, 'NY,W': 2, 'VT': 2,
  // 3rd
  'DE': 3, 'NJ': 3, 'PA,E': 3, 'PA,M': 3, 'PA,W': 3, 'VI': 3,
  // 4th
  'MD': 4, 'NC,E': 4, 'NC,M': 4, 'NC,W': 4, 'SC': 4, 'VA,E': 4, 'VA,W': 4, 'WV,N': 4, 'WV,S': 4,
  // 5th
  'LA,E': 5, 'LA,M': 5, 'LA,W': 5, 'MS,N': 5, 'MS,S': 5, 'TX,N': 5, 'TX,E': 5, 'TX,S': 5, 'TX,W': 5,
  // 6th
  'KY,E': 6, 'KY,W': 6, 'MI,E': 6, 'MI,W': 6, 'OH,N': 6, 'OH,S': 6, 'TN,E': 6, 'TN,M': 6, 'TN,W': 6,
  // 7th
  'IL,N': 7, 'IL,C': 7, 'IL,S': 7, 'IN,N': 7, 'IN,S': 7, 'WI,E': 7, 'WI,W': 7,
  // 8th
  'AR,E': 8, 'AR,W': 8, 'IA,N': 8, 'IA,S': 8, 'MN': 8, 'MO,E': 8, 'MO,W': 8, 'NE': 8, 'ND': 8, 'SD': 8,
  // 9th
  'AK': 9, 'AZ': 9, 'CA,N': 9, 'CA,E': 9, 'CA,C': 9, 'CA,S': 9, 'HI': 9, 'ID': 9, 'MT': 9, 'NV': 9,
  'OR': 9, 'WA,E': 9, 'WA,W': 9, 'GU': 9, 'NMI': 9,
  // 10th
  'CO': 10, 'KS': 10, 'NM': 10, 'OK,N': 10, 'OK,E': 10, 'OK,W': 10, 'UT': 10, 'WY': 10,
  // 11th
  'AL,N': 11, 'AL,M': 11, 'AL,S': 11, 'FL,N': 11, 'FL,M': 11, 'FL,S': 11, 'GA,N': 11, 'GA,M': 11, 'GA,S': 11,
};

// NMI → MP (Northern Mariana Islands USPS code is MP).
const DISTRICT_CODE_TO_STATE = { 'NMI': 'MP' };

function parseDistrictLabel(label) {
  const s = String(label).trim();
  if (!s || s === 'Total') return null;
  if (/^\s+\d/.test(label)) return null; // circuit rows have leading whitespace
  if (s.length > 50) return null; // footnote row
  if (!CIRCUIT_FOR_DISTRICT[s]) return null; // unknown, skip
  const commaIdx = s.indexOf(',');
  let stateCode;
  let division = null;
  if (commaIdx > 0) {
    stateCode = s.slice(0, commaIdx).trim();
    division = s.slice(commaIdx + 1).trim();
  } else {
    stateCode = DISTRICT_CODE_TO_STATE[s] || s;
  }
  if (stateCode.length !== 2 && stateCode !== 'NMI') return null;
  if (stateCode === 'NMI') stateCode = 'MP';
  return {
    district_code: s,
    state_code: stateCode,
    division,
    circuit: CIRCUIT_FOR_DISTRICT[s],
  };
}

function parseCountCell(v) {
  if (v === null || v === undefined) return null;
  const t = String(v).trim();
  if (!t || t === '-' || t === '—' || t.toUpperCase() === 'N/A') return null;
  const clean = t.replace(/,/g, '');
  const n = parseInt(clean, 10);
  return Number.isFinite(n) ? n : null;
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const out = { apply: false, period: DEFAULT_PERIOD };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--apply') out.apply = true;
    else if (a === '--period') out.period = args[++i];
    else if (a === '--help' || a === '-h') {
      console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(0, 20).join('\n'));
      process.exit(0);
    }
  }
  return out;
}
const OPTS = parseArgs(process.argv);

async function main() {
  const url = urlForPeriod(OPTS.period);
  const periodEnd = periodToDateISO(OPTS.period);
  console.error(`[ao-d3] start — apply=${OPTS.apply} period=${periodEnd} url=${url}`);

  const resp = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!resp.ok) throw new Error(`HTTP ${resp.status} — ${url}`);
  const buf = Buffer.from(await resp.arrayBuffer());
  const wb = XLSX.read(buf, { type: 'buffer' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: false });

  const records = [];
  let skipped = 0;
  for (const row of rows) {
    if (!row || row.length === 0) continue;
    const parsed = parseDistrictLabel(row[0]);
    if (!parsed) { skipped++; continue; }
    for (const { col, slug } of OFFENSE_COLUMNS) {
      const count = parseCountCell(row[col]);
      records.push({
        district_code: parsed.district_code,
        state_code: parsed.state_code,
        division: parsed.division,
        circuit: parsed.circuit,
        period_end: periodEnd,
        offense_category: slug,
        defendant_count: count,
        source_url: url,
      });
    }
  }
  console.error(`[ao-d3] parsed ${records.length} records across ${records.length / OFFENSE_COLUMNS.length} districts (${skipped} non-district rows skipped)`);

  if (!OPTS.apply) {
    console.error(`[ao-d3] dry-run sample:`);
    for (const r of records.slice(0, 5)) {
      console.error(`  · ${r.district_code} ${r.offense_category}: ${r.defendant_count ?? 'NULL'}`);
    }
    return;
  }

  const { client, cleanup } = await createBulkClient();
  try {
    await client.query(`DROP TABLE IF EXISTS public._stg_ao_d3`);
    await client.query(`
      CREATE UNLOGGED TABLE public._stg_ao_d3 (
        district_code    text,
        state_code       char(2),
        division         text,
        circuit          smallint,
        period_end       date,
        offense_category text,
        defendant_count  int,
        source_url       text
      );
    `);
    await bulkCopyRows(
      client,
      '_stg_ao_d3',
      ['district_code','state_code','division','circuit','period_end','offense_category','defendant_count','source_url'],
      records.map((r) => [r.district_code, r.state_code, r.division, r.circuit, r.period_end, r.offense_category, r.defendant_count, r.source_url]),
    );
    const up = await client.query(`
      INSERT INTO public.ao_district_criminal_by_offense
        (district_code, state_code, division, circuit, period_end, offense_category, defendant_count, source_url)
      SELECT district_code, state_code, division, circuit, period_end, offense_category, defendant_count, source_url
      FROM _stg_ao_d3
      ON CONFLICT (district_code, period_end, offense_category) DO UPDATE SET
        defendant_count = EXCLUDED.defendant_count,
        state_code      = EXCLUDED.state_code,
        division        = EXCLUDED.division,
        circuit         = EXCLUDED.circuit,
        source_url      = EXCLUDED.source_url,
        ingested_at     = NOW()
      RETURNING district_code;
    `);
    console.error(`[db] ao_district_criminal_by_offense upserted: ${up.rowCount}`);
    await client.query(`DROP TABLE IF EXISTS public._stg_ao_d3`);
    console.error(`[ao-d3] done`);
  } finally {
    await cleanup();
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
