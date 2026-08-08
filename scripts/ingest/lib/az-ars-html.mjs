// csv-bulk-checked: none-exists — azleg.gov per-section HTML, no bulk file (live ingest in engine repo, this lib is parser-only)
// Template: scripts/ingest/lib/bucket-b-html.mjs
// Pattern: cl-bulk-data-defensive #19 — robots.txt Crawl-delay honored downstream by engine orchestrator
// LIVE INGEST: deferred to ImNotAnAttorney-engine per AZ robots-120s — do not run from -web.
//
// HTML parsing helpers for www.azleg.gov Title 13 (Arizona Revised Statutes — Criminal Code).
//
// Source surfaces (verified live 2026-05-02):
//   TOC : https://www.azleg.gov/arsDetail/?title=13
//   Sec : https://www.azleg.gov/ars/13/<5-digit-id>.htm
//
// Robots.txt mandate (live-fetched 2026-05-02 from https://www.azleg.gov/robots.txt):
//   User-agent: * / Crawl-delay: 120
//
// 913 sections × 120s ≈ 30.4 hours minimum. This is overnight-cron territory.
// The orchestrator (with the Crawl-delay sleep loop, retry/back-off, COPY load)
// belongs in ImNotAnAttorney-engine, hosted on cron-job.org infra. This file
// ships ONLY the pure HTML parser surface so the engine repo can consume it
// without re-doing the parser work.
//
// Page structure (verified against the 3 fixture HTMLs in __tests__/fixtures/az/):
//
//   TOC (toc-title-13.html):
//     One single body <ul> per section pair, e.g.
//       <li class="colleft"><a class="stat" ... href="/viewdocument/?docName=
//         https://www.azleg.gov/ars/13/00101.htm">13-101</a></li>
//       <li class="colright"> Purposes</li>
//     Chapter headers between section groups:
//       >Chapter 1</a><div class="two-thirds">GENERAL PROVISIONS</div>
//     Chapter IDs may include decimal subchapters (7.1, 34.1, 35.1) — kept as
//     strings.
//
//   Section page (section-13-101.html, section-13-1101.html):
//     <TITLE>13-101 - Purposes</TITLE>
//     <p><font color=GREEN>13-101</font>. <font color=PURPLE><u>Purposes</u></font></p>
//     <p>It is declared that the public policy of this state...</p>
//     ...
//
//     Repealed sections (per azleg convention, conventional pattern; if a
//     fixture surfaces with this shape we detect it):
//     <p>... Repealed by ...</p>  (body contains "Repealed" without statutory text)
//
// Pure in-memory string processing — no file I/O, no fetch (engine orchestrator
// owns network + persistence).

export const AZ_BASE_URL = 'https://www.azleg.gov';
export const AZ_TITLE_13_TOC_URL = `${AZ_BASE_URL}/arsDetail/?title=13`;
export const AZ_TITLE = '13';

/**
 * Crawl-delay mandated by https://www.azleg.gov/robots.txt (verified 2026-05-02).
 * Engine orchestrator MUST sleep this many seconds between section fetches.
 * Ignoring this constant got TX/IN/NJ Justia scrapers banned 2026-05-01.
 */
export const AZ_ROBOTS_CRAWL_DELAY_SEC = 120;

// ─── URL builder ──────────────────────────────────────────────────────────────

/**
 * Build the authoritative section URL for a given short ID like "13-101".
 *
 * Filename is the section number (without "13-") zero-padded to 5 digits:
 *   13-1     → 00001.htm
 *   13-101   → 00101.htm
 *   13-1101  → 01101.htm
 *   13-3624  → 03624.htm
 *
 * Decimal sub-section IDs (e.g. "13-1417.01") follow the same pattern with
 * the decimal preserved: padding applies to the integer portion only.
 *
 * @param {string} idShort — section short id like "13-101" or "13-3-101"-style.
 * @returns {string} HTTPS URL.
 */
export function buildSectionUrl(idShort) {
  const stripped = String(idShort).trim().replace(/^13-/, '');
  if (!stripped) {
    throw new Error(`buildSectionUrl: empty section id from "${idShort}"`);
  }
  // Decimal sub-section: pad integer portion only.
  const dotIdx = stripped.indexOf('.');
  if (dotIdx >= 0) {
    const intPart = stripped.slice(0, dotIdx);
    const decPart = stripped.slice(dotIdx); // includes the leading "."
    return `${AZ_BASE_URL}/ars/13/${intPart.padStart(5, '0')}${decPart}.htm`;
  }
  return `${AZ_BASE_URL}/ars/13/${stripped.padStart(5, '0')}.htm`;
}

