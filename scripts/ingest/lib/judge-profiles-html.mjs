<<<<<<< HEAD
// HTML parsing helpers for ND and WY judge directories.
=======
// HTML parsing helpers for state judge directories.
>>>>>>> 7a6cf198 (feat(judge-profiles): AK directory ingest — 45 to 141 (G8b))
//
// Pure in-memory string processing — no file I/O. Safe regex on string args
// (FL pattern; mirrors lib/justia-html.mjs).
// Extractors: extractNdJudges, extractAkJudges

const RX_JUDGE_LINK = /href="(\/[a-z]+(?:-[a-z]+)+)"[^>]*>([^<]+)<\/a>/gi;
const NON_JUDGE_TEXT = /Search|Court|Self-Help|About|Meetings|Recruitment|Privacy|Security|Locations|Lawyer|Tips|Help|Center|Information|Administration/i;

export function extractNdJudges(html) {
  if (!html || html.length < 500) return [];
  const out = [];
  const seen = new Set();
  let m;
  const re = new RegExp(RX_JUDGE_LINK.source, 'gi');
  while ((m = re.exec(html)) !== null) {
    const slug = m[1];
    const text = m[2].trim();
    if (NON_JUDGE_TEXT.test(text)) continue;
    const segs = slug.split('-').filter(Boolean);
    if (segs.length < 2) continue;
    if (!/^[A-Z][a-zA-Z'.\-]+(?:\s+[A-Z]\.?)?\s+[A-Z][a-zA-Z'.\-]+/.test(text)) continue;
    if (seen.has(slug)) continue;
    seen.add(slug);
    const parts = text.split(/\s+/);
    out.push({
      fullName: text,
      first: parts[0],
      last: parts[parts.length - 1],
      bioUrl: 'https://www.ndcourts.gov' + slug,
    });
  }
  return out;
}

<<<<<<< HEAD
// WY-specific patterns:
//   District/circuit court pages:  "Honorable FirstName [M.] LastName"
//   Supreme court page:            "Chief Justice FirstName LastName"
//                                  "Justice FirstName [M.] LastName"
// sourceUrl is the page URL where the name was found; used as bio_url.
const RX_WY_HONORABLE =
  /\bHonorable\s+([A-Z][a-zA-Z''\-]+(?:\s+[A-Z]\.?)?\s+[A-Z][a-zA-Z''\-]+)/g;
const RX_WY_JUSTICE =
  /\b(?:Chief Justice|Associate Justice|Justice)\s+([A-Z][a-zA-Z''\-]+(?:\s+[A-Z]\.?)?\s+[A-Z][a-zA-Z''\-]+)/g;
const WY_JUNK = /\bWyoming\b|\bHome\b|\bMenu\b/;
// Common non-name words that appear as "Honorable X Y" false positives
// (addresses, directions, places, common nouns capitalized in context)
const WY_NON_NAME_LAST = /^(?:Drive|Street|Avenue|Road|Lane|Center|Court|Place|Way|Suite|North|South|East|West|Building|Office|County|City|State)$/i;

function parseName(raw) {
  const full = raw.replace(/\s+/g, ' ').trim();
  const parts = full.split(/\s+/);
  // first token is first name; last token is last name; middle initial ignored for storage
  return { fullName: full, first: parts[0], last: parts[parts.length - 1] };
}

