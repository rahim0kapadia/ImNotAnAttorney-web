// HTML parsing helpers for ND and WY judge directories.
//
// Pure in-memory string processing — no file I/O. Safe regex on string args
// (FL pattern; mirrors lib/justia-html.mjs).

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
}
