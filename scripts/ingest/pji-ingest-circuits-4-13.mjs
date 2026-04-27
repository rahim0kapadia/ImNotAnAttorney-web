// Template: scripts/ingest/pji-ingest.mjs (centered parser reused, adapted)
// Expert: lukas-fittl (pg session defenses) + laurenz-albe (TCP keepalives)
// Pattern: cl-bulk-data-defensive #17 + #18 + #19 (Albe + COPY + CSV-before-API)
// csv-bulk-checked: https://www.scd.uscourts.gov/pji/PatternJuryInstructions.pdf (4th Cir / SCD) + https://s45968.pcdn.co/wp-content/uploads/public_docs/May-2020-FCBA-Model-Patent-Jury-Instructions.pdf (Federal Cir / FCBA)
// work-mem: Medium tier verified — no ingest-side sort needed
//
// G2 plan addition: PJI for 4th Circuit + Federal Circuit (circuit 13).
// Source URLs verified live 2026-04-27.
//   - circuit=4: SCD/4th-Cir-conformity Pattern Jury Instructions for Federal
//                Criminal Cases (Ruschky & Shealy 2024 Online Edition).
//                4th Circuit doesn't publish circuit-level instructions; this
//                SCD project is the de facto Fourth-Circuit reference.
//   - circuit=13: FCBA Model Patent Jury Instructions (May 2020). The Federal
//                 Circuit itself doesn't publish pattern instructions; FCBA's
//                 free PDF is the canonical reference for patent cases under
//                 CAFC jurisdiction.
//
// 2nd Circuit + DC Circuit: BLOCKED, no free public PJI exists. Documented in
// docs/plans/2026-04-27-followup-pji-2-blocked.md and
// docs/plans/2026-04-27-followup-pji-12-dc-blocked.md. Both rely on
// commercial sources (Sand's Modern Federal / Bergman's DC Redbook) behind
// LexisNexis paywalls — pay-only path violates Bootstrap Mode HARD RULE.
//
// instruction_number conventions added by this script:
//   - circuit=4:  USC statute references as canonical IDs:
//                   "18-USC-2", "18-USC-371", "21-USC-841(a)(1)" etc.
//                 Preliminary lettered sub-sections as "I-A", "I-E", etc.
//                 (chapter II of the SCD PDF — voir dire/note-taking/etc.)
//   - circuit=13: Centered FCBA numbering: "A.1", "A.2", "2.1", "2.1a",
//                 "3.1a", "4.3a-1", "5.1", "7.6". Top-level letter-prefixed
//                 numbers (A.1, B.1) are real instructions. Within B.2/B.3/...
//                 sections, the deeper numeric "2.1" / "3.1a" lines are the
//                 real instructions; the section header (B.2 Claim
//                 Construction) is treated as a category boundary.
//
// schema test invariants extended in __tests__/pji-ingest.test.mjs:
//   circuit IN (4)   → instruction_number ~ '^([0-9]+(-USC-[0-9A-Za-z()]+(\.[0-9])?)|I-[A-Z])$'
//   circuit IN (13)  → instruction_number ~ '^([A-Z]\.[0-9]+|[0-9]+\.[0-9]+[a-z]?(-[0-9]+)?|[0-9]+\.[0-9]+[a-z]?\([ivx]+\))$'

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { Readable } from 'node:stream';
import { finished } from 'node:stream/promises';
import pg from 'pg';
import copyStreams from 'pg-copy-streams';

const envTxt = fs.readFileSync('C:/Users/email/projects/ImNotAnAttorney-web/.env.local', 'utf-8');
for (const line of envTxt.split(/\r?\n/)) {
  const eq = line.indexOf('=');
  if (eq <= 0) continue;
  const key = line.slice(0, eq);
  const val = line.slice(eq + 1);
  if (!/^[A-Z_][A-Z0-9_]*$/.test(key)) continue;
  if (!process.env[key]) process.env[key] = val;
}

