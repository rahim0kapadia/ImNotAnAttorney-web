# Drip Email System - Complete Architecture Map

**Last Updated:** 2026-03-28
**Purpose:** Complete structure of score-related email sequences, cron dispatcher, and charge-type routing points

---

## System Overview

The drip email system is a **multi-sequence orchestration engine** that sends templated emails to subscribers and customers based on:
1. **Time since signup/purchase** (delayDays)
2. **Source** (dui-72-hours, score-abandoned, score-page, organic)
3. **Score band** (Critical, Concerning, Adequate, Excellent)
4. **Purchase tier** (case-decoder, intelligence-brief, x-ray, war-room, witness-pack)
5. **Case status** (awaiting-intake, submitted, generating, delivered, refunded)

**Architecture:** 7+ separate email sequence definitions + 1 unified cron dispatcher that routes to the correct sequence.

---

## File Map

| File | Purpose | Lines | Contains |
|------|---------|-------|----------|
| `src/lib/drip-emails.ts` | Email template definitions + routing functions | 1,900+ | NURTURE_EMAILS, SCORE_CRISIS_EMAILS, SCORE_ADEQUATE_EMAILS, SCORE_REENGAGE_EMAILS, DUI_72_HOUR_EMAILS, ABANDONED_SCORE_EMAILS, WINBACK_EMAILS, POST_PURCHASE_EMAILS, getNextScoreEmail(), getPostPurchaseEmails() |
| `src/lib/cron/drip-nurture.ts` | Part 1 of cron: sends nurture + score + DUI + abandoned + winback emails | 170 | sendNurtureEmails() — routes by source_band |
| `src/lib/cron/drip-post-purchase.ts` | Part 2 of cron: sends tier-specific post-purchase emails | 365 | sendPostPurchaseEmails() — routes by tier + timing mode |
| `src/app/api/cron/drip/route.ts` | Cron orchestrator (runs daily 9 AM EST) | 153 | Task registry, idempotency lock, error isolation |

---

## 1. EMAIL SEQUENCE DEFINITIONS

### 1a. NURTURE_EMAILS (Free subscribers, no purchase yet)

**Location:** `src/lib/drip-emails.ts` lines 158-259
**Trigger:** Subscriber with `source == null` or organic
**Schedule:** Day 1, 3, 5, 7, 10, 14
**Goal:** Build trust → convert to Case Decoder ($97)
**Fallthrough:** After Day 14, subscriber enters WIN-BACK sequence at Day 75+

**Email Sequence:**
- Day 1: "3 Things Your Attorney Should Have Done By Now" (example: file motions)
- Day 3: "What 500 Pages of Discovery Actually Means" (example: weight discrepancies)
- Day 5: "68.3 Grams of Missing Evidence" (real case example)
- Day 7: "Here's What a Case Decoder Includes" (features + pricing)
- Day 10: "Did You Ask Your Attorney Question #4?" (CI reliability)
- Day 14: "Motion Deadlines Don't Wait" (urgency + pricing)

**Routing Logic:** `getNextNurtureEmail(daysSinceSubscribe, sentKeys)` iterates NURTURE_EMAILS array, returns first email where `delayDays <= daysSinceSubscribe && !sentKeys.has(email.key)`.

---

### 1b. SCORE_CRISIS_EMAILS (Critical/Concerning score band subscribers)

**Location:** `src/lib/drip-emails.ts` lines 270-334
**Trigger:** Subscriber with `source == "score-page"` AND `score_band IN ("Critical", "Concerning")`
**Schedule:** Day 1, 2, 5
**Goal:** Rapid re-engagement in 7-day decision window → Case Decoder conversion
**Fallthrough:** After Day 5, subscriber transitions to standard NURTURE_EMAILS at Day 7+ (offset = 7 days from signup)

**Email Sequence:**
- Day 1: "Ask Your Attorney Exactly This" (motion filing question)
  - Hard CTA: Case Decoder $97
- Day 2: "Did Your Attorney Respond?" (validates communication)
  - Dual messaging: If they responded → uncertainty about interpretation. If they didn't → silence pattern.
  - Hard CTA: Case Decoder $97
