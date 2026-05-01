# Worry: Data Orphans + Product-Promise Gaps

**Date:** 2026-04-29
**Slug:** data-orphans-product-gaps
**Status:** Phase 4 — narrowed (path 2) + R1 fixes applied + apps/web cutover-retarget applied; plan accepted as good-enough at round 1 (per path-2 ship-velocity priority); ready for Phase 5 execution.
**Audit source:** `C:\Users\email\projects\ImNotAnAttorney-web\.claude\agent-memory\Explore\data-product-wiring-audit-2026-04-29.md` (audit ran in -web; conclusions transfer to apps/web — both trees have identical 3 production reads on `judge_prosecutor_pairings` and identical reads on `officer_reliability` at same line numbers).
**Codebase verification pass (2026-04-29):** grep + Read across `src/` and `supabase/functions/` corrected several audit claims — see Appendix A.
**Cutover retarget (2026-04-29, post-R1):** Plan paths re-targeted from `ImNotAnAttorney-web/src/...` to `ImNotAnAttorney/apps/web/src/...` per Strangler Fig pattern (Sam Newman + Martin Fowler — new code goes ONLY to deploy-active tree; -web has been read-only-for-deploys since 2026-04-28 cutover per CLAUDE.md + `gotcha-vercel-project-cutover-silent-abandon.md`). Verified all cited symbols exist in `apps/web/src/` at same line numbers (single drift: `requireAdmin` -web:46 → apps/web:54). Most plan refs use relative `src/lib/...` paths — portable across trees; executor runs from `C:\Users\email\projects\ImNotAnAttorney\apps\web\` so relative resolution is correct.
**Execution repo:** `C:\Users\email\projects\ImNotAnAttorney\` (monorepo). All Phase 5 file-creation lands at `apps/web/src/...`. Branch off `origin/master` of monorepo, NOT -web. Plan + findings + rounds + handoff continue to live in `ImNotAnAttorney-web/docs/plans/` (authoring + swarm-review history). One source of truth for planning; one execution target for code.
**Scope decision (2026-04-29):** Path 2 chosen — T1 (War Room pairing matrix) + T2 (X-Ray officer slice) only. T3–T11 deferred to follow-up worry `worry-data-orphans-tier-b-c`. Reason: highest-leverage refund-risk closes ($4,997 + $2,497) ship first; Tier B + C are upside with no outstanding refund exposure.

## Worry

> "We have products that aren't taking advantage of the data we have."

The audit identified three failure modes. After a code-pass verification this session, the **shape of the worry is correct but the inventory needed correction** — several "orphans" already have render paths; several "promise gaps" are partially wired. This plan addresses the two highest-priority promise gaps with active refund risk.

### Kept scope — Marketing-promise gaps (REFUND RISK)

- **War Room ($4,997)** — `product-tiers.md:17` promises "judge×prosecutor pairing matrix." `judge_prosecutor_pairings` IS read in 3 production sites:
  - `src/lib/defense-intelligence/query.ts:399` — district-level prosecution patterns (no prosecutor names) for `queryDistrictCourtIntel`
  - `src/lib/tier9-reports/query.ts:797` — per-judge prosecutor pairings for `queryJudgeReportCard` ($197 SKU)
  - `src/lib/tier9-reports/coverage.ts:100` — coverage gate
  - **HOWEVER:** no War Room renderer surfaces a *matrix* (judge × prosecutor cross-tab). The Judge Report Card surfaces per-judge pairings; the District Intel surfaces aggregate prosecution patterns. The marketed "pairing matrix" tier-distinct War Room artifact does not exist. Refund risk = real.
- **X-Ray ($2,497)** — `product-tiers.md:16` says "X-Ray adds: sentencing outlier flags, officer reliability cross-case." `officer_reliability` is reachable via `queryOfficerBackground` but X-Ray's report builder does not call it through an X-Ray-specific richer slice. Cannibalization risk: $97 buyer gets the same shape as $2,497 buyer.

## Expert Lens

**Primary: April Dunford — `~/.claude/experts/april-dunford.md`** (cached 2026-04-09, ttl 21 days, fresh).

WHY: INAA-web is a multi-product company (7 paid tiers + Tier 9 standalones + free tools). *Obviously Awesome* 2nd ed. (Feb 2026) added explicit multi-product positioning guidance. Apply the **5-Component Positioning Canvas** to each affected tier:

**War Room ($4,997) canvas reframe (driver: judge×prosecutor pairing matrix gap):**
1. **Competitive Alternatives:** hire a private investigator + read appellate briefs by hand, or buy a one-shot Judge Report Card ($197) and stop there.
2. **Unique Attributes:** judge×prosecutor pairing aggregation across thousands of motions; appellate-trend overlay per pairing; cross-case officer reliability that the Officer BG Check doesn't expose.
3. **Value & Proof:** a *named, repeatable artifact* the buyer didn't have before — the matrix, with source URLs and sample sizes per cell.
4. **Target Customer Characteristics:** defendants/families who already bought IB or X-Ray and are reading their dossier weekly; the "operator-level" buyer.
5. **Market Category:** "ongoing intelligence operation" (current). Reinforce by shipping the matrix as the canonical War-Room-only artifact. Per finding C7, War Room's JTBD is push-delivery — defendant-visible portal PLUS weekly digest, not operator-only.

**X-Ray ($2,497) canvas reframe (driver: tier-distinct officer slice):**
- Component 2 add: cross-case officer reliability *with co-officer pattern detection* — the same officer appears in N cases, M of which were challenged. (Officer BG Check $97 today already shows reliability_score + brady_history; X-Ray must add the cross-case dimension.)

**Officer BG Check ($97) canvas:**
- No Component 2 add. The product is correctly positioned on "discreditation history." Per finding C10, the tier-distinct design DOES NOT downgrade — single-officer X-Ray path renders a degraded-waiting frame (see fix K).

**Secondary: Alex Hormozi — `~/.claude/experts/alex-hormozi.md`** (cached 2026-04-09, fresh).

WHY: each wire-up must pass the value equation `Value = (Dream Outcome × Perceived Likelihood) / (Time Delay × Effort & Sacrifice)`. Wire-ups raise numerator without raising denominator (already-ingested data = zero Time Delay add).

**Tiered-pricing test (Hormozi: each tier should ~double revenue of the one below):**
- Officer BG Check $97 vs X-Ray $2,497 = 25.7× spread. Today both can land on the same `officer_reliability` slice. **Cannibalization risk = REAL.**
- **Tier-distinct design (commitment, T2 below):** Officer BG Check renders **single-officer summary** (one named officer, full history, brady, complaint count) — that IS the product. X-Ray renders **multi-officer cross-case matrix** (every officer in this case's discovery, cross-correlated, co-officer pattern flagging) — a fundamentally different shape, not "more rows." This passes Hormozi's tier-distinct test.

**No Rahim approval required** — both experts cached, fresh, profiles read this session.

## Cascade

| Node | Specific win (T1 + T2 scope only) |
|---|---|
| Us (INAA) | Close 1 real refund risk (War Room matrix $4,997), fix tier-distinct cannibalization ($2,497 vs $97) |
| Direct counterparty (paid buyers) | War Room buyers get the actual cross-tab matrix as a defendant-visible deliverable + weekly digest; X-Ray buyers get a richer multi-officer surface than the $97 Officer BG |
| Their downstream (defendants + their attorneys) | Sharper case strategy: judge×prosecutor history informs defense motion sequencing; multi-officer cross-case history informs credibility challenges |
| Ecosystem (legal-tech category) | Category floor rises — products that actually deliver promised data, not vapor features |
| Future-us | Coverage test (T12, narrowed) makes pairing-matrix + officer-cross-case drift fail loud on next ingest. T3–T11 deferred to follow-up worry — no loss, just sequenced. |
| Adjacent (legal-tech competitors) | Pressure to wire-or-cut promised features. Industry-positive. |

No node loses. Cascade-positive.

## Numbered Tasks

> Each task carries: target file path, exact insertion point, expected SQL/query shape, expected render output, gradeability handle. File:line references verified by Read or Grep this session.

### Preconditions (must complete before T1 + T2)

#### **T0. Schema confirmation pass (expanded per fix L).**

**Why:** Column shapes for `judge_prosecutor_pairings`, `officer_reliability`, `judge_profiles`, and temporal-column presence on `judge_prosecutor_pairings` need pg_class confirmation before wire-up code is written. One bad column name = one broken render path = silent miss. `judge_profiles` columns are required for the T1 judge-name resolver. `judge_prosecutor_pairings.created_at` (or equivalent) is required for the T1 weekly digest delta computation — if absent, T1 spec must include a precondition migration to add it.

**Target file (NEW):** `scripts/diag-data-orphans-schema.mjs` — queries `information_schema.columns` for each of (`judge_prosecutor_pairings`, `officer_reliability`, `judge_profiles`). Output saved to `data/audit/data-orphans-schema-2026-04-29.json`. Format: `[{table, columns:[{name,type}], row_count}]` — **NO `sample_row` field** (per finding S1: column metadata only; sensitive data must not be written to disk).

**Temporal-column check:** After producing the JSON, the script additionally logs a WARNING if `judge_prosecutor_pairings` has no column with a name matching `/(created|updated)_at/i`. If absent, T1 implementation must include a precondition migration: `ALTER TABLE judge_prosecutor_pairings ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()`. Without a temporal column, the weekly digest delta computation is uncomputable and the digest degrades to a plain notification.

**Gitignore:** add `data/audit/` to `.gitignore` if not already present (audit artifacts are not committed).

**Gradeability handle:** JSON file exists with entries for all three tables, each with non-empty `columns` array, no `sample_row` field. SC-5 verifies mechanically.

#### **T0.5. `escapeIlike` helper (required by T2, finding C2 — centralized, not parallel).**

**Why added:** Zero matches on `escapeIlike` across `src/`. T2's PostgREST `.or()` filter on officer names sourced from PDF discovery creates a SQL-injection-class injection vector without input escaping. R0 finding C2 (code-reviewer f-010 + security-auditor f-002) confirmed the gap. Existing inline copies at `src/lib/tier9-reports/query.ts:402` and 11 other sites are NOT migrated this round (out of scope — see Out of Scope §7). This task creates the canonical helper only.

**Target file (NEW):** `src/lib/util/escape-postgrest-filter.ts`

Exports:
- `escapeIlike(s: string): string` — escapes `%`, `_`, `\\` (the documented PostgREST `.ilike()` metacharacters).
- `escapeOrFilterValue(s: string): string` — additionally escapes `,`, `(`, `)`, `"` per PostgREST `.or()` filter syntax. Required when T2 picks the `.or()` filter pattern for multi-officer queries.

