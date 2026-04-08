# Database Layer — supabase/

> Supabase PostgreSQL: 50+ tables, 41 sequential migrations, RLS policies, 3 Edge Functions, and 3 storage buckets. Shared by all three INAA repos (web, engine, business-docs).

## Schema Overview

### Core Tables (web-owned)

| Table | Purpose |
|-------|---------|
| `orders` | Stripe order records: tier, amount, stripe_session_id, refund state, `updated_at` (added 2026-04-08). Standalone product columns: `standalone_product_slug`, `standalone_intake_token_hash` (SHA-256, added 2026-04-08), `standalone_intake` (jsonb), `standalone_report_token_hash`, `standalone_report_storage_path`, `standalone_report_token_expires_at`, `standalone_eval_results`. Legacy `standalone_intake_token` plaintext column retained in schema but no longer written — to be dropped in a follow-up migration. Refund clears all standalone report fields. |
| `cases` | One row per case service purchase. Central state machine: `pending → intake → processing → review → delivered` |
| `intakes` | Case Decoder intake form submissions |
| `ib_intakes` | Intelligence Brief Phase 2 intake submissions |
| `subscribers` | Email list: source tag, drip_sequences[], unsubscribed_at |
| `magic_link_tokens` | Short-lived auth tokens (15-min TTL, single-use) |
| `score_sessions` | Defense Strength Score quiz responses + computed 0–100 score |
| `download_tokens` | 72-hour single-use tokens for playbook PDF delivery |
| `feature_flags` | Feature toggle key/value store |
| `cron_idempotency` | Prevents duplicate cron runs (keyed on date + task name) |
| `operator_tasks` | Operator action queue (stuck cases, UPL flags, review items) |
| `drip_state` | Per-subscriber drip sequence progress (sequence_id, step, last_sent_at) |
| `partners` | Partner referral accounts: commission rate, payout history |
| `partner_referrals` | Referral → order attribution |
| `calculator_results` | Free calculator tool outputs (good-time, SOL, diversion). Shareable via token URL. Captures email post-result. |
| `calculator_aggregates` | Daily calculator analytics (by slug, state, charge_type). Upserted via `increment_calculator_aggregate()` RPC. |

### Engine Tables (engine-owned, read-only from web)

| Table | Purpose |
|-------|---------|
| `processing_jobs` | Job queue: `queued → claimed → completed/failed/retrying`. Claimed via `FOR UPDATE SKIP LOCKED`. |
| `document_pages` | OCR output: raw text per page per document |
| `entity_extractions` | Named entities extracted per document (people, dates, locations, charges) |
| `findings` | Case-level analytical findings from `finding_analysis` worker |
| `job_cost_tracking` | Per-job Claude API token usage + cost (input, output, cache hits) |

### Content Tables

| Table | Purpose |
|-------|---------|
| `demand_signals` | Raw signals from Reddit/search (charge type, content, source, urgency) |
| `demand_scores` | Aggregated demand score per charge type, timestamped |
| `blog_pipeline_jobs` | Tracked blog generation runs (topic, status, output path) |

### Key Schema Notes
- `cases.status` is the primary state machine. Valid transitions enforced at app layer, not DB. Full diagram + 19-status definitions + `ALLOWED_TRANSITIONS` below in the "Case Status State Machine" section.
- `processing_jobs.case_id` links engine jobs back to `cases`. Engine never writes to `cases` directly — it writes job results; web cron reads them.
- RLS: all tables have RLS enabled. Service role key (bypasses RLS) used only in server-side API routes via `supabase/admin.ts`. Anon key never used server-side.

## Migration Pattern

```
supabase/migrations/
  00001_initial_schema.sql
  00002_cases_status.sql
  ...
  00032_partner_portal.sql
```

- 32 migrations, numbered sequentially
- Forward-only: never modify existing migrations
- Each migration is idempotent (`IF NOT EXISTS`, `IF NOT EXISTS` for RLS policies)
- Run locally: `npx supabase db push` (dev) or `npx supabase db push --db-url $PROD_URL` (prod)
- Never drop columns with data — add nullable columns, migrate, then deprecate

## Edge Functions

```
supabase/functions/
  generate-report/        # Case Decoder + Intelligence Brief report generation
  evaluate-report/        # UPL compliance evaluation
  generate-standalone/    # Standalone research product generation (Employment Impact, etc.)
```