- Day 5 (TRANSITION): "Still Here" (sets expectations for standard nurture)
  - Signals end of crisis sequence
  - Hard CTA: Case Decoder $97

**Score Variables:** None interpolated (SPEC GAP)

**Charge Type Variants:** None (SPEC GAP)

---

### 1c. SCORE_ADEQUATE_EMAILS (Adequate/Excellent score band subscribers)

**Location:** `src/lib/drip-emails.ts` lines 341-355
**Trigger:** Subscriber with `source == "score-page"` AND `score_band IN ("Adequate", "Excellent")`
**Schedule:** Day 1
**Goal:** Validate result → position Case Decoder as "charge-specific verification"
**Fallthrough:** After Day 1, subscriber transitions to standard NURTURE_EMAILS at Day 3+ (offset = 3 days from signup)

**Email Sequence:**
- Day 1: "Your Score Means Something Specific" (education + positioning)
  - Adequate/Excellent means general milestones hit, NOT charge-specific vulnerabilities addressed
  - Hard CTA: Verify My Defense Is on Track (Case Decoder $97)

**Score Variables:** None interpolated (SPEC GAP)

**Charge Type Variants:** None (SPEC GAP)

---

### 1d. SCORE_REENGAGE_EMAILS (All score subscribers, Days 7+)

**Location:** `src/lib/drip-emails.ts` lines 364-449
**Trigger:** Subscriber with `score_band` set, after band-specific sequences complete
**Schedule:** Day 7, 14, 21, 30
**Goal:** Extended re-engagement with free value (questions + case studies + social proof)
**Fallthrough:** After Day 30, subscriber enters WIN-BACK sequence at Day 75+

**Email Sequence:**
- Day 7: "7 Days Since Your Score. Has Anything Changed?"
  - Two free questions: Discovery status, Motion strategy
  - CTA: Get 15 Questions (Case Decoder $97)
  - **SPEC GAP:** Should say "Your defense score was {{SCORE}}/100. Here's what changed." but doesn't interpolate

- Day 14: "The One Thing Defendants Always Miss"
  - Real case example: 68.3g missing evidence
  - CTA: Get My Case Decoder
  - **SPEC GAP:** Should have 5 charge-type variants ("The one thing DUI defendants miss", "The one thing Drug defendants miss", etc.)

- Day 21: "Same Score. Different Outcome. The Only Difference Was the Questions."
  - Two-defendant comparison story
  - Two more free questions
  - CTA: Get 15 Questions (Case Decoder $97)

- Day 30: "30 Days Since Your Score. One more shot."
  - Feature summary of Case Decoder
  - Final hard CTA: Get My Case Decoder $97
  - Sunset message: "After this, free content only"

**Score Variables:** None interpolated (SPEC GAP)

**Charge Type Variants:** None (SPEC GAP) — Day 14 should be "The one thing {{CHARGE_LABEL}} defendants always miss" with 5 variants (DUI, Drug, White Collar, Other Felony, Other Misdemeanor)

---

### 1e. DUI_72_HOUR_EMAILS (Crisis buyers from "First 72 Hours" lead magnet)

**Location:** `src/lib/drip-emails.ts` lines 468-547
**Trigger:** Subscriber with `source == "dui-72-hours"`
**Schedule:** Day 1, 3, 5, 7
**Goal:** Address DMV deadline urgency (hardest pain point) → bridge to DUI Playbook $97
**Fallthrough:** NONE. No standard nurture fallthrough. Crisis buyers who haven't bought by Day 7 are gone.

**Email Sequence:**
- Day 1: "Have You Requested Your DMV Hearing Yet?" (CRITICAL DEADLINE)
  - Opens with irreversible consequence (automatic license suspension)
  - Action: Call attorney + ask DMV status
  - CTA: Get DUI Defense Playbook $97 (instant download)

- Day 3: "The Two Types of DUI — And Why It Matters for Your Defense"
  - Education: Per se (BAC over .08) vs Impairment DUI
  - Defense angles: Breathalyzer calibration vulnerability for per se
  - CTA: Get DUI Defense Playbook $97

