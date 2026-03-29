# Score Page Email Capture Data Flow

## Overview

The score page (`/score`) is a free lead magnet that asks 10 questions about a defendant's case and calculates a 0-100 Defense Milestone Score. Upon completion, users see their score with observations and have the option to capture their email to receive a personalized Defense Gap Report and ongoing nurture sequence.

**Data Journey:** Quiz Completion → Score Calculation → Email Capture Form → `/api/subscribe` → Supabase `subscribers` table → Welcome Email (band-aware) → Drip Sequence

---

## Phase 1: Score Calculation (Client-Side)

### Input: The 10 Questions
File: `src/app/score/page.tsx` (lines 64-167)

```typescript
questions = [
  { id: "chargeType", ... },           // drug, dui, white-collar, other-felony, other-misdemeanor
  { id: "timeSinceArrest", ... },      // less-than-1-month, 1-3-months, 3-6-months, 6-12-months, 12-plus-months
  { id: "hasAttorney", ... },          // private, public-defender, no, not-sure
  { id: "motionsFiled", ... },         // yes, no, dont-know
  { id: "hasDiscovery", ... },         // yes, no, dont-know
  { id: "communicationFrequency", ... }, // weekly, monthly, rarely, never
  { id: "strategyDiscussed", ... },    // yes-detail, briefly, no
  { id: "criminalHistory", ... },      // none, misdemeanor, felony, multiple
  { id: "caseStage", ... },            // pre-arrest, arrested, arraigned, pre-trial, trial-prep, sentencing, post-conviction
  { id: "licensedProfession", ... }    // yes-licensed, yes-other, no, student
]
```

### Scoring Algorithm
File: `src/lib/score.ts` (lines 74-309)

The scoring engine calculates a 0-100 score based on weighted observations:

- **Time Since Arrest (30%):** Acts as a penalty multiplier for missing milestones
- **Attorney Type (10%):** +5 for private, 0 for public defender, -15 for none, -10 for unsure
- **Motions Filed (20%):** +15 for yes, -5 to -20 for no (worse if time >= 3-6 months)
- **Discovery (15%):** +10 for yes, -3 to -15 for no (worse if time >= 3-6 months)
- **Communication (15%):** +10 for weekly, 0 for monthly, -10 for rarely, -20 for never
- **Strategy Discussed (10%):** +10 for yes-detail, +2 for briefly, -12 for no
- **Criminal History:** -2 to -5 adjustment
- **Charge-Specific:** Mandatory observation fired for every result
- **Case Stage Interactions:** Adjustments based on case stage + other factors
- **Licensed Profession:** Context observation

**Output Shape:**
```typescript
{
  score: number;          // 0-100, clamped
  band: string;           // "Critical" | "Concerning" | "Average" | "Adequate" | "Excellent"
  observations: string[]; // 3-5 plain-English findings
}
```

**Band Mapping:**
- Score 0-30: Critical
- Score 31-50: Concerning
- Score 51-70: Average
- Score 71-85: Adequate
- Score 86-100: Excellent

---

## Phase 2: Score Display & Email Capture (Client-Side)

### UI Component: `ScoreDisplay`
File: `src/app/score/page.tsx` (lines 322-785+)

After calculation, the page renders:

1. **Score Arc** — Animated circle showing band-colored score
2. **Band Identity** — "Your gut was right. Something is wrong." (validation language)
3. **Observations** — 3-5 contextual findings from the algorithm
4. **Urgency Block** — Time-sensitive warnings (for scores ≤55)
5. **Attorney Email Template** — Charge-specific copy-paste email (if score < 60 + no motions + time >= 1 month)
6. **Origin Story** — "68.3 grams" trust-building narrative
7. **Tribe Identity** — Positioning language ("You're a different kind of defendant")
8. **Email Capture Form** — Band-aware headline + email input
9. **CTAs** — Playbook or Case Decoder based on live status

### Email Capture Form
File: `src/app/score/page.tsx` (lines 544-577)

```typescript
<form onSubmit={async (e) => {
  const emailInput = (form.elements.namedItem("scoreEmail") as HTMLInputElement).value;
  const res = await fetch("/api/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: emailInput,
      source: "score-page",           // ← Identifies source
      scoreBand: result.band,         // ← Critical/Concerning/Average/Adequate/Excellent
      scoreValue: result.score,       // ← 0-100 numeric
      chargeType: answers.chargeType, // ← drug/dui/white-collar/other-felony/other-misdemeanor
    }),
  });
}}>
```

**Data Sent to API:**
- `email`: User's email address
- `source`: "score-page" (hardcoded)
- `scoreBand`: Result band label
- `scoreValue`: Result numeric score
- `chargeType`: User's answer to question 1