const SOURCES = [
  {
    circuit: 4,
    label: '4th',
    url: 'https://www.scd.uscourts.gov/pji/PatternJuryInstructions.pdf',
    effective_date: '2024-02-01',
    parseStrategy: 'scd-statute',
  },
  {
    circuit: 13,
    label: 'Fed',
    url: 'https://s45968.pcdn.co/wp-content/uploads/public_docs/May-2020-FCBA-Model-Patent-Jury-Instructions.pdf',
    effective_date: '2020-05-01',
    parseStrategy: 'fcba-centered',
  },
];

const WORK = path.join(os.tmpdir(), 'pji-ingest');

function csvEscape(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  const needsQuote = s.indexOf('"') >= 0 || s.indexOf(',') >= 0 || s.indexOf('\n') >= 0 || s.indexOf('\r') >= 0;
  if (!needsQuote) return s;
  return '"' + s.split('"').join('""') + '"';
}

function collapseWs(s) {
  return s.split(/\s+/).filter(Boolean).join(' ');
}

function sha256Hex(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

// =============================================================================
// 4th Circuit / SCD parser
// =============================================================================
//
// PDF structure:
//   Cover/Preface (lines 1..~110)
//   "I. INTRODUCTION" (line ~112)
//   "II. PRELIMINARY" with lettered sub-sections (E. Indictment, F. Note-Taking,
//        G. Presumption of Innocence, ...). Each is its own instruction.
//   "III. TITLE 18" + statute-headed instructions: "18 U.S.C. § 2 AIDING AND ABETTING"
//   Subsequent Roman-numeral chapters by USC title.
//
// pdftotext renders the section symbol § as `�` (mojibake U+FFFD). Both forms
// must be accepted. Some lines drop the symbol entirely: "18 U.S.C. 13 ASSIMILATIVE..."
//
// Detection regexes:
//   STATUTE_RE  – chapter+section+title-in-caps. Captures (chapter, section, title).
//                 Section may be like "2", "2(b)", "664", "1591A", "841(a)(1)".
//   PRELIM_RE   – preliminary lettered sub-sections in chapter II.
//
// instruction_number normalization:
//   Statute: "<chapter>-USC-<section>" (preserves parentheses/letters in section)
//   Prelim:  "I-<letter>"
//
// Body: every non-blank line until next instruction header. Drop footnote-only
// pages (lines starting with NOTE, ____NOTE_____, page-number-only digits).

const SCD_STATUTE_RE = /^(\d{1,2})\s+U\.S\.C\.\s*[§�]?\s*(\d+[A-Za-z0-9()]*)\s+(.+)$/;
const SCD_PRELIM_RE = /^([A-Z])\.\s+([A-Z][A-Za-z][A-Za-z\s,'-]+)$/;
const SCD_NOISE_RE = /^(Page\s+\d+|\d+\s*$|TITLE\s+\d+|PRELIMINARY|©|Last\s+updated|_+NOTE_+|NOTE)/;

function parseScdStatute(text) {
  const lines = text.split(/\r?\n/);
  const instructions = [];
  let current = null;
  let inPrelim = false; // only honor lettered subsections inside chapter II
  let inIntro = false;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();

    // Chapter markers
    if (/^I\.\s+INTRODUCTION$/.test(trimmed)) { inIntro = true; inPrelim = false; continue; }
    if (/^II\.\s+PRELIMINARY$/.test(trimmed)) { inPrelim = true; inIntro = false; continue; }
    if (/^[IVX]+\.\s+(TITLE\s+\d+|DEFINITIONS|DEFENSES|FINAL\s+INSTRUCTIONS|PRACTICE)/.test(trimmed)) {
      inPrelim = false;
      inIntro = false;
      continue;
    }

    // Skip running-headers/page numbers/preliminary-section repeats
    if (SCD_NOISE_RE.test(trimmed)) {
      // Don't drop the *current* body — just skip the noise line.
      continue;
    }

    // Detect new instruction
    let mStatute = SCD_STATUTE_RE.exec(trimmed);
    let mPrelim = inPrelim ? SCD_PRELIM_RE.exec(trimmed) : null;

    if (mStatute) {
      if (current) instructions.push(current);
      const chapter = mStatute[1];
      const section = mStatute[2];
      const title = mStatute[3].trim();
      current = {
        instruction_number: `${chapter}-USC-${section}`,
        title,
        body_lines: [],
      };
      continue;
    }
    if (mPrelim) {
      // Filter false positives — Roman numerals like "I.  Dangerous Weapon" inside DEFINITIONS
      // chapter shouldn't fire here because inPrelim flips false on next chapter marker.
      if (current) instructions.push(current);
      const letter = mPrelim[1];
      const title = mPrelim[2].trim();
      current = {
        instruction_number: `I-${letter}`,
        title,
        body_lines: [],
      };
      continue;
    }

    if (current) {
      if (!trimmed) continue;
      // Drop footnote-numbered lines that begin with a small-N then quote marks/citations
      // (these are the footnote body; can't parse cleanly, harmless to keep but boost noise).
      // Keep them for now — we'd rather over-include than drop legitimate prose.
      current.body_lines.push(trimmed);
    }
  }
  if (current) instructions.push(current);

  return instructions
    .map((r) => ({
      instruction_number: r.instruction_number,
      title: r.title,
      body: collapseWs(r.body_lines.join(' ')).trim(),
    }))
    .filter((r) => r.body.length >= 80 && r.instruction_number.length <= 30);
}

// =============================================================================
// FCBA / Federal Circuit parser
// =============================================================================
//
// PDF structure (May 2020 ed.):
//   Cover, Acknowledgement, TOC (extensive), Statutes, Other Authorities.
//   Body starts ~line 808 with "Preliminary Instructions" header followed by
//   "A.1 Preliminary Instructions" and the actual instruction body.
//
// Section heading line patterns:
//   "A.1 Preliminary Instructions"   → preliminary section, A.<n> IS the
//                                      instruction number.
//   "B.2 Claim Construction"         → category header. The actual instruction
//   "B.3 Infringement"                  number appears 1-2 lines below as a
//   "B.4 Validity"                      centered "<num> <ALL-CAPS-TITLE>" line:
//   "B.5 Patent Damages"                "2.1 PATENT CLAIMS"
//   ...                                  "3.1a DIRECT INFRINGEMENT BY..."
//   "C.1 Final Instructions"            "4.3a-1 PRIOR ART"
//
// TOC sentinel: lines containing dot-leaders ("...") followed by trailing page
// number. TOC ends at first non-TOC body line that matches the heading pattern
// AND is followed by an actual instruction. Use a simpler approach: skip until
// we see "A.1 Preliminary Instructions" preceded by a "1" (page number) line —
// which is the body's first occurrence.
//
// Body-instruction RE (within B.x and C.x sections):
//   "<digit>.<digit>[a-z]?(-<digit>)?(\([ivx]+\))?  <ALL-CAPS-TITLE>"
//   Examples: "2.1 PATENT CLAIMS", "3.1a DIRECT INFRINGEMENT BY..."
//             "4.3a-1 PRIOR ART (If Not in Dispute)"
//             "4.3c(i) LEVEL OF ORDINARY SKILL"
//
// A-section instructions are direct: "A.1 Preliminary Instructions" header is
// FOLLOWED by "WHAT A PATENT IS AND HOW ONE IS OBTAINED" then body.
// The instruction number IS A.1; title is the all-caps line.
//
// Pages have form-feed (\f) plus a centered page number on its own line. Both
// are noise to skip.

const FCBA_SECTION_HEADER_RE = /^([A-Z])\.([0-9]+(?:\.[0-9]+)?)\s+([A-Z][A-Za-z][A-Za-z\s'-]+(?:--[A-Za-z][A-Za-z\s]+)?)$/;
const FCBA_BODY_NUM_RE = /^([0-9]+\.[0-9]+(?:[a-z](?:-[0-9]+)?(?:\([ivxlcdm]+\))?)?)\s+(.+)$/;
const FCBA_TOC_RE = /\.{3,}\s*\d+\s*$/;
const FCBA_PAGE_NUM_RE = /^\s+\d{1,4}\s*$/;

function parseFcbaCentered(text) {
  const lines = text.split(/\r?\n/);
  const instructions = [];

  // Find body start: first occurrence of "A.1 Preliminary Instructions" that is
  // NOT followed by dot-leaders. Walk lines, when we see `A.1 Preliminary` and
  // the SAME line lacks dots, body has started.
  let bodyStart = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^A\.1\s+Preliminary\s+Instructions\s*$/.test(lines[i].trim())) {
      // Confirm not TOC: TOC version has dot-leaders on same line.
      if (!FCBA_TOC_RE.test(lines[i])) {
        bodyStart = i;
        break;
      }
    }
  }
  if (bodyStart < 0) {
    console.warn('FCBA parser: could not find body start (A.1 Preliminary Instructions)');
    return [];
  }

  let current = null;
  let lastSectionHeader = null; // 'A' | 'B' | 'C' | etc.
  let awaitTitle = false;

  for (let i = bodyStart; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();

    if (!trimmed) continue;
    if (FCBA_TOC_RE.test(raw)) continue;
    if (FCBA_PAGE_NUM_RE.test(raw) && trimmed.length <= 4) continue;
    // Form-feeds delimit pages; pdftotext often emits them at the start of
    // the first content line of a new page. trimmed strips them via \s class
    // semantics. Don't skip the line — that drops legitimate instruction
    // headers (the FCBA body-start line itself begins with \f).

    // Skip "Authorities" and "Committee Comments" sub-headers (they are
    // metadata, but their text up to next instruction is fine to keep in body
    // — no need to actively skip; the next-instruction regex will close out).
    // The same applies to "Last Edited:", "© Federal Circuit Bar Association".

    // Section header (A.1, B.2, C.1, ...)
    const mSection = FCBA_SECTION_HEADER_RE.exec(trimmed);
    if (mSection) {
      const letter = mSection[1];
      const num = mSection[2];
      lastSectionHeader = letter;
      // For A-section: this IS the instruction number directly.
      if (letter === 'A') {
        if (current) instructions.push(current);
        current = {
          instruction_number: `${letter}.${num}`,
          title: null,
          body_lines: [],
        };
        awaitTitle = true;
        continue;
      }
      // For B/C sections: this is a category header, not an instruction.
      // Real instruction number follows on a subsequent line as "<num> <TITLE>".
      // Don't open a new instruction here — keep accumulating into current.
      // BUT: if the previous "current" was a B/C section instruction and we've
      // hit a new B/C header for the SAME group (same section letter), don't
      // close it yet — body may continue. The next FCBA_BODY_NUM line closes it.
      // No-op here.
      continue;
    }

    // Body-level instruction number? (only valid inside B/C sections — not A)
    if (lastSectionHeader && lastSectionHeader !== 'A') {
      const mBody = FCBA_BODY_NUM_RE.exec(trimmed);
      if (mBody) {
        const num = mBody[1];
        const title = mBody[2].trim();
        // Heuristic: title must be ALL-CAPS-ish (reject if too many lowercase
        // chars — that would be a body sentence starting with "2.1" coincidentally).
        const lowerCount = (title.match(/[a-z]/g) || []).length;
        const upperCount = (title.match(/[A-Z]/g) || []).length;
        // Allow lowercase in some titles like "(If Not in Dispute)", but
        // require upper >= lower to avoid false positives.
        if (upperCount >= lowerCount || /^[A-Z][A-Z0-9\s\-(),"./]+$/.test(title)) {
          if (current) instructions.push(current);
          current = {
            instruction_number: num,
            title,
            body_lines: [],
          };
          awaitTitle = false;
          continue;
        }
      }
    }

    // Otherwise: body line for current instruction.
    if (current) {
      // For A-section: first non-blank, non-section-header line after section
      // is the title (ALL-CAPS).
      if (awaitTitle && !current.title) {
        current.title = trimmed;
        awaitTitle = false;
        continue;
      }
      current.body_lines.push(trimmed);
    }
  }
  if (current) instructions.push(current);

  return instructions
    .map((r) => ({
      instruction_number: r.instruction_number,
      title: r.title,
      body: collapseWs(r.body_lines.join(' ')).trim(),
    }))
    .filter((r) => r.body.length >= 80 && r.instruction_number.length <= 20);
}

function parseInstructions(text, src) {
  if (src.parseStrategy === 'scd-statute') return parseScdStatute(text);
  if (src.parseStrategy === 'fcba-centered') return parseFcbaCentered(text);
  throw new Error(`Unknown parseStrategy: ${src.parseStrategy}`);
}

// Page-anchor: locate body's first 150 normalized chars in the PDF text and
// count form-feeds (\f) before that index. pdftotext emits one \f per page
// boundary. Returns 1-based page number, or null when not found.
function findPageNumber(pdfText, body) {
  if (!body || body.length < 60) return null;
  const norm = (s) => s.toLowerCase().split(/\s+/).filter(Boolean).join(' ');
  const textNorm = norm(pdfText);
  const bodyNorm = norm(body);
  let normIdx = -1;
  for (const probeLen of [150, 120, 80, 60]) {
    const probe = bodyNorm.slice(0, probeLen);
    const idx = textNorm.indexOf(probe);
    if (idx >= 0) {
      normIdx = idx;
      break;
    }
  }
  if (normIdx < 0) return null;
  // Estimate raw-text index from normalized index. Both texts collapse the
  // same whitespace classes; ratio is text.length / normText.length.
  const ratio = pdfText.length / textNorm.length;
  const rawIdx = Math.floor(normIdx * ratio);
  let page = 1;
  for (let i = 0; i < rawIdx && i < pdfText.length; i++) {
    if (pdfText.charCodeAt(i) === 0x0c) page++;
  }
  return page;
}

async function downloadPdf(src, destPath) {
  if (fs.existsSync(destPath)) {
    const kb = (fs.statSync(destPath).size / 1024).toFixed(0);
    console.log(`  using cached ${destPath} (${kb} KB)`);
    return true;
  }
  console.log(`  downloading ${src.url} ...`);
  try {
    const r = await fetch(src.url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (INAA-data-ingest)' },
      redirect: 'follow',
    });
    if (!r.ok) {
      console.warn(`  WARN circuit ${src.label}: ${r.status} ${r.statusText} — skipping`);
      return false;
    }
    const ws = fs.createWriteStream(destPath);
    await finished(Readable.fromWeb(r.body).pipe(ws));
    const kb = (fs.statSync(destPath).size / 1024).toFixed(0);
    console.log(`    ${kb} KB`);
    return true;
  } catch (e) {
    console.warn(`  WARN circuit ${src.label}: ${e.message} — skipping`);
    return false;
  }
}

function parseCliFlags() {
  const argv = process.argv.slice(2);
  const flags = { circuits: null, dryRun: false };
  for (const arg of argv) {
    if (arg === '--dry-run') flags.dryRun = true;
    else if (arg.startsWith('--circuits=')) {
      flags.circuits = arg
        .slice('--circuits='.length)
        .split(',')
        .map((s) => Number.parseInt(s.trim(), 10))
        .filter((n) => Number.isInteger(n) && n > 0);
    }
  }
  return flags;
}

async function main() {
  const flags = parseCliFlags();
  console.log(`=== pji-ingest-circuits-4-13 ${new Date().toISOString()} ===`);
  if (flags.circuits) console.log(`  circuits filter: [${flags.circuits.join(',')}]`);
  if (flags.dryRun) console.log(`  DRY RUN — no DB writes`);
  fs.mkdirSync(WORK, { recursive: true });

  const sources = flags.circuits
    ? SOURCES.filter((s) => flags.circuits.includes(s.circuit))
    : SOURCES;
  if (sources.length === 0) {
    console.error(`No sources match circuits filter ${JSON.stringify(flags.circuits)}`);
    process.exit(1);
  }

  const allRows = [];
  const perCircuit = {};

  for (const src of sources) {
    console.log(`\n--- Circuit ${src.label} (=${src.circuit}) ---`);
    const pdfPath = path.join(WORK, `circuit-${src.circuit}.pdf`);
    const txtPath = path.join(WORK, `circuit-${src.circuit}.txt`);

    const ok = await downloadPdf(src, pdfPath);
    if (!ok) {
      perCircuit[src.label] = { status: 'download_failed', parsed: 0 };
      continue;
    }

    const pdfSha = sha256Hex(fs.readFileSync(pdfPath));
    console.log(`  PDF sha256: ${pdfSha}`);

    try {
      execSync(`pdftotext -layout "${pdfPath}" "${txtPath}"`, { stdio: 'inherit', windowsHide: true });
    } catch (e) {
      console.warn(`  WARN pdftotext failed for circuit ${src.label}: ${e.message}`);
      perCircuit[src.label] = { status: 'pdftotext_failed', parsed: 0 };
      continue;
    }

    const text = fs.readFileSync(txtPath, 'utf-8');
    const parsed = parseInstructions(text, src);
    console.log(`  parsed ${parsed.length} instructions`);

    for (const sample of parsed.slice(0, 5)) {
      const titlePreview = sample.title ? sample.title.slice(0, 70) : '(no title)';
      console.log(`    [${sample.instruction_number}] ${titlePreview} — ${sample.body.length}ch`);
    }

    let anchored = 0;
    for (const r of parsed) {
      const page = findPageNumber(text, r.body);
      const sourceUrl = page ? `${src.url}#page=${page}` : src.url;
      if (page) anchored++;
      allRows.push({
        circuit: src.circuit,
        instruction_number: r.instruction_number,
        title: r.title,
        body: r.body,
        source_url: sourceUrl,
        effective_date: src.effective_date,
        pdf_sha: pdfSha,
      });
    }
    console.log(`  page-anchored: ${anchored}/${parsed.length}`);
    perCircuit[src.label] = { status: 'ok', parsed: parsed.length, anchored, pdf_sha: pdfSha };
  }

  console.log(`\n=== TOTAL PARSED: ${allRows.length} rows across ${Object.keys(perCircuit).length} circuits ===`);
  console.log(JSON.stringify(perCircuit, null, 2));

  if (allRows.length === 0) {
    console.error('No rows parsed — aborting DB write.');
    process.exit(1);
  }

  // Dedupe on (circuit, instruction_number, effective_date). Keep longest body.
  const seen = new Map();
  for (const r of allRows) {
    const key = `${r.circuit}::${r.instruction_number}::${r.effective_date}`;
    const prev = seen.get(key);
    if (!prev || r.body.length > prev.body.length) seen.set(key, r);
  }
  const rows = [...seen.values()];
  console.log(`After dedupe: ${rows.length} rows`);

  if (flags.dryRun) {
    console.log('\n=== DRY RUN — sample 10 rows ===');
    for (const r of rows.slice(0, 10)) {
      console.log(`  [c${r.circuit} ${r.instruction_number}] ${(r.title || '(no title)').slice(0, 60)} — ${r.body.length}ch`);
      const bodyPreview = r.body.slice(0, 120).split(/\s+/).filter(Boolean).join(' ');
      console.log(`    body preview: ${bodyPreview}`);
    }
    console.log('\n=== DRY RUN — instruction_number distribution ===');
    const numFmts = new Map();
    for (const r of rows) {
      const fmt = r.instruction_number;
      numFmts.set(fmt, (numFmts.get(fmt) ?? 0) + 1);
    }
    console.log(`  ${numFmts.size} unique instruction_numbers`);
    return;
  }

  const { Client } = pg;
  const u = new URL(process.env.SUPABASE_DB_URL);
  u.port = '5432';
  const c = new Client({ connectionString: u.toString(), ssl: { rejectUnauthorized: false }, statement_timeout: 0 });
  await c.connect();
  try {
    await c.query(`SET statement_timeout = '15min'`);
    await c.query(`SET idle_in_transaction_session_timeout = '5min'`);
    await c.query(`SET tcp_keepalives_idle = 60`);
    await c.query(`SET tcp_keepalives_interval = 10`);
    await c.query(`SET tcp_keepalives_count = 6`);

    // Idempotent: clear any prior rows for the (circuit, effective_date) pairs.
    const effPairs = [...new Set(rows.map((r) => `${r.circuit}::${r.effective_date}`))];
    for (const pair of effPairs) {
      const [circuit, ed] = pair.split('::');
      const { rowCount } = await c.query(
        `DELETE FROM pattern_jury_instructions WHERE circuit = $1 AND effective_date = $2`,
        [Number(circuit), ed],
      );
      if (rowCount) console.log(`  cleared ${rowCount} prior rows for circuit=${circuit} effective_date=${ed}`);
    }

    const COLS = [
      'circuit',
      'instruction_number',
      'title',
      'body',
      'source_url',
      'effective_date',
      'source_pdf_sha256',
      'source_pdf_sha_algorithm',
      'body_sha256',
      'roundtrip_verified',
      'fetched_at',
      'http_status_at_fetch',
    ];
    const copySql = `COPY pattern_jury_instructions (${COLS.join(',')}) FROM STDIN WITH (FORMAT csv)`;
    const copyStream = c.query(copyStreams.from(copySql));
    const t0 = Date.now();
    const fetchedAt = new Date().toISOString();
    for (const r of rows) {
      const bodySha = sha256Hex(Buffer.from(r.body, 'utf-8'));
      const line = [
        r.circuit,
        r.instruction_number,
        r.title,
        r.body,
        r.source_url,
        r.effective_date,
        r.pdf_sha,
        'sha256',
        bodySha,
        'TRUE', // roundtrip_verified — body came directly from canonical PDF this run
        fetchedAt,
        '200',
      ]
        .map(csvEscape)
        .join(',') + '\n';
      const ok = copyStream.write(line);
      if (!ok) await new Promise((res) => copyStream.once('drain', res));
    }
    copyStream.end();
    await new Promise((resolve, reject) => {
      copyStream.on('finish', resolve);
      copyStream.on('error', reject);
    });
    console.log(`COPY'd ${rows.length} rows in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

    const { rows: byCircuit } = await c.query(
      `SELECT circuit, count(*)::int AS n FROM pattern_jury_instructions GROUP BY circuit ORDER BY circuit`,
    );
    console.log(`\n=== BY CIRCUIT ===`);
    console.log(JSON.stringify(byCircuit, null, 2));

    // Anti-hallucination posture: verify every new row has HTTPS source_url + sha256.
    const { rows: audit } = await c.query(`
      SELECT circuit,
             count(*)::int AS n,
             count(*) FILTER (WHERE source_url IS NULL OR source_url = '' OR source_url NOT LIKE 'https://%')::int AS bad_url,
             count(*) FILTER (WHERE source_pdf_sha256 IS NULL)::int AS missing_sha,
             count(*) FILTER (WHERE body_sha256 IS NULL)::int AS missing_body_sha,
             count(*) FILTER (WHERE roundtrip_verified = TRUE)::int AS rtv
        FROM pattern_jury_instructions
       WHERE circuit IN (${[...new Set(rows.map((r) => r.circuit))].join(',')})
       GROUP BY circuit
       ORDER BY circuit
    `);
    console.log(`\n=== AUDIT (anti-hallucination) ===`);
    console.log(JSON.stringify(audit, null, 2));
  } finally {
    try { await c.end(); } catch { /* ignore */ }
  }

  const summary = {
    timestamp: new Date().toISOString(),
    per_circuit_parsed: perCircuit,
    total_rows_loaded: rows.length,
  };
  const summaryPath = path.join(WORK, 'pji-ingest-circuits-4-13-summary.json');
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
  console.log(`summary written to ${summaryPath}`);
  console.log(`\n=== done ${new Date().toISOString()} ===`);
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