- Day 5: "6 Questions to Bring to Your Attorney Meeting"
  - 6 actionable questions (DMV hearing, theory of defense, dashcam, FST, breathalyzer, outcomes)
  - Bridge: "Those 6 are a start. The Playbook has 26 questions."
  - CTA: Get DUI Defense Playbook $97 (instant)

- Day 7 (LAST): "One Week In. Where Do You Stand?"
  - Acknowledge three outcomes: Met attorney (good), met attorney (vague), no meeting yet
  - Bridge: "You already paid $97. Case-specific questions cost $XXX more."
  - Show upgrade pricing using `upgradeCostBetween("dui-first-offense", "case-decoder")`
  - Hard CTA: Get Case-Specific Questions (Case Decoder)
  - Sunset: "Last email in this sequence. If you ever need us, reply."

**No charge variants** (all DUI-specific)

**No score band logic** (these are crisis buyers, not score respondents)

---

### 1f. ABANDONED_SCORE_EMAILS (Quiz non-completers)

**Location:** `src/lib/drip-emails.ts` lines 556-602
**Trigger:** Subscriber with `source == "score-abandoned"` (started /score quiz but didn't complete)
**Schedule:** Day 1, 2, 5
**Goal:** Re-engage to complete quiz → get baseline score
**Fallthrough:** After Day 5, subscriber transitions to standard NURTURE_EMAILS at Day 7+ (offset = 7 days from signup)

**Email Sequence:**
- Day 1: "You Left Something Unfinished"
  - Frame: 60 seconds, 10 questions, no payment needed
  - Message: Score = baseline to track improvement
  - CTA: Finish My Score (60 Seconds)
  - P.S.: "Over 400 defendants took this month. Average 38/100."

- Day 2: "The #1 Thing Defendants Don't Check (But Should)"
  - Education: Motion filing deadlines
  - Free question they can ask attorney today
  - CTA: Take the Score — See Where You Stand

- Day 5 (LAST): "The Cost of Not Knowing"
  - Framing: Defendants who know where they stand get better outcomes
  - This is the last email about score
  - Two CTAs: (1) Take Defense Milestone Score, (2) Skip to Case Decoder $97

---

### 1g. WINBACK_EMAILS (Cold subscribers 60+ days with no purchase)

**Location:** `src/lib/drip-emails.ts` lines 613-702
**Trigger:** Subscriber who exhausted all other sequences without purchasing AND `daysSinceSubscribe >= 75`
**Schedule:** Day 75, 78, 82, 89, 96
**Goal:** Value-first re-engagement → prove continued relevance → sunset with resubscribe gate
**Suppressed:** For DUI 72-hour subscribers (no fallthrough), for subscribers who have purchased

**Email Sequence:**
- Day 75: "Still Fighting?"
  - Acknowledge time passed
  - Reframe: "If you're still in it, we're still here"
  - Free offer: Check My Defense Score (60 seconds)
  - CTA: Check My Defense Score — Free, 60 Seconds

- Day 78: "What 500 Pages of Drug Trafficking Discovery Actually Contained"
  - Real case: 93.9g → 25.59g (73% missing weight)
  - Substance variance (amphetamine vs MDMA)
  - Zero fingerprint matches
  - Message: All in discovery, attorney hadn't raised
  - CTA: Read Full Case Study
  - P.S.: See what a full Case Decoder report looks like

- Day 82: "247 Defendants Asked This Question Last Month"
  - Question: "Is my attorney actually doing everything?"
  - Stats: 247 took score, avg 38/100, 89% didn't know about motions
  - Social proof: Two testimonials
  - CTA: Take Free Defense Score (60 Seconds)

- Day 89 (GATE): "Do You Want Us to Stop Emailing You?"
  - Invitation: "Click below to stay on the list"
  - If no response → one final email next week, then STOP
  - Resubscribe gate: `%%RESUBSCRIBE_URL%%` (populated by cron with base64-encoded email)
  - CTA: Yes, Keep Sending Me Updates

- Day 96 (FINAL): "Goodbye (Unless You Say Otherwise)"
  - Last email (STOP after this)
  - Resubscribe gate: Click to stay connected
  - Fallback resources: Free score, discovery checklist, blog
  - Message: "If you ever need us again, we're at imnotanattorney.com"

---

### 1h. POST_PURCHASE_EMAILS (Buyers, tier-specific)

**Location:** `src/lib/drip-emails.ts` lines 714+
**Trigger:** Order with `status == "paid"` AND `paid_at >= 90 days ago`
**Schedule:** Varies by tier (Days 0, 1, 2, 3+) with relativeToDelivery, relativeToSubmission timing modes
**Goal:** Reduce buyer's remorse → onboard to intake → delivery → meeting prep → story harvest → upsell

**Email Sequences by Tier:**

#### Case Decoder ($97)
1. **Day 1 (generating):** "Your Case Decoder is being built"
   - Set expectations: Analysis (now) → Review → Delivery (48h)
   - Action: Write case journal while memory fresh
2. **Day 2 (intake reminder):** "Your Case Decoder report is waiting for you"
   - Trigger: Purchase complete but intake not submitted
   - CTA: Complete Your Case Details
3. **Day 0 (delivery):** "Your Attorney Meeting Prep Kit is ready"
   - Trigger: Case status becomes "delivered"
   - Instructions: Where Things Stand → Questions → Email template
4. **Day 3 (relative to delivery):** "How to Prepare for Your Attorney Meeting"
   - Meeting Ready Sheet + email template
   - Practice: Read questions aloud
5. **Day 4 (relative to delivery):** "Your questions are good — but there's context they're missing"
6. **Day 5 (relative to delivery):** Story harvest
7. **Day 7:** Upsell to Intelligence Brief
8. **Day 14:** Referral request

#### Intelligence Brief ($997)
- Similar sequence with Phase 2 intake reminder + longer delivery window

#### X-Ray ($2,497)
- Intake reminder → Discovery upload reminder → Delivery → Meeting prep → Story harvest → Upsell → Referral → Status update

#### War Room ($4,997)
- Intake reminder → Delivery → Meeting prep → Story harvest → Status update → Referral

#### Witness Pack (add-on)
- Delivery → Upload reminder → Status update → Story harvest → Upsell

---

## 2. CRON DISPATCHER LOGIC

### 2a. Main Cron Orchestrator

**File:** `src/app/api/cron/drip/route.ts` (GET /api/cron/drip)

**Schedule:** Daily 9 AM EST (14:00 UTC) via Vercel Cron
**Authentication:** Bearer token (CRON_SECRET, set by Vercel)
**Idempotency:** `cron_executions` table lock (23-hour window prevents duplicate runs)

**Task Registry (sequential execution, isolated error handling):**
```
1. nurture-emails (Part 1)
2. post-purchase-emails (Part 2)
3-8. operator-alerts (review reminders, stuck intakes, etc.)
9-10. compliance-cleanup
11-12. stripe-reconciliation
13-14. customer-lifecycle (expiry warnings, abandoned checkout)
15. pipeline-management
16-17. compliance-cleanup (continued)
18-19. pipeline-health
20-22. monitoring
```

**Error Handling:** Each task wrapped in try/catch. Failed tasks recorded in `failedTasks` array in `cron_runs` table. Gap detection: If last run was >48 hours ago, sends operator alert.

---

### 2b. Nurture Email Dispatcher (Part 1)

**File:** `src/lib/cron/drip-nurture.ts` (sendNurtureEmails)

**Input:** All active (non-unsubscribed) subscribers, fetched in batches of 200

**Batch Optimizations (N+1 fixes):**
1. Fetch all subscribers: `id, email, created_at, score_band, source`
2. Batch fetch all drip_emails for these subscribers
3. Batch fetch all orders with status "paid"/"delivered" (for win-back suppression)

**Routing Priority (per subscriber):**

```typescript
if (sub.source === "dui-72-hours") {
  nextEmail = getNextDui72hEmail(daysSinceSubscribe, sentKeys);
  // NO FALLTHROUGH — crisis buyers who haven't converted by Day 7 are gone
} else if (sub.source === "score-abandoned") {
  nextEmail = getNextAbandonedScoreEmail(daysSinceSubscribe, sentKeys);
  if (!nextEmail && daysSinceSubscribe >= 7) {
    // Fall through to standard nurture with 7-day offset
    nextEmail = getNextNurtureEmail(daysSinceSubscribe - 7, sentKeys);
  }
} else if (sub.score_band) {
  nextEmail = getNextScoreEmail(daysSinceSubscribe, sentKeys, sub.score_band);
  if (!nextEmail) {
    // Fall through to standard nurture with band-specific offset
    const offset = getScoreNurtureOffset(sub.score_band); // 7 for crisis, 3 for adequate
    const adjustedDays = daysSinceSubscribe - offset;
    if (adjustedDays >= 0) {
      nextEmail = getNextNurtureEmail(adjustedDays, sentKeys);
    }
  }
} else {
  // All other sources: standard nurture
  nextEmail = getNextNurtureEmail(daysSinceSubscribe, sentKeys);
}

// WIN-BACK FALLTHROUGH (if no email found and 75+ days with no purchase)
if (!nextEmail && sub.source !== "dui-72-hours" && daysSinceSubscribe >= 75) {
  const hasPurchase = purchasedEmails.has(sub.email.toLowerCase());
  if (!hasPurchase) {
    nextEmail = getNextWinbackEmail(daysSinceSubscribe, sentKeys);
    // Populate resubscribe URL with base64-encoded email
  }
}
```

**Send & Record:**
- Call `sendEmailWithRetry()`
- On success: Insert row to `drip_emails(subscriber_id, email_key)` for dedup
- On failure: Record error, log reason

---

### 2c. Post-Purchase Email Dispatcher (Part 2)

**File:** `src/lib/cron/drip-post-purchase.ts` (sendPostPurchaseEmails)

**Input:** All orders with `status == "paid"` from last 90 days (batches of 200)

**Batch Optimizations (N+1 fixes):**
1. Fetch orders: `id, email, tier, paid_at`
2. Batch fetch subscribers by email (for unsubscribe checks)
3. Batch fetch drip_emails for those subscriber IDs
4. Batch fetch cases by email (for timing mode resolution)
5. Batch fetch higher-tier orders (for upsell skip logic)
6. Batch fetch intakes (for personalization data)

**Timing Modes:**

For each email in `getPostPurchaseEmails(order.tier)`:

1. **Relative to Purchase (default):**
   ```typescript
   if (daysSincePurchase >= email.delayDays && !sentKeys.has(email.key)) {
     nextEmail = email;
   }
   ```

2. **Relative to Delivery (relativeToDelivery: true):**
   ```typescript
   const deliveredCase = cases.find(c => c.status === "delivered" && c.delivered_at);
   if (deliveredCase?.delivered_at) {
     const daysSinceDelivery = (now - deliveredAt) / (1000*60*60*24);
     if (daysSinceDelivery >= email.delayDays && !sentKeys.has(email.key)) {
       nextEmail = email;
     }
   }
   ```

3. **Relative to Submission (relativeToSubmission: true):**
   ```typescript
   const submittedCase = cases.find(c => ["submitted", "processing", "review"].includes(c.status));
   if (submittedCase?.updated_at) {
     const daysSinceSubmission = (now - submittedAt) / (1000*60*60*24);
     if (daysSinceSubmission >= email.delayDays && !sentKeys.has(email.key)) {
       nextEmail = email;
     }
   }
   ```

**Conditional Delivery Guards:**

- **Intake Reminder:** Only send if `case.status === "awaiting-intake"`
- **Upload Reminder:** Only send if `case.file_urls.length === 0 && !pastUploadStatuses.includes(case.status)`
- **IB Phase 2 Reminder:** Only send if IB case exists AND `status === "intake"`
- **Status Update:** Only send if `status IN ["submitted", "processing", "review", "delivered"]`

**Variable Resolution:**

```typescript
// Resolve {{CASE_ID}}, {{EMAIL}}, {{REPORT_URL}}
emailHtml = emailHtml
  .split("{{CASE_ID}}").join(linkedCase?.id || "")
  .split("{{EMAIL}}").join(encodeURIComponent(order.email))
  .split("{{REPORT_URL}}").join(reportUrl);

// Resolve {{DOCUMENT_COUNT}}
if (emailHtml.includes("{{DOCUMENT_COUNT}}")） {
  emailHtml = emailHtml.split("{{DOCUMENT_COUNT}}").join(String(docCount));
}

// Personalize ({{FIRST_NAME}}, etc.)
if (intakeData) {
  emailHtml = personalizeEmailHtml(emailHtml, nextEmail.key, intakeData);
}
```

**Threading (for email conversation grouping):**

```typescript
threadingHeaders: {
  inReplyTo: caseThreadId(linkedCase.id), // Format: <case-{id}@imnotanattorney.com>
  references: caseThreadId(linkedCase.id),
}
```

---

## 3. EMAIL ROUTING MATRIX

### Source + Score Band → Email Sequence

| Source | Score Band | Sequence | Days | Fallthrough | Notes |
|--------|-----------|----------|------|-------------|-------|
| `dui-72-hours` | (none) | DUI_72_HOUR_EMAILS | 1,3,5,7 | **NONE** | Crisis buyers, no standard nurture |
| `score-abandoned` | (any) | ABANDONED_SCORE_EMAILS | 1,2,5 | NURTURE at Day 7+ (offset=7) | Re-engage quiz |
| `score-page` | Critical/Concerning | SCORE_CRISIS_EMAILS | 1,2,5 | NURTURE at Day 7+ (offset=7) | Crisis band |
| `score-page` | Adequate/Excellent | SCORE_ADEQUATE_EMAILS | 1 | NURTURE at Day 3+ (offset=3) | Adequate band |
| Any score_band | (any) | SCORE_REENGAGE_EMAILS | 7,14,21,30 | (applies after band sequence) | All score subscribers |
| Any source | (none) | NURTURE_EMAILS | 1,3,5,7,10,14 | WINBACK at Day 75+ | Standard organic |
| (any) | (any) | WINBACK_EMAILS | 75,78,82,89,96 | **NONE** | Cold subscribers, sunset |

---

## 4. CHARGE-TYPE ROUTING: WHERE IT NEEDS TO BE WIRED

### Entry Point 1: Form Submission (`/api/subscribe` or `/api/score`)

**Current:** Collects email only
**Needed:** Also capture `charge_type` from score quiz form
**Values:** "DUI", "Drug", "White Collar", "Other Felony", "Other Misdemeanor"

```typescript
await supabase.from("subscribers").upsert({
  email: req.body.email,
  source: "score-page",
  score_band: result.band,
  charge_type: req.body.charge_type,  // ← NEW
  score_value: result.score,          // ← NEW (for {{SCORE}} interpolation)
});
```

### Entry Point 2: Cron Fetch (`drip-nurture.ts` line 39)

**Current:**
```typescript
.select("id, email, created_at, score_band, source")
```

**Needed:**
```typescript
.select("id, email, created_at, score_band, source, charge_type, score_value")
```

### Entry Point 3: Router Function (`getNextScoreEmail()` signature)

**Current:** Accepts only `scoreBand`
**Needed:** Also accept `chargeType` and `scoreValue`

```typescript
export function getNextScoreEmail(
  daysSinceSubscribe: number,
  sentKeys: Set<string>,
  scoreBand: string,
  chargeType?: string,    // ← NEW
  scoreValue?: number     // ← NEW
): DripEmail | null
```

### Entry Point 4: Template Variants

**Location:** SCORE_REENGAGE_EMAILS array (lines 364-449)

**Current:** Day 14 email is generic, sent to all charge types
**Needed:** 5 variants for Day 14 (one per charge type)

```typescript
// Before: single email
{ key: "score_reengage_day14", delayDays: 14, subject: "...", html: "..." }

// After: 5 emails
{ key: "score_reengage_day14_dui", delayDays: 14, chargeType: "DUI", html: "The one thing DUI defendants always miss..." },
{ key: "score_reengage_day14_drug", delayDays: 14, chargeType: "Drug", html: "The one thing Drug defendants always miss..." },
// ... 3 more for White Collar, Other Felony, Other Misdemeanor
```

### Entry Point 5: Router Call Site (`drip-nurture.ts` line 103)

**Current:**
```typescript
nextEmail = getNextScoreEmail(daysSinceSubscribe, sentKeys, sub.score_band);
```

**Needed:**
```typescript
nextEmail = getNextScoreEmail(daysSinceSubscribe, sentKeys, sub.score_band, sub.charge_type, sub.score_value);
```

### Entry Point 6: Variable Interpolation (Send Time)

**Current:** No variable substitution
**Needed:** Substitute {{SCORE}}, {{CHARGE_LABEL}} in email HTML + subject

```typescript
let emailHtml = nextEmail.html;
let emailSubject = nextEmail.subject;

// Interpolate {{SCORE}}
if (sub.score_value && emailHtml.includes("{{SCORE}}")) {
  emailHtml = emailHtml.replace(/\{\{SCORE\}\}/g, String(sub.score_value));
  emailSubject = emailSubject.replace(/\{\{SCORE\}\}/g, String(sub.score_value));
}

// Interpolate {{CHARGE_LABEL}}
if (sub.charge_type && emailHtml.includes("{{CHARGE_LABEL}}")) {
  const label = getChargeLabelDisplay(sub.charge_type);
  emailHtml = emailHtml.replace(/\{\{CHARGE_LABEL\}\}/g, label);
  emailSubject = emailSubject.replace(/\{\{CHARGE_LABEL\}\}/g, label);
}

await sendEmailWithRetry({ to, subject: emailSubject, html: emailHtml, ... });
```

---

## 5. IMPLEMENTATION CHECKLIST FOR CHARGE-TYPE ROUTING

### Phase 1: Database & Data Collection
- [ ] Add `charge_type VARCHAR(50)` column to subscribers table
- [ ] Add `score_value INT` column to subscribers table
- [ ] Update `/api/subscribe` to capture charge_type from form submit
- [ ] Update `/api/score` to pass score_value at quiz completion
- [ ] Add migration script

### Phase 2: Cron Plumbing
- [ ] Update `drip-nurture.ts` line 39 to fetch `charge_type, score_value`
- [ ] Update `getNextScoreEmail()` signature to accept new parameters
- [ ] Update call site at line 103 to pass new arguments

### Phase 3: Email Templates
- [ ] Add 5 Day 14 variants to SCORE_REENGAGE_EMAILS (score_reengage_day14_dui, _drug, _white_collar, _other_felony, _other_misdemeanor)
- [ ] (Optional) Add Day 3 email to SCORE_CRISIS_EMAILS: "How {{CHARGE_LABEL}} cases with your score usually play out" (5 variants)

### Phase 4: Variable Interpolation
- [ ] Create `personalizeScoreEmail()` helper in `drip-emails.ts` that substitutes {{SCORE}}, {{CHARGE_LABEL}}
- [ ] Call this helper in `drip-nurture.ts` before `sendEmailWithRetry()`

### Phase 5: Testing & Validation
- [ ] Create test subscribers with different charge_types + score_values
- [ ] Verify drip-nurture cron selects correct Day 14 variant per charge_type
- [ ] Verify variable interpolation in email HTML + subject
- [ ] E2E test from score quiz → email received → variable resolution

---

## 6. KEY FUNCTIONS REFERENCE

| Function | Location | Purpose |
|----------|----------|---------|
| `getNextNurtureEmail()` | drip-emails.ts:1713 | Get next email in NURTURE_EMAILS |
| `getNextScoreEmail()` | drip-emails.ts:1740 | Get next email in SCORE_CRISIS/ADEQUATE/REENGAGE based on band |
| `getScoreNurtureOffset()` | drip-emails.ts:1771 | Return fallthrough offset (7 for crisis, 3 for adequate) |
| `getNextDui72hEmail()` | drip-emails.ts:1787 | Get next email in DUI_72_HOUR_EMAILS |
| `getNextAbandonedScoreEmail()` | drip-emails.ts:1820 | Get next email in ABANDONED_SCORE_EMAILS |
| `getNextWinbackEmail()` | drip-emails.ts:1844 | Get next email in WINBACK_EMAILS |
| `getPostPurchaseEmails()` | drip-emails.ts:1698 | Get all post-purchase emails for a tier |
| `personalizeEmailHtml()` | drip-emails.ts | Substitute {{FIRST_NAME}}, {{CASE_ID}}, etc. for post-purchase emails |
| `sendNurtureEmails()` | drip-nurture.ts:33 | Main cron task for nurture + score + DUI + abandoned + winback |
| `sendPostPurchaseEmails()` | drip-post-purchase.ts:22 | Main cron task for tier-specific post-purchase emails |

---

## 7. TIMING & DELIVERY GUARANTEES

All emails sent via cron run **daily at 9 AM EST** (14:00 UTC), meaning timing is **~24h ± offset based on signup/purchase time**.

**Nurture emails:** Day 1, 3, 5, 7, 10, 14 (relative to signup)
**Score emails:** Day 1, 2, 5 (crisis) or Day 1 (adequate), then Day 7, 14, 21, 30 (re-engage)
**DUI 72h:** Day 1, 3, 5, 7 (no fallthrough)
**Post-purchase:** Day 0 (webhook), Day 1-3 (relative to purchase), Day 3-5 (relative to delivery)
**Winback:** Day 75, 78, 82, 89, 96 (for 75+ day cold subscribers without purchase)

---

## 8. SPEC GAPS vs IMPLEMENTATION

### Gaps (from FLOW-INDEX spec)

1. **Charge-Type Variants Not Implemented:**
   - Flow 3 Email 3: "How {{CHARGE_LABEL}} cases with your score usually play out" — Missing entirely
   - Flow 6 Email 2: "The one thing {{CHARGE_LABEL}} defendants always miss" — Single generic template

2. **Score Value Not Interpolated:**
   - All score emails should use {{SCORE}} variable (e.g., "Your score: 42/100")
   - Implementation uses generic phrasing ("7 days since your score")

3. **Charge Type Not Stored:**
   - Subscribers table missing `charge_type` column
   - Score value stored as band (Critical/Concerning/Adequate/Excellent), not numeric (42, 67, etc.)

### What Actually Works

✅ Band-based routing (Crisis vs Adequate)
✅ Source-based routing (DUI 72h, Score, Abandoned Score, Organic)
✅ Timing-relative modes (relative to delivery, submission, purchase)
✅ Case status guards (intake reminder, upload reminder, etc.)
✅ Fallthrough logic (score → nurture, nurture → winback)
✅ Deduplication (drip_emails table prevents duplicates)
✅ Batch optimization (no N+1 queries)
✅ Idempotency (cron_executions lock)

---

## 9. DATABASE SCHEMA (Relevant Tables)

### subscribers

```sql
CREATE TABLE subscribers (
  id UUID PRIMARY KEY,
  email VARCHAR(255) UNIQUE,
  created_at TIMESTAMP,
  unsubscribed_at TIMESTAMP,           -- CAN-SPAM: if set, skip all sends
  source VARCHAR(50),                  -- dui-72-hours, score-abandoned, score-page, purchase-{tier}
  score_band VARCHAR(20),              -- Critical, Concerning, Adequate, Excellent
  charge_type VARCHAR(50),             -- MISSING: need to add
  score_value INT,                     -- MISSING: need to add (42, 67, etc.)
);
```

### drip_emails (Dedup table)

```sql
CREATE TABLE drip_emails (
  id UUID PRIMARY KEY,
  subscriber_id UUID REFERENCES subscribers(id),
  email_key VARCHAR(100),              -- nurture_day1, score_crisis_day1, etc.
  sent_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(subscriber_id, email_key)
);
```

### cron_runs (Execution log)

```sql
CREATE TABLE cron_runs (
  id UUID PRIMARY KEY,
  result JSONB,                        -- { sent, skipped, errors, cleaned, failedTasks }
  ran_at TIMESTAMP DEFAULT NOW()
);
```

---

## Summary

The drip email system is **architecturally sound** with **7 distinct sequences** routed by source, band, and timing. The main gaps are:

1. **No charge_type field** in subscribers table
2. **No score_value field** in subscribers table (only band stored)
3. **No template variants** for 5 charge types
4. **No variable interpolation** for {{SCORE}}, {{CHARGE_LABEL}}

To fully implement the FLOW-INDEX spec, the system needs these **5 wiring points**: collect data → fetch in cron → pass to router → create variants → interpolate at send time.