Single pure-function module, no Supabase dependency. Rationale: per `~/.claude/rules/atlas-identity.md` Steal-Before-Building / Extend-Before-Create — centralize before duplicating.

**Adversarial vitest (NEW):** `src/lib/util/__tests__/escape-postgrest-filter.test.ts` — covers:
- `O'Brien` (apostrophe — passthrough, not a PostgREST metachar)
- `John, Smith` (comma — escaped by `escapeOrFilterValue`, passthrough on `escapeIlike`)
- `(test)` (parens — escaped by `escapeOrFilterValue`, passthrough on `escapeIlike`)
- `100% officer` (percent — escaped by both)
- `back\\slash` (backslash — escaped by both)
- empty string returns empty string

**Gradeability handle:** `npx vitest run src/lib/util/__tests__/escape-postgrest-filter.test.ts` exits 0. SC-4.

#### **T0.7. `requireTier` helper (required by T1, finding C3 — uses `SERVICE_UPGRADE_PATH`, not `TIER_CORE`).**

**Why added:** `src/app/api/operator/cases/[id]/route.ts:15+21` (apps/web; -web was :20-22) uses `requireAdmin` (X-Admin-Password header) — admin-vs-not gating only. No tier-gating function exists. R0 finding C3 (code-reviewer f-004 + security-auditor f-004) confirmed the gap.

