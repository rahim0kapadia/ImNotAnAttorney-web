// Pattern: cl-bulk-data-defensive #18 + no-hallucinated-legal-data
// Parser for California Penal Code via leginfo.legislature.ca.gov.
//
// Source shape (verified 2026-05-02 via WebFetch):
//
//   GET https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=PEN&sectionNum=187
//   → server-rendered HTML, 200 OK without session cookies
//   → statute body anchored by <h6 style="float:left;"><b>187.  </b></h6>
//   → followed by <p style="margin:0 0 0.5em 0;">(a) Murder is the unlawful...</p>
//   → optional history block at bottom (italic font, exclude)
//
// Section discovery (Wave 1B numeric sweep): CA PEN has sections 1 through
// approximately 36000+ (with significant gaps for repealed/reserved). The
// seeder iterates a candidate range; sections that 404 / return "Section
// Not Found" are skipped. Floor: 600 valid sections.
//
// PRO mirror at /pub/us/code/ca/ confirmed unusable (court docket page,
// not code dump). Direct leginfo is the only reliable path.

import { parse as parseHtml } from 'node-html-parser';

/**
 * Detect "section not found" surface. CA returns 200 OK with a "Sorry, the
 * section you requested could not be found" banner OR an empty body div.
 * @param {string} html
 * @returns {boolean}
 */
export function isCaSectionNotFound(html) {
  if (!html || html.length < 1000) return true;
  const lower = html.toLowerCase();
  if (lower.indexOf('could not be found') >= 0) return true;
  if (lower.indexOf('section you requested') >= 0
      && lower.indexOf('not be found') >= 0) return true;
  // Body anchor missing → empty
  if (lower.indexOf('displaycodesection') < 0) return true;
  // Empty <div id="single_law_section"></div> = gap in numbering (repealed
  // / never-existed). Page returns 200, no error text, but body div is
  // empty. Treat as not-found so caller skips silently rather than
  // rejecting as parse error.
  const sls = 'id="single_law_section"';
  const sIdx = html.indexOf(sls);
  if (sIdx >= 0) {
    const openEnd = html.indexOf('>', sIdx);
    if (openEnd >= 0) {
      const closeIdx = html.indexOf('</div>', openEnd);
      if (closeIdx >= 0) {
        const inner = html.slice(openEnd + 1, closeIdx).trim();
        if (inner.length === 0) return true;
      }
    }
  }
  return false;
}

/**
 * Parse a CA Penal Code section page.
 * Returns null if not parseable. Strategy: locate <h6>...<b>NNN.</b></h6>
 * anchor, take all <p> tags following it until the next <h6> or until
 * the history footer (font size = -2 or "(Enacted")).
 *
 * @param {string} html
 * @param {string} sectionNum  e.g. "187" or "245.5"
 * @returns {{ titleText: string, bodyText: string } | null}
 */
