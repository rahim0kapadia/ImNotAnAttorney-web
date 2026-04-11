# Data Availability Gate — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent selling Tier 9 products we can't deliver by checking data availability on the landing page before the customer reaches checkout. Waitlist + Telegram alert for uncovered judges/officers.

**Architecture:** Add a lightweight availability-check API (`/api/check-availability/[slug]`) that returns coverage counts. Each landing page gets a client component (`AvailabilityChecker`) that calls this API when the customer enters a name + state. CTA only appears when data exists. Waitlist table captures demand for uncovered entities. Checkout API and webhook modified to accept pre-populated intake from Stripe metadata, skipping the post-payment intake step.

**Tech Stack:** Next.js 15 (App Router), Supabase (PostgREST + Management API for migration), Stripe metadata, Resend email, Telegram bot (`telegram-send.js`).

**Spec:** `C:\Users\email\projects\ImNotAnAttorney-web\docs\superpowers\specs\2026-04-11-data-availability-gate-design.md`

---

## File Structure

| File | Role | Action |
|------|------|--------|
| `src/lib/tier9-reports/coverage.ts` | Coverage check functions (lightweight query, returns counts) | **CREATE** |
| `src/app/api/check-availability/[slug]/route.ts` | API endpoint for availability check | **CREATE** |
| `src/components/tier9/AvailabilityChecker.tsx` | Client component — intake fields + check + preview/waitlist | **CREATE** |
| `src/app/judge-report-card/page.tsx` | Add AvailabilityChecker, fix CTA link | **MODIFY** |
| `src/app/officer-background-check/page.tsx` | Add AvailabilityChecker, fix CTA link | **MODIFY** |
| `src/app/similar-cases-analyzer/page.tsx` | Add AvailabilityChecker, fix CTA link | **MODIFY** |
| `src/app/api/checkout/route.ts` | Accept intake params in standalone metadata | **MODIFY** |
| `src/app/api/webhooks/stripe/route.ts` | Skip intake email when intake is pre-populated, trigger generation immediately | **MODIFY** |
| `supabase/migrations/20260411_data_waitlist.sql` | Waitlist table | **CREATE** |

---

## Task 1: Create data_waitlist migration

**Files:**
- Create: `supabase/migrations/20260411_data_waitlist.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- Data waitlist — captures demand for uncovered judges/officers
CREATE TABLE IF NOT EXISTS data_waitlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_slug text NOT NULL,
  search_name text NOT NULL,
  search_state text NOT NULL,
  search_charge_type text,
  email text,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz DEFAULT now(),
  notified_at timestamptz,
  converted_at timestamptz,
  UNIQUE (product_slug, search_name, search_state, email)
);

CREATE INDEX idx_waitlist_status ON data_waitlist (status) WHERE status = 'pending';
CREATE INDEX idx_waitlist_product ON data_waitlist (product_slug, search_state);

ALTER TABLE data_waitlist ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='data_waitlist' AND policyname='service_all') THEN
    CREATE POLICY service_all ON data_waitlist FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;
```

- [ ] **Step 2: Apply the migration**

```bash
cd C:/Users/email/projects/ImNotAnAttorney-web
SUPABASE_ACCESS_TOKEN=$(powershell -Command '(Get-Content "C:\Users\email\projects\ImNotAnAttorney\.env.local" | Select-String "SUPABASE_ACCESS_TOKEN=").ToString().Split("=",2)[1]') \
  node scripts/apply-pending-sql.mjs supabase/migrations/20260411_data_waitlist.sql
```

Expected: "SQL applied successfully"

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260411_data_waitlist.sql
git commit -m "feat: add data_waitlist table for Tier 9 availability gate"
```

---

## Task 2: Create coverage check functions

**Files:**
- Create: `src/lib/tier9-reports/coverage.ts`
- Read: `src/lib/tier9-reports/query.ts` (for pattern reference)

- [ ] **Step 1: Create coverage.ts**

This file exports lightweight functions that return coverage counts (not full data) for each product. Reuses the same Supabase admin client and ILIKE escaping as query.ts.

```typescript
/**
 * Lightweight coverage checks for Tier 9 data availability.
 * Returns counts per section — used by /api/check-availability/[slug]
 * to gate purchases before checkout.
 */

