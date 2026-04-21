/**
 * walkerdb-scotus-cases.mjs
 *
 * Loads the walkerdb/supreme_court_transcripts dataset (Oyez-mirrored SCOTUS cases)
 * into public.scotus_cases. 8,415 case JSON files, ~80MB table, COPY-loaded.
 *
 * Per-turn oral-argument transcripts are NOT loaded here — separate followup.
 *
 * Plan: ImNotAnAttorney/docs/plans/2026-04-21-walkerdb-scotus-ingest.md
 *
 * Template: scripts/marshall-covid-prisons-ingest.mjs (bulkCopyRows pattern)
 * Expert: cl-bulk-data-defensive #17 + #18 (COPY FROM STDIN, session defenses)
 * csv-bulk-checked: github bulk via shallow clone of walkerdb/supreme_court_transcripts; no Oyez API fetches in this script
 *
 * Usage:
 *   REPO_PATH=D:/inaa-bulk/walkerdb/repo node scripts/ingest/walkerdb-scotus-cases.mjs
 *   # defaults REPO_PATH to D:/inaa-bulk/walkerdb/repo
 */

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { createBulkClient, bulkCopyRows } from '../lib/pg-bulk-defaults.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
dotenv.config({ path: path.join(PROJECT_ROOT, '.env.local') });

const REPO_PATH = process.env.REPO_PATH || 'D:/inaa-bulk/walkerdb/repo';
const CASES_DIR = path.join(REPO_PATH, 'oyez', 'cases');

const TABLE = 'public.scotus_cases';

const COLUMNS = [
  'case_id',
  'oyez_href',
  'name',
  'term',
  'docket_number',
  'additional_docket_numbers',
  'citation_volume',
  'citation_page',
  'citation_year',
  'first_party',
  'first_party_label',
  'second_party',
  'second_party_label',
  'facts_of_the_case',
  'question',
  'conclusion',
  'description',
  'manner_of_jurisdiction',
  'location_json',
  'lower_court_json',
  'decided_by_json',
  'heard_by_json',
  'advocates_json',
  'decisions_json',
  'related_cases_json',
  'written_opinion_json',
  'opinion_announcement_json',
  'oral_argument_audio_json',
  'argument2_url',
  'justia_url',
  'timeline_json',
  'decided_unix',
  'decided_date',
  'view_count',
];

function jsonb(v) {
  if (v === null || v === undefined) return null;
  return v;
}

function firstString(v) {
  if (v === null || v === undefined) return null;
  // Trim non-string inputs too (numeric citation fields sometimes come
  // through as Number). Prevents "0" leaking when Oyez returns numeric 0.
  const s = typeof v === 'string' ? v : String(v);
  const trimmed = s.trim();
  return trimmed || null;
}

function decidedDateFromTimeline(timeline) {
  if (!Array.isArray(timeline)) return { unix: null, date: null };
  // Pick the LAST 'Decided' event in the timeline. Cases with rehearings or
  // remand-then-decided show multiple Decided events; the final one is the
  // operative decision (code-review finding #33).
  let chosen = null;
  for (const ev of timeline) {
    if (ev && ev.event === 'Decided' && Array.isArray(ev.dates) && ev.dates.length > 0) {
      const unix = Number(ev.dates[0]);
      if (Number.isFinite(unix)) chosen = unix;
    }
  }
  if (chosen === null) return { unix: null, date: null };
  const d = new Date(chosen * 1000);
  if (isNaN(d.getTime())) return { unix: chosen, date: null };
  return { unix: chosen, date: d.toISOString().slice(0, 10) };
}

function caseToRow(rec) {
  const citation = rec.citation && typeof rec.citation === 'object' ? rec.citation : {};
  const timeline = rec.timeline;
  const decided = decidedDateFromTimeline(timeline);
  const caseId = Number(rec.ID);
  if (!Number.isFinite(caseId)) return null;

  return [
    caseId,
    firstString(rec.href),
    firstString(rec.name),
    firstString(rec.term),
    firstString(rec.docket_number),
    jsonb(rec.additional_docket_numbers),
    firstString(citation.volume),
    firstString(citation.page),
    firstString(citation.year),
    firstString(rec.first_party),
    firstString(rec.first_party_label),
    firstString(rec.second_party),
    firstString(rec.second_party_label),
    firstString(rec.facts_of_the_case),
    firstString(rec.question),
    firstString(rec.conclusion),
    firstString(rec.description),
    firstString(rec.manner_of_jurisdiction),
    jsonb(rec.location),
    jsonb(rec.lower_court),
    jsonb(rec.decided_by),
    jsonb(rec.heard_by),
    jsonb(rec.advocates),
    jsonb(rec.decisions),
    jsonb(rec.related_cases),
    jsonb(rec.written_opinion),
    jsonb(rec.opinion_announcement),
    jsonb(rec.oral_argument_audio),
    firstString(rec.argument2_url),
    firstString(rec.justia_url),
    jsonb(timeline),
    decided.unix,
    decided.date,
    Number.isFinite(Number(rec.view_count)) ? Number(rec.view_count) : null,
  ];
}

