---
source: State + Federal statutes
provider: Per-state legislatures + Cornell LII (USC)
url: per-state — see chapter table below
format: multi (HTML / PDF / sitemap-PDF / Apex JSON)
license: Primary state law uncopyrightable per Georgia v. Public.Resource.Org (2020); USC public-domain
last_refresh: 2026-05-02 (CT/NY/MT/WV/NC/WA shipped 2026-05-02)
refresh_cadence: per-state weekly cron via cron-job.org
db_tables:
  - entities_statutes
  - jurisdiction_statutes_active
consuming_tiers:
  - all (charge taxonomy substrate)
---

# State + Federal statutes (`entities_statutes`)

The charge-taxonomy substrate. Every playbook, Case Decoder, IB, X-Ray references statute sections from this table. 49 states + DC + Federal currently loaded; NM still blocked by Justia ban + Lexum captcha.

## Schema (canonical)

| Column | Type | Notes |
|---|---|---|
| `canonical_id` | uuid (PK) | |
| `jurisdiction` | text | state code ("CA", "NY", "USC", "DC") |
| `title` | text | per-state title number / chapter root |
| `section` | text | section number ("46.61.502") |
| `subsection` | text | nullable, sub-section identifier |
| `section_text` | text | full statutory body |
| `is_current` | bool | superseded sections kept for history |
| `source_urls` | text[] | **REQUIRED** — verification URLs (HARD rule no-hallucinated-legal-data) |
| `text_hash` | text | content hash for diff-refresh |
| `effective_date` | date | nullable |
| `scraped_at` | timestamptz | last fetch time |

**Drift correction:** older designer notes assumed `entity_type, entity_id, statute_id, citation, body, created_at` columns — those do NOT exist. All shipped seeders adapted by reading existing columns; update any new designer documentation.

## Per-state coverage status (as of 2026-05-02)

| Jurisdiction | Rows | Wave / PR | Source root |
|---|---:|---|---|
| FL | 470 | Phase 1 #104 | https://www.flsenate.gov/Laws/Statutes (per-chapter HTML) |
| VA | 595 | Phase 2 #130 | https://law.lis.virginia.gov/vacode/ (Title 18.2 ch4–7) |
| OH | 433 | Phase 2 #128 | https://codes.ohio.gov/ (chapters 2903/2911/2913/2923/2925/4511) |
| USC | 36 | Phase 2 #115/119/124 | https://www.law.cornell.edu/uscode/ (Title 18 + 21 + 28) |
| NC | 3,532 | Phase 2 #275 | NC Gen Stats — chapter-inline (full text in 7 chapter pages, not 4400 fetches) |
| WA | 607 | Phase 2 #276 | https://app.leg.wa.gov/RCW/ (12 chapters Titles 9A/9/46/69) |
| AZ | ~236 | Phase 2 (engine-side) | https://www.azleg.gov/arstitle/ |
| GA | 648 | Phase 2 #228 | unicourt-harness on Georgia Code |
| OR | 952 | Phase 4 #57 | https://www.oregonlegislature.gov/bills_laws/ors/ (Title 16 + 471/475 + 813) |
| IL | live | Phase 4 (parallel Haiku) | https://www.ilga.gov/ documents/legislation/ilcs/documents/ (720 ILCS 5) |
| ME | live | Phase 4 (parallel Haiku) | https://legislature.maine.gov/statutes/ (Title 17-A) |
| MI | live | Phase 4 (parallel Haiku) | https://www.legislature.mi.gov/ (MCL Ch 750) |
| AL | live | Phase 4 (parallel Haiku) | https://alison.legislature.state.al.us/ (Title 13A via GraphQL bulk) |
| CT | 407 | #271 | cga.ct.gov + custom https.Agent (TLS chain workaround, gotcha-cga-ct-gov-tls-chain) |
| NY | 877 | #272 | nysenate.gov per-section + curl pivot (Cloudflare) |
| MT | 328 | #273 | mca.legmt.gov 3-level traversal |
| WV | 576 | #274 | code.wvlegislature.gov sitemap-first + per-article PDF (35 articles) |
| IA | 254 | #262 | sibling-session prior |
| TX, MD, OK, PA, IN, NJ | designs validated 2026-05-01 | Phase 4 backlog | per-state — varied |
| NM | BLOCKED | — | nmonesource.com Lexum SPA captcha + Justia 24-48h ban |

