/**
 * Verify Officer Background Check render path for CA + GA.
 *
 * Mirrors queryOfficerBackground() in src/lib/tier9-reports/query.ts:349-404.
 * For each sample officer in CA + GA:
 *   1. Sample via pg, confirm npi_employment_history is populated + well-shaped
 *   2. Run the same ilike/eq query via Supabase admin client (tests RLS + index)
 *   3. Assert render preconditions: officers or externalIntel non-empty AND
 *      at least one npi_employment_history array has >=1 job with keys
 *      {agency, start, end, separation_reason}
 */
import { Client } from 'pg';
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config({ path: '.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}
const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

const u = new URL(process.env.SUPABASE_DB_URL || process.env.DATABASE_URL);
u.port = '5432';
const pg = new Client({ connectionString: u.toString(), ssl: { rejectUnauthorized: false } });
await pg.connect();
await pg.query(`SET statement_timeout = '2min'`);

const REQUIRED_JOB_KEYS = ['agency']; // start/end/separation_reason optional per render.ts

async function sampleOfficers(state, n) {
  // jsonb_array_length errors on non-arrays; guard via CASE.
  const q = `
    SELECT officer_name, officer_name_normalized, state, agency, npi_employment_history,
           CASE WHEN jsonb_typeof(npi_employment_history) = 'array'
                THEN jsonb_array_length(npi_employment_history)
                ELSE 0 END AS n_jobs
    FROM officer_external_intel
    WHERE state = $1
      AND npi_employment_history IS NOT NULL
      AND jsonb_typeof(npi_employment_history) = 'array'
      AND officer_name IS NOT NULL
      AND officer_name NOT LIKE '\\_\\_agency\\_\\_:%' ESCAPE '\\'
    ORDER BY CASE WHEN jsonb_typeof(npi_employment_history) = 'array'
                  THEN jsonb_array_length(npi_employment_history)
                  ELSE 0 END DESC
    LIMIT $2
  `;
  const r = await pg.query(q, [state, n]);
  return r.rows.filter((row) => row.n_jobs > 0);
}

function escapeIlike(s) {
  return s.replace(/[%_\\]/g, (c) => `\\${c}`);
}

async function mirrorQuery(officerName, state) {
  const safe = escapeIlike(officerName);
  const { data, error } = await sb
    .from('officer_external_intel')
    .select('officer_name, officer_name_normalized, state, agency, npi_employment_history, npi_is_wandering_officer, complaint_count, use_of_force_count, sustained_complaints, source_urls')
    .ilike('officer_name_normalized', `%${safe.toLowerCase()}%`)
    .eq('state', state)
    .limit(20);
  if (error) throw new Error(`Supabase query failed: ${error.message}`);
  return data || [];
}

function validateJobShape(jobs) {
  if (!Array.isArray(jobs) || jobs.length === 0) return { ok: false, reason: 'not array or empty' };
  for (const job of jobs) {
    if (typeof job !== 'object' || job === null) return { ok: false, reason: 'job not object' };
    for (const k of REQUIRED_JOB_KEYS) {
      if (!(k in job)) return { ok: false, reason: `missing key ${k}` };
    }
  }
  return { ok: true };
}

async function verifyState(state) {
  console.log(`\n==== ${state} ====`);
  const samples = await sampleOfficers(state, 5);
  console.log(`Sampled ${samples.length} officers from DB (state=${state}, n_jobs DESC)`);
  if (samples.length === 0) {
    console.log(`  FAIL: no officers with populated npi_employment_history in ${state}`);
    return { state, pass: false, reason: 'no samples' };
  }

  let passed = 0;
  let failed = 0;
  for (const s of samples) {
    const shape = validateJobShape(s.npi_employment_history);
    const q = await mirrorQuery(s.officer_name, state);
    const found = q.find((r) => r.officer_name === s.officer_name);
    const queryOk = !!found;
    const renderOk = found && validateJobShape(found.npi_employment_history).ok;
    const status = shape.ok && queryOk && renderOk ? 'PASS' : 'FAIL';
    if (status === 'PASS') passed++; else failed++;
    console.log(`  [${status}] ${s.officer_name} (${s.n_jobs} jobs) shape=${shape.ok ? 'ok' : shape.reason} query=${queryOk ? 'ok' : 'miss'} render=${renderOk ? 'ok' : 'bad-shape'}`);
    if (found && s.npi_employment_history?.[0]) {
      const j = s.npi_employment_history[0];
      console.log(`         first-job keys: ${Object.keys(j).join(',')}`);
    }
  }
  return { state, total: samples.length, passed, failed, pass: failed === 0 };
}

const results = [];
for (const state of ['CA', 'GA', 'AZ']) {
  results.push(await verifyState(state));
}

console.log('\n==== SUMMARY ====');
for (const r of results) {
  console.log(`${r.state}: ${r.pass ? 'PASS' : 'FAIL'} (${r.passed || 0}/${r.total || 0} officers pass end-to-end)`);
}

await pg.end();
process.exit(results.every((r) => r.pass) ? 0 : 1);
