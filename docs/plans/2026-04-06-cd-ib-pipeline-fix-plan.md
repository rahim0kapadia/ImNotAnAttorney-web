# CD/IB Pipeline Fix Plan + Promise Fulfillment Audit

**Date:** 2026-04-06
**Source:** 8-agent pipeline swarm + 3-agent promise audit (11 agents total)
**Scope:** `C:\Users\email\projects\ImNotAnAttorney-web\` + `C:\Users\email\projects\ImNotAnAttorney-engine\`

---

## Executive Summary

8 parallel explore agents read every file in the CD/IB pipeline (checkout, webhook, intake, CD generation, IB generation, batch poller/crons, delivery, operator dashboard). Of the 15 originally reported gaps, **11 confirmed, 2 refuted, 2 partially confirmed**. The swarm also uncovered **7 new issues** not in the original list.

### Gap Scorecard

| Original ID | Verdict | Severity | Notes |
|---|---|---|---|
| CD #5 | **CONFIRMED** | P0 CRITICAL | `caseId=` vs `case=` param mismatch in operator delivery link |
| IB #1 | **REFUTED** |, | Included CD auto-generates correctly via intake route |
| CD #1 | CONFIRMED | P2 | `auto_deliver` dead code (68 lines) |
| CD #2 | PARTIAL | P1 | Retry UI exists for engine jobs only, not CD/IB generation |
| CD #3 | **CONFIRMED** | P1 | Status transition is data-only, no generation trigger |
| CD #4 | **CONFIRMED + UPGRADED** | P1 | Triple email in Flow B, not double |
| IB #2 | CONFIRMED | P2 | Phase 2 form missing state/charge type |
| IB #3 | **REFUTED** |, | "researching" IS handled via operator-alerts.ts 24h/72h escalation |
| CD #6 | **CONFIRMED** | P1 | Zero customer notification on generation failure |
| CD #7 | **CONFIRMED** | P1 | No progress tracking, report_token only on success |
| CD #8 | CONFIRMED | P2 | delivery_due_at from generation start, not purchase |
| IB #4 | **CONFIRMED** | P1 | Phase B 4 sync calls vs 150s Supabase limit, no backup worker |
| IB #5 | **CONFIRMED** | P2 | No auto-delivery despite "fully automated" marketing |
| IB #6 | CONFIRMED | P3 | "Prosecution Pattern Summary" is subsection 3c, not standalone |

### New Issues Found by Swarm

| ID | Issue | Severity | Found by |
|---|---|---|---|
| NEW-1 | `/api/customer/cases` missing `report_token` in SELECT, `/my-cases` links all broken | P0 | Delivery agent |
| NEW-2 | Intake route uses `fetch().catch()` instead of `after()`, GC risk on Vercel | P1 | Webhook agent |
| NEW-3 | Phase B fire-and-forget trigger has no safety net if fails | P1 | Batch-poller agent |
| NEW-4 | Installment coupon conversion swallows errors silently | P2 | Checkout agent |
| NEW-5 | Operator metrics exclude CD/IB from totals | P3 | Operator agent |
| NEW-6 | Case list filter dropdown missing 12 statuses | P3 | Operator agent |
| NEW-7 | No notes editor or task management controls in operator UI | P3 | Operator agent |

---

## P0, Fix Immediately (blocks real customer experience)

### Fix 1: Delivery URL param mismatch (CD #5)

**Problem:** Batch poller constructs operator "Approve & Deliver" link as `/api/deliver?caseId=xxx&token=yyy` but the GET handler reads `searchParams.get("case")`, returning 400.

**Files:**
- `C:\Users\email\projects\ImNotAnAttorney-web\src\lib\cron\batch-poller.ts` line 186

**Fix:** Change `caseId=` to `case=` in the URL template:
```
BEFORE: ${ctx.siteUrl}/api/deliver?caseId=${row.id}&token=${signOperatorToken(row.id)}
AFTER:  ${ctx.siteUrl}/api/deliver?case=${row.id}&token=${signOperatorToken(row.id)}
```

**Also check:** `operator-alerts.ts` for any other delivery link construction using `caseId=`. Grep for `deliver?caseId` across entire `src/`.

**Impact:** Every CD/IB operator delivery link will work. Currently 100% broken for batch-generated reports.

**Tests:** After fix, trigger a test CD generation via QA checkout, wait for batch completion, verify the operator email link resolves to the delivery confirmation page (not 400).

---

### Fix 2: `/my-cases` broken report links (NEW-1)

**Problem:** `/api/customer/cases` SELECT omits `report_token`, so `/my-cases` page can never render "View Report" or "Track Progress" links.

**Files:**
- `C:\Users\email\projects\ImNotAnAttorney-web\src\app\api\customer\cases\route.ts` line 29

**Fix:** Add `report_token` to the cases SELECT:
```
BEFORE: "id, order_id, tier, status, delivered_at, created_at"
AFTER:  "id, order_id, tier, status, delivered_at, created_at, report_token"
```

**Impact:** Customer portal shows actionable links for the first time.

**Tests:** Login to `/my-cases` with a customer who has a delivered report. Verify "View Report" link appears and navigates to `/report/{token}`.

---

## P1, Fix This Sprint (customer promise violations)

### Fix 3: Customer failure notification (CD #6)

**Problem:** When generation fails, the customer gets zero notification. They wait 48 hours for a report that will never arrive, until SLA breach fires (which also only alerts the operator).

**Files:**
- `C:\Users\email\projects\ImNotAnAttorney-web\src\lib\cron\operator-alerts.ts`, `detectStuckGenerating()` (Part 5, line ~130)
- `C:\Users\email\projects\ImNotAnAttorney-web\src\lib\cron\batch-poller.ts`, `processCDResult()` failure path (line ~80)

**Fix:** At every point where status transitions to `generation-failed`, also send a customer email:
- Subject: "Update on Your {Product Name}"
- Body: "We hit a technical issue generating your report. Our team has been notified and is working on it. You don't need to do anything, we'll have your report ready within [revised timeline]. If you have questions, reply to this email."
- Do NOT expose technical details. Reassuring tone.

**Implementation:**
1. Add a `sendCustomerFailureNotification()` helper in `email.ts`
2. Call it from batch-poller.ts failure path AND operator-alerts.ts stuck-detection path
3. Dedup via `drip_emails` with key `generation_failed_{caseId}` to prevent double-send

**Impact:** Customer knows their report is delayed, not silently abandoned. Meets our promise of proactive communication.

---

### Fix 4: Triple email consolidation (CD #4)

**Problem:** Flow B (pay first, intake later) sends 3 emails: (1) payment confirmation "being prepared", (2) intake confirmation "we're analyzing", (3) generation trigger "we're analyzing". Emails #2 and #3 are near-identical.

**Files:**
- `C:\Users\email\projects\ImNotAnAttorney-web\src\app\api\generate\case-decoder\route.ts` lines 271-300

**Fix:** The generation route should NOT send its own "analyzing" email when triggered by the intake endpoint. Add a `skipEmail` parameter:
1. Intake route passes `{ caseId, skipEmail: true }` when triggering generation (since it already sent its own confirmation)
2. Webhook `after()` passes `{ caseId }` (no skipEmail, its confirmation email is different)
3. Generate route: `if (!body.skipEmail)` before sending the transactional email

**Result:** Flow A = 2 emails (payment + analyzing). Flow B = 2 emails (payment + intake confirmation). Manual retry = 1 email (analyzing).

---

### Fix 5: Status transition triggers generation (CD #3)

**Problem:** Operator clicking "Move to generating" on the dashboard just writes to DB. The case sits in `generating` until stuck-detection marks it failed at 2 hours.

**Files:**
- `C:\Users\email\projects\ImNotAnAttorney-web\src\app\api\operator\cases\[id]\status\route.ts`

**Fix:** After the successful status UPDATE, check if `newStatus === "generating"` and the case tier is `case-decoder`:
```typescript
if (newStatus === "generating" && caseData.tier === "case-decoder") {
  after(async () => {
    await fetch(`${siteUrl}/api/generate/case-decoder`, {
      method: "POST",
      headers: { Authorization: `Bearer ${operatorSecret}`, "Content-Type": "application/json" },
      body: JSON.stringify({ caseId: id, force: true, skipEmail: true }),
    }).catch(err => console.error("Auto-trigger generation failed:", err));
  });
}
```

Similarly for `auto-generating` + `intelligence-brief` tier.

**Impact:** Operator status transitions become meaningful actions, not just labels.

---

### Fix 6: Early report_token for progress tracking (CD #7)

**Problem:** `report_token` is only created when generation succeeds. Customer has no way to check progress during the 48-72 hour wait. The `/my-case/[token]` progress portal is inaccessible.

**Files:**
- `C:\Users\email\projects\ImNotAnAttorney-web\src\app\api\webhooks\stripe\route.ts`, case creation (~line 480-513)

**Fix:** Create `report_token` at case creation time (in the Stripe webhook), not at generation success. The batch poller already handles the case where `report_token` exists, it just updates the HTML.

Steps:
1. In webhook case creation (~line 480-513), generate `report_token = crypto.randomUUID()` and `report_token_hash`, set `report_token_expires_at` to 12 months
2. Include the `/my-case/{token}` link in the payment confirmation email and intake confirmation email
3. The `/my-case/[token]` page already shows status-aware empty states for in-progress cases, this unlocks that feature

**Impact:** Customers can track their case from moment of purchase. Huge trust builder.

---

### Fix 7: CD/IB generation retry button in operator UI (CD #2)

**Problem:** Engine job retry has a button. CD/IB generation retry requires curl commands from operator alert emails.

**Files:**
- `C:\Users\email\projects\ImNotAnAttorney-web\src\app\operator\cases\[id]\page.tsx`, action bar

**Fix:** Add a "Retry Generation" button in the case detail action bar, visible when status is `generation-failed` or `intake-stalled`:
1. Button calls `POST /api/generate/case-decoder` (or intelligence-brief) with `{ caseId, force: true }`
2. Uses existing OPERATOR_SECRET auth
3. On success, refreshes the page to show new status

**Impact:** Operator can retry from the dashboard instead of copy-pasting curl commands.

---

### Fix 8: Phase B timeout protection (IB #4)

**Problem:** Phase B runs 4 sequential Claude calls in a single Edge Function invocation. 150s Supabase timeout. No backup worker.

**Fix (two-part):**

**Part A, Immediate mitigation:** Reduce stuck-detection threshold for `compiling` status from 2 hours to 30 minutes in operator-alerts.ts Part 5b. The 2-hour threshold wastes 3% of the 72-hour delivery window just on detection.

**Part B, Architectural (next sprint):** Convert Phase B to Batch API like Phase A. This eliminates the 150s timeout entirely. Tradeoff: adds 5-30 min polling latency, but the 72-hour SLA has room for that. Implementation lives in the Edge Function, not in the Next.js app.

---

### Fix 9: Intake fire-and-forget GC safety (NEW-2)

**Problem:** Intake route uses plain `fetch().catch()` for generation trigger, which can be garbage collected on Vercel serverless post-response. Webhook uses `after()` correctly.

**Files:**
- `C:\Users\email\projects\ImNotAnAttorney-web\src\app\api\intake\route.ts` line ~278

**Fix:** Replace `fetch(...).catch(...)` with `after(async () => { await fetch(...) })` using Next.js `after()` import.

---

### Fix 10: Phase B trigger safety net (NEW-3)

**Problem:** Batch poller fire-and-forget triggers Phase B via Edge Function. If this fails silently, the case stays in `compiling` indefinitely until stuck-detection cron catches it at 2 hours.

**Fix:** Covered by Fix 8 Part A (reducing stuck threshold to 30 min). No additional code change needed.

---

## P2, Next Sprint (quality improvements)

### Fix 11: Remove `auto_deliver` dead code (CD #1)

**Files:** `C:\Users\email\projects\ImNotAnAttorney-web\src\app\api\generate\case-decoder\route.ts` lines 24-28, 68-137, 155, 257-264, 312-313

**Fix:** Remove the `auto_deliver` parameter handling and the entire `scheduleAutoDelivery()` function (~68 lines). Simplifies the generation route significantly.

---

### Fix 12: Phase 2 form capture state and charge type (IB #2)

**Files:**
- `C:\Users\email\projects\ImNotAnAttorney-web\src\app\intake\intelligence-brief\page.tsx`
- `C:\Users\email\projects\ImNotAnAttorney-web\src\app\api\intake\intelligence-brief\route.ts`

**Fix:** Add optional `state` and `chargeType` fields to the Phase 2 form, pre-populated from the linked CD intake if available. Store in `phase2_data`. Use as override/confirmation, the IB prompts can then reference the most recent data.

---

### Fix 13: `delivery_due_at` from purchase for Flow B (CD #8)

**Files:**
- `C:\Users\email\projects\ImNotAnAttorney-web\src\app\api\generate\case-decoder\route.ts` lines 208-209
- `C:\Users\email\projects\ImNotAnAttorney-web\src\app\api\webhooks\stripe\route.ts`

**Fix:** Set `delivery_due_at` at case creation (webhook) not at generation trigger. For Flow B, the customer sees "48 hours" at purchase, the clock should start then.

**Nuance:** For Flow B, if the customer delays intake by 5 days, the 48-hour SLA was never achievable from purchase time. Consider: set `delivery_due_at` at purchase, but show the customer "48 hours from completing your case details" in the confirmation email. Marketing should align with actual capability.

---

### Fix 14: IB auto-delivery option (IB #5)

**Fix:** After Phase B completes and status transitions to `review`:
1. If eval gate passes -> auto-deliver with a 30-minute review window (operator gets email, delivery proceeds unless they intervene)
2. If eval gate fails -> hold for manual review

This aligns with the "fully automated" marketing promise while preserving quality gates.

---

### Fix 15: Installment coupon error handling (NEW-4)

**Files:** `C:\Users\email\projects\ImNotAnAttorney-web\src\app\api\checkout\route.ts` line ~550

**Fix:** Replace empty `catch {}` with error logging and graceful degradation message. If repeating coupon creation fails, the customer should be informed that the discount will be applied correctly across installments (or fall back to full discount on first payment).

---

## P3, Backlog (polish)

### Fix 16: Marketing copy alignment for "Prosecution Pattern Summary" (IB #6)
Update marketing copy to say "Prosecution Strategy Preview (included in your Intelligence Brief)" instead of presenting it as a standalone deliverable. Files: PricingTable.tsx, checkout/page.tsx, services/page.tsx.

### Fix 17: Operator metrics include CD/IB (NEW-5)
Add CD and IB tiers to the metrics dashboard total_cases and status breakdown queries.

### Fix 18: Case list filter completeness (NEW-6)
Add missing statuses to the filter dropdown: awaiting-intake, intake, intake-stalled, generating, auto-generating, compiling, researching, generation-failed, monitoring.

### Fix 19: Operator notes editor + task management (NEW-7)
Wire up the existing PATCH endpoint to a notes textarea in the case detail UI. Add status buttons to the tasks table.

---

## PART 2: PROMISE FULFILLMENT AUDIT

**Source:** 3-agent audit, marketing pages, email templates, actual generation output
**Question:** Does each tier actually deliver everything we say it does?

### Promise Gap Scorecard

| # | Gap | Tier | Severity | Category |
|---|---, |------|----------|----------|
| PG-1 | **IB missing "A Letter to You"** | $997 | CRITICAL | Generation |
| PG-2 | **IB Appendix C/E numbering mismatch** | $997 | HIGH | Generation |
| PG-3 | **Prosecution Pressure Tactics Decoder conditional** | $997 | HIGH | Generation |
| PG-4 | **Situation Room: 2 workers missing** (Reply Briefs + Witness Statement Analysis) | $9,997 | CRITICAL | Engine |
| PG-5 | **7-Day Follow-Up Window has no system** | $997 | HIGH | Operations |
| PG-6 | **"Dedicated communication channel" doesn't exist** | $9,997 | CRITICAL | Operations |
| PG-7 | **DUI 72h Day 7 email: false "You paid $97" claim** | Free subscribers | CRITICAL | Email |
| PG-8 | **30 days vs 12 months credit window** in nurture emails | All tiers | HIGH | Email |
| PG-9 | **Discovery Checklist link broken** (points to .md file) | Free subscribers | MODERATE | Email |
| PG-10 | **No full refund confirmation email to customer** | All tiers | HIGH | Email |
| PG-11 | **7 of 8 playbooks have zero post-purchase drip** | $97 | HIGH | Email |
| PG-12 | **CD: no section enforcement** (17+ sections in 1 LLM call) | $197 | MODERATE | Generation |
| PG-13 | **War Room: Witness Reliability Rankings THIN** (needs 7-dimension table) | $4,997 | MODERATE | Engine |
| PG-14 | **War Room: Wave Strategy THIN** (lacks S1/S2/S3 sequencing) | $4,997 | MODERATE | Engine |
| PG-15 | **IB email references wrong appendix labels** (D, F, G vs actual) | $997 | MODERATE | Email |
| PG-16 | **X-Ray "4-5 hours of focused work" claim** | $2,497 | LOW | Email |
| PG-17 | **IB "14-day action plan" + "difficult conversation scripts"** referenced in story harvest email | $997 | MODERATE | Email |

---

### PG-1 (CRITICAL): IB missing "A Letter to You"

**Problem:** The CD ($197) includes an elaborate personalized letter (750+ lines of prompt instructions). The IB ($997) has NO letter, no prompt builder in `prompts.ts`, no render slot in `render.ts`. A customer who upgrades from CD to IB loses the personal touch.

**Evidence:** `C:\Users\email\projects\ImNotAnAttorney-web\src\lib\intelligence-brief\prompts.ts`, no `buildLetterToYou()` function. `render.ts:307-332`, no letter slot in section assembly.

**Fix:** Add a `buildLetterToYou()` prompt builder to `prompts.ts`. Add it as the first section in `render.ts` section assembly (after 48-Hour Priority List, before Section 1). Use Phase B (sequential) since it should reference Phase A outputs for personalization.

---

### PG-2 (HIGH): IB Appendix C/E numbering mismatch

**Problem:** DELIVERABLES-BY-TIER says Appendix C = Attorney Script Pack (5 scripts), Appendix E = Your Rights. The code has Appendix C = Your Rights (static). The Script Pack content is scattered across Section 6 subsections (6b email, 6c phone, 6e follow-up, 6i difficult conversations, 6j advocacy).

**Fix:** Two options:
- **Option A (recommended):** Relabel the code to match the spec, rename "Appendix C: Your Rights" to "Appendix E: Your Rights" and add "Appendix C: Attorney Script Pack" that consolidates the 5 scripts from Section 6 into a printable appendix. Section 6 keeps its subsections; Appendix C provides the printer-friendly standalone.
- **Option B:** Update the spec and marketing to match the code. Simpler but means the deliverables list changes.

---

### PG-3 (HIGH): Prosecution Pressure Tactics Decoder is conditional

**Problem:** Listed as deliverable #23 (always-present). In code, it's subsection 4e of the Plea Decision Framework, only generated at full depth when `plea_status` is "offered" or "discussing." Many defendants haven't received a plea offer yet.

**Fix:** Extract the Pressure Tactics Decoder from the plea-conditional block. Make it always-present, prosecution pressure exists whether or not a plea is offered (e.g., overcharging, bail conditions, continuances). Adjust the prompt in `buildLegalOptions()` to always include a Pressure Tactics section even when no plea is on the table.

---

### PG-4 (CRITICAL): Situation Room, 2 workers missing

**Problem:** Reply Brief Templates and Witness Statement Analysis have prompt templates in the engine but NO workers to execute them. These are $9,997 deliverables.

**Files:**
- Template exists: `C:\Users\email\projects\ImNotAnAttorney-engine\prompts\prompt-template-reply-research.md`
- Template exists: `C:\Users\email\projects\ImNotAnAttorney-engine\prompts\prompt-template-witness-research.md`
- No worker file for either

**Fix:** Create `reply-brief.mjs` and `witness-statement-analysis.mjs` workers in the engine repo. Wire them into the Phase 12 (Reply Briefs) and Phase 14 (Trial) pipeline stages. Alternatively, if no Situation Room customer exists yet, add a pre-sale check that these deliverables are noted as "in development", but this is risky at $9,997.

---

### PG-5 (HIGH): 7-Day Follow-Up Window has no system

**Problem:** IB ($997) promises "7-Day Follow-Up Window, 1 clarifying question answered within 24 hours." There is no ticketing system, no SLA tracker, no email routing for follow-up questions. This is a manual operator process with no enforcement.

**Fix:** At minimum:
1. Add a `follow_up_window_ends_at` field to cases (set to delivery + 7 days)
2. Add a section to the delivery email explaining how to submit a follow-up question (reply to email)
3. Add operator task auto-creation when a reply is received via Resend inbound webhook
4. Add SLA tracking, if 24 hours pass without response, escalate

---

### PG-6 (CRITICAL): "Dedicated communication channel" doesn't exist

**Problem:** Situation Room ($9,997) emails promise "dedicated communication channel" and "priority response line" with 2-hour/4-hour SLA. No system exists to support this. At $9,997 this is the highest legal exposure.

**Fix:** For launch readiness:
1. Create a Situation Room-specific email address (e.g., priority@imnotanattorney.com)
2. Set up priority routing in Resend inbound webhook
3. Create operator tasks with URGENT priority and 2h/4h SLA thresholds
4. Add SLA breach detection in monitoring cron

---

### PG-7 (CRITICAL): DUI 72h Day 7 false purchase claim

**Problem:** `dui_72h_day7` email says "You have already paid $97" to DUI checklist subscribers who never bought anything. This is a false claim sent to free subscribers.

**File:** `C:\Users\email\projects\ImNotAnAttorney-web\src\lib\drip-emails.ts` line ~678

**Fix:** Remove "You have already paid $97" line. Present CD at full $197 price with note: "DUI Playbook buyers get $97 credit." Or add a conditional check, but the nurture cron doesn't track purchase history, so the conditional is harder to implement. Safest: remove the false claim entirely.

---

### PG-8 (HIGH): 30 days vs 12 months credit window

**Problem:** Three nurture emails say "within 30 days" for upgrade credit. Actual policy is 12 months (tiers.ts, checkout logic). Customer reads 30 days, panics, buys under pressure or gives up thinking they missed the window.

**Files:** `drip-emails.ts`, `nurture_day7` (~line 278), `nurture_day14` (~line 312), `score_crisis_day2` (~line 372)

**Fix:** Change all "within 30 days" to "within 12 months" to match actual policy. Exception: Playbook-to-CD credit IS 30 days (checkout route confirms). So playbook credit references should stay 30 days; service tier credit references should say 12 months.

---

### PG-9 (MODERATE): Discovery Checklist link broken

**Problem:** Welcome email links to `/guides/discovery-checklist-7-evidence-problems.md`, a raw markdown file path that likely 404s.

**File:** `C:\Users\email\projects\ImNotAnAttorney-web\src\app\api\subscribe\route.ts` line ~205

**Fix:** Change to `/resources` page which has the checklist inline (ungated).

---

### PG-10 (HIGH): No full refund confirmation email to customer

**Problem:** Partial refunds send customer email (T17). Full refunds send ONLY operator email. Customer who gets a full refund has to check their bank statement.

**File:** `C:\Users\email\projects\ImNotAnAttorney-web\src\app\api\webhooks\stripe\route.ts`, `charge.refunded` handler

**Fix:** Add customer email on full refund: "Your refund of ${amount} has been processed. You'll see it reflected in 5-10 business days." Includes case number and closes the loop professionally.

---

### PG-11 (HIGH): 7 of 8 playbooks have zero post-purchase drip

**Problem:** DUI playbook gets 4 post-purchase emails (story harvest, meeting prep, upsell, referral). The other 7 playbooks (drug-possession, probation-violation, white-collar, sex-offense, federal-criminal, drug-trafficking, self-defense) get NOTHING after the download email.

**File:** `C:\Users\email\projects\ImNotAnAttorney-web\src\lib\drip-emails.ts`

**Fix:** Create a generic `post_playbook_*` sequence that works for all playbook types (parameterized by charge type). 4 emails: delivery tips (Day 1), meeting prep (Day 3), CD upsell (Day 7), referral (Day 14). Use charge_type variable for personalization.

---

### PG-12 (MODERATE): CD section enforcement

**Problem:** 17+ sections generated by single LLM call. If Claude drops a section, the renderer doesn't catch it. The eval Edge Function runs async and doesn't gate delivery.

**Fix:** Add a post-generation section validator in the batch poller's `processCDResult()`. Before transitioning to `review`, check that the HTML contains expected section headers (h2 elements). If critical sections are missing (e.g., "15 Questions", "Meeting Toolkit"), set status to `generation-failed` and retry automatically.

---

### PG-13/PG-14 (MODERATE): War Room thin implementations

**PG-13:** Witness Reliability Rankings need a 7-dimension scoring table. Current worker produces narrative analysis but not the structured table the marketing promises.

**PG-14:** Wave Strategy Overview lacks S1/S2/S3 sequencing (staged filing strategy). Current implementation is a flat motion list.

**Fix:** Both are engine-repo work. Update `witness-dossier.mjs` to include a 7-dimension table (consistency, detail, stake, corroboration, demeanor, expertise, motive). Update `motion-analysis.mjs` to include wave sequencing logic.

---

### PG-15 (MODERATE): IB email references wrong appendix labels

**Problem:** `post_intelligence_brief_meeting_prep` references "Appendix F" (Jurisdiction Intelligence Summary), "Appendix G" (Plea Decision Checklist). The actual report has Appendix A (Brady/Giglio), Appendix B (Court Prep), Appendix C (Your Rights), Appendix D (Questions). There is no Appendix F or G.

**Fix:** Update the email template to reference correct appendix labels, or reference content by section name instead of appendix letter (more resilient to future changes).

---

### PG-16 (LOW): X-Ray "4-5 hours of focused work"

**Problem:** `post_x_ray_analysis_started` claims "4-5 hours of focused work" for what is largely an automated pipeline.

**Fix:** Reword to "systematic, document-by-document analysis" without specific hour claims.

---

### PG-17 (MODERATE): IB story harvest references unverified deliverables

**Problem:** `post_intelligence_brief_story_harvest` asks about "14-day action plan" and "difficult conversation scripts." Need to verify these are actual section names in the delivered IB report.

**Evidence:** Section 6 of the IB includes "6d: 14-Day Action Plan" and "6i: Difficult Conversation Scripts" in the prompt (`prompts.ts:708, 744`). **PRESENT but email should match exact section naming.**

---

## Updated Implementation Order

```
Sprint 1 (P0, immediate, same day):
  Fix 1 (CD#5 delivery param) -> Fix 2 (my-cases SELECT) -> deploy -> verify

Sprint 2 (P1, this week, customer-facing):
  Fix 6 (early report_token), biggest trust builder
  Fix 3 (failure notification), no more silent failures
  Fix 4 (triple email consolidation)
  Fix 5 (status triggers generation)
  Fix 7 (retry button)
  Fix 8a (reduce stuck threshold)
  Fix 9 (intake after())
  PG-7 (false $97 claim), CRITICAL, fix same sprint
  PG-8 (30d vs 12m credit), easy text fix
  PG-9 (broken checklist link), easy text fix
  PG-10 (full refund email), customer experience
  PG-15 (wrong appendix labels in email)

Sprint 3 (P1, next week, generation/content):
  PG-1 (IB Letter to You), add prompt + render slot
  PG-2 (IB appendix relabeling)
  PG-3 (Pressure Tactics always-present)
  PG-12 (CD section enforcement)
  PG-17 (verify IB email references)
  Fix 11-15 (pipeline P2 fixes)

Sprint 4 (P2, following week, operations + engine):
  PG-5 (7-Day Follow-Up Window system)
  PG-11 (generic playbook post-purchase drip)
  PG-13 (Witness Reliability 7-dimension table)
  PG-14 (Wave Strategy sequencing)
  PG-16 (X-Ray hours claim)
  Fix 16-19 (pipeline P3 fixes)

Pre-Sale Blockers (before first Situation Room sale):
  PG-4 (2 missing workers, Reply Briefs + Witness Statement)
  PG-6 (dedicated communication channel)
```

```
Sprint 1 (P0, immediate):
  Fix 1 (CD#5 param) -> Fix 2 (my-cases SELECT) -> deploy -> verify

Sprint 2 (P1, this week):
  Fix 6 (early report_token), largest impact, enables progress tracking
  Fix 3 (failure notification), honors the communication promise
  Fix 4 (triple email), clean up email experience
  Fix 5 (status triggers generation), operator workflow
  Fix 7 (retry button), operator productivity
  Fix 8a (reduce stuck threshold), faster failure detection
  Fix 9 (intake after()), reliability

Sprint 3 (P2, next week):
  Fix 11-15

Backlog:
  Fix 16-19
```

---

## Verification Commands

```bash
# Type check
cd C:/Users/email/projects/ImNotAnAttorney-web && npx tsc,noEmit

# Build
cd C:/Users/email/projects/ImNotAnAttorney-web && npm run build

# Playbook E2E (confirms no regressions)
cd C:/Users/email/projects/ImNotAnAttorney-web && node scripts/qa-e2e-test.mjs all

# Grep for any remaining caseId= in delivery URLs
cd C:/Users/email/projects/ImNotAnAttorney-web && grep -r "deliver?caseId" src/

# Grep for fetch().catch() fire-and-forget patterns (should use after())
cd C:/Users/email/projects/ImNotAnAttorney-web && grep -rn "fetch.*catch" src/app/api/intake/
```
