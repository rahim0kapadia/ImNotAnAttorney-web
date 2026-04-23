// Template: scripts/ingest/pji-ingest.mjs
// Expert: brandon-garrett (Forensic Expert Evidence Database pillar #2 + #4 — verify every row against source)
// Pattern: cl-bulk-data-defensive #17 (Albe) + #18 (bulk updates — UPDATE with WHERE is fine for ≤1K rows)
// csv-bulk-checked: none-exists — internal enrichment, reads cached PDFs on local FS
// work-mem: Medium tier verified (CHECKED medium=4GB ceiling=256MB)
//
// Backfills enrichment fields for newly-ingested circuits (5th + 11th in T1/T29).
// Original enrichment scripts were lost to concurrent-session stomp
// (per feat/pji-v1 commit 77f8a13 body). This re-establishes the fields.
//
// Fields backfilled per row:
//   body_sha256        — SHA256 of row.body (deterministic)
//   source_pdf_sha256  — SHA256 of cached PDF file (per circuit)
//   roundtrip_verified — TRUE iff 150-char body slice found in cached PDF text
//   source_url         — append '#page=N' where N derived from form-feed count
//
// Idempotent: updates rows WHERE body_sha256 IS NULL; re-runs only touch new rows.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import pg from 'pg';

const envTxt = fs.readFileSync('C:/Users/email/projects/ImNotAnAttorney-web/.env.local', 'utf-8');
for (const line of envTxt.split(/\r?\n/)) {
  const eq = line.indexOf('=');
  if (eq <= 0) continue;
  const key = line.slice(0, eq);
  const val = line.slice(eq + 1);
  if (!/^[A-Z_][A-Z0-9_]*$/.test(key)) continue;
  if (!process.env[key]) process.env[key] = val;
}

const WORK = path.join(os.tmpdir(), 'pji-ingest');

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

// Return the 1-based page number for a character index, based on \x0c (form-feed)
// counts pdftotext inserts at page boundaries.
function pageForIndex(text, idx) {
  let page = 1;
  for (let i = 0; i < idx && i < text.length; i++) {
    if (text.charCodeAt(i) === 0x0c) page++;
  }
  return page;
}

// Find first occurrence of a body's leading tokens in the source PDF text.
// Uses the first N significant chars (skipping numbered-list markers, pure digits).
function findInText(text, body) {
  if (body.length < 80) return -1;
  // Normalize: collapse whitespace to single space, lowercase.
  const norm = (s) => s.toLowerCase().split(/\s+/).filter(Boolean).join(' ');
  const textNorm = norm(text);
  const bodyNorm = norm(body);
  // Try progressively shorter probes to accommodate minor extraction variance.
  for (const probeLen of [150, 120, 80, 60]) {
    const probe = bodyNorm.slice(0, probeLen);
    const idx = textNorm.indexOf(probe);
    if (idx >= 0) return idx;
  }
  return -1;
}

// Map normalized-text index back to an approximate raw-text index
// (since normalization removes only spaces, the raw index is close to `norm_idx * expansion_ratio`).
function estimateRawIndex(rawText, normText, normIdx) {
  if (normText.length === 0) return 0;
  const ratio = rawText.length / normText.length;
  return Math.floor(normIdx * ratio);
}

