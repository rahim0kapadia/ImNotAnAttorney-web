// HTML parsing helpers for www.ilga.gov static ILCS statute pages.
//
// Source surface: https://www.ilga.gov/documents/legislation/ilcs/documents/<DocName>.htm
// These are static, session-free files served directly by ILGA.
//
// Robots: User-agent: * / Crawl-delay: 10 (on www.ilga.gov)
//   Disallow: /account /admin /search /api — legislation paths NOT disallowed.
// Verified 2026-05-01 against: https://www.ilga.gov/robots.txt
//
// DocName format: <3-digit-chapter><7-digit-act>K<section>
//   e.g. 720 ILCS 5/9-1 → 072000050K9-1
//   e.g. 720 ILCS 570/401 → 072005700K401
//
// Page structure (verified 2026-05-01):
//   <html><body><table>...<font face="Courier New">(720 ILCS 5/9-1)</font>
//   <font face="Courier New">Sec. 9-1. First degree murder. </font>
//   <font face="Courier New">(a) A person who kills...</font>...
//   <font face="Courier New">(Source: P.A. 103-51, eff. 1-1-24.)</font>
//   </table></body></html>
//
// Pure in-memory string processing — no file I/O (FL/OH/VA/GA pattern).

export const IL_BASE_URL = 'https://www.ilga.gov';
export const IL_STATIC_BASE = `${IL_BASE_URL}/documents/legislation/ilcs/documents`;

