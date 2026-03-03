# The X-Ray ($2,497) -- Pipeline Documentation

## Pipeline Overview

The X-Ray is a discovery-analysis tier priced at $2,497. Unlike the Case Decoder ($197) and Intelligence Brief ($997), which operate on intake questionnaire data alone, The X-Ray requires the customer to upload actual discovery documents (police reports, lab results, witness statements, etc.) for manual expert analysis. Delivery is 10 business days from document submission.

### End-to-End Flow

```
Customer clicks "Buy" on services page or checkout link
  |
  v
POST /api/checkout (tier=x-ray)
  - Validates tier slug against TIERS allowlist
  - Enforces consent checkbox (server-side, required for tiers >= $2,497)
  - Calculates upgrade credit from prior lower-tier purchases (100%, 12-month window)
  - Creates Stripe Checkout session with metadata: tier, consent_timestamp, upgrade_credit_applied, etc.
  |
  v
Stripe Hosted Checkout (customer pays)
  |
  v
Stripe fires `checkout.session.completed` webhook
  --> POST /api/webhooks/stripe
  - Creates order record (orders table)
  - Looks up most recent intake by email
  - Creates case record with status = "pending" (because requiresDiscovery = true)
  - Sends payment confirmation email to customer (includes upload link)
  - Sends operator notification email
  |
  v
Customer visits /upload?case=<caseId>&email=<email>  (link from confirmation email)
  |
  v
Per-file uploads: POST /api/upload (FormData: file, caseId, email)
  - Validates MIME type, file size (50MB), case ownership
  - Uploads to Supabase Storage (discovery-files bucket, private)
  - Appends file path to cases.file_urls array (atomic via RPC)
  - Sends per-file receipt email to customer
  |
  v
Customer clicks "Submit for Analysis"
  --> POST /api/upload/finalize (JSON: caseId, email)
  - Verifies at least 1 file uploaded
  - Updates case status: "pending" --> "submitted"
  - Sends operator notification: "Documents Ready"
  - Sends customer confirmation: "Analysis Begins"
  |
  v
MANUAL: Operator downloads documents from Supabase Storage dashboard
  - Performs expert analysis using elite defense attorney skills
  - No automated report generation (unlike Case Decoder's edge function)
  |
  v
MANUAL: Operator delivers report (via /api/deliver or manual email)
  - case.status --> "delivered"
  - Post-purchase drip sequence begins (relative to delivered_at)
```

### Case Status Progression

| Status | Meaning | Set By | Next Step |
|--------|---------|--------|-----------|
| `pending` | Paid, awaiting document upload | Stripe webhook | Customer uploads files |
| `submitted` | Documents uploaded and finalized | `/api/upload/finalize` | Operator begins manual analysis |
| `delivered` | Report sent to customer | Operator (manual) | Drip sequence begins |
| `refunded` | Full refund processed | Stripe `charge.refunded` webhook | Access revoked, drip skipped |

Note: If no intake exists at checkout time, the case starts as `awaiting-intake` instead of `pending`. Once the intake is submitted, discovery tiers transition to `pending`.

---

## Discovery Upload Flow

### Entry Point

After payment, the Stripe webhook sends a confirmation email containing a personalized upload link:

```
https://imnotanattorney.com/upload?case=<caseId>&email=<encodedEmail>
```

This link is also available on the checkout success page as a fallback.

### Upload Page (`/upload`)

**Source:** `src/app/upload/page.tsx`

The page requires a `?case=` query parameter. Without it, an error state is shown directing the customer to use their confirmation email link. The `?email=` parameter is optional and pre-fills the email verification field.

The page provides guidance on what to upload:
- Police reports and arrest affidavits
- Lab results and forensic reports
- Witness statements
- Body camera / dashcam footage
- Warrants and affidavits
- Any other evidence provided by their attorney

### Per-File Upload Endpoint

**Source:** `src/app/api/upload/route.ts`

**Method:** `POST /api/upload` (FormData)

**Required fields:** `file`, `caseId`, `email`

**Validation pipeline (in order):**

