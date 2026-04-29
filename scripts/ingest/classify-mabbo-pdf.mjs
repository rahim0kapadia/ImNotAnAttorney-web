// csv-bulk-checked: none-exists — per-row PDF fetch + classify is the only path to
//   distinguish sanction types within the BBO `bd*` prefix (which spans disbarment,
//   suspension, public reprimand, indefinite suspension, etc.).
// Template: scripts/ingest/scrape-mabbo-discipline.mjs (BBO conventions)
// Pattern: cl-bulk-data-defensive #18 (single-tx UPDATE, never per-row INSERT)
//
// MA BBO PDF classifier — upgrade `discipline_type='unknown'` rows to specific
// sanctions by fetching the order PDF and keyword-scanning the body.
//
// Source: each row's `source_url` is `https://www.massbbo.org/Files?fileName=<code>.pdf`
// (HTTPS, no auth required, no WAF). PDFs are short (typically 1-5 pages).
//
// Pipeline:
//   1. SELECT MABBO:<id> rows with discipline_type='unknown'
//   2. For each, fetch the PDF, extract text via pdf-parse
//   3. Keyword-scan; pick the most-specific sanction
//   4. Bulk UPDATE in a single transaction
//
// Idempotent: re-running on already-classified rows is a no-op. Partial runs OK.
//
// Usage:
//   node scripts/ingest/classify-mabbo-pdf.mjs                  # dry-run all unknown
//   node scripts/ingest/classify-mabbo-pdf.mjs --apply
//   node scripts/ingest/classify-mabbo-pdf.mjs --limit 50       # smoke
//   node scripts/ingest/classify-mabbo-pdf.mjs --rate-ms 800    # politeness (default 600)
//   node scripts/ingest/classify-mabbo-pdf.mjs --help

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { createRequire } from 'node:module';

import dotenv from 'dotenv';
dotenv.config({ path: new URL('../../.env.local', import.meta.url) });

import { query, end } from '../lib/db.mjs';

const __filename = fileURLToPath(import.meta.url);
const require = createRequire(import.meta.url);
const { PDFParse } = require('pdf-parse');

const USER_AGENT =
  'INAA-Crawler/1.0 (+https://imnotanattorney.com; contact: noreply-legal@inaa.com)';

// ── Sanction classifier ───────────────────────────────────────────────────────
//
// Order matters: most-specific first. Each pattern returns the canonical
// discipline_type enum value. Matches the taxonomy already in
// scrape-mabbo-discipline.mjs DISCIPLINE_PATTERNS.
//
// Keywords drawn from BBO order language conventions (verified via spot-check
// of bd*, ad*, pr* PDFs sampled 2026-04-29):
//   - "is hereby DISBARRED"           → disbarment
//   - "is hereby SUSPENDED"           → suspension
//   - "indefinite suspension"         → suspension (per ABA + MA convention)
//   - "interim suspension" / "temporary suspension" → interim_suspension
//   - "PUBLIC REPRIMAND"              → public_reprimand
//   - "ADMONITION"                    → admonition
//   - "RESIGNATION pursuant to ..."   → resignation_with_charges
//   - "disability inactive status"    → disability_inactive
//   - "reciprocal discipline"         → reciprocal_discipline
//
export const PDF_DISCIPLINE_PATTERNS = [
  [/reciprocal\s+discipline/i,                                   'reciprocal_discipline'],
  [/disability\s+inactive\s+status|placed\s+on\s+disability/i,   'disability_inactive'],
  [/interim\s+suspen|temporary\s+suspen|emergency\s+suspen/i,    'interim_suspension'],
  [/(is\s+hereby\s+|hereby\s+)?disbar(?:red|ment|s)\b/i,          'disbarment'],
  [/resign(?:ation|ed)\s+(?:with\s+|in\s+lieu\s+of\s+)?(?:pending\s+)?(?:disciplinary\s+)?(?:charges|proceedings|investigation)/i, 'resignation_with_charges'],
  [/(?:public\s+)?reprimand/i,                                   'public_reprimand'],
  [/admonition|admonish(?:ed|ment)/i,                            'admonition'],
  [/indefinite\s+suspen/i,                                       'suspension'],
  [/(?:is\s+hereby\s+|hereby\s+)?suspen(?:ded|sion)/i,            'suspension'],
];

