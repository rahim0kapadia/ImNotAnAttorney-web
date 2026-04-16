# Tier 9 Standalone SKU Generation Pipeline

**Date:** 2026-04-10
**Repo:** `C:\Users\email\projects\ImNotAnAttorney-web\`
**Problem:** 3 Tier 9 standalone SKUs have deployed landing pages but no backend to generate reports on purchase.
**Spec:** User instructions (no separate spec file, architecture decisions inline below).

## Context

### SKUs (all in `tiers.ts`, test mode)

| Slug | Price | Data Source |
|------|-------|------------|
| `judge-report-card` | $197 | judge_profiles, sentencing_distributions, judge_prosecutor_pairings, bench_jury_divergence, judge_quotes, appellate_trends |
| `officer-background-check` | $97 | officer_reliability |
| `similar-cases-analyzer` | $297 | case_feature_vectors, sentencing_distributions, plea_discount_curves, appellate_trends |

### Key Decision: No AI, No Edge Function

These products query **pre-computed Tier 9 database tables** (43K+ rows). No Claude API call needed. Generation is: DB queries + HTML render + Storage upload + email. Runs inline in a Next.js API route (<5s total), well within Vercel limits.

### Key Decision: Hybrid Checkout Flow

Landing pages link to `/checkout?tier=judge-report-card` (tier checkout path). The webhook currently routes `isDigitalProduct` tiers to the playbook download path. We add a branch that detects Tier 9 slugs and routes them to a standalone-like intake flow instead.

This means:
- **Zero landing page changes**, checkout URL stays the same
- **Checkout API**, unchanged (tier path creates session with `product_type: "digital-product"`)
- **Webhook**, new branch for Tier 9 SKUs (creates intake token, sends intake email)
- **Intake form**, new FIELD_SETS entries for the 3 SKUs
- **Generation**, new Next.js module queries DB, renders HTML, stores, emails

### Key Files

| File | Role |
|------|------|
| `C:\Users\email\projects\ImNotAnAttorney-web\src\lib\tiers.ts` | SKU definitions (already has all 3, `live: false`) |
| `C:\Users\email\projects\ImNotAnAttorney-web\src\lib\products.ts` | Standalone product catalog (need to add 3 entries for `getProduct()`) |
| `C:\Users\email\projects\ImNotAnAttorney-web\src\app\api\webhooks\stripe\route.ts` | Webhook, add Tier 9 branch after order creation |
| `C:\Users\email\projects\ImNotAnAttorney-web\src\app\intake\standalone\[slug]\IntakeFormClient.tsx` | Intake form, add FIELD_SETS for 3 SKUs |
| `C:\Users\email\projects\ImNotAnAttorney-web\src\app\api\intake\standalone\[slug]\route.ts` | Intake API, add validation + Tier 9 generation trigger |
| `C:\Users\email\projects\ImNotAnAttorney-web\src\lib\tier9-reports\` | NEW: generation module (query + render + store + email) |
| `C:\Users\email\projects\ImNotAnAttorney-web\src\app\api\generate\tier9\route.ts` | NEW: operator retry route |
| `C:\Users\email\projects\ImNotAnAttorney-web\src\app\report\standalone\[token]\page.tsx` | Existing report viewer, works as-is |

### Tech Stack

Node.js 20+, Next.js 15 (App Router), @supabase/supabase-js (service role), Resend email, Supabase Storage (`standalone-reports` bucket), TypeScript.

---

## Task 1: Add Tier 9 SKUs to products.ts

**Why:** `getProduct(slug)` is called by the webhook (line 119), intake form page, report viewer page, and delivery emails. Without products.ts entries, these paths return null.

**File:** `C:\Users\email\projects\ImNotAnAttorney-web\src\lib\products.ts`

Add 3 entries to `STANDALONE_PRODUCTS` in the research section. Each needs: name, category "research", price in cents, priceDisplay, delivery "Instant", deliveryDetail, description, intakeFields array, stripePriceId null, upsellTier "case-decoder", upsellText, dripSequenceKey, isActive true.

Intake fields per SKU:
- `judge-report-card`: `["judgeName", "state", "chargeType"]`
- `officer-background-check`: `["officerName", "state"]`
- `similar-cases-analyzer`: `["chargeType", "state"]`

---

## Task 2: Add Tier 9 branch in Stripe webhook

**Why:** Currently, `isDigitalProduct` tiers route to the playbook download path (download token + PDF link). Tier 9 products need intake data before generation.

**File:** `C:\Users\email\projects\ImNotAnAttorney-web\src\app\api\webhooks\stripe\route.ts`

**Where:** After order creation (~line 340), BEFORE the existing `digital-product` check (~line 510).

1. Add constant at top: `const TIER9_SLUGS = new Set(["judge-report-card", "officer-background-check", "similar-cases-analyzer"]);`
2. Add branch: if `productType === "digital-product" && TIER9_SLUGS.has(tier) && orderData`:
   - Generate intake token via `randomBytes(24).toString("base64url")`
   - Hash with `hashToken(intakeToken)`
   - Update order: set `product_type: "standalone"`, `standalone_product_slug: tier`, `standalone_intake_token_hash: intakeTokenHash`
   - Send intake email to customer (same HTML pattern as standalone webhook fast path)
   - Send operator sale notification
   - Return `{ received: true }`

This intercepts Tier 9 SKUs before the playbook path. Remaining `digital-product` tiers (playbooks) fall through to existing code.

---

## Task 3: Create Tier 9 report generation module

**Why:** Core generation logic, queries Tier 9 tables, renders HTML, uploads to Storage, sends delivery email.

**Directory:** `C:\Users\email\projects\ImNotAnAttorney-web\src\lib\tier9-reports\`

### 3a: `constants.ts`, slug set + type guard

### 3b: `query.ts`, database queries

One function per SKU. Uses `createAdminClient()`.

- **`queryJudgeReportCard(intake)`:** Look up judge in `judge_profiles` by name ILIKE + state. Get judge_id. Fetch sentencing_distributions, judge_prosecutor_pairings, bench_jury_divergence, judge_quotes by judge_id. Fetch appellate_trends by jurisdiction. Return typed result + isEmpty flag.
- **`queryOfficerBackground(intake)`:** Query officer_reliability by officer_name ILIKE + optional jurisdiction/state. Return typed result + isEmpty flag.
- **`querySimilarCases(intake)`:** Query case_feature_vectors by charge_slug + jurisdiction. Fetch sentencing_distributions (aggregate for charge_slug), plea_discount_curves, appellate_trends. Return typed result + isEmpty flag.

### 3c: `render.ts`, HTML report templates

One function per SKU. Takes query results, returns HTML string.

Design principles:
- Dark theme (black bg `#0C0A09`, amber `#F59E0B` accents, zinc `#D4D4D8` text)
- Same branded wrapper as standalone reports
- Each data point shows source URL as verification link
- UPL disclaimer at top
- "Data Verification" footer with total source count
- Sections organized by data category
- Tables for structured data (sentencing distributions, pairings)
- Blockquotes for judge quotes with citation