---

## Phase 3: Subscription & Welcome Email (Server-Side)

### API Route: `/api/subscribe`
File: `src/app/api/subscribe/route.ts`

#### Step 1: Request Validation
- Rate limit check (5 requests per 60 seconds per IP)
- Email regex validation: `^[^\s@]+@[^\s@]+\.[^\s@]+$`
- Normalize email: `.toLowerCase().trim()`
- Validate `source`: must be in whitelist (includes "score-page")
- Validate `scoreBand`: must be in ["Critical", "Concerning", "Average", "Adequate", "Excellent"]
- Validate `scoreValue`: must be number between 0-100
- Validate `chargeType`: must be in ["drug", "dui", "white-collar", "other-felony", "other-misdemeanor"]

#### Step 2: Subscriber Upsert
File: `src/app/api/subscribe/route.ts` (lines 83-101)

```typescript
const upsertData = {
  email: normalizedEmail,
  source,                      // "score-page"
  unsubscribed_at: null,       // Re-activate if previously unsubscribed
  score_band: scoreBand,       // ← STORED
  score_value: scoreValue,     // ← STORED
  charge_type: chargeType      // ← STORED
};

await supabase.from("subscribers").upsert(upsertData, { onConflict: "email" });
```

**Upsert Behavior:**
- **New email:** Creates row with all fields
- **Existing active:** Updates source, band, score, charge_type
- **Previously unsubscribed:** Clears `unsubscribed_at`, re-activates subscriber

#### Step 3: Drip Deduplication
File: `src/app/api/subscribe/route.ts` (lines 113-135)

```typescript
// Get subscriber ID
const { data: subData } = await supabase
  .from("subscribers")
  .select("id")
  .eq("email", normalizedEmail)
  .single();

if (subData?.id) {
  // Record drip keys to prevent duplicate emails from cron
  const dedupKeys = ["nurture_day0"];
  if (source === "score-page" && scoreBand) {
    dedupKeys.push("score_artifact");  // ← Score result email, not sent by cron
  }

  for (const key of dedupKeys) {
    await supabase.from("drip_emails").upsert(
      { subscriber_id: subData.id, email_key: key },
      { onConflict: "subscriber_id,email_key" }
    );
  }
}
```

**Drip Keys Recorded:**
- `nurture_day0` — Prevents welcome email duplication from cron
- `score_artifact` — (Score-page subscribers only) Prevents cron from sending second score email

#### Step 4: Band-Aware Welcome Email
File: `src/app/api/subscribe/route.ts` (lines 146-205)

**IF source="score-page" AND scoreBand AND scoreValue:**
- Send **Score Artifact Email** (charge-aware, trust-building, no CTA)
- Subject: `Your Defense Milestone Score: {scoreValue}/100 — what this means for your {chargeLabel} case`
- HTML includes: score, band label, score disclaimers, save-this-email message
- Category: `score-artifact`
- **No follow-up link or CTA** — designed to be saved/forwarded

**ELSE (non-score subscribers):**
- Send **Discovery Checklist Welcome** (generic lead magnet)
- Subject: `Your Discovery Checklist (Real Case Findings Inside)`
- HTML includes: origin story, lead magnet CTA, Case Decoder pricing
- Category: `welcome`

---

## Database Schema

### subscribers table
File: `supabase/migrations/009-subscriber-score-columns.sql`

```sql
CREATE TABLE subscribers (
  id UUID PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  source TEXT NOT NULL DEFAULT 'lead-capture',  -- "score-page" for score captures
  score_band TEXT,                               -- NULL for non-score subscribers
  score_value INTEGER,                           -- 0-100 numeric, NULL for non-score
  charge_type TEXT,                              -- drug/dui/white-collar/etc, NULL for non-score
  unsubscribed_at TIMESTAMPTZ,                   -- CAN-SPAM unsubscribe tracking
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_subscribers_score_band ON subscribers(score_band)
  WHERE score_band IS NOT NULL;
```

**Fields Populated by Score Flow:**
- `email`: User input from form
- `source`: "score-page" (hardcoded)
- `score_band`: From result.band
- `score_value`: From result.score
- `charge_type`: From answers.chargeType
- `unsubscribed_at`: NULL (re-activates if previously unsub)
- `created_at`: Timestamp of subscription

### drip_emails table
File: `src/lib/supabase/schema-drip.sql`

```sql
CREATE TABLE drip_emails (
  id UUID PRIMARY KEY,
  subscriber_id UUID NOT NULL REFERENCES subscribers(id),
  email_key TEXT NOT NULL,  -- "nurture_day0", "score_artifact", etc
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(subscriber_id, email_key)
);

CREATE INDEX idx_drip_emails_subscriber_id ON drip_emails(subscriber_id);
CREATE INDEX idx_drip_emails_email_key ON drip_emails(email_key);
```