### generate-report
- Called via fire-and-forget POST from `/api/generate/case-decoder`
- Loads case intake data from DB
- Calls Claude Opus with extended thinking (16K budget) + `EMOTIONAL-INTELLIGENCE.md` context
- Writes completed report HTML to `cases.report_html`
- On completion: sets `cases.status = 'review'`, creates `operator_tasks` row for review
- On failure: sets `cases.status = 'failed'`, creates `operator_tasks` row with error

### evaluate-report
- Called after `generate-report` completes (chained via job queue or direct POST)
- Calls Claude Sonnet to evaluate `cases.report_html` for UPL violations
- Checks: legal advice language, attorney-client privilege implications, specific outcome predictions
- If PASS: sets `cases.evaluation_status = 'passed'`, operator can deliver
- If FAIL: sets `cases.evaluation_status = 'failed'`, blocks delivery, creates operator task with flagged passages

### evaluate-report — teams in production vs CLI

The `evaluate-report` Edge Function in production implements only **2 teams** from the INAA evaluation framework: UPL compliance + Psychological Intelligence. This is intentional — both run inside a shared 150s Edge Function budget, and adding the other 5 teams (Legal, Defendant Experience, Conversion, Rendering, System Truth) would push total runtime past the hard kill.

The full **7-team framework** lives in the CLI tool at `ImNotAnAttorney/scripts/evaluate-report.mjs` (sibling business-docs repo). Invocation: `node evaluate-report.mjs --file <report.html> --teams upl,legal --model sonnet`. Use the CLI for pre-launch audits, post-fix re-runs, or any time the 5 missing teams matter. Source of truth for criteria and team definitions: `ImNotAnAttorney/system/EVALUATION-TEAM.md`.

If UPL eval exceeds 100s inside the Edge Function, the Psych eval is skipped and partial results are saved — both evals share the same 150s timeout.

### generate-standalone
- Called via fire-and-forget POST from `/api/intake/standalone/[slug]` (customer path) or `/api/generate/standalone` (operator retry)
- Loads order + intake data from `orders` table (standalone_product_slug, standalone_intake)
- Builds prompt from intake data. Supports **24 research product slugs** as of 2026-04-08 (post product stamping sprint):
  - **Infra pre-stamping (3):** employment-impact, judge-profile, motion-opportunity-scan
  - **Wave 1 ($97 Reddit-validated, 8):** breathalyzer-challenge, fst-review, plea-consequences, drug-test-reliability, bail-hearing-prep, sentencing-prep, family-case-research, arrest-report-review
  - **Wave 2 (life-impact, 5):** collateral-consequences, license-risk, custody-impact, immigration-impact, security-clearance
  - **Wave 3 (post-conviction HIGH UPL, 4):** expungement-research, sentence-reduction, appeal-viability, ineffective-counsel
  - **Wave 4 (Reddit net-new, 6):** attorney-performance-review, probation-violation-response, discovery-decoder, constructive-possession, self-surrender-prep, probation-rights
- Architecture: `PRODUCT_META` map (slug -> name + price display), per-slug TypeScript interfaces for intake shape, `buildUserPrompt(slug, intake)` switch with 24 cases. System prompt is shared — UPL-safe + anti-hallucination + HTML output format.
- Anti-hallucination rules baked into every prompt: "Do not fabricate statute citations, case names, or case numbers. If uncertain about a specific state's statute, say 'state law varies — verify current provisions with your attorney'". Free-text user inputs are wrapped in triple-quotes in the prompt; the `sanitizeText` function in the intake route strips incoming triple-quotes to block prompt injection via input escape.
- HIGH UPL products (expungement-research, sentence-reduction, appeal-viability, ineffective-counsel, custody-impact) have extra-cautious framing: "factors that MAY be relevant" never "you should", "based on published criteria, you MAY be eligible" never "you are eligible".
- Calls Claude Sonnet (configurable via `CLAUDE_MODEL` env var, default `claude-sonnet-4-6`)
- Generates cryptographic report token (16 bytes hex); hashes with SHA-256
- Uploads report HTML to `standalone-reports` Storage bucket at `{orderId}.html`
- Updates `orders` with: `standalone_report_token_hash`, `standalone_report_storage_path`, `standalone_report_token_expires_at` (1 year)
- Sends delivery email to customer with `/report/standalone/{plaintextToken}` link
- On failure: updates order status, emails operator with retry curl command
- **Deploy after adding new products:** `npx supabase functions deploy generate-standalone --project-ref jxjbjmgdukwkoclydqdr --no-verify-jwt`