**`TIER_CORE` is the wrong source.** `TIER_CORE` is an object record mixing service tiers, playbook tiers, and Tier 9 standalones — there is no monotonic rank. The correct source is `SERVICE_UPGRADE_PATH` at `src/lib/tiers.ts:521` — the explicit 5-tier service ladder array: `["case-decoder", "intelligence-brief", "x-ray", "war-room", "situation-room"]`. Rank = `SERVICE_UPGRADE_PATH.indexOf(slug)`.

**Target file (NEW):** `src/lib/tier/require-tier.ts`

Exports `requireTier(caseRow: {tier: string}, minTierSlug: TierSlug): void`:
- Imports `SERVICE_UPGRADE_PATH` from `src/lib/tiers.ts` (existing export verified at `src/lib/tiers.ts:521`).
- Looks up `caseRow.tier` rank: `SERVICE_UPGRADE_PATH.indexOf(caseRow.tier)`.
- Looks up `minTierSlug` rank: `SERVICE_UPGRADE_PATH.indexOf(minTierSlug)`.
- If either rank is `-1` (slug not in service ladder — e.g., playbook slugs like `dui-playbook`, Tier 9 standalones like `judge-report-card`): THROW `TierInsufficientError` with message `"tier ${caseRow.tier} is not in service ladder"`. These SKUs cannot satisfy a service-ladder gate.
- If `caseRow.tier` rank < `minTierSlug` rank: THROW `TierInsufficientError` with message `"tier ${caseRow.tier} below required ${minTierSlug}"`.
- Otherwise: return void.

**Vitest (NEW):** `src/lib/tier/__tests__/require-tier.test.ts` — covers:
- `intelligence-brief` case + minTier `war-room` → throws `TierInsufficientError`
- `war-room` case + minTier `war-room` → returns void
- `situation-room` case + minTier `war-room` → returns void (situation-room is above war-room in SERVICE_UPGRADE_PATH)
- `dui-playbook` case + minTier `case-decoder` → throws "not in service ladder" (playbook not in SERVICE_UPGRADE_PATH)

**Gradeability handle:** `npx vitest run src/lib/tier/__tests__/require-tier.test.ts` exits 0. SC-2.

### Tier A — Marketing-promise gaps (HIGHEST priority, refund risk)

#### **T1. War Room: judge×prosecutor pairing MATRIX (cross-tab artifact).**

**Why a new artifact:** the current `judge_prosecutor_pairings` reads (`tier9-reports/query.ts:797`, `defense-intelligence/query.ts:399`) surface (a) one-judge × all-prosecutors and (b) all-judges aggregate. Neither produces the *matrix* (judge × prosecutor cells with grant_rate + sample_size + source_urls) that `product-tiers.md:17` advertises. Per finding C7 (april-dunford f-003 + f-012), War Room's JTBD is push-delivery to the defendant, not an operator-only portal surface.

**Target files (NEW):**
- `src/lib/war-room/pairing-matrix.ts` — query module (new directory, mirrors `xray-sections/` and `tier9-reports/` shape)
- `src/lib/war-room/render-pairing-matrix.tsx` — render component (React component rendering within existing portal page)
- `src/lib/war-room/weekly-digest.ts` — Resend delta-digest module

