// Template: scripts/lib/unicourt-harness.mjs
// Pattern: cl-bulk-data-defensive #17 — session-level timeouts via createBulkClient
// Pattern: cl-bulk-data-defensive #18 — COPY FROM STDIN via bulkCopyRows
// csv-bulk-checked: https://law.resource.org/pub/us/code/ — bulk XML files for state codes
//   (Public domain via Public.Resource.Org legal-codes archive). Per-section
//   authoritative URLs still required (state legislature website).
//
// Shared harness for seeding statutes from Law.Resource.Org bulk XML titles.
// LR.O publishes per-state per-title XML in a uniform `<Content Type="Statutes">`
// shape across AR, CO, ID, MS (and historically others). The XML is hierarchical:
//
//   <Content Type="Statutes">
//     <Indexes>
//       <Index Level="1" HasChildren="1">       ← title
//         <Caption>TITLE 18</Caption>
//         <Description>CRIMES AND PUNISHMENTS</Description>
//         <Indexes>
//           <Index Level="2" HasChildren="1">   ← chapter
//             <Caption>CHAPTER 1</Caption>
//             <Description>...</Description>
//             <Indexes>
//               <Index Level="3" HasChildren="0"> ← section (leaf)
//                 <Caption>18-100</Caption>
//                 <Description>TITLE, EFFECT...</Description>
//                 <Content>...HTML-encoded body...</Content>
//                 <ShortName>Idaho Code 18-100</ShortName>
//                 <RevisionHistory>...</RevisionHistory>
//               </Index>
//
// Section identification: `Caption` text (ID style: "18-100") OR with "Section "
// prefix (AR style: "Section 5-1-101"). Both forms collapse to the bare section
// number after `parseLrOXml` strips the prefix.
//
// Title-text source: `Description`.
// Body source: `Content` — HTML-encoded entities + tags inside CDATA-equivalent
// text. We strip via the same primitives as ga-html.mjs `stripHtml`.
//
// Schema: entities_statutes live shape (verified 2026-04-24 via migration
// 20260423e — see unicourt-harness.mjs for full column reference).
//
// Usage:
//   import { ingestState } from '../lib/lawresource-xml-harness.mjs';
//   const result = await ingestState(ID_TITLE18_CONFIG, { dryRun: false });

import crypto from 'crypto';
import { z } from 'zod';
import { createBulkClient, bulkCopyRows } from './pg-bulk-defaults.mjs';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} LrOSection
 * @property {string} chapterNum  e.g. "1", "3" (numeric only, no leading zero)
 * @property {string} sectionNum  e.g. "18-100", "5-1-101"
 * @property {string} titleText   `Description` element text, HTML-stripped
 * @property {string} bodyText    `Content` element text, HTML-stripped
 */

/**
 * @typedef {Object} LrOStateConfig
 * @property {string}   stateCode         Two-letter state code, e.g. "ID"
 * @property {string}   stateName         Full state name, e.g. "Idaho"
 * @property {string}   titleNum          Criminal title number as string, e.g. "18"
 * @property {string}   titleLabel        Human label, e.g. "Crimes and Punishments"
 * @property {string}   titleUrl          URL of LR.O title XML file
 * @property {Function} buildSourceUrl    (sectionNum: string) => string — authoritative URL
 * @property {Function} [parseTitle]      Optional override; defaults to parseLrOXml
 * @property {string}   [crawlDelay]      Robots crawl-delay string (default "none")
 * @property {number}   [fetchTimeoutMs]  HTTP fetch timeout (default 60000)
 */

// ---------------------------------------------------------------------------
// Row schema (mirrors entities_statutes — same as unicourt-harness)
// ---------------------------------------------------------------------------

const StatuteRowSchema = z.object({
  jurisdiction: z.string().min(1).max(100),
  title: z.string().min(1).max(20),
  section: z.string().min(1).max(100),
  subsection: z.null(),
  section_text: z.string().min(1).max(50000),
  is_current: z.literal(true),
  source_urls: z.array(z.string().url()).min(1).max(10),
  text_hash: z.string().regex(/^[a-f0-9]{64}$/),
  effective_date: z.null(),
  scraped_at: z.string().datetime(),
});

// ---------------------------------------------------------------------------
// HTML-entity strip (zero-dep, mirrors ga-html.mjs stripHtml)
// ---------------------------------------------------------------------------

/**
 * Strip HTML tags, decode common entities, collapse whitespace.
 * Identical contract to ga-html.mjs stripHtml so per-state libs can re-export.
 */
export function stripHtml(raw) {
  return raw
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#xa7;|&#167;/gi, '§')
    .replace(/&sect;/gi, '§')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/[\s ]+/g, ' ')
    .trim();
}