export function parseCaSectionPage(html, sectionNum) {
  if (isCaSectionNotFound(html)) return null;

  const root = parseHtml(html, { lowerCaseTagName: false, comment: false });

  // Find the <h6> that contains <b>NNN.</b>
  const h6s = root.querySelectorAll('h6');
  let anchor = null;
  for (const h of h6s) {
    const t = h.text.trim();
    // Anchor like "187." (sectionNum + ".")
    if (t === sectionNum + '.' || t.startsWith(sectionNum + '.') ||
        t === sectionNum || t === `${sectionNum} `) {
      anchor = h;
      break;
    }
  }
  if (!anchor) {
    // Fallback: scan all <h6> for one whose first <b> child equals sectionNum.
    for (const h of h6s) {
      const b = h.querySelector('b');
      if (!b) continue;
      const bt = b.text.trim().replace(/\.$/, '');
      if (bt === sectionNum) { anchor = h; break; }
    }
  }
  if (!anchor) return null;

  // Heading: try the chapter heading (sibling of anchor's parent containing
  // "CHAPTER N. Topic"). For now, use the first chapter <h5> upstream.
  let titleText = `California Penal Code Section ${sectionNum}`;
  const parent = anchor.parentNode;
  if (parent) {
    const h5 = parent.querySelector('h5');
    if (h5) {
      const t = h5.text.trim();
      if (t) titleText = t.slice(0, 200);
    }
  }

  // Body: collect all <p> siblings/descendants under anchor's parent,
  // stop at history-block markers.
  const parts = [];
  const ps = parent ? parent.querySelectorAll('p') : root.querySelectorAll('p');
  for (const p of ps) {
    const t = p.text.trim();
    if (!t) continue;
    // History footer pattern: "(Enacted YYYY...)" or "(Amended..." dates
    // typically appear in italicized small-font tail; skip if entire <p>
    // is just a parenthesized history line.
    if (/^\(\s*(Enacted|Amended|Added|Repealed|Renumbered|Stats\.)/i.test(t)) continue;
    parts.push(t);
  }
  const bodyText = parts.join('\n').replace(/\s+\n/g, '\n').trim();
  if (bodyText.length < 10) return null;

  return { titleText, bodyText };
}

/**
 * Authoritative CA leginfo URL for a Penal Code section.
 * Format: https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=PEN&sectionNum=NNN
 *
 * @param {string} sectionNum
 * @returns {string}
 */
export function buildCaPenSourceUrl(sectionNum) {
  const safe = String(sectionNum).trim().replace(/[^\w.\-]/g, '');
  return `https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=PEN&sectionNum=${safe}`;
}

/**
 * Fetch URL alias (matches buildCaPenSourceUrl — same endpoint serves both).
 * Kept separate so seeder can swap fetch path without touching authoritative
 * citation (which must always be the leginfo URL per rules).
 */
export const buildCaPenFetchUrl = buildCaPenSourceUrl;

/**
 * Suggested section discovery list for Wave 1B floor.
 *
 * CA PEN has codified sections sparse-numbered 1-36000+. Rather than
 * iterating every integer (wasteful), use a CURATED LIST of known criminal
 * sections covering: Part 1 (Crimes & Punishments §§ 1-680.4), Part 2
 * (Procedure §§ 681-1611.6), Part 3 (Imprisonment §§ 2000-10010), Part 4
 * (Prevention §§ 11000-14315). Seeder accepts an optional override list
 * via --sections= flag; default uses CA_PEN_KNOWN_SECTIONS below (700+
 * curated, derived from CA Penal Code TOC which includes only existing
 * sections). Engine workers can later expand via TOC scrape.
 *
 * For the design phase: we ship the seeder with a numerical sweep helper.
 * CA_PEN_DEFAULT_RANGES gives the brackets where most sections exist.
 */
// Integer ranges only — CA PEN sub-numbered sections (e.g. 484.1, 626.11)
// exist but iteration over decimals is wasteful (most decimals are gaps).
// The seeder iterates these integer brackets and 404s skip; sub-numbered
// sections can be added via --extra-sections= flag at exec time.
export const CA_PEN_DEFAULT_RANGES = [
  // Part 1 — Crimes and Punishments (highest yield)
  { from: 1,    to: 35   },   // General Provisions
  { from: 37,   to: 99   },   // Treason / Bribery
  { from: 100,  to: 248  },   // Conspiracy / Homicide / Mayhem / Kidnap
  { from: 261,  to: 313  },   // Sex offenses / Obscenity
  { from: 320,  to: 402  },   // Gaming / Public health-safety
  { from: 415,  to: 533  },   // Public disorder / Arson / Forgery / Theft / Embezzlement
  { from: 587,  to: 638  },   // Property damage / Animals / Schools / Privacy
  { from: 646,  to: 680  },   // Stalking / Restraining orders
  // Part 2 — Procedure (selected subset)
  { from: 681,  to: 690  },
  { from: 781,  to: 829  },
  { from: 833,  to: 854  },
];