**Defendant portal surface:** The matrix renders as a **section inside the existing `src/app/my-case/[token]/page.tsx`** — NOT as a sub-route. Verified: `src/app/my-case/[token]/page.tsx` is a single consolidated portal with tier-conditional rendering. Adding a sub-route would fragment navigation. Implementation: extend the existing page with a tier-gated section `<WarRoomPairingMatrix>` rendered when `requireTier(caseRow, 'war-room')` passes. The component is imported conditionally; the route path is unchanged.

**No new operator page route this round.** `requireAdmin` at `src/lib/auth/guards.ts:54` (apps/web; was line 46 in -web pre-cutover) takes `NextRequest` — it works for API routes only, not page routes. Existing `/operator/cases/[id]/page.tsx` uses client-side `OperatorShell` with password prompt. Adding a new operator page route for the matrix requires a separate auth-pattern decision. Deferred — see Out of Scope §8.

**Rate limiting for `/my-case/*`:** T1 adds `/my-case/:path*` to the rate-limit middleware matcher in `src/middleware.ts`. Use the existing rate-limit-durable upstash pattern — implementation at `src/lib/rate-limit-durable/upstash.ts`; tests verified at `src/lib/rate-limit-durable/__tests__/upstash.test.ts` (cite as the implementation precedent). Per-IP + per-token rate limit (e.g., 30 reads / 5 min — confirm per-route defaults from the upstash implementation at execution time). Rationale: the new pairing-matrix section surfaces named-prosecutor grant rates; adding it to the portal raises the data-sensitivity stakes of this route.

**Tier gate:** `requireTier(c, 'war-room')` from T0.7 called in the portal page before rendering the matrix section. Renders nothing (graceful skip, not error page) if tier is below war-room.

**Query (`pairing-matrix.ts`):**
```typescript
// Pulls all pairings for the judges named in this case's jurisdiction
// (limited to judges this case actually touches; not state-wide)
supabase.from("judge_prosecutor_pairings")
  .select("judge_id, prosecutor_name, motion_type, grant_rate, sample_size, source_urls")
  .in("judge_id", caseJudgeIds)
  .not("source_urls", "is", null)
  .not("source_urls", "eq", "{}")
  .gte("sample_size", MINIMUM_SAMPLE_SIZE)  // reuse 5 from defense-intelligence
  .order("sample_size", { ascending: false });
```

**`source_urls` filter mandatory** (fix I): every row rendered must have `source_urls` populated. Render guard at row-level: `if (!row.source_urls?.length) continue`. Per `~/.claude/rules/no-hallucinated-legal-data.md` — no verification URL = row does not get surfaced.

**`caseJudgeIds` resolver (fix C):** `phase2_data.judge_name` is a SINGLE string, verified at `src/lib/intelligence-brief/variables.ts:57`: `interface Phase2Data { judge_name: string; ... }`. Resolver wraps `[phase2Data.judge_name]` as the single-element candidate array; iterates via `queryJudgeProfile` (existing function) and resolves to UUID. On resolution failure: skip-render fallback — render "pairing data unavailable" section, do NOT crash the page.

**Defendant-facing framing layer (fix G):** The render component adds, ABOVE the matrix table, 2–3 plain-language callouts mechanically generated from the matrix's lowest `grant_rate` cells. Each callout is ≤ 27 words (crisis-buyer 3 AM standard per `feedback-crisis-buyer-lens-mandatory.md`).

Example callout format: "Your judge grants suppression motions at 34% — below the district average of 51%."

UPL guardrail: callout language is INFORMATIONAL ("Your judge grants X at Y%"), NEVER directive ("file motion X"). Follows the UPL guardrail table from `atti-persona.md` — "here's what the data shows" side only. One-line UPL note in component header: `// UPL: callouts are informational only — no directives, no recommendations.`

**Render output (`render-pairing-matrix.tsx`):** Returns a React component consuming `{ matrix: Array<Array<Cell>>; footnotes: SourceUrl[] }`. 2-D table: rows = prosecutors observed, columns = motion types, cells = `${grant_rate}% (n=${sample_size})`. Below the matrix, per-cell source-URL footnote table. Tier-gated to War Room only (no IB/X-Ray leak — mirror `intelligence-brief/variables.ts:166-190` anti-leak discipline).

**Weekly digest (`weekly-digest.ts`, fix H):**
- Resend email summarizing delta-since-last-week (new pairings observed, grant_rate changes ≥ 5 percentage points, new motion types).
- FROM address: `updates@imnotanattorney.com` (transactional — War Room buyers are verified paid customers; primary domain OK per `~/.claude/rules/never-cold-email-from-primary-domain.md`).
- Cron route: `/api/cron/war-room-weekly-digest` registered via `scripts/setup-cronjob-org.js` pattern (cron-job.org per global rules — never GitHub Actions cron).
- Cadence: Mondays 13:00 UTC (`0 13 * * 1`) — mirrors existing scheduled-cron precedent.
- Auth: `CRON_AUTH_TOKEN` env (existing pattern per `gotcha-cv-probe-drift.md`).
- Recipient SQL filter: hard-filter to `tier='war-room' AND status='delivered' AND refunded=false`. Recipient-count guard: abort send if recipient count > active-war-room-customer count + 5% (detects filter drift).
- Delta computation: requires `judge_prosecutor_pairings.created_at` (or equivalent temporal column). T0 schema check MUST confirm this column exists (see T0 expansion above). If absent, precondition migration adds `created_at TIMESTAMPTZ DEFAULT NOW()` before T1 ships.

