// Template: scripts/ingest/lib/ga-html.mjs
// Pattern: cl-bulk-data-defensive #18 — AR Title 5 is bulk XML, parse in-memory
// Source: https://law.resource.org/pub/us/code/ar/arkansas.xml.2012/ar.code.05.2012.xml
//
// AR XML structure (law.resource.org 2012 edition):
//   <Index Level="N" HasChildren="0">       ← leaf node = one section
//     <Caption>Section 5-1-101</Caption>    ← section number
//     <Description>Title</Description>      ← section heading
//     <Content>&lt;br&gt;…</Content>        ← HTML-encoded body text
//     <ShortName>Ark. Code 5-1-101</ShortName>
//   </Index>
//
// Source URL strategy: Justia returned 403 (Cloudflare gate, confirmed 2026-05-01).
// Falling back to LR.O archive URL with #Section-5-X-XXX fragment anchor —
// the canonical permalink for each section in the published XML edition.
// URL: https://law.resource.org/pub/us/code/ar/arkansas.xml.2012/ar.code.05.2012.xml#Section-5-X-XXX
//
// robots.txt (law.resource.org): no Crawl-delay, no /pub/ disallow (verified 2026-05-01).

/**
 * @typedef {Object} ArSection
 * @property {string} chapterNum  e.g. "1", "3", "28"
 * @property {string} sectionNum  e.g. "5-1-101", "5-28-201"
 * @property {string} titleText   heading text (from <Description>)
 * @property {string} bodyText    body text, HTML-decoded and stripped
 */

// ---------------------------------------------------------------------------
// HTML entity decode + strip
// ---------------------------------------------------------------------------

/**
 * Decode HTML entities and strip HTML tags from XML-encoded content.
 * The <Content> field in LR.O XML contains HTML-encoded body text.
 */
export function stripHtml(raw) {
  return raw
    // Decode common HTML entities
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#167;/g, '§')
    .replace(/&#xa7;/gi, '§')
    .replace(/&sect;/gi, '§')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(Number(dec)))
    // Remove script/style blocks
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    // Remove all remaining HTML tags
    .replace(/<[^>]+>/g, ' ')
    // Collapse whitespace
    .replace(/[\s ]+/g, ' ')
    .trim();
}

// ---------------------------------------------------------------------------
// XML leaf extraction (no external XML parser — pure string splitting)
// ---------------------------------------------------------------------------

/**
 * Extract all leaf Index nodes (HasChildren="0") from the LR.O XML.
 * Returns raw inner content strings for each node.
 *
 * Strategy: split on <Index Level="\d+" HasChildren="0"> boundaries,
 * extract Caption / Description / Content from each chunk.
 */
function extractLeafNodes(xml) {
  const OPEN = 'HasChildren="0">';
  const CLOSE = '</Index>';
  const nodes = [];
  let pos = 0;

  while (true) {
    const openIdx = xml.indexOf(OPEN, pos);
    if (openIdx === -1) break;
    const closeIdx = xml.indexOf(CLOSE, openIdx);
    if (closeIdx === -1) break;
    nodes.push(xml.slice(openIdx + OPEN.length, closeIdx));
    pos = closeIdx + CLOSE.length;
  }

  return nodes;
}

/**
 * Extract the text of a simple XML element: <Tag>text</Tag>.
 * Returns '' if not found or empty.
 */
function extractTag(inner, tag) {
  const open = '<' + tag + '>';
  const close = '</' + tag + '>';
  const start = inner.indexOf(open);
  if (start === -1) return '';
  const end = inner.indexOf(close, start);
  if (end === -1) return '';
  return inner.slice(start + open.length, end);
}

// ---------------------------------------------------------------------------
// Parse
// ---------------------------------------------------------------------------

/**
 * Parse the LR.O AR Title 5 XML and extract all sections.
 *
 * @param {string} xml - Full content of ar.code.05.2012.xml
 * @returns {ArSection[]}
 */
export function parseTitleSections(xml) {
  const nodes = extractLeafNodes(xml);
  const sections = [];

  for (const inner of nodes) {
    const caption = extractTag(inner, 'Caption').trim();
    // Only process nodes whose Caption matches "Section 5-\d+-\d+"
    const capMatch = /^Section (5-(\d+)-\d+[a-z]*)$/.exec(caption);
    if (!capMatch) continue;

    const sectionNum = capMatch[1];   // e.g. "5-1-101"
    const chapterStr = capMatch[2];   // e.g. "1", "28"
    const chapterNum = String(parseInt(chapterStr, 10)); // strip leading zeros

    const description = extractTag(inner, 'Description').trim();
    const contentRaw = extractTag(inner, 'Content').trim();

    if (!description) continue;
    if (!contentRaw) continue;

    const bodyText = stripBodyContent(contentRaw);
    if (!bodyText) continue;

    sections.push({
      chapterNum,
      sectionNum,
      titleText: description,
      bodyText,
    });
  }

  return sections;
}

/**
 * Decode and strip HTML from the <Content> field.
 * Removes history/revision lines that start with "HISTORY:" prefix.
 * Truncates to 4000 chars.
 */
function stripBodyContent(raw) {
  const decoded = stripHtml(raw);

  // Split into sentences/fragments and filter history lines
  // History looks like "HISTORY: Acts 1975, No. 280…"
  const parts = decoded.split(/(?<=\.)\s+/);
  const filtered = parts.filter(p => !isHistoryLine(p));
  const body = filtered.join(' ').replace(/\s+/g, ' ').trim();

  return body.slice(0, 4000);
}

/**
 * History lines start with "HISTORY:" or match common citation patterns.
 */
function isHistoryLine(text) {
  const t = text.trim();
  return t.startsWith('HISTORY:') ||
         t.startsWith('History.') ||
         /^Acts \d{4},/.test(t) ||
         /^A\.S\.A\. 1947/.test(t);
}

// ---------------------------------------------------------------------------
// Source URL builder
// ---------------------------------------------------------------------------

/**
 * Build the LR.O archive URL for an AR section.
 * Justia returned 403 (Cloudflare, confirmed 2026-05-01) — using LR.O permalink.
 * Pattern: https://law.resource.org/pub/us/code/ar/arkansas.xml.2012/ar.code.05.2012.xml#Section-5-X-XXX
 *
 * @param {string} sectionNum e.g. "5-1-101"
 * @returns {string}
 */
export function buildArSourceUrl(sectionNum) {
  // Fragment anchor uses the Caption text with spaces replaced by hyphens
  const anchor = 'Section-' + sectionNum;
  return `https://law.resource.org/pub/us/code/ar/arkansas.xml.2012/ar.code.05.2012.xml#${anchor}`;
}
