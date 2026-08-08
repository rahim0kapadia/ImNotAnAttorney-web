// Template: scripts/ingest/lib/sc-html.mjs (multi-chapter HTML, sections inline)
// Template: scripts/ingest/lib/mo-html.mjs (HTML entity decode + tag strip + section parser)
// Pattern: cl-bulk-data-defensive #18 — bulk parse in-memory, COPY via harness
// Pattern: no-hallucinated-legal-data — every row carries verified HTTPS source URL
//
// Connecticut Title 53a (Penal Code) — General Statutes parser.
//
// Source structure (verified live 2026-05-02):
//   - Title TOC : https://www.cga.ct.gov/current/pub/title_53a.htm
//                 lists EXACTLY 3 chapters: 950 / 951 / 952 (Penal Code).
//                 Anchors: `<a class="toc_ch_link" href="chap_950.htm">Chapter 950</a>`
//                 covering sections 53a-1 through 53a-323.
//   - Per-chapter doc: https://www.cga.ct.gov/current/pub/chap_950.htm
//                 contains all sections inline (single-doc-per-chapter, like SC).
//   - Section format inside a chapter doc:
//         `<span class="catchln" id="sec_53a-NN">Sec. 53a-NN. Title text.</span>`
//       followed by body paragraphs `<p>(a) ...</p> <p>(b) ...</p>` until the
//       next `<span class="catchln"` anchor (or end-of-chapter).
//   - The chapter HTML ALSO contains TOC-style links at the top of the form
//         `<p class="toc_catchln"><a href="#sec_53a-24">Sec. 53a-24. ...</a></p>`
//       which the parser must NOT treat as section bodies — only the
//       `<span class="catchln" id="sec_53a-NN">` form is a body anchor.
//
// Bucket: B-clean (single-doc per chapter)
// Routing: vercel-cron-safe (no Crawl-delay)
//
// === TLS QUIRK (HARD CONSTRAINT) ===
// The CT server (cga.ct.gov) presents an INCOMPLETE certificate chain — it ships
// the leaf cert but not the intermediate. Standard `fetch()` (Node 18+ undici) AND
// WebFetch fail with `unable to verify the first certificate` /
// `UNABLE_TO_VERIFY_LEAF_SIGNATURE`.
//
// Workaround: use Node's `https.request` with a custom Agent that disables strict
// chain verification on a SECOND attempt only:
//
//   const agent = new https.Agent({ rejectUnauthorized: false });
//
// This is SAFE for our use case because:
//   1. Source authority is the published per-section URL stored in source_urls[];
//      defendants verify text against the cga.ct.gov live page directly.
//   2. We're reading public-domain Connecticut General Statutes (no auth, no PII).
//   3. The MITM risk surface is limited to a single GET against a state-government
//      domain on a controlled host (Vercel/engine workers, not user browsers).
//   4. Production fetch from a Vercel host with an updated CA bundle MAY succeed —
//      strict mode is tried first, with the bypass only triggering on cert-class
//      errors. If strict succeeds across a full live run, drop the bypass; until
//      then, the two-pass fallback is the contract.
//
// The seeder uses `fetchCtChapter(url)` for ALL CT GETs.
// DO NOT replace with plain `fetch()` — it WILL fail intermittently in production.
//
// Ref: gotcha-cga-ct-tls-incomplete-chain.md (to be created post-ship)

import https from 'node:https';

// ---------------------------------------------------------------------------
// HTML entity decode + tag strip (mirrors mo-html.stripHtml)
// ---------------------------------------------------------------------------

/**
 * Decode common HTML entities and strip HTML tags. Operates on in-memory
 * HTTP-fetched strings (not filesystem reads — global rule "no regex on file
 * contents" only bans regex over file contents, not over fetched strings).
 * @param {string} raw
 * @returns {string}
 */
