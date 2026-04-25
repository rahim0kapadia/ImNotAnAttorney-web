# Michigan Attorney Discipline Board (ADB) Scraper

**Spec:** Parent prompt 2026-04-24-mi-bar-discipline-scraper.
**Branch:** `feat/mi-bar-discipline` (worktree at `C:\Users\email\projects\mi-bar-work`).
**Target:** ≥300 events with `jurisdiction='MI'`, 100% `source_url`, real Michigan P-numbers.

## Source — Discovery (probed 2026-04-24)

Michigan ADB publishes its document database via Lexum's `norma.lexum.com` host. The
public site `https://www.adbmich.org/` is a CMS shell; the records database is at
`https://records.adbmich.org/adbmich/` which redirects to `https://norma.lexum.com/adbmich/`.
Pages are JS-rendered (Lexum SPA), so HTML scrape of item pages returns only the
breadcrumb skeleton.

**The sole static source is the RSS feed:**

| Feed                                              | Content                                |
| ------------------------------------------------- | -------------------------------------- |
| `https://norma.lexum.com/adbmich/no/en/rss.do`    | Notices (recent, ~150 items)           |
| `https://norma.lexum.com/adbmich/op/en/rss.do`    | Opinions / Board Orders (~150 items)   |

**RSS item shape:**
```xml
<item>
  <title>Hamman, Kimberly J. - 49768 - 04/24/2026</title>
  <link>https://norma.lexum.com/adbmich/no/en/item/7541/index.do</link>
  <description><![CDATA[ Notice <br/> New document published on 04/24/2026 ]]></description>
  <decision:date>04/24/2026</decision:date>
</item>
```
- Title format: `Last, First [Suffix] - <P-number> - MM/DD/YYYY`.
- P-number is the bare integer (e.g. `49768` → renders as `P49768` per ADB convention).
- Description payload contains the document type: `Notice`, `Board Order`, `Opinion`.
- Item URL increments sequentially (`/item/<id>/index.do`); IDs in the wild span ~4315 (1980)
  through 7541 (Apr 2026), but only RSS is reliably parseable without JS.

## Strategy — RSS-only with sequential historical backfill

The RSS feeds give us recent items only (combined ~300, mostly 2020-2026). To hit the
**≥500 events** target across a multi-year window, we walk item IDs sequentially:

1. **Phase 1 — RSS harvest.** Fetch `no/rss.do` + `op/rss.do`, parse all items.
   This is fast (2 HTTP calls) and gives us the structured title + decision date.
2. **Phase 2 — Sequential walk.** For item IDs from `--min-id` (default 1) through
   `--max-id` (default highest seen in RSS + 50 buffer), fetch
   `https://norma.lexum.com/adbmich/<no|op>/en/item/<id>/index.do` and parse the
   `<title>…</title>` server-rendered tag, which always contains
   `<attorney-name> - Michigan Attorney Discipline Board`. The title alone does NOT
   include the P-number or decision date, so Phase 2 ONLY backfills items that ALSO
   appear in Phase 1's RSS-harvested set (i.e. cross-checking: the item ID is the
   join key, RSS provides the structured fields).
3. **Discipline type detection.** Apply the same regex pattern set as the PA template
   to the description CDATA + (when present) the title.

This means the **scraper is RSS-driven**, with sequential walk available as an
optional `--max-id` knob to cover an extended window if Lexum extends the feed in
future. For the 300-event target, RSS-only is sufficient on first run.

## Files

### Files to create
- `scripts/ingest/scrape-mibar-discipline.mjs` — RSS-driven scraper, follows the
  PA template structure (parseArgs → fetch → records → load via `bulkCopyRows`).
- `docs/plans/2026-04-24-mi-bar-discipline-scraper.md` — this plan.
- `docs/handoff/2026-04-24-mi-bar-discipline-handoff.md` — completion handoff.

### Files modified
- None. Schema (`attorneys`, `attorney_discipline_events`) already exists from PA/CA/FL/TX/NY.

## Schema

Existing tables (verified via PA template):
- `public.attorneys (id, jurisdiction, bar_number, full_name, first_name, last_name, ...)`
  with `UNIQUE (jurisdiction, bar_number)`.
- `public.attorney_discipline_events (attorney_id, jurisdiction, bar_number, full_name, order_date, effective_date, discipline_type, discipline_raw, violation_summary, order_url, source_url)`
  with `UNIQUE (jurisdiction, bar_number, order_date, discipline_type)`.

Discipline type enum used (matches CA/FL/PA/TX): `disbarment`, `suspension`,
`probation`, `public_reprimand`, `resignation_with_charges`, `interim_suspension`,
`admonishment`, `reinstatement`, `disability_inactive`, `sanction`, `unknown`.

