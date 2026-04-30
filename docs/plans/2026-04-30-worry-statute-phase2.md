# Worry: Statute coverage Phase 2 — NC, AZ, WA, OH (extended)

Date: 2026-04-30
Slug: statute-phase2
Parent worry: 2026-04-30-worry-ib-launch-quality-gaps.md (GAP 4 of 4)

## Worry

`jurisdiction_statutes` covers FL (470 rows), VA (595), OH (247 limited to
6 chapters), USC (36) — total 1,348 verified statute rows shipping today.
Customer-facing impact: when an IB is generated for a state outside
{FL, VA, OH-limited, federal}, the LLM cites generic statute references
with `[VERIFY]` markers because the entity-whitelist is empty for that
jurisdiction. Customers in NC, AZ, WA, OH-extended see vague "consult
your attorney" language instead of mechanical citations.

Pristine launch posture: every state where we expect customer demand
must have its core criminal statutes seeded, source URL anchored,
HTTPS verifiable, no fabrication.

Target states (ordered by 2026 pull-data demand signals):
1. **NC** — high demand (Charlotte/Raleigh metro), no coverage
2. **AZ** — moderate demand (Phoenix/Tucson), no coverage
3. **WA** — moderate demand (Seattle), no coverage
4. **OH-extended** — Ohio is currently 6-chapter limited (2903/2911/2913/
   2923/2925/4511); extend to cover full criminal code

## Expert Lens

**Primary**: openstates-team (cached at `~/.claude/experts/openstates-team.md`,
triangulated 2026-04-23, ttl 180d, cascade_profile: native).

Key framework applied:
- Per-state scraper class pattern (one file per state, owns state quirks)
- StatuteRowSchema port from VA (shared Zod contract): every row has
  `source_urls[]` non-empty, `title`/`section`/`subsection` parsed
  (the existing `entities_statutes` schema stores chapter codes in
  the `title` column — there is no `chapter` column),
  effective_date ISO, text_hash for change detection,
  `section_text` length-validated (live column name; some legacy
  copy referred to this as `statute_text` — do NOT use that name in
  any SQL or seed code)
- Source URL is primary key of trust, not metadata afterthought
- Re-fetch cadence + diff (weekly cron, hash-diff)
- Don't use Cornell LII as primary; official state source first; LII as
  fallback
- Publish your scraper (cascade-positive: open-source raises floor for
  every public defender, ethics board, defendant)

Precedent shipped per memory:
- `project-fl-statutes-seed-shipped.md` — FL Phase 1 PR #104, 470 rows
- `project-va-statutes-seed.md` — VA PR #130, 595 rows
- `project-oh-statutes-seed.md` — OH PR #128, 247 rows (limited chapters)
- `project-usc-seed-expansion-v2.md` — USC v2 + v3, 36 rows
- `project-fl-refresh-cron.md` — FL weekly refresh PR #120

## Cascade Map

- **Us (INAA)**: IB ($997) reports for NC/AZ/WA/OH-extended customers
  switch from `[VERIFY]`-laden generic prose to mechanical citations
  with HTTPS source URLs. Closes the last GAP in the IB launch quality
  worry. Removes the "consult your attorney" fallback footprint that
  reads as crisis-era hand-waving to Hormozi-tier crisis buyers.
- **Direct counterparty (defendants in 4 new states)**: an IB now
  cites the statute they're charged under with the exact official URL
  their public defender / private attorney can pull up in court. Closes
  the information gap, defendant is no longer the only stranger in the
  room when the statute comes up.
- **Their downstream (their attorneys)**: receive a brief that points
  at official `leg.state.*.us` / `azleg.gov` / `app.leg.wa.gov` URLs
  (not Cornell LII). Attorney can verify in 30s instead of 30min;
  trust in our deliverable compounds; referral pattern intact.
- **Ecosystem (civic-tech, OpenStates, public defenders)**: each
  scraper file is a clean per-state class following OpenStates'
  published pattern. Open-source-publishable; raises the floor for
  every defendant-tools project that follows. Cascade-positive vs.
  spartypkp's premature-abstraction failure.
- **Future-us**: per-state scraper class + StatuteRowSchema port
  from VA (shared Zod contract) + weekly refresh cron is the same
  shape as FL/VA/OH. The fifth, sixth, and Nth state become
  mechanical ports of T1-T4, not architecture decisions. Compounds
  the bootstrap rate of state coverage.
- **Adjacent players (other state-coverage products)**: floor rises;
  fewer defendants get "verify with your attorney" boilerplate from
  any tool. Durable cascade — competitors copying the pattern is fine,
  the moat is the curation + refresh cadence, not the scraper.

## DEPLOY SCOPE (read before writing any code)

Per `CLAUDE.md` "⚠ DEPLOY SCOPE" rule (post-2026-04-28 cutover),
`imnotanattorney.com` deploys from
`C:\Users\email\projects\ImNotAnAttorney\apps\web\`, NOT from this
`-web` repo. T1-T5 scraper code, route handlers, lib modules, and
test files MUST land in:

- `C:\Users\email\projects\ImNotAnAttorney\apps\web\scripts\ingest\seed-statutes-<state>.mjs`
- `C:\Users\email\projects\ImNotAnAttorney\apps\web\scripts\ingest\lib\<state>-html.mjs`
- `C:\Users\email\projects\ImNotAnAttorney\apps\web\scripts\ingest\lib\statute-shared.mjs`
- `C:\Users\email\projects\ImNotAnAttorney\apps\web\scripts\ingest\__tests__\...`
- `C:\Users\email\projects\ImNotAnAttorney\apps\web\src\app\api\cron\statutes-refresh-<state>\route.ts`

Coverage docs (under `docs/ingest/coverage/`) and plan/handoff
markdown stay in this `-web` repo. Cross-repo writes require the
`port-triage` marker first
(`node ~/.claude/hooks/lib/port-triage-log.js TRIAGED ...`).

Pre-T5 verification step: confirm the Vercel project still links to
the monorepo before registering any cron-job.org job:

    curl https://api.vercel.com/v9/projects/prj_zqxNgG9xcM235bnKRoEgP5kBOEEr \
      -H "Authorization: Bearer $VERCEL_TOKEN" | jq '{link, rootDirectory}'

`link.repo` must be the monorepo. If it's `-web`, escalate; do NOT
register cron jobs that point at routes which won't ship.

## Schema column reference (do not drift)

The `entities_statutes` table (live on `jxjbjmgdukwkoclydqdr`,
verified via `apps/web/supabase/migrations/20260423e_entities_statutes_schema.sql`)
has these columns. Plan SQL and seed scripts MUST use these exact
names; legacy doc references to `chapter` or `statute_text` are
WRONG and have been corrected throughout this plan:

| Column | Type | Notes |
|---|---|---|
| `canonical_id` | UUID PK | gen_random_uuid() default |
| `jurisdiction` | TEXT NOT NULL | two-letter uppercase per state |
| `title` | TEXT | **chapter codes go here** (e.g. NC `'14'`, AZ `'13-11'`, WA `'9A.32'`, OH `'2903'`) |
| `section` | TEXT NOT NULL | section number (e.g. NC `'20-138.1'`) |
| `subsection` | TEXT | optional sub-section |
| `effective_date` | DATE | ISO date |
| `section_text` | TEXT | **statute body text — NOT `statute_text`** |
| `is_current` | BOOLEAN | default true |
| `source_urls` | TEXT[] NOT NULL | primary at `source_urls[1]` (Postgres 1-indexed); empty array = unverified, do not cite |
| `text_hash` | TEXT | SHA-256 of `section_text` |
| `scraped_at` | TIMESTAMPTZ | last scrape |
| `wikidata_qid` | TEXT | partial-unique |

Unique index: `(jurisdiction, title, section, subsection, effective_date)`.

## Numbered Tasks

Each task uses the per-state scraper class pattern. T0 is a one-shot
research pass that gates T1-T4 (no scraping until T0 completes). T1-T4
are independent in code (different files, different hosts) and can be
parallelized across sessions; recommended order is the demand
ranking (NC > AZ > WA > OH-extended). T5 wires up refresh cadence
once any of T1-T4 ships.

### T0 — Per-state source research + chapter coverage matrix
- **Description**: WebFetch each state's official code root +
  robots.txt; identify the canonical HTTPS host; enumerate the
  chapter / article / title structure; pick the criminal chapters
  most aligned with INAA charge taxonomy (homicide/assault, theft,
  drug, weapons, traffic-DUI, sex offenses, fraud). Document
  rate-limit posture (robots.txt + observed cadence). **Content-Type
  verification gate**: WebFetch one example section URL per state
  and confirm the response `Content-Type` header contains
  `text/html`; if any state returns `application/pdf` only (no HTML
  alternative), that state is deferred and the worry pauses for plan
  amendment (no scraping until the plan re-converges with a PDF
  parser strategy or an HTML alternative is found). Record the
  observed Content-Type verbatim in each state's coverage doc on a
  line `Content-Type verified: text/html`. Record one blessed
  `*-coverage.md` matrix per state under
  `docs/ingest/coverage/<state>-statutes-coverage.md` with: host,
  robots.txt excerpt, observed crawl-delay, chapter URL pattern,
  section URL pattern, list of chapters in scope, list of chapters
  explicitly out of scope, example section HTML shape (for parser
  planning), Content-Type verified line.
- **Files touched**:
  - `docs/ingest/coverage/nc-statutes-coverage.md` (new)
  - `docs/ingest/coverage/az-statutes-coverage.md` (new)
  - `docs/ingest/coverage/wa-statutes-coverage.md` (new)
  - `docs/ingest/coverage/oh-statutes-coverage.md` (new — extension
    delta vs. existing 6 chapters)
- **Expected output rows**: 0 (research only).
- **Acceptance test**: each `<state>-statutes-coverage.md` exists,
  cites a HTTPS-only `https://*.gov` host, names ≥6 chapters in
  scope per state (≥4 for OH-extended delta), includes
  robots.txt-derived rate ceiling, includes one example section URL
  for the parser to anchor against. Reviewer can WebFetch any cited
  URL and get a 200 with statute text in the body.