export function stripHtml(raw) {
  return raw
    // Named entities (alphabetic)
    .split('&lt;').join('<')
    .split('&gt;').join('>')
    .split('&amp;').join('&')
    .split('&quot;').join('"')
    .split('&apos;').join("'")
    .split('&nbsp;').join(' ')
    .split('&mdash;').join('-')
    .split('&ndash;').join('-')
    .split('&sect;').join('§')
    // Hex smart-quotes / dashes (CT pages use these heavily, e.g. &#x201C;Penal Code&#x201D;)
    .split('&#x2018;').join("'").split('&#X2018;').join("'")
    .split('&#x2019;').join("'").split('&#X2019;').join("'")
    .split('&#x201C;').join('"').split('&#X201C;').join('"')
    .split('&#x201D;').join('"').split('&#X201D;').join('"')
    .split('&#x2013;').join('-').split('&#X2013;').join('-')
    .split('&#x2014;').join('-').split('&#X2014;').join('-')
    .split('&#xA0;').join(' ').split('&#XA0;').join(' ').split('&#x00A0;').join(' ')
    // Decimal numeric entities
    .split('&#39;').join("'")
    .split('&#160;').join(' ')
    .split('&#167;').join('§')
    .split('&#8211;').join('-')
    .split('&#8212;').join('-')
    .split('&#8216;').join("'")
    .split('&#8217;').join("'")
    .split('&#8220;').join('"')
    .split('&#8221;').join('"')
    // strip <script>/<style> blocks before generic tag strip
    .split(/<script[\s\S]*?<\/script>/gi).join(' ')
    .split(/<style[\s\S]*?<\/style>/gi).join(' ')
    .split(/<[^>]+>/g).join(' ')
    .split(/[\s ]+/).filter(Boolean).join(' ')
    .trim();
}

// ---------------------------------------------------------------------------
// Section number validation
// ---------------------------------------------------------------------------

/**
 * CT sections use the format `53a-N` or `53a-Na` (occasional alpha suffix
 * for amendments, e.g. `53a-46a`). Reject anything that doesn't match.
 * @param {string} s
 * @returns {boolean}
 */
export function isValidCtSectionNum(s) {
  if (!s || typeof s !== 'string') return false;
  return /^53a-\d{1,4}[a-z]?$/.test(s);
}

// ---------------------------------------------------------------------------
// Discover chapter URLs from the Title 53a TOC page
// ---------------------------------------------------------------------------

/**
 * Walk the Title 53a TOC HTML and emit one descriptor per unique chapter link.
 * Each `<a href="chap_939.htm">CHAPTER 939*</a>` becomes:
 *   { chapterNum: '939', chapterUrl: 'https://www.cga.ct.gov/current/pub/chap_939.htm' }
 *
 * @param {string} titleHtml  raw Title 53a TOC HTML
 * @returns {Array<{chapterNum: string, chapterUrl: string}>}  unique by chapterNum
 */
