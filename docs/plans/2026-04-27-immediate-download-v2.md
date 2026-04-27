# Immediate-Download v2 — In-Page Report/Intake CTA For 37 SKUs

**Plan path:** `C:\Users\email\projects\ImNotAnAttorney-web\docs\plans\2026-04-27-immediate-download-v2.md`
**Status:** READY FOR SWARM (single-PR, ~3-4h swarm time)
**Author:** Plan Agent, 2026-04-27
**Predecessor PRs:** #213 (archetype-aware heading + email-only delivery copy), #214 ({email} placeholder hot-patch)
**Origin/master HEAD:** `e72e6d7f` (verified via `git rev-parse origin/master`; local master is at `257edf07` — branch off `origin/master`).

---

## 1. Context

### 1.1 Problem statement

PR #213 + #214 shipped archetype-aware copy on `/checkout/success`, but the customer **still has to leave the page and check email** to see the actual download/intake/report URL. v1 was the trade picked to ship in 1 hour: tokens were hash-only in the DB so the verify endpoint had nothing safe to surface.

For 37 of 52 paid SKUs the underlying flow is fully eligible to be **fulfilled in-page** — the customer never had to leave. The ask now: render the in-page CTA, but do it without breaking the existing hash-at-rest model.

### 1.2 The 37 SKUs in scope (vs 7 out-of-scope service tiers + addons)

| Archetype | Count | Slugs | In-page CTA on success page |
|---|---|---|---|
| **A — playbook PDF** | 8 | dui-first-offense, drug-possession, probation-violation, white-collar, sex-offense, federal-criminal, drug-trafficking, self-defense | **Already works** via `download_token` (regression baseline only) |
| **B — Tier 9 instant + pre-pop intake** | 5 | judge-report-card, officer-background-check, similar-cases-analyzer, district-court-intelligence, arrest-survival-kit | **Poll for `reportUrl`** → "View Your Report" |
| **C — Tier 9 instant + needs intake** | 5 | federal-sentencing-distribution, federal-jury-instruction-brief, precedent-watchlist, charge-authority-pack, motion-success-report | Show `intakeUrl` → "Continue to Intake" |
| **D — standalone research + needs intake** | 27 | employment-impact, license-risk, immigration-impact, collateral-consequences, security-clearance, custody-impact, breathalyzer-challenge, fst-review, plea-consequences, drug-test-reliability, bail-hearing-prep, sentencing-prep, family-case-research, arrest-report-review, expungement-research, sentence-reduction, appeal-viability, ineffective-counsel, attorney-performance-review, probation-violation-response, discovery-decoder, constructive-possession, self-surrender-prep, probation-rights, first-72-hours, defense-preparation, pre-plea-package | Show `intakeUrl` → "Continue to Intake" |
| **E — service tier (out of scope)** | 5 | case-decoder, intelligence-brief, x-ray, war-room, situation-room | Existing TIER_NEXT_STEPS copy unchanged |
| **— addons (out of scope)** | 2 | extra-witness, witness-pack | Existing copy unchanged |

A: 8 + B: 5 + C: 5 + D: 27 = **45 in-scope SKUs** (8 already work, 37 to fix).
E + addons: 7 untouched.
Total = 52. Confirmed against memory `project-post-purchase-ux-archetypes.md`.

### 1.3 Tech stack

- Next.js 15 App Router
- Supabase Postgres (DB) + Storage (`standalone-reports` bucket)
- Stripe Checkout webhook in `src/app/api/webhooks/stripe/route.ts`
- Resend (legacy email path stays exactly as today)
- cron-job.org for the new scrub job (per project CLAUDE.md "No GitHub Actions Cron")

### 1.4 Key files (anchored against `origin/master` `e72e6d7f`)