**Engine-side wiring:** Out of scope for this plan — see Out of Scope §1.

**Gradeability handle:** SC-1, SC-2, SC-6.

#### **T2. X-Ray ($2,497) tier-distinct officer slice (cannibalization fix).**

**Why:** Officer BG Check ($97) at `tier9-reports/query.ts:859-901` already wires `officer_reliability` for a single named officer via `queryOfficerBackground`. X-Ray claims "officer reliability cross-case" (`product-tiers.md:16`). No X-Ray-specific surface today. Per finding C10 (april-dunford f-002), the "see Officer BG Check ($97) for single-officer" callout is an active downgrade message inside a paid deliverable — banned.

**Target files (NEW):**
- `src/lib/officers/single-officer-query.ts` — shared query module, imported by BOTH `tier9-reports/queryOfficerBackground` AND `xray-sections/officer-cross-case`. This is the canonical single-officer query path; neither module re-implements it. (Fix J — eliminates duplicate query layer.)
- `src/lib/xray-sections/officer-cross-case.ts` — X-Ray query module (mirrors existing `xray-sections/judge-motion-histogram.ts` shape); imports single-officer path from `src/lib/officers/single-officer-query.ts`; adds the co-occurrence layer
- `src/lib/xray-sections/render-officer-cross-case.ts` — render module

**Query (`officer-cross-case.ts`, fix N):**

Per finding W4 (code-reviewer f-010): use `escapeOrFilterValue` from T0.5 on every officer name. Co-occurrence query: for each pair of officers in the case, count shared courts (not shared source_url arrays, which is O(n²) and brittle):

```typescript
// Pattern: cl-bulk-data-defensive #18 (COPY pattern), escapeOrFilterValue from T0.5
// csv-bulk-checked: none-exists — officer_reliability is already in DB, no bulk needed

// Step 1: per-officer lookup (uses single-officer-query.ts, same as queryOfficerBackground)
// One query per officer name (loop, not .or() fan-out)

// Step 2: co-occurrence — for each pair of officers in this case:
// SELECT COUNT(*) FROM officer_reliability
// WHERE officer_name IN (officerA, officerB)
// GROUP BY court
// HAVING COUNT(DISTINCT officer_name) = 2
// This counts shared courts, not shared cases. Sufficient for pattern detection;
// true case-level co-occurrence requires officer_case_links junction table (deferred — Out of Scope §9).
```

**`source_urls` filter mandatory** (fix I): every row query includes `.not('source_urls', 'is', null).not('source_urls', 'eq', '{}')`. Render guard at row-level: `if (!row.source_urls?.length) continue`.

**Single-officer X-Ray path — degraded-waiting frame (fix K):**

WHEN `officer_count = 1`, X-Ray render does NOT promise multi-officer matrix. Instead surfaces a discovery-stage frame:

> "Officer Cross-Case Analysis requires ≥ 2 officers in this case's discovery. Currently 1 officer extracted from your discovery PDFs. Section will populate as discovery progresses."

Plus: a coverage scan of the named officer's cross-case history (sourced from `single-officer-query.ts`) framed within the discovery-completeness narrative — "here is what we have on this officer now, and what additional signals will surface when more officers are extracted." X-Ray's tier-distinct value on the single-officer path comes from the FRAMING + the coverage promise, not from a separate data layer. This is intentionally degraded-waiting, NOT silently equivalent to the $97 Officer BG Check.

Do NOT include "see Officer BG Check ($97)" callout. Never surface price-comparative messaging inside a paid deliverable.

**Multi-officer render:**
- WHEN `officer_count >= 2`: full multi-officer table (rows = officers in this case) + co-occurrence sub-table (rows = officer pairs with shared courts ≥ 2, key `co_occurrence_table`).
- The key `co_occurrence_table` MUST be present in the X-Ray output object and MUST NOT be present in `queryOfficerBackground` output. This is the tier-distinct shape assertion (fix J / SC-3c).

**Cannibalization assertion (test-locked, shape-based per fix J):**

`src/lib/xray-sections/__tests__/officer-cross-case.test.ts` must:
1. Assert that `queryOfficerCrossCase` result contains key `co_occurrence_table` — absent from `queryOfficerBackground` output.
2. Assert that `render-officer-cross-case` output contains key `single_officer_extended_dimension` when `officer_count = 1` (confirms degraded-waiting frame is wired, not the full matrix).
3. The `git grep -nE "queryOfficerBackground" src/lib/xray-sections/` = 0 hits assertion REMOVED from this test — X-Ray now imports from `single-officer-query.ts` shared module, NOT from `queryOfficerBackground` directly. The cannibalization check shifts to a shape assertion: test confirms `co_occurrence_table` key is present in X-Ray output but absent from tier9-reports `queryOfficerBackground` output shape. SC-3c enforces this.