// ── Acts to seed ─────────────────────────────────────────────────────────────
// Each entry: { docPrefix, actLabel, sections[] }
// docPrefix = the DocName prefix before the 'K' (e.g. '072000050' for 720/5)
// sections = list of sectionId strings matching the K<sectionId>.htm filenames.
//
// 720 ILCS 5 — Criminal Code of 2012 (primary criminal code)
// Sections derived from ILCS table of contents, verified 2026-05-01.
// Integer sections enumerated by probe; decimal sub-sections added where known.
export const IL_ACTS = [
  {
    actCode: '5',
    docPrefix: '072000050',
    actLabel: '720 ILCS 5 (Criminal Code of 2012)',
    // Article 1 (Short title, purposes)
    // Article 2 (General definitions)
    // Article 3 (Culpable mental states)
    // Article 4 (Inchoate offenses)
    // Article 5 (Parties to crime)
    // Article 6 (Defenses)
    // Article 7 (Justifiable use of force)
    // Article 8 (Anticipatory offenses)
    // Article 9 (Murder and related offenses)
    // Article 10 (Kidnapping)
    // Article 12 (Bodily harm)
    // Articles 14-49 (various)
    sections: [
      // Art 1
      '1-1','1-2','1-3','1-4','1-5','1-6','1-8',
      // Art 2
      '2-1','2-2','2-3','2-4','2-5','2-6','2-7','2-8','2-9','2-10',
      '2-11','2-12','2-13','2-14','2-15','2-16','2-17','2-18','2-19','2-20',
      '2-21','2-22',
      // Art 3
      '3-1','3-2','3-3','3-4','3-5','3-6','3-7','3-8',
      // Art 4
      '4-1','4-2','4-3','4-4','4-5','4-6','4-7','4-8','4-9',
      // Art 5
      '5-1','5-2','5-3','5-4','5-5',
      // Art 6
      '6-1','6-2','6-3','6-4',
      // Art 7
      '7-1','7-2','7-3','7-4','7-5','7-6','7-7','7-8','7-9','7-10','7-11','7-12','7-13','7-14',
      // Art 8
      '8-1','8-2','8-3','8-4',
      // Art 9
      '9-1','9-1.2','9-2','9-3','9-3.3','9-3.4',
      // Art 10
      '10-1','10-2','10-3','10-3.1','10-4','10-5','10-7','10-9','10-10',
      // Art 11 (sex offenses)
      '11-1.20','11-1.30','11-1.40','11-1.50','11-1.60','11-6','11-6.5','11-6.6',
      '11-9.3','11-9.4','11-9.5','11-14','11-14.1','11-14.3','11-14.4',
      '11-15','11-15.1','11-17.1','11-18','11-18.1','11-20','11-20.1','11-20.3',
      '11-21','11-23','11-25','11-26',
      // Art 12 (bodily harm)
      '12-1','12-2','12-3','12-3.05','12-3.1','12-3.2','12-3.3','12-3.4','12-3.5',
      '12-4','12-4.1','12-4.2','12-4.3','12-4.4','12-4.5','12-4.6','12-4.7',
      '12-5','12-6','12-6.1','12-6.2','12-6.4','12-7','12-7.1','12-7.3','12-7.4','12-7.5',
      '12-11','12-11.1','12-12','12-13','12-14','12-14.1','12-15','12-16','12-16.2',
      '12-19','12-20','12-21','12-21.6',
      // Art 12.1 (stalking)
      '12.1-1',
      // Art 12.2 (criminal transmission of HIV)
      '12.2-1',
      // Art 12.3 (human trafficking)
      '12.3-1',
      // Art 12.4 (domestic violence)
      '12.4-1',
      // Art 12.5 (financial exploitation)
      '12.5-1',
      // Art 14 (eavesdropping)
      '14-1','14-2','14-3','14-4','14-6',
      // Art 15 (property theft definitions)
      '15-1','15-2','15-3','15-4',
      // Art 16 (theft and related)
      '16-0.1','16-1','16-1.3','16-2','16-3','16-7','16-16','16-16.1','16-17',
      '16-25','16-30',
      // Art 16A (retail theft)
      '16A-1','16A-2','16A-3','16A-4','16A-5','16A-6','16A-7',
      // Art 16B (library theft)
      '16B-1','16B-2',
      // Art 16D (computer crime)
      '16D-2','16D-3','16D-4','16D-5','16D-6',
      // Art 17 (deception)
      '17-1','17-1.5','17-2','17-3','17-6','17-10','17-24','17-56',
      // Art 17.02 (financial crime)
      '17.02-5',
      // Art 18 (robbery)
      '18-1','18-2','18-3','18-4','18-5','18-6',
      // Art 19 (burglary)
      '19-1','19-2','19-3','19-4','19-5','19-6',
      // Art 19.5 (home invasion related)
      '19.5-1',
      // Art 20 (arson)
      '20-1','20-1.1','20-1.2','20-1.3','20-2',
      // Art 20.5 (aggravated arson)
      '20.5-5',
      // Art 21 (trespass)
      '21-1','21-1.01','21-2','21-3','21-3.5','21-4','21-5','21-6',
      // Art 21.1 (knowing damage to property)
      '21.1-1',
      // Art 21.2 (institutional vandalism)
      '21.2-1',
      // Art 22 (weapons)
      '22-1',
      // Art 24 (weapons: unlawful use)
      '24-1','24-1.1','24-1.2','24-1.5','24-1.6','24-1.7','24-1.8',
      '24-2','24-3','24-3.1','24-3.2','24-3.3','24-3.4','24-3.7',
      '24-5','24-6',
      // Art 24.1 (illegal firearms/silencers)
      '24.1-1',
      // Art 24.2 (FOID violations)
      '24.2-1',
      // Art 24.3 (machine gun/explosive violations)
      '24.3-1',
      // Art 25 (mob action)
      '25-1',
      // Art 26 (disorderly conduct)
      '26-1','26-5','26-6',
      // Art 26.5 (impersonation)
      '26.5-1','26.5-2',
      // Art 28 (gambling)
      '28-1','28-3',
      // Art 29 (obstruction)
      '29-1','29-3','29-4',
      // Art 29B (money laundering)
      '29B-1',
      // Art 29C (terrorist financing)
      '29C-5','29C-10','29C-15',
      // Art 29D (terrorism)
      '29D-10','29D-14.9','29D-15','29D-15.1','29D-15.2','29D-20','29D-20.5','29D-25','29D-29.9',
      // Art 30 (bribery)
      '30-1','30-2','30-3',
      // Art 31 (interference with police)
      '31-1','31-1a','31-3','31-4','31-6','31-7',
      // Art 32 (perjury/courts)
      '32-1','32-2','32-3','32-4','32-8','32-10','32-14',
      // Art 33 (official misconduct)
      '33-1','33-2','33-3','33-4',
      // Art 33A (intimidation)
      '33A-1','33A-2','33A-3',
      // Art 33D (hate crimes)
      '33D-1',
      // Art 33E (aiding escape/public corruption)
      '33E-1','33E-2','33E-3',
      // Art 33F (streetgang coordination)
      '33F-1','33F-2',
      // Art 34 (streetgang membership)
      '34-5','34-10','34-15','34-20','34-25','34-30',
      // Art 36 (controlled substance proceeds)
      '36-1','36-2',
      // Art 37 (forfeiture)
      '37-1',
      // Art 38 (penalties)
      '38-1',
      // Art 39 (civil liability)
      '39-1',
      // Art 48 (miscellaneous)
      '48-1',
      // Art 49 (violations)
      '49-1',
    ],
  },
  {
    actCode: '570',
    docPrefix: '072005700',
    actLabel: '720 ILCS 570 (Illinois Controlled Substances Act)',
    sections: [
      '100','200','204','206','208','210','212','300','302','304','306','310',
      '401','401.1','402','404','405','405.2','406','407','407.1','408',
      '500','505','506','507','508',
      '600','601','602',
      '700',
      '800',
      '900','901','902','903',
    ],
  },
  {
    actCode: '646',
    docPrefix: '072006460',
    actLabel: '720 ILCS 646 (Methamphetamine Control and Community Protection Act)',
    sections: [
      '5','10','15','20','25','30','35','40','45','50','55','60','65','70','75',
    ],
  },
];

