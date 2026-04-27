// HTML parsing helpers for codes.ohio.gov, revisor.mn.gov, and leg.state.nv.us
// statute pages.
//
// Pure in-memory string processing — no file I/O in this module, so regex
// replaces are safe (not "regex on file contents"). Callers fetch HTML via
// network and pass it in as a string. Mirrors the pattern in fl-html.mjs.

export function decodeEntities(s) {
  return s
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#8194;/g, ' ')
    .replace(/&#8195;/g, ' ')
    .replace(/&#8211;/g, '-')
    .replace(/&#8212;/g, '-')
    .replace(/&#8217;/g, "'")
    .replace(/&#8220;/g, '"')
    .replace(/&#8221;/g, '"');
}

export function stripTags(html) {
  if (!html) return '';
  let s = html;
  s = s.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ');
  s = s.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ');
  s = s.replace(/<!--[\s\S]*?-->/g, ' ');
  s = s.replace(/<br\s*\/?\s*>/gi, '\n');
  s = s.replace(/<\/p>/gi, '\n');
  s = s.replace(/<[^>]+>/g, ' ');
  s = decodeEntities(s);
  return s.replace(/\s+/g, ' ').trim();
}

// ── OH parser — codes.ohio.gov ──────────────────────────────────────────────
const RX_OH_H1 = /<h1[^>]*>\s*Section\s+([\d.]+)\s*<span[^>]*>[^<]*<\/span>\s*([^<]*)<\/h1>/i;
const RX_OH_BODY = /<section[^>]*class="laws-body"[^>]*>([\s\S]*?)<\/section>/i;
const RX_OH_EFFECTIVE = /<div[^>]*class="label"[^>]*>\s*Effective:\s*<\/div>\s*<div[^>]*class="value"[^>]*>([^<]+)<\/div>/i;

export function parseOhioSection(html) {
  if (!html || html.length < 500) return null;
  const titleMatch = html.match(RX_OH_H1);
  if (!titleMatch) return null;
  const sectionNumber = titleMatch[1].trim();
  const titleText = titleMatch[2].replace(/\.\s*$/, '').trim();
  const bodyMatch = html.match(RX_OH_BODY);
  if (!bodyMatch) return null;
  const bodyText = stripTags(bodyMatch[1]);
  if (bodyText.length < 30) return null;
  const effMatch = html.match(RX_OH_EFFECTIVE);
  const effective = effMatch ? effMatch[1].trim() : null;
  return { sectionNumber, titleText, bodyText, effective };
}

// ── MN parser — revisor.mn.gov ──────────────────────────────────────────────
const RX_MN_H1 = /<h1[^>]*class="shn"[^>]*>\s*([\d.]+)\s+([^<]+)<\/h1>/i;
const RX_MN_SECTION_BLOCK = /id="stat\.([\d.]+)"\s*>([\s\S]*?)(?=<\/main|<footer|<aside|$)/i;
const RX_MN_PARAGRAPH = /<p[^>]*>([\s\S]*?)<\/p>/gi;

export function parseMinnesotaSection(html, expectedSection) {
  if (!html || html.length < 500) return null;
  const blockMatch = html.match(RX_MN_SECTION_BLOCK);
  if (!blockMatch) return null;
  const sectionNumber = blockMatch[1].trim();
  if (expectedSection && !sectionNumber.startsWith(expectedSection)) return null;
  const block = blockMatch[2];
  const titleMatch = block.match(RX_MN_H1);
  if (!titleMatch) return null;
  const titleText = titleMatch[2].replace(/\.\s*$/, '').trim();
  const paragraphs = [];
  // Reset regex state by constructing new one (RX_MN_PARAGRAPH has /g)
  const pRe = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  let m;
  while ((m = pRe.exec(block)) !== null) {
    const txt = stripTags(m[1]);
    if (txt && !/^subd(?:ivision|\.)\s+\d/i.test(txt)) paragraphs.push(txt);
  }
  const bodyText = paragraphs.join('\n\n');
  if (bodyText.length < 30) return null;
  return { sectionNumber, titleText, bodyText, effective: null };
}

// ── NV parser — leg.state.nv.us NRS chapter pages with section anchors ──────
export function parseNevadaSection(html, chapter, section) {
  if (!html || html.length < 500) return null;
  const padded = section.padStart(3, '0');
  const anchorTag = 'NRS' + chapter + 'Sec' + padded;
  let startIdx = html.indexOf('name="' + anchorTag + '"');
  if (startIdx < 0) startIdx = html.indexOf('name=' + anchorTag);
  if (startIdx < 0) return null;
  const pStart = html.lastIndexOf('<p ', startIdx);
  if (pStart < 0) return null;
  const remainder = html.slice(pStart);
  const nextAnchorRe = new RegExp('name=("?)NRS' + chapter + 'Sec', 'g');
  let endIdx = remainder.length;
  let m;
  let sawCurrent = false;
  while ((m = nextAnchorRe.exec(remainder)) !== null) {
    if (!sawCurrent) { sawCurrent = true; continue; }
    endIdx = m.index;
    break;
  }
  const block = remainder.slice(0, endIdx);
  const leadMatch = block.match(/<span[^>]*class="Leadline"[^>]*>([\s\S]*?)<\/span>/i);
  if (!leadMatch) return null;
  const titleText = stripTags(leadMatch[1]).replace(/\.\s*$/, '').trim();
  let bodyText = stripTags(block);
  const citation = 'NRS ' + chapter + '.' + padded;
  const citIdx = bodyText.indexOf(citation);
  if (citIdx >= 0) bodyText = bodyText.slice(citIdx + citation.length).trim();
  if (bodyText.toLowerCase().startsWith(titleText.toLowerCase())) {
    bodyText = bodyText.slice(titleText.length).replace(/^[\s.]+/, '');
  }
  if (bodyText.length < 30) return null;
  return { sectionNumber: chapter + '.' + padded, titleText, bodyText, effective: null };
}

// ── Penalty extractors (best-effort; NULL when not inline) ──────────────────
const RX_OFFENSE_CLASS = /(first[- ]degree (?:felony|misdemeanor)|second[- ]degree (?:felony|misdemeanor)|third[- ]degree (?:felony|misdemeanor)|fourth[- ]degree (?:felony|misdemeanor)|fifth[- ]degree (?:felony|misdemeanor)|class\s+[A-Z]\s+(?:felony|misdemeanor)|category\s+[A-E]\s+felony|gross misdemeanor|petty misdemeanor|minor misdemeanor)/i;

export function extractOffenseClass(text) {
  const m = text.match(RX_OFFENSE_CLASS);
  return m ? m[1].toLowerCase().replace(/\s+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : null;
}

const RX_FINE = /(?:fine|penalty)\s+(?:not\s+(?:to\s+)?(?:exceed|more\s+than)|of\s+not\s+more\s+than)\s+\$?([\d,]+)/i;
const RX_FINE_SIMPLE = /\$([\d,]+)\s+fine/i;

export function extractFineMax(text) {
  let m = text.match(RX_FINE);
  if (m) return '$' + m[1];
  m = text.match(RX_FINE_SIMPLE);
  if (m) return '$' + m[1];
  return null;
}

const RX_IMPRISONMENT = /imprisonment\s+(?:in\s+(?:the\s+)?(?:state\s+)?prison\s+)?(?:for\s+)?(?:a\s+(?:term|period)\s+of\s+)?(?:not\s+more\s+than\s+)?(\d+)\s+(year|month|day)s?/i;
const RX_NOT_LESS_THAN = /not\s+less\s+than\s+(\d+)\s+(year|month|day)s?/i;

export function extractPenaltyMin(text) {
  const m = text.match(RX_NOT_LESS_THAN);
  if (m) return m[1] + ' ' + m[2] + (Number(m[1]) === 1 ? '' : 's');
  return null;
}

export function extractPenaltyMax(text) {
  const m = text.match(RX_IMPRISONMENT);
  if (m) return 'up to ' + m[1] + ' ' + m[2] + (Number(m[1]) === 1 ? '' : 's');
  return null;
}

// ── State-leg URL builders ──────────────────────────────────────────────────
export function buildStateLegUrl(jurisdiction, statuteNumber) {
  let bare = statuteNumber.split('§').pop().trim();
  bare = bare.split('(')[0].trim();
  bare = bare.split('+')[0].trim();
  bare = bare.replace(/^NRS\s+/i, '').trim();
  if (jurisdiction === 'OH') {
    return 'https://codes.ohio.gov/ohio-revised-code/section-' + bare;
  }
  if (jurisdiction === 'MN') {
    return 'https://www.revisor.mn.gov/statutes/cite/' + bare;
  }
  if (jurisdiction === 'NV') {
    const parts = bare.split('.');
    if (parts.length !== 2) return null;
    return 'https://www.leg.state.nv.us/nrs/NRS-' + parts[0] + '.html';
  }
  return null;
}
