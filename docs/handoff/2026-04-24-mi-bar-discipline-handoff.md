# Handoff: Michigan ADB Discipline Scraper

**Branch:** `feat/mi-bar-discipline` at worktree `C:\Users\email\projects\mi-bar-work`.
**Status (as of 2026-04-24 evening session):** scraper shipped, partial DB load
applied. Final apply pending recovery from a Lexum edge 403 IP-block triggered
by the smoke-test burst. Plan + checkpoint commit in place.

## What landed in this session

1. `scripts/ingest/scrape-mibar-discipline.mjs` — RSS-aware sequential walker
   that hits both `no/` (Notices) and `op/` (Opinions/Orders) collections on
   `norma.lexum.com`, parses the server-rendered iframe metadata table for
   P-number, document type, dates, and the canonical "Title" field
   (e.g. "Notice of Reprimand (By Consent)", "Order Suspending Lawyer"), and
   classifies into the existing `discipline_type` enum used by CA/FL/PA/TX.
2. `docs/plans/2026-04-24-mi-bar-discipline-scraper.md` — full plan including
   source discovery, fallback strategy, exit criteria.
3. Two staging applies exercised end-to-end against the production DB:
   - `--max-id 7541 --min-id 7530`: 12 events → 12 inserted.
   - `--max-id 7530 --min-id 7430`: 46 records parsed → 45 events inserted
     (1 in-batch dup on the (bar_number, order_date, discipline_type) key).
   - Combined: 57 MI events, 51 unique attorneys, 100% source_url, 0 bad
     P-number formats, range 2022-03-03 → 2026-04-24.

## Source discovery (locked in)

- Public site `https://www.adbmich.org/` is a Muniweb CMS shell that redirects
  records lookups to `https://records.adbmich.org/...` → `https://norma.lexum.com/...`.
- The records DB is JS-rendered Lexum (Decisia / Norma) — outer item pages
  (`/adbmich/{no,op}/en/item/<id>/index.do`) only contain a breadcrumb and an
  iframe pointer. Server-rendered metadata lives at
  `/adbmich/{no,op}/en/item/<id>/index.do?iframe=true`.
- Static feeds available:
  - `https://norma.lexum.com/adbmich/no/en/rss.do` — Notices, ~100 latest
  - `https://norma.lexum.com/adbmich/op/en/rss.do` — Orders/Opinions, ~100 latest
- Item IDs are shared across collections (each ID lives in exactly one
  collection). Highest seen as of 2026-04-24 = 7541.

## Schema

No schema changes. Reuses the existing tables shipped by CA/FL/PA/TX bar
clones:
- `public.attorneys` — UNIQUE (jurisdiction, bar_number).
- `public.attorney_discipline_events` — UNIQUE (jurisdiction, bar_number,
  order_date, discipline_type).
- Discipline enum members used: `disbarment`, `suspension`,
  `interim_suspension`, `probation`, `public_reprimand`, `admonishment`,
  `reinstatement`, `disability_inactive`, `unknown`.

## The 403 incident (2026-04-24 ~23:11 EDT)

The smoke-test run with `--delay-min 300 --delay-max 700` walked 100 IDs in
~60 seconds. Lexum's edge throttler triggered a 403 IP-block that persists at
least 10+ minutes (still blocked as of 23:20 — `?iframe=true` URLs only; RSS
and outer item URLs still serve 200).

The scraper now bakes in:
- Default delay 1000-2000 ms (well below trigger).
- Exponential backoff on 403: 60s → 120s → 240s before bubbling.
- 5s retry on transient socket errors.

## What's left to run (next session)

Block expected to clear within 30-60 min of session end. Then run:

```sh
cd C:\Users\email\projects\mi-bar-work
node scripts/ingest/scrape-mibar-discipline.mjs --max-id 7430 --min-id 6000 \
  --max-misses 100 --delay-min 1500 --delay-max 3000 --no-auto-max --apply
```

Expected outcome: ~430 additional events at ~50% hit-rate × ~900 IDs scanned
(combined with the 57 already loaded → ~487 events total — comfortably above
the parent prompt's ≥300 exit criterion).

If 403 recurs mid-run, the script self-throttles up to 240s/attempt then
bubbles the failure with the offending URL logged.

## Verification SQL (run after final apply)

```sql
SELECT count(*) events, count(DISTINCT bar_number) attorneys,
       min(order_date), max(order_date)
FROM attorney_discipline_events WHERE jurisdiction='MI';

SELECT count(*) total,
       count(source_url) FILTER (WHERE source_url IS NOT NULL AND source_url<>'')::int has_url
FROM attorney_discipline_events WHERE jurisdiction='MI';

SELECT discipline_type, count(*) FROM attorney_discipline_events
WHERE jurisdiction='MI' GROUP BY discipline_type ORDER BY count(*) DESC;

-- HEAD-check
curl -I -A "INAA-Crawler/1.0 (+https://imnotanattorney.com)" \
  https://norma.lexum.com/adbmich/no/en/item/7541/index.do
```

## Constraints honored

- 100% `source_url` coverage (the public item URL — verified 200 on HEAD-check).
- Real Michigan P-number format `P\d{4,6}` enforced pre-COPY.
- `bulkCopyRows` only — per-row INSERT banned (cl-bulk-data-defensive #18).
- Session settings via `createBulkClient`: `statement_timeout='30min'`,
  `idle_in_transaction_session_timeout='5min'`, tcp_keepalives, port 5432.
- Polite scraping: 1-2 s/req default, INAA UA, full contact email.
- Touched only `scripts/ingest/`, `docs/plans/`, `docs/handoff/`, `.tmp/` (probe scratch).
- No PR, no push, no email — branch local only.

## Commit log

- `98320e3a feat(ingest): Michigan ADB discipline scraper` (this branch)

Branch is up to date with `origin/master` via fast-forward (4 commits absorbed
during this session: hormozi-guarantee-attribution merge + Mandatory-Min fix +
GA4/Stripe attribution + CPD Invisible Institute ingest).