| Path | Role | Touched? |
|---|---|---|
| `C:\Users\email\projects\ImNotAnAttorney-web\src\app\api\webhooks\stripe\route.ts` | Mints intake token (lines 207-228 standalone, 757-768 Tier 9 second flow) and triggers `generateTier9Report` (lines 271-277). | YES |
| `C:\Users\email\projects\ImNotAnAttorney-web\src\lib\tier9-reports\generate.ts` | Mints report token at line 488; emails plaintext URL at line 523; persists hash at 512. | YES |
| `C:\Users\email\projects\ImNotAnAttorney-web\src\app\api\checkout\verify\route.ts` | Returns verify payload to success page. **Token security comment is at lines 126-132 — must be rewritten.** | YES |
| `C:\Users\email\projects\ImNotAnAttorney-web\src\app\checkout\success\page.tsx` | The `useEffect` at lines 220-237 fetches verify; UI lines 340-365 already has a fallback path for `intakeUrl`. | YES |
| `C:\Users\email\projects\ImNotAnAttorney-web\src\app\intake\standalone\[slug]\page.tsx` | Token-gated intake. **Zero changes.** | NO |
| `C:\Users\email\projects\ImNotAnAttorney-web\src\app\report\standalone\[token]\page.tsx` | Token-gated report viewer. **Zero changes.** | NO |
| `C:\Users\email\projects\ImNotAnAttorney-web\src\lib\tier9-reports\constants.ts` | Defines `TIER9_SLUGS` (10 slugs total, all 5 archetype-B + 5 archetype-C). | READ-ONLY |
| `C:\Users\email\projects\ImNotAnAttorney-web\src\lib\tier9-reports\prepopulated-intake.ts` | Determines pre-pop fast-path → archetype B vs C selector. | READ-ONLY |
| `C:\Users\email\projects\ImNotAnAttorney-web\src\lib\auth\guards.ts` | `requireCron(req)` — pattern for new scrub cron (line 73). | READ-ONLY |
| `C:\Users\email\projects\ImNotAnAttorney-web\scripts\setup-cronjob-org.js` | cron-job.org registration helper. **Add scrub-plaintext-tokens entry.** | YES |

### 1.5 Existing schema state on `orders` (verified against migrations)

- `standalone_intake_token text` — **legacy plaintext column**, declared in `20260406_standalone_products.sql:35`. Currently set to NULL by webhook (per `20260408j_standalone_intake_token_hash.sql:11-13`). Migration j explicitly says "kept for now... follow-up migration will drop". **We reuse this column rather than adding a new one** — but with renamed semantics + TTL. See §2.1.
- `standalone_intake_token_hash text` (UNIQUE NULLS NOT DISTINCT partial index).
- `standalone_report_token_hash text` (UNIQUE partial index).
- `standalone_report_storage_path text`, `standalone_report_token_expires_at timestamptz` (long-TTL — 365 days).
- `download_token text`, `download_token_expires_at timestamptz` — **archetype A's existing path**, plaintext at rest, 72h TTL. v1 plan §2.4 already accepted this trade.

---

## 2. Key decisions

### 2.1 Migration shape — reuse `standalone_intake_token`, add 1 column for report plaintext, add 1 expires_at column

**Decision:** ONE new migration file, idempotent (`IF NOT EXISTS`), three operations:

1. **Repurpose** existing `standalone_intake_token` (plaintext) — already declared in `20260406_standalone_products.sql:35`, currently always NULL — webhook starts writing plaintext here for the 30-min TTL window.
2. **ADD** `standalone_report_token_plaintext text` — new nullable column.
3. **ADD** `plaintext_tokens_expires_at timestamptz` — single TTL field covering both plaintext fields (they're always written within ms of each other).

**Why one expires_at, not two:** the intake plaintext lives for the same 30 min as the report plaintext when both are present (Tier 9 archetype B path: webhook mints intake token → triggers `generateTier9Report` async → ~30s later the report token mints; both must scrub within the same window). One column = one cron predicate = no race.

**Why reuse `standalone_intake_token` instead of `standalone_intake_token_plaintext`:** the legacy column already exists and is unused; adding a parallel column would create three plaintext-or-hash variants of the same field which is a "no parallel ways to do the same thing" violation per project code-conventions. Migration j explicitly anticipated reuse — comment at line 11-13 says "kept for now, populated by webhook to NULL on new orders... follow-up migration will drop the column once all code paths are confirmed hash-only". We **don't drop** — we reactivate with TTL semantics.

**WHY the 30-min TTL:** the success-page poll runs for 60s max, then customer can refresh up to a few times. Real-world max gap from webhook to last legitimate poll = ~5 min (slow customer, network retry). 30 min absorbs every realistic window with 6× margin while keeping the worst-case DB-leak blast radius tiny (only orders within last 30 min, none retroactive). Aligns with industry norms for short-lived bearer tokens (OAuth access tokens, AWS STS sessions all 15-60 min).

**Why NOT 5 min:** mid-purchase email triage / phone-call interruption is common in this audience (people just got arrested). 5 min strands them. 30 min absorbs the realistic distraction window without measurable security cost given the cs_session_id replay risk already exists (§2.4).

### 2.2 Cleanup cron cadence: hourly

**Decision:** every hour at minute 30 (`{ minutes: [30], hours: [-1] }`). Defensive predicate: `WHERE plaintext_tokens_expires_at IS NOT NULL AND plaintext_tokens_expires_at < NOW()`. NULLs all three plaintext fields in one UPDATE.

**Why hourly, not 15-min:** at 30-min TTL, a token is exposed for at most 30 + 60 = 90 min worst case (mint right after a scrub). Acceptable. 15-min cron multiplies cron-job.org calls 4× for negligible window improvement. Bootstrap-mode rule.

**Why minute-30 offset:** existing crons cluster at minute 0. Spread the load. cron-job.org rate-limits at ~5 req/min so well clear.

### 2.3 Polling shape (archetype B only)

**Decision:**
- **Interval:** 4 seconds (between Hormozi's "feels instant" 3s and the user's "5s feels lazy" threshold). Non-exponential — predictable cadence for a user staring at a spinner.
- **Timeout:** 60 seconds total (15 polls). Most Tier 9 reports finish in 15-25s in production based on current `generateTier9Report` latency; 60s gives a 2× headroom.
- **After timeout:** swap to email-fallback copy ("Generation taking longer than usual — link sent to {email}, check inbox in a few minutes"). Don't keep polling.
- **First poll:** fire immediately on mount (don't wait 4s for the first call) — most reports are still 5-10s out at page-mount time.
- **Stop conditions:** `reportUrl` arrives, OR timeout hit, OR `verified === false` (auth fail), OR component unmounts (cleanup `clearInterval`).

**Why poll vs server-sent events / websocket:** $0 budget rule. The success page is a `'use client'` component, polling is one `setInterval`, no infra cost. SSE would require an Edge Function listener → more moving parts → not justified for a 60s window.

### 2.4 Threat model — token security comment rewrite (verify/route.ts:126-132)

The current comment claims "intake tokens are stored as SHA-256 hashes... plaintext exists only in the customer's email." After this change, plaintext exists in the DB for ≤ 30 min after mint. The comment must be **explicit** about this trade.

**Locked threat model:**

The session_id is already URL-bound and replayable: an attacker with `?session_id=cs_xxx` from a Stripe-redirect URL (referrer leak, browser history copy, screenshot of the success page) can already call `/api/checkout/verify?session_id=cs_xxx` and get verification + `productName` + `email` + (now) `reportUrl`/`intakeUrl`. **Plaintext exposure on top of the session_id channel does not escalate** — the session_id IS the bearer credential here.

The marginal risk is a DB compromise during the 30-min window: an attacker with read access to `orders` could harvest all in-flight plaintext tokens (max ~30 min of orders, capped at site purchase rate). This is strictly bounded:
- Long-tail orders (>30 min old) leak nothing.
- Hash-only state for >99% of order rows at any time.
- Standalone report token expires at 365 days even if leaked plaintext (existing TTL on `standalone_report_token_expires_at`); customer can request rotation if alerted.
- Cron scrubs every 60 min; manual `node` script in `scripts/scrub-plaintext-tokens.mjs` for emergency response.

**Replacement comment text** (drop into `verify/route.ts` replacing lines 126-132):

```ts
    // (W6 + IDv2-2026-04-27) For standalone research products, the plaintext
    // intake / report tokens are surfaced in this response — but ONLY when the
    // token is still within its 30-minute mint TTL. After 30 min the
    // plaintext_tokens_expires_at predicate fails and the response falls back
    // to "check your email" copy on the success page.
    //
    // THREAT MODEL:
    //   - session_id is already a bearer credential reachable by anyone holding
    //     the post-checkout URL (referrer leak, history, screenshot). An
    //     attacker with the session_id can already call this endpoint and
    //     receive the (now-attached) plaintext URLs. Surfacing plaintext does
    //     NOT escalate beyond the session_id replay surface that already
    //     exists.
    //   - DB compromise during the 30-min window leaks ONLY in-flight tokens
    //     (max ~30 min of orders). Long-tail rows scrubbed via hourly cron at
    //     /api/cron/scrub-plaintext-tokens; manual emergency scrub via
    //     scripts/scrub-plaintext-tokens.mjs.
    //   - Hash-only state remains the resting state for >99% of orders.
    //
    // OPERATIONAL CONTRACT:
    //   - Webhook MUST set plaintext_tokens_expires_at = NOW() + 30 min on
    //     every plaintext write. Cron MUST defensively check the predicate
    //     "plaintext_tokens_expires_at IS NOT NULL AND ... < NOW()" before
    //     NULLing.
    //   - Email path is unchanged — emails still carry the plaintext URL the
    //     customer needs after the in-page TTL elapses.
```

### 2.5 Verify endpoint response shape

**Decision:** add two new optional keys, do not modify existing keys.

```ts
// before (today):
{ verified, tier, email, amount, productName, sessionCreated,
  priorityDelivery, downloadUrl?, emergencyDownloadUrl?,
  standaloneProduct? }

// after (this PR):
{ verified, tier, email, amount, productName, sessionCreated,
  priorityDelivery, downloadUrl?, emergencyDownloadUrl?,
  standaloneProduct?,
  intakeUrl?,    // NEW: plaintext intake URL when within TTL
  reportUrl?,    // NEW: plaintext report URL when within TTL
  archetype?     // NEW: "A" | "B" | "C" | "D" | "E" — drives success-page render branch
}
```

**Why include `archetype` server-side:** today the success page derives the archetype from `?tier=` / `?product=` URL params and a hand-maintained switch. Centralizing the archetype in the verify response means the **server** is the single source of truth (it already has `product_type`, `standalone_product_slug`, and access to `TIER9_SLUGS` + `prepopulated-intake.ts`). Client-side switch can collapse to a simple `data.archetype === "B"` branch.

**Auth boundary unchanged:** verify already rate-limits 20 req/min/IP (line 54). Polling at 4s interval = 15 calls in 60s, well within budget for one client. If many clients share an IP (e.g., NAT), worst case 1 client per 3 seconds steady-state — still OK.

### 2.6 What to do if archetype B polling outlasts the 30-min plaintext TTL

Cannot happen: polling caps at 60s, plaintext TTL is 30 min. Massive headroom.

What CAN happen: customer purchases, navigates away, returns 45 min later via browser-back to the success page. Token plaintext now NULL. Verify response omits `reportUrl`. Success page shows email-fallback copy + the email link still works (long-TTL hash). No regression vs today.

### 2.7 "If I do this now and the rest of the project never happens, did I lose anything?"

Three new orders columns + one cron route + one verify-endpoint response field. Even if v2 work is abandoned mid-flight, all artifacts are additive (no behavior change until success page reads new keys). Migration is reversible. **Execute now.**

---

## 3. Files to modify / create

### 3.1 NEW files

| Path | Purpose |
|---|---|
| `C:\Users\email\projects\ImNotAnAttorney-web\supabase\migrations\20260427a_orders_plaintext_tokens.sql` | Adds `standalone_report_token_plaintext` + `plaintext_tokens_expires_at`; idempotent (`IF NOT EXISTS`); reuses `standalone_intake_token` for intake plaintext (no rename — column already exists per migration `20260406_standalone_products.sql:35`). Adds non-unique partial index on `plaintext_tokens_expires_at WHERE plaintext_tokens_expires_at IS NOT NULL` for cron predicate. |
| `C:\Users\email\projects\ImNotAnAttorney-web\src\app\api\cron\scrub-plaintext-tokens\route.ts` | Hourly cron route. `requireCron(req)` auth, `acquireCronLock("scrub-plaintext-tokens", 50 * 60 * 1000)` (50-min lock vs 60-min cadence). Single UPDATE: `SET standalone_intake_token = NULL, standalone_report_token_plaintext = NULL, plaintext_tokens_expires_at = NULL WHERE plaintext_tokens_expires_at IS NOT NULL AND plaintext_tokens_expires_at < NOW()`. Returns `{ scrubbed: <count> }`. |
| `C:\Users\email\projects\ImNotAnAttorney-web\scripts\scrub-plaintext-tokens.mjs` | One-shot manual scrub for emergency response. Same SQL as cron. Uses direct pg connection per project pattern `scripts/lib/db.mjs` if present, else service-role Supabase client. |
| `C:\Users\email\projects\ImNotAnAttorney-web\src\app\api\checkout\verify\__tests__\verify-archetype.test.ts` | Vitest unit tests for the extended verify response (one test per archetype branch). |

### 3.2 MODIFIED files

| Path | Change |
|---|---|
| `src/app/api/webhooks/stripe/route.ts` | Three insertion points: (a) standalone fast-path lines 207-230 — write plaintext alongside hash, set expires_at; (b) standalone slow-path lines 757-768 — same; (c) `generateTier9Report` flows through `src/lib/tier9-reports/generate.ts` not webhook directly — see next row. Also touch the operator-alert metadata to include `plaintext_window_min: 30` for audit. |
| `src/lib/tier9-reports/generate.ts` | At lines 488-516, when minting `reportToken`: write plaintext to `standalone_report_token_plaintext` AND set `plaintext_tokens_expires_at = NOW() + 30 min`. Ensure UPDATE preserves any existing intake plaintext expires_at (use `GREATEST(NOW() + interval '30 min', plaintext_tokens_expires_at)` to extend the window so intake-then-report doesn't shorten it). |
| `src/app/api/checkout/verify/route.ts` | (a) Replace token-security comment at lines 126-132 per §2.4. (b) Extend `orders` SELECT to include the three plaintext columns. (c) Compute archetype from existing metadata + `TIER9_SLUGS` + `buildPrePopulatedIntake` results. (d) Return `intakeUrl` / `reportUrl` / `archetype` keys. (e) Add `WHERE plaintext_tokens_expires_at IS NULL OR plaintext_tokens_expires_at > NOW()` guard before constructing URLs. |
| `src/app/checkout/success/page.tsx` | (a) Read `archetype`, `intakeUrl`, `reportUrl` from verify response. (b) Add polling effect (archetype B only): `setInterval(refetchVerify, 4000)`, cleanup on unmount, stop on `reportUrl` arrival or 60s timeout. (c) Render branch by archetype: B with `reportUrl` → "View Your Report" button; B without yet → spinner card; C/D with `intakeUrl` → "Continue to Intake" button; C/D without → existing email-fallback. (d) UPL guardrail copy review (no "your case" directives). |
| `scripts/setup-cronjob-org.js` | Add to `CRON_JOBS` array: `{ name: 'scrub-plaintext-tokens', schedule: { minutes: [30], hours: [-1] }, timeout: 30, description: 'Hourly scrub of expired plaintext intake/report tokens (IDv2)' }`. |
| `src/app/api/cron/CONTEXT.md` | One-line entry under cron route listing per project code-conventions ZOOM OUT doctrine. |
| `supabase/CONTEXT.md` | Update orders schema reference: add three new columns + reactivation of `standalone_intake_token` semantics. |
| `ARCHITECTURE.md` | Add `scrub-plaintext-tokens` to cron list; one-line note on plaintext TTL trade. |

---

## 4. Tasks (numbered, dependency-ordered)

Each task touches ≤ 3 files. Most are Sonnet-eligible (mechanical from spec). Opus flagged where judgment is required.

### Task 1 — Schema migration (Sonnet)
**Files:** `supabase/migrations/20260427a_orders_plaintext_tokens.sql` (NEW)
**Acceptance:**
- `IF NOT EXISTS` on every ALTER and CREATE INDEX.
- ADD COLUMN: `standalone_report_token_plaintext text`, `plaintext_tokens_expires_at timestamptz`.
- CREATE INDEX `idx_orders_plaintext_tokens_expires_at` ON `orders(plaintext_tokens_expires_at) WHERE plaintext_tokens_expires_at IS NOT NULL`.
- COMMENT block at top documenting reuse of `standalone_intake_token` per `20260408j` migration's deferred drop.
- Apply via `npx supabase db query --linked` per project gotcha (no `exec_sql`).
**Verify:** `\d orders` shows three plaintext-related columns; partial index visible; existing `standalone_intake_token_hash` UNIQUE index untouched.
**Parallelizable:** YES (no dependencies).

### Task 2 — Webhook plaintext writes (Sonnet)
**Files:** `src/app/api/webhooks/stripe/route.ts`
**Touch points:**
- After line 209 (`intakeTokenHash = hashToken(intakeToken)`), in the standalone fast-path INSERT at 213-230: add `standalone_intake_token: intakeToken` and `plaintext_tokens_expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString()`.
- After line 758 (Tier 9 second flow, inside the UPDATE at 761-768): same two fields.
**Acceptance:**
- Plaintext column populated alongside hash on EVERY new standalone or Tier 9 order.
- Existing email-send path unchanged (regression-locked — email URL keeps using `intakeToken` plaintext from local var, not from DB).
- `priority_delivery`, `pillar_ref`, etc. flow through unchanged.
**Verify:** integration test in Task 8.
**Parallelizable:** YES with Task 3 (different functions).

### Task 3 — Generate.ts plaintext write + expires_at extension (Sonnet)
**Files:** `src/lib/tier9-reports/generate.ts`
**Touch points:**
- After line 489 (`reportTokenHash = hashToken(reportToken)`), in the UPDATE at 509-516: add `standalone_report_token_plaintext: reportToken` and the `GREATEST(...)` expires_at extension.
- Use a Supabase RPC or a two-step pattern (read existing `plaintext_tokens_expires_at`, compute max, write back) — there is **no `GREATEST(NOW() + interval, col)`** semantics in plain `.update()` calls, must use raw SQL via `supabase.rpc` or read-then-write. Simpler: read first, compute in JS, then update. Race-acceptable (worst case: lose ~ms of window).
**Acceptance:**
- Report plaintext column populated when `generateTier9Report` succeeds.
- `plaintext_tokens_expires_at` set to `max(existing, NOW + 30min)` so a long generation doesn't shrink the window.
- Existing email send (line 525) unchanged.
**Verify:** Tier 9 archetype B integration test in Task 8.
**Parallelizable:** YES with Task 2.

### Task 4 — Verify endpoint extension (Opus — judgment on archetype derivation + comment rewrite)
**Files:** `src/app/api/checkout/verify/route.ts`
**Touch points:**
- Lines 109-124: extend the `orders` SELECT to include `standalone_intake_token, standalone_report_token_plaintext, plaintext_tokens_expires_at, standalone_product_slug, product_type`.
- Lines 126-132: replace the comment block per §2.4 verbatim.
- Add archetype derivation function (TS, exported for tests):
  - `product_type === "digital-product" + tier in playbook list` → "A"
  - `product_type === "standalone" + slug in TIER9_SLUGS + buildPrePopulatedIntake(...) !== null` → "B"
  - `product_type === "standalone" + slug in TIER9_SLUGS` → "C"
  - `product_type === "standalone"` → "D"
  - service tier → "E"
- Construct URLs only when `plaintext_tokens_expires_at IS NOT NULL AND > NOW()`.
- Return shape per §2.5.
**Acceptance:**
- All five archetypes resolved correctly.
- TTL gate prevents plaintext exposure after expiry.
- Existing `downloadUrl` path (archetype A) untouched and still passes regression test.
- Comment block reads as drop-in replacement (no formatting drift).
**Why Opus:** The archetype-resolution logic is server-side judgment that must align with `prepopulated-intake.ts` AND `TIER9_SLUGS` AND `STANDALONE_PRODUCTS` — three sources of truth. Mistakes silently misroute the success page. Also: the threat-model comment is legal/security-adjacent prose.
**Parallelizable:** depends on Tasks 1-3 landing first (schema must exist, webhook must write).

### Task 5 — Success page polling + branch render (Opus — copy + UX state coverage)
**Files:** `src/app/checkout/success/page.tsx`
**Touch points:**
- Add state: `const [reportUrl, setReportUrl] = useState<string | null>(null)`, `const [archetype, setArchetype] = useState<string | null>(null)`, `const [pollExhausted, setPollExhausted] = useState(false)`.
- In existing `useEffect` at lines 220-237, parse the new keys.
- Add second `useEffect` keyed on `[archetype, reportUrl, pollExhausted]`: if `archetype === "B" && !reportUrl && !pollExhausted`, start a `setInterval` polling verify every 4s, max 15 polls, then set `pollExhausted=true`. Cleanup on unmount.
- Refactor the existing standalone branch (lines 340-365) to switch on `archetype`:
  - "A" → keep existing playbook download branch (lines 370-409). Regression baseline.
  - "B" + reportUrl → "View Your Report" CTA.
  - "B" + !reportUrl + !pollExhausted → "Generating now (usually under 30s)..." with spinner.
  - "B" + pollExhausted → email-fallback copy.
  - "C" or "D" + intakeUrl → "Continue to Intake" CTA.
  - "C" or "D" + !intakeUrl → existing email-fallback copy.
  - "E" → existing TIER_NEXT_STEPS branch.
- UPL guardrail: never write "you should...", "we recommend...", "your case requires...".
- Brand-voice (Mercer): no "we'll prepare your case", no warm-warm filler. Confident, terse: "Your report is ready." / "One step left — your case details."
- A11y: spinner needs `role="status"` + `aria-live="polite"`.
**Why Opus:** five-state render branch + UPL/brand-voice/a11y per project code-conventions and brand-voice.md.
**Parallelizable:** depends on Task 4.

### Task 6 — Cron route (Sonnet)
**Files:** `src/app/api/cron/scrub-plaintext-tokens/route.ts` (NEW), `src/app/api/cron/CONTEXT.md`
**Acceptance:**
- Mirrors `partner-cleanup/route.ts` pattern: `requireCron(req)`, `acquireCronLock("scrub-plaintext-tokens", 50 * 60 * 1000)`, try/catch with `releaseCronLock`.
- Defensive WHERE clause (NEVER NULL non-expired tokens).
- Single UPDATE; returns `{ scrubbed: <count> }`.
- CONTEXT.md gets a 1-line entry.
**Verify:** Task 9 manual cron test.
**Parallelizable:** YES (independent of Tasks 4-5).

### 7 — Manual scrub script (Haiku)
**Files:** `scripts/scrub-plaintext-tokens.mjs` (NEW)
**Acceptance:**
- Uses pattern from existing `scripts/lib/db.mjs` if present, else service-role Supabase client per project memory `architecture-direct-postgres-for-scripts.md`.
- Same SQL as cron. Logs row count + timing. Exit 0 on success, 1 on error.
- File header per project conventions (purpose, when-to-run, fail-mode).
**Verify:** dry-run on local, expect 0 rows scrubbed.
**Parallelizable:** YES.

### Task 8 — Verify endpoint unit tests (Sonnet)
**Files:** `src/app/api/checkout/verify/__tests__/verify-archetype.test.ts` (NEW)
**Acceptance:**
- One test per archetype A/B/C/D/E — all return correct `archetype` field.
- TTL expiry test: insert order with `plaintext_tokens_expires_at` 1 min in past → response omits `reportUrl`/`intakeUrl`.
- Authentication regression: unverified Stripe session → no plaintext leak.
- Use `withTestTx` per project rule `drafts/test-isolation.md` (transactional rollback).
- Mock the Stripe client per existing pattern in repo (search for `mock.*stripe` to find the canonical mock).
**Parallelizable:** depends on Task 4.

### Task 9 — End-to-end manual test plan (Opus — test design)
**Files:** test execution docs only — no code changes.
**Acceptance:**
- 5 test purchases via QA coupon (one per archetype A/B/C/D/E).
- For each: screenshot the success page in 3 states (loading / poll-active / final).
- Confirm email still arrives with plaintext URL (legacy compat).
- After 30 min, run cron manually (`curl /api/cron/scrub-plaintext-tokens`), confirm plaintext columns NULL'd.
- After scrub, refresh the verify endpoint, confirm `reportUrl`/`intakeUrl` no longer present.
- Confirm `/report/standalone/[token]` still loads via the email link (long-TTL hash unaffected).
**Why Opus:** test-design judgment — picking representative SKUs per archetype, identifying edge cases (e.g., archetype B where `prepopulated-intake` returns null because state metadata missing).

### Task 10 — cron-job.org registration (Haiku)
**Files:** `scripts/setup-cronjob-org.js`
**Acceptance:**
- Add the new entry per §3.2.
- Run `node scripts/setup-cronjob-org.js` after PR merges to register the job (post-deploy step, included in §5.4 rollout checklist).
- Hourly schedule confirmed via cron-job.org dashboard.

### Task 11 — Docs updates (Sonnet)
**Files:** `ARCHITECTURE.md`, `supabase/CONTEXT.md`, `src/app/api/cron/CONTEXT.md`
**Acceptance:** all three files reflect new schema + cron + plaintext-TTL trade per code-conventions "Architecture as Living Document" rule.

### Task 12 — Single-PR ship (Opus — review-orchestration)
**Files:** PR creation + reviewer-fan-out per project memory `pattern-parallel-domain-reviewers.md`.
**Acceptance:**
- Single PR atomic vs the 12-task swarm.
- Reviewers: code-reviewer (general), security-auditor (token TTL trade), accessibility-reviewer (success page poll states), brand-voice-reviewer (Mercer voice on new copy).
- Pristine-Or-Nothing: every CRITICAL/WARNING/SUGGESTION fixed before merge.
- pre-commit hook (npm build, tsc, vitest) passes per project memory `feedback-verify-before-every-commit.md`.

---

## 5. Verification + rollout

### 5.1 Pre-merge checklist

- [ ] `npm run build` passes (NOT just tsc — per `learned-rule-npm-build-not-tsc.md`).
- [ ] `npm test` passes including new verify-archetype tests.
- [ ] Migration applied to a staging branch DB; `\d orders` shows new columns and index.
- [ ] Manual test plan §Task 9 executed (5 archetypes × 3 states = 15 screenshots attached to PR).
- [ ] Reviewer fan-out punch lists all closed (Pristine-Or-Nothing).
- [ ] Token-security comment matches §2.4 verbatim.
- [ ] No existing playbook (archetype A) regression — DUI test purchase still shows download button.
- [ ] Email path regression-locked — every archetype still delivers the legacy plaintext URL via email.

### 5.2 Deploy

`git push origin master` (per project CLAUDE.md — never `vercel deploy` CLI). Vercel auto-builds. Migration applied via `npx supabase db query --linked` BEFORE the push (so the deployed code has the columns it queries).

### 5.3 Post-deploy registration

```bash
node scripts/setup-cronjob-org.js
```

Expect: `Created: scrub-plaintext-tokens (ID: <jobId>)`. Save jobId to `scripts/cronjob-org-ids.json` (script does this automatically).

### 5.4 Post-deploy smoke test

```bash
# 1. Manually invoke the new cron route (should return scrubbed: 0 on a clean DB)
curl -H "Authorization: Bearer $CRON_AUTH_TOKEN" https://imnotanattorney.com/api/cron/scrub-plaintext-tokens

# 2. Make a real test purchase via the QA coupon (each archetype once)
#    Verify in-page CTA renders within 60s for archetype B.
#    Verify intake CTA renders immediately for C/D.
#    Verify download CTA renders immediately for A (regression).

# 3. After 30 min, re-run the cron and confirm scrubbed > 0 (the test purchases should be NULLed)
curl -H "Authorization: Bearer $CRON_AUTH_TOKEN" https://imnotanattorney.com/api/cron/scrub-plaintext-tokens

# 4. Re-fetch the verify endpoint for one of the test orders, confirm reportUrl / intakeUrl absent
curl "https://imnotanattorney.com/api/checkout/verify?session_id=cs_test_xxx" | jq
```

### 5.5 Rollback

Single-PR atomic per v1 precedent. Rollback options in priority order:
1. **Revert PR** via GitHub UI; Vercel auto-redeploys the prior commit. New plaintext writes stop; existing plaintext data still present but harmless. Cron continues scrubbing → in 30 min everything is back to v1 state.
2. **Disable cron** via cron-job.org dashboard if scrub itself misbehaves.
3. **Manual scrub** via `node scripts/scrub-plaintext-tokens.mjs` to force-NULL all plaintext.
4. **Migration is forward-compatible** — adding nullable columns is reversible by `ALTER TABLE orders DROP COLUMN ...` if absolutely necessary (not expected).

---

## 6. Out of scope (do not do in this PR)

- Touching `content/blog/`, `scripts/blog-pipeline/`, `scripts/qa-existing-post*` (sibling session may be active per `feedback-no-blog-work.md`).
- Changing Stripe price IDs, URL slugs, DB tier_slugs.
- Modifying `/intake/standalone/[token]` or `/report/standalone/[token]` route handlers.
- Modifying the email send path inside webhook or generate.ts.
- Replacing polling with SSE/websocket (bootstrap mode — defer until measurable need).
- Dropping the `standalone_intake_token` plaintext column (the migration `20260408j` deferred drop is now permanently deferred — the column is reactivated, not retired).
- Backfilling plaintext for old orders (no value — those customers got their email link, polling window long since elapsed).
- Adding archetype-D pre-population (orthogonal feature, separate worry).

---

## 7. Open risks (named, not deferred)

| Risk | Mitigation |
|---|---|
| `generateTier9Report` takes >60s under load → archetype B polls time out → bad UX | Existing email path is the safety net (customer always gets the email link). Tier 9 generation latency is monitored via existing Tier 9 stuck-report cron (Part 5e). If p99 latency creeps > 60s, raise polling timeout to 90s in a follow-up. |
| Cron-job.org outage > 1 hour → plaintext sits longer than designed | Bounded blast radius (§2.4). Manual scrub script available. Set up a CV probe IDv2-H1 to alert if any plaintext expires_at > 2h old. |
| Race: `generateTier9Report` updates expires_at AFTER intake-update did → window shortened | Mitigated by `GREATEST(...)` extension in Task 3. Worst-case (read-then-write race): a few ms of window loss; not user-visible. |
| Customer screenshots success page including reportUrl, leaks plaintext via image | Same risk exists today for the email link. No new threat surface. Existing 365-day report-token expiry + customer-initiated rotation covers this. |
| New columns + new fields confuse a partial-rollback (e.g. revert webhook but not generate.ts) | Single-PR atomic ship eliminates this. PR review checklist verifies all 12 tasks land together. |

---

## 8. Cascade check

- **Us:** ship the in-page experience the user actually wanted; resolve v1's documented §4.6 deferred items; raise the floor for every future archetype-B/C/D launch.
- **Buyer:** crisis defendant gets the report/intake CTA in-page; doesn't have to dig through email at 2AM. Archetype B sees their report appear within ~30s. Archetype C/D gets one click to intake.
- **Buyer's downstream (their attorney):** report arrives sooner = better attorney meeting prep.
- **Future-us:** archetype taxonomy + verify-driven render branch becomes the template for every new SKU; no more per-tier copy switches.
- **Ecosystem (other Claude Code teams running Supabase + short-lived bearer tokens):** publishable pattern — DB-stored plaintext with TTL + cron scrub + hash-at-rest fallback for long tail.
- **Adjacent players (other legal-tech post-purchase flows):** the bar for "instant fulfillment" rises. Good — that's a sign the decision is durable.

No node loses. Cascade-positive.

---

## 9. Ready-to-paste handoff prompt

```
Execute the implementation plan at
  C:\Users\email\projects\ImNotAnAttorney-web\docs\plans\2026-04-27-immediate-download-v2.md

Predecessor PRs #213 + #214 already on origin/master (e72e6d7f). Branch off
origin/master in a fresh worktree per pattern-worktree-per-pr-from-master.md.
Single PR atomic. Run the swarm Tasks 1-12 in dependency order. Pristine-Or-
Nothing on every reviewer punch list. Apply the migration via
`npx supabase db query --linked` BEFORE pushing. Register the new cron via
`node scripts/setup-cronjob-org.js` AFTER merge.
```
