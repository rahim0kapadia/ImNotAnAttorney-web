# Findings — State Statutes Seed Pipeline (FL Phase 1)

Companion to `2026-04-23-state-statutes-scaling.md`. Captures what this session LEARNED while executing Phase 1 so the next session resumes with context.

## Session 2026-04-23 (Phase 1 execution)

### Expert triangulation
- **Adopted:** OpenStates team (Mortenson + Turk) — `github.com/openstates/openstates-scrapers`. Cached profile: `~/.claude/experts/openstates-team.md`. 3-angle pass (BUILT/CITED/ACTIVE). Framework: Pupa-style row contract + per-state scraper class + 0.5-2s random rate + circuit breaker.
- **Washed out:** Eric Mill (federal-only), Cornell LII (republishes — doesn't pipeline), Public.Resource.Org / Malamud (no FL statute dump), Justia (Cloudflare-blocked).

### FL-specific discoveries
- **`FLLawDL2025.zip` is a dead-end.** It's a Windows InstallShield `setup.exe` with no parseable XML/JSON/SQLite. HTML scrape is the only path. Future sessions: do NOT re-investigate.
- **URL shape:** `http://www.leg.state.fl.us/Statutes/index.cfm?App_mode=Display_Statute&URL=<range>/<chapter>/<chapter>.html`. Chapter→range is a hardcoded lookup (not a formula).
- **"Statute does not exist" returns HTTP 200.** Must string-match page content for 404 detection.
- **robots.txt:** no Crawl-delay. Drifter + SemrushBot blocked entirely, `/employees/` blocked. We're free otherwise; self-impose 0.5-2s delay.
- **Alternate domain:** `sb.flleg.gov` (SearchAndBrowse) — possibly cleaner markup. Investigate before Phase 2.

### Chapter→range map (Phase 1 coverage)
| Chapter | Range | Subject |
|---------|-------|---------|
| 316 | 0300-0399 | Traffic / DUI |
| 775 | 0700-0799 | Penalties |
| 784 | 0700-0799 | Assault / battery |
| 810 | 0800-0899 | Burglary |
| 812 | 0800-0899 | Theft / robbery |
| 893 | 0800-0899 | Drug abuse prevention |

### Schema target
- **`entities_statutes`** (NOT `jurisdiction_statutes`). Per-section, entity-whitelist scope.
- **Columns in use** (from `src/lib/report/entity-whitelist.ts:200-205` + `supabase/functions/generate-report/index.ts:553-556`):
  `canonical_id, jurisdiction, title, section, is_current`
- **No `CREATE TABLE` in migrations/** — created out-of-band. This PR adds `supabase/migrations/<date>_entities-statutes-schema.sql` to track it.
- **Supabase was DOWN (57P03 "database system is not accepting connections")** during live schema inspection at ~2026-04-23 mid-session. Proceeded with inferred schema from live code queries.

### Prior scripts that touch statute data (DO NOT duplicate)
- `scripts/legal-research-fl.mjs` — FL verifier, UPDATE-only on `jurisdiction_statutes`
- `scripts/legal-research-all.mjs` — 50-state verifier, UPDATE-only
- `scripts/verify-statutes-openstates.mjs` — OpenStates cross-check, 500 req/day
- `scripts/load-jurisdiction-data.mjs` — seed loader for charge-taxonomy JSON
- `scripts/classify-case-law.mjs` — case-law classifier (not statute-direct)

### Mandatory scaffolding patterns
- **Header** (hook-enforced by `enforce-template-check.js` + `enforce-csv-before-api.js`):
  ```js
  // Template: scripts/ingest/pji-ingest.mjs
  // Expert: openstates-team
  // Pattern: cl-bulk-data-defensive #18 + no-hallucinated-legal-data
  // csv-bulk-checked: none-exists — FL Online Sunshine is web-only, FLLawDL2025.zip is Windows installer
  ```
- **Bulk load** (hook-enforced by `enforce-bulk-insert-pattern.js`): import `scripts/lib/pg-bulk-defaults.mjs` (`createBulkClient`, `bulkCopyRows`) or include per-row-justified marker.
- **Zod row-contract at parse seam:** reject-before-INSERT. `source_urls[]` non-empty, `chapter` int, `section /^\d+\.\d+$/`, `text_hash` SHA-256, `effective_date` ISO or null.

### Prior failure modes to avoid
- **Wave-1 fabrication incident (2026-04-07):** 106 citations + 4,500 unverified refs. Scrubber `scripts/scrub-enrichment-citations.mjs` exists as defense-in-depth.
- **Justia Cloudflare block** — use as reference URL only, never as fetch target.
- **Pooler idle timeout ~30s** — `createBulkClient` handles this (session-mode 5432).

### Open items for next session
1. Live `entities_statutes` schema must be queried once Supabase is back up — confirm the migration created here matches. Temp inspector: `scripts/ingest/_inspect-entities-statutes.mjs` (delete after confirmation).
2. Apply migration via Supabase CLI or Management API (once DB up): `supabase/migrations/20260423e_entities_statutes_schema.sql`.
3. Dry-run the seed against one chapter to validate HTML parse against real FL pages: `node scripts/ingest/seed-statutes-fl.mjs --dry-run --chapters=893 --limit=10`.
4. Full seed once dry-run validates: `node scripts/ingest/seed-statutes-fl.mjs` (6 chapters, ~100-200 sections, ~3-6 min wall time at 0.5-2s rate).
5. Investigate `sb.flleg.gov` markup quality before Phase 2.
6. Set up weekly hash-diff refresh cron once initial seed lands.

### Ship status at session end (2026-04-23)
- Plan revised + 7 gaps closed ✓
- Migration `20260423e_entities_statutes_schema.sql` written (idempotent) ✓
- Seed script `scripts/ingest/seed-statutes-fl.mjs` scaffolded (5 OpenStates rules encoded) ✓
- Parser lib `scripts/ingest/lib/fl-html.mjs` ✓
- Unit tests `scripts/ingest/__tests__/seed-statutes-fl.test.mjs` — 33/33 pass ✓
- Expert profile cached: `~/.claude/experts/openstates-team.md` ✓
- Findings file (this doc) ✓
- Supabase DOWN throughout session (57P03) — live apply deferred to next session.

## Session 2026-04-24 (resume + ship)

### Schema reconciliation (vs 2026-04-23 inferred schema)
Live `entities_statutes` schema inspected — **drift from plan**:
- `canonical_id` is **UUID** default `gen_random_uuid()`, NOT TEXT `"statute:fl-..."`. 2,241 live US rows use UUIDs.
- `section_text` is a **single column** (NOT `title_text` + `body_text` as migration planned).
- `subsection` column exists + is part of unique `(jurisdiction, title, section, subsection, effective_date)` index.
- `wikidata_qid` column exists with partial unique index.

Migration rewritten to additive-only (`ADD COLUMN IF NOT EXISTS source_urls, text_hash, scraped_at`). CREATE TABLE dropped (baseline existed, would have been a no-op anyway). Script rewritten to match live shape: omit canonical_id (DB auto-gens), merge title+body into `section_text`, always-NULL `subsection`.

### Real FL Online Sunshine markup (vs 2026-04-23 fixtures)
- Actual content lives in nested inner HTML inside `<div id="statutes">` → `<span class="CatchlineText">` (title) + `<span class="SectionBody">` (body). Parser rewritten to scope on these spans.
- Section URL filename requires **padded chapter**: `/Sections/0893.01.html` (unpadded `893.01.html` returns generic fallback 200 OK).
- Outer `<title>` is generic "Statutes & Constitution ... Online Sunshine" — not usable as section title. Parser falls back to `'Section ' + section` when CatchlineText absent.

### Ship status at session end (2026-04-24)
- Migration applied live (3 columns added) ✓
- Dry-run on chapter 893 validated HTML parse ✓
- Full seed: **470 rows** across 6 chapters (316=282, 775=55, 784=28, 810=21, 812=44, 893=40) — exceeds ≥120 acceptance criteria by 4× ✓
- Every row has non-empty source_urls + non-empty section_text + populated text_hash ✓
- 37/37 unit tests pass ✓
- Swarm review (code-reviewer + security-auditor agents) completed: 6 CRITICAL + 19 WARNING findings addressed:
  - HTTPS source fetch (was plaintext HTTP) — MITM defense
  - Parameterized DELETE (defense against future untrusted chapter input)
  - Pre-commit verify INSIDE transaction (previously post-commit with no rollback path)
  - Dedupe key now full unique-tuple (title, section, subsection, effective_date)
  - Zod schema: URL host check (rejects `attacker.com/leg.state.fl.us/...` spoof), max lengths on section_text + source_urls, effective_date real-calendar-date validation
  - stripHtml: decode order fixed (tags first, then entities, then re-strip) for XSS resistance; C0 controls + DEL + surrogates dropped; hash/data divergence eliminated
  - fetchWithRetry: 4xx (non-429) no longer retried; breaker counter not bumped for non-retryable errors
  - extractSectionNumbers: scoped to canonical `/Sections/<padded>.<sec>.html` URL pattern (eliminates body-text cross-reference overmatch)
  - textArrayLiteral: escapes `\r` `\n` in addition to `\\` and `"`
  - effective_date anchored to SectionBody scope (body-internal cross-refs no longer clobber)
  - SectionBody regex bounded by `</span></div>` (was greedy to EOF)
  - process.exit replaced with throw (importable)
  - invokedDirectly uses `pathToFileURL` canonical compare
  - env loader: web-repo `.env.local` only (was cross-repo), skips `#` comments, trims, strips balanced quotes
  - data/statutes-fl-*.jsonl added to .gitignore
  - Preview path absolute under repo root (was cwd-relative)

### Out-of-scope follow-ups (tracked)
- **SEC-C2 (pg-bulk-defaults `rejectUnauthorized:false`)** — affects every CL bulk loader in `scripts/`. Separate scope; dedicated PR to audit all callers + pin Supabase CA bundle.
- **W10 (downstream source_urls filter in entity-whitelist + generate-report)** — 2,241 pre-existing federal rows have empty `source_urls='{}'`. Silently filtering them would break federal fallback in state reports. Proper fix: backfill federal source_urls from Cornell LII / USC authoritative sources. Separate scope.
- **sb.flleg.gov investigation** — alternate cleaner-markup FL endpoint. Queued for Phase 2.
- **Weekly hash-diff refresh cron** — `text_hash` is populated; scaffold cron job separately once initial seed is stable.
- **Phase 2 (13-state rollout)** — coming per plan.
