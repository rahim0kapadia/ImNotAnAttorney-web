// Pattern: cl-bulk-data-defensive #18 + no-hallucinated-legal-data
// Parser for DC Council law-xml repository — Title 22 (Criminal Offenses).
//
// Source shape (verified 2026-05-02 via raw.githubusercontent fetch):
//
//   dc/council/code/titles/22/index.xml      — <container>/<container>/<xi:include href="./sections/22-XXX.xml"/>
//   dc/council/code/titles/22/sections/*.xml — 582 per-section XML files
//
// Each section file is a custom DC schema (not Akoma Ntoso despite repo
// description) with shape:
//
//   <section xmlns="https://code.dccouncil.us/schemas/dc-library">
//     <num>22-1001</num>
//     <heading>Definitions and penalties.</heading>
//     <para>
//       <num>(a)</num>
//       <para>
//         <num>(1)</num>
//         <text>...statute body...</text>
//       </para>
//       ...
//     </para>
//     <annotations>...history/cross-refs (excluded from bodyText)...</annotations>
//   </section>
//
// Strategy: parse index.xml to enumerate xi:include hrefs (582 sections),
// then per section fetch the raw GitHub URL and walk <num>/<text> nodes
// to assemble bodyText. Annotations block excluded.

import { parse as parseHtml } from 'node-html-parser';

const RAW_BASE = 'https://raw.githubusercontent.com/DCCouncil/law-xml/master/dc/council/code/titles/22';

/**
 * Extract section hrefs from Title 22 index.xml.
 * @param {string} indexXml
 * @returns {string[]}  e.g. ["22-101", "22-301", "22-1001", ...]
 */
export function extractDcSectionRefs(indexXml) {
  if (!indexXml) return [];
  // String-search on <xi:include href="./sections/22-XXX.xml"/> — no regex
  // on file content per project rules; simple split-and-scan instead.
  const parts = indexXml.split('<xi:include');
  const out = [];
  const seen = new Set();
  for (let i = 1; i < parts.length; i++) {
    const seg = parts[i];
    const hrefIdx = seg.indexOf('href=');
    if (hrefIdx < 0) continue;
    const quote = seg.charAt(hrefIdx + 5);
    if (quote !== '"' && quote !== "'") continue;
    const start = hrefIdx + 6;
    const end = seg.indexOf(quote, start);
    if (end < 0) continue;
    const href = seg.slice(start, end);
    // Expect "./sections/22-NNN.xml"
    const slash = href.lastIndexOf('/');
    const dot = href.lastIndexOf('.xml');
    if (slash < 0 || dot < 0 || dot <= slash) continue;
    const secId = href.slice(slash + 1, dot);
    if (!secId.startsWith('22-')) continue;
    if (seen.has(secId)) continue;
    seen.add(secId);
    out.push(secId);
  }
  return out;
}

/**
 * Walk the section XML and assemble the bodyText.
 * Strategy: use node-html-parser (lenient) to walk `<section>` element;
 * concatenate all `<num>` + `<text>` content in document order; skip
 * `<annotations>` subtree entirely.
 *
 * @param {string} sectionXml
 * @param {string} sectionId  e.g. "22-1001"
 * @returns {{ titleText: string, bodyText: string } | null}
 */
export function parseDcSection(sectionXml, sectionId) {
  if (!sectionXml || sectionXml.length < 100) return null;
  // Strip annotations block before parsing — saves tree size + avoids
  // accidentally including history text in bodyText.
  let stripped = sectionXml;
  const annStart = stripped.indexOf('<annotations');
  if (annStart >= 0) {
    const annEnd = stripped.indexOf('</annotations>', annStart);
    if (annEnd >= 0) {
      stripped = stripped.slice(0, annStart) + stripped.slice(annEnd + '</annotations>'.length);
    }
  }

  const root = parseHtml(stripped, { lowerCaseTagName: false, comment: false });
  const sec = root.querySelector('section');
  if (!sec) return null;

  // Heading: <heading>...</heading>
  const headingNode = sec.querySelector('heading');
  const titleText = (headingNode ? headingNode.text : '').trim()
    || `Section ${sectionId}`;

  // Body: walk all descendants in order, concatenate <num> + <text> text.
  // node-html-parser doesn't expose a tree-order iterator natively, but
  // we can scan childNodes recursively while skipping 'heading' and
  // 'annotations' tags.
  const parts = [];
  /** @param {any} n */
  function walk(n) {
    if (!n) return;
    const tag = (n.tagName || '').toLowerCase();
    if (tag === 'heading' || tag === 'annotations') return;
    if (tag === 'num' || tag === 'text') {
      const t = n.text;
      if (t && t.trim().length > 0) parts.push(t.trim());
      return;
    }
    if (n.childNodes && n.childNodes.length) {
      for (const c of n.childNodes) walk(c);
    }
  }
  for (const c of sec.childNodes) walk(c);

  const bodyText = parts.join(' ').replace(/\s+/g, ' ').trim();
  if (bodyText.length < 10) return null;
  return { titleText, bodyText };
}

/**
 * Authoritative DC Council code URL for a Title 22 section.
 * Format: https://code.dccouncil.gov/us/dc/council/code/sections/<sectionId>.html
 *
 * @param {string} sectionNum e.g. "22-1001"
 * @returns {string}
 */
export function buildDcSourceUrl(sectionNum) {
  const safe = String(sectionNum).trim().replace(/[^\w.\-]/g, '');
  return `https://code.dccouncil.gov/us/dc/council/code/sections/${safe}.html`;
}

/**
 * Raw-content GitHub URL for a Title 22 section (used by fetcher).
 * @param {string} sectionId e.g. "22-1001"
 * @returns {string}
 */
export function buildDcRawUrl(sectionId) {
  const safe = String(sectionId).trim().replace(/[^\w.\-]/g, '');
  return `${RAW_BASE}/sections/${safe}.xml`;
}

export const DC_INDEX_URL = `${RAW_BASE}/index.xml`;
