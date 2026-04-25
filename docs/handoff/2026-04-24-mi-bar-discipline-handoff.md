# Handoff: Michigan ADB Discipline Scraper

**Branch:** `feat/mi-bar-discipline` at worktree `C:\Users\email\projects\mi-bar-work`.
**HEAD commits:**
- `3d33bdf3 feat(ingest): MI scraper RSS-only fallback + same-day dedup`
- `d4fc3122 docs(handoff): MI bar discipline scraper — initial` (superseded by this rewrite)
- `98320e3a feat(ingest): Michigan ADB discipline scraper`

**Status (2026-04-24 evening):** 187 events landed, scraper functional in both
modes (iframe-walk + RSS-only-metadata). The ≥300 exit criterion is not yet
met this session — Lexum's edge IP-block on `?iframe=true` URLs has persisted
>25 minutes after the smoke-test burst that triggered it, blocking the
sequential walk that would close the gap.

## DB state right now

```
totals:       187 events, 125 attorneys, 1978-12-07 → 2026-04-24
url_coverage: 187/187 (100%)
bad_bar:      0
histogram:
  unknown            137   (from RSS-only fallback path)
  suspension          13
  public_reprimand    13
  disbarment           9
  reinstatement        8
  interim_suspension   6
  disability_inactive  1
```

Constraint compliance:
- 100% `source_url` ✅
- All `bar_number` match `^P[0-9]{4,6}$` ✅
- Real Michigan P-numbers (every row has the actual ADB-issued P-number, not synthetic) ✅
- HEAD-check on a sample URL returns 200 ✅
- Event count ≥ 300 ❌ (187 — gap of 113 to close)

## What's left and how to close it

### Step 1 — Wait out the Lexum 403

Lexum's `norma.lexum.com` edge throttler IP-blocked us on
`?iframe=true` URLs after the smoke-test burst (100 reqs in ~60s at
300-700 ms/req). The block has held >25 min and is path-specific
(`?iframe=true` blocked, RSS + outer `index.do` still serve 200).

Recovery test:
```sh
curl -s -A "INAA-Crawler/1.0 (+https://imnotanattorney.com)" \
  -o /dev/null -w '%{http_code}\n' \
  "https://norma.lexum.com/adbmich/no/en/item/7400/index.do?iframe=true"
```
When this returns `200`, the block has cleared.

### Step 2 — Walk the back catalogue

```sh
cd C:\Users\email\projects\mi-bar-work
node scripts/ingest/scrape-mibar-discipline.mjs --max-id 7430 --min-id 6000 \
  --max-misses 100 --delay-min 1500 --delay-max 3000 --no-auto-max --apply
```

Expected: ~430 iframe-classified events at ~50% hit rate over ~900 IDs (run
time ~30-45 min at 2s avg). The script's INSERT skips `unknown` staging rows
when a classified row already exists for the same `(bar_number, order_date)`,
and the post-INSERT `DELETE` cleans up superseded `unknown` rows from the
RSS fallback. Net result: histogram should pivot from "137 unknown / 50
classified" to "~30 unknown / ~430 classified", events total ~500-600.

### Step 3 — Verification

```sql
SELECT count(*) events, count(DISTINCT bar_number) attorneys,
       min(order_date), max(order_date)
FROM attorney_discipline_events WHERE jurisdiction='MI';

SELECT count(*) total,
       count(source_url) FILTER (WHERE source_url IS NOT NULL AND source_url<>'')::int has_url
FROM attorney_discipline_events WHERE jurisdiction='MI';

SELECT discipline_type, count(*) FROM attorney_discipline_events
WHERE jurisdiction='MI' GROUP BY discipline_type ORDER BY count(*) DESC;
```

HEAD-check (any session):
```sh
curl -I -A "INAA-Crawler/1.0 (+https://imnotanattorney.com; contact: noreply-legal@inaa.com)" \
  https://norma.lexum.com/adbmich/no/en/item/7541/index.do
```

## Source discovery (locked in)

- `https://www.adbmich.org/` is a Muniweb CMS shell that redirects records
  lookups to `https://records.adbmich.org/...` → `https://norma.lexum.com/adbmich/...`.
- Records DB is JS-rendered Lexum (Decisia / Norma) — outer item pages only
  contain a breadcrumb and an iframe pointer. Server-rendered metadata lives
  at `/adbmich/{no,op}/en/item/<id>/index.do?iframe=true`.
- Static feeds available:
  - `https://norma.lexum.com/adbmich/no/en/rss.do` — Notices, ~100 latest
  - `https://norma.lexum.com/adbmich/op/en/rss.do` — Orders/Opinions, ~100 latest
- Item IDs are shared across collections — exactly one of `no/` or `op/`
  returns 200 per ID. Highest seen as of 2026-04-24 = 7541. Lowest in the
  active op feed = 4315 (1980 opinion).

## Schema (unchanged)

Reuses tables shipped by CA/FL/PA/TX clones:
- `public.attorneys` — UNIQUE (jurisdiction, bar_number).
- `public.attorney_discipline_events` — UNIQUE (jurisdiction, bar_number,
  order_date, discipline_type).

## Two modes the scraper supports

**Iframe walk (preferred — gives classified discipline_type):**
```sh
node scripts/ingest/scrape-mibar-discipline.mjs --max-id <hi> --min-id <lo> \
  --max-misses 100 --delay-min 1500 --delay-max 3000 --no-auto-max --apply
```

**RSS-only metadata (fallback when iframe is blocked):**
```sh
node scripts/ingest/scrape-mibar-discipline.mjs --only-rss-metadata \
  --no-auto-max --apply
```

## Constraints honored

- 100% `source_url` coverage (public item URL — verified 200 on HEAD-check).
- Real Michigan P-number format `P\d{4,6}` enforced pre-COPY.
- `bulkCopyRows` only — per-row INSERT banned (cl-bulk-data-defensive #18).
- Session settings via `createBulkClient`: `statement_timeout='30min'`,
  `idle_in_transaction_session_timeout='5min'`, tcp_keepalives, port 5432.
- Polite scraping: 1-2 s/req default, 60-240 s exponential backoff on 403.
- Touched only `scripts/ingest/`, `docs/plans/`, `docs/handoff/`, `.tmp/`.
- No PR, no push, no email — branch local only.

## Lessons + memory candidates

1. **Lexum/Decisia rate-limit shape:** ~100 reqs/60s on `?iframe=true` paths
   triggers an IP-block that lasts ≥25 min and is path-specific. RSS + outer
   `index.do` paths stay 200 throughout. Defaults of ≤30 reqs/min are safe.
2. **Bar scrapers should always carry an RSS-only fallback** since per-item
   HTML is what gets throttled. RSS XML feeds usually stay 200 because
   they're cache-friendly.
3. **Same-day same-attorney "twin events" risk:** When two ingestion paths
   produce different `discipline_type` for the same event (RSS-fallback
   `unknown` vs iframe-walked `disbarment`), the
   `(jurisdiction, bar_number, order_date, discipline_type)` UNIQUE doesn't
   catch it. Solution baked into the script: skip `unknown` insert if
   classified sibling exists, and DELETE superseded `unknown` rows
   post-INSERT.