// ── DocName builder ──────────────────────────────────────────────────────────
/**
 * Build the static .htm URL for a given act + section.
 * @param {string} docPrefix  e.g. '072000050'
 * @param {string} sectionId  e.g. '9-1' or '401'
 * @returns {string} full HTTPS URL
 */
export function buildStaticUrl(docPrefix, sectionId) {
  return `${IL_STATIC_BASE}/${docPrefix}K${sectionId}.htm`;
}

/**
 * Build canonical section DB id.
 * Format: IL-<actCode>-<sectionId>  e.g. 'IL-5-9-1', 'IL-570-401'
 * @param {string} actCode
 * @param {string} sectionId
 * @returns {string}
 */
export function buildSectionDbId(actCode, sectionId) {
  return `IL-${actCode}-${sectionId}`;
}

// ── HTML entity decoder ──────────────────────────────────────────────────────
export function decodeEntities(s) {
  return s
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#x27;/gi, "'")
    .replace(/&sect;|&#xa7;|&#167;/gi, '§')
    .replace(/&#8211;|&#x2013;/gi, '-')
    .replace(/&#8212;|&#x2014;/gi, '-')
    .replace(/&#8216;|&#8217;|&#x2018;|&#x2019;/gi, "'")
    .replace(/&#8220;|&#8221;|&#x201C;|&#x201D;/gi, '"')
    .replace(/&#(\d+);/g, (_, n) => {
      const code = Number(n);
      if (!Number.isInteger(code) || code < 0 || code > 0x10FFFF) return '';
      if (code < 0x20 && code !== 0x09 && code !== 0x0A && code !== 0x0D) return '';
      if (code === 0x7F) return '';
      if (code >= 0xD800 && code <= 0xDFFF) return '';
      return String.fromCodePoint(code);
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => {
      const code = Number.parseInt(n, 16);
      if (!Number.isInteger(code) || code < 0 || code > 0x10FFFF) return '';
      if (code < 0x20 && code !== 0x09 && code !== 0x0A && code !== 0x0D) return '';
      if (code === 0x7F) return '';
      if (code >= 0xD800 && code <= 0xDFFF) return '';
      return String.fromCodePoint(code);
    });
}

// ── Strip HTML ───────────────────────────────────────────────────────────────
export function stripHtml(html) {
  if (!html) return '';
  let s = html;
  s = s.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ');
  s = s.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ');
  s = s.replace(/<!--[\s\S]*?-->/g, ' ');
  s = s.replace(/<br\s*\/?\s*>/gi, '\n');
  s = s.replace(/<\/p>/gi, '\n\n');
  s = s.replace(/<\/div>/gi, '\n');
  s = s.replace(/<[^>]+>/g, ' ');
  s = decodeEntities(s);
  // Drop control chars except \t \n \r
  s = s.split('').filter((ch) => {
    const c = ch.charCodeAt(0);
    if (c === 9 || c === 10 || c === 13) return true;
    if (c < 32) return false;
    if (c === 127) return false;
    return true;
  }).join('');
  return s.split(/\s+/).filter(Boolean).join(' ').trim();
}

// ── Section parser ───────────────────────────────────────────────────────────

/**
 * Check if the HTML is a valid section page (not a 404 page or redirect).
 * @param {string} html
 * @returns {boolean}
 */
export function isSectionNotFound(html) {
  if (!html || html.length < 200) return true;
  // Valid pages always have Courier New font and ILCS citation marker
  if (!html.includes('Courier New')) return true;
  return false;
}

/**
 * Parse a www.ilga.gov static .htm section page.
 *
 * Expected structure (verified 2026-05-01):
 *   <html><body><table>
 *     <code><font size="2" face="Courier New">(720 ILCS 5/9-1)</font></code>
 *     <code><font size="2" face="Courier New">(from Ch. 38, par. 9-1)</font></code>
 *     <code><font size="2" face="Courier New">Sec. 9-1. </font></code>
 *     <code><font size="2" face="Courier New">First degree murder. </font></code>
 *     <code><font size="2" face="Courier New">(a) A person who kills...</font></code>
 *     ...
 *     <code><font size="2" face="Courier New">(Source: P.A. 103-51, eff. 1-1-24.)</font></code>
 *   </table></body></html>
 *
 * @param {string} html  Full page HTML
 * @param {{ sectionId: string, sectionUrl: string }} ctx
 * @returns {{ titleText: string, bodyText: string, effectiveDate: string|null }|null}
 */
export function parseSection(html, ctx) {
  if (isSectionNotFound(html)) return null;

  // Extract all Courier New font block content in document order.
  // Each <code><font face="Courier New">TEXT</font></code> is one logical chunk.
  const chunks = [];
  const fontRx = /<font[^>]*face="Courier New"[^>]*>([\s\S]*?)<\/font>/gi;
  let m;
  while ((m = fontRx.exec(html)) !== null) {
    const text = stripHtml(m[1]).trim();
    if (text) chunks.push(text);
  }

  if (chunks.length === 0) return null;

  // First chunk is typically "(720 ILCS 5/9-1)" citation marker — skip it.
  // Second chunk may be "(from Ch. 38, par. 9-1)" — skip it.
  // "Sec. N. " + title may be split across 1-2 chunks.
  // Body follows. Last chunk is "(Source: P.A. ...)".
  let startIdx = 0;

  // Skip citation marker chunks like "(720 ILCS ..." and "(from Ch. ..."
  while (startIdx < chunks.length && /^\((?:720 ILCS|from Ch\.)/i.test(chunks[startIdx])) {
    startIdx++;
  }

  if (startIdx >= chunks.length) return null;

  // The next chunk should be the "Sec. N." prefix or combined "Sec. N. Title."
  const firstContent = chunks[startIdx];

  // Extract title: the text after "Sec. N." within the first content chunk(s).
  // Title is usually the NEXT chunk after "Sec. N. " (separated), or in the same chunk.
  let titleText = '';
  const secPrefixRx = /^Sec\.\s*[\w.-]+\.\s*/;
  if (secPrefixRx.test(firstContent)) {
    // Title is in the same chunk after "Sec. N. "
    titleText = firstContent.replace(secPrefixRx, '').replace(/\.$/, '').trim();
    // If this chunk is just "Sec. N. Title." the title is here; if it also has body, we need to separate.
    // For IL pages, "Sec. N. " and "Title." are often in separate chunks.
    // Check if next chunk looks like a title (short, no "(")
    if (!titleText && startIdx + 1 < chunks.length) {
      const nextChunk = chunks[startIdx + 1];
      if (nextChunk.length < 120 && !nextChunk.startsWith('(') && !/^Sec\./i.test(nextChunk)) {
        titleText = nextChunk.replace(/\.$/, '').trim();
        startIdx++; // consumed title chunk
      }
    }
  } else if (startIdx + 1 < chunks.length && /^Sec\.\s*[\w.-]+\.\s*$/.test(firstContent)) {
    // "Sec. N. " is alone in chunk, title is the next chunk
    startIdx++;
    titleText = chunks[startIdx].replace(/\.$/, '').trim();
  } else {
    // Fallback: treat first content as potential title prefix
    titleText = firstContent.replace(/^Sec\.\s*[\w.-]+\.\s*/, '').replace(/\.$/, '').trim();
  }

  // Body: all remaining chunks after the Sec+title header, excluding last (Source) chunk.
  const bodyChunks = chunks.slice(startIdx + 1);

  // Drop the last "(Source: ...)" chunk if present
  if (bodyChunks.length > 0 && /^\(Source:/i.test(bodyChunks[bodyChunks.length - 1])) {
    bodyChunks.pop();
  }

  const bodyText = bodyChunks.join(' ').trim();

  // If body is very short, fall back to full content as body
  const finalBody = bodyText.length >= 20 ? bodyText
    : chunks.slice(startIdx).join(' ').trim();

  if (finalBody.length < 12) return null;

  // Title fallback: use sectionId
  const usedTitle = titleText || `Section ${ctx?.sectionId || ''}`.trim();

  // Effective date: try to extract from Source chunk
  let effectiveDate = null;
  const srcChunk = chunks.find(c => /^\(Source:/i.test(c));
  if (srcChunk) {
    const effMatch = srcChunk.match(/eff\.\s+(\d{1,2}-\d{1,2}-\d{2,4})/i);
    if (effMatch) {
      // Normalize M-D-YY → YYYY-MM-DD
      const parts = effMatch[1].split('-');
      if (parts.length === 3) {
        let [mo, dy, yr] = parts;
        if (yr.length === 2) yr = `20${yr}`;
        effectiveDate = `${yr}-${mo.padStart(2, '0')}-${dy.padStart(2, '0')}`;
      }
    }
  }

  return { titleText: usedTitle, bodyText: finalBody, effectiveDate };
}