// ---------------------------------------------------------------------------
// XML parser (zero-dep regex-based, sufficient for LR.O's well-formed shape)
// ---------------------------------------------------------------------------

/**
 * Decode XML entities INSIDE element text content (one pass — does not
 * recursively decode HTML inside).
 *
 * LR.O wraps body HTML inside <Content>...</Content> with HTML entities
 * encoded twice: once for XML safety (&lt; → <) and again for HTML safety
 * (&amp;nbsp; → &nbsp;). We decode the XML layer here; the second HTML
 * layer is decoded by stripHtml during section-body normalisation.
 */
function decodeXmlEntities(s) {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/**
 * Extract the text content of the FIRST element matching `tag` from `xml`.
 * Returns null if not found. Returns the inner content with XML entities
 * decoded once (so embedded HTML entities like &amp;nbsp; survive for stripHtml).
 *
 * Matches `<Tag>...</Tag>` AND `<Tag attr="x">...</Tag>`. Self-closing tags
 * (e.g. `<Index/>`) return null since there is no content.
 */
function extractFirstTagContent(xml, tag) {
  const re = new RegExp('<' + tag + '(?:\\s[^>]*)?>([\\s\\S]*?)</' + tag + '>', 'i');
  const m = re.exec(xml);
  if (!m) return null;
  return decodeXmlEntities(m[1]);
}

/**
 * Extract the offset and inner content of every `<Index Level="L" ...>...</Index>`
 * element at any nesting depth, BUT only when its `Level` attribute equals the
 * requested `targetLevel`. Critically, this matches BALANCED Index pairs (the
 * outer Index that contains the matching close tag), not just lexical
 * `<Index>...<Index>` segments — required because Index elements are nested
 * inside Indexes wrappers inside other Index elements.
 *
 * Implementation: walk forward through the source, finding every `<Index ...>`
 * opener, parsing its `Level` attribute, then scanning forward for the
 * matching `</Index>` by counting depth.
 *
 * @param {string} xml
 * @param {number|null} targetLevel  If null, return ALL Index nodes.
 * @returns {Array<{level:number, attrs:string, inner:string, start:number, end:number}>}
 */
function extractIndexNodes(xml, targetLevel = null) {
  const out = [];
  const openRe = /<Index(\s[^>]*)?>/g;
  const closeTag = '</Index>';
  let m;

  while ((m = openRe.exec(xml)) !== null) {
    const attrs = m[1] || '';
    const levelMatch = /\bLevel\s*=\s*"(\d+)"/.exec(attrs);
    const level = levelMatch ? parseInt(levelMatch[1], 10) : 0;

    // Scan forward to find matching </Index> by depth-counting.
    const startInner = m.index + m[0].length;
    let depth = 1;
    let i = startInner;

    while (i < xml.length && depth > 0) {
      const nextOpen = xml.indexOf('<Index', i);
      const nextClose = xml.indexOf(closeTag, i);
      if (nextClose === -1) break;
      if (nextOpen !== -1 && nextOpen < nextClose) {
        // Verify this is a real <Index> opener (not <Indexes>)
        const ch = xml.charAt(nextOpen + 6); // char after "<Index"
        if (ch === ' ' || ch === '>' || ch === '\t' || ch === '\n') {
          depth += 1;
          i = nextOpen + 6;
        } else {
          // <Indexes> wrapper — skip past it
          i = nextOpen + 6;
        }
      } else {
        depth -= 1;
        if (depth === 0) {
          const inner = xml.slice(startInner, nextClose);
          if (targetLevel === null || level === targetLevel) {
            out.push({ level, attrs, inner, start: m.index, end: nextClose + closeTag.length });
          }
          // Resume outer scan past this Index's close tag.
          openRe.lastIndex = nextClose + closeTag.length;
          break;
        } else {
          i = nextClose + closeTag.length;
        }
      }
    }
  }

  return out;
}

/**
 * Parse a Law.Resource.Org bulk XML title file into LrOSection[].
 *
 * Strategy:
 *   - Recurse through Index nodes, treating any Index whose direct children
 *     contain <Content> as a leaf section.
 *   - Track ancestor Caption to derive chapterNum (the immediately enclosing
 *     ancestor whose Caption text matches /chapter\s*(\d+)/i).
 *   - sectionNum = `Caption` text with optional "Section " prefix stripped.
 *
 * @param {string} xml
 * @returns {LrOSection[]}
 */
export function parseLrOXml(xml) {
  const sections = [];

  // Recursive walker. We track the currently-known chapterNum as we descend.
  function walk(innerXml, currentChapter) {
    const indexes = extractIndexNodes(innerXml, null);
    for (const node of indexes) {
      // We only walk DIRECT children of innerXml — extractIndexNodes returns
      // all balanced Index nodes including nested ones. Filter to those that
      // start at depth 0 of the current innerXml (i.e. not inside another
      // Index from `indexes`).
      if (isNestedInsideEarlier(node, indexes)) continue;

      // Caption + Description for this node.
      const captionRaw = extractFirstTagContent(node.inner, 'Caption');
      const caption = captionRaw ? stripHtml(captionRaw) : '';
      const descRaw = extractFirstTagContent(node.inner, 'Description');
      const description = descRaw ? stripHtml(descRaw) : '';

      // Detect "this is a chapter" vs "this is a section".
      // Chapter: Caption like "Chapter 1" / "CHAPTER 1" / "Subtitle 1".
      // Section: Caption like "18-100" / "5-1-101" / "Section 5-1-101".
      const chapterMatch = /^chapter\s+(\d+)/i.exec(caption);
      const subtitleMatch = /^subtitle\s+(\d+)/i.exec(caption);
      const nextChapter = chapterMatch
        ? String(parseInt(chapterMatch[1], 10))
        : (subtitleMatch ? currentChapter : currentChapter);

      // Try to extract a Content element ONLY at the immediate level of this
      // Index (not inside nested Index children). Find Content that occurs
      // BEFORE the first nested <Index> opener.
      const firstNestedIdx = node.inner.search(/<Index(\s|>)/);
      const contentSearchScope = firstNestedIdx === -1
        ? node.inner
        : node.inner.slice(0, firstNestedIdx);
      const contentRaw = extractFirstTagContent(contentSearchScope, 'Content');

      if (contentRaw !== null) {
        // Leaf section.
        const sectionNum = caption.replace(/^section\s+/i, '').trim();
        if (sectionNum && description) {
          const bodyText = stripHtml(contentRaw);
          if (bodyText) {
            sections.push({
              chapterNum: nextChapter || '0',
              sectionNum,
              titleText: description,
              bodyText,
            });
          }
        }
      }

      // Always recurse — Index nodes can have BOTH Content (own body) and
      // nested Index children (subsections). We only emit leaf sections;
      // nested Index nodes will produce their own sections on recursion.
      walk(node.inner, nextChapter);
    }
  }

  // Start at root <Content Type="Statutes"><Indexes>...</Indexes></Content>.
  // Walking from root xml works because extractIndexNodes ignores the
  // top-level <Content> tag (only matches <Index>).
  walk(xml, '0');
  return sections;
}

/**
 * Check if `node` is nested inside any earlier-starting node from `siblings`.
 * Used to filter parent-only nodes from a flat extraction.
 */
function isNestedInsideEarlier(node, siblings) {
  for (const s of siblings) {
    if (s === node) continue;
    if (s.start < node.start && s.end > node.end) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Hash / row builder (mirrors unicourt-harness — kept duplicated rather than
// imported because their config types differ; they share schema only.)
// ---------------------------------------------------------------------------

export function computeSectionHash(titleText, bodyText) {
  const sectionText = `${titleText}\n\n${bodyText}`;
  return crypto.createHash('sha256').update(sectionText, 'utf8').digest('hex');
}

export function buildSectionRow(config, chapterNum, sectionNum, titleText, bodyText) {
  if (!titleText || !titleText.trim()) {
    return { row: null, errors: ['titleText must be non-empty'] };
  }
  if (!bodyText || !bodyText.trim()) {
    return { row: null, errors: ['bodyText must be non-empty'] };
  }

  const now = new Date().toISOString();
  const sourceUrl = config.buildSourceUrl(sectionNum);
  const sectionText = `${titleText.slice(0, 500)}\n\n${bodyText.slice(0, 49490)}`;

  const raw = {
    jurisdiction: config.stateCode,
    title: config.titleNum,
    section: sectionNum,
    subsection: null,
    section_text: sectionText,
    is_current: true,
    source_urls: [sourceUrl],
    text_hash: computeSectionHash(titleText, bodyText),
    effective_date: null,
    scraped_at: now,
  };

  const result = StatuteRowSchema.safeParse(raw);
  if (!result.success) {
    const errors = result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`);
    return { row: null, errors };
  }

  return { row: result.data, errors: [] };
}

// ---------------------------------------------------------------------------
// Fetch (identical contract to unicourt-harness)
// ---------------------------------------------------------------------------

export async function fetchWithRetry(url, { timeoutMs = 60000, maxRetries = 3 } = {}) {
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
      return await res.text();
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      if (attempt < maxRetries) {
        const delay = 1000 * attempt;
        console.warn(`  [fetch] attempt ${attempt} failed: ${err.message} — retry in ${delay}ms`);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }
  throw lastErr;
}

// ---------------------------------------------------------------------------
// DB apply (identical contract to unicourt-harness)
// ---------------------------------------------------------------------------

function textArrayLiteral(arr) {
  if (!arr || arr.length === 0) return '{}';
  const escaped = arr.map(s => '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"');
  return '{' + escaped.join(',') + '}';
}

export async function applyToDb(rows, config, { dryRun = false, connectionString }) {
  if (dryRun) {
    console.log(`[dry-run] would COPY ${rows.length} rows for ${config.stateName} title ${config.titleNum}`);
    for (const r of rows.slice(0, 3)) {
      console.log(`  ${r.jurisdiction} § ${r.section}: ${r.section_text.slice(0, 60).replace(/\n/g, ' ')}`);
    }
    if (rows.length > 3) console.log(`  …and ${rows.length - 3} more`);
    return { rowCount: rows.length, durationMs: 0 };
  }

  const { client, cleanup } = await createBulkClient({ connectionString });
  try {
    await client.query('BEGIN');

    const del = await client.query(
      `DELETE FROM entities_statutes WHERE jurisdiction IN ($1, $2) AND title = $3`,
      [config.stateCode, config.stateName, config.titleNum],
    );
    console.log(`  deleted ${del.rowCount} existing rows for ${config.stateCode}/${config.stateName} title ${config.titleNum}`);

    const COLUMNS = [
      'jurisdiction', 'title', 'section', 'subsection',
      'section_text', 'is_current', 'source_urls', 'text_hash',
      'effective_date', 'scraped_at',
    ];

    function rowToArray(r) {
      return [
        r.jurisdiction,
        r.title,
        r.section,
        null,
        r.section_text,
        true,
        textArrayLiteral(r.source_urls),
        r.text_hash,
        null,
        r.scraped_at,
      ];
    }

    async function* rowsIter() {
      for (const r of rows) yield rowToArray(r);
    }

    const { rowCount, durationMs } = await bulkCopyRows(client, 'entities_statutes', COLUMNS, rowsIter());

    await client.query('COMMIT');
    return { rowCount, durationMs };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    await cleanup();
  }
}

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

export async function ingestState(config, opts = {}) {
  const { dryRun = false, verbose = false } = opts;
  const connectionString = opts.connectionString || process.env.SUPABASE_DB_URL;
  if (!connectionString && !dryRun) {
    throw new Error('connectionString or SUPABASE_DB_URL required for live run');
  }

  const t0 = Date.now();
  console.log(`[lawresource-xml-harness] fetching ${config.stateCode} Title ${config.titleNum} from ${config.titleUrl}`);

  const xml = await fetchWithRetry(config.titleUrl, { timeoutMs: config.fetchTimeoutMs ?? 60000 });
  console.log(`  fetched ${Math.round(xml.length / 1024)}KB`);

  console.log(`  parsing sections…`);
  const parser = config.parseTitle || parseLrOXml;
  const sections = parser(xml);
  console.log(`  found ${sections.length} sections`);

  const rows = [];
  const skipped = [];
  const errors = [];

  for (const sec of sections) {
    if (!sec.titleText || !sec.bodyText) {
      skipped.push(sec.sectionNum + ' (empty title or body)');
      continue;
    }
    const { row, errors: rowErrors } = buildSectionRow(
      config,
      sec.chapterNum,
      sec.sectionNum,
      sec.titleText,
      sec.bodyText,
    );
    if (rowErrors.length > 0) {
      errors.push({ sectionNum: sec.sectionNum, errors: rowErrors });
      if (verbose) console.warn(`  [skip] ${sec.sectionNum}: ${rowErrors.join('; ')}`);
    } else {
      rows.push(row);
    }
  }

  console.log(`  valid rows: ${rows.length}, skipped: ${skipped.length}, errors: ${errors.length}`);

  if (errors.length > 0) {
    console.warn(`  validation errors:`);
    for (const e of errors.slice(0, 10)) {
      console.warn(`    ${e.sectionNum}: ${e.errors.join('; ')}`);
    }
  }

  const { rowCount, durationMs: copyMs } = await applyToDb(rows, config, { dryRun, connectionString });

  const totalMs = Date.now() - t0;
  console.log(`  done: ${rowCount} rows in ${totalMs}ms (copy: ${copyMs}ms)`);

  return {
    rowCount,
    skipCount: skipped.length,
    errorCount: errors.length,
    durationMs: totalMs,
  };
}

// Exports for testing
export const _internals = {
  decodeXmlEntities,
  extractFirstTagContent,
  extractIndexNodes,
  isNestedInsideEarlier,
};