export function extractWyJudges(html, sourceUrl) {
  if (!html || html.length < 500) return [];
  const seen = new Set();
  const out = [];

  const addMatch = (nameRaw) => {
    const { fullName, first, last } = parseName(nameRaw);
    if (WY_JUNK.test(fullName)) return;
    if (WY_NON_NAME_LAST.test(last)) return;
    if (seen.has(fullName.toLowerCase())) return;
    seen.add(fullName.toLowerCase());
    out.push({ fullName, first, last, bioUrl: sourceUrl });
  };

  // Honorable pattern (district + circuit pages)
  let m;
  const reH = new RegExp(RX_WY_HONORABLE.source, 'g');
  while ((m = reH.exec(html)) !== null) addMatch(m[1]);

  // Justice pattern (supreme court page)
  const reJ = new RegExp(RX_WY_JUSTICE.source, 'g');
  while ((m = reJ.exec(html)) !== null) addMatch(m[1]);

  return out;
=======
// ---------------------------------------------------------------------------
// AK extractor
//
// Source 1 — courts.alaska.gov/judges/  (main index, all non-magistrate tiers)
//   Linked judges: <a href="docs/XX.pdf" target="_blank">Name</a>
//   Names come in two formats:
//     "First [M.] Last"  — Supreme Court / Court of Appeals section
//     "Last, First [M]"  — trial-court presiding-judge section
//   bio_url = https://courts.alaska.gov/judges/ (the listing page)
//
// Source 2 — courts.alaska.gov/judges/mj.htm  (magistrate judges)
//   Names in: <td class="trnospacetop"><span>FirstName LastName<br>
//   Always "First Last" format, no individual PDF link.
//   bio_url = https://courts.alaska.gov/judges/mj.htm
//
// extractAkJudges(indexHtml, mjHtml) merges both sources and dedupes by
// normalised (first + last) key.
// ---------------------------------------------------------------------------

const AK_INDEX_URL = 'https://courts.alaska.gov/judges/';
const AK_MJ_URL = 'https://courts.alaska.gov/judges/mj.htm';
const AK_SKIP_PDFS = /senior-judges|index|directory|recruitment|Careers/i;
const AK_SKIP_TEXT = /^(Appellate Courts?|Trial Courts?|Senior Judge|Careers|Presiding|Location|Appointed|Chief|Superior|District|Circuit|Court of Appeals|Alaska|Anchorage|Fairbanks|Juneau|Bethel|Kenai|Ketchikan|Kodiak|Palmer|Sitka|Homer|Valdez|Dillingham|Kotzebue|Nome|Utqiagvik|First|Second|Third|Fourth|\d{4})$/i;

// Normalize "Last, First M" → "First M Last"; pass-through "First [M.] Last" unchanged.
function normalizeAkName(raw) {
  const text = raw.trim();
  if (!text) return text;
  const comma = text.indexOf(',');
  if (comma > 0) {
    const last = text.slice(0, comma).trim();
    const rest = text.slice(comma + 1).trim();
    return rest + ' ' + last;
  }
  return text;
}

// Dedup key: first + last token (case-insensitive), keeps entry with more tokens.
function mergeByLastFirst(arr) {
  const map = new Map();
  for (const entry of arr) {
    const words = entry.fullName.split(/\s+/);
    const key = (words[0] + ' ' + words[words.length - 1]).toLowerCase();
    const existing = map.get(key);
    if (!existing || words.length > existing.fullName.split(/\s+/).length) {
      map.set(key, entry);
    }
  }
  return [...map.values()];
}

/**
 * Extract AK judges from the main index page and (optionally) the magistrate page.
 * @param {string} indexHtml - HTML of courts.alaska.gov/judges/
 * @param {string} [mjHtml]  - HTML of courts.alaska.gov/judges/mj.htm
 * @returns {{ fullName, first, last, bioUrl }[]}
 */
export function extractAkJudges(indexHtml, mjHtml) {
  const raw = [];
  const seenKey = new Set();

  function addEntry(fullName, bioUrl) {
    const words = fullName.split(/\s+/);
    if (words.length < 2) return;
    if (!/^[A-Z]/.test(fullName)) return;
    const key = (words[0] + ' ' + words[words.length - 1]).toLowerCase();
    if (seenKey.has(key)) return;
    seenKey.add(key);
    raw.push({ fullName, first: words[0], last: words[words.length - 1], bioUrl });
  }

  // --- Source 1: main index PDF-linked judges ---
  if (indexHtml && indexHtml.length >= 500) {
    const re1 = /<a[^>]+href="(docs\/[^"]+\.pdf)"[^>]*>([^<]+)<\/a>/g;
    let m;
    while ((m = re1.exec(indexHtml)) !== null) {
      const pdfPath = m[1];
      const rawText = m[2].trim();
      if (AK_SKIP_PDFS.test(pdfPath)) continue;
      if (AK_SKIP_TEXT.test(rawText)) continue;
      if (rawText.length < 4) continue;
      const fullName = normalizeAkName(rawText);
      addEntry(fullName, AK_INDEX_URL + pdfPath);
    }
  }

  // --- Source 2: magistrate judges page ---
  // Pattern: <td class="trnospacetop"><span>Name<br>  (may have leading newline/spaces)
  if (mjHtml && mjHtml.length >= 500) {
    const re2 = /<td[^>]*trnospacetop[^>]*>\s*<span>([^\n<]+)<br>/g;
    let m;
    while ((m = re2.exec(mjHtml)) !== null) {
      const rawText = m[1].trim();
      if (rawText.length < 4) continue;
      if (AK_SKIP_TEXT.test(rawText)) continue;
      const fullName = normalizeAkName(rawText);
      addEntry(fullName, AK_MJ_URL);
    }
  }

  return mergeByLastFirst(raw);
>>>>>>> 7a6cf198 (feat(judge-profiles): AK directory ingest — 45 to 141 (G8b))
}
