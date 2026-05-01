// Template: scripts/ingest/lib/ga-html.mjs
// Pattern: cl-bulk-data-defensive #18 — ID Title 18 is single-file XML, parse in-memory
// Source: https://law.resource.org/pub/us/code/id/idaho.xml.2014/TITLE%2018.xml
//
// Idaho Title 18 (Crimes and Punishments) parser. The XML follows the
// Law.Resource.Org universal `<Content Type="Statutes">` shape — the harness
// `parseLrOXml` handles parsing; this lib provides:
//   - parseTitleSections (re-export of harness parser, kept here for symmetry
//     with ga-html.mjs so future per-state divergence has a stable seam)
//   - buildIdLegSourceUrl: per-section URL on legislature.idaho.gov

import { parseLrOXml, stripHtml } from '../../lib/lawresource-xml-harness.mjs';

export { stripHtml };

/**
 * Parse Idaho Title 18 XML using the shared LR.O parser.
 * @param {string} xml
 * @returns {import('../../lib/lawresource-xml-harness.mjs').LrOSection[]}
 */
export function parseTitleSections(xml) {
  return parseLrOXml(xml);
}

/**
 * Build the authoritative source URL for an Idaho code section.
 *
 * Pattern: https://legislature.idaho.gov/statutesrules/idstat/Title{T}/T{T}CH{C}/SECT{T}-{N}/
 *
 * Chapter is BARE integer (no zero-padding) — verified 2026-05-01 against
 * legislature.idaho.gov (T18CH1, T18CH15, T18CH86 all resolve; T18CH01 404s).
 *
 * Chapter derivation from section number:
 *   "100"  → ch="1"   (3-digit short-section style: 1 + 00)
 *   "101A" → ch="1"   (3-digit + suffix letter)
 *   "1501" → ch="15"  (4-digit: 15 + 01)
 *   "8001" → ch="80"  (4-digit: 80 + 01)
 *
 * @param {string} sectionNum  e.g. "18-100", "18-101A", "18-1501", "18-8001"
 * @returns {string}
 */
export function buildIdLegSourceUrl(sectionNum) {
  const m = /^(\d+)-(\d+)([A-Z]?)$/.exec(sectionNum);
  if (!m) {
    return 'https://legislature.idaho.gov/statutesrules/idstat/Title18/';
  }
  const titleNum = m[1];
  const rest = m[2];

  let chapter;
  if (rest.length <= 2) {
    chapter = String(parseInt(rest, 10));
  } else if (rest.length === 3) {
    chapter = rest[0];           // "100" → "1"
  } else {
    chapter = rest.slice(0, rest.length - 2); // "1501" → "15", "8001" → "80"
  }
  return `https://legislature.idaho.gov/statutesrules/idstat/Title${titleNum}/T${titleNum}CH${chapter}/SECT${sectionNum}/`;
}