### Deploy Edge Functions
```bash
npx supabase functions deploy generate-report --project-ref jxjbjmgdukwkoclydqdr
npx supabase functions deploy evaluate-report --project-ref jxjbjmgdukwkoclydqdr
npx supabase functions deploy generate-standalone --project-ref jxjbjmgdukwkoclydqdr --no-verify-jwt
```

## Storage Buckets

| Bucket | Purpose | Access |
|--------|---------|--------|
| `discovery-files` | Customer-uploaded case documents (PDFs, images) | Private: service role only |
| `charge-packs` | Playbook PDFs for download | Private: download token required |
| `standalone-reports` | Generated HTML reports for standalone research products (Employment Impact, etc.) | Private: token-hash lookup via report viewer. 5MB limit, `text/html` only. |

## RLS Patterns

All tables default to DENY. Policies added per table:
```sql
-- Customer reads own cases only
CREATE POLICY "customer_read_own" ON cases
  FOR SELECT USING (customer_email = auth.jwt() ->> 'email');

-- Service role bypasses all RLS (used by API routes via supabase/admin.ts)
-- No policy needed — service role is superuser
```

For tables with no user-level access (operator-only like `processing_jobs`): no SELECT policy for anon/customer, only service role.

## How To

- **Add a migration:** Create `supabase/migrations/00033_your_change.sql`. Use `IF NOT EXISTS` for safety. Test with `npx supabase db push` against local Supabase. Never modify existing migration files.
- **Add an Edge Function:** Create `supabase/functions/your-function/index.ts`. Follow the `generate-report` pattern: import Supabase client + Anthropic SDK, handle CORS, validate auth header. Deploy with `npx supabase functions deploy your-function`.
- **Add a new table:** Write migration SQL with RLS enabled (`ALTER TABLE x ENABLE ROW LEVEL SECURITY`). Add policies for customer access if needed. Add service role policy if operator-only. Reference from web via `supabase/admin.ts` (service role client).
- **Debug a failing Edge Function:** Check Supabase dashboard → Edge Functions → Logs. Common failures: missing env var (`ANTHROPIC_API_KEY` not set in Supabase secrets), timeout (Opus calls can take 60s+, set timeout to 150s), CORS (add origin header on non-browser calls).
- **Add Supabase secret (env var):** `npx supabase secrets set VAR_NAME=value --project-ref jxjbjmgdukwkoclydqdr`

## Case Status State Machine

`cases.status` is the primary state machine for every paid service order. Valid transitions are enforced at the app layer (`src/lib/types/operator.ts`), not at the database — the DB stores the status as a plain string. Engine pipeline phases were added in the v4 restructure (March 2026) so the state machine covers Case Decoder, Intelligence Brief, and the full X-Ray / War Room / Situation Room discovery flow.

```
                                    ┌──────────────┐
                                    │ awaiting-     │ ← webhook: no intake found
                                    │ intake        │
                                    └──────┬───────┘
                                           │ intake submitted
                                           ▼
    webhook (has intake) ──────────► ┌─────────────┐
                                     │   intake     │ ← ready for generation
                                     └──────┬──────┘
                                            │ dispatcher (atomic guard)
                                            ▼
                                     ┌─────────────────┐
                                     │  generating      │ ← CD: edge function
                                     │  auto-generating │ ← IB: Phase A running
                                     └──────┬──────────┘
                                      ╱            ╲
                                success            failure / timeout
                                  ╱                    ╲
                      ┌──────────┐              ┌────────────────┐
                      │  review  │              │ generation-    │
                      │          │              │ failed         │
                      └────┬─────┘              └────────────────┘
                           │ operator approves
                           ▼
                      ┌──────────┐
                      │ delivered │──► monitoring (War Room post-delivery)
                      └──────────┘

    IB-specific statuses:
      intake → auto-generating (Phase A) → compiling (Phase B) → review
      intake → auto-generating → researching (judge research pending) → compiling → review

    Discovery-tier statuses (X-Ray+):
      pending → uploaded → submitted → processing → intelligence → strategy → packaging → review → delivered

    From any status:
      (refund webhook) → refunded
      (cron Part 4, 2h) → intake-stalled (from intake, CD only)
      (cron Part 5, 30m) → generation-failed (from generating)
```

