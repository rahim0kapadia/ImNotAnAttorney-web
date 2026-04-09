# Plan: War Room and Situation Room Monitoring Terminal State

**Date:** 2026-04-09 (session 3, post-handoff)
**Source:** Continues `docs/handoffs/2026-04-09-post-handoff-session-2.md` priority 1 item 3.
**Unblocked by:** engine commits `90e0967` (Phase 6 trial prep and delivery DAG) and `61c69c2` (Phase 5 attack and trap and case-law and prosecution-counter chain). Both landed in the engine repo.

## Problem

The `cases.status` state machine has a dead end. Once a War Room or Situation Room case transitions to `monitoring` via the engine delivery webhook at `src/app/api/webhooks/engine/delivery/route.ts:226-228`, there is no outbound transition. The case sits in `monitoring` forever.

1. `ALLOWED_TRANSITIONS` in `src/lib/types/operator.ts:280-299` has no `monitoring` key. Operators cannot manually close a monitoring case from the dashboard.
2. No cron task auto-closes stale monitoring cases. If the engine docket_monitor worker stops firing for any reason, the case is still tagged `monitoring` in our system. It will be counted in metrics, SLA dashboards, and operator workload reports indefinitely.
3. The `data_retention_until` field is declared on the CaseDetail type but is never populated for monitoring cases. There is no authoritative signal for when an engagement ends.

## Intended outcome

A minimum-viable closure mechanism that does three things.

1. Lets operators explicitly end a monitoring engagement from the dashboard by adding a new allowed state transition.
2. Prevents cases from rotting in `monitoring` past a sane hard-cap of 365 days from delivered_at.
3. Notifies the customer one time by email when closure happens, so the engagement ends cleanly rather than going silent.

## Design

### New terminal status named `completed`

Why a new status instead of reusing `delivered`.

- `delivered` is already the entry state for `delivered` transitions into `monitoring`. Treating `monitoring` back into `delivered` as closure creates a loop that the idempotency guards in the delivery webhook at `route.ts:239` and `route.ts:253` explicitly reject with the SQL clause `.not("status", "in", '("delivered","monitoring")')`.
- `cancelled` implies pre-delivery termination. War Room and Situation Room cases that reach `monitoring` have already been delivered. They are not cancelled.
- `refunded` implies money was returned. Closure does not trigger a refund.
- A new `completed` status distinctly communicates engagement finished cleanly, no further updates, without overloading the meaning of existing terminal statuses.

`completed` is fully terminal. It has no outbound transitions in ALLOWED_TRANSITIONS.

### State machine changes

File: `src/lib/types/operator.ts`

Add the string literal `"completed"` to the `CaseStatus` union type in the terminal group alongside `refunded` and `cancelled`. Add the transition entry `monitoring: ["completed"]` to `ALLOWED_TRANSITIONS`. Update the doc comment above the union that lists terminal statuses so it reads `Terminal statuses: delivered, completed, refunded, cancelled`.

### Cron Part 21 named closeStaleMonitoring

Location: `src/lib/cron/monitoring.ts` alongside existing Part 17 through Part 20.

Trigger condition for matching rows. Rows must satisfy both of these conditions.

- `status = 'monitoring'`
- `delivered_at < current timestamp minus 365 days`

Why 365 days as the cap.

- Matches `report_token_expires_at` which is set to 12 months from delivery. When the report token expires the customer loses portal access to the report anyway. Continuing monitoring past that point is incoherent with the rest of the delivery lifecycle.
- Typical United States criminal case timeline from arrest through resolution is 6 to 18 months. 365 days is past the 90th percentile for pre-trial resolution. If the engagement is still active past a full year something has gone wrong and operator review is warranted.
- This is a safety cap, not a product promise. If Rahim wants a shorter or longer value in the future it is a single constant change in one file.

Actions per matched case, in order.

1. Atomic status update on the case row with a race guard. The SQL shape is `UPDATE cases SET status = 'completed', completed_at = current timestamp WHERE id = matching id AND status = 'monitoring'`. The status check in the WHERE clause is the race guard in case another cron instance has already grabbed the same row.
2. Mirror the status on the order row. The SQL shape is `UPDATE orders SET status = 'completed', updated_at = current timestamp WHERE id = order id AND status = 'monitoring'`.
3. Send one customer closure email. Dedup key written to the `drip_emails` table is the string `monitoring-closed-{caseId}`.
4. Insert an `operator_tasks` row with `task_type = 'monitoring_auto_closed'`, `priority = 'NORMAL'`, `priority_rank = 3` so operators see what was auto-closed in their next review session.