export function discoverCtChapters(titleHtml) {
  const out = [];
  const seen = new Set();
  const HREF_OPEN = 'href="chap_';
  let pos = 0;
  while (true) {
    const i = titleHtml.indexOf(HREF_OPEN, pos);
    if (i === -1) break;
    const start = i + HREF_OPEN.length;
    const endQuote = titleHtml.indexOf('.htm"', start);
    if (endQuote === -1) break;
    const chapterNum = titleHtml.slice(start, endQuote).trim();
    pos = endQuote;

    // CT chapter numbers are 3 digits with optional trailing lowercase letter.
    if (!/^\d{3}[a-z]?$/.test(chapterNum)) continue;
    if (seen.has(chapterNum)) continue;
    seen.add(chapterNum);

    out.push({
      chapterNum,
      chapterUrl: `https://www.cga.ct.gov/current/pub/chap_${chapterNum}.htm`,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Parse one chapter HTML into N CtSection records
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} CtSection
 * @property {string} chapterNum  e.g. "950"
 * @property {string} sectionNum  e.g. "53a-24"
 * @property {string} titleText   catchline (text after "Sec. NN." inside the catchln span)
 * @property {string} bodyText    body text, decoded + tag-stripped, until next anchor
 */

// Live CT body anchor: `<span class="catchln" id="sec_53a-NN">Sec. 53a-NN. ...</span>`
// The case-insensitive "catchln" + lowercase id="sec_..." is what distinguishes
// real section bodies from TOC links (which use `<a href="#sec_..."> ... </a>`).
const BODY_ANCHOR_PREFIX = '<span class="catchln" id="sec_53a-';
const BODY_ANCHOR_CLOSE = '</span>';

/**
 * Parse one chapter HTML doc into a flat list of CtSection objects.
 *
 * Mechanics:
 *   1. Locate every `<span class="catchln" id="sec_53a-NN">` body anchor.
 *      TOC links (`<a href="#sec_..."`) do NOT match this prefix and are
 *      ignored automatically.
 *   2. For each anchor, capture the catchline text (between the span open and
 *      its closing `</span>`).
 *   3. Capture body content from after the catchline-span close to the START
 *      of the next body anchor (or end-of-document for the last section).
 *
 * @param {string} chapterHtml  raw chapter HTML
 * @param {string} chapterNum   e.g. "950" — used to tag emitted rows
 * @returns {CtSection[]}
 */
export function parseCtChapter(chapterHtml, chapterNum) {
  const out = [];
  const anchors = [];

  // 1. Collect every body-anchor position.
  let pos = 0;
  while (true) {
    const idx = chapterHtml.indexOf(BODY_ANCHOR_PREFIX, pos);
    if (idx === -1) break;
    const start = idx + BODY_ANCHOR_PREFIX.length;
    const endQuote = chapterHtml.indexOf('"', start);
    if (endQuote === -1) break;
    const tail = chapterHtml.slice(start, endQuote).trim();
    const sectionNum = `53a-${tail}`;
    pos = endQuote;
    if (!isValidCtSectionNum(sectionNum)) continue;
    // catchSpanContent starts AFTER the closing ">" of the span open tag.
    const spanOpenClose = chapterHtml.indexOf('>', endQuote);
    if (spanOpenClose === -1) continue;
    const catchStart = spanOpenClose + 1;
    const catchEnd = chapterHtml.indexOf(BODY_ANCHOR_CLOSE, catchStart);
    if (catchEnd === -1) continue;
    anchors.push({
      sectionNum,
      anchorIdx: idx,
      catchStart,
      catchEnd,
      bodyStart: catchEnd + BODY_ANCHOR_CLOSE.length,
    });
  }

  // Dedupe by sectionNum, first occurrence wins.
  const seen = new Set();
  const ordered = [];
  for (const a of anchors) {
    if (seen.has(a.sectionNum)) continue;
    seen.add(a.sectionNum);
    ordered.push(a);
  }

  // 2. Per-anchor: extract catchline + body slice.
  for (let i = 0; i < ordered.length; i++) {
    const cur = ordered[i];
    const next = ordered[i + 1];

    // Catchline: full content of the catchln span. Format is
    //   `Sec. 53a-NN. Title text.`
    // We strip the `Sec. 53a-NN.` prefix and the trailing period.
    const rawCatch = chapterHtml.slice(cur.catchStart, cur.catchEnd);
    let titleText = stripHtml(rawCatch);
    const numPrefix = `Sec. ${cur.sectionNum}.`;
    if (titleText.startsWith(numPrefix)) {
      titleText = titleText.slice(numPrefix.length).trim();
    }
    titleText = titleText.replace(/\.\s*$/, '').trim();

    // Body: from end of catchln span to start of next body anchor (or EOF).
    const bodyEnd = next ? next.anchorIdx : chapterHtml.length;
    const rawBody = chapterHtml.slice(cur.bodyStart, bodyEnd);
    let bodyText = stripHtml(rawBody);

    // Trailing nav crud — only present after the LAST section in a chapter.
    // CT pages append "(Return to Chapter Table of Contents) (Return to List of
    // Chapters) (Return to List of Titles)" footer links. Trim everything from
    // the first such marker onward.
    const navMarkers = [
      '(Return to Chapter Table of Contents)',
      '(Return to List of Chapters)',
      '(Return to List of Titles)',
    ];
    for (const m of navMarkers) {
      const navIdx = bodyText.indexOf(m);
      if (navIdx !== -1) {
        bodyText = bodyText.slice(0, navIdx).trim();
      }
    }
    bodyText = bodyText.slice(0, 49000);

    if (!bodyText) continue;

    out.push({
      chapterNum,
      sectionNum: cur.sectionNum,
      titleText: titleText || `Section ${cur.sectionNum}`,
      bodyText,
    });
  }

  return out;
}

// ---------------------------------------------------------------------------
// URL builders
// ---------------------------------------------------------------------------

/**
 * Build the canonical authoritative URL for a CT section.
 * Stored in entities_statutes.source_urls[].
 *
 * CT does NOT publish per-section pages — the canonical address is a fragment
 * anchor on the parent chapter page. Defendants land on the chapter doc and
 * the fragment scrolls to the section heading.
 *
 * @param {string} sectionNum  e.g. "53a-1"
 * @param {string} chapterNum  e.g. "939" (REQUIRED — needed to know which
 *                             chapter doc the fragment lives in)
 * @returns {string}
 */
export function buildCtSourceUrl(sectionNum, chapterNum) {
  if (!chapterNum) {
    throw new Error('buildCtSourceUrl requires chapterNum (no per-section page on cga.ct.gov)');
  }
  // Live cga.ct.gov uses lowercase fragment IDs: `#sec_53a-N`.
  return `https://www.cga.ct.gov/current/pub/chap_${chapterNum}.htm#sec_${sectionNum}`;
}

/**
 * Build the chapter index URL. Used by the seeder during the chapter loop.
 * @param {string|number} chapterNum  e.g. "939"
 * @returns {string}
 */
export function buildCtChapterUrl(chapterNum) {
  return `https://www.cga.ct.gov/current/pub/chap_${chapterNum}.htm`;
}

/**
 * Build the Title 53a TOC URL. Single source for chapter discovery.
 * @returns {string}
 */
export function buildCtTitleUrl() {
  return 'https://www.cga.ct.gov/current/pub/title_53a.htm';
}

// ---------------------------------------------------------------------------
// TLS-bypass fetch (HARD requirement for cga.ct.gov)
// ---------------------------------------------------------------------------

/**
 * Fetch a CT chapter page with the documented TLS workaround.
 *
 * Strategy:
 *   1. First attempt: standard https.request WITH chain verification.
 *   2. If first attempt errors with cert-chain class (UNABLE_TO_VERIFY_LEAF_SIGNATURE,
 *      CERT_HAS_EXPIRED, SELF_SIGNED_CERT_IN_CHAIN, etc.), retry with
 *      rejectUnauthorized: false.
 *   3. If second attempt fails for non-cert reason, throw.
 *
 * This lets the seeder benefit from a properly-bundled CA chain when one is
 * available (Vercel runtime) while still ingesting reliably from environments
 * where the chain is incomplete (developer workstation, some Node containers).
 *
 * @param {string} url
 * @param {{ timeoutMs?: number, allowInsecure?: boolean }} [opts]
 *   - `allowInsecure` (default true): permit the rejectUnauthorized:false fallback.
 * @returns {Promise<string>} response body text (utf-8)
 */
export function fetchCtChapter(url, opts = {}) {
  const { timeoutMs = 30000, allowInsecure = true } = opts;
  return new Promise((resolve, reject) => {
    attempt(false).then(resolve).catch((err) => {
      if (!allowInsecure) return reject(err);
      const msg = String((err && err.message) || err);
      const isCertErr = /UNABLE_TO_VERIFY|SELF_SIGNED|CERT_HAS_EXPIRED|certificate/i.test(msg);
      if (!isCertErr) return reject(err);
      // Documented bypass — see file header for security rationale.
      attempt(true).then(resolve).catch(reject);
    });

    function attempt(insecure) {
      return new Promise((res, rej) => {
        const agent = insecure
          ? new https.Agent({ rejectUnauthorized: false })
          : undefined;
        const req = https.request(url, {
          method: 'GET',
          agent,
          headers: {
            'User-Agent': 'ImNotAnAttorney-statute-seed/1.0 (legal research)',
            'Accept': 'text/html,application/xhtml+xml',
          },
        }, (response) => {
          if (response.statusCode && response.statusCode >= 400) {
            response.resume();
            return rej(new Error(`HTTP ${response.statusCode} ${response.statusMessage} for ${url}`));
          }
          const chunks = [];
          response.on('data', (c) => chunks.push(c));
          response.on('end', () => res(Buffer.concat(chunks).toString('utf8')));
          response.on('error', rej);
        });
        req.on('error', rej);
        req.setTimeout(timeoutMs, () => {
          req.destroy(new Error(`fetch timeout after ${timeoutMs}ms: ${url}`));
        });
        req.end();
      });
    }
  });
}

// ---------------------------------------------------------------------------
// Cohort
// ---------------------------------------------------------------------------

/**
 * CT Title 53a chapter cohort (Penal Code) — verified live 2026-05-02 against
 * https://www.cga.ct.gov/current/pub/title_53a.htm. The Title 53a TOC lists
 * EXACTLY 3 chapters covering sections 53a-1 through 53a-323.
 *
 * The seeder still calls `discoverCtChapters(titleHtml)` first to pick up
 * any new chapters CT adds; this list is the deterministic FALLBACK and the
 * floor for tests.
 */
export const CT_TITLE_53A_CHAPTERS = [
  '950', // Penal Code: General Provisions (Secs. 53a-1 to 53a-3)
  '951', // Penal Code: Statutory Construction; Principles of Criminal Liability (Secs. 53a-4 to 53a-23)
  '952', // Penal Code: Offenses (Secs. 53a-24 to 53a-323)
];

/**
 * Human-readable descriptions for CT Title 53a chapters. Used for logging/
 * preview output in dry-run; NOT stored in DB.
 */
export const CT_CHAPTER_DESCRIPTIONS = {
  '950': 'Penal Code: General Provisions',
  '951': 'Penal Code: Statutory Construction; Principles of Criminal Liability',
  '952': 'Penal Code: Offenses',
};
