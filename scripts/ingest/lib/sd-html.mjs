// Template: scripts/ingest/lib/ar-xml.mjs
// Pattern: cl-bulk-data-defensive #18 — single-fetch dump, parse in-memory
// Pattern: docs/plans/2026-05-02-wave2-state-configs.md § "SD — South Dakota"
// Source: https://sdlegislature.gov/api/Statutes/22.html?all=true
//
// SD legislature publishes the FULL Title 22 (Crimes) as one ~7 MB HTML dump.
// The endpoint serves UTF-16LE bytes with no BOM and no charset header
// (Content-Type: text/html). Native fetch().text() default-decodes as UTF-8
// and yields garbage. Use fetchSDTitle22() in this lib — it pulls bytes via
// arrayBuffer() and decodes with TextDecoder('utf-16le').
//
// Document structure inside the decoded HTML:
//   doc[0]                         — title-level TOC (chapter listing). SKIP.
//   doc[1] / doc[N for chapters]   — per-chapter TOC docs.                  SKIP.
//   each remaining doc             — single section body.                   PARSE.
// Documents are separated by the literal sequence `<br /><hr><br />`.
//
// Per-section markup (real example):
//   <p ... class="<prefix>Normal">
//     <a href="...DisplayStatute.aspx?Type=Statute&Statute=22-1-1">
//       <span class="<prefix>SENU">22-1-1</span></a>
//     <span class="<prefix>SENU">. </span>
//     <span class="<prefix>CL">Common-law rule of strict construction abrogated.</span>
//   </p>
//   <p ... class="<prefix>Normal-000000">
//     <span class="<prefix>DefaultParagraphFont">…body text…</span>
//   </p>
//   <p ... class="<prefix>Normal">
//     <span class="<prefix>SCL">Source:</span>
//     <span class="<prefix>SCL-000002">  SDC 1939, § 13.0101; …</span>
//   </p>
//
// The class prefix (`s2046919`, `sb2ae5d2d4cf34e969d177be32e0cb682`, etc.) is
// regenerated per-document by SDLRC's PowerTools-for-OpenXML exporter; we
// match by suffix (`SENU`, `CL`, `DefaultParagraphFont`).
//
// Per-chapter TOC docs (skip) are distinguished by:
//   <span class="<prefix>HG4">CHAPTER </span>
//   <span class="<prefix>HG4C">DEFINITIONS AND GENERAL PROVISIONS</span>
// — i.e. the title heading uses HG4 / HG4C class suffixes, NOT SENU + CL.
//
// robots.txt: no Crawl-delay; /api/ is not disallowed (verified 2026-05-02).

/**
 * @typedef {Object} SDSection
 * @property {string} chapterNum  e.g. "1", "10A", "24A"
 * @property {string} sectionNum  e.g. "22-1-1", "22-10A-3", "22-24A-2.1"
 * @property {string} titleText   heading text (the .CL span content)
 * @property {string} bodyText    section body, HTML-decoded and stripped
 */

// ---------------------------------------------------------------------------
// HTML entity decode + tag strip
// ---------------------------------------------------------------------------

const NAMED_ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  sect: '§',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  rsquo: '’',
  lsquo: '‘',
  rdquo: '”',
  ldquo: '“',
};

/** Decode HTML entities (&amp; &lt; &gt; &nbsp; &#NNN; &#xNN;) */
function decodeEntities(s) {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(parseInt(d, 10)))
    .replace(/&([a-zA-Z]+);/g, (m, name) => {
      const lower = name.toLowerCase();
      return Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, lower) ? NAMED_ENTITIES[lower] : m;
    });
}

/** Strip HTML tags + decode entities + collapse whitespace. */
export function stripHtml(raw) {
  if (!raw) return '';
  let s = raw
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');
  s = decodeEntities(s);
  // Replace U+00A0 NBSP with normal space, then collapse whitespace
  s = s.replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
  return s;
}

// ---------------------------------------------------------------------------
// Fetch — UTF-16LE-aware
// ---------------------------------------------------------------------------

/**
 * Fetch the SD Title 22 dump and decode UTF-16LE bytes.
 * The endpoint serves UTF-16LE with no BOM and no charset; default UTF-8
 * decoding produces garbage interleaved with NUL chars, so we go through
 * arrayBuffer() and use TextDecoder('utf-16le').
 *
 * Implements the same retry semantics as harness fetchWithRetry().
 *
 * @param {string} url
 * @param {{timeoutMs?: number, maxRetries?: number}} [opts]
 * @returns {Promise<string>}
 */