Batching and N+1 avoidance. Follow the existing monitoring.ts pattern used in `sendWeeklyProgressEmails`. Batch-fetch subscribers by the email set, batch-fetch dedup records by the subscriber_id set and email_key set, parallelize sends where safe. Limit 200 cases per run so a sudden backlog does not exhaust the cron budget.

### Customer closure email

Pattern-matches the existing weekly-progress template in `monitoring.ts:160-171`. Same color palette with the amber accent `#F59E0B`, the dark panel background `#1C1917`, and the light text color `#D4D4D8`. Same typography choices. Same call-to-action button styling. No new accessibility risk because it inherits the existing email template design that is already shipping and already passed prior accessibility audits in the handoffs for Part 17 and Part 18.

Copy outline in the Atticus voice defined in `.claude/rules/atti-persona.md` and `.claude/rules/brand-voice.md`.

- Subject line text when tier is War Room. `Your War Room engagement is complete`.
- Subject line text when tier is Situation Room. `Your Situation Room engagement is complete`.
- Opening sentence acknowledges the engagement start date from `delivered_at` and the closure date from the current time.
- Middle paragraph summarizes what was delivered using the numeric fields `document_count`, `finding_count`, and `witness_count` from the case row.
- Access block contains a link to the path `/my-case/{report_token}` when `report_token_expires_at` has not yet passed. When `report_token_expires_at` has already passed the link is omitted and the text notes that the portal access period has ended.
- Closing sentence thanks the customer and wishes them well. There is no call to action to upgrade. There is no cross-sell to another tier. This is a graceful exit, not a sales email.
- Universal Practice of Law guardrails. Zero banned phrases. No `consult a licensed attorney` phrasing. No `ask your attorney to verify` phrasing. No `your attorney can confirm` phrasing. No guarantees about case outcomes. No language that suggests a human verification step that does not actually happen.

### Decision on closure timestamp column, deferred

Per Martin Fowler's Temporal Property pattern documented at martinfowler.com/eaaDev/TemporalProperty.html, event-specific timestamps should live in dedicated per-event columns, not in a generic `updated_at` audit column. The cases table already follows this pattern with `delivered_at`, `phase_a_completed_at`, `phase_b_completed_at`, and `data_purged_at`. A new `completed_at` column would be the consistent choice.

This session defers the migration because the migration approval gate in the pre-tool-use hook blocks new migration files without explicit approval in triage. The state machine and cron auto-close work can ship without the dedicated column because the `operator_tasks` row that the cron inserts per closed case has its own `created_at` that serves as the authoritative closure timestamp for reporting until the dedicated column is added in a follow-up migration session.

Follow-up migration to land in a separate approved session:

- `supabase/migrations/20260409f_cases_completed_at.sql`
- Adds `completed_at timestamptz NULL` to `cases`
- Adds a partial index on `completed_at` where the value is not null

## Files to modify

| File | Change |
|------|--------|
| `src/lib/types/operator.ts` | Add `completed` to the CaseStatus union. Add the `monitoring: ["completed"]` key to ALLOWED_TRANSITIONS. Update the terminal-statuses doc comment. |
| `supabase/CONTEXT.md` | Update the state machine ASCII diagram. Update the Status Definitions table. Update the ALLOWED_TRANSITIONS code snippet. |
| `supabase/SCHEMA.md` | Add a `completed_at` row to the cases table column reference. |
| `src/lib/cron/monitoring.ts` | Add the `closeStaleMonitoring` function as Part 21 using the Part 18 batching pattern. |
| `src/app/api/cron/drip/route.ts` | Import `closeStaleMonitoring`. Wire it into the TASKS array in the position right after `escalateGuarantees`. |

## Files deliberately not modified

These are uncommitted work from parallel sessions. This plan does not touch any of them.