**Vitest mocking strategy (fix M):** Use vitest mock factory to mock `@supabase/supabase-js` createClient. Cite `src/lib/tier9-reports/__tests__/officer-coverage.test.ts` as the canonical precedent — verified this session to contain `vi.mock("@/lib/supabase/admin", ...)` at line 82, `vi.mock("@/lib/feature-flags", ...)` at line 94, and `vi.mock("../cpd-match", ...)` at line 99. This is the closest semantic match (same query layer family).

**Gradeability handle:** SC-3a, SC-3b, SC-3c, SC-4, SC-8.

### Invariant

#### **T12. Coverage test `scripts/audit-data-product-wiring.mjs` (narrowed scope).**

**Narrowed promise-to-table map (only T1 + T2 promises):**

| Promise (from `product-tiers.md`) | Table | Source directory |
|---|---|---|
| `War Room adds: judge×prosecutor pairing matrix` | `judge_prosecutor_pairings` | `src/lib/war-room/` |
| `X-Ray adds: officer reliability cross-case` | `officer_reliability` | `src/lib/xray-sections/` |

Future T3–T11 ports add their own entries when their plan ships. The coverage test must be structured to accept additive entries without breaking.

**Target file (NEW):** `scripts/audit-data-product-wiring.mjs`

**Expected behavior:**
- For each entry in the promise-to-table map: runs `git grep -l "<table_name>"` scoped to the named source directory (excluding `__tests__/` and migration files).
- Fails (exit 1) if any entry's table has zero production read sites in its named directory.
- `--check-promises` mode: also checks that the promise string from `product-tiers.md` has ≥ 1 grep hit in the named directory (i.e., the feature is actually wired, not just mentioned in tests).
- CI guard: `git grep -nE "queryOfficerBackground" src/lib/xray-sections/` returns 0 hits — added as an explicit assertion in `--check-promises` mode (finding W9 + CI guard from R0). This confirms X-Ray never calls the $97 function directly.

**Wire-in:** added to `package.json` `scripts.test:audit-orphans` and to pre-push hook (confirm hook location at execution from existing hook pattern).

**Gradeability handle:** SC-8.

## Out of Scope

1. **Engine-repo (`ImNotAnAttorney-engine`) wiring.** War Room report generation primarily lives there. T1 ships the web-side query+render module + defendant-portal section only. Engine-side wiring of the contract = separate plan in `ImNotAnAttorney-engine/docs/plans/`.
2. **New data ingestion / scrapers.** Worry is wiring **existing** data. No new bulk loaders, no new APIs, no new ETL.
3. **Pricing changes to existing tiers.** Tier-distinct slicing (T2) resolves cannibalization via shape difference — NOT repricing.
4. **`verified_case_law` central library** — phantom table per `docs/audit-schema-gaps.md:17`. Engine ownership.
5. **Frontend redesign of report rendering.** Wire data into existing render path; no new section types unless absolutely required.
6. **Free-tools surface.** Sentencing Calculator + Judge Comparison are correctly wired per audit; not touched.
7. **Migrating 11 other inline `escapeIlike` copies** (per fix A). T0.5 creates the canonical helper only; migration of existing inline copies at `src/lib/tier9-reports/query.ts:402` and elsewhere is a separate cleanup task.
8. **Operator-portal page route for the pairing matrix.** `requireAdmin` at `src/lib/auth/guards.ts:54` (apps/web post-cutover) takes `NextRequest` — works for API routes only, not page routes. The existing `/operator/cases/[id]/page.tsx` uses a client-side `OperatorShell` password prompt pattern. A new operator page for the matrix needs its own auth-pattern decision — separate worry.
9. **`officer_case_links` junction table for true case-level co-occurrence.** T2 co-occurrence counts shared courts (computable on current schema). True shared-case counting requires an `officer_case_links` junction table with its own ingestion plan.
10. **Multi-user War Room access model.** Token-share is current pattern; multi-user is a separate worry.
11. **`product-tiers.md` marketing copy update post-ship.** After T1 ships, update War Room marketing copy in `product-tiers.md` to reflect the defendant-portal pairing matrix as a named Component 3 proof point. Separate task — do not block T1 execution on copy update.

### Deferred to follow-up worry `worry-data-orphans-tier-b-c`

The following tasks from the pre-narrowing plan are deferred. The follow-up worry must run its own R0 swarm, re-verify table existence (in particular: `judge_investments` + `judge_civil_party_conflicts` collapsed into `judge_conflict_of_interest` per finding C1 — the follow-up plan must query `judge_conflict_of_interest` with `match_type` discriminator, NOT the two phantom tables named in the pre-R0 plan), and build a feature-flag migration for `case_law_references`.