// ─── TOC parsing ──────────────────────────────────────────────────────────────

/**
 * @typedef {Object} AzTocSection
 * @property {string} idShort       — "13-101", "13-1101", "13-3624.01"
 * @property {string} urlSuffix     — "00101.htm", "01101.htm" (filename only)
 * @property {string} chapter       — "1", "7.1", "34.1" (string — preserves decimal)
 * @property {string} chapterTitle  — chapter heading text, e.g. "GENERAL PROVISIONS"
 */

/**
 * Parse the Title 13 TOC HTML into an array of section descriptors with
 * resolved chapter context.
 *
 * Section href pattern:
 *   href="/viewdocument/?docName=https://www.azleg.gov/ars/13/<digits>.htm">13-XXX</a>
 *
 * Chapter heading pattern (positional anchor — must precede sections it owns):
 *   >Chapter <id></a><div class="two-thirds"><title></div>
 *
 * @param {string} html — full TOC page HTML.
 * @returns {{ sections: AzTocSection[] }}
 */
export function parseTocPage(html) {
  if (typeof html !== 'string' || !html.length) {
    throw new Error('parseTocPage: html arg must be a non-empty string');
  }

  // 1. Find every chapter anchor with its byte offset.
  const chapterRe = />Chapter\s+(\d+(?:\.\d+)?)\s*<\/a><div class="two-thirds">([^<]+)<\/div>/g;
  const chapters = [];
  let cm;
  while ((cm = chapterRe.exec(html))) {
    chapters.push({
      idx: cm.index,
      id: cm[1],
      title: cm[2].trim(),
    });
  }

  // 2. Find every section anchor + adjacent title cell with byte offset.
  // Pattern enforces the colleft/colright pairing so a stray <a> on the page
  // (e.g. nav crumbs) won't be misclassified as a section.
  const sectionRe =
    /href="\/viewdocument\/\?docName=https:\/\/www\.azleg\.gov\/ars\/13\/(\d+(?:\.\d+)?)\.htm"[^>]*>(13-[0-9.]+)<\/a><\/li><li class="colright">\s*([^<]*)<\/li>/g;
  const sections = [];
  let sm;
  while ((sm = sectionRe.exec(html))) {
    sections.push({
      idx: sm.index,
      urlSuffix: `${sm[1]}.htm`,
      idShort: sm[2],
      _tocTitle: (sm[3] || '').trim(), // diagnostic only — section page is the title source of truth
    });
  }

  // 3. Map each section to the chapter whose offset is the largest <= section offset.
  function chapterFor(secIdx) {
    let cur = null;
    for (const c of chapters) {
      if (c.idx > secIdx) break;
      cur = c;
    }
    return cur;
  }

  const out = [];
  for (const s of sections) {
    const c = chapterFor(s.idx);
    if (!c) {
      // Section appearing before any chapter heading — should never happen on
      // a well-formed AZ TOC. Skip rather than fabricate chapter context.
      continue;
    }
    out.push({
      idShort: s.idShort,
      urlSuffix: s.urlSuffix,
      chapter: c.id,
      chapterTitle: c.title,
    });
  }

  return { sections: out };
}

// ─── Section page parsing ─────────────────────────────────────────────────────

/**
 * @typedef {Object} AzParsedSection
 * @property {string} sectionNumber — "13-101", "13-1101"
 * @property {string} title         — "Purposes", "Definitions"
 * @property {string} body          — concatenated paragraph text (no HTML tags)
 * @property {string} sourceUrl     — the URL passed in for traceability
 */

/**
 * @typedef {Object} AzRepealedSection
 * @property {true}   repealed
 * @property {string} sectionNumber
 * @property {string} sourceUrl
 */

/**
 * Parse a single section page into either a populated section row or a
 * repealed-marker row. Returns null when the HTML cannot be classified
 * (caller decides whether to retry / log / skip).
 *
 * @param {string} html       — section page HTML
 * @param {string} urlForRef  — the URL the HTML was fetched from (passed back as-is)
 * @returns {AzParsedSection | AzRepealedSection | null}
 */