### Status Definitions

| Status | Meaning | Tier(s) | Next Step |
|--------|---------|---------|-----------|
| `awaiting-intake` | Paid but no intake form yet | All services | Customer fills intake |
| `intake` | Intake linked, ready for processing | CD, IB | Auto-generates report |
| `generating` | Edge function running (CD) | case-decoder | Wait (30min max) |
| `auto-generating` | IB Phase A running | intelligence-brief | Wait (30min max) |
| `compiling` | IB Phase B running | intelligence-brief | Wait (30min max) |
| `researching` | Judge research pending | intelligence-brief | Optional — Phase B can proceed |
| `generation-failed` | Generation crashed / timed out | CD, IB | Operator retries |
| `pending` | Discovery tier, waiting for upload | X-Ray+ | Customer uploads files |
| `uploaded` | Files uploaded, not yet finalized | X-Ray+ | Customer finalizes |
| `submitted` | Files finalized, ready for processing | X-Ray+ | Engine claims the job |
| `processing` | Discovery pipeline running | X-Ray+ | Jobs complete → intelligence phase |
| `intelligence` | Engine pipeline — intelligence extraction phase | X-Ray+ | → strategy or back to processing |
| `strategy` | Engine pipeline — strategy synthesis phase | X-Ray+ | → packaging or back to intelligence |
| `packaging` | Engine pipeline — final report packaging | X-Ray+ | → review or back to strategy |
| `review` | Report generated, awaiting operator approval | CD, IB, discovery | Operator reviews + delivers |
| `delivered` | Report sent to customer | All | Drip sequence begins; War Room advances to `monitoring` |
| `monitoring` | War Room post-delivery continuous updates | War Room, Situation Room | Weekly progress emails via cron Part 18 |
| `intake-stalled` | Stuck in `intake` for 2+ hours | case-decoder | Operator investigates |
| `refunded` | Full refund processed | All | Report access revoked |
| `cancelled` | Order cancelled pre-delivery | All | Terminal |

### Operator Status Transitions (ALLOWED_TRANSITIONS)

Source: `src/lib/types/operator.ts`. Operators can only trigger transitions listed here from the UI; pipeline code bypasses this map for system-initiated state changes.

```typescript
export const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  // Pre-intake
  "awaiting-intake": ["intake"],
  // CD / IB path
  intake: ["generating", "pending"],
  generating: ["review"],
  // Discovery upload path
  pending: ["uploaded"],
  uploaded: ["submitted"],
  submitted: ["processing"],
  // Engine pipeline phases
  processing: ["intelligence", "review", "submitted"], // back to submitted if issues found
  intelligence: ["strategy", "processing"],
  strategy: ["packaging", "intelligence"],
  packaging: ["review", "strategy"],
  // Review / delivery
  review: ["delivered", "processing"], // back to processing if more work needed
  // War Room post-delivery monitoring
  delivered: ["monitoring"],
};
```

The 4 engine pipeline phases (`intelligence`, `strategy`, `packaging`, `monitoring`) were added when the X-Ray pipeline moved in-house in v4. `refunded` and `cancelled` are not in the manual transitions map — they are set only by the Stripe webhook and the admin order-cancel flow respectively.

## Data Flow

```
Web App (Vercel)                    Edge Functions                    DB (PostgreSQL)
────────────────                    ──────────────                    ───────────────
POST /api/generate/case-decoder ──→ generate-report/                 
  (fire-and-forget 202)             • Opus 4.6 + thinking (16K)      → cases.report_html
                                    • 32K max tokens, 150s timeout   → cases.status = 'review'
                                    • Fallback: generate-worker.mjs  → operator_tasks row

POST /api/evaluate/case-decoder ──→ evaluate-report/
  (fire-and-forget)                 • Sonnet 4.6, temp 0             → cases.eval_results (JSONB)
                                    • UPL + Psych checks             → cases.evaluation_status
                                    • 150s timeout                   → operator_tasks (if FAIL)

GET /api/cron/drip ──────────────→ (inline, no function)
  22 tasks sequentially             → drip_state, email_log, subscribers

GET /api/cron/batch-poller ──────→ (inline)
  Poll Anthropic Batch API          → processing_jobs.status
                                    → cases.section_outputs (JSONB)
```