export function classifyByPdfText(text) {
  if (!text || text.length < 50) return null; // PDF parse failure / too short
  // Score: pick the first match (specificity ordering). For multi-mention orders
  // (e.g. order discusses disbarment as alternative but imposes suspension),
  // count occurrences and return the most-frequent specific type.
  const counts = new Map();
  for (const [re, type] of PDF_DISCIPLINE_PATTERNS) {
    const matches = text.match(new RegExp(re.source, re.flags + 'g'));
    if (matches && matches.length) {
      counts.set(type, (counts.get(type) || 0) + matches.length);
    }
  }
  if (counts.size === 0) return null;
  // Sort by count desc, then by pattern-order (specificity-first tie-break)
  const ordered = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  return ordered[0][0];
}

// ── HTTP fetch + parse ────────────────────────────────────────────────────────

// `https://www.massbbo.org/Files?fileName=<file>.pdf` is a Salesforce
// Community redirect proxy — it returns ~600B HTML containing a JS redirect to
// `https://bbopublic.massbbo.org/web/f/<file>.pdf` (the real Azure-Blob-hosted
// PDF). curl sees the HTML; we have to extract the redirect target manually
// because Node's fetch follows HTTP redirects but not JS-window.location ones.
//
// Fallback chain:
//   1. Direct GET on the original URL — if Content-Type is application/pdf, use it.
//   2. Otherwise, parse JS redirect target from the HTML body.
//   3. Fetch the redirect target — must return application/pdf.
//
const BBO_REDIRECT_RE = /window\.location\.(?:replace\s*\(|href\s*=)\s*['"]([^'"]+)['"]/i;

async function fetchPdfBuffer(url) {
  const r = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, redirect: 'follow' });
  if (!r.ok) throw new Error(`HTTP ${r.status} — ${url}`);
  const ct = r.headers.get('content-type') || '';
  const buf = Buffer.from(await r.arrayBuffer());
  if (ct.includes('application/pdf')) return buf;
  // Treat as HTML redirect proxy: parse target from JS.
  const html = buf.toString('utf8');
  const m = html.match(BBO_REDIRECT_RE);
  if (!m) throw new Error(`no-pdf-no-redirect (ct=${ct}, len=${buf.length}) — ${url}`);
  const redirectUrl = m[1];
  const r2 = await fetch(redirectUrl, { headers: { 'User-Agent': USER_AGENT }, redirect: 'follow' });
  if (!r2.ok) throw new Error(`HTTP ${r2.status} — ${redirectUrl}`);
  const ct2 = r2.headers.get('content-type') || '';
  if (!ct2.includes('application/pdf')) {
    throw new Error(`redirect target not pdf (ct=${ct2}) — ${redirectUrl}`);
  }
  return Buffer.from(await r2.arrayBuffer());
}

async function fetchPdfText(url) {
  const buf = await fetchPdfBuffer(url);
  if (buf.length < 100) return '';
  try {
    const parser = new PDFParse({ data: buf });
    const { text } = await parser.getText();
    return text || '';
  } catch (e) {
    throw new Error(`pdf-parse failed: ${e.message}`);
  }
}

