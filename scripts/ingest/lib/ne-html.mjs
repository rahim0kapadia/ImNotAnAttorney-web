// Template: scripts/ingest/lib/ga-html.mjs
// Pattern: cl-bulk-data-defensive #18 — NE Chapter 28 is single-file HTML, parse in-memory
// Source: https://nebraskalegislature.gov/laws/laws-index/chap28-full.html
//
// NE HTML structure (Chapter 28 — Crimes & Punishments, full-chapter dump):
//   <div class="printwidth">                ← section container
//     <strong>28-101.
//       Code, how cited.</strong><br>       ← section heading (whitespace inside is real)
//     <p style="text-indent: 1.5em;">…</p>  ← body (one or more <p> tags)
//     <p>…</p>
//     <div class="source">…</div>           ← legislative history (skip)
//     <div class="cross">…</div>            ← cross-references (skip)
//     <div class="anno">…</div>             ← annotations / case law (skip)
//   </div>
//
// Section number forms:
//   28-101         (basic)
//   28-105.01      (sub-numbered — period inside the section number)
//   28-1601a       (rare lowercase letter suffix — kept lowercase)
//
// Repealed/transferred sections render as `<strong>28-NNN. Repealed. Laws ...</strong>`
// with no <p> body — the harness drops them via the empty-body validation in
// `buildSectionRow` (titleText/bodyText must be non-empty).
//
// Authoritative source URL: https://nebraskalegislature.gov/laws/statutes.php?statute={section-num}
// (verified 2026-05-02 — landing page renders official statutory text)

/**
 * @typedef {Object} NESection
 * @property {string} chapterNum  always "28" (chapter-level dump)
 * @property {string} sectionNum  e.g. "28-101", "28-105.01"
 * @property {string} titleText   heading text, stripped of HTML, prefix removed
 * @property {string} bodyText    body text, stripped of HTML, source/cross/anno excluded
 */

/** Strip all HTML tags and normalise whitespace */
export function stripHtml(raw) {
  return raw
    // Remove script/style blocks first
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    // Remove all tags
    .replace(/<[^>]+>/g, ' ')
    // Decode common HTML entities (no external dep)
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#xa7;|&#167;/gi, '§')
    .replace(/&sect;/gi, '§')
    .replace(/&mdash;|&#8212;/gi, '—')
    .replace(/&ndash;|&#8211;/gi, '–')
    // Collapse all whitespace (incl newlines / tabs)
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Parse the NE Chapter 28 single-file HTML and extract all sections.
 *
 * Strategy:
 *   1. Find every `<strong>28-NNN[.NN][a]. ` heading — each is one section start.
 *      The source has whitespace/newlines inside the <strong> tag (between the
 *      number-period and the title text) — pattern tolerates `\s*` + multiline.
 *   2. From the heading, extract sectionNum (the "28-NNN[.NN][a]" portion).
 *   3. Title text = inside-<strong> text after the number prefix is stripped.
 *   4. Body text = <p> tags that follow the heading's </strong> closer, until
 *      we hit the next section heading OR a `<div class="source|cross|anno">`.
 *
 * @param {string} html - Full content of chap28-full.html
 * @returns {NESection[]}
 */
export function parseNEChapter28(html) {
  // Heading pattern: <strong>\s*28-NNN[.NN][a].\s*Title.</strong>
  // Section-num shape: 28- + digits + optional .digits + optional lowercase letter.
  const HEAD_PATTERN = /<strong>\s*(28-\d+(?:\.\d+)?[a-z]?)\.\s*([\s\S]*?)<\/strong>/g;

  const positions = [];
  let match;

  while ((match = HEAD_PATTERN.exec(html)) !== null) {
    positions.push({
      headStart: match.index,
      headEnd: match.index + match[0].length,
      sectionNum: match[1],
      rawTitle: match[2],
    });
  }

  const sections = [];

  for (let i = 0; i < positions.length; i++) {
    const pos = positions[i];
    // Body window: from end of heading <strong>…</strong> to the next heading
    // (or end of document, bounded for safety).
    const nextStart = i + 1 < positions.length ? positions[i + 1].headStart : pos.headEnd + 200000;
    const chunkEnd = Math.min(nextStart, html.length);
    const chunk = html.slice(pos.headEnd, chunkEnd);

    const titleText = sanitiseTitle(stripHtml(pos.rawTitle), pos.sectionNum);
    if (!titleText) continue;

    const bodyText = extractBodyText(chunk);
    if (!bodyText) continue;  // repealed/transferred (no <p> body) auto-skipped

    sections.push({
      chapterNum: '28',
      sectionNum: pos.sectionNum,
      titleText,
      bodyText,
    });
  }

  return sections;
}

/**
 * Extract body <p> text from the section chunk (after the heading).
 * Stops at source / cross / anno divs (legislative history and annotations).
 */
function extractBodyText(chunk) {
  const STOP_PATTERNS = [
    /<div[^>]+class="source"/i,
    /<div[^>]+class="cross"/i,
    /<div[^>]+class="anno"/i,
  ];

  let stopAt = chunk.length;
  for (const pat of STOP_PATTERNS) {
    const m = pat.exec(chunk);
    if (m && m.index < stopAt) stopAt = m.index;
  }

  const bodyChunk = chunk.slice(0, stopAt);
  const paragraphs = [];

  const pPattern = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  let m;
  while ((m = pPattern.exec(bodyChunk)) !== null) {
    const text = stripHtml(m[1]);
    if (text) paragraphs.push(text);
  }

  return paragraphs.join(' ').replace(/\s+/g, ' ').trim().slice(0, 4000);
}

/**
 * Strip the leading "28-NNN[.NN][a]. " prefix from the title text.
 * e.g. "28-101. Code, how cited." → "Code, how cited."
 */
function sanitiseTitle(raw, sectionNum) {
  const prefix = sectionNum + '. ';
  if (raw.startsWith(prefix)) return raw.slice(prefix.length).trim();
  const prefixDot = sectionNum + '.';
  if (raw.startsWith(prefixDot)) return raw.slice(prefixDot.length).trim();
  return raw.trim();
}

/**
 * Build the authoritative Nebraska Legislature URL for a NRS Chapter 28 section.
 * Pattern: https://nebraskalegislature.gov/laws/statutes.php?statute={section-num}
 * (verified 2026-05-02 — landing page renders official statutory text)
 *
 * @param {string} sectionNum e.g. "28-101", "28-105.01"
 * @returns {string}
 */
export function buildNESourceUrl(sectionNum) {
  return `https://nebraskalegislature.gov/laws/statutes.php?statute=${sectionNum}`;
}