## Key Constants

| Constant | Value | File:Line |
|----------|-------|-----------|
| Edge Function timeout | 150 seconds (hard kill) | `functions/generate-report/index.ts:6` |
| Report model | `claude-opus-4-6` | `functions/generate-report/index.ts` |
| Thinking budget | 16,000 tokens | `functions/generate-report/index.ts` |
| Max tokens (thinking + output) | 32,000 | `functions/generate-report/index.ts` |
| UPL eval model | `claude-sonnet-4-6` | `functions/evaluate-report/index.ts:14` |
| UPL eval temperature | 0 (deterministic) | `functions/evaluate-report/index.ts:15` |
| Supabase project ref | `jxjbjmgdukwkoclydqdr` | deploy commands, scripts |
| Download token TTL | 72 hours | code reference |
| Stale lock recovery | 5 minutes | `migrations/*028*/cron-executions.sql` |
| Total migrations | 32 sequential | `migrations/` directory |

## Integration Points

**Imports from (web app writes to DB):**
- `/api/checkout` + Stripe webhook → `orders`, `cases`, `download_tokens`
- `/api/intake/*` → `intakes`, `ib_intakes`
- `/api/score` → `score_sessions`, `counters`, `score_aggregates`
- `/api/subscribe` → `subscribers`
- Cron tasks → `drip_state`, `email_log`, `cron_executions`
- Partner routes → `partners`, `partner_referrals`, `partner_magic_links`

**Exports to (web app reads from DB):**
- `cases.report_html` — Edge Function writes, web reads for preview/delivery
- `cases.eval_results` — Edge Function writes UPL results, web gates delivery
- `cases.section_outputs` — IB Phase A sections, Phase B consumes
- `operator_tasks` — Edge Functions create, operator dashboard reads

**Shared with engine repo (read/write):**
- `processing_jobs` — engine writes job results, web reads via cron
- `document_pages` — engine writes OCR output
- `entity_extractions` — engine writes parsed entities
- `findings` — engine writes analysis results
- `job_cost_tracking` — engine writes token metrics
- `cases` — web writes order data, engine links via case_id

## Gotchas

1. **Migration 025 (RLS remediation) must run after all tables exist.** It drops over-permissive `USING(true)` policies and adds explicit `USING(false)` deny policies for defense-in-depth. Running out of order causes missing-table errors.

2. **Migration 028 (cron-executions) must run before cron jobs start.** Distributed lock mechanism replaces `pg_try_advisory_lock()` which is unreliable on Supabase's connection pooler (locks are session-scoped but pooled connections are shared).

3. **Edge Functions use ZERO npm imports.** Cold start latency via esm.sh (60-90s) would consume half the 150s budget. All Supabase operations use raw PostgREST fetch. All Claude calls use raw HTTP.

4. **Opus can exceed 150s timeout on complex cases** (observed: 250-294s). The backup worker (`scripts/generate-worker.mjs`) picks up timed-out cases (`status='generating'` > 3 min) within 5 minutes.

5. **Opus can produce thinking-only responses** (all output in thinking block, zero text). The code retries up to 3 times. Rare but documented.

6. **SECURITY DEFINER functions are callable from REST API.** Migration 025 revokes public/anon execute permission; only service role can call `append_file_url`, `acquire_cron_lock`, etc.

7. **If UPL eval exceeds 100s, Psych eval is skipped** and partial results are saved. Both evals share the 150s timeout.

8. **Never modify existing migration files.** Forward-only: add new migration with `IF NOT EXISTS` guards.

## Maintenance Triggers

- **New table added** → Add to Schema Overview, update RLS section
- **New Edge Function** → Add to Edge Functions section + Data Flow
- **New migration** → Update total count, check ordering dependencies
- **Edge Function model/config changed** → Update Key Constants
- **New table shared with engine** → Add to Shared with engine section
- **RLS policy changed** → Update RLS Patterns section
