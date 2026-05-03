// HTML parsing helpers for www.cga.ct.gov Title 53a (Penal Code) chapter pages.
//
// Source surface: https://www.cga.ct.gov/current/pub/chap_<N>.htm
// One HTML page per chapter. Multiple sections per page, anchored by:
//   <span class="catchln" id="sec_53a-<N>">Sec. 53a-<N>. Title.</span> body...
//   <p class="source-first">(Source: ...)</p>
//   <p class="annotation*">Cited. ...</p>     ← skip these (case law refs)
//   <table class="nav_tbl">...</table>        ← terminator between sections
//
// TLS GOTCHA: cga.ct.gov returns a cert chain Node's bundled CA store rejects.
// Workaround: https.request({ rejectUnauthorized: false }) — CT site only,
// pg/Supabase connections stay strict. See gotcha-cga-ct-gov-tls-chain.md.
// Node 22's native fetch (undici) ignores the agent option, so we use
// https.request directly.
//
// Robots: 404 (no policy at /robots.txt). We use 2.0s polite delay.
//
// Pure in-memory string processing — no file I/O.

import https from 'node:https';
import { URL } from 'node:url';

export const CT_BASE_URL = 'https://www.cga.ct.gov';
export const CT_CHAPTER_BASE = `${CT_BASE_URL}/current/pub`;
export const CT_TITLE = '53a';
export const CT_TITLE_LABEL = 'Penal Code';

// Title 53a chapter list — verified 2026-05-02 against title_53a.htm:
//   Chapter 950 — Penal Code: General Provisions (3 sections)
//   Chapter 951 — Penal Code: Statutory Construction; Principles of Criminal Liability (22 sections)
//   Chapter 952 — Penal Code: Offenses (398 sections)
// Total: 423 sections. Floor: >= 400.
export const CT_CHAPTERS = [
  { num: '950', label: 'Penal Code: General Provisions' },
  { num: '951', label: 'Penal Code: Statutory Construction; Principles of Criminal Liability' },
  { num: '952', label: 'Penal Code: Offenses' },
];

// ── URL builders ─────────────────────────────────────────────────────────────
export function buildChapterUrl(chapterNum) {
  return `${CT_CHAPTER_BASE}/chap_${chapterNum}.htm`;
}

/**
 * Per-section URL = chapter URL + #sec_53a-N anchor.
 */
export function buildSectionUrl(chapterNum, sectionId) {
  return `${CT_CHAPTER_BASE}/chap_${chapterNum}.htm#sec_${sectionId}`;
}

/**
 * Canonical DB section column value: "53a-N" (the bare CT section ID).
 */
export function buildSectionDbId(sectionId) {
  return sectionId;
}

// ── HTTPS fetch (TLS workaround) ─────────────────────────────────────────────
/**
 * Fetch one cga.ct.gov URL via https.request with rejectUnauthorized:false.
 * CT site only — pg/Supabase connections stay strict.
 *
 * Returns { status, body } — does NOT throw on non-2xx; caller decides.
 */