import { createAdminClient } from "@/lib/supabase/admin";

function escapeIlike(input: string): string {
  return input.replace(/[%_\\]/g, (ch) => `\\${ch}`);
}

export interface CoverageResult {
  available: boolean;
  coverage: Record<string, number>;
  matchedName: string | null;
  matchedCourt: string | null;
}

export async function checkJudgeCoverage(
  judgeName: string,
  state: string
): Promise<CoverageResult> {
  const supabase = createAdminClient();
  const safeName = escapeIlike(judgeName);

  // Find judge — try with jurisdiction first, fall back to name only
  let judges;
  ({ data: judges } = await supabase
    .from("judge_profiles")
    .select("id, full_name, jurisdiction, positions")
    .ilike("full_name", `%${safeName}%`)
    .eq("jurisdiction", state)
    .limit(3));

  if (!judges?.length) {
    ({ data: judges } = await supabase
      .from("judge_profiles")
      .select("id, full_name, jurisdiction, positions")
      .ilike("full_name", `%${safeName}%`)
      .limit(3));
  }

  if (!judges?.length) {
    return { available: false, coverage: {}, matchedName: null, matchedCourt: null };
  }

  const judge = judges[0];
  const judgeId = judge.id as string;

  // Derive court from positions
  const positions = Array.isArray(judge.positions) ? judge.positions as Array<{ court_id?: string; position_type?: string }> : [];
  const judicial = positions.find((p) => p.position_type === "jud" && p.court_id);

  // Parallel count queries
  const [quotes, sentencing, pairings, appellate, divergence] = await Promise.all([
    supabase.from("judge_quotes").select("id", { count: "exact", head: true }).eq("judge_id", judgeId),
    supabase.from("sentencing_distributions").select("id", { count: "exact", head: true }).eq("judge_id", judgeId),
    supabase.from("judge_prosecutor_pairings").select("id", { count: "exact", head: true }).eq("judge_id", judgeId),
    supabase.from("appellate_trends").select("id", { count: "exact", head: true }).eq("jurisdiction", state),
    supabase.from("bench_jury_divergence").select("id", { count: "exact", head: true }).eq("judge_id", judgeId),
  ]);

  const coverage = {
    quotes: quotes.count ?? 0,
    sentencing: sentencing.count ?? 0,
    pairings: pairings.count ?? 0,
    appellate: appellate.count ?? 0,
    benchJury: divergence.count ?? 0,
  };

  // Available if judge exists AND has meaningful data in at least one section
  const available = coverage.quotes >= 5 || coverage.sentencing >= 1 || coverage.pairings >= 1;

  return {
    available,
    coverage,
    matchedName: judge.full_name as string,
    matchedCourt: (judicial?.court_id as string) ?? null,
  };
}

export async function checkOfficerCoverage(
  officerName: string,
  state: string
): Promise<CoverageResult> {
  const supabase = createAdminClient();
  const safeName = escapeIlike(officerName);

  // Try with state filter first, fall back to name only
  let result = await supabase
    .from("officer_reliability")
    .select("officer_name", { count: "exact", head: true })
    .ilike("officer_name", `%${safeName}%`)
    .eq("jurisdiction", state);

  if (!result.count) {
    result = await supabase
      .from("officer_reliability")
      .select("officer_name", { count: "exact", head: true })
      .ilike("officer_name", `%${safeName}%`);
  }

  const count = result.count ?? 0;

  return {
    available: count >= 1,
    coverage: { officers: count },
    matchedName: null,
    matchedCourt: null,
  };
}