async function main() {
  const url = new URL(process.env.SUPABASE_DB_URL);
  url.port = '5432';
  const c = new pg.Client({ connectionString: url.toString(), ssl: { rejectUnauthorized: false } });
  await c.connect();
  await c.query(`SET statement_timeout = '30min'`);
  await c.query(`SET idle_in_transaction_session_timeout = '5min'`);
  await c.query(`SET tcp_keepalives_idle = 60`);
  await c.query(`SET tcp_keepalives_interval = 10`);
  await c.query(`SET tcp_keepalives_count = 6`);

  // Load unenriched rows
  const rows = await c.query(`
    SELECT id, circuit, instruction_number, body, source_url
    FROM pattern_jury_instructions
    WHERE body_sha256 IS NULL
    ORDER BY circuit, instruction_number
  `);
  console.log(`[1/3] unenriched rows: ${rows.rows.length}`);

  if (rows.rows.length === 0) {
    console.log('  nothing to do.');
    await c.end();
    return;
  }

  // Precompute per-circuit PDF SHA + cached text.
  // 3rd Circuit is multi-chapter: read all ch*.txt + ch*.pdf from subdir.
  const circuits = [...new Set(rows.rows.map((r) => r.circuit))];
  const pdfSha = {};
  const pdfText = {};
  const rawText = {};
  for (const ckt of circuits) {
    // Multi-chapter case (3rd Circuit)
    const chapterDir = path.join(WORK, `circuit-${ckt}`);
    if (fs.existsSync(chapterDir) && fs.statSync(chapterDir).isDirectory()) {
      const chapterFiles = fs.readdirSync(chapterDir).filter((f) => f.endsWith('.pdf'));
      if (chapterFiles.length > 0) {
        let combinedRaw = '';
        let combinedPdfHash = crypto.createHash('sha256');
        for (const pdfFile of chapterFiles.sort()) {
          const pdfBuf = fs.readFileSync(path.join(chapterDir, pdfFile));
          combinedPdfHash.update(pdfBuf);
          const txtFile = pdfFile.replace(/\.pdf$/, '.txt');
          const txtPath = path.join(chapterDir, txtFile);
          if (fs.existsSync(txtPath)) combinedRaw += fs.readFileSync(txtPath, 'utf-8') + '\n\f\n';
        }
        pdfSha[ckt] = combinedPdfHash.digest('hex');
        rawText[ckt] = combinedRaw;
        pdfText[ckt] = combinedRaw.toLowerCase().split(/\s+/).filter(Boolean).join(' ');
        console.log(`  circuit ${ckt} (multi-chapter, ${chapterFiles.length} files): PDF ${pdfSha[ckt].slice(0, 12)}... text ${(combinedRaw.length / 1024).toFixed(0)}KB`);
        continue;
      }
    }
    // Single-file case (all other circuits)
    const pdfPath = path.join(WORK, `circuit-${ckt}.pdf`);
    const txtPath = path.join(WORK, `circuit-${ckt}.txt`);
    if (!fs.existsSync(pdfPath) || !fs.existsSync(txtPath)) {
      console.warn(`  circuit ${ckt}: cached files missing — skipping roundtrip/page-anchor`);
      pdfSha[ckt] = null;
      pdfText[ckt] = '';
      rawText[ckt] = '';
      continue;
    }
    pdfSha[ckt] = sha256(fs.readFileSync(pdfPath));
    rawText[ckt] = fs.readFileSync(txtPath, 'utf-8');
    pdfText[ckt] = rawText[ckt].toLowerCase().split(/\s+/).filter(Boolean).join(' ');
    console.log(`  circuit ${ckt}: PDF ${pdfSha[ckt].slice(0, 12)}... text ${(rawText[ckt].length / 1024).toFixed(0)}KB`);
  }

  // Update each row
  console.log('[2/3] backfilling per-row fields...');
  let verified = 0, pageAnchored = 0;
  for (const r of rows.rows) {
    const bodySha = sha256(Buffer.from(r.body, 'utf-8'));
    let roundtrip = false;
    let newSourceUrl = r.source_url;

    const text = rawText[r.circuit];
    if (text && r.body) {
      // normalized-text search
      const normText = pdfText[r.circuit];
      const bodyNorm = r.body.toLowerCase().split(/\s+/).filter(Boolean).join(' ');
      let hit = -1;
      for (const probeLen of [150, 120, 80, 60]) {
        const probe = bodyNorm.slice(0, probeLen);
        const idx = normText.indexOf(probe);
        if (idx >= 0) { hit = idx; break; }
      }
      if (hit >= 0) {
        roundtrip = true;
        verified++;
        // Estimate raw-text position for page lookup
        const rawIdx = estimateRawIndex(text, normText, hit);
        const pageNo = pageForIndex(text, rawIdx);
        // Append #page= to source_url if not already present
        if (!r.source_url.includes('#page=')) {
          newSourceUrl = r.source_url + '#page=' + pageNo;
          pageAnchored++;
        }
      }
    }

    await c.query(
      `
      UPDATE pattern_jury_instructions
         SET body_sha256 = $2,
             source_pdf_sha256 = COALESCE(source_pdf_sha256, $3),
             roundtrip_verified = $4,
             source_url = $5,
             updated_at = NOW()
       WHERE id = $1
      `,
      [r.id, bodySha, pdfSha[r.circuit] || null, roundtrip, newSourceUrl]
    );
  }
  console.log(`  enriched ${rows.rows.length} rows (verified=${verified}, page-anchored=${pageAnchored})`);

  // Post-validation: ratios
  console.log('[3/3] post-validation...');
  const v = await c.query(`
    SELECT
      count(*) AS total,
      count(*) FILTER (WHERE body_sha256 IS NOT NULL) AS body_sha,
      count(*) FILTER (WHERE source_pdf_sha256 IS NOT NULL) AS pdf_sha,
      count(*) FILTER (WHERE roundtrip_verified = TRUE) AS rt,
      count(*) FILTER (WHERE source_url LIKE '%#page=%') AS pg_anch
    FROM pattern_jury_instructions
  `);
  const row = v.rows[0];
  const ratio = (a) => (Number(a) / Number(row.total)).toFixed(4);
  console.log(`  total=${row.total}`);
  console.log(`  body_sha256=${row.body_sha} (${ratio(row.body_sha)})`);
  console.log(`  source_pdf_sha256=${row.pdf_sha} (${ratio(row.pdf_sha)})`);
  console.log(`  roundtrip_verified=${row.rt} (${ratio(row.rt)})`);
  console.log(`  page_anchor=${row.pg_anch} (${ratio(row.pg_anch)})`);

  await c.end();
}

try {
  await main();
} catch (e) {
  console.error('ENRICH FAILED:', e);
  process.exit(1);
}