// ── CLI ──────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = argv.slice(2);
  const out = {
    apply: false,
    limit: Infinity,
    rateMs: 600,
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--apply') out.apply = true;
    else if (a === '--limit') out.limit = parseInt(args[++i], 10);
    else if (a === '--rate-ms') out.rateMs = parseInt(args[++i], 10);
    else if (a === '--help' || a === '-h') {
      const h = fs.readFileSync(__filename, 'utf8').split('\n').slice(0, 35).join('\n');
      console.log(h);
      process.exit(0);
    }
  }
  return out;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const OPTS = parseArgs(process.argv);
  console.error(`[mabbo-classify] start — apply=${OPTS.apply} limit=${OPTS.limit} rateMs=${OPTS.rateMs}`);

  // Pull all MABBO unknown-discipline rows.
  const rows = await query(`
    SELECT bar_number, source_url
    FROM attorney_discipline_events
    WHERE jurisdiction='MA'
      AND bar_number LIKE 'MABBO:%'
      AND discipline_type='unknown'
    ORDER BY order_date DESC, bar_number
    LIMIT $1
  `, [Number.isFinite(OPTS.limit) ? OPTS.limit : 100000]);
  console.error(`[mabbo-classify] candidates: ${rows.length}`);

  if (rows.length === 0) {
    console.error('[mabbo-classify] nothing to do');
    await end();
    return;
  }

  const upgrades = []; // {bar_number, new_type}
  const counts = new Map();
  let processed = 0;
  let httpErrors = 0;
  let parseErrors = 0;
  let unclassified = 0;

  for (const row of rows) {
    processed++;
    try {
      const text = await fetchPdfText(row.source_url);
      const newType = classifyByPdfText(text);
      if (newType) {
        upgrades.push({ bar_number: row.bar_number, new_type: newType });
        counts.set(newType, (counts.get(newType) || 0) + 1);
      } else {
        unclassified++;
      }
    } catch (e) {
      const msg = e.message || String(e);
      if (/^HTTP \d+/.test(msg)) httpErrors++;
      else parseErrors++;
      if (processed % 50 === 0 || processed <= 5) {
        console.error(`[mabbo-classify] err ${row.bar_number}: ${msg}`);
      }
    }

    if (processed % 100 === 0) {
      console.error(`[mabbo-classify] progress ${processed}/${rows.length} upgrades=${upgrades.length} httpErr=${httpErrors} parseErr=${parseErrors} unclassified=${unclassified}`);
    }
    if (processed < rows.length) await sleep(OPTS.rateMs);
  }

  console.error(`[mabbo-classify] done ${processed}/${rows.length}: upgrades=${upgrades.length} httpErr=${httpErrors} parseErr=${parseErrors} unclassified=${unclassified}`);
  console.error(`[mabbo-classify] type breakdown:`, Object.fromEntries(counts));

  if (!OPTS.apply) {
    console.error('[mabbo-classify] dry-run — pass --apply to write upgrades');
    await end();
    return;
  }

  if (upgrades.length === 0) {
    console.error('[mabbo-classify] no upgrades to apply');
    await end();
    return;
  }

  // Bulk UPDATE in single transaction. Use unnest() for parameter array.
  const barNumbers = upgrades.map((u) => u.bar_number);
  const newTypes = upgrades.map((u) => u.new_type);
  await query(`BEGIN`);
  try {
    const upd = await query(`
      WITH upgrades AS (
        SELECT * FROM unnest($1::text[], $2::text[]) AS u(bar_number, new_type)
      )
      UPDATE attorney_discipline_events e
         SET discipline_type = u.new_type
        FROM upgrades u
       WHERE e.jurisdiction='MA'
         AND e.bar_number = u.bar_number
         AND e.discipline_type='unknown'
      RETURNING e.bar_number;
    `, [barNumbers, newTypes]);
    console.error(`[mabbo-classify] UPDATE rowCount: ${upd.length}`);
    await query(`COMMIT`);
    console.error('[mabbo-classify] committed');
  } catch (err) {
    try { await query(`ROLLBACK`); } catch {}
    throw err;
  } finally {
    await end();
  }
}

const invoked = (() => {
  try {
    return process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1]);
  } catch {
    return false;
  }
})();
if (invoked) {
  main().catch((err) => { console.error(err); process.exit(1); });
}