export async function checkSimilarCasesCoverage(
  chargeType: string,
  state: string
): Promise<CoverageResult> {
  const supabase = createAdminClient();

  const [vectors, appellate] = await Promise.all([
    supabase
      .from("case_feature_vectors")
      .select("id", { count: "exact", head: true })
      .eq("charge_slug", chargeType)
      .eq("jurisdiction", state),
    supabase
      .from("appellate_trends")
      .select("id", { count: "exact", head: true })
      .eq("jurisdiction", state),
  ]);

  const coverage = {
    similarCases: vectors.count ?? 0,
    appellate: appellate.count ?? 0,
  };

  const available = coverage.similarCases >= 3;

  return {
    available,
    coverage,
    matchedName: null,
    matchedCourt: null,
  };
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit --skipLibCheck
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/tier9-reports/coverage.ts
git commit -m "feat: add coverage check functions for Tier 9 availability gate"
```

---

## Task 3: Create availability check API route

**Files:**
- Create: `src/app/api/check-availability/[slug]/route.ts`
- Read: `src/lib/tier9-reports/coverage.ts` (from Task 2)
- Read: `src/lib/charge-types.ts` (for validation)

- [ ] **Step 1: Create the API route**

```typescript
/**
 * POST /api/check-availability/[slug]
 * Checks Tier 9 data availability before purchase.
 * Returns coverage counts + available boolean.
 */
import { NextRequest, NextResponse } from "next/server";
import { checkJudgeCoverage, checkOfficerCoverage, checkSimilarCasesCoverage } from "@/lib/tier9-reports/coverage";
import { isValidChargeType } from "@/lib/charge-types";
import { checkRateLimit } from "@/lib/rate-limit";

const TIER9_SLUGS = new Set(["judge-report-card", "officer-background-check", "similar-cases-analyzer"]);
const VALID_STATES = new Set(["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC"]);

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  if (!TIER9_SLUGS.has(slug)) {
    return NextResponse.json({ error: "Invalid product" }, { status: 400 });
  }

  // Rate limit: 10 per minute per IP
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const rl = await checkRateLimit(`check-avail:${ip}`, 10, 60);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const state = typeof body.state === "string" ? body.state.trim().toUpperCase() : "";
  if (!VALID_STATES.has(state)) {
    return NextResponse.json({ error: "Invalid state" }, { status: 400 });
  }

  try {
    switch (slug) {
      case "judge-report-card": {
        const judgeName = typeof body.judgeName === "string" ? body.judgeName.trim() : "";
        if (!judgeName || judgeName.length < 2 || judgeName.length > 100) {
          return NextResponse.json({ error: "Judge name required (2-100 chars)" }, { status: 400 });
        }
        const result = await checkJudgeCoverage(judgeName, state);
        return NextResponse.json(result);
      }

      case "officer-background-check": {
        const officerName = typeof body.officerName === "string" ? body.officerName.trim() : "";
        if (!officerName || officerName.length < 2 || officerName.length > 100) {
          return NextResponse.json({ error: "Officer name required (2-100 chars)" }, { status: 400 });
        }
        const result = await checkOfficerCoverage(officerName, state);
        return NextResponse.json(result);
      }

      case "similar-cases-analyzer": {
        const chargeType = typeof body.chargeType === "string" ? body.chargeType.trim() : "";
        if (!chargeType || !isValidChargeType(chargeType)) {
          return NextResponse.json({ error: "Valid charge type required" }, { status: 400 });
        }
        const result = await checkSimilarCasesCoverage(chargeType, state);
        return NextResponse.json(result);
      }

      default:
        return NextResponse.json({ error: "Invalid product" }, { status: 400 });
    }
  } catch (err) {
    console.error("[check-availability] Error:", err);
    return NextResponse.json({ error: "Service error" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit --skipLibCheck
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/check-availability/[slug]/route.ts
git commit -m "feat: add /api/check-availability/[slug] endpoint for pre-purchase data check"
```

---

## Task 4: Create AvailabilityChecker client component

**Files:**
- Create: `src/components/tier9/AvailabilityChecker.tsx`
- Read: `src/app/plea-analyzer/PleaAnalyzerClient.tsx` (for US_STATES pattern)
- Read: `src/lib/charge-types.ts` (for ALLOWED_CHARGE_TYPES)

This is a `'use client'` component used by all 3 landing pages. It renders intake fields (name + state), calls the availability API, and shows either a coverage preview + CTA or a waitlist capture form.

- [ ] **Step 1: Create the component**

The component handles 6 states: `idle`, `checking`, `available`, `unavailable`, `waitlisted`, `error`. It accepts `slug`, `productName`, `price`, `priceDisplay`, and `checkoutUrl` as props. For judge/officer products, it shows a text input for the name. For similar-cases, it shows a charge type select. All products show a state select.

When `available`, it renders a coverage summary (e.g., "247 court opinions found") and a CTA that links to checkout with intake params in the URL.

When `unavailable`, it shows an email input + "Notify me" button that calls `POST /api/check-availability/[slug]` with `{ ...intakeFields, email, waitlist: true }` to insert into data_waitlist + send Telegram.

The component must follow the project's design system: dark mode, amber (#f59e0b) accents on black, Playfair Display headings, Lato body text. All form inputs need associated labels, 44px touch targets, visible focus states.

Full code for this component is ~200 lines of JSX. The implementing session should:
1. Read `design-system/brand.md` for exact color tokens
2. Read `src/app/plea-analyzer/PleaAnalyzerClient.tsx` for the US_STATES array and form patterns
3. Read `src/app/intake/standalone/[slug]/IntakeFormClient.tsx` for the FIELD_SETS pattern
4. Build the component following those patterns

Key props interface:

```typescript
interface AvailabilityCheckerProps {
  slug: "judge-report-card" | "officer-background-check" | "similar-cases-analyzer";
  productName: string;
  priceDisplay: string;
}
```

Key behavior:
- Form submit calls `POST /api/check-availability/${slug}` with intake fields
- If `available`: show coverage stats + CTA linking to `/checkout?standaloneProduct=${slug}&judgeName=${encodeURIComponent(name)}&state=${state}&chargeType=${chargeType}`
- If `!available`: show waitlist email input
- Waitlist submit calls same endpoint with `waitlist: true` + email
- Store email in `localStorage` under key `inna_email` for future pre-fill
- On mount, read `inna_email` from localStorage to pre-fill email field if waitlist shows

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit --skipLibCheck
```

- [ ] **Step 3: Commit**

```bash
git add src/components/tier9/AvailabilityChecker.tsx
git commit -m "feat: AvailabilityChecker component — pre-purchase data check + waitlist"
```

---

## Task 5: Add waitlist + Telegram to availability API

**Files:**
- Modify: `src/app/api/check-availability/[slug]/route.ts`

- [ ] **Step 1: Add waitlist handling**

When the request body includes `waitlist: true` AND `email`, insert into `data_waitlist` and send Telegram alert. Add this after the coverage check in each case branch:

```typescript
// After the coverage check, before returning:
if (body.waitlist === true && typeof body.email === "string") {
  const email = body.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Valid email required" }, { status: 400 });
  }

  const supabase = (await import("@/lib/supabase/admin")).createAdminClient();
  await supabase.from("data_waitlist").upsert({
    product_slug: slug,
    search_name: /* judgeName or officerName */,
    search_state: state,
    search_charge_type: /* chargeType if applicable */ null,
    email,
  }, { onConflict: "product_slug,search_name,search_state,email" });

  // Telegram alert
  const { exec } = await import("child_process");
  const msg = `New data request: ${/* name */} (${state})\\nProduct: ${slug}\\nCustomer: ${email}\\nCoverage: ${JSON.stringify(result.coverage)}`;
  exec(`node "C:\\Users\\email\\.claude\\scripts\\telegram\\telegram-send.js" --bot legal --message "${msg.replace(/"/g, '\\"')}"`);

  return NextResponse.json({ ...result, waitlisted: true });
}
```

Adapt the `search_name` and message for each product slug.

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit --skipLibCheck
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/check-availability/[slug]/route.ts
git commit -m "feat: waitlist insert + Telegram alert on uncovered data requests"
```

---

## Task 6: Modify landing pages to use AvailabilityChecker

**Files:**
- Modify: `src/app/judge-report-card/page.tsx`
- Modify: `src/app/officer-background-check/page.tsx`
- Modify: `src/app/similar-cases-analyzer/page.tsx`

- [ ] **Step 1: Update judge-report-card page**

Import `AvailabilityChecker` and replace the static CTA section. The page stays a server component — only the checker is a client island.

Replace the hero CTA button and the "Delivered within 60 seconds" line with:

```tsx
<AvailabilityChecker
  slug="judge-report-card"
  productName="Judge Report Card"
  priceDisplay="$197"
/>
```

Remove the standalone CTA `<Link>` elements that link to `/checkout?tier=judge-report-card` (which is broken anyway). The AvailabilityChecker's internal CTA will use the correct `/checkout?standaloneProduct=...` URL with intake params.

Keep all other sections (What You Get, Sample Report, Trust, FAQ, Final CTA) — but update the Final CTA section at the bottom to also use `<AvailabilityChecker>` instead of a static link.

- [ ] **Step 2: Update officer-background-check page**

Same pattern — replace CTA with `<AvailabilityChecker slug="officer-background-check" ...>`.

- [ ] **Step 3: Update similar-cases-analyzer page**

Same pattern — replace CTA with `<AvailabilityChecker slug="similar-cases-analyzer" ...>`.

- [ ] **Step 4: Fix the FAQ answer**

In `judge-report-card/page.tsx` line 52, the FAQ says "you'll be notified before purchase and offered a full refund." Change to: "If we don't have sufficient data for your specific judge, you'll see that before checkout — we won't charge you for data we don't have. You can join our waitlist and we'll notify you when coverage is available."

Apply the same FAQ fix to the other two landing pages if they have similar text.

- [ ] **Step 5: Verify TypeScript compiles**

```bash
npx tsc --noEmit --skipLibCheck
```

- [ ] **Step 6: Commit**

```bash
git add src/app/judge-report-card/page.tsx src/app/officer-background-check/page.tsx src/app/similar-cases-analyzer/page.tsx
git commit -m "feat: replace static CTAs with AvailabilityChecker on all 3 Tier 9 landing pages"
```

---

## Task 7: Modify checkout to accept pre-populated intake

**Files:**
- Modify: `src/app/api/checkout/route.ts` (lines 62, 158-164)

- [ ] **Step 1: Read intake params from request body**

The checkout API already reads `standaloneProduct`, `chargeType`, and `state` from the body (line 62). It also stores `charge_type` and `state` in Stripe metadata (lines 162-163). Extend the metadata to include all intake fields:

In the standalone product section (line 158-164), add judge/officer name to metadata:

```typescript
metadata: {
  product_type: "standalone",
  standalone_product_slug: standaloneProduct,
  email: normalizedEmailStandalone,
  charge_type: chargeType && isValidChargeType(chargeType) ? chargeType : "",
  state: typeof body.state === "string" ? body.state.slice(0, 10) : "",
  // Pre-populated intake from availability checker
  judge_name: typeof body.judgeName === "string" ? body.judgeName.slice(0, 100) : "",
  officer_name: typeof body.officerName === "string" ? body.officerName.slice(0, 100) : "",
},
```

No other changes needed — the webhook reads from this metadata.

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit --skipLibCheck
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/checkout/route.ts
git commit -m "feat: pass intake fields through Stripe metadata for instant generation"
```

---

## Task 8: Modify webhook to skip intake email when intake is pre-populated

**Files:**
- Modify: `src/app/api/webhooks/stripe/route.ts` (lines 112-221)

- [ ] **Step 1: Check for pre-populated intake in metadata**

After the order insert (line 167), check if the Stripe metadata has intake fields. If so, populate `standalone_intake` on the order and trigger generation immediately — skip the intake email.

Replace the intake email block (lines 189-212) with:

```typescript
// Check if intake was pre-populated from availability checker
const preJudgeName = session.metadata?.judge_name || "";
const preOfficerName = session.metadata?.officer_name || "";
const preChargeType = session.metadata?.charge_type || "";
const preState = session.metadata?.state || "";

const hasPrePopulatedIntake =
  (standaloneSlug === "judge-report-card" && preJudgeName && preState) ||
  (standaloneSlug === "officer-background-check" && preOfficerName && preState) ||
  (standaloneSlug === "similar-cases-analyzer" && preChargeType && preState);

if (hasPrePopulatedIntake) {
  // Build intake object matching what the intake form would submit
  let intake: Record<string, string> = {};
  if (standaloneSlug === "judge-report-card") {
    intake = { judgeName: preJudgeName, state: preState, chargeType: preChargeType || "other" };
  } else if (standaloneSlug === "officer-background-check") {
    intake = { officerName: preOfficerName, state: preState };
  } else if (standaloneSlug === "similar-cases-analyzer") {
    intake = { chargeType: preChargeType, state: preState };
  }

  // Write intake + trigger generation (same as intake API route)
  const standaloneSupabaseUpdate = createAdminClient();
  await standaloneSupabaseUpdate.from("orders")
    .update({ standalone_intake: intake })
    .eq("stripe_session_id", session.id);

  // Fetch the order ID for generation
  const { data: orderForGen } = await standaloneSupabaseUpdate.from("orders")
    .select("id")
    .eq("stripe_session_id", session.id)
    .single();

  if (orderForGen) {
    // Import and run generation (non-blocking)
    const { generateTier9Report } = await import("@/lib/tier9-reports/generate");
    generateTier9Report(orderForGen.id).catch((err: unknown) => {
      console.error("[Webhook] Tier9 generation error:", err);
    });
  }
} else {
  // No pre-populated intake — send the traditional intake email with token link
  const siteOrigin = process.env.NEXT_PUBLIC_SITE_URL || "https://imnotanattorney.com";
  await sendEmailWithOperatorAlert(
    {
      to: customerStandaloneEmail,
      subject: `Your ${product.name} — Complete Your Details`,
      html: `
        <p>Thank you for your purchase.</p>
        <p>To generate your personalized ${escapeHtml(product.name)}, we need a few details about your situation.</p>
        <p style="margin: 24px 0;">
          <a href="${siteOrigin}/intake/standalone/${standaloneSlug}?token=${intakeToken}"
             style="background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">
            Complete Your Details
          </a>
        </p>
        <p>This takes about 2 minutes. Your report is generated within 60 seconds of submission.</p>
      `,
    },
    `standalone intake email for ${customerStandaloneEmail}`,
    {
      category: "standalone-intake-invite",
      metadata: { standalone_product_slug: standaloneSlug },
    }
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit --skipLibCheck
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/webhooks/stripe/route.ts
git commit -m "feat: instant report generation when intake pre-populated from availability gate"
```

---

## Task 9: Final verification + push

**Files:** None (verification only)

- [ ] **Step 1: TypeScript check**

```bash
npx tsc --noEmit --skipLibCheck
```

- [ ] **Step 2: Tier consistency check**

```bash
node scripts/check-tiers.mjs
```

Expected: 18 tiers, all consistent

- [ ] **Step 3: Push to deploy**

```bash
git push origin master
```

- [ ] **Step 4: Verify the availability endpoint works**

```bash
curl -X POST https://imnotanattorney.com/api/check-availability/judge-report-card \
  -H "Content-Type: application/json" \
  -d '{"judgeName": "Ronald Moon", "state": "HI"}'
```

Expected: `{ "available": true, "coverage": { "quotes": 312, ... }, "matchedName": "Ronald Moon" }`

```bash
curl -X POST https://imnotanattorney.com/api/check-availability/judge-report-card \
  -H "Content-Type: application/json" \
  -d '{"judgeName": "Nonexistent Judge", "state": "FL"}'
```

Expected: `{ "available": false, "coverage": {}, "matchedName": null }`