### 3d: `generate.ts`, orchestrator

```
generateTier9Report(orderId: string): Promise<void>
```

Flow:
1. Fetch order from DB (idempotency: skip if `standalone_report_token_hash` already set)
2. Read `standalone_intake` + `standalone_product_slug`
3. Route to correct query function
4. If data isEmpty: send "insufficient data" email to customer + operator alert, return
5. Render HTML
6. Generate crypto token + SHA-256 hash
7. Upload to `standalone-reports` bucket at `{orderId}.html`
8. Update order: `standalone_report_token_hash`, `standalone_report_storage_path`, `standalone_report_token_expires_at` (1 year)
9. Send delivery email with `/report/standalone/{token}` link
10. On failure: email operator with retry curl

Uses: `@/lib/supabase/admin`, `@/lib/email`, `@/lib/site`.

### 3e: `index.ts`, public exports

---

## Task 4: Add intake form fields in IntakeFormClient.tsx

**File:** `C:\Users\email\projects\ImNotAnAttorney-web\src\app\intake\standalone\[slug]\IntakeFormClient.tsx`

Add 3 FIELD_SETS entries:

- `judge-report-card`: text field "judgeName" (Judge's Full Name), select "state", select "chargeType" (from ALLOWED_CHARGE_TYPES)
- `officer-background-check`: text field "officerName" (Officer's Full Name), select "state"
- `similar-cases-analyzer`: select "chargeType", select "state"

All fields required. Follow existing FieldConfig pattern.

---

## Task 5: Add intake validation + Tier 9 generation trigger

**File:** `C:\Users\email\projects\ImNotAnAttorney-web\src\app\api\intake\standalone\[slug]\route.ts`

### 5a: Add validation for Tier 9 fields

In the per-slug validation section, add cases for the 3 slugs:
- `judge-report-card`: judgeName (text, required, max 100), state (VALID_STATES), chargeType (isValidChargeType)
- `officer-background-check`: officerName (text, required, max 100), state (VALID_STATES)
- `similar-cases-analyzer`: chargeType (isValidChargeType), state (VALID_STATES)

### 5b: Route Tier 9 to inline generation

After storing intake, before the Edge Function fire-and-forget, add:

```typescript
if (isTier9Slug(slug)) {
  // Tier 9: generate inline via after() (DB queries only, <5s)
  after(async () => {
    try {
      await generateTier9Report(order.id);
    } catch (err) {
      console.error("[Intake] Tier 9 generation failed:", err);
    }
  });
  return NextResponse.json({
    status: "generating",
    message: "Your report is being generated. You'll receive an email within 60 seconds.",
  });
}
// Existing: fire-and-forget to Edge Function
```

---

## Task 6: Create operator retry route

**File:** `C:\Users\email\projects\ImNotAnAttorney-web\src\app\api\generate\tier9\route.ts`

POST endpoint, auth via OPERATOR_SECRET bearer token. Body: `{ orderId }`. Calls `generateTier9Report(orderId)` synchronously. Returns result. Same pattern as existing `/api/generate/standalone/route.ts`.

---

## Task 7: E2E verification in Stripe test mode

1. Verify TypeScript compiles (`npx tsc,noEmit`)
2. Verify dev server starts
3. Test checkout -> webhook -> intake email flow for each SKU
4. Test intake form submission -> report generation
5. Test report viewer at `/report/standalone/[token]`
6. Test operator retry route
7. **DO NOT flip `live: true`**

---

## Deviations

(None yet, log any plan departures here during execution.)

## Session Notes

- Checkout flow needs NO changes. Landing pages -> `/checkout?tier=judge-report-card` -> tier checkout -> Stripe session with `product_type: "digital-product"` -> webhook intercepts for Tier 9 -> intake email.
- Both tiers.ts (checkout validation) and products.ts (intake/delivery) define the 3 slugs.
- Report viewer at `/report/standalone/[token]` works as-is, reads `orders.standalone_report_token_hash`.
- Intake form at `/intake/standalone/[slug]` works as-is, just needs FIELD_SETS entries.
- If judge/officer not in DB: generation sends "limited data" email + operator alert, does not generate empty report.