1. **Input presence** -- All three fields must be present.
2. **MIME type allowlist** (server-side enforcement):
   - `application/pdf`
   - `image/jpeg`, `image/png`, `image/gif`, `image/webp`
   - `text/plain`
   - `application/msword`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`
3. **Case existence** -- The `caseId` must exist in the `cases` table. Returns 403 (not 404) to avoid leaking whether a case ID exists.
4. **Ownership verification** -- The provided email must match the email on the case record (case-insensitive comparison). Returns 403 on mismatch.
5. **File size** -- Maximum 50MB per file. Enforced after ownership check to avoid wasting validation cycles on unauthorized requests.

**Storage:**

- **Bucket:** `discovery-files` (Supabase Storage, PRIVATE -- no public URLs)
- **Path pattern:** `{caseId}/{timestamp}-{sanitizedFilename}`
  - Timestamp prefix ensures uniqueness across duplicate filenames
  - Filename sanitization: non-alphanumeric characters (except `.` and `-`) replaced with `_` to prevent path traversal
  - `upsert: false` prevents overwriting existing files

**File path tracking:**

After upload, the storage path is appended to `cases.file_urls` (text array) using an atomic `append_file_url` RPC function. This avoids the race condition inherent in read-modify-write: two concurrent uploads could both read the same array, each append their file, and the second write silently drops the first file path. If the RPC is unavailable, the endpoint falls back to the read-modify-write pattern with a warning.

**Receipt email:**

A confirmation email is sent to the customer for each uploaded file, including the file name, size, and running total of files uploaded.

---

## Finalize Flow

**Source:** `src/app/api/upload/finalize/route.ts`

**Method:** `POST /api/upload/finalize` (JSON)

**Required fields:** `caseId`

**Optional fields:** `email` (for ownership verification)

### What Happens When the Customer Clicks "Submit for Analysis"

1. **Client-side confirmation dialog** -- The upload page shows a `window.confirm()` prompt: "Submit X documents for analysis? This cannot be undone."
2. **Case validation** -- The endpoint verifies the case exists.
3. **Ownership check** -- If email is provided, it must match the case record.
4. **Idempotency** -- If the case is already in `submitted` status, returns success without re-processing. This handles double-clicks, page refreshes, and network retries.
5. **File count validation** -- At least one file must exist in `file_urls`. Prevents accidental empty submissions.
6. **Status transition** -- `cases.status` is updated to `submitted` with the current timestamp in `updated_at`.
7. **Operator notification** -- An email is sent to the operator with: customer email, tier, file count, case ID, and timestamp. The email instructs the operator to log into Supabase to access the files and begin analysis.
8. **Customer confirmation** -- An email is sent confirming receipt of all documents and that analysis is now in progress. Includes the file count and an unsubscribe link (CAN-SPAM).

---

## Consent Requirement

### What It Is

Tiers priced at $2,497 or above (The X-Ray, The War Room, The Situation Room) require the customer to check a consent box acknowledging the service provides legal INFORMATION, not legal ADVICE, and that no attorney-client relationship is created. This is a UPL (unauthorized practice of law) risk mitigation measure.

### Enforcement

**Server-side enforcement** in `POST /api/checkout` (`src/app/api/checkout/route.ts`):

```typescript
if (tierConfig.price >= 249700 && !consent) {
  return NextResponse.json(
    { error: "Consent required for this tier" },
    { status: 400 }
  );
}
```

The threshold is `249700` cents ($2,497.00). This blocks checkout session creation entirely -- the customer cannot reach Stripe's payment form without providing consent.

### What Gets Recorded

When consent is provided, the checkout endpoint captures the current timestamp and passes it through the Stripe session metadata:

```typescript
...(consent && { consent_timestamp: new Date().toISOString() }),
```

The webhook handler then stores `consent_timestamp` on the `orders` record for compliance audit purposes.

---

## What's Built vs. What's Manual

### Built (automated infrastructure)

| Component | Location | Status |
|-----------|----------|--------|
| Stripe checkout with consent enforcement | `src/app/api/checkout/route.ts` | Live |
| Stripe webhook: order + case creation with `pending` status | `src/app/api/webhooks/stripe/route.ts` | Live |
| Upload page with guidance, email verification, drag-and-drop | `src/app/upload/page.tsx` + `src/components/FileUpload.tsx` | Live |
| Per-file upload: validation, storage, receipt email | `src/app/api/upload/route.ts` | Live |
| Finalize: status transition, operator notification, customer confirmation | `src/app/api/upload/finalize/route.ts` | Live |
| Upgrade credit calculation (100% from lower tiers, 12-month window) | `src/app/api/checkout/route.ts` | Live |
| Refund handling (full + partial) | `src/app/api/webhooks/stripe/route.ts` | Live |
| Post-purchase drip emails (upload reminder, delivery, story harvest) | `src/lib/drip-emails.ts` + `src/app/api/cron/drip/route.ts` | Live |
| Payment confirmation email with upload link | `src/app/api/webhooks/stripe/route.ts` | Live |

### Manual (operator workflow)

| Step | Description |
|------|-------------|
| **Document retrieval** | Operator downloads files from Supabase Storage dashboard using `cases.file_urls` paths |
| **Analysis** | Expert review using elite defense attorney skills (god-mode-trial, elite-drug-defense, etc.) |
| **Report generation** | No automated Claude API call for this tier (unlike Case Decoder's edge function). Report is assembled manually. |
| **Delivery** | Operator sends the finished report via `/api/deliver` or manual email. Case status transitions to `delivered`. |

### Not Yet Built

- Automated document processing / OCR pipeline
- Automated report generation for discovery tiers
- Progress tracking visible to the customer (e.g., "analysis 40% complete")
- File management UI for the operator (currently uses raw Supabase dashboard)

---

## Drip Sequence

The X-Ray post-purchase drip is defined in `src/lib/drip-emails.ts`. Three emails are configured:

### 1. Delivery Email (Day 0, relative to purchase)

**Key:** `post_x_ray_delivery`
**Subject:** "Your X-Ray analysis is ready -- here's how to use it"
**Sent by:** The delivery endpoint (not the cron job, since `delayDays: 0`).
**Content:** Instructions on how to use the report -- start with the Discrepancy Report, review the timeline for date conflicts, use the Red Flags summary as the meeting agenda. Includes a story-harvest prompt asking which finding got the biggest reaction from their attorney.

### 2. Upload Reminder (Day 2, relative to purchase)

**Key:** `post_x_ray_upload_reminder`
**Subject:** "Reminder: Upload your discovery documents to begin analysis"
**Sent by:** The daily cron job (`/api/cron/drip`), 2 days after purchase.
**Content:** Reminds the customer to upload their discovery documents if they haven't yet. Includes a CTA button linking to `/upload` and guidance on what to upload (police reports, lab results, witness statements, photos, anything labeled "discovery").
**Note:** This email is sent regardless of whether the customer has already uploaded. There is no status check to suppress it if documents are already submitted.

### 3. Story Harvest (Day 5, relative to delivery)

**Key:** `post_x_ray_story_harvest`
**Subject:** "You met with your attorney -- what was the first finding they hadn't seen?"
**Sent by:** The daily cron job, 5 days after `cases.delivered_at`.
**Flag:** `relativeToDelivery: true` -- the delay is measured from when the report was delivered, not when the customer paid. This is critical for discovery tiers where the gap between payment and delivery can be 10+ business days.
**Content:** Asks the customer which finding surprised their attorney. Reply-based -- no CTA button, just "reply to this email."

### Sequence Timing (Typical X-Ray Customer)

```
Day 0:   Payment confirmed (webhook sends payment confirmation + upload link)
Day 2:   Upload reminder email (cron)
Day 3-5: Customer uploads documents, clicks "Submit for Analysis"
Day 5-15: Manual analysis (10 business days from submission)
Day 15:  Report delivered (delivery email sent immediately)
Day 20:  Story harvest email (5 days after delivery)
```

---

## Refund Policy Interaction

### Standard Refund Handling

The Stripe webhook (`charge.refunded` event) handles both full and partial refunds:

- **Full refund:** `orders.status` set to `refunded`, `cases.status` set to `refunded`. Upgrade credits are voided. Drip sequence is suppressed (cron Part 2 filters by `orders.status = 'paid'`).
- **Partial refund:** `orders.status` stays `paid`, only `refunded_at` timestamp is logged. Upgrade credits and access are preserved.

### Discovery-Specific Considerations

Discovery tiers like The X-Ray involve operator labor once analysis commences. There are currently no code-level distinctions in refund handling between discovery and non-discovery tiers -- the same `charge.refunded` webhook path applies to all tiers equally.

Key implications:

1. **Pre-upload refunds** -- If a customer requests a refund before uploading documents (case status `pending`), no analysis work has begun. Standard full refund applies cleanly.

2. **Post-submission refunds** -- If the customer has submitted documents and analysis is underway (case status `submitted`), a full refund via Stripe still sets the case to `refunded` and voids upgrade credits. There is no automated prorating or partial-refund enforcement based on analysis progress.

3. **Post-delivery refunds** -- If the report has been delivered, a full refund revokes access (the report page returns 403 for refunded cases). The customer retains whatever information they already extracted.

4. **Upgrade credit forfeiture** -- If a customer upgrades from Case Decoder ($197) to X-Ray ($2,497) using upgrade credit, then refunds the X-Ray, the `refunded` status on the X-Ray order means any future checkout will detect the refund and void all upgrade credit (the checkout endpoint checks for any refunded order under that email).

There is no "analysis commenced" flag or time-gated refund window implemented in code. Refund policy enforcement for in-progress discovery analyses is an operator judgment call, executed via the Stripe Dashboard.

---

## Key Source Files

| File | Purpose |
|------|---------|
| `src/lib/stripe.ts` | Tier definitions including `requiresDiscovery: true`, pricing, delivery timeframes |
| `src/app/api/checkout/route.ts` | Checkout session creation, consent enforcement, upgrade credit |
| `src/app/api/webhooks/stripe/route.ts` | Order + case creation, status assignment, refund handling |
| `src/app/upload/page.tsx` | Customer-facing upload page |
| `src/components/FileUpload.tsx` | Drag-and-drop file upload component |
| `src/app/api/upload/route.ts` | Per-file upload endpoint (validation, storage, receipt email) |
| `src/app/api/upload/finalize/route.ts` | Finalize endpoint (status transition, operator notification) |
| `src/lib/drip-emails.ts` | Post-purchase email templates and scheduling |
| `src/app/api/cron/drip/route.ts` | Daily cron job that sends drip emails |
| `src/lib/email.ts` | Resend API wrapper, `sendEmail()`, `escapeHtml()` |
| `src/lib/supabase/admin.ts` | Supabase admin client (service role, bypasses RLS) |

## Related Documentation

- `docs/ARCHITECTURE.md` -- Full system architecture, database schema, state machine, cron jobs
