// Template: scripts/ingest/seed-judge-profiles-nd.mjs
// Pattern: cl-bulk-data-defensive #17 — extractor unit test + DB count assertion
// csv-bulk-checked: none-exists — self-contained test using fixture HTML
//
// PR judge-profiles extractor test (G8b).
// 1. Unit-tests extractPrJudges() against saved fixture HTML.
// 2. Asserts ≥30 names extracted with valid Spanish-name shape.
// 3. Asserts DB count for jurisdiction='PR' is ≥50 after ingest.
//
// Usage: node scripts/ingest/__tests__/judge-profiles-pr.test.mjs
// Exit 0 = all pass. Exit 1 = at least one assertion failed.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { extractPrJudges } from '../lib/judge-profiles-html.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = path.join(__dirname, '..', '__fixtures__');

// Load .env
const envTxt = fs.readFileSync('C:/Users/email/projects/ImNotAnAttorney-web/.env.local', 'utf-8');
for (const line of envTxt.split(/\r?\n/)) {
  const eq = line.indexOf('=');
  if (eq <= 0) continue;
  const key = line.slice(0, eq);
  if (!/^[A-Z_][A-Z0-9_]*$/.test(key)) continue;
  if (!process.env[key]) process.env[key] = line.slice(eq + 1);
}

let passed = 0;
let failed = 0;

function assert(condition, label, detail = '') {
  if (condition) {
    console.log(`  PASS  ${label}`);
    passed++;
  } else {
    console.error(`  FAIL  ${label}${detail ? ' — ' + detail : ''}`);
    failed++;
  }
}

// Spanish-name shape: 2+ tokens each starting with an uppercase letter (including accented).
// Allows middle initials like "F."
const SPANISH_NAME_RE = /^[A-ZÁÉÍÑÓÚÜ][a-záéíñóúü'.\-]+(?:\s+[A-ZÁÉÍÑÓÚÜ][a-záéíñóúü'.A-ZÁÉÍÑÓÚÜ\-]*){1,5}$/u;

function isValidSpanishName(name) {
  return SPANISH_NAME_RE.test(name);
}

console.log('\n=== PR Judge Profiles — Unit Tests (extractor) ===\n');

// ── Test 1: Appeals fixture ──────────────────────────────────────────────────
const APPEALS_URL = 'https://poderjudicial.pr/tribunal-apelaciones/jueces-del-tribunal-de-apelaciones/';
const appealsFixture = path.join(FIXTURE_DIR, 'pr-apelaciones.html');

let appealsHtml = '';
if (fs.existsSync(appealsFixture)) {
  appealsHtml = fs.readFileSync(appealsFixture, 'utf-8');
} else {
  console.warn('  WARN  Appeals fixture missing — skipping fixture tests');
}

let appealsNames = [];
if (appealsHtml) {
  appealsNames = extractPrJudges(appealsHtml, APPEALS_URL);
  console.log(`  Appeals extracted: ${appealsNames.length} names`);
  assert(appealsNames.length >= 20, 'Appeals: ≥20 names extracted', `got ${appealsNames.length}`);

  const invalidAppeals = appealsNames.filter((n) => !isValidSpanishName(n.fullName));
  assert(invalidAppeals.length === 0, 'Appeals: all names match Spanish-name shape',
    invalidAppeals.length > 0 ? 'invalid: ' + invalidAppeals.map((n) => n.fullName).join(', ') : '');

  const dupCheck = new Set(appealsNames.map((n) => n.fullName.toLowerCase()));
  assert(dupCheck.size === appealsNames.length, 'Appeals: no duplicate names');

  // Spot-check known judges
  const known = ['Roberto Sánchez Ramos', 'Waleska Aldebol Mora', 'Giselle Romero García'];
  for (const k of known) {
    const found = appealsNames.some(
      (n) => n.fullName.toLowerCase().replace(/[áéíóú]/g, (c) => ({á:'a',é:'e',í:'i',ó:'o',ú:'u'}[c])) ===
             k.toLowerCase().replace(/[áéíóú]/g, (c) => ({á:'a',é:'e',í:'i',ó:'o',ú:'u'}[c]))
    );
    assert(found, `Appeals: known judge present — ${k}`);
  }

  // bioUrl correct
  assert(
    appealsNames.every((n) => n.bioUrl === APPEALS_URL),
    'Appeals: all bioUrls point to directory page'
  );
}

// ── Test 2: Supreme Court fixture ────────────────────────────────────────────
const SUPREME_URL = 'https://poderjudicial.pr/tribunal-supremo/composicion-del-tribunal-supremo/';
const supremeFixture = path.join(FIXTURE_DIR, 'pr-supremo.html');

let supremeHtml = '';
if (fs.existsSync(supremeFixture)) {
  supremeHtml = fs.readFileSync(supremeFixture, 'utf-8');
} else {
  console.warn('  WARN  Supreme fixture missing — skipping fixture tests');
}

let supremeNames = [];
if (supremeHtml) {
  supremeNames = extractPrJudges(supremeHtml, SUPREME_URL);
  console.log(`  Supreme extracted: ${supremeNames.length} names`);
  assert(supremeNames.length >= 5, 'Supreme: ≥5 names extracted', `got ${supremeNames.length}`);

  const invalidSupreme = supremeNames.filter((n) => !isValidSpanishName(n.fullName));
  assert(invalidSupreme.length === 0, 'Supreme: all names match Spanish-name shape',
    invalidSupreme.length > 0 ? 'invalid: ' + invalidSupreme.map((n) => n.fullName).join(', ') : '');
}

// ── Test 3: Combined ≥30 unique names ────────────────────────────────────────
if (appealsHtml && supremeHtml) {
  const combined = new Set([
    ...appealsNames.map((n) => n.fullName.toLowerCase()),
    ...supremeNames.map((n) => n.fullName.toLowerCase()),
  ]);
  console.log(`  Combined unique: ${combined.size} names`);
  assert(combined.size >= 30, `Combined: ≥30 unique names`, `got ${combined.size}`);
}

// ── Test 4: DB count assertion (post-ingest) ──────────────────────────────────
console.log('\n=== PR Judge Profiles — DB Count Test ===\n');
try {
  const u = new URL(process.env.SUPABASE_DB_URL);
  u.port = '5432';
  const client = new pg.Client({ connectionString: u.toString(), ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query("SET statement_timeout = '30s'");
    const { rows } = await client.query(
      "SELECT COUNT(*) AS cnt FROM judge_profiles WHERE jurisdiction = 'PR'"
    );
    const cnt = parseInt(rows[0].cnt, 10);
    console.log(`  DB PR count: ${cnt}`);
    assert(cnt >= 50, `DB: jurisdiction='PR' count ≥50`, `got ${cnt}`);
  } finally {
    await client.end();
  }
} catch (err) {
  console.error('  FAIL  DB connection error:', err.message);
  failed++;
}

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n=== ${passed} passed, ${failed} failed ===\n`);
process.exit(failed > 0 ? 1 : 0);
