// Template: scripts/ingest/lib/id-xml.mjs
// Pattern: cl-bulk-data-defensive #18 — CO Title 18 is single-file bulk XML, parse in-memory
// Source: https://law.resource.org/pub/us/code/co/colorado.xml.2012/co.code.title.18.2012.xml
//
// SOURCE URL STRATEGY — LR.O archive as authoritative:
//   Colorado General Assembly (leg.colorado.gov) requires session-based navigation
//   and does not provide stable per-section deep links suitable for bulk ingest.
//   Law.Resource.Org publishes the 2012 Colorado Revised Statutes as a single bulk
//   XML file (Public.Resource.Org legal-codes archive, public domain). Each section
//   is identified by its Caption text ("18-1-101") which serves as the fragment anchor.
//
//   Authoritative URL format:
//     https://law.resource.org/pub/us/code/co/colorado.xml.2012/co.code.title.18.2012.xml#18-1-101
//
//   STALENESS DISCLOSURE: The LR.O XML is the 2012 edition. Colorado criminal statutes
//   have been amended since 2012. Sections reflect the law as of the 2012 publication.
//   Source URLs remain HTTPS-accessible and permanently archived at LR.O.
//
// CO XML structure (law.resource.org 2012 edition):
//   <Content Type="Statutes">
//     <Indexes>
//       <Index Level="1" HasChildren="1">   ← TITLE 18
//         <Index Level="2" HasChildren="1"> ← ARTICLE 1
//           <Index Level="3" HasChildren="1"> ← PART 1 (optional)
//             <Index Level="4" HasChildren="0"> ← leaf section
//               <Caption>18-1-101</Caption>
//               <Description>Citation of title 18</Description>
//               <Content>&lt;p&gt;...&lt;/p&gt;</Content>
//               <ShortName>Colo. Rev. Stat. § 18-1-101</ShortName>
//             </Index>
//           </Index>
//         </Index>
//       </Index>
//     </Indexes>
//   </Content>
//
//   Section caption format: bare number "18-1-101" (no "Section " prefix, unlike AR).
//   847 sections parsed from the 2012 bulk XML (verified 2026-05-01).
//
// robots.txt (law.resource.org): no Crawl-delay, no /pub/ disallow (verified via AR 2026-05-01).

import { parseLrOXml, stripHtml } from '../../lib/lawresource-xml-harness.mjs';

export { stripHtml };

const LRO_BASE = 'https://law.resource.org/pub/us/code/co/colorado.xml.2012/co.code.title.18.2012.xml';

/**
 * Parse Colorado Title 18 XML using the shared LR.O parser.
 * CO XML uses 4-level hierarchy (Title→Article→Part→Section); the harness
 * recursive walker handles arbitrary nesting depth.
 *
 * @param {string} xml
 * @returns {import('../../lib/lawresource-xml-harness.mjs').LrOSection[]}
 */
export function parseTitleSections(xml) {
  return parseLrOXml(xml);
}

/**
 * Build the LR.O archive URL for a Colorado Revised Statutes section.
 *
 * CO section captions are bare numbers ("18-1-101") with no "Section " prefix,
 * so the fragment anchor is the section number directly.
 *
 * Pattern: https://law.resource.org/pub/us/code/co/colorado.xml.2012/co.code.title.18.2012.xml#18-1-101
 *
 * @param {string} sectionNum  e.g. "18-1-101", "18-1-704.5", "18-3-402"
 * @returns {string}
 */
export function buildCoSourceUrl(sectionNum) {
  if (!sectionNum || !sectionNum.trim()) {
    return LRO_BASE;
  }
  return `${LRO_BASE}#${encodeURIComponent(sectionNum)}`;
}