Total: ~48,500 rows after NH ingest completes (Phase 4 NH Title LXII at 11s/section ≈ 2.2hr). 49/50 coverage post-NH.

## Ingest pipeline

- **Per-state seeders:** `scripts/ingest/seed-statutes-<state>-<title>.mjs`.
- **Shared harness:** `scripts/lib/unicourt-harness.mjs` (lifts fetch+COPY pipeline from VA seeder; used by GA #228).
- **PDF harness:** `scripts/lib/pdf-statute-harness.mjs` (Wave 1C — DE/ME/OK/MA single-PDF ingest pattern).
- **Cron registration:** `cron-job.org` per-state. USC = jobId 7523661 (Mon 15:00 UTC). FL = jobIds 7523794–7523801 (per-chapter, Mon 16:00–16:50 UTC). OR = jobId 7550140 (Mon 18:00 UTC).
- **Rule #19 marker:** every seeder header carries `// csv-bulk-checked: ...` per state's bulk URL OR `none-exists` justification.
- **Hook gate:** `enforce-entities-statutes-table.js` (LIVE 2026-05-01) blocks any seeder write that targets deprecated `jurisdiction_statutes` table without `entities_statutes` also present (lesson from 2026-05-01 ME silent-failure).

## License / fair use

- **State statutes:** uncopyrightable primary law per *Georgia v. Public.Resource.Org*, 590 U.S. ___ (2020). Carl Malamud's Public Resource has cleared the precedent for any primary state law.
- **USC:** US government public-domain.
- **Cornell LII:** redistribution permitted with attribution (cite `https://www.law.cornell.edu/uscode/...` per row).

## Robots.txt / rate limits / source quirks

- **Justia (law.justia.com):** Cloudflare WAF. 7 hard rules J1–J7 (reference-justia-cloudflare-rate-limits-2026-05-01). Serialize, capture-fixtures-first, browser-fingerprint headers, abort on 5 consecutive challenges.
- **CT cga.ct.gov:** TLS chain rejected by default Node fetch. Use `https.Agent({rejectUnauthorized:false})` workaround (gotcha-cga-ct-gov-tls-chain).
- **WA app.leg.wa.gov:** ASP.NET WebForms. Use `?cite=` URL params, NOT `__doPostBack` (pattern-asp-net-url-param-pagination-trumps-postback).
- **IL ilga.gov:** use `documents/legislation/ilcs/documents/<DocName>.htm` (session-free), NOT `fulltext.asp` (session-required) (gotcha-il-ilga-static-vs-asp).
- **WV code.wvlegislature.gov:** section HTML is image-only (codeimg.php PNG). Use article-level PDFs at `/pdf/61-N/` (reference-wv-statute-source).

## Anti-patterns / known gotchas

- **Wrong DB table:** ME Haiku ingest 2026-05-01 wrote 0 visible rows because it INSERTed into deprecated `jurisdiction_statutes`. Always target `entities_statutes`. Hook now enforces.
- **Schema mismatch:** designer prompts that assumed old column names (`entity_type, entity_id, statute_id…`) silently fail. Always read existing seeder before designing a new one.
- **Parallel-ingest branch race:** different jurisdictions + different branches = parallel-safe. Same branch + same cwd = stomp. Use `_worktrees/` (lesson 2026-05-01 Phase 4 Haiku batch).

## Anti-hallucination contract

Every row MUST have `source_urls[]` populated. Empty array = fabricated (no-hallucinated-legal-data HARD rule). `pattern-anti-hallucination-audit-query.md` documents the 5-min SQL pass that runs after every ingest:

```sql
SELECT
  count(*) total,
  count(*) FILTER (WHERE source_urls IS NULL OR cardinality(source_urls)=0) null_src,
  count(*) FILTER (WHERE NOT (source_urls @> ARRAY['https'])) non_https
FROM entities_statutes;
```

Result must be `null_src=0, non_https=0`.

## Last refresh + next trigger

- Last big shipment: 2026-05-02 (CT/NY/MT/WV/NC/WA — 6 states, +6,327 rows).
- In flight: NH Title LXII (~2.2hr local ingest).
- Deferred: NM Chapter 30 (Justia ban auto-probe loop running, re-eval every 30min).