function listCaseFiles(dir) {
  const all = fs.readdirSync(dir);
  return all
    .filter((f) => f.endsWith('.json') && !/-t\d+\.json$/.test(f))
    .map((f) => path.join(dir, f));
}

async function* readCasesAsRows(files) {
  let skipped = 0;
  let loaded = 0;
  const seen = new Set();
  for (const f of files) {
    let rec;
    try {
      // Non-blocking read so the event loop stays responsive while COPY
      // consumes the async iterable.
      rec = JSON.parse(await fsp.readFile(f, 'utf8'));
    } catch (err) {
      skipped++;
      continue;
    }
    const row = caseToRow(rec);
    if (!row) { skipped++; continue; }
    const id = row[0];
    if (seen.has(id)) { skipped++; continue; }
    seen.add(id);
    loaded++;
    yield row;
    if (loaded % 1000 === 0) {
      console.log(`  ${loaded}/${files.length} rows streamed...`);
    }
  }
  console.log(`  done: loaded=${loaded}, skipped=${skipped}, total-files=${files.length}`);
}

async function main() {
  if (!fs.existsSync(CASES_DIR)) {
    throw new Error(
      `Cases dir not found: ${CASES_DIR}\n` +
      `Clone the repo first:\n  git clone --depth=1 https://github.com/walkerdb/supreme_court_transcripts.git ${path.dirname(CASES_DIR).replace(/\\/g,'/')}`
    );
  }

  const files = listCaseFiles(CASES_DIR);
  console.log(`case files: ${files.length}`);
  if (files.length < 1000) {
    throw new Error(`expected >1000 case files, got ${files.length} — repo path may be wrong`);
  }

  const { client, cleanup } = await createBulkClient({
    workMemMB: 256,
    maintWorkMemMB: 1024,
    statementTimeout: '30min',
  });

  try {
    console.log(`truncating ${TABLE}...`);
    await client.query(`TRUNCATE TABLE ${TABLE}`);

    console.log(`COPY loading ${files.length} rows...`);
    const result = await bulkCopyRows(client, TABLE, COLUMNS, readCasesAsRows(files));
    console.log(`loaded ${result.rowCount} rows in ${(result.durationMs / 1000).toFixed(1)}s`);

    const countRes = await client.query(`SELECT COUNT(*)::int AS n FROM ${TABLE}`);
    console.log(`verified row count: ${countRes.rows[0].n}`);

    const fieldsRes = await client.query(`
      SELECT
        COUNT(*)                                             AS total,
        COUNT(facts_of_the_case) FILTER (WHERE facts_of_the_case <> '') AS with_facts,
        COUNT(question)          FILTER (WHERE question <> '')          AS with_question,
        COUNT(conclusion)        FILTER (WHERE conclusion <> '')        AS with_conclusion,
        MIN(citation_year)                                   AS oldest_year,
        MAX(citation_year)                                   AS newest_year
      FROM ${TABLE}
    `);
    console.log('coverage:', fieldsRes.rows[0]);

    const sampleRes = await client.query(`
      SELECT name, citation_year, left(conclusion, 120) AS conclusion_snip
      FROM ${TABLE}
      WHERE name ILIKE 'Miranda v. Arizona%'
      LIMIT 2
    `);
    console.log('Miranda sample:', sampleRes.rows);

    const ftsRes = await client.query(`
      SELECT name, citation_year,
             ts_rank(
               to_tsvector('english',
                 COALESCE(name,'') || ' ' || COALESCE(question,'') || ' ' ||
                 COALESCE(facts_of_the_case,'') || ' ' || COALESCE(conclusion,'')),
               plainto_tsquery('english','fourth amendment unreasonable search')
             ) AS rank
      FROM ${TABLE}
      WHERE to_tsvector('english',
              COALESCE(name,'') || ' ' || COALESCE(question,'') || ' ' ||
              COALESCE(facts_of_the_case,'') || ' ' || COALESCE(conclusion,''))
            @@ plainto_tsquery('english','fourth amendment unreasonable search')
      ORDER BY rank DESC
      LIMIT 5
    `);
    console.log('FTS test — top 5 for "fourth amendment unreasonable search":');
    for (const r of ftsRes.rows) console.log(`  ${r.rank.toFixed(3)}  ${r.name} (${r.citation_year})`);
  } finally {
    await cleanup();
  }
}

main().catch((err) => {
  console.error('FAILED:', err && err.message ? err.message : err);
  process.exit(1);
});