### T1 — NC scraper (`apps/web/scripts/ingest/seed-statutes-nc.mjs` + `lib/nc-html.mjs`)
- **Description**: Port `apps/web/scripts/ingest/seed-statutes-va.mjs`
  to NC using the port-vs-extract pattern: per-state scraper class
  with pluggable parser. Shared schema + retry + circuit-breaker
  logic stays in `apps/web/scripts/ingest/lib/statute-shared.mjs`
  (extract once during T1 if not already present); state-specific
  parsing lives in `lib/nc-html.mjs`. No copy-paste between state
  seed scripts — state-specific code is parser + chapter map only.
  **Bulk-insert pattern (cl-bulk-data-defensive #18)**: T1 seed
  script MUST import `createBulkClient, bulkCopyRows` from
  `apps/web/scripts/lib/pg-bulk-defaults.mjs` and use COPY
  FROM STDIN. Per-row INSERT inside loops is BANNED. The hook
  `enforce-bulk-insert-pattern.js` will block writes that violate
  this. Same requirement applies to T2/T3/T4 seed scripts.
  **Live-source-first (gotcha-self-generated-fixture-passes-buggy-parser)**:
  before the parser is implemented, T1 author runs
  `curl -s 'https://www.ncleg.gov/EnactedLegislation/Statutes/HTML/BySection/Chapter_14/...'`
  and saves ≥3 representative section pages to
  `__tests__/fixtures/nc/` from LIVE captures (not agent-reconstructed
  HTML). Parser is then written against live fixtures; SC-8b
  re-fetches a 5-section live sample to confirm parser still works
  against current HTML. Source: NC
  General Statutes via the official Legislature site (T0 records
  exact host — likely `www.ncleg.gov` / `ncleg.gov`). Per-state
  scraper class: `seedNC()` orchestrator, `lib/nc-html.mjs` parser
  (`extractSectionNumbers`, `parseSectionPage`, `isSectionNotFound`,
  `stripHtml`). StatuteRowSchema port from VA (shared Zod contract)
  specialized to NC (`jurisdiction: z.literal('NC')`, **host-pin Zod
  refine**: refine parses each `source_urls[i]` via `new URL(u)` and
  asserts `url.hostname.toLowerCase()` is in the exact-match Set
  `new Set(['www.ncleg.gov','ncleg.gov'])` — regex-based pinning is
  BANNED because dot-as-wildcard + missing boundary anchors permit
  subdomain-bypass; `section_text: z.string().min(50)` to reject
  empty bodies and trivial parser failures). **Fetch
  contract**: `redirect: 'manual'` on every fetch; only HTTP 200 is
  accepted; 3xx/4xx/5xx are logged and skipped. **The scraper MUST
  NOT auto-follow 3xx Location headers**, and any URL discovered by
  parsing chapter-index pages OR by reading a `Location` header MUST
  be re-validated through the same host-pin Set check before
  re-fetching (no SSRF surface; defends against redirect-injection +
  HTML poisoning). **Dry-run contract**: implements `--dry-run`
  flag that runs StatuteRowSchema validation against the existing DB
  sample (or current fetch sample) and emits a single JSON line on
  stdout: `{state:'NC', validated:N, zodFailures:M, ...}`. The
  `zodFailures` integer field is mandatory. Coverage: Chapter 14
  (Criminal Law) + Chapter 20 Articles 2A, 3, and 8 (DWI + traffic
  offenses + driver license offenses) + Chapter 90 Article 5
  (Controlled Substances) at minimum; T0 finalizes exact article
  list.
- **Files touched** (alphabetized):
  - `apps/web/scripts/ingest/__tests__/entity-whitelist-nc.test.mjs` (new)
  - `apps/web/scripts/ingest/__tests__/fixtures/nc/*.html` (new — captured live, NOT reconstructed)
  - `apps/web/scripts/ingest/__tests__/lib/nc-html.test.mjs` (new)
  - `apps/web/scripts/ingest/__tests__/seed-statutes-nc.test.mjs` (new)
  - `apps/web/scripts/ingest/lib/nc-html.mjs` (new)
  - `apps/web/scripts/ingest/lib/statute-shared.mjs` (new — shared Zod schema + retry + circuit-breaker, mirroring the in-file copy currently in FL/VA seeds. Per Round-2 code-reviewer SUGGESTION, FL/VA refactor to import from this shared lib is DEFERRED to a follow-up cleanup PR — T1 only writes the shared module; it does not touch FL or VA seed code in this phase. Acceptable trade-off: keeps T1 PR scope clean; the "shared" claim is forward-looking.)
  - `apps/web/scripts/ingest/seed-statutes-nc.mjs` (new)
- **Expected output rows**: ≥200 (target ≥250) NC statute rows
  written to `entities_statutes` with `jurisdiction='NC'`.
- **Acceptance test**:
  1. `node scripts/ingest/seed-statutes-nc.mjs --dry-run --limit=5`
     emits ≥10 rows JSONL preview, every row passes Zod, every
     `source_urls[0]` is HTTPS on the host T0 selected.
  2. Test file ≥10 unit tests pass (`npm run test --
     scripts/ingest/__tests__/seed-statutes-nc.test.mjs`).
  3. Full run writes ≥200 rows; pre-commit verify SQL reports
     `missing_sources=0`, `empty_body=0`.
  4. Anti-hallucination audit (per
     `pattern-anti-hallucination-audit-query.md`) on
     `WHERE jurisdiction='NC'` returns `null_src=0`,
     `non_https_src=0`, `null_text_hash=0`.

### T2 — AZ scraper (`scripts/ingest/seed-statutes-az.mjs` + `lib/az-html.mjs`)
- **Description**: Port T1 shape to AZ using the port-vs-extract
  pattern: AZ-specific parser in `lib/az-html.mjs`, all shared
  schema + retry + circuit-breaker logic stays in
  `scripts/ingest/lib/statute-shared.mjs`. No copy-paste between
  state seed scripts. Source: Arizona Revised Statutes via
  `www.azleg.gov` (host pinned by T0). Coverage: Title 13 (Criminal
  Code) chapters 11/12/14/15/18/19/23/31/34 + Title 28 Chapter 4
  (DUI) at minimum (per T0 docs/ingest/coverage/az-statutes-coverage.md;
  T0 found AZ's criminal drug code lives at Title 13 Chapter 34, NOT
  Title 36 Chapter 27.1 — Title 36 covers regulatory/scheduling, not
  criminal charges).
  **Crawl-delay constraint (T0 finding)**: AZ's robots.txt declares
  `Crawl-delay: 120` (verbatim, 2-minute polite delay). Sequential
  ingest budget: ~1500 sections × 120s = ~50 hours. T2 ingest runs
  as a multi-night background job (engine-repo worker, NOT Vercel
  serverless function — Vercel Pro 15min/900s timeout is incompatible
  with single-pass AZ ingest). T2 author registers the AZ seed as an
  engine worker job (mirrors existing engine cron infra in
  ImNotAnAttorney-engine), reports completion via Telegram digest.
  **Engine-worker auth surface (round-1 SEC-CRIT addition)**: the AZ
  scraper, when invoked by the engine cron poller, MUST validate the
  same `CRON_AUTH_TOKEN` env var the engine uses for its other
  long-lived workers. Validation happens at process start, not only
  at HTTP boundary (defends against intra-host invocation that bypasses
  ingress auth). The engine entry point is registered at
  `C:\Users\email\projects\ImNotAnAttorney-engine\workers\statutes-az.mjs`
  (engine cron registry pattern; T2 author follows the existing
  worker-registration shape). **Log volume bound**: AZ scraper logs
  per fetch event are size-bounded — log only
  `{section_id, status_code, ms, hash_changed, error?}` (≤256 bytes),
  NEVER the statute body or raw HTTP response (50h × ~1500 sections
  × multi-KB body = log-storage DoS surface).
  StatuteRowSchema port from VA (shared Zod contract) specialized to
  AZ (`jurisdiction: z.literal('AZ')`, **host-pin Zod refine**:
  the refine parses each `source_urls[i]` via `new URL(u)` and
  asserts `url.hostname.toLowerCase()` is in the exact-match Set
  `new Set(['www.azleg.gov'])` — regex-based pinning is BANNED
  because dot-as-wildcard + missing boundary anchors permit
  subdomain-bypass (e.g., `https://www.azleg.gov.attacker.com/`);
  `section_text: z.string().min(50)`). **Section-URL enumeration**:
  comes from chapter pages on `https://www.azleg.gov/arsDetail/?title=<N>`,
  NOT the HTTP sitemap (`http://www.azleg.gov/robotsitemap.xml`).
  HTTPS-only is a hard rule; the HTTP sitemap is forbidden as a
  discovery source even though robots.txt declares it.
  **Fetch contract**: `redirect: 'manual'` on every fetch; only HTTP
  200 accepted; 3xx/4xx/5xx logged + skipped. The scraper MUST NOT
  auto-follow 3xx Location headers; URLs discovered via Location
  re-validate through the host-pin Set before re-fetching.
  **Dry-run contract**:
  implements `--dry-run` flag that runs StatuteRowSchema validation
  on the existing DB sample (or current fetch sample) and emits a
  single JSON line on stdout: `{state:'AZ', validated:N,
  zodFailures:M, ...}`. The `zodFailures` integer field is
  mandatory.
- **Files touched** (alphabetized):
  - `apps/web/scripts/ingest/__tests__/entity-whitelist-az.test.mjs` (new)
  - `apps/web/scripts/ingest/__tests__/fixtures/az/*.html` (new — captured live)
  - `apps/web/scripts/ingest/__tests__/lib/az-html.test.mjs` (new)
  - `apps/web/scripts/ingest/__tests__/seed-statutes-az.test.mjs` (new)
  - `apps/web/scripts/ingest/lib/az-html.mjs` (new)
  - `apps/web/scripts/ingest/seed-statutes-az.mjs` (new)
  - `ImNotAnAttorney-engine/workers/statutes-az.mjs` (new — engine entry point invoked by engine cron poller). **Cross-repo write — port-triage REQUIRED before first Edit/Write** (Round-2 code-reviewer SUGGESTION): T2 author MUST log a TRIAGED marker citing source project + the existing engine cron registry shape via `node ~/.claude/hooks/lib/port-triage-log.js TRIAGED ImNotAnAttorney-engine "<engine-cron-registry-files-verified>" "<shape-summary>"` BEFORE the first cross-repo write, otherwise the `enforce-port-triage` hook blocks the action.
- **Expected output rows**: ≥200 (target ≥300) AZ statute rows.
- **Acceptance test**: same 4-step shape as T1, scoped to
  `jurisdiction='AZ'`, host-pinned to the azleg.gov host T0
  selected.

### T3 — WA scraper (`scripts/ingest/seed-statutes-wa.mjs` + `lib/wa-html.mjs`)
- **Description**: Port T1 shape to WA using the port-vs-extract
  pattern: WA-specific parser in `lib/wa-html.mjs`, shared schema +
  retry + circuit-breaker logic stays in
  `scripts/ingest/lib/statute-shared.mjs`. No copy-paste between
  state seed scripts. Source: Revised Code of Washington via
  `app.leg.wa.gov` (host pinned by T0). Coverage: Title 9 (Crimes
  and Punishments) + Title 9A (Washington Criminal Code) + Title 46
  Chapter 61 (Rules of the Road incl. DUI) + Title 69 Chapter 50
  (Uniform Controlled Substances Act) at minimum; T0 finalizes.
  StatuteRowSchema port from VA (shared Zod contract) specialized
  to WA (`jurisdiction: z.literal('WA')`, **host-pin Zod refine**:
  refine parses each `source_urls[i]` via `new URL(u)` and asserts
  `url.hostname.toLowerCase()` is in the exact-match Set
  `new Set(['app.leg.wa.gov'])` — regex-based pinning is BANNED
  per AZ rationale; `section_text: z.string().min(50)`).
  **Scheme rewrite (WA-specific)**: chapter-index links surface as
  `http://` and need `https://` for fetch. Rewrite is permitted
  ONLY when `new URL(u).hostname === 'app.leg.wa.gov'` (post-parse
  exact match); ALL other `http://` URLs are rejected outright
  (no "rewrite-and-fetch" for foreign hosts; defends against TOCTOU
  smuggling of `http://app.leg.wa.gov.evil.com/...`).
  **Fetch contract**: `redirect: 'manual'` on every fetch; only HTTP
  200 accepted; 3xx/4xx/5xx logged + skipped. The scraper MUST NOT
  auto-follow 3xx Location headers; URLs discovered via Location
  re-validate through the host-pin Set before re-fetching.
  **Dry-run contract**:
  implements `--dry-run` flag that runs StatuteRowSchema validation
  on the existing DB sample (or current fetch sample) and emits a
  single JSON line on stdout: `{state:'WA', validated:N,
  zodFailures:M, ...}`. The `zodFailures` integer field is
  mandatory.
- **Files touched** (alphabetized):
  - `apps/web/scripts/ingest/__tests__/entity-whitelist-wa.test.mjs` (new)
  - `apps/web/scripts/ingest/__tests__/fixtures/wa/*.html` (new — captured live)
  - `apps/web/scripts/ingest/__tests__/lib/wa-html.test.mjs` (new)
  - `apps/web/scripts/ingest/__tests__/seed-statutes-wa.test.mjs` (new)
  - `apps/web/scripts/ingest/lib/wa-html.mjs` (new)
  - `apps/web/scripts/ingest/seed-statutes-wa.mjs` (new)
- **Expected output rows**: ≥200 (target ≥300) WA statute rows.
- **Acceptance test**: same 4-step shape as T1, scoped to
  `jurisdiction='WA'`, host-pinned to the app.leg.wa.gov host
  T0 selected.

### T4 — OH-extended (extend `seed-statutes-oh.mjs` chapter map)
- **Description**: Extend `OH_CHAPTERS` in
  `apps/web/scripts/ingest/seed-statutes-oh.mjs` (apps/web per
  DEPLOY SCOPE) from the current 6 chapters
  (2903/2911/2913/2923/2925/4511) to the full set T0 + round-1
  picks (target ≥14 chapters covering homicide-derivatives,
  kidnapping/extortion (Ch 2905), sex offenses, arson/vandalism,
  OVI subset of 4511 currently uncovered (formerly OMVI; renamed
  by Ohio in 2005), family offenses, public-order, driver license
  suspension offenses (Ch 4510)). Reuse existing `lib/oh-html.mjs` parser;
  no new file unless OH redesigns a section template. Per
  port-vs-extract pattern: shared schema + retry + circuit-breaker
  stays in `scripts/ingest/lib/statute-shared.mjs`; OH-specific
  parsing stays in `lib/oh-html.mjs`. Add tests for the new
  chapters' fixtures. StatuteRowSchema (shared Zod contract) for OH:
  `jurisdiction: z.literal('OH')`, **host-pin Zod refine**:
  refine parses each `source_urls[i]` via `new URL(u)` and asserts
  `url.hostname.toLowerCase()` is in the exact-match Set
  `new Set(['codes.ohio.gov'])` — regex-based pinning is BANNED;
  `section_text: z.string().min(50)`. **Fetch contract (T4 carve-out
  per Round-2 code-reviewer CRIT)**: T4 INHERITS the existing OH seed's
  `redirect: 'follow'` posture in `fetchWithRetry` because that seed
  has shipped 247 rows successfully against `codes.ohio.gov`; flipping
  to `'manual'` is a behavior change not in T4 scope. The host-pin Set
  check + 200-only acceptance still apply — Location-header
  re-validation is moot under `'follow'` because the fetch returns the
  final response, but the URL stored as `source_urls[1]` MUST be the
  ORIGINAL request URL (not the post-redirect final URL) so the row's
  source pointer matches the canonical `codes.ohio.gov` host. T1-T3
  (NC/AZ/WA, all net-new) keep `redirect: 'manual'` per their fetch
  contracts. **Dry-run contract**:
  implements `--dry-run` flag that runs StatuteRowSchema validation
  on the existing DB sample (or current fetch sample) and emits a
  single JSON line on stdout: `{state:'OH', validated:N,
  zodFailures:M, ...}`. The `zodFailures` integer field is
  mandatory. **Atomicity (DELETE+COPY in tx — REUSE existing OH
  wrapper per Round-2 code-reviewer WARN)**: The live OH seed at
  `apps/web/scripts/ingest/seed-statutes-oh.mjs` already wraps
  DELETE + bulkCopyRows + verify-counts in BEGIN/COMMIT/ROLLBACK
  with try/catch (lines ~313-339), and crucially uses a SCOPED
  DELETE: `DELETE FROM entities_statutes WHERE jurisdiction='OH'
  AND title = ANY($1::text[])` where `$1` is the array of chapter
  codes being seeded in this run. T4 MUST preserve this scoped
  pattern; a blanket `WHERE jurisdiction='OH'` would destroy rows
  from chapters not in the current seed run. T4's only OH seed-file
  delta: extend `OH_CHAPTERS` map. The existing wrapper handles
  atomicity; no rewrap needed. T4 author verifies by reading
  lines ~313-339 + the existing helper at
  `apps/web/scripts/lib/pg-bulk-defaults.mjs` to confirm
  `bulkCopyRows` accepts an in-tx client and does NOT internally
  `BEGIN`/`COMMIT`. Crash mid-run rolls back to prior state. No
  partial OH state ever visible to readers; the prior 247-row OH
  state remains intact until the new ≥500-row state is fully
  committed.
  **Verified `bulkCopyRows` is BEGIN/COMMIT-free** (Round-3
  code-reviewer SUGG inline-cite): live helper at
  `apps/web/scripts/lib/pg-bulk-defaults.mjs:216-236` —
  ```
  export async function bulkCopyRows(client, table, columns, rowsIterable) {
    const colList = columns.map((c) => `"${c}"`).join(', ');
    const copySql = `COPY ${table} (${colList}) FROM STDIN WITH (FORMAT CSV, NULL '\\N')`;
    const started = Date.now();
    const pgStream = client.query(copyFrom(copySql));
    async function* encode() { /* ... */ }
    await pipeline(Readable.from(encode(), { objectMode: false }), pgStream);
    return { rowCount: pgStream.rowCount ?? null, durationMs: Date.now() - started };
  }
  ```
  Zero internal `BEGIN`/`COMMIT`/`ROLLBACK` — safe to call inside a
  caller-managed transaction. Plan claim verified.
- **Files touched** (alphabetized):
  - `apps/web/scripts/ingest/__tests__/entity-whitelist-oh.test.mjs` (new)
  - `apps/web/scripts/ingest/__tests__/fixtures/oh/*.html` (add fixtures for new chapters — captured live)
  - `apps/web/scripts/ingest/__tests__/seed-statutes-oh.test.mjs` (extend)
  - `apps/web/scripts/ingest/seed-statutes-oh.mjs` (modify `OH_CHAPTERS` map; wrap DELETE+COPY in BEGIN/COMMIT)
- **Expected output rows**: ≥500 OH rows total (current 247 → target
  ≥500 after extension). Net add ≥250.
- **Acceptance test**: same audit shape — `jurisdiction='OH'` row
  count ≥500, `null_src=0`, `non_https_src=0`,
  `null_text_hash=0`. All existing OH tests still pass; ≥4 new tests
  added for new chapters' fixtures pass.

### T5 — Weekly refresh cron registration (mirror FL pattern)
- **Description**: Register weekly hash-diff refresh crons on
  cron-job.org for **NC, WA, OH** (Vercel-hosted). **AZ refresh is
  deferred from T5** because AZ's 120s/section robots.txt crawl-delay
  (T0 finding) makes a single-pass refresh ≈50 hours, incompatible
  with Vercel Pro's 900s function timeout. AZ refresh re-routes to
  ImNotAnAttorney-engine workers as a Phase 3 follow-up worry; AZ's
  T2 one-time seed remains in this phase. **T5 step 0**: verify which
  `/api/cron/statutes-refresh-<state>` routes already exist via
  `gh search code` / file existence check; NC/WA are known net-new
  routes; OH may be net-new (verify before implementing). FL pattern
  (PR #120) and USC pattern (PR #117) are referenced as **templates
  only** — those routes are NOT extended or modified by T5; new
  routes are written following their shape. Endpoint pattern:
  `/api/cron/statutes-refresh-<state>`.
  **Hash-diff contract**: Refresh route fetches each section URL,
  computes SHA256(`section_text`), compares to stored `text_hash`; if
  different → UPDATE row's `section_text` + `text_hash` +
  `updated_at`; if same → skip. **Idempotency**: a back-to-back
  replay of the same fetch within seconds returns `updated:0` on the
  second run (because hashes already match). Run summary returns
  `{status:'ok', checked:N, updated:M, skipped:N-M}` on HTTP 200
  with `Content-Type: application/json`. Auth: every route requires
  `Authorization: Bearer $CRON_AUTH_TOKEN`; missing/invalid → HTTP
  401. **Schedule (staggered across days to avoid Vercel + DB
  collision)**: NC Mon 17:00 UTC, WA Wed 17:00 UTC, OH Thu 17:00 UTC.
  (FL Mon 16:00-16:50 UTC and USC Mon 15:00 UTC remain in their
  existing slots; this stagger keeps Mon's legislature load to
  FL+USC+NC, spreads WA/OH across Wed-Thu. AZ refresh is OUT of T5
  scope — no slot reservation on cron-job.org; the engine-worker
  cadence will be set wherever the engine cron registry lives, in
  Phase 3.)
- **Files touched**:
  - `apps/web/src/app/api/cron/statutes-refresh-nc/route.ts` (new — apps/web per DEPLOY SCOPE)
  - `apps/web/src/app/api/cron/statutes-refresh-wa/route.ts` (new — apps/web per DEPLOY SCOPE)
  - `apps/web/src/app/api/cron/statutes-refresh-oh/route.ts` (new or extend — apps/web per DEPLOY SCOPE)
  - **NO `statutes-refresh-az/route.ts` route** — AZ is engine-worker scope per Phase 3.
  - cron-job.org job registrations (3 new — NC, WA, OH only) via API per global
    `CLAUDE.md` rule (no GitHub Actions cron). HTTPS-only registration; jq filter
    `.jobs[].url | startswith("https://")` must return true for all 3.
- **Expected output rows**: 0 directly; refresh updates rows when
  `text_hash` differs.
- **Acceptance test**:
  1. `cron-job.org` `GET /jobs` lists 4 new entries with the
     expected URLs and schedules.
  2. First scheduled run for each returns HTTP 200 with body
     `{"status":"ok","checked":N,"updated":M,...}` where
     `checked >= seeded row count for that state`.
  3. `cron_run_log` (or equivalent) shows the run logged with no
     errors.

## Out of Scope

- **50-state scaling / state-agnostic abstraction.** Premature
  abstraction is what killed spartypkp's project per OpenStates
  cascade notes. Each scraper stays per-state until ≥6 states have
  shipped via the same shape — only then refactor common code into
  shared lib.
- **Non-criminal statutes.** No Texas Occupations Code, no civil
  procedure rules, no administrative code. Criminal-relevant
  chapters only (those that can show up as a charge in an INAA
  intake).
- **Full code coverage of any state.** We pick the criminal
  chapters most aligned with the INAA charge taxonomy. Full
  Title 18.2 of VA, full Title 13 of AZ, etc. are explicitly out
  — coverage targets are floors, not ceilings, but we don't promise
  exhaustive code coverage.
- **Case law for these states.** Phase 2 is statutes-only.
  CourtListener-driven case law for NC/AZ/WA already flows into
  `case_law_references` via existing pipeline; we don't touch it.
- **Cornell LII as primary.** LII is fallback only; if T0 finds an
  official state source unreachable, the state is deferred — we do
  NOT silently substitute LII as primary.
- **Texas, GA, MI, IL, NJ, MA, etc.** Phase 2 is the 4-state cohort
  only. Phase 3 (next worry-to-pristine pass) handles next demand
  cohort.
- **Statute interpretation, annotations, or commentary.** We
  ingest statute text + section header only. No legislative history,
  no AG opinions, no model jury instructions.
- **PDF source documents.** All four states publish authoritative
  HTML; we do not parse PDF, even if it's "official" — PDF parsing
  has its own gotcha class out of scope here. T0's Content-Type
  verification step is the gate that confirms HTML availability per
  state; if any state fails the gate, that state defers to a future
  worry that explicitly scopes a PDF strategy.
- **Public OSS publication.** Open-source publication of the
  per-state scrapers is deferred until Phase 3 ships (≥6 states
  total). Repo target + license + contributor docs are out of scope
  here; the scrapers in this phase remain in-repo only.
- **`CRON_AUTH_TOKEN` rotation cadence + per-route token isolation**
  (round-1 SEC-SUGGESTION + Round-2 security WARN). Adding 3 Vercel
  routes + 1 engine surface increases the blast radius of a single
  token compromise. Quarterly rotation OR migration to per-route
  tokens is deferred to a Phase 3 follow-up worry; this phase reuses
  the existing single `CRON_AUTH_TOKEN`. **Pristine-or-nothing
  enforcement at T5 merge**: a Phase 3 worry FILE must exist at
  `docs/plans/2026-05-XX-worry-cron-auth-token-rotation.md` (verifiable
  via `test -f`) BEFORE T5 PR is merged; T5 reviewer rejects the PR
  if the file is missing. Prevents the deferral becoming a silent
  drop.

## Success Criteria

Every criterion is binary PASS/FAIL by an independent reader running
SQL or shell commands. No criterion permits judgment, ranking, or
prose interpretation. "Lenient spec-critic = no spec-critic" — this
section is the contract.

### BLOCKED-UNTIL-T0 placeholders — RESOLVED 2026-04-30

T0 ran 2026-04-30 and produced four coverage docs at
`docs/ingest/coverage/{nc,az,wa,oh}-statutes-coverage.md`. The
following placeholders have been mechanically substituted with the
concrete values from those docs:

- **SC-9** — chapter-code allowlist per state — RESOLVED
- **SC-12a/b** — hostname allowlist per state — RESOLVED
- **SC-15** — charge-code fixtures + state citation regexes — RESOLVED
- **SC-17** — charge-slug + state-code mapping — RESOLVED

T0 also surfaced two structural findings that triggered plan
amendments (see "T0 Resolution" appendix at bottom of plan):
1. AZ's robots.txt declares `Crawl-delay: 120` → AZ refresh deferred
   from T5 weekly Vercel cron to Phase 3 engine-worker infra.
2. AZ's criminal drug code lives at Title 13 Chapter 34, not
   Title 36 Chapter 27.1 → T2 description corrected.

### Criteria

- **SC-1** — `SELECT count(*) FROM entities_statutes WHERE
  jurisdiction='NC'` returns ≥200.
- **SC-2** — `SELECT count(*) FROM entities_statutes WHERE
  jurisdiction='AZ'` returns ≥200.
- **SC-3** — `SELECT count(*) FROM entities_statutes WHERE
  jurisdiction='WA'` returns ≥200.
- **SC-4** — single CTE atomic snapshot:
  `WITH oh AS (SELECT title FROM entities_statutes WHERE jurisdiction='OH')
   SELECT (SELECT count(*) FROM oh) AS rows,
          (SELECT count(DISTINCT title) FROM oh) AS distinct_titles;`
  returns `rows >= 500` AND `distinct_titles` equals the size of the
  SC-9 OH allowlist (currently 14: `2903`, `2905`, `2907`, `2909`,
  `2911`, `2913`, `2917`, `2919`, `2921`, `2923`, `2925`, `2929`,
  `4510`, `4511`). The threshold tracks SC-9 by reference, NOT
  hardcoded; any future amendment to SC-9 OH allowlist MUST update
  this SC simultaneously to avoid drift. Reads `title` (the chapter
  code lives in the `title` column per Schema column reference;
  there is no `chapter` column).
- **SC-5** — for each state in {NC, AZ, WA, OH}: `SELECT count(*)
  FROM entities_statutes WHERE jurisdiction=$1 AND (array_length
  (source_urls,1) IS NULL OR source_urls='{}')` returns 0
  (HTTPS source URL present rate = 100%).
- **SC-6** — for each state: `SELECT count(*) FROM
  entities_statutes WHERE jurisdiction=$1 AND NOT
  (source_urls[1] LIKE 'https://%')` returns 0 (HTTPS-rate = 100%
  on primary URL).
- **SC-7** — for each state: `SELECT count(*) FROM
  entities_statutes WHERE jurisdiction=$1 AND (text_hash IS NULL
  OR text_hash !~ '^[a-f0-9]{64}$' OR text_hash =
  'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')`
  returns 0. Final clause rejects the SHA256 of the empty string,
  which would otherwise pass the regex while indicating a parser
  failure (empty body). Combined with StatuteRowSchema's
  `section_text: z.string().min(50)` constraint at the seed-script
  layer, this gives belt-and-suspenders coverage against silent
  empty-body persistence.
- **SC-8** — for each `<state>` in {nc, az, wa, oh}, running
  `node scripts/ingest/seed-statutes-<state>.mjs --dry-run --limit=200`
  exits 0 AND its stdout contains the literal substring
  `"zodFailures":0`. The `--dry-run` flag must read the existing DB
  rows (or re-fetch a 200-row sample) and validate each against the
  shared `StatuteRowSchema` exported from
  `scripts/ingest/lib/statute-shared.mjs` (specialized per state via
  `jurisdiction: z.literal('<STATE>')` + host-pin refine), emitting a
  JSON summary line with the `zodFailures` integer field on stdout.
- **SC-8b** — live-source-first gate (round-1 code-reviewer finding;
  defends against `gotcha-self-generated-fixture-passes-buggy-parser`):
  for each `<state>` in {nc, az, wa, oh}, running
  `node apps/web/scripts/ingest/seed-statutes-<state>.mjs --dry-run --fetch=live --limit=5`
  exits 0 AND stdout contains `"zodFailures":0`. **`--fetch=live`
  contract** (Round-2 code-reviewer WARN tightening):
  - Bypasses cached fixtures; performs the full chapter-index
    discovery pass against the state's official host using the same
    fetch logic the production seed uses.
  - `--limit=5` here means **5 sections total** (NOT 5-per-chapter
    — different from existing FL/OH `--limit` semantics; this flag
    is live-mode-specific).
  - The 5 sections are sampled randomly from the discovered set
    using a deterministic seed derived from the current UTC date
    (`crypto.createHash('sha256').update(new Date().toISOString().slice(0,10)).digest()`)
    so re-runs same-day pick the same 5; allows reproducibility
    without per-run flakiness.
  - Emits same JSONL preview shape as `--dry-run`, including the
    mandatory `zodFailures` integer field.
  Ensures the parser works against current live HTML, not just
  agent-written fixtures. T1-T4 acceptance is gated on this AS WELL
  AS SC-8 (cached fixtures alone are not sufficient evidence).
- **SC-9** — for each state in {NC, AZ, WA, OH}: `SELECT count(*) FROM
  entities_statutes WHERE jurisdiction=$1 AND title NOT IN
  (<chapter codes>)` returns 0. The `title` column stores the chapter
  code (per Schema column reference; there is no `chapter` column).
  T0-resolved chapter allowlists per state, with round-1 OpenStates
  additions folded in (literal `title` column values the seed scripts
  must use):
  - NC: `('14','15A','20','50B','74C','74E','90')` — 7 codes
  - AZ: `('13-11','13-12','13-14','13-15','13-17','13-18','13-19','13-20','13-23','13-31','13-34','28-4')` — 12 codes (added Ch 17 Arson + Ch 20 Forgery per round-1)
  - WA: `('9.41','9A.32','9A.36','9A.40','9A.42','9A.44','9A.46','9A.52','9A.56','9A.60','46.61','69.50')` — 12 codes (added 9A.42 Mistreatment + 9A.46 Stalking/Harassment per round-1)
  - OH: `('2903','2905','2907','2909','2911','2913','2917','2919','2921','2923','2925','2929','4510','4511')` — 14 codes (added Ch 2905 Kidnapping + Ch 4510 DUS per round-1)
  T1-T4 seed scripts MUST populate the `title` column with values
  from this exact set; rows whose `title` falls outside the
  jurisdiction's allowlist FAIL this criterion.
- **SC-10** — `SELECT count(*) FROM entities_statutes WHERE
  jurisdiction IN ('NC','AZ','WA','OH') AND (source_urls IS NULL
  OR source_urls='{}' OR source_urls[1] NOT LIKE 'https://%' OR
  text_hash IS NULL OR section_text IS NULL OR section_text='')`
  returns 0.
- **SC-11** — all four commands exit 0:
  1. `npm run test -- scripts/ingest/__tests__/seed-statutes-nc.test.mjs
     scripts/ingest/__tests__/lib/nc-html.test.mjs` — total ≥10
     passing tests.
  2. `npm run test -- scripts/ingest/__tests__/seed-statutes-az.test.mjs
     scripts/ingest/__tests__/lib/az-html.test.mjs` — total ≥10
     passing tests.
  3. `npm run test -- scripts/ingest/__tests__/seed-statutes-wa.test.mjs
     scripts/ingest/__tests__/lib/wa-html.test.mjs` — total ≥10
     passing tests.
  4. `npm run test -- scripts/ingest/__tests__/seed-statutes-oh.test.mjs`
     — passes with passing-test count ≥ (existing pre-T4 count + 4).
     The pre-T4 count is recorded in the T4 task journal at
     `docs/ingest/journal/oh-extended-test-baseline.txt` before any
     T4 edits land; grading reads that file to compute the threshold.
- **SC-12a** — T0-resolved hostname allowlist per state (literal
  hostname strings the seed scripts must produce in `source_urls[1]`):
  - NC: `('www.ncleg.gov','ncleg.gov')` (both forms serve identical
    content per T0; scraper config uses `www.ncleg.gov` as preferred
    form)
  - AZ: `('www.azleg.gov')`
  - WA: `('app.leg.wa.gov')`
  - OH: `('codes.ohio.gov')`
- **SC-12b** — for each state in {NC, AZ, WA, OH}:
  `SELECT count(*) FROM entities_statutes WHERE jurisdiction=$1
  AND split_part(replace(replace(source_urls[1],'https://',''),
  'http://',''),'/',1)
  NOT IN (<hostnames from SC-12a>)` returns 0. Uses the exact
  hostname tuples listed under SC-12a per state.
- **SC-13** — `curl -s -H "Authorization: Bearer $CRONJOB_API_KEY"
  https://api.cron-job.org/jobs | jq` returns JSON whose `jobs[]`
  array contains AT LEAST 3 entries (an AZ Phase-3 entry may co-exist
  but does not fail this criterion) with `url` strings ending in
  `/api/cron/statutes-refresh-nc`, `/api/cron/statutes-refresh-wa`,
  and `/api/cron/statutes-refresh-oh` (one each). Each of these 3
  matched entries has `enabled: true` AND
  `(.url | startswith("https://"))` returns true (HTTPS-only
  registration; rejects cleartext-leg cron URLs that would expose
  Bearer tokens before Vercel's TLS terminator). Schedule fields
  match the staggered cadence: NC = Monday 17:00 UTC, WA = Wednesday
  17:00 UTC, OH = Thursday 17:00 UTC (verify via
  `jq '.jobs[] | {url, schedule}'`). AZ refresh is registered
  separately on the engine-worker side per Phase 3 (no cron-job.org
  reservation in this phase).
- **SC-14** — for each `<state>` in {nc, wa, oh} and the matching
  `<jobId>` registered in SC-13: running
  `curl -s -X POST -H "Authorization: Bearer $CRONJOB_API_KEY"
  https://api.cron-job.org/jobs/<jobId>/run`
  triggers a manual run, AND within 5 minutes (300 seconds; covers
  cold-start + serial fetch loops over hundreds of sections)
  `curl -s -H "Authorization: Bearer $CRONJOB_API_KEY"
  https://api.cron-job.org/jobs/<jobId>/history | jq '.history[0]'`
  returns an object with `status: 0` (cron-job.org success code), AND
  the route endpoint
  `https://imnotanattorney.com/api/cron/statutes-refresh-<state>`
  responded HTTP 200 with a JSON body containing the literal
  substrings `"status":"ok"` and `"checked":` followed by an integer
  ≥ the row count for that jurisdiction
  (`SELECT count(*) FROM entities_statutes WHERE jurisdiction=$1`).
- **SC-14b** — idempotency replay (round-1 SEC-SUGG + Round-2
  refinement on race window + first-run framing): for each `<state>`
  in {nc, wa, oh} and the matching `<jobId>`, run the same
  `curl -X POST .../run` command **sequentially — second invocation
  issued only AFTER the first returns HTTP 200** (NOT in parallel;
  cron-job.org's own retry-on-503 + operator-collision races would
  otherwise give a false-fail). The second run's route response
  body MUST contain `"updated":0` regardless of the first run's
  value, because hashes match between consecutive replays
  (post-seed `text_hash` already correct per SC-7; the first
  refresh-cron run typically returns `updated:0` already if source
  HTML is unchanged). Defends against replay-amplification on a
  leaked cron URL + token. Implementation note: refresh route's
  UPDATE clause should be `UPDATE ... WHERE text_hash != $newhash`
  so even concurrent runs converge to `updated:0` on the loser.
- **SC-15** — for each `<state>` in {NC, AZ, WA, OH}, running
  `node scripts/test-ib-smoke.mjs --jurisdiction=<STATE>
  --charge=<CHARGE_CODE> --out=/tmp/ib-<state>.html`
  exits 0, AND the resulting `/tmp/ib-<state>.html` does NOT contain
  the literal strings `[VERIFY]` or `consult your attorney` (verified
  by `grep -i -c '\[VERIFY\]' /tmp/ib-<state>.html` returning 0 AND
  `grep -i -c 'consult your attorney' /tmp/ib-<state>.html`
  returning 0), AND the file contains ≥1 match for the
  state-citation regex (verified by
  `grep -E -c '<STATE_CITATION_REGEX>' /tmp/ib-<state>.html`
  returning ≥1).
  - `<CHARGE_CODE>` per state (T0-resolved):
    NC=`20-138.1`, AZ=`28-1381`, WA=`46.61.502`, OH=`2907.02`.
  - `<STATE_CITATION_REGEX>` per state (T0-resolved):
    - NC: `N\.C\.G\.S\. § (14|15A|20|50B|74[CE]|90)-[0-9]+(\.[0-9]+[A-Z]?)?`
    - AZ: `A\.R\.S\. § (13|28)-[0-9]+`
    - WA: `RCW\s+[0-9]+[A-Z]?\.[0-9]+\.[0-9]+` (broadened per
      round-1 OpenStates CRIT — `9A?\.` form would NOT match the
      smoke-test charge `RCW 46.61.502` because `46` is the title;
      broader form matches Title 9, 9A, 46, 69, plus future titles)
    - OH: `R\.C\.\s+[0-9]{4}\.[0-9]+`
- **SC-16** — for each `<state>` in {nc, az, wa, oh}:
  `test -f docs/ingest/coverage/<state>-statutes-coverage.md` exits 0,
  AND `grep -E -c 'https://[^ ]*\.gov'
  docs/ingest/coverage/<state>-statutes-coverage.md` returns ≥1, AND
  for every URL `U` extracted by
  `grep -E -o 'https://[^ )"]*' docs/ingest/coverage/<state>-statutes-coverage.md
  | sort -u`,
  `curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$U"` returns
  `200`. The criterion fails if ANY URL in ANY of the 4 files returns
  non-200 or times out.
- **SC-17** — for each `<state>` in {NC, AZ, WA, OH}, running the
  entity-whitelist builder via the unit test
  `npm run test -- scripts/ingest/__tests__/entity-whitelist-<state>.test.mjs`
  exits 0, where the test calls
  `buildEntityWhitelist(supabaseUrl, supabaseKey, { charges:
  ['<STATE_CHARGE_SLUG>'], jurisdiction: '<STATE_CODE>' })` and
  asserts `result.validIds.size >= 1`. The test uses the live
  Supabase instance read-only (no writes; Leach pattern via
  `withTestTx` not required because no INSERT/UPDATE).
  - `<STATE_CHARGE_SLUG>` per state (T0-resolved):
    NC=`dwi`, AZ=`dui`, WA=`dui`, OH=`rape`.
  - `<STATE_CODE>` is the literal two-letter uppercase jurisdiction
    code (`NC`, `AZ`, `WA`, `OH`) — not blocked, embedded now.
  - The four test files
    `apps/web/scripts/ingest/__tests__/entity-whitelist-{nc,az,wa,oh}.test.mjs`
    are created as part of T1/T2/T3/T4 respectively (added to each
    task's "Files touched" list at task-execution time; this SC
    enforces the contract that they exist and pass).
  - **Test-isolation marker (Round-2 code-reviewer WARN + Round-3
    SUGG tightening)**: each of the four test files MUST include a
    line-start comment within the first 20 lines reading
    `// test-isolation-na: read-only Supabase query, no INSERT/UPDATE`
    (matches `enforce-test-isolation.js` placement convention:
    line-start, within first 20 lines, reason ≥15 chars). Documents
    the read-only guarantee in-source AND future-proofs against a
    migration of the hook scope to cover
    `apps/web/scripts/ingest/__tests__/`.
- **SC-18** — for each `<state>` in {nc, az, wa, oh}:
  `grep -E -c '^Content-Type verified: text/html$'
  docs/ingest/coverage/<state>-statutes-coverage.md` returns ≥1.
  Confirms T0's HTML Content-Type verification step landed in the
  coverage doc (binary grep, no judgment); a state that returned
  PDF-only fails this criterion and would have been deferred at T0.
- **SC-19** — for each state in {NC, AZ, WA, OH}: `SELECT count(*)
  FROM entities_statutes WHERE jurisdiction=$1 AND source_urls[1]
  LIKE '%law.cornell.edu%'` returns 0. Asserts no LII rows leaked
  past the official-source-only contract (LII is fallback-only per
  Out of Scope; if every row's primary source is Cornell LII, T1-T4
  bypassed the official-source rule).
- **SC-20** — for each `<state>` in {nc, wa, oh}:
  `curl -s -o /dev/null -w "%{http_code}"
  https://imnotanattorney.com/api/cron/statutes-refresh-<state>`
  returns `401` (no auth = denied), AND
  `curl -s -o /dev/null -w "%{http_code}" -H "Authorization:
  Bearer $CRON_AUTH_TOKEN"
  https://imnotanattorney.com/api/cron/statutes-refresh-<state>`
  returns `200`. Asserts the cron auth gate is wired on every
  state's Vercel refresh route. AZ excluded (no Vercel route).
- **SC-20-AZ** — for the AZ engine-worker entry point (round-1
  SEC-CRIT addition): the engine worker at
  `ImNotAnAttorney-engine/workers/statutes-az.mjs` MUST validate
  `process.env.CRON_AUTH_TOKEN` at process start; an unauthorized
  invocation (env var missing or wrong) MUST exit non-zero before
  any fetch fires. Verified by:
  `CRON_AUTH_TOKEN= node ImNotAnAttorney-engine/workers/statutes-az.mjs`
  exits non-zero AND prints a 401-equivalent error message; AND
  `CRON_AUTH_TOKEN=$CRON_AUTH_TOKEN node ImNotAnAttorney-engine/workers/statutes-az.mjs --dry-run`
  exits 0. Closes the auth-gap that SC-20 explicitly leaves open
  for AZ.
- **SC-21** — for each `<state>` in {NC, AZ, WA, OH}: running
  `node scripts/verify-seeded-urls.mjs --jurisdiction=<STATE>
  --sample=20` exits 0. The script picks 20 random
  `source_urls[1]` values from `entities_statutes WHERE
  jurisdiction=<STATE>` and `curl -s -o /dev/null -w "%{http_code}"
  --max-time 10 "$U"` each — if any returns non-200, the script
  exits non-zero. **Framing (Round-2 security INFO)**: 20-row
  sample is a SMOKE TEST, not a full integrity guarantee — at
  ~7-10% coverage per jurisdiction it would miss a single poisoned
  row ~90% of the time. Full integrity verification lives in the
  separate anti-hallucination audit pattern
  (`pattern-anti-hallucination-audit-query.md`) which scans every
  row. SC-21 is the per-PR liveness check; the audit pattern is
  the ongoing integrity defense.
- **SC-22** — for each `<state>` in {nc, az, wa, oh}:
  `grep -E -c '^Crawl-delay observed: [0-9]+(\.[0-9]+)? seconds$'
  docs/ingest/coverage/<state>-statutes-coverage.md` returns ≥1
  (the crawl-delay observation is recorded with units in the
  coverage doc), AND
  `grep -E -c '(await sleep\([0-9]+|setTimeout\([^,]*,\s*[0-9]+|RATE_MIN_MS|crawl_delay_ms|CRAWL_DELAY_MS)'
  apps/web/scripts/ingest/seed-statutes-<state>.mjs apps/web/scripts/ingest/lib/statute-shared.mjs`
  returns ≥1 (the seed script or shared lib enforces the observed
  crawl-delay via an explicit delay call — the regex matches any of
  the common delay-enforcement shapes). **AZ-specific (Round-2
  code-reviewer WARN)**: T2 AZ MUST declare
  `const CRAWL_DELAY_MS = 120_000;` (the literal `CRAWL_DELAY_MS`
  identifier) in either `seed-statutes-az.mjs` or the engine entry
  `ImNotAnAttorney-engine/workers/statutes-az.mjs` so the
  `CRAWL_DELAY_MS` regex branch hits — covers AZ's 120s/section
  contract from robots.txt verbatim. Asserts robots.txt
  compliance is observed AND enforced, not merely documented.
- **SC-23** — bulk-insert pattern enforcement (round-1 code-reviewer
  finding; cl-bulk-data-defensive #18 cite):
  `grep -E -c "(bulkCopyRows|bulkCopyCsv|pg-copy-streams)"
  apps/web/scripts/ingest/seed-statutes-{nc,az,wa,oh}.mjs`
  returns ≥1 per file. Per-row INSERT inside loops is BANNED
  (cl-bulk-data-defensive #18). T1-T4 seed scripts MUST import
  `createBulkClient, bulkCopyRows` from
  `apps/web/scripts/lib/pg-bulk-defaults.mjs` and use COPY
  FROM STDIN. The escape-hatch comment
  `// bulk-insert-justified: <reason>` is permitted only with a
  written justification ≥15 chars; T1-T4 do NOT need it.
- **SC-24** — host-pin Set check enforcement (round-1 SEC-CRIT-3
  finding): for each state, the seed script's URL validation MUST
  call `new URL(...)` and check `url.hostname` against an exact-match
  Set. Verified by `grep -E -c "new URL\(.*\)\.hostname"
  apps/web/scripts/ingest/seed-statutes-<state>.mjs` returns ≥1 for
  each `<state>` in {nc, az, wa, oh}. (Parser libs `lib/<state>-html.mjs`
  are excluded — by precedent (verified in `lib/oh-html.mjs`),
  URL parsing/host-pinning lives in the seed orchestrator, not the
  parser.) AND `grep -E -c "\^https://.*\)/?\$?"
  apps/web/scripts/ingest/seed-statutes-{nc,az,wa,oh}.mjs` returns 0
  (the regex-based host-pin pattern is BANNED — see Round-1 SEC-CRIT
  for subdomain-bypass mechanism).
- **SC-25** — AZ section-URL enumeration source check (round-1
  SEC-WARN; Round-2 code-reviewer SUGGESTION tightening to fetch-call
  context, so doc/comment references that DOCUMENT the ban don't
  false-fail):
  `grep -E -c "fetch\(['\"]?\s*['\"]?http://www\.azleg|fetch\(['\"]?\s*['\"]?[^)]*robotsitemap\.xml"
  apps/web/scripts/ingest/seed-statutes-az.mjs apps/web/scripts/ingest/lib/az-html.mjs`
  returns 0. Asserts no `fetch(...)` call in the AZ seed targets
  the HTTP sitemap or any HTTP-scheme `azleg` URL. Comments and
  documentation strings that mention the banned pattern (e.g., a
  block comment explaining "do not fetch http://www.azleg/...")
  pass the SC by design. AZ enumeration MUST come from
  `https://www.azleg.gov/arsDetail/?title=<N>` chapter pages.

## Round-0 Review Resolution

18 findings folded into plan from worry-statute-phase2-r0 team:
- OS-CRIT-1 → T0 + SC-18 (HTML Content-Type verification)
- OS-CRIT-2 → SC-7 + StatuteRowSchema z.string().min(50)
- OS-WARN-1 → T5 hash-diff contract spelled out
- OS-WARN-2 → T1-T4 port-vs-extract guardrail
- OS-WARN-3 → SC-19 (no LII rows leaked)
- OS-SUGG-1 → Out of Scope (publish deferred to Phase 3)
- OS-SUGG-2 → T1 NC Articles 2A+3+8
- SEC-CRIT-1 → T2-T4 host-pin Zod refine
- SEC-CRIT-2 → SC-20 (auth gate)
- SEC-WARN-1 → T1-T4 fetch redirect:manual
- SEC-WARN-2 → SC-21 (live URL 200-check)
- SEC-WARN-3 → SC-22 (robots.txt + crawl-delay)
- SEC-INFO-1 → T4 atomic BEGIN/COMMIT
- CR-CRIT-1 → see SEC-INFO-1
- CR-CRIT-2 → T1-T4 --dry-run + zodFailures contract
- CR-CRIT-3 → T5 FL/USC routes are templates, not extended
- CR-WARN-1 → SC-17 test files added to T1-T4 Files touched
- CR-WARN-2 → "StatuteRowSchema port from VA" rename
- CR-WARN-3 → SC-9a removed; SC-9b → SC-9
- CR-WARN-4 → T5 cron stagger across Mon-Thu
- CR-WARN-5 → SC-14 timeout 60s → 300s
- CR-SUGG-1/2/3 → numbering + alphabetization + whitespace

## T0 Resolution (2026-04-30)

T0 ran via 4 parallel Opus Explore agents (one per state).
Coverage docs landed at:
- `docs/ingest/coverage/nc-statutes-coverage.md`
- `docs/ingest/coverage/az-statutes-coverage.md`
- `docs/ingest/coverage/wa-statutes-coverage.md`
- `docs/ingest/coverage/oh-statutes-coverage.md`

All four states cleared the Content-Type verification gate
(`text/html` confirmed via WebFetch on at least one section URL per
state). No PDF-only deferrals.

### Mechanical placeholder substitutions (applied this session)

- SC-9 chapter allowlist (T0 substitution; Round-1 corrected the
  column from `chapter` → `title` and added 2 chapters to AZ/WA/OH
  each per OS-CRIT/OS-WARN findings — see Round-1 Resolution. T0
  values frozen here for audit trail; live values in SC-9 above):
  - NC: `('14','15A','20','50B','74C','74E','90')` — 7 codes (unchanged from T0)
  - AZ T0: `('13-11','13-12','13-14','13-15','13-18','13-19','13-23','13-31','13-34','28-4')` — 10 codes; Round-1 added Ch 17 + Ch 20 → 12
  - WA T0: `('9.41','9A.32','9A.36','9A.40','9A.44','9A.52','9A.56','9A.60','46.61','69.50')` — 10 codes; Round-1 added 9A.42 + 9A.46 → 12
  - OH T0: `('2903','2907','2909','2911','2913','2917','2919','2921','2923','2925','2929','4511')` — 12 codes; Round-1 added 2905 + 4510 → 14
- SC-12a/b hostname allowlist:
  - NC: `('www.ncleg.gov','ncleg.gov')`
  - AZ: `('www.azleg.gov')`
  - WA: `('app.leg.wa.gov')`
  - OH: `('codes.ohio.gov')`
- SC-15 charge codes / citation regexes:
  - NC: `20-138.1` / `N\.C\.G\.S\. § (14|15A|20|50B|74[CE]|90)-[0-9]+(\.[0-9]+[A-Z]?)?`
  - AZ: `28-1381` / `A\.R\.S\. § (13|28)-[0-9]+`
  - WA: `46.61.502` / `RCW\s+9A?\.[0-9]+\.[0-9]+`
  - OH: `2907.02` / `R\.C\.\s+[0-9]{4}\.[0-9]+`
- SC-17 charge slugs: NC=`dwi`, AZ=`dui`, WA=`dui`, OH=`rape`.

### Structural findings + plan amendments

- **T0-FINDING-1 (AZ crawl-delay)**: AZ robots.txt declares
  `Crawl-delay: 120` (verbatim). Single-pass AZ ingest budget is
  ~50 hours (≈1500 sections × 120s). Vercel Pro 900s function
  timeout makes AZ refresh-via-Vercel-cron infeasible.
  → **T2 description amended**: AZ seed runs as multi-night
  background job on engine-repo workers, NOT Vercel.
  → **T5 description amended**: AZ refresh deferred from T5 weekly
  Vercel-cron set; relocated to Phase 3 engine-worker infra.
  → **SC-13 amended**: cron-job.org `jobs[]` set drops from 4 to 3
  (NC + WA + OH), AZ slot Tue 17:00 UTC reserved-empty.
  → **SC-14 + SC-20 amended**: scope reduced to {nc, wa, oh}
  (AZ excluded — no Vercel refresh route exists).
- **T0-FINDING-2 (AZ drug-code location)**: AZ's criminal drug
  offenses live at Title 13 Chapter 34 (§13-3401+), NOT Title 36
  Chapter 27.1. The Title 36 chapters (Ch 25, Ch 27, Ch 28) cover
  regulatory/scheduling definitions, not criminal charges.
  → **T2 description amended**: coverage spec now reads "Title 13
  chapters 11/12/14/15/18/19/23/31/34 + Title 28 Chapter 4 (DUI)".
- **T0-FINDING-3 (WA robots.txt 404)**: app.leg.wa.gov publishes
  no robots.txt (404 at /robots.txt). Per RFC 9309, no policy
  declared = no restriction, but conservative 2.0s default applies.
  → No plan change; SC-22 already covers crawl-delay observation
  via the coverage doc.
- **T0-FINDING-4 (NC Cloudflare-fronted)**: NC ncleg.gov is
  Cloudflare-fronted with `cf-cache-status: DYNAMIC`. Every request
  hits origin. Existing 2.0s rate is fine; T1 author should back
  off to 5s on first 403/503.
  → No plan change; covered by SC-22 + standard retry/backoff in
  shared statute-shared.mjs (per port-vs-extract pattern).
- **T0-FINDING-5 (WA effective-date inline)**: WA publishes
  future-effective amendments inline (e.g., RCW 46.61.502 page
  shows "Effective until January 1, 2026"). T3 author captures
  the live-effective version + flags rollover candidates.
  → No plan change; T3 author handles within parser scope.

### Remaining BLOCKED-UNTIL-T0 items: 0

All four placeholder categories (SC-9, SC-12a/b, SC-15, SC-17)
resolved. Plan is fully gradeable post-T0. T1-T5 unblocked for
Phase 5 execution.

## Round-1 Review Resolution (2026-04-30)

Round-1 swarm dispatched 3 parallel Opus reviewers (openstates-team
domain expert, security-auditor, code-reviewer) on the T0-resolved
plan + 4 coverage docs. 32 findings total: 10 CRITICAL, 13 WARNING,
9 SUGGESTION. All folded into plan + coverage docs this session.

### CRITICAL findings → resolution

- **CR-CRIT-1** `chapter` column does not exist → SC-4 + SC-9
  rewritten against `title` column; new "Schema column reference"
  table added at top of plan citing live migration
  `apps/web/supabase/migrations/20260423e_entities_statutes_schema.sql`.
- **CR-CRIT-2** `statute_text` column does not exist → 8 occurrences
  globally renamed to `section_text` (T1 NC, T2 AZ, T3 WA, T4 OH,
  T5 hash-diff, SC-7 belt-and-suspenders comment, SC-10 predicate).
- **CR-CRIT-3** NC chapter-set drift (6 vs 7 across docs) → SC-9 NC
  list locked at 7 codes (`14,15A,20,50B,74C,74E,90`); coverage-doc
  count updated below.
- **CR-CRIT-4** self-generated-fixture trap not gated → new SC-8b
  (`--fetch=live --limit=5` against current HTML) + T1 description
  requires live-curl fixture capture before parser write.
- **SEC-CRIT-1** Strangler Fig DEPLOY SCOPE missing → new "DEPLOY
  SCOPE" clause at top; all T1-T5 Files-touched paths retargeted to
  `apps/web/...`; T5 strikes the AZ Vercel route.
- **SEC-CRIT-2** AZ engine-worker auth surface undefined → T2 names
  `ImNotAnAttorney-engine/workers/statutes-az.mjs` entry point +
  CRON_AUTH_TOKEN process-start validation; new SC-20-AZ.
- **SEC-CRIT-3** Host-pin regex permits subdomain bypass → all four
  states' Zod refines rewritten to use `new URL().hostname` against
  exact-match Set; new SC-24 grep-blocks the regex pattern.
- **OS-CRIT-1** WA citation regex doesn't match smoke-test charge →
  SC-15 WA regex broadened to `RCW\s+[0-9]+[A-Z]?\.[0-9]+\.[0-9]+`.
- **OS-CRIT-2** OH Ch 2905 (Kidnapping/Extortion) missing → added
  to SC-9 OH allowlist (14 codes) + coverage doc + SC-4 distinct
  threshold raised 12→14.
- **OS-CRIT-3** AZ Title 13 Ch 17 (Arson) missing → added to SC-9
  AZ allowlist (12 codes) + coverage doc.

### WARNING findings → resolution

- **CR-WARN-1** AZ scope leak in T5 Files-touched → AZ route struck.
- **CR-WARN-2** SC-13 brittle "exactly 3" → softened to "AT LEAST 3
  matching {nc,wa,oh}" so a future Phase-3 AZ entry doesn't fail.
- **CR-WARN-3** NC SC-9/SC-15 chapter-set mismatch (17C) → SC-9 NC
  set frozen; coverage-doc regex corrected to drop 17C +
  bracket-class bug fixed (see OS-WARN-5).
- **CR-WARN-4** Per-row INSERT enforcement not cited → T1 desc adds
  cl-bulk-data-defensive #18 cite + new SC-23 grep-enforces
  `bulkCopyRows` import.
- **CR-WARN-5** T4 atomicity claim untested → T4 desc tightened
  with concrete in-tx pattern + read-helper-first verification step.
- **SEC-WARN-1** redirect:manual Location chasing not asserted →
  T1-T4 fetch contract: scraper MUST NOT auto-follow Location;
  re-validation through host-pin Set required.
- **SEC-WARN-2** WA http→https rewrite TOCTOU → T3 desc: rewrite
  permitted ONLY when post-parse hostname === `app.leg.wa.gov`;
  foreign `http://` URLs rejected outright.
- **SEC-WARN-3** AZ HTTP sitemap not explicit-banned → T2 desc +
  new SC-25 grep-blocks `robotsitemap.xml` and `http://www.azleg`.
- **SEC-WARN-4** SC-13/14 not asserting HTTPS-only → SC-13 adds
  `(.url | startswith("https://"))` jq check.
- **SEC-WARN-5** AZ log volume unbounded → T2 desc: per-fetch logs
  capped at ~256 bytes, body never logged.
- **OS-WARN-1** AZ Ch 20 (Forgery) missing → added to SC-9 AZ.
- **OS-WARN-2** OH Ch 4510 (DUS) missing → added to SC-9 OH.
- **OS-WARN-3** WA 9A.46 (Stalking/Harassment) missing → added.
- **OS-WARN-4** WA 9A.42 (Mistreatment) missing → added.
- **OS-WARN-5** NC coverage-doc regex bracket-class bug `1[45A]`
  → fixed in coverage doc this session (see coverage edits).
- **OS-WARN-6** OH Ch 2929 sentencing-philosophy inconsistency →
  kept OH 2929 + added rationale: 2929 is the penalty-resolution
  cross-reference, included for citation completeness; NC/AZ/WA
  exclude their sentencing chapters because penalty schedules in
  those states embed inline. Single-state philosophy difference
  documented; future states added to cohort follow per-state
  legislative-style rule, not blanket "always include sentencing."

### SUGGESTION findings → resolution

- **CR-SUGG-1** SC-4 two-query atomic snapshot → folded into single
  CTE.
- **CR-SUGG-2** SC-22 sleep-pattern regex over-narrow → broadened
  to `(await sleep|setTimeout|RATE_MIN_MS|crawl_delay_ms|CRAWL_DELAY_MS)`.
- **CR-SUGG-3** Content-Type verification partial → accepted; T0
  partial state (NC + OH live-verified, AZ + WA reconstructed)
  documented in plan, not silently claimed-clean.
- **SEC-SUGG-1** Cron idempotency replay test → new SC-14b.
- **SEC-SUGG-2** CRON_AUTH_TOKEN rotation → moved to Out of Scope
  with explicit Phase-3 follow-up requirement.
- **OS-SUGG-1** OMVI→OVI terminology → T4 desc updated.
- **OS-SUGG-2** AZ HTML markup unverified note → preserved in
  coverage doc; T2 author probes live HTML before parser write
  (covered by SC-8b live-fetch gate).
- **OS-SUGG-3** WA 9.68A explicit deferral → coverage doc now
  documents the deliberate scope limitation rather than claiming
  9A.44 overlap.
- **OS-SUGG-4** AZ Tue cron slot reservation ambiguity → reservation
  dropped from cron-job.org; AZ engine-cron registry handled in
  Phase 3 only.

### Remaining open: 0

All 32 Round-1 findings folded. Re-run swarm-review (Round-2) to
confirm pristine; if pristine, proceed to T1.

## Round-2 Review Resolution (2026-04-30)

Round-2 swarm dispatched 3 parallel Opus reviewers. Result:
- **OpenStates**: PRISTINE (no findings; R1 chapter additions integrated cleanly)
- **Security-auditor**: 2 WARN + 1 INFO (deferred-token-rotation discipline, SC-14b race window, SC-21 framing)
- **Code-reviewer**: 3 CRIT + 6 WARN + 3 SUGG (helper-import path, OH redirect contract drift, SC-24 grep cardinality, plus 9 secondary)

15 findings total. All folded this session.

### CRITICAL findings → resolution

- **R2-CR-CRIT-1** wrong helper-import path (`scripts/ingest/lib/`
  not `scripts/lib/`) → global path replace; `pg-bulk-defaults.mjs`
  now correctly cited at `apps/web/scripts/lib/pg-bulk-defaults.mjs`
  matching live precedent across 80+ existing seed scripts.
  `statute-shared.mjs` stays at `apps/web/scripts/ingest/lib/`
  (co-located with parser libs).
- **R2-CR-CRIT-2** OH `redirect:'follow'` baseline preserved
  → T4 fetch-contract carve-out: OH inherits existing `'follow'`
  (live seed has shipped 247 rows successfully); T1-T3 NC/AZ/WA
  net-new states keep `'manual'`. Host-pin Set check + 200-only
  acceptance still apply to OH; `source_urls[1]` MUST store the
  ORIGINAL request URL (canonical `codes.ohio.gov`), not the
  post-redirect final URL.
- **R2-CR-CRIT-3** SC-24 grep cardinality → simplified to
  `seed-statutes-<state>.mjs` only (parser libs dropped); per-state
  ≥1 count is now unambiguous.

### WARNING findings → resolution

- **R2-SEC-WARN-1** Phase-3 token-rotation deferral discipline →
  Out-of-Scope clause now requires `docs/plans/2026-05-XX-worry-cron-auth-token-rotation.md`
  to exist (verifiable via `test -f`) BEFORE T5 PR merges.
- **R2-SEC-WARN-2** SC-14b race window → SC-14b reworded to require
  sequential issuance (second `/run` POST issued only AFTER first
  returns HTTP 200); refresh-route UPDATE clause specified to use
  `WHERE text_hash != $newhash` for concurrent-run convergence.
- **R2-CR-WARN-1** SC-8b `--fetch=live` underspecified → contract
  tightened: `--limit=5` means 5 sections total (not per-chapter);
  random sample seeded by current UTC date hash for same-day
  reproducibility; emits same JSONL preview as `--dry-run`.
- **R2-CR-WARN-2** SC-14/SC-14b first-run framing → SC-14b reworded
  to "regardless of first run's value" (post-seed `text_hash` already
  correct per SC-7).
- **R2-CR-WARN-3** SC-22 regex AZ identifier fragility → T2 AZ MUST
  declare `const CRAWL_DELAY_MS = 120_000;` so the regex's
  `CRAWL_DELAY_MS` branch hits.
- **R2-CR-WARN-4** SC-4 hardcoded 14 distinct_titles → tied to "size
  of SC-9 OH allowlist" by reference; future amendments to SC-9 OH
  must update SC-4 simultaneously.
- **R2-CR-WARN-5** SC-17 test-isolation marker missing → T1-T4 test
  files MUST include `// test-isolation-na: read-only Supabase
  query, no INSERT/UPDATE` top-of-file marker.
- **R2-CR-WARN-6** T4 DELETE blanket vs. scoped → T4 description
  rewritten to REUSE existing OH wrapper at lines ~313-339 of the
  live seed (scoped DELETE on `jurisdiction='OH' AND title=ANY($1)`,
  not blanket); only delta is `OH_CHAPTERS` map extension.

### SUGGESTION findings → resolution

- **R2-SEC-INFO-1** SC-21 sample-rate framing → reframed as smoke
  test (not full integrity guarantee); full integrity verification
  lives in `pattern-anti-hallucination-audit-query.md`.
- **R2-CR-SUGG-1** T1 statute-shared extraction semantics →
  reworded: T1 writes the shared module mirroring FL/VA in-file
  copies; FL/VA refactor to import from shared module DEFERRED to
  follow-up cleanup PR. Trade-off documented.
- **R2-CR-SUGG-2** SC-25 grep false-positive → tightened to
  fetch-call context regex
  (`fetch\(['"]?\s*['"]?http://www\.azleg|...robotsitemap\.xml`)
  so doc-comments documenting the ban don't false-fail.
- **R2-CR-SUGG-3** T2 engine port-triage prep → Files-touched line
  for `ImNotAnAttorney-engine/workers/statutes-az.mjs` now requires
  TRIAGED marker via `port-triage-log.js TRIAGED` BEFORE first
  cross-repo write.

### Remaining open: 0

All 15 Round-2 findings folded. Plan + 4 coverage docs are
internally consistent, schema-aligned, security-tight, and
deploy-scope-correct. Recommended next: Round-3 swarm-review to
confirm pristine; if pristine, proceed to T1.

## Round-3 Review Resolution (2026-04-30)

Round-3 swarm dispatched 3 parallel Opus reviewers. Result:
- **OpenStates**: PRISTINE (no findings; R2 amendments don't introduce chapter/citation gaps)
- **Security-auditor**: PRISTINE (R2 fixes close the surface concretely; no new auth/SSRF/injection surfaces)
- **Code-reviewer**: 0 CRIT, 0 WARN, 3 SUGG (all marked optional/informational; R2 fixes verified accurate against live FL/OH seeds + helper)

3 SUGGs total, all optional. 2 actionable, 1 explicitly "no fix needed" by reviewer.

### SUGGESTION findings → resolution

- **R3-CR-SUGG-1** Inline-cite `bulkCopyRows` lines 216-236 in T4
  description (defensive re-confirmation that helper is BEGIN/COMMIT-
  free) → folded inline at T4 description with verbatim helper body.
- **R3-CR-SUGG-2** SC-22 regex over-coverage on literal-numeric branch
  → reviewer explicitly "no fix needed; predicate is correct, just
  informational." Acknowledged; no action.
- **R3-CR-SUGG-3** SC-17 marker placement convention → tightened to
  "line-start within first 20 lines" matching `enforce-test-isolation.js`
  placement requirement.

### Remaining open: 0

All 50 findings folded across R1+R2+R3 (32+15+3). Convergence
trajectory: 32 → 15 → 3 → expected 0 in next round. Plan is
pristine across all 3 review lenses (OpenStates, Security, Code).

**T1 unblocked. Next session executes T1 (NC scraper) per Phase 5
execution plan.**

### R1+R2+R3 Verified-Clean Summary

- Schema columns aligned: `title` (chapter codes), `section_text`
  (statute body) — no `chapter` or `statute_text` references remain.
- Chapter-set counts: NC=7, AZ=12, WA=12, OH=14 — match across SC-9
  + coverage docs + SC-15 citation regexes + SC-12a hostname allowlists.
- Citation regexes match smoke-test charges per state.
- Host-pin via `new URL().hostname` exact-match Set; regex pinning
  hook-blocked via SC-24.
- Fetch contracts: `redirect:'manual'` for net-new states (NC/AZ/WA);
  OH inherits `'follow'` carve-out with `source_urls[1]`-as-original-URL
  invariant preserved.
- Helper-import paths correct: `apps/web/scripts/lib/pg-bulk-defaults.mjs`
  for bulk; `apps/web/scripts/ingest/lib/<state>-html.mjs` for parsers.
- Cross-repo writes (T2 AZ engine entry) gated by `port-triage` marker.
- Phase-3 token-rotation worry FILE existence required at T5 merge.
- Anti-hallucination audit pattern referenced as full-coverage integrity
  defense; SC-21 reframed as smoke test.