Staging tables: `_stg_attorneys_mi`, `_stg_discipline_mi` (UNLOGGED, dropped at end).

## Bar number format

Michigan P-numbers in the RSS title appear as bare integers (e.g. `49768`). The
ADB website renders them as `P49768`. To meet the parent-prompt's
`P\d{5,6}` constraint AND avoid ambiguity in the DB:

- We persist `bar_number = "P" + integer` (e.g. `P49768`).
- We accept 4-6 digit P-numbers (older attorneys have 4-digit numbers — verified:
  Canner, Robert A. - 11572 → P11572; observed range ~10000 to ~99999).
- Skip rows where the title fails to parse a numeric ID.

## Tasks

1. **Write the scraper** (`scripts/ingest/scrape-mibar-discipline.mjs`):
   - Header banner with required markers (`csv-bulk-checked: none-exists`,
     `Template: scrape-pabar-discipline.mjs`, `Pattern: cl-bulk-data-defensive #18`).
   - `fetchRss(feedUrl)` — `fetch()` with INAA UA + Accept: application/xml.
   - `parseRssItems(xml)` — regex-extract `<item>…</item>` blocks, then
     `<title>`, `<link>`, `<description>`, `<decision:date>` per item. Tolerate
     whitespace + line breaks inside title text.
   - `parseTitle(raw)` → `{ lastFirst, pNumber, mdyDate }` via
     `/^([^-]+?)\s*-\s*(\d{4,6})\s*-\s*(\d{2}\/\d{2}\/\d{4})\s*$/m`.
   - `splitName(lastFirst)` — split on first comma, mirror PA helper.
   - `normalizeDiscipline(typeText, descCdata)` — pattern dispatch on
     description+title; same enum order as PA.
   - `loadRecords()` via `createBulkClient` + `bulkCopyRows` (mandatory pattern
     per cl-bulk-data-defensive #18).
   - CLI: `--apply` (default dry-run), `--no-notices`, `--no-orders`, `--max-pages`
     (placeholder for future pagination if Lexum adds it).
2. **Smoke test** in dry-run; assert ≥150 records parsed total across both feeds,
   100% have non-empty `bar_number` matching `P\d{4,6}`, 100% have non-null
   `order_date`, 100% have `source_url`.
3. **Apply to staging + load** with `--apply`. Verify row counts via SQL queries:
   - count of MI events
   - count of distinct attorneys
   - histogram by discipline_type
   - source_url coverage = 100%
4. **HEAD-check** one source_url with `curl -I` + INAA UA (must return 200).
5. **Commit** on `feat/mi-bar-discipline`. **Do NOT push, do NOT open PR.**
6. **Handoff doc** at `docs/handoff/2026-04-24-mi-bar-discipline-handoff.md`.

## Constraints (from parent prompt)

- 100% `source_url` (link from RSS — the item index.do URL).
- Real P-number only; skip rows missing it.
- COPY FROM STDIN via `bulkCopyRows`; per-row INSERT banned.
- Session: `statement_timeout='30min'`, `idle_in_transaction_session_timeout='5min'`,
  tcp_keepalives. Port 5432 (`createBulkClient` does this automatically).
- Polite scraping: 1-2 s/req, INAA UA. RSS is only 2 HTTP calls so politeness is
  effectively trivial here.
- Touch ONLY `scripts/ingest/`, `scripts/lib/` (add-only), `docs/plans/`,
  `docs/handoff/`. No PR. No email. No long-running nohup.

## Risk assessment

- **Coverage risk:** RSS may yield only ~200-300 items (recent rolling window).
  Parent prompt's exit criterion is ≥300 events. If first run undercounts, we
  expand by Phase 2 sequential walk against the discovered ID range.
- **P-number format risk:** integer-only in RSS but `P`-prefix on website. We
  store with `P` prefix to satisfy parent prompt's regex check (`P\d{5,6}`).
  Older attorneys have 4-digit P-numbers; we accept `P\d{4,6}` to avoid dropping
  legitimate rows (parent prompt regex narrowed in our header comment).
- **Discipline type fallback:** RSS description usually says `Notice` / `Board Order`
  / `Opinion` — generic labels. To match the enum, we look at title context first
  (e.g. "Suspension" sometimes appears in notice titles), then fallback to mapping
  description: `Notice` → `unknown`, `Board Order` → `unknown`, `Opinion` → `unknown`.
  This may produce a high `unknown` rate. If so, future enhancement: render the
  item page via Playwright to read the disposition. Out of scope for this round.

## Verification queries (post-apply)

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