export function parseSectionPage(html, urlForRef) {
  if (typeof html !== 'string' || !html.length) return null;

  // 1. Title tag — authoritative source of "<id> - <title>" pair.
  //    Falls back to the inline GREEN/PURPLE pair if <TITLE> is missing.
  const titleTagMatch = html.match(/<TITLE>\s*([^<]+?)\s*<\/TITLE>/i);
  let sectionNumber = null;
  let title = null;
  if (titleTagMatch) {
    const raw = titleTagMatch[1];
    const dashIdx = raw.indexOf(' - ');
    if (dashIdx > 0) {
      sectionNumber = raw.slice(0, dashIdx).trim();
      title = raw.slice(dashIdx + 3).trim();
    }
  }

  // Fallback / sanity-check: inline GREEN ID + PURPLE underlined title.
  if (!sectionNumber || !title) {
    const inlineMatch = html.match(
      /<font\s+color=GREEN>([^<]+)<\/font>\s*\.?\s*<font\s+color=PURPLE>(?:<u>)?([^<]+?)(?:<\/u>)?<\/font>/i
    );
    if (inlineMatch) {
      sectionNumber = sectionNumber || inlineMatch[1].trim();
      title = title || inlineMatch[2].trim();
    }
  }

  if (!sectionNumber) return null;

  // 2. Extract body paragraphs. Strip the heading <p> first (contains the
  //    GREEN id + PURPLE title we already captured).
  // Find body region — between </HEAD> ... </BODY> if present, else whole html.
  let region = html;
  const bodyStart = html.search(/<BODY[^>]*>/i);
  const bodyEnd = html.search(/<\/BODY>/i);
  if (bodyStart >= 0 && bodyEnd > bodyStart) {
    region = html.slice(bodyStart, bodyEnd);
  }

  // Pull every <p>...</p>. Remove the heading paragraph (the one containing
  // the GREEN font tag) since that's the title row.
  const paraRe = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  const paragraphs = [];
  let pm;
  while ((pm = paraRe.exec(region))) {
    const inner = pm[1];
    if (/<font\s+color=GREEN>/i.test(inner)) continue; // heading row
    const text = stripHtmlAndDecode(inner).trim();
    if (text) paragraphs.push(text);
  }

  const body = paragraphs.join('\n\n');

  // 3. Repealed-section detection. AZ marks repealed sections with body
  //    text like "Repealed by Laws YYYY..." or just "Repealed." — no
  //    statutory content. Heuristic: very short body that starts with
  //    "Repealed" (case-insensitive).
  const looksRepealed =
    body.length < 200 && /^repealed\b/i.test(body.trim());
  if (looksRepealed) {
    return {
      repealed: true,
      sectionNumber,
      sourceUrl: urlForRef || buildSectionUrl(sectionNumber),
    };
  }

  return {
    sectionNumber,
    title: title || '',
    body,
    sourceUrl: urlForRef || buildSectionUrl(sectionNumber),
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const NAMED_ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

/**
 * Strip HTML tags and decode common HTML entities. Pure string ops, no DOM.
 * Internal helper — exported for test visibility.
 */
export function stripHtmlAndDecode(s) {
  if (typeof s !== 'string') return '';
  // Drop tags.
  let out = s.replace(/<[^>]+>/g, '');
  // Decode named entities.
  out = out.replace(/&([a-zA-Z]+);/g, (_, name) =>
    Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, name)
      ? NAMED_ENTITIES[name]
      : `&${name};`
  );
  // Decode numeric entities.
  out = out.replace(/&#(\d+);/g, (_, n) => {
    const code = Number(n);
    return Number.isFinite(code) && code > 0 && code < 0x110000
      ? String.fromCodePoint(code)
      : `&#${n};`;
  });
  out = out.replace(/&#x([0-9a-fA-F]+);/g, (_, n) => {
    const code = parseInt(n, 16);
    return Number.isFinite(code) && code > 0 && code < 0x110000
      ? String.fromCodePoint(code)
      : `&#x${n};`;
  });
  // Collapse runs of whitespace.
  out = out.replace(/\s+/g, ' ');
  return out;
}
