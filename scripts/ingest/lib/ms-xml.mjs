// Template: scripts/ingest/lib/id-xml.mjs
// Pattern: cl-bulk-data-defensive #18 — MS Title 97 is single-file XML, parse in-memory
// Source: https://law.resource.org/pub/us/code/ms/ms.xml.2013/title-97.xml
//
// Mississippi Title 97 (Crimes) parser. The XML follows the Law.Resource.Org
// universal `<Content Type="Statutes">` shape. The shared harness `parseLrOXml`
// handles structure traversal; this lib provides:
//   - parseTitleSections: wraps harness parser + strips MS-specific Caption prefix
//   - buildMsLroSourceUrl: per-section URL anchoring to the LR.O archive file
//
// Source URL decision:
//   1. Tried MS state legislature (legislature.ms.gov) — TLS cert error (self-signed)
//   2. Tried Justia (law.justia.com/codes/mississippi/) — HTTP 403 from this agent
//   3. FindLaw — HTTP 403
//   DECISION: Use the LR.O archive URL with section-anchor fragment, which is the
//   canonical public-domain source for this 2013 XML. The URL is stable, HTTPS,
//   and directly resolves to the source file we ingested from.
//   Pattern: https://law.resource.org/pub/us/code/ms/ms.xml.2013/title-97.xml#97-X-Y
//
// Caption format in the MS LR.O XML:
//   Level-2 (chapter): "Chapter 1", "Chapter 3" ...
//   Level-3 (section): "&sect; 97-1-1" (decoded: "§ 97-1-1")
//   After XML+HTML entity decode, Caption = "§ 97-X-Y". We strip "§ " prefix
//   so sectionNum = "97-1-1" — consistent with jurisdiction='MS', title='97'
//   storage convention.

import { parseLrOXml, stripHtml } from '../../lib/lawresource-xml-harness.mjs';

export { stripHtml };

/**
 * Parse MS Title 97 XML using the shared LR.O parser, then normalise section
 * numbers by stripping the leading "§ " (section symbol + space) from Captions.
 *
 * The raw Caption after XML+HTML decoding is "§ 97-1-1". The base harness
 * already calls stripHtml on the Caption, which decodes &sect; → §. We strip
 * the "§ " prefix here so sectionNum is bare "97-1-1".
 *
 * @param {string} xml
 * @returns {import('../../lib/lawresource-xml-harness.mjs').LrOSection[]}
 */
export function parseTitleSections(xml) {
  const raw = parseLrOXml(xml);
  return raw.map(sec => ({
    ...sec,
    // Strip leading "§ " (or bare "§" without space, just in case)
    sectionNum: sec.sectionNum.replace(/^§\s*/u, '').trim(),
  }));
}

/**
 * Build the authoritative source URL for a Mississippi Title 97 section.
 *
 * Uses the LR.O archive URL with a section-anchor fragment because:
 *   - MS legislature website has TLS issues (self-signed cert)
 *   - Justia and FindLaw return 403 from automated agents
 *   - LR.O is the public-domain canonical source for this 2013 XML
 *
 * Pattern: https://law.resource.org/pub/us/code/ms/ms.xml.2013/title-97.xml#SECTION_NUM
 * e.g. "97-1-1" → "https://law.resource.org/pub/us/code/ms/ms.xml.2013/title-97.xml#97-1-1"
 *
 * @param {string} sectionNum  e.g. "97-1-1", "97-3-19", "97-43-5"
 * @returns {string}
 */
export function buildMsLroSourceUrl(sectionNum) {
  return `https://law.resource.org/pub/us/code/ms/ms.xml.2013/title-97.xml#${encodeURIComponent(sectionNum)}`;
}