| Task | Scope | Key pre-req for follow-up |
|---|---|---|
| **T3** (was `judge_investments` → IB) | `judge_conflict_of_interest` financial-conflict signals (finding C1: phantom table collapsed) | Confirm `judge_conflict_of_interest` columns via information_schema; rewrite query against real columns; add `disclosure_url IS NOT NULL` source-url guard |
| **T4** (was `judge_civil_party_conflicts` → IB) | `judge_conflict_of_interest` civil-party conflict signals (same collapsed table as T3) | Same as T3 — collapsed into one table; use `match_type` discriminator |
| **T5** (`judge_demographic_sentencing` → Signal 5) | Sentencing Fingerprint Signal 5 (Tier 9 + X-Ray → War Room per finding C9) | Coverage audit first: what % of cases have judge with ≥11 cases per race cohort? If <30%, defer further. Route to attorney/operator surface first per C9. UPL-safe framing required. |
| **T6** (`classified_opinions` deep slice → X-Ray) | X-Ray jurisdiction-aware deep slice | Verify `holding_text`, `motion_types`, `defense_theories` columns exist via T0; add `resolved_opinion_authorship` LEFT JOIN for authorship (finding W5) |
| **T7** (`resolved_opinion_authorship` standalone) | Deferred — useful only as T6 JOIN partner | Re-evaluate after T6 ships |
| **T8** (`case_law` legacy) | Deprecated by `classified_opinions` per spec | No wire-up; address in schema-cleanup worry |
| **T9** (`case_law_references` feature flag) | Feature-flag migration pattern (finding C6: flags are DB rows, not static file) | Add migration `INSERT INTO feature_flags(flag_key, is_enabled) VALUES ('legal_research_case_law_references_enabled', false)` |
| **T10** (`entities_officers` + `pji_field_validation`) | Vestigial — 0 production reads | Address in schema-cleanup worry |
| **T11** (`case_law_applicability` + `verified_case_law`) | Engine-only / comment-only reference | No INAA-web wire-up |

## Success Criteria

> Hamel-Husain binary-gradeable form: every criterion is independently checkable from the listed artifact and returns a literal PASS or FAIL with no interpretation. Where a criterion involves a count, the threshold is a hard integer. Where it involves grep, the command is fully written so the grader can paste it.

**SC-1.** PASS iff all of the following hold:
- `git grep -nE "^import .* from ['\"].*pairing-matrix" src/app/my-case/\[token\]/page.tsx` returns ≥ 1 hit (ES import of the matrix component into the existing portal page)
- `git grep -nE "\.from\(\"judge_prosecutor_pairings\"\)" src/lib/war-room/pairing-matrix.ts` returns ≥ 1 hit
- `git grep -nE "\.not\(\"source_urls\"" src/lib/war-room/pairing-matrix.ts` returns ≥ 1 hit (source_urls filter present)
- Files `src/lib/war-room/pairing-matrix.ts`, `src/lib/war-room/render-pairing-matrix.tsx`, `src/lib/war-room/weekly-digest.ts` all exist
- NO file `src/app/my-case/\[token\]/war-room/pairing-matrix/page.tsx` exists (sub-route was dropped per fix E)

**SC-2.** PASS iff `git grep -nE "requireTier" src/app/my-case/\[token\]/page.tsx` returns ≥ 1 hit AND `npx vitest run src/lib/tier/__tests__/require-tier.test.ts` exits 0.

**SC-3a.** PASS iff `git grep -nE "\.from\(\"officer_reliability\"\)" src/lib/xray-sections/officer-cross-case.ts` returns ≥ 1 hit AND file `src/lib/xray-sections/officer-cross-case.ts` exists.

**SC-3b.** PASS iff `src/lib/xray-sections/__tests__/officer-cross-case.test.ts` exists AND contains the literal substring `tier-distinct shape` AND `npx vitest run src/lib/xray-sections/__tests__/officer-cross-case.test.ts` exits 0.

**SC-3c.** PASS iff all of the following hold:
- Test file `src/lib/xray-sections/__tests__/officer-cross-case.test.ts` asserts `co_occurrence_table` key present in `queryOfficerCrossCase` output (verify: `git grep -nE "co_occurrence_table" src/lib/xray-sections/__tests__/officer-cross-case.test.ts` returns ≥ 1 hit)
- Test file asserts `single_officer_extended_dimension` key present when `officer_count = 1` (verify: `git grep -nE "single_officer_extended_dimension" src/lib/xray-sections/__tests__/officer-cross-case.test.ts` returns ≥ 1 hit)
- `git grep -n "co_occurrence_table" src/lib/tier9-reports/query.ts` returns 0 hits (shape absent from $97 tier)
- `git grep -nE "queryOfficerBackground" src/lib/xray-sections/` returns 0 hits (X-Ray must NOT call the $97 function directly — shared single-officer logic goes through `src/lib/officers/single-officer-query.ts`)

**SC-4.** PASS iff `git grep -nE "escapeIlike" src/lib/util/escape-postgrest-filter.ts` returns ≥ 1 hit AND `npx vitest run src/lib/util/__tests__/escape-postgrest-filter.test.ts` exits 0.