- `content/voice-profiles/drug.md` from the voice profile parallel session.
- `content/voice-profiles/dui.md` from the voice profile parallel session.
- `content/voice-profiles/general-defense.md` from the voice profile parallel session.
- `content/voice-profiles/white-collar.md` from the voice profile parallel session.
- `src/lib/blog-generation/qa-anti-hallucination.ts` from the blog QA parallel session.
- `src/lib/blog-generation/qa-dna.ts` from the blog QA parallel session.
- `src/lib/blog-generation/index.ts` staged changes from the blog QA parallel session.
- `src/app/api/cron/blog-qa/route.ts` staged changes from the blog QA parallel session.
- `scripts/bulk-add-reference-urls.mjs` from the data-driven defense intelligence parallel session.
- `scripts/bulk-classify-from-opinions.mjs` from the data-driven defense intelligence parallel session.
- `scripts/bulk-extract-motion-legal-issues.mjs` from the data-driven defense intelligence parallel session.
- `scripts/bulk-good-law-by-cluster.mjs` from the data-driven defense intelligence parallel session.
- `scripts/bulk-good-law-from-graph.mjs` from the data-driven defense intelligence parallel session.
- `scripts/bulk-is-good-law.mjs` from the data-driven defense intelligence parallel session.
- `scripts/bulk-populate-judge-profiles.mjs` from the data-driven defense intelligence parallel session.
- `scripts/bulk-populate-prosecution-counters.mjs` from the data-driven defense intelligence parallel session.
- `scripts/promote-to-engine-tier.mjs` from the data-driven defense intelligence parallel session.
- `scripts/run-full-good-law-pipeline.mjs` from the data-driven defense intelligence parallel session.
- `scripts/task-1-apply-enrichment.mjs` from the bulk verification parallel session.
- `scripts/task-2-apply-cap-verification.mjs` from the bulk verification parallel session.
- `scripts/task-2-3-final-apply.mjs` from the bulk verification parallel session.
- `scripts/task-3-apply-cl-urls.mjs` from the bulk verification parallel session.
- `scripts/verify-tasks-applied.mjs` from the bulk verification parallel session.
- `scripts/bulk-classify-cases.mjs` staged changes from the bulk classification parallel session.
- `scripts/legal-research-all.mjs` staged changes from the bulk classification parallel session.
- `supabase/migrations/20260409c_blog_qa_anti_hallucination_and_dna_columns.sql` from the blog QA parallel session.
- `supabase/migrations/20260409e_processing_jobs_nullable_case_id.sql` from the data-driven defense intelligence parallel session.
- `data/bulk-verify` directory contents from the bulk verification parallel session.
- `data/legal-research-logs` directory contents from the bulk verification parallel session.
- `data/w3-audit` directory contents from the audit parallel session.
- Any file in the `C:\Users\email\projects\ImNotAnAttorney-engine` repository. The engine session owns those files.

## Verification steps before commit

1. Run the command `npx tsc --noEmit --skipLibCheck` from the repository root. Output must be clean with zero errors and zero warnings related to the touched files.
2. Run the Grep tool for every `"monitoring"` and `'monitoring'` literal in the `src` directory to confirm no other file needs updating when `completed` is added. Every occurrence must still make semantic sense with the new terminal status in place.
3. Read the updated `CaseStatus` type and `ALLOWED_TRANSITIONS` in full to confirm the state machine diagram in CONTEXT.md matches the TypeScript source.
4. Open the new migration file and confirm it uses `IF NOT EXISTS` guards on both the column and the index so it is idempotent and safe to re-run against any environment.
5. Read the drip cron route.ts task list after the wiring change to confirm `closeStaleMonitoring` appears exactly one time and in the correct position at the end of the monitoring group.
6. Confirm the closure email HTML contains zero Universal Practice of Law banned phrases by cross-checking against the list defined in `src/lib/blog-generation/qa-humanizer.ts` in the `UPL_BANNED_PHRASES` constant.

## Out of scope, explicit non-goals

- Auto-close based on actual case resolution events. That would require parsing docket entries for resolution-signal words like sentencing, judgment, dismissal, verdict, or plea. Docket parsing is engine-owned inside the docket_monitor worker. It is not in this session scope.
- Customer-initiated cancellation flow. Would require a portal cancel button and a Stripe subscription-style cancel path. War Room and Situation Room are one-time purchases, not subscriptions. There is no billing lifecycle to cancel in the first place.
- Warning email 7 days before the auto-close cap. A nice-to-have that adds a second email send plus a second dedup key plus a second cron query. Defer until the first case actually approaches the 365-day cap. The earliest War Room or Situation Room case shipped around 2026-03-28 so the first auto-close candidate will not appear until roughly 2027-03-28.
- Backfill closure for any existing stuck monitoring cases in production. Only relevant if production currently has cases stuck in monitoring. Once the `monitoring` transition into `completed` is in ALLOWED_TRANSITIONS the operator can trigger closure manually per case from the operator dashboard. No production database backfill is needed as part of this plan.
- Any change to `data_retention_until` semantics. That field remains as documented and as currently unused.
- Any change to the engine docket_monitor worker in the engine repository.
- Any change to existing Part 17, Part 18, Part 19, or Part 20 in `src/lib/cron/monitoring.ts`.