**Dedup Keys for Score Subscribers:**
- `nurture_day0` — Welcome email (sent immediately)
- `score_artifact` — Score result email (sent immediately, never re-sent by cron)

---

## Data Flow Summary

```
User completes 10 questions
         ↓
calculateScore() [src/lib/score.ts]
         ↓
ScoreDisplay renders result + email form [src/app/score/page.tsx]
         ↓
User submits email address
         ↓
POST /api/subscribe [src/app/api/subscribe/route.ts]
         ↓
Validate email, source, band, score, chargeType
         ↓
Upsert to subscribers table (email, source="score-page", score_band, score_value, charge_type)
         ↓
Record dedup keys: nurture_day0 + score_artifact
         ↓
Send Score Artifact email (band-aware, no CTA)
         ↓
Subscriber ready for drip sequence segmentation
```

---

## Where charge_type & scoreValue Are Currently Used

### 1. Subscribe Endpoint
- **Received:** In form POST body (line 555)
- **Validated:** Against VALID_CHARGES allowlist (line 55)
- **Stored:** To `subscribers.charge_type` and `subscribers.score_value` (lines 85-86)
- **Usage:** Score Artifact email template (charge label generation, lines 157-162)

### 2. Welcome Email HTML
- **scoreBand:** Used for email subject, color coding, disclaimer messaging (lines 166-189)
- **scoreValue:** Used in subject line: "Your Defense Milestone Score: {scoreValue}/100"
- **chargeType:** Used to generate charge label: "your DUI/DWI case", "your drug offense case", etc. (lines 157-162)

### 3. Future Drip Sequence Segmentation
- **Not yet implemented** but table is ready for it
- Index on `score_band` exists to enable segmented nurture (line 14 of migration 009)
- Drip system can branch sequences based on `subscribers.score_band` and `subscribers.charge_type`

---

## Where charge_type & scoreValue Could Be Added

### 1. Score Page UI
- Display charge-specific messaging in observations (already done per charge type via `getChargeSpecificObservation`)
- Could add band + charge to hero section: "Your DUI Defense Scored: Critical"

### 2. Playbook/CTA Selection Logic
- Current: Routes based only on chargeType → playbook slug (lines 585)
- Could enhance: Route based on `chargeType + scoreBand` (e.g., "DUI + Critical" → primer, "DUI + Adequate" → advanced)

### 3. Intake Form Pre-population
- Score page could pass chargeType → checkout → intake form (pre-fill charge field)
- Currently: Separate flows

### 4. Drip Email Sequence Branching
- Current: Cron sends generic nurture sequence
- Enhancement: Use `score_band` and `charge_type` to branch into 5 sequences × 5 charge types = 25 variants
- Example: Critical + DUI = "Evidence preservation emergency" email; Adequate + DUI = "Advanced challenge strategies"

### 5. Case Scoring Analytics
- Track which charge types + score bands convert best
- Example: "Drug cases scoring 'Concerning' convert to Case Decoder at 3.2x higher rate"

---

## Critical Notes

### Data Integrity
- **Validation is strict:** All band, score, and charge values validated before storage
- **Idempotent:** Resubmitting same email updates row (doesn't create duplicate)
- **Re-subscription:** Previously unsubscribed users can opt back in — `unsubscribed_at` is cleared

### Privacy
- Score page displays: "Your answers are not stored" (page.tsx line 44, score-artifact email line 180)
- This is **technically accurate:** Quiz answers are NOT stored — only the final score result and charge type are
- If need full answers, would require schema change + consent

### Email Delivery
- Score Artifact email: Sent immediately via Resend with category "score-artifact"
- Welcome email: Sent immediately via Resend with category "welcome"
- Drip dedup ensures cron never re-sends these

### Source Field Values
- "score-page" is the unique identifier for score-captured subscribers
- Other sources: "lead-capture", "checkout", "blog", "resources", "dui-72-hours", etc.
- Source is overwritten on re-subscription (latest touchpoint wins)

---

## Files Involved

| File | Role |
|------|------|
| `src/app/score/page.tsx` | Score page, form, email capture UI |
| `src/lib/score.ts` | Scoring algorithm, validation |
| `src/app/api/subscribe/route.ts` | Email subscription, upsert, welcome |
| `supabase/migrations/009-subscriber-score-columns.sql` | Table schema additions |
| `src/lib/supabase/schema.sql` | Base schema (subscribers table definition) |
| `src/lib/supabase/schema-drip.sql` | Drip dedup table schema |
| `src/lib/email.ts` | Resend integration (not detailed here) |
