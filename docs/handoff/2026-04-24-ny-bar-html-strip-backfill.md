# Handoff: NY Bar — HTML→Plaintext Re-Backfill (Round 2)

**Context 2026-04-24:** Round-1 backfill via `scripts/ingest/backfill-cl-opinion-bodies-nyappdiv.mjs`
fetched 3,721 CL v4 opinions for NY AD "Matter of X" clusters and wrote them
to `cl_opinion_bodies`. Result was only **+30 NY discipline events** (69 → 99)
because 3,643 of 3,721 opinions had `plain_text: null` — the actual text lives
in `html_with_citations` / `html` variants that the script didn't capture.

## Expected upside after round 2

Round-1 processor stats on the 357 clusters that DID have plain_text:
- 96 attorneys upserted
- 100 parsed / 4031 candidates (skipped: 3672 no-body, 162 no-bar-no, 0 no-name, 97 no-discipline)
- 30 new discipline events landed (ON CONFLICT DO NOTHING deduped the 69 pre-existing)

Extrapolating the 100/357 ≈ 28% hit rate to all 3,643 null-text rows gives
**≈1,020 additional discipline events** — pushing NY from 99 → ≈1,120 total.

## Root-cause fix (hook-compliant per root-cause-first.md)

Modify `scripts/ingest/backfill-cl-opinion-bodies-nyappdiv.mjs` to fall back
to HTML-stripping when `plain_text` is null:

```js
// In fetchOpinion(), replace the plain_text extraction block with:
let text = body.plain_text || '';
if (!text && body.html_with_citations) {
  text = stripHtmlToText(body.html_with_citations);
} else if (!text && body.html) {
  text = stripHtmlToText(body.html);
}
// Then store `text` as plain_text in cl_opinion_bodies.
```

Where `stripHtmlToText` is a simple regex-based stripper:

```js
function stripHtmlToText(html) {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/?p[^>]*>/gi, ' ')
    .replace(/<\/?div[^>]*>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#8217;|&rsquo;/g, "'")
    .replace(/&#8220;|&#8221;|&ldquo;|&rdquo;/g, '"')
    .replace(/&#8211;|&ndash;/g, '-')
    .replace(/&#8212;|&mdash;/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}
```

Then re-run only for the rows with null plain_text (not a full re-backfill):

```sql
-- Target selection: 3,643 clusters with bodies but null plain_text
SELECT b.cluster_id
FROM cl_opinion_bodies b
JOIN cl_opinion_clusters cc ON cc.id = b.cluster_id
JOIN cl_dockets d ON d.id = cc.docket_id
WHERE d.court_id IN ('nyappdiv','nyappterm')
  AND cc.case_name ~ '^Matter of [A-Z][a-zA-Z.-]+$'
  AND cc.date_filed >= '2014-01-01'
  AND b.plain_text IS NULL;
```

Add a `--update-null-text-only` flag to the backfill script that selects from
that query instead of the "missing bodies" query, then UPDATE (not INSERT) the
existing rows.

## Runtime estimate

- 3,643 rows × 1.2s/req = ~73 minutes (same as round 1)
- CL v4 rate limit: 5,000/hr authenticated — fits within one hour run

## Idempotency

`process-nybar-discipline.mjs` has ON CONFLICT DO NOTHING on
`(jurisdiction, bar_number, order_date, discipline_type)` — safe to re-run any
number of times.

## Ready-to-paste prompt

```
Execute round 2 of NY AD opinion body backfill per
  C:\Users\email\projects\ImNotAnAttorney\docs\handoff\2026-04-24-ny-bar-html-strip-backfill.md

1. Add stripHtmlToText helper + HTML-fallback logic to
   C:\Users\email\projects\ImNotAnAttorney-web\scripts\ingest\backfill-cl-opinion-bodies-nyappdiv.mjs
2. Add --update-null-text-only flag that re-fetches rows where
   cl_opinion_bodies.plain_text IS NULL for NY AD Matter-of-X clusters
3. Run the backfill (1.2s pace, ~75 min, 3,643 rows)
4. Re-run scripts/ingest/process-nybar-discipline.mjs --start-date 2014-01-01 --apply
5. Verify: SELECT jurisdiction, count(*) FROM attorney_discipline_events
   WHERE jurisdiction = 'NY' GROUP BY jurisdiction;
   Expected: ~1,100 events (up from 99).

HARD CONSTRAINTS:
  - Do NOT re-run for clusters already with plain_text IS NOT NULL (357 rows
    fine as-is, would waste rate-limit budget)
  - COPY FROM STDIN via bulkCopyRows for the staging+UPDATE join
  - Rate limit: 1.2s between CL requests (5,000/hr safe zone)

Budget: 1.5 hours.
```