**SC-5.** PASS iff `node scripts/diag-data-orphans-schema.mjs` runs cleanly AND produces `data/audit/data-orphans-schema-2026-04-29.json` containing entries for all three tables (`judge_prosecutor_pairings`, `officer_reliability`, `judge_profiles`) each with non-empty `columns` array AND no entry contains a `sample_row` field. Verifiable:
```
node -e "const d=require('./data/audit/data-orphans-schema-2026-04-29.json'); ['judge_prosecutor_pairings','officer_reliability','judge_profiles'].forEach(t=>{const e=d.find(x=>x.table===t); if(!e||!e.columns||!e.columns.length) throw new Error(t); if(e.sample_row!==undefined) throw new Error('sample_row leak: '+t)})"
```
exits 0.

**SC-6.** PASS iff `src/app/api/cron/war-room-weekly-digest/route.ts` exists AND `git grep -nE "CRON_AUTH_TOKEN" src/app/api/cron/war-room-weekly-digest/route.ts` returns ≥ 1 hit AND `git grep -nE "refunded.*false|tier.*war-room" src/lib/war-room/weekly-digest.ts` returns ≥ 1 hit (recipient filter present).

**SC-7.** PASS iff the issues-tracker check command below exits 0. (If the actual issue-tracker writer puts files at a different path, confirm at execution from `node -e "require(require('os').homedir() + '/.claude/hooks/lib/issues-tracker.js')"` to get the canonical dir. Update `dir` constant if needed.)
```
node -e "const fs=require('fs'),path=require('path'),os=require('os');const dir=path.join(os.homedir(),'.claude/projects/C--Users-email-projects-ImNotAnAttorney-web');const files=fs.readdirSync(dir).filter(f=>f.startsWith('claude-issues-')&&f.endsWith('.json'));if(files.length===0)throw new Error('no issue files found');files.forEach(f=>{const d=JSON.parse(fs.readFileSync(path.join(dir,f)));if(d.total!==d.fixed||(d.open_critical||0)>0||(d.open_warning||0)>0||(d.open_suggestion||0)>0)throw new Error(f)})"
```

**SC-8.** PASS iff `node scripts/audit-data-product-wiring.mjs --check-promises` exits 0 AND `git grep -F "judge_prosecutor_pairings" scripts/audit-data-product-wiring.mjs | grep -vF "//"` returns ≥ 1 hit AND `git grep -F "officer_reliability" scripts/audit-data-product-wiring.mjs | grep -vF "//"` returns ≥ 1 hit AND `git grep -nE "queryOfficerBackground" src/lib/xray-sections/` returns 0 hits.

**SC-9 (build + test):** PASS iff `npm run build` exits 0 AND `npm test` exits 0.

## Round Log

(populated during Phase 6)

## Findings Companion

See `2026-04-29-worry-data-orphans-product-gaps-findings.md` (created at first finding).

See `2026-04-29-worry-data-orphans-product-gaps-rounds.md` (created at first round).

## Appendix A — Audit Corrections (verified 2026-04-29)

The session-2026-04-29 codebase grep found that the original audit overstated several orphans/gaps. Corrections:

| Audit claim | Actual state (verified) |
|---|---|
| `judge_prosecutor_pairings` "Zero consumer code" | 3 production reads (`tier9-reports/query.ts:797`, `defense-intelligence/query.ts:399`, `tier9-reports/coverage.ts:100`). The narrower truth: no *matrix* artifact exists. T1 ships that artifact. |
| `officer_reliability` "Zero consumer code" | Wired at `tier9-reports/query.ts:869,877` via `queryOfficerBackground` ($97 SKU) + coverage gate. T2 narrows from "wire it" to "tier-distinct slice it." |
| `judge_investments` + `judge_civil_party_conflicts` named as two tables | R0 finding C1: migration `20260421a_judge_conflict_of_interest.sql` created ONE combined table `judge_conflict_of_interest` with `match_type` discriminator. Both phantom table names are invalid. Deferred to follow-up worry. |
| `judge_sentencing_patterns` "implicit, orphan" | 3 production reads (`tier9-reports/query.ts:834`, `api/tools/sentencing-calculator/route.ts:134,160`, `api/tools/judge-comparison/route.ts:56`). NOT an orphan. Removed from task list. |
| `judge_disposition_profile` "implicit, orphan" | 3 production reads (`courthouse-intelligence.ts:217`, `sentencing-fingerprint.ts:177`, `coverage.ts:364`). NOT an orphan. Removed. |
| `judge_reversal_rate` "implicit, orphan" | 2 production reads (`courthouse-intelligence.ts:240`, `sentencing-fingerprint.ts:185`). NOT an orphan. Removed. |
| `judge_demographic_sentencing` (2,937) — "implicit, orphan" | TRUE ORPHAN confirmed; explicit deferral note at `sentencing-fingerprint.ts:12`. Deferred to follow-up worry (routing to War Room per finding C9). |
| `entities_officers` + `pji_field_validation` "consumer reads" | Zero production reads. Deferred to follow-up worry (schema-cleanup). |
| `case_law_applicability` "consumer reads" | Comment-only reference in `generate-standalone/index.ts:610`; no query. Deferred to follow-up worry. |
| `src/lib/feature-flags.ts` "static flag declarations" | R0 finding C6: flags are DB rows in `feature_flags` table, NOT static code declarations. T9 (deferred) must use a migration INSERT. |

This appendix exists so any future round can re-audit `src/`+`supabase/functions/` against this snapshot to detect drift.