export async function fetchSDTitle22(url, { timeoutMs = 60000, maxRetries = 3 } = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        signal: ctrl.signal,
        headers: { 'User-Agent': 'ImNotAnAttorney-statute-seed/1.0 (legal research)' },
      });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      const ab = await res.arrayBuffer();
      const buf = Buffer.from(ab);
      const decoder = new TextDecoder('utf-16le');
      return decoder.decode(buf);
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      if (attempt < maxRetries) {
        const delay = 1000 * attempt;
        console.warn(`  [sd-fetch] attempt ${attempt} failed: ${err.message} — retry in ${delay}ms`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastErr;
}

// ---------------------------------------------------------------------------
// Document split + per-doc class extraction
// ---------------------------------------------------------------------------

const DOC_SEPARATOR = '<br /><hr><br />';

/**
 * Split the title dump into individual documents.
 * Each document is either the title-level TOC, a per-chapter TOC, or one
 * section body. Caller filters by document type via classifyDoc().
 *
 * @param {string} html
 * @returns {string[]} array of document HTML strings (no separators)
 */
function splitDocs(html) {
  // .split keeps no separators; safe because separator is unambiguous.
  return html.split(DOC_SEPARATOR);
}

/**
 * Find the class-name prefix used inside one document. SDLRC regenerates a
 * per-document hex-ish prefix (e.g. "s2046919", "sb2ae5d2d4cf34e969...").
 * We pin to the FIRST occurrence of `class="s` followed by [a-z0-9]+ chars
 * before any of our suffix tokens, but we accept the prefix as-is.
 *
 * Returns the prefix string (e.g. "s2046919"), or '' if none found.
 *
 * Implementation: take the first `class="s...."` value and trim trailing
 * suffix words like "Normal", "Statute", etc. Simpler: just return the
 * literal `s<prefix>` portion BEFORE the first known suffix, scanning the
 * first 2000 chars of the doc.
 *
 * @param {string} doc
 * @returns {string}
 */
function findPrefix(doc) {
  // Modern SDLRC docs have opening <p class="<prefix><suffix>"> with a stable
  // hex-ish prefix per document. We pin to the first "s..." class attr that
  // ends in (or contains a base form ending in) one of the known suffixes.
  // Heuristic note: scan a generous window — long sections (e.g. 22-1-2
  // Definitions, 42KB) place opening paragraphs further down because of large
  // <style> blocks. 8KB head covers the largest observed style block.
  const window = doc.slice(0, 8192);
  const SUFFIXES = [
    'Normal',
    'SENU',
    'CL',
    'DefaultParagraphFont',
    'HG4',
    'Statute',
    'StatuteNumber1',
    'StatuteNumber2',
    'StatuteNumber3',
    'SCL',
  ];
  const CLASS_PREFIX = 'class="s';
  let pos = window.indexOf(CLASS_PREFIX);
  while (pos !== -1) {
    const start = pos + CLASS_PREFIX.length - 1; // include the leading 's'
    const end = window.indexOf('"', pos + CLASS_PREFIX.length);
    if (end === -1) break;
    const fullClass = window.slice(start, end);
    // Strip any trailing "-000000" disambiguator (multiple variants share the
    // same logical role; e.g. "Normal-000000" and "Normal" coexist).
    const dashIdx = fullClass.indexOf('-', 1);
    const baseClass = dashIdx > 0 ? fullClass.slice(0, dashIdx) : fullClass;
    for (const suf of SUFFIXES) {
      if (baseClass.endsWith(suf)) {
        return baseClass.slice(0, baseClass.length - suf.length);
      }
    }
    pos = window.indexOf(CLASS_PREFIX, pos + 1);
  }
  return '';
}

/**
 * Pull the inner text of the FIRST <span class="<prefix><suffix>"> in a doc.
 * Returns '' if not present.
 */
function firstSpanWithSuffix(doc, prefix, suffix) {
  const needle = `class="${prefix}${suffix}"`;
  const idx = doc.indexOf(needle);
  if (idx === -1) return '';
  // span open tag could end before or after the class attr; find next '>'
  const tagEnd = doc.indexOf('>', idx);
  if (tagEnd === -1) return '';
  const close = doc.indexOf('</span>', tagEnd);
  if (close === -1) return '';
  return doc.slice(tagEnd + 1, close);
}

/**
 * Pull ALL span inner-texts whose class is `<prefix><suffix>`, in document order.
 * Returns an array of raw inner-HTML strings.
 */
function allSpansWithSuffix(doc, prefix, suffix) {
  const needle = `class="${prefix}${suffix}"`;
  const out = [];
  let pos = 0;
  while (true) {
    const idx = doc.indexOf(needle, pos);
    if (idx === -1) break;
    const tagEnd = doc.indexOf('>', idx);
    if (tagEnd === -1) break;
    const close = doc.indexOf('</span>', tagEnd);
    if (close === -1) break;
    out.push(doc.slice(tagEnd + 1, close));
    pos = close + '</span>'.length;
  }
  return out;
}

/** Detect the legacy Wp2Html shape used for some repealed/transferred sections. */
function isLegacyWp2HtmlDoc(doc) {
  // Signature: "File converted by Wp2Html" comment + a "22-X-Y. " prefix in body.
  return doc.indexOf('Wp2Html') !== -1 || doc.indexOf('WP Paired Style') !== -1;
}

/**
 * Classify a single document — section body vs chapter TOC vs title TOC vs other.
 * @param {string} doc
 * @returns {'section' | 'section-legacy' | 'chapter-toc' | 'title-toc' | 'unknown'}
 */
function classifyDoc(doc) {
  if (isLegacyWp2HtmlDoc(doc)) return 'section-legacy';
  const prefix = findPrefix(doc);
  if (!prefix) return 'unknown';
  // Chapter TOC: contains "<prefix>HG4">CHAPTER" pattern OR "<prefix>HG4C">
  // (per-chapter heading class). Per spec these docs lack section body markup.
  const hg4 = `class="${prefix}HG4"`;
  const hg4c = `class="${prefix}HG4C"`;
  const hasHG4 = doc.indexOf(hg4) !== -1 || doc.indexOf(hg4c) !== -1;
  // Section body: has SENU + CL spans (the section number + heading line).
  const senu = `class="${prefix}SENU"`;
  const cl = `class="${prefix}CL"`;
  const hasSection = doc.indexOf(senu) !== -1 && doc.indexOf(cl) !== -1;

  if (hasSection) return 'section';
  if (hasHG4) {
    // Title TOC contains "TITLE 22" via HG4 + "CRIMES" via HG4C, no SENU at all.
    // Chapter TOC contains "CHAPTER 22-1" via HG4 + chapter title via HG4C.
    return doc.indexOf('TITLE') !== -1 && doc.indexOf('CRIMES') !== -1
      ? 'title-toc'
      : 'chapter-toc';
  }
  return 'unknown';
}

/**
 * Parse the legacy Wp2Html shape used for some repealed/transferred sections.
 * Layout (real example):
 *   <title>SDLRC - Codified Law 22 - CRIMES 22-1-3 </title>
 *   ... &nbsp;&nbsp;&nbsp;&nbsp;... 22-1-3. &nbsp;... Repealed by SL 2005, ch 120, &#167; 358...
 *
 * Strategy: pull section number from <title> element, body from everything
 * inside <BODY>...</BODY> after stripping HTML.
 *
 * @param {string} doc
 * @returns {SDSection | null}
 */
function parseLegacySectionDoc(doc) {
  const titleStart = doc.indexOf('<title>');
  const titleEnd = doc.indexOf('</title>', titleStart);
  if (titleStart === -1 || titleEnd === -1) return null;
  const titleText = doc.slice(titleStart + '<title>'.length, titleEnd);
  // Pull "22-X-Y" from the title text; tolerate ranges like "22-1-10 to 22-1-12"
  // (we keep only the FIRST number — those legacy docs cover a range, but the
  // entities_statutes row keys on a single section number).
  const m = /22-(\d+[A-Z]?)-(\d+(?:\.\d+)?[A-Z]?)/.exec(titleText);
  if (!m) return null;
  const chapterRaw = m[1];
  const chapterNum = chapterRaw.replace(/^0+(\d)/, '$1');
  const sectionNum = `22-${m[1]}-${m[2]}`;

  // Body: take everything inside <BODY>...</BODY> (case-insensitive) and strip.
  const lowerDoc = doc.toLowerCase();
  const bodyStart = lowerDoc.indexOf('<body>');
  const bodyEnd = lowerDoc.indexOf('</body>', bodyStart);
  if (bodyStart === -1 || bodyEnd === -1) return null;
  const rawBody = doc.slice(bodyStart + '<body>'.length, bodyEnd);
  const bodyText = stripHtml(rawBody);
  if (!bodyText) return null;

  // Heading text for legacy docs is synthesized from the body — first sentence
  // up to the period typically holds the action ("Repealed by..." / "Transferred to...").
  // For section_text we need a non-empty titleText separate from bodyText, so
  // we synthesize a short heading from the first 80 chars of the action line.
  const headingMatch = /([A-Z][a-zA-Z'’]+(?:\s+(?:to|by)\s+|\s+\w+){0,5})/.exec(bodyText);
  const synthesizedHeading = headingMatch ? headingMatch[1].slice(0, 80) : 'Repealed or Transferred';

  return {
    chapterNum,
    sectionNum,
    titleText: synthesizedHeading,
    bodyText: bodyText.slice(0, 4000),
  };
}

// ---------------------------------------------------------------------------
// Section parsing
// ---------------------------------------------------------------------------

const SECTION_NUM_PATTERN = /^22-(\d+[A-Z]?)-(\d+(?:\.\d+)?[A-Z]?)$/;

/**
 * Parse one section-body document into an SDSection.
 * @param {string} doc
 * @returns {SDSection | null}
 */
function parseSectionDoc(doc) {
  const prefix = findPrefix(doc);
  if (!prefix) return null;

  // SENU spans: there are typically TWO — first holds "22-1-1" (number) inside
  // an <a> tag, second holds ". " (a literal dot+space). We want the first
  // numeric one.
  const senuSpans = allSpansWithSuffix(doc, prefix, 'SENU');
  if (senuSpans.length === 0) return null;

  // Find the first SENU span that, after stripHtml, matches "22-X-Y" pattern
  let sectionNum = '';
  for (const raw of senuSpans) {
    const txt = stripHtml(raw);
    if (SECTION_NUM_PATTERN.test(txt)) {
      sectionNum = txt;
      break;
    }
  }
  if (!sectionNum) return null;

  const m = SECTION_NUM_PATTERN.exec(sectionNum);
  if (!m) return null;
  // chapterNum keeps any letter suffix verbatim ("10A", "24B"); strip leading zeros
  // for plain numerics. AR pattern was: parseInt + back to string. Here SD
  // chapter ids include letters so we just strip a single leading zero pair if any.
  const chapterRaw = m[1]; // e.g. "1", "10A", "24A"
  const chapterNum = chapterRaw.replace(/^0+(\d)/, '$1');

  // titleText = first .CL span (the section heading)
  const titleRaw = firstSpanWithSuffix(doc, prefix, 'CL');
  const titleText = stripHtml(titleRaw);
  if (!titleText) return null;

  // bodyText = concat of all .DefaultParagraphFont spans, stripped + joined
  const bodyParts = allSpansWithSuffix(doc, prefix, 'DefaultParagraphFont');
  const bodyText = bodyParts.map(stripHtml).filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  if (!bodyText) return null;

  return {
    chapterNum,
    sectionNum,
    titleText: titleText.slice(0, 500),
    bodyText: bodyText.slice(0, 4000),
  };
}

// ---------------------------------------------------------------------------
// Top-level parse
// ---------------------------------------------------------------------------

/**
 * Parse the full SD Title 22 dump and extract every section.
 *
 * @param {string} html  decoded UTF-8/UTF-16 string of the title dump
 * @returns {SDSection[]}
 */
export function parseSDTitle22(html) {
  const docs = splitDocs(html);
  const sections = [];
  const seen = new Set();

  for (const doc of docs) {
    const kind = classifyDoc(doc);
    let sec = null;
    if (kind === 'section') {
      sec = parseSectionDoc(doc);
    } else if (kind === 'section-legacy') {
      sec = parseLegacySectionDoc(doc);
    }
    if (!sec) continue;
    // Skip if Repealed / Transferred — section text either reduces to a
    // repeal stub or is empty. We KEEP repealed sections in the seed so
    // downstream charge-extraction can still resolve historical references,
    // but we de-duplicate on sectionNum to defend against accidentally
    // splitting the same section across two doc boundaries.
    if (seen.has(sec.sectionNum)) continue;
    seen.add(sec.sectionNum);
    sections.push(sec);
  }
  return sections;
}

// ---------------------------------------------------------------------------
// Source URL builder
// ---------------------------------------------------------------------------

/**
 * Build the authoritative SDLRC permalink for one section.
 * SDLRC's section-display URL format (verified 2026-05-02):
 *   https://sdlegislature.gov/Statutes/Codified_Laws/DisplayStatute.aspx?Type=Statute&Statute=22-1-1
 * Anchor links inside the dump itself use either the DisplayStatute.aspx
 * form or the shorter `/Statutes?Statute=22-1-1` rewrite. We pick the
 * DisplayStatute.aspx form because it's the long-standing public URL
 * and survives session redirect drift.
 *
 * @param {string} sectionNum  e.g. "22-1-1", "22-10A-3"
 * @returns {string}
 */
export function buildSDSourceUrl(sectionNum) {
  return `https://sdlegislature.gov/Statutes/Codified_Laws/DisplayStatute.aspx?Type=Statute&Statute=${encodeURIComponent(sectionNum)}`;
}
