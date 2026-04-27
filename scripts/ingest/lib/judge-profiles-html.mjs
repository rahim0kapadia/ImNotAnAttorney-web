// HTML parsing helpers for ND district-court judge directory.
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