export function ctHttpsFetch(urlStr, { headers = {}, timeoutMs = 45000 } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const req = https.request(
      {
        method: 'GET',
        hostname: u.hostname,
        port: u.port || 443,
        path: u.pathname + u.search,
        rejectUnauthorized: false, // gotcha-cga-ct-gov-tls-chain.md
        headers: {
          'User-Agent': 'ImNotAnAttorney-statute-seed/1.0 (legal research)',
          'Accept': 'text/html,application/xhtml+xml',
          ...headers,
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () =>
          resolve({ status: res.statusCode || 0, body: Buffer.concat(chunks).toString('utf8') }),
        );
        res.on('error', reject);
      },
    );
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`timeout after ${timeoutMs}ms: ${urlStr}`));
    });
    req.end();
  });
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
    .replace(/&sect;|&#xa7;|&#167;/gi, '§')
    .replace(/&#8211;|&#x2013;/gi, '-')
    .replace(/&#8212;|&#x2014;/gi, '-')
    .replace(/&#8216;|&#8217;|&#x2018;|&#x2019;/gi, "'")
    .replace(/&#8220;|&#8221;|&#x201C;|&#x201D;/gi, '"')
    .replace(/&#(\d+);/g, (_, n) => {
      const code = Number(n);
      if (!Number.isInteger(code) || code < 0 || code > 0x10ffff) return '';
      if (code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d) return '';
      if (code === 0x7f) return '';
      if (code >= 0xd800 && code <= 0xdfff) return '';
      return String.fromCodePoint(code);
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => {
      const code = Number.parseInt(n, 16);
      if (!Number.isInteger(code) || code < 0 || code > 0x10ffff) return '';
      if (code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d) return '';
      if (code === 0x7f) return '';
      if (code >= 0xd800 && code <= 0xdfff) return '';
      return String.fromCodePoint(code);
    });
}

// ── Strip HTML to plain text ─────────────────────────────────────────────────
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
  s = Array.from(s).filter((ch) => {
    const c = ch.charCodeAt(0);
    if (c === 9 || c === 10 || c === 13) return true;
    if (c < 32) return false;
    if (c === 127) return false;
    return true;
  }).join('');
  return s.split(/\s+/).filter(Boolean).join(' ').trim();
}

// ── Section-anchor splitter ──────────────────────────────────────────────────

/**
 * Detect repealed-section markers. CT marks repealed sections with a
 * "Section repealed" / "Sections X-Y repealed" body that's basically empty.
 */
export function isRepealedSection(bodyText) {
  if (!bodyText) return false;
  const t = bodyText.toLowerCase();
  if (/^\s*\(?section\s+repealed/.test(t)) return true;
  if (/^\s*\(?repealed\b/.test(t)) return true;
  if (/^\s*sections?\s+[\w.,\s-]+\s+repealed/i.test(bodyText)) return true;
  return false;
}

/**
 * Parse a chapter HTML page; return one parsed object per section.
 *
 * Section anchor pattern (verified 2026-05-02):
 *   <p><span class="catchln" id="sec_53a-N">Sec. 53a-N. Title.</span> body...</p>
 *   <p class="source-first">(YYYY, P.A. ...)</p>
 *   <p class="annotation-first">Cited. ...</p>
 *   <p class="annotation">Cited. ...</p>
 *   <table class="nav_tbl">...</table>
 *
 * Section ends at the next <span class="catchln" id="sec_..."> OR EOF.
 *
 * @param {string} html  Chapter HTML
 * @param {string} chapterNum  e.g. "950"
 * @returns {Array<{sectionId:string, titleText:string, bodyText:string, sourceLine:string|null, sectionUrl:string, repealed:boolean}>}
 */
export function parseChapterSections(html, chapterNum) {
  if (!html || html.length < 200) return [];

  const anchorRx = /<span\s+class=["']catchln["']\s+id=["']sec_(53a-[\w.-]+?)["'][^>]*>([\s\S]*?)<\/span>/gi;
  const anchors = [];
  let m;
  while ((m = anchorRx.exec(html)) !== null) {
    anchors.push({
      sectionId: m[1],
      headerHtml: m[2],
      startIdx: m.index,
      headerEndIdx: m.index + m[0].length,
    });
  }
  if (anchors.length === 0) return [];

  const out = [];
  for (let i = 0; i < anchors.length; i++) {
    const a = anchors[i];
    const next = anchors[i + 1];
    const sliceEnd = next ? next.startIdx : html.length;
    const bodyHtml = html.slice(a.headerEndIdx, sliceEnd);

    const headerText = stripHtml(a.headerHtml);
    let titleText = headerText
      .replace(/^Sec\.\s*53a-[\w.-]+\.\s*/i, '')
      .replace(/\.$/, '')
      .trim();
    if (!titleText) titleText = `Section ${a.sectionId}`;

    // Strategy: walk <p>...</p> blocks. Capture body paragraphs; sourceLine
    // from class=source*; drop class=annotation*; drop nav table.
    const paraRx = /<p(\s+class=["']([^"']*)["'])?[^>]*>([\s\S]*?)<\/p>/gi;
    let p;
    const bodyParas = [];
    let sourceLine = null;
    while ((p = paraRx.exec(bodyHtml)) !== null) {
      const cls = (p[2] || '').toLowerCase();
      const inner = p[3];
      const txt = stripHtml(inner);
      if (!txt) continue;
      if (cls.startsWith('source')) {
        if (!sourceLine) sourceLine = txt;
        continue;
      }
      if (cls.startsWith('annotation')) continue;
      if (/^\(?Return to/i.test(txt)) continue;
      bodyParas.push(txt);
    }

    // The first body <p> for an anchored section actually opens BEFORE the
    // <span class="catchln" ...>. So bodyHtml starts mid-<p>, and the first
    // </p> closes that wrapper. The text after the </span> up to that </p>
    // is the body intro. Extract it explicitly:
    //   bodyHtml looks like: " ...intro... </p> <p>...next para...</p> ..."
    const introMatch = bodyHtml.match(/^([\s\S]*?)<\/p>/i);
    if (introMatch) {
      const introTxt = stripHtml(introMatch[1]);
      if (introTxt && !introTxt.toLowerCase().startsWith('return to')) {
        bodyParas.unshift(introTxt);
      }
    }

    let bodyText = bodyParas.join('\n\n').trim();
    // Dedupe consecutive identical paragraphs (intro vs paraRx overlap)
    bodyText = bodyText.split('\n\n').filter((seg, idx, arr) => idx === 0 || seg !== arr[idx - 1]).join('\n\n');

    if (bodyText.length < 12) {
      let raw = bodyHtml;
      raw = raw.replace(/<table[^>]*class=["']nav_tbl["'][\s\S]*?<\/table>/gi, ' ');
      raw = raw.replace(/<p\s+class=["']source[^"']*["'][^>]*>[\s\S]*?<\/p>/gi, ' ');
      raw = raw.replace(/<p\s+class=["']annotation[^"']*["'][^>]*>[\s\S]*?<\/p>/gi, ' ');
      bodyText = stripHtml(raw).trim();
    }

    const repealed = isRepealedSection(bodyText);

    out.push({
      sectionId: a.sectionId,
      titleText,
      bodyText,
      sourceLine,
      sectionUrl: buildSectionUrl(chapterNum, a.sectionId),
      repealed,
    });
  }
  return out;
}

/**
 * Extract effective date from a CT source line, if explicitly present.
 * CT source lines are typically session refs like "(1969, P.A. 828, S. 1.)"
 * which give session year, not effective date — so most rows return null.
 */
export function parseEffectiveDate(sourceLine) {
  if (!sourceLine) return null;
  const m = sourceLine.match(/eff(?:ective)?\.?\s+(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})/i);
  if (m) {
    let [, mo, dy, yr] = m;
    if (yr.length === 2) {
      const n = Number(yr);
      yr = (n > 50 ? '19' : '20') + yr;
    }
    return `${yr}-${mo.padStart(2, '0')}-${dy.padStart(2, '0')}`;
  }
  return null;
}
