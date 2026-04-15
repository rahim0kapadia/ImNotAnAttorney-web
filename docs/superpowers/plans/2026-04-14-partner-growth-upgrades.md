# Partner Growth Upgrades Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship co-branded referral pages (OG meta, event tracking, city), commission SMS enhancements (first-sale, milestones, monthly summary), and conversion analytics funnel (RPC, dashboard component).

**Architecture:** Single migration creates `partner_events` table, `city` column on `partners`, `referrals(partner_id, created_at)` index, and `partner_conversion_funnel` RPC. Three subsystems are independent — S1 touches referral pages, S2 touches webhook + SMS + cron, S3 touches dashboard. Shared touchpoint: webhook fires both S1 purchase events and S2 commission SMS.

**Tech Stack:** Next.js 15 (App Router), Supabase (PostgREST + RPCs), Tailwind CSS, text.email SMS gateway.

**Spec:** `C:\Users\email\projects\ImNotAnAttorney-web\docs\superpowers\specs\2026-04-14-partner-growth-upgrades-design.md`
**Errata:** `C:\Users\email\projects\ImNotAnAttorney-web\docs\superpowers\specs\2026-04-14-partner-growth-upgrades-errata.md`

---

## File Map

### New Files (5)
| File | Responsibility |
|------|---------------|
| `supabase/migrations/20260414a_partner_growth_upgrades.sql` | Migration: partner_events table, city column, referrals index, conversion_funnel RPC, RLS |
| `src/lib/partner-sms.ts` | Pure functions: buildCommissionSMS, buildMonthlySummarySMS, getMilestoneMessage, buildTierProgress |
| `src/app/api/partner/track-event/route.ts` | POST endpoint for client-side quiz_complete event tracking |
| `src/app/api/cron/partner-monthly-summary/route.ts` | Monthly earning summary cron (1st of month, 2PM UTC) |
| `src/components/partner/ConversionFunnel.tsx` | Funnel visualization: 4 bars, time toggle, conversion rate, empty state |

### Modified Files (10)
| File | What Changes |
|------|-------------|
| `src/app/r/[code]/page.tsx` | React.cache() shared query, generateMetadata() with params, link_click event via after() |
| `src/app/r/[code]/quiz/page.tsx` | quiz_start event via after(), add partner id to query |
| `src/components/ReferralQuiz.tsx` | Fire quiz_complete via fetch to /api/partner/track-event |
| `src/components/BridgePage.tsx` | Accept optional city prop, update displayName |
| `src/components/partner/PartnerApplicationForm.tsx` | Add optional city text input after email |
| `src/app/api/partners/apply/route.ts` | Accept city in body, store in both insert and update paths |
| `src/app/api/webhooks/stripe/route.ts` | Expand partner SELECT (C2), purchase event INSERT, replace inline SMS with buildCommissionSMS(), switch pref key to commission_earned (W5) |
| `src/lib/notification-prefs.ts` | Add commission_earned to PartnerNotificationPrefs + PARTNER_DEFAULTS |
| `src/components/partner/NotificationSettings.tsx` | Add "Commission Alerts" toggle row |
| `src/app/api/partner/dashboard/route.ts` | Call partner_conversion_funnel RPC, add funnel to response |
| `src/app/partner/dashboard/page.tsx` | Add funnel state, render ConversionFunnel between Analytics and Recent Activity |

### Test Files
| File | What It Tests |
|------|--------------|
| `src/lib/__tests__/partner-sms.test.ts` | buildCommissionSMS, buildMonthlySummarySMS, getMilestoneMessage, buildTierProgress |
| `src/components/partner/__tests__/ConversionFunnel.test.tsx` | Rendering, bar widths, zero-division guard, empty state, time toggle |

---

## Task 0: Database Migration

**Files:**
- Create: `supabase/migrations/20260414a_partner_growth_upgrades.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- Partner Growth Upgrades: event tracking, city, referrals index, conversion funnel RPC

-- 1. partner_events table
CREATE TABLE IF NOT EXISTS partner_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES partners(id),
  event_type text NOT NULL CHECK (event_type IN ('link_click', 'quiz_start', 'quiz_complete', 'purchase')),
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_partner_events_funnel
  ON partner_events(partner_id, event_type, created_at);

ALTER TABLE partner_events ENABLE ROW LEVEL SECURITY;
-- No public policies — accessed only via service_role (admin client)

-- 2. City column on partners
ALTER TABLE partners ADD COLUMN IF NOT EXISTS city text;

-- 3. Referrals index for monthly summary cron date queries (errata W4)
CREATE INDEX IF NOT EXISTS idx_referrals_partner_date
  ON referrals(partner_id, created_at);

-- 4. Conversion funnel RPC (single scan with conditional aggregation)
CREATE OR REPLACE FUNCTION partner_conversion_funnel(p_partner_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'last_30_days', jsonb_build_object(
      'link_clicks', COUNT(*) FILTER (WHERE event_type = 'link_click' AND created_at > now() - interval '30 days'),
      'quiz_starts', COUNT(*) FILTER (WHERE event_type = 'quiz_start' AND created_at > now() - interval '30 days'),
      'quiz_completions', COUNT(*) FILTER (WHERE event_type = 'quiz_complete' AND created_at > now() - interval '30 days'),
      'purchases', COUNT(*) FILTER (WHERE event_type = 'purchase' AND created_at > now() - interval '30 days')
    ),
    'all_time', jsonb_build_object(
      'link_clicks', COUNT(*) FILTER (WHERE event_type = 'link_click'),
      'quiz_starts', COUNT(*) FILTER (WHERE event_type = 'quiz_start'),
      'quiz_completions', COUNT(*) FILTER (WHERE event_type = 'quiz_complete'),
      'purchases', COUNT(*) FILTER (WHERE event_type = 'purchase')
    )
  ) INTO v_result
  FROM partner_events
  WHERE partner_id = p_partner_id;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION partner_conversion_funnel(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION partner_conversion_funnel(uuid) TO service_role;
```

- [ ] **Step 2: Apply via Management API**

Run: `node scripts/apply-pending-sql.mjs`
Expected: Migration applied successfully.

- [ ] **Step 3: Verify tables and RPC exist**

Run a quick Supabase query to confirm `partner_events` table exists, `partners.city` column exists, and `partner_conversion_funnel` RPC is callable.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260414a_partner_growth_upgrades.sql
git commit -m "feat(partner): migration -- partner_events, city column, referrals index, conversion funnel RPC"
```

---

## Task 1: Partner SMS Module (Pure Functions)

**Files:**
- Create: `src/lib/partner-sms.ts`
- Create: `src/lib/__tests__/partner-sms.test.ts`

This task is pure logic with zero external dependencies -- build and test first.

- [ ] **Step 1: Write failing tests**

Create `src/lib/__tests__/partner-sms.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  buildCommissionSMS,
  buildMonthlySummarySMS,
  getMilestoneMessage,
  buildTierProgress,
} from "../partner-sms";

describe("getMilestoneMessage", () => {
  it("returns message for milestone count", () => {
    expect(getMilestoneMessage(3)).toBe("3 referrals! Momentum building.");
    expect(getMilestoneMessage(10)).toBe("10 referrals! Top-tier INAA partner.");
    expect(getMilestoneMessage(25)).toBe("25 referrals! Helping more defendants than most attorneys.");
    expect(getMilestoneMessage(50)).toBe("50 referrals. Legend status.");
  });

  it("returns null for non-milestone counts", () => {
    expect(getMilestoneMessage(1)).toBeNull();
    expect(getMilestoneMessage(4)).toBeNull();
    expect(getMilestoneMessage(11)).toBeNull();
    expect(getMilestoneMessage(100)).toBeNull();
  });
});

describe("buildTierProgress", () => {
  it("shows progress to next tier for partner tier", () => {
    expect(buildTierProgress(2, "partner")).toBe("[2/5 to Silver Partner - 15%]");
  });

  it("shows progress to next tier for silver tier", () => {
    expect(buildTierProgress(8, "silver")).toBe("[8/15 to Gold Partner - 20%]");
  });

  it("shows max tier message for gold", () => {
    expect(buildTierProgress(20, "gold")).toBe("[Gold Partner - 20%]");
  });
});

describe("buildCommissionSMS", () => {
  const baseOpts = {
    amountCents: 22473,
    tierName: "The X-Ray",
    totalReferrals: 5,
    commissionTier: "partner",
    promoCode: "SMITH10",
    holdbackDate: "Jun 29",
  };

  it("builds first-sale SMS when totalReferrals === 1", () => {
    const msg = buildCommissionSMS({ ...baseOpts, totalReferrals: 1 });
    expect(msg).toContain("FIRST referral");
    expect(msg).toContain("The X-Ray");
    expect(msg).toContain("$224.73");
    expect(msg).toContain("SMITH10");
    expect(msg.length).toBeLessThanOrEqual(160);
  });

  it("builds milestone SMS at milestone count", () => {
    const msg = buildCommissionSMS({ ...baseOpts, totalReferrals: 10 });
    expect(msg).toContain("10 referrals!");
    expect(msg).not.toContain("FIRST");
    expect(msg.length).toBeLessThanOrEqual(160);
  });

  it("builds progress SMS for regular referrals", () => {
    const msg = buildCommissionSMS(baseOpts);
    expect(msg).toContain("$224.73");
    expect(msg).toContain("Jun 29");
    expect(msg).toContain("[5/5 to Silver Partner");
    expect(msg.length).toBeLessThanOrEqual(160);
  });

  it("stays within 160 chars for worst-case inputs", () => {
    const msg = buildCommissionSMS({
      amountCents: 99973,
      tierName: "Intelligence Brief",
      totalReferrals: 14,
      commissionTier: "silver",
      promoCode: "LONGCODENAME10",
      holdbackDate: "Jun 29",
    });
    expect(msg.length).toBeLessThanOrEqual(160);
  });
});

describe("buildMonthlySummarySMS", () => {
  it("builds summary with earnings and balance", () => {
    const msg = buildMonthlySummarySMS({
      monthName: "March",
      monthEarningsCents: 44946,
      totalBalanceCents: 67419,
    });
    expect(msg).toContain("March");
    expect(msg).toContain("$449.46");
    expect(msg).toContain("$674.19");
    expect(msg.length).toBeLessThanOrEqual(160);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/__tests__/partner-sms.test.ts`
Expected: All tests FAIL -- module not found.

- [ ] **Step 3: Implement partner-sms.ts**

Create `src/lib/partner-sms.ts`:

```typescript
/**
 * Partner SMS message builders.
 *
 * Single source of truth for all partner SMS copy.
 * Every function returns a string guaranteed <= 160 chars via capSMS().
 * All strings use GSM-7 safe characters only (no em-dashes, curly quotes).
 */

import { capSMS } from "./sms";
import { COMMISSION_TIERS_CONFIG, getNextTier } from "./partner-data";

const MILESTONES: { count: number; message: string }[] = [
  { count: 3, message: "3 referrals! Momentum building." },
  { count: 10, message: "10 referrals! Top-tier INAA partner." },
  { count: 25, message: "25 referrals! Helping more defendants than most attorneys." },
  { count: 50, message: "50 referrals. Legend status." },
];

/** Returns milestone message if count matches, null otherwise. */
export function getMilestoneMessage(totalReferrals: number): string | null {
  const m = MILESTONES.find((ms) => ms.count === totalReferrals);
  return m ? m.message : null;
}

/** Builds "[3/5 to Silver Partner - 15%]" or "[Gold Partner - 20%]" for max tier. */
export function buildTierProgress(totalReferrals: number, commissionTier: string): string {
  const next = getNextTier(commissionTier);
  if (!next) {
    const current = COMMISSION_TIERS_CONFIG.find((t) => t.key === commissionTier) ?? COMMISSION_TIERS_CONFIG[COMMISSION_TIERS_CONFIG.length - 1];
    return `[${current.label} - ${current.rate}%]`;
  }
  return `[${totalReferrals}/${next.threshold} to ${next.label} - ${next.rate}%]`;
}

interface CommissionSMSOpts {
  amountCents: number;
  tierName: string;
  totalReferrals: number;
  commissionTier: string;
  promoCode: string;
  holdbackDate: string;
}

/**
 * Builds the commission-earned SMS.
 * Handles first-sale, milestone, and standard progress variants.
 */
export function buildCommissionSMS(opts: CommissionSMSOpts): string {
  const amount = (opts.amountCents / 100).toFixed(2);

  // First sale -- distinct celebration message
  if (opts.totalReferrals === 1) {
    return capSMS(
      `INAA: Your FIRST referral just purchased a ${opts.tierName}! You earned $${amount}. Code ${opts.promoCode} is working -- keep those cards in the bail packets.`
    );
  }

  // Check milestone
  const milestone = getMilestoneMessage(opts.totalReferrals);
  const suffix = milestone ?? buildTierProgress(opts.totalReferrals, opts.commissionTier);

  return capSMS(
    `INAA: You earned $${amount} from a referral! Confirms ${opts.holdbackDate}. ${suffix}`
  );
}

interface MonthlySummarySMSOpts {
  monthName: string;
  monthEarningsCents: number;
  totalBalanceCents: number;
}

/** Builds the monthly summary SMS. */
export function buildMonthlySummarySMS(opts: MonthlySummarySMSOpts): string {
  const earnings = (opts.monthEarningsCents / 100).toFixed(2);
  const balance = (opts.totalBalanceCents / 100).toFixed(2);
  return capSMS(
    `INAA Monthly: You earned $${earnings} in ${opts.monthName}. Balance: $${balance}. Payout processes this week.`
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/__tests__/partner-sms.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/partner-sms.ts src/lib/__tests__/partner-sms.test.ts
git commit -m "feat(partner): SMS message builders with TDD -- first-sale, milestones, tier progress, monthly summary"
```

---

## Task 2: Notification Prefs -- Add commission_earned Channel

**Files:**
- Modify: `src/lib/notification-prefs.ts`
- Modify: `src/components/partner/NotificationSettings.tsx`

- [ ] **Step 1: Add commission_earned to PartnerNotificationPrefs**

In `src/lib/notification-prefs.ts`, add `commission_earned` to the interface and defaults.

Change the `PartnerNotificationPrefs` interface (line 19-24):

```typescript
export interface PartnerNotificationPrefs {
  magic_link: Channel;
  client_reminded: Channel;
  drip: Channel;
  payout: Channel;
  commission_earned: Channel;
}
```

Change `PARTNER_DEFAULTS` (line 33-38). Default to `"email"` (not `"both"`) to avoid silently opting existing partners into SMS without consent:

```typescript
export const PARTNER_DEFAULTS: PartnerNotificationPrefs = {
  magic_link: "email",
  client_reminded: "email",
  drip: "email",
  payout: "email",
  commission_earned: "email",
};
```

- [ ] **Step 2: Add Commission Alerts toggle to NotificationSettings.tsx**

In `src/components/partner/NotificationSettings.tsx`, update the `LABELS` record (line 7-12):

```typescript
const LABELS: Record<keyof PartnerNotificationPrefs, string> = {
  magic_link: "Login links",
  client_reminded: "Client reminder alerts",
  drip: "Tips & onboarding",
  commission_earned: "Commission alerts",
  payout: "Payouts & holdback",
};
```

No other changes needed -- the component already iterates `Object.keys(LABELS)` to render rows, so the new key renders automatically.

- [ ] **Step 3: Verify build compiles**

Run: `npx tsc --noEmit`
Expected: No TypeScript errors from notification-prefs usage.

- [ ] **Step 4: Commit**

```bash
git add src/lib/notification-prefs.ts src/components/partner/NotificationSettings.tsx
git commit -m "feat(partner): add commission_earned notification pref channel, default email"
```

---

## Task 3: S1 -- Co-Branded Referral Page (OG Meta + Link Click Event)

**Files:**
- Modify: `src/app/r/[code]/page.tsx`

This task restructures `/r/[code]/page.tsx` to:
1. Use `React.cache()` for a shared partner query helper
2. Fix `generateMetadata()` to receive route params and set dynamic OG tags
3. Fire `link_click` event via `after()` with Referer header capture
4. Pass `city` to BridgePage (read from expanded SELECT)

- [ ] **Step 1: Rewrite /r/[code]/page.tsx**

Replace the full contents of `src/app/r/[code]/page.tsx`:

```typescript
/**
 * /r/[code] -- Referral URL -> bridge page.
 *
 * Server component: looks up partner by promo code, sets ref cookie,
 * renders bridge page with partner context. If partner not found or
 * not approved, shows a generic fallback.
 */

import { cache } from "react";
import type { Metadata } from "next";
import { after, headers } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import Link from "next/link";
import { BridgePage } from "@/components/BridgePage";

/** Shared partner query -- React.cache() deduplicates within a single request. */
const getPartnerByCode = cache(async (code: string) => {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("partners")
    .select("id, name, company, city, promo_code, status")
    .eq("promo_code", code.toUpperCase())
    .eq("status", "approved")
    .limit(1)
    .maybeSingle();
  return data;
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>;
}): Promise<Metadata> {
  const { code } = await params;
  const partner = await getPartnerByCode(code);

  if (partner) {
    const referrer = partner.company || partner.name;
    const title = `Court Prep for Your Case -- Referred by ${referrer}`;
    const description = `${partner.name} from ${partner.company || "a trusted referral partner"} trusts this service. Understand your charges and get the right questions for your attorney.`;
    return {
      title: `${title} | ImNotAnAttorney`,
      description,
      openGraph: { title, description, type: "website" },
      twitter: { card: "summary", title, description },
    };
  }

  const defaultTitle = "Court Prep for Your Case";
  const defaultDescription = "Understand your charges. Get the right questions for your attorney.";
  return {
    title: `${defaultTitle} | ImNotAnAttorney`,
    description: `${defaultDescription} Legal information -- not legal advice.`,
    openGraph: { title: defaultTitle, description: defaultDescription, type: "website" },
    twitter: { card: "summary" as const, title: defaultTitle, description: defaultDescription },
  };
}

interface PageProps {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ sub?: string }>;
}

export default async function ReferralPage({ params }: PageProps) {
  const { code } = await params;

  const partner = await getPartnerByCode(code);

  if (!partner) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center px-4">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-bold mb-4">
            This referral link isn&apos;t active
          </h1>
          <p className="text-zinc-400 mb-8">
            The link you followed may have expired or is no longer available.
            You can still check out our services directly.
          </p>
          <Link
            href="/"
            className="inline-block px-8 py-3 bg-amber-500 text-black font-bold rounded-xl hover:bg-amber-400 transition-colors"
          >
            Visit ImNotAnAttorney
          </Link>
        </div>
      </div>
    );
  }

  // Capture Referer header before after() (headers() must be called in request scope)
  const headersList = await headers();
  const referrerUrl = headersList.get("referer") || null;

  // Fire-and-forget link_click event -- runs after response is sent
  after(async () => {
    try {
      const supabase = createAdminClient();
      await supabase.from("partner_events").insert({
        partner_id: partner.id,
        event_type: "link_click",
        metadata: { referrer_url: referrerUrl },
      });
    } catch (e) {
      console.warn("[PartnerEvents] link_click insert failed:", e);
    }
  });

  // Referral cookie is set by middleware (Next.js 16 -- cookies().set() not allowed in Server Components)

  return (
    <BridgePage
      partnerName={partner.name}
      company={partner.company}
      city={partner.city}
      promoCode={partner.promo_code!}
    />
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles (will fail until BridgePage accepts city -- that's Task 5)**

This step will produce a TS error for `city` prop on BridgePage. That's expected -- Task 5 fixes it. If running tasks sequentially, skip this check and verify after Task 5.

- [ ] **Step 3: Commit**

```bash
git add src/app/r/[code]/page.tsx
git commit -m "feat(partner): co-branded OG meta, React.cache() query helper, link_click event tracking"
```

---

## Task 4: S1 -- Quiz Start Event Tracking

**Files:**
- Modify: `src/app/r/[code]/quiz/page.tsx`

- [ ] **Step 1: Add partner id to query and fire quiz_start event**

Replace `src/app/r/[code]/quiz/page.tsx`:

```typescript
/**
 * /r/[code]/quiz -- Referral quiz (SMIQ -> micro-commitments -> recommendation).
 *
 * Server component wrapping the client-side quiz. Looks up partner for context.
 */

import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { ReferralQuiz } from "@/components/ReferralQuiz";

interface PageProps {
  params: Promise<{ code: string }>;
}

export default async function ReferralQuizPage({ params }: PageProps) {
  const { code } = await params;

  const supabase = createAdminClient();
  const { data: partner } = await supabase
    .from("partners")
    .select("id, name, promo_code, status")
    .eq("promo_code", code.toUpperCase())
    .eq("status", "approved")
    .limit(1)
    .maybeSingle();

  if (!partner) {
    redirect("/");
  }

  // Fire-and-forget quiz_start event -- runs after response is sent
  after(async () => {
    try {
      const supabase = createAdminClient();
      await supabase.from("partner_events").insert({
        partner_id: partner.id,
        event_type: "quiz_start",
        metadata: {},
      });
    } catch (e) {
      console.warn("[PartnerEvents] quiz_start insert failed:", e);
    }
  });

  return (
    <ReferralQuiz
      promoCode={partner.promo_code!}
      partnerName={partner.name}
    />
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/r/[code]/quiz/page.tsx
git commit -m "feat(partner): quiz_start event tracking via after()"
```

---

## Task 5: S1 -- BridgePage City Display + Application Form City Field

**Files:**
- Modify: `src/components/BridgePage.tsx`
- Modify: `src/components/partner/PartnerApplicationForm.tsx`
- Modify: `src/app/api/partners/apply/route.ts`

- [ ] **Step 1: Add city prop to BridgePage**

In `src/components/BridgePage.tsx`, update the interface and displayName logic.

Change the interface (line 14-18):

```typescript
interface BridgePageProps {
  partnerName: string;
  company: string | null;
  city?: string | null;
  promoCode: string;
}
```

Change the component signature and displayName (line 20-23):

```typescript
export function BridgePage({ partnerName, company, city, promoCode }: BridgePageProps) {
  let displayName = partnerName;
  if (company && city) displayName = `${partnerName} from ${company}, ${city}`;
  else if (company) displayName = `${partnerName} from ${company}`;
```

- [ ] **Step 2: Add city input to PartnerApplicationForm**

In `src/components/partner/PartnerApplicationForm.tsx`:

Add city state after email state (line 10):

```typescript
const [city, setCity] = useState("");
```

Add city to the fetch body in handleSubmit (line 24):

```typescript
body: JSON.stringify({ name, email, city: city.trim() || undefined, compliance, source }),
```

Add the city input field after the email input div (after line 89, before the compliance checkbox):

```typescript
      <div>
        <label htmlFor="partner-city" className="block text-sm text-zinc-400 mb-1">City</label>
        <input
          id="partner-city"
          type="text"
          value={city}
          onChange={(e) => setCity(e.target.value)}
          placeholder="e.g. Tampa"
          className="w-full px-4 py-3 bg-zinc-800 rounded-lg border border-zinc-700 text-white focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
        />
      </div>
```

- [ ] **Step 3: Accept city in apply route**

In `src/app/api/partners/apply/route.ts`:

Add `city` to the body destructuring (line 51):

```typescript
const { name, company, email, phone, city, region, message, source, heardAboutUs, compliance } = body;
```

Add `city` to MAX_LENGTHS (line 76):

```typescript
const MAX_LENGTHS: Record<string, number> = {
  name: 200, company: 200, email: 254, phone: 50, city: 100,
  region: 200, message: 2000, source: 100, heardAboutUs: 500,
};
```

Add `city` to the validation entries loop (line 79):

```typescript
for (const [key, val] of Object.entries({ name, company, email, phone, city, region, message, source, heardAboutUs })) {
```

Add `city` to the pending partner update (line 166-171):

```typescript
    const { error: updateError } = await supabase
      .from("partners")
      .update({
        status: "approved",
        name: partnerName,
        company: company || null,
        city: city || null,
        phone: phone || null,
      })
      .eq("id", existingPartner.id);
```

Add `city` to the new partner insert (line 273-283):

```typescript
    const { data: newPartner, error: insertError } = await supabase
      .from("partners")
      .insert({
        name: partnerName,
        company: company || null,
        city: city || null,
        email: normalizedEmail,
        phone: phone || null,
        status: "approved",
        promo_code: promoCode,
        commission_rate: 10,
      })
      .select("id, promo_code")
      .single();
```

- [ ] **Step 4: Verify build compiles**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/BridgePage.tsx src/components/partner/PartnerApplicationForm.tsx src/app/api/partners/apply/route.ts
git commit -m "feat(partner): city field -- BridgePage display, application form input, apply route storage"
```

---

## Task 6: S1 -- Track-Event API Endpoint

**Files:**
- Create: `src/app/api/partner/track-event/route.ts`

- [ ] **Step 1: Create the track-event endpoint**

Create `src/app/api/partner/track-event/route.ts`:

```typescript
/**
 * POST /api/partner/track-event -- Lightweight event tracking for client-side components.
 *
 * Only accepts quiz_complete events (server-side events fire via after()).
 * No auth required -- public endpoint identified by promo code.
 * Rate limited: 10 events per IP per minute + 10 per promo code per minute.
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request";

const ALLOWED_EVENT_TYPES = new Set(["quiz_complete"]);
const ALLOWED_METADATA_KEYS = new Set(["charge_type"]);
const MAX_METADATA_SIZE = 1024; // 1KB

export async function POST(req: NextRequest) {
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { partner_promo_code, event_type, metadata } = body;

  if (!partner_promo_code || typeof partner_promo_code !== "string") {
    return NextResponse.json({ error: "partner_promo_code required" }, { status: 400 });
  }

  if (!event_type || !ALLOWED_EVENT_TYPES.has(event_type)) {
    return NextResponse.json({ error: "Invalid event_type" }, { status: 400 });
  }

  // Validate metadata: must be plain object, whitelisted keys, max size
  let sanitizedMetadata: Record<string, unknown> = {};
  if (metadata != null) {
    if (typeof metadata !== "object" || Array.isArray(metadata)) {
      return NextResponse.json({ error: "metadata must be an object" }, { status: 400 });
    }
    if (JSON.stringify(metadata).length > MAX_METADATA_SIZE) {
      return NextResponse.json({ error: "metadata too large" }, { status: 400 });
    }
    for (const key of Object.keys(metadata)) {
      if (ALLOWED_METADATA_KEYS.has(key)) {
        sanitizedMetadata[key] = String(metadata[key]).slice(0, 200);
      }
    }
  }

  const supabase = createAdminClient();

  // Rate limit: 10 per IP per minute
  const ip = getClientIp(req);
  const { limited: ipLimited } = await checkRateLimit(
    supabase,
    `partner-event-ip:${ip}`,
    10,
    60
  );
  if (ipLimited) {
    return NextResponse.json({ error: "Rate limited" }, { status: 429 });
  }

  // Rate limit: 10 per promo code per minute
  const { limited } = await checkRateLimit(
    supabase,
    `partner-event:${partner_promo_code}`,
    10,
    60
  );
  if (limited) {
    return NextResponse.json({ error: "Rate limited" }, { status: 429 });
  }

  // Resolve promo code to partner
  const { data: partner } = await supabase
    .from("partners")
    .select("id, status")
    .eq("promo_code", partner_promo_code.toUpperCase())
    .eq("status", "approved")
    .limit(1)
    .maybeSingle();

  if (!partner) {
    return NextResponse.json({ error: "Invalid partner code" }, { status: 400 });
  }

  // Insert event -- no PII, only whitelisted metadata
  const { error } = await supabase.from("partner_events").insert({
    partner_id: partner.id,
    event_type,
    metadata: sanitizedMetadata,
  });

  if (error) {
    console.error("[TrackEvent] Insert failed:", error.message);
    return NextResponse.json({ error: "Failed to track event" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/partner/track-event/route.ts
git commit -m "feat(partner): POST /api/partner/track-event -- client-side quiz_complete event tracking"
```

---

## Task 7: S1 -- Quiz Complete Event in ReferralQuiz

**Files:**
- Modify: `src/components/ReferralQuiz.tsx`

- [ ] **Step 1: Fire quiz_complete when recommendation step renders**

In `src/components/ReferralQuiz.tsx`, add a `useEffect` and `useRef` to fire the event when `step === totalSteps`.

Add `useEffect, useRef` to the import (line 2):

```typescript
import { useState, useEffect, useRef } from "react";
```

Add a ref to track whether the event has fired, and a useEffect **before** the recommendation early-return at line 164. Place this after the `answers` state declaration (after line 147) but **before** `if (step === totalSteps)`:

```typescript
  const eventFired = useRef(false);

  useEffect(() => {
    if (step === totalSteps && !eventFired.current) {
      eventFired.current = true;
      fetch("/api/partner/track-event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          partner_promo_code: promoCode,
          event_type: "quiz_complete",
          metadata: { charge_type: chargeSlug },
        }),
      }).catch(() => {
        // Fire-and-forget -- don't block UI on tracking failure
      });
    }
  }, [step, promoCode, chargeSlug]);
```

**Critical placement note:** This `useEffect` MUST be placed before `if (step === totalSteps) { ... return ... }` at line 164. React hooks cannot be after an early return -- and the early return means hooks placed after it would never execute.

- [ ] **Step 2: Verify build compiles**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/ReferralQuiz.tsx
git commit -m "feat(partner): quiz_complete event fires on recommendation step render"
```

---

## Task 8: S2 -- Webhook SMS Upgrade + Purchase Event

**Files:**
- Modify: `src/app/api/webhooks/stripe/route.ts`

This task makes 4 changes to the webhook (both primary and metadata fallback paths):
1. **Errata C2:** Expand partner detail SELECT to include `total_referrals, commission_tier, promo_code`
2. **Errata W5:** Switch pref key from `payout` to `commission_earned`
3. Replace inline SMS with `buildCommissionSMS()` calls
4. Fire `purchase` event INSERT into `partner_events`

- [ ] **Step 1: Add import for buildCommissionSMS**

At the top of `src/app/api/webhooks/stripe/route.ts`, add:

```typescript
import { buildCommissionSMS } from "@/lib/partner-sms";
```

- [ ] **Step 2: Update primary promo code path (~lines 564-596)**

Change the partner detail SELECT (line 564-567) from:

```typescript
              const { data: partnerDetail } = await supabase
                .from("partners")
                .select("id, name, email, total_commission, phone, notification_prefs")
                .eq("id", partner.id)
                .single();
```

to:

```typescript
              const { data: partnerDetail } = await supabase
                .from("partners")
                .select("id, name, email, total_commission, phone, notification_prefs, total_referrals, commission_tier, promo_code")
                .eq("id", partner.id)
                .single();
```

Change the pref key checks (lines 575 and 589) from `partnerPrefs.payout` to `partnerPrefs.commission_earned`.

Format holdbackDate as short month + day (saves 3 chars, matches spec examples). Change line 573 from:

```typescript
                const holdbackDate = new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toLocaleDateString("en-US");
```

to:

```typescript
                const holdbackDate = new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" });
```

Replace the inline SMS string (lines 590-591) from:

```typescript
                  sendSMS(partnerDetail.phone, capSMS(`INAA: You earned $${commissionDollars} from a referral! Confirms ${holdbackDate}.`), { category: "commission_earned", partner_id: partnerDetail.id })
```

to:

```typescript
                  const smsText = buildCommissionSMS({
                    amountCents: commissionAmount,
                    tierName,
                    totalReferrals: partnerDetail.total_referrals ?? 0,
                    commissionTier: partnerDetail.commission_tier ?? "partner",
                    promoCode: partnerDetail.promo_code ?? "",
                    holdbackDate,
                  });
                  sendSMS(partnerDetail.phone, smsText, { category: "commission_earned", partner_id: partnerDetail.id })
```

After the notification try-catch block (after line 596), add purchase event INSERT with proper `.catch()`:

```typescript
            // Fire-and-forget purchase event for conversion funnel
            supabase.from("partner_events").insert({
              partner_id: partner.id,
              event_type: "purchase",
              metadata: { tier, sale_amount_cents: amount },
            })
              .then(({ error }) => {
                if (error) console.warn("[Webhook] Purchase event insert failed:", error.message);
              })
              .catch(e => console.warn("[Webhook] Purchase event insert error:", e));
```

- [ ] **Step 3: Update metadata fallback path (~lines 660-691)**

Apply the identical 4 changes to the metadata fallback path:

Change SELECT (line 660-662) to include `total_referrals, commission_tier, promo_code`.

Change pref key checks (lines 671 and 684) from `partnerPrefs.payout` to `partnerPrefs.commission_earned`.

Change holdbackDate format to `{ month: "short", day: "numeric" }`.

Replace inline SMS with `buildCommissionSMS()` call using same pattern as primary path.

Add purchase event INSERT with `.catch()` after the notification try-catch block.

- [ ] **Step 4: Verify build compiles**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/webhooks/stripe/route.ts
git commit -m "feat(partner): webhook -- buildCommissionSMS, purchase events, expanded SELECT, commission_earned pref"
```

---

## Task 9: S2 -- Monthly Summary Cron

**Files:**
- Create: `src/app/api/cron/partner-monthly-summary/route.ts`

- [ ] **Step 1: Create the monthly summary cron route**

Create `src/app/api/cron/partner-monthly-summary/route.ts`:

```typescript
/**
 * GET /api/cron/partner-monthly-summary -- Monthly earning summary for active partners.
 *
 * Schedule: 1st of each month, 2PM UTC (10AM ET) via cron-job.org.
 * Protected by CRON_AUTH_TOKEN bearer token.
 *
 * Sends SMS and/or email summary to partners who earned commissions in the
 * previous month or have a pending balance. Processes partners sequentially
 * to avoid overwhelming the SMS gateway.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/auth/guards";
import { acquireCronLock, releaseCronLock } from "@/lib/cron-idempotency";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail, escapeHtml } from "@/lib/email";
import { sendSMS } from "@/lib/sms";
import { getPartnerPrefs, shouldSendEmail, shouldSendSMS } from "@/lib/notification-prefs";
import { buildMonthlySummarySMS } from "@/lib/partner-sms";
import { getTierInfo, getNextTier } from "@/lib/partner-data";
import { formatCents } from "@/lib/format";

export async function GET(req: NextRequest) {
  const auth = requireCron(req);
  if (!auth.authorized) return auth.error;

  const lock = await acquireCronLock("partner-monthly-summary", 23 * 60 * 60 * 1000);
  if (!lock.shouldRun) {
    return NextResponse.json({ skipped: true, reason: lock.reason });
  }

  const supabase = createAdminClient();
  let sentSMS = 0;
  let sentEmail = 0;
  let partnersNotified = 0;
  let skipped = 0;

  try {
    // Compute previous month date range
    const now = new Date();
    const prevMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const prevMonthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0, 23, 59, 59, 999));
    const monthName = prevMonthStart.toLocaleString("en-US", { month: "long", timeZone: "UTC" });
    const rangeStart = prevMonthStart.toISOString();
    const rangeEnd = prevMonthEnd.toISOString();

    // Fetch approved partners (paginated to avoid PostgREST 1000-row cap)
    const { data: partners, error: fetchErr } = await supabase
      .from("partners")
      .select("id, name, email, phone, notification_prefs, total_commission, total_paid_out, commission_tier, total_referrals")
      .eq("status", "approved")
      .limit(500);

    if (fetchErr) {
      console.error("[MonthlySummary] Fetch partners error:", fetchErr);
      await releaseCronLock(lock.executionId, "failed");
      return NextResponse.json({ error: "Failed to fetch partners" }, { status: 500 });
    }

    if ((partners || []).length >= 500) {
      console.warn("[MonthlySummary] Partner count hit limit (500). Pagination needed.");
    }

    // Batch: fetch ALL referrals for the month in one query, group in memory
    const { data: allMonthReferrals } = await supabase
      .from("referrals")
      .select("partner_id, commission_amount, tier")
      .gte("created_at", rangeStart)
      .lte("created_at", rangeEnd)
      .limit(5000);

    const referralsByPartner = new Map<string, { commission_amount: number; tier: string }[]>();
    for (const ref of (allMonthReferrals || [])) {
      const existing = referralsByPartner.get(ref.partner_id) || [];
      existing.push(ref);
      referralsByPartner.set(ref.partner_id, existing);
    }

    for (const partner of (partners || [])) {
      const pendingBalance = (partner.total_commission || 0) - (partner.total_paid_out || 0);
      const monthRefs = referralsByPartner.get(partner.id) || [];
      const monthEarningsCents = monthRefs.reduce((sum, r) => sum + (r.commission_amount || 0), 0);

      // Skip partners with no activity and no pending balance
      if (monthRefs.length === 0 && pendingBalance <= 0) {
        skipped++;
        continue;
      }

      const prefs = getPartnerPrefs(partner.notification_prefs || null);

      // SMS
      if (shouldSendSMS(prefs.commission_earned) && partner.phone) {
        try {
          const smsText = buildMonthlySummarySMS({
            monthName,
            monthEarningsCents,
            totalBalanceCents: pendingBalance,
          });
          await sendSMS(partner.phone, smsText, {
            category: "partner_monthly_summary",
            partner_id: partner.id,
          });
          sentSMS++;
        } catch (e) {
          console.warn(`[MonthlySummary] SMS failed for partner ${partner.id}:`, e);
        }
      }

      // Email
      if (shouldSendEmail(prefs.commission_earned) && partner.email) {
        try {
          const tierBreakdown = monthRefs.reduce<Record<string, { count: number; total: number }>>((acc, r) => {
            if (!acc[r.tier]) acc[r.tier] = { count: 0, total: 0 };
            acc[r.tier].count++;
            acc[r.tier].total += r.commission_amount || 0;
            return acc;
          }, {});

          const tierInfo = getTierInfo(partner.commission_tier || "partner");
          const nextTier = getNextTier(partner.commission_tier || "partner");

          const tierRows = Object.entries(tierBreakdown)
            .map(([tier, data]) =>
              `<tr><td style="padding:4px 8px;color:#D4D4D8;">${escapeHtml(tier)}</td><td style="padding:4px 8px;color:#D4D4D8;">${data.count}</td><td style="padding:4px 8px;color:#F59E0B;">${formatCents(data.total)}</td></tr>`
            )
            .join("");

          const progressLine = nextTier
            ? `<p style="color:#D4D4D8;">Current tier: <strong style="color:white;">${escapeHtml(tierInfo.label)} (${tierInfo.rate}%)</strong> -- ${partner.total_referrals || 0}/${nextTier.threshold} to ${escapeHtml(nextTier.label)} (${nextTier.rate}%)</p>`
            : `<p style="color:#D4D4D8;">Current tier: <strong style="color:#F59E0B;">${escapeHtml(tierInfo.label)} (${tierInfo.rate}%)</strong> -- Max tier reached</p>`;

          const firstName = escapeHtml((partner.name || "").split(" ")[0]);

          await sendEmail(
            {
              to: partner.email,
              subject: `Your ${monthName} Partner Summary -- ImNotAnAttorney`,
              html: `
                <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;">
                  <h2 style="color:#F59E0B;">${escapeHtml(monthName)} Summary</h2>
                  <p style="color:#D4D4D8;">Hey ${firstName},</p>
                  <div style="background:#1C1917;padding:20px;border-radius:12px;border-left:4px solid #F59E0B;margin:16px 0;">
                    <p style="color:white;font-size:24px;margin:0;">${formatCents(monthEarningsCents)} earned</p>
                    <p style="color:#A1A1AA;margin:4px 0 0;">${monthRefs.length} referral${monthRefs.length !== 1 ? "s" : ""} in ${escapeHtml(monthName)}</p>
                  </div>
                  ${tierRows ? `<table style="width:100%;border-collapse:collapse;margin:12px 0;"><thead><tr><th style="text-align:left;padding:4px 8px;color:#71717A;">Product</th><th style="text-align:left;padding:4px 8px;color:#71717A;">Sales</th><th style="text-align:left;padding:4px 8px;color:#71717A;">Earned</th></tr></thead><tbody>${tierRows}</tbody></table>` : ""}
                  ${progressLine}
                  <div style="background:#1C1917;padding:16px;border-radius:8px;margin:16px 0;">
                    <p style="color:#A1A1AA;margin:0;">Pending payout balance</p>
                    <p style="color:white;font-size:20px;margin:4px 0 0;">${formatCents(pendingBalance)}</p>
                    <p style="color:#71717A;font-size:13px;margin:4px 0 0;">Payouts process on the 1st of each month.</p>
                  </div>
                </div>
              `,
              unsubscribeEmail: partner.email,
            },
            {
              category: "partner-monthly-summary",
              metadata: { partner_id: partner.id, month: monthName },
            }
          );
          sentEmail++;
        } catch (e) {
          console.warn(`[MonthlySummary] Email failed for partner ${partner.id}:`, e);
        }
      }

      partnersNotified++;
    }

    await releaseCronLock(lock.executionId, "completed");

    return NextResponse.json({
      sent_sms: sentSMS,
      sent_email: sentEmail,
      partners_notified: partnersNotified,
      skipped,
    });
  } catch (err) {
    console.error("[MonthlySummary] Unexpected error:", err);
    await releaseCronLock(lock.executionId, "failed");
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/cron/partner-monthly-summary/route.ts
git commit -m "feat(partner): monthly summary cron -- SMS + email for earning partners"
```

---

## Task 10: S3 -- ConversionFunnel Component

**Files:**
- Create: `src/components/partner/ConversionFunnel.tsx`
- Create: `src/components/partner/__tests__/ConversionFunnel.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `src/components/partner/__tests__/ConversionFunnel.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ConversionFunnel } from "../ConversionFunnel";
import type { FunnelState } from "../ConversionFunnel";

const emptyFunnel: FunnelState = {
  last_30_days: { link_clicks: 0, quiz_starts: 0, quiz_completions: 0, purchases: 0 },
  all_time: { link_clicks: 0, quiz_starts: 0, quiz_completions: 0, purchases: 0 },
};

const sampleFunnel: FunnelState = {
  last_30_days: { link_clicks: 100, quiz_starts: 60, quiz_completions: 30, purchases: 5 },
  all_time: { link_clicks: 500, quiz_starts: 300, quiz_completions: 150, purchases: 25 },
};

describe("ConversionFunnel", () => {
  it("renders empty state when all counts are zero", () => {
    render(<ConversionFunnel funnel={emptyFunnel} />);
    expect(screen.getByText(/conversion data will appear/i)).toBeTruthy();
  });

  it("renders all four funnel steps", () => {
    render(<ConversionFunnel funnel={sampleFunnel} />);
    expect(screen.getByText("Link Clicks")).toBeTruthy();
    expect(screen.getByText("Quiz Starts")).toBeTruthy();
    expect(screen.getByText("Quiz Completed")).toBeTruthy();
    expect(screen.getByText("Purchases")).toBeTruthy();
  });

  it("shows conversion rate", () => {
    render(<ConversionFunnel funnel={sampleFunnel} />);
    expect(screen.getByText(/5\.0%/)).toBeTruthy();
  });

  it("handles direct-code purchases (link_clicks=0 but purchases>0)", () => {
    const directFunnel: FunnelState = {
      last_30_days: { link_clicks: 0, quiz_starts: 0, quiz_completions: 0, purchases: 3 },
      all_time: { link_clicks: 0, quiz_starts: 0, quiz_completions: 0, purchases: 3 },
    };
    render(<ConversionFunnel funnel={directFunnel} />);
    expect(screen.getByText("\u2014")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/partner/__tests__/ConversionFunnel.test.tsx`
Expected: FAIL -- module not found.

- [ ] **Step 3: Implement ConversionFunnel.tsx**

Create `src/components/partner/ConversionFunnel.tsx`:

```tsx
"use client";

import { useState } from "react";

export interface FunnelData {
  link_clicks: number;
  quiz_starts: number;
  quiz_completions: number;
  purchases: number;
}

export interface FunnelState {
  last_30_days: FunnelData;
  all_time: FunnelData;
}

export const EMPTY_FUNNEL: FunnelState = {
  last_30_days: { link_clicks: 0, quiz_starts: 0, quiz_completions: 0, purchases: 0 },
  all_time: { link_clicks: 0, quiz_starts: 0, quiz_completions: 0, purchases: 0 },
};

type TimeWindow = "last_30_days" | "all_time";

const STEPS: { key: keyof FunnelData; label: string }[] = [
  { key: "link_clicks", label: "Link Clicks" },
  { key: "quiz_starts", label: "Quiz Starts" },
  { key: "quiz_completions", label: "Quiz Completed" },
  { key: "purchases", label: "Purchases" },
];

export function ConversionFunnel({ funnel }: { funnel: FunnelState }) {
  const [timeWindow, setTimeWindow] = useState<TimeWindow>("last_30_days");
  const data = funnel[timeWindow];

  const isEmpty = (d: FunnelData): boolean =>
    d.link_clicks === 0 && d.quiz_starts === 0 && d.quiz_completions === 0 && d.purchases === 0;

  if (isEmpty(data) && isEmpty(funnel.all_time)) {
    return (
      <section className="bg-zinc-900 rounded-xl border border-zinc-700 p-6">
        <h2 className="text-lg font-bold mb-4">Conversion Funnel</h2>
        <p className="text-zinc-400 text-sm">
          Conversion data will appear here as defendants use your referral link.
        </p>
      </section>
    );
  }

  // Use max of link_clicks or 1 to prevent division by zero (errata I3)
  const maxCount = Math.max(data.link_clicks, 1);

  const conversionRate = data.link_clicks > 0
    ? (data.purchases / data.link_clicks * 100).toFixed(1)
    : null;

  return (
    <section className="bg-zinc-900 rounded-xl border border-zinc-700 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold">Conversion Funnel</h2>
        <div className="flex gap-1">
          <button
            onClick={() => setTimeWindow("last_30_days")}
            aria-pressed={timeWindow === "last_30_days"}
            className={`px-3 py-1 text-xs rounded-lg transition-colors cursor-pointer ${
              timeWindow === "last_30_days"
                ? "bg-amber-500 text-black font-bold"
                : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
            }`}
          >
            Last 30 Days
          </button>
          <button
            onClick={() => setTimeWindow("all_time")}
            aria-pressed={timeWindow === "all_time"}
            className={`px-3 py-1 text-xs rounded-lg transition-colors cursor-pointer ${
              timeWindow === "all_time"
                ? "bg-amber-500 text-black font-bold"
                : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
            }`}
          >
            All Time
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {STEPS.map((step, i) => {
          const count = data[step.key];
          const widthPct = Math.min((count / maxCount) * 100, 100);
          const prevCount = i > 0 ? data[STEPS[i - 1].key] : null;
          const dropOff = prevCount != null && prevCount > 0 && count <= prevCount
            ? `${((prevCount - count) / prevCount * 100).toFixed(0)}% drop`
            : null;

          return (
            <div key={step.key}>
              <div className="flex items-center justify-between text-sm mb-1">
                <span className="text-zinc-300">{step.label}</span>
                <div className="text-right">
                  <span className="text-white font-medium">{count}</span>
                  {dropOff && (
                    <span className="text-zinc-500 text-xs ml-2">{dropOff}</span>
                  )}
                </div>
              </div>
              <div className="w-full bg-zinc-800 rounded-full h-3">
                <div
                  role="meter"
                  aria-valuenow={count}
                  aria-valuemin={0}
                  aria-valuemax={data.link_clicks || count}
                  aria-label={`${step.label}: ${count}${data.link_clicks > 0 ? ` (${((count / data.link_clicks) * 100).toFixed(0)}% of link clicks)` : ""}`}
                  className="bg-amber-500 h-3 rounded-full transition-all duration-300"
                  style={{ width: `${Math.max(widthPct, count > 0 ? 2 : 0)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-sm mt-4">
        <span className="text-zinc-400">Conversion rate: </span>
        <span className="text-amber-400 font-medium">
          {conversionRate ? `${conversionRate}%` : "\u2014"}
        </span>
      </p>
    </section>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/partner/__tests__/ConversionFunnel.test.tsx`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/partner/ConversionFunnel.tsx src/components/partner/__tests__/ConversionFunnel.test.tsx
git commit -m "feat(partner): ConversionFunnel component with TDD -- funnel bars, time toggle, zero-division guard"
```

---

## Task 11: S3 -- Dashboard Integration

**Files:**
- Modify: `src/app/api/partner/dashboard/route.ts`
- Modify: `src/app/partner/dashboard/page.tsx`

- [ ] **Step 1: Add funnel RPC call to dashboard API (parallelized)**

In `src/app/api/partner/dashboard/route.ts`, parallelize the analytics and funnel RPC calls. Replace the sequential analytics call (line 36-38) with:

```typescript
    // Fetch analytics + funnel in parallel (independent queries)
    const [{ data: analytics }, { data: funnel }] = await Promise.all([
      supabase.rpc("partner_analytics", { p_partner_id: partner.id }),
      supabase.rpc("partner_conversion_funnel", { p_partner_id: partner.id }),
    ]);
```

Add `funnel` to the response JSON (after `analytics`):

```typescript
      analytics: analytics || { monthly: [], by_tier: [], total_referrals: 0 },
      funnel: funnel || {
        last_30_days: { link_clicks: 0, quiz_starts: 0, quiz_completions: 0, purchases: 0 },
        all_time: { link_clicks: 0, quiz_starts: 0, quiz_completions: 0, purchases: 0 },
      },
```

- [ ] **Step 2: Add funnel state and render to dashboard page**

In `src/app/partner/dashboard/page.tsx`:

Add imports at the top (after the PartnerAnalytics import, line 18):

```typescript
import { ConversionFunnel, EMPTY_FUNNEL, type FunnelState } from "@/components/partner/ConversionFunnel";
```

Add funnel state after the existing state declarations (after line 75):

```typescript
  const [funnel, setFunnel] = useState<FunnelState>(EMPTY_FUNNEL);
```

Set funnel in fetchDashboard (after line 95, after `setAnalytics`):

```typescript
      setFunnel(data.funnel || EMPTY_FUNNEL);
```

Render ConversionFunnel between PartnerAnalytics and Recent Activity (after line 223, after `<PartnerAnalytics analytics={analytics} />`):

```tsx
        {/* 6b. Conversion Funnel */}
        <ConversionFunnel funnel={funnel} />
```

- [ ] **Step 3: Verify build compiles**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/partner/dashboard/route.ts src/app/partner/dashboard/page.tsx
git commit -m "feat(partner): dashboard -- conversion funnel RPC integration + component render"
```

---

## Task 12: Register Monthly Summary Cron on cron-job.org

**Files:** None (API call only)

- [ ] **Step 1: Register the cron job**

The cron schedule is `0 14 1 * *` (1st of each month, 2PM UTC / 10AM ET).

Read `CRON_AUTH_TOKEN` from `.env.local`, then register via cron-job.org API using the API key from `CLAUDE.md`. The URL should be `https://imnotanattorney.com/api/cron/partner-monthly-summary`.

Use the same registration pattern as other crons in this project (see `CLAUDE.md` for the cron-job.org API key and registration format).

- [ ] **Step 2: Verify registration**

Query cron-job.org API to confirm the job exists with correct schedule, URL, and auth header.

---

## Task 13: Final Build Verification

- [ ] **Step 1: TypeScript check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 2: Run all tests**

Run: `npx vitest run`
Expected: All existing tests pass + new partner-sms and ConversionFunnel tests pass.

- [ ] **Step 3: Dev server smoke test**

Run `npm run dev` and verify:
- `/r/TESTCODE` loads with OG meta tags (view source)
- Partner dashboard loads ConversionFunnel section
- NotificationSettings shows "Commission alerts" row

- [ ] **Step 4: Final commit (if any lint/type fixes needed)**

```bash
git add -A
git commit -m "fix(partner): build verification -- lint and type fixes"
```

---

## Spec Coverage Checklist

| Spec Section | Task |
|-------------|------|
| 1.1 Dynamic OG Meta Tags | Task 3 |
| 1.2 Referral Event Tracking (link_click) | Task 3 |
| 1.2 Referral Event Tracking (quiz_start) | Task 4 |
| 1.2 Referral Event Tracking (quiz_complete) | Tasks 6, 7 |
| 1.2 Referral Event Tracking (purchase) | Task 8 |
| 1.3 Optional City Field | Task 5 |
| 1.4 Track-Event API | Task 6 |
| 2.1 First-Sale Celebration | Task 1, 8 |
| 2.2 Progress-to-Next-Tier | Task 1, 8 |
| 2.3 Milestone Micro-Celebrations | Task 1, 8 |
| 2.4 Monthly Summary Cron | Task 9, 12 |
| 2.5 Notification Pref Split | Task 2 |
| SMS Builder Module | Task 1 |
| 3.1 Conversion Funnel RPC | Task 0 |
| 3.2 ConversionFunnel Component | Task 10 |
| 3.3 Dashboard Integration | Task 11 |
| Cross-Cutting Migration | Task 0 |
| Errata C2 (webhook SELECT) | Task 8 |
| Errata C3 (total_referrals from query) | Task 8 |
| Errata W3 (city after email) | Task 5 |
| Errata W4 (referrals index) | Task 0 |
| Errata W5 (pref key switch) | Task 8 |
| Errata I3 (zero division guard) | Task 10 |
| Errata I7 (correct apply route path) | Task 5 |

## Review Fixes Applied

| Finding | Fix |
|---------|-----|
| C1: useEffect after early return | Moved before `if (step === totalSteps)`, added placement note |
| C2: HTML injection in cron email | Added `escapeHtml()` on partner.name, tier, monthName |
| C3: Unbounded metadata | Whitelist keys, cap 1KB, validate type |
| C4: 200 on error path | Success response inside try, 500 in catch |
| W1: commission_earned default "both" | Changed to "email" |
| W2: Em-dash in SMS | Replaced with `--` (GSM-7 safe) |
| W3: No .catch() on purchase INSERT | Added .catch() |
| W4: Rate limit by promo only | Added IP-based rate limit |
| W5: No limit on partners query | Added .limit(500) with warning log |
| W6: N+1 referrals queries | Batched: single query, group in memory |
| W7: FunnelData defined twice | Export from ConversionFunnel.tsx, import in dashboard |
| W8: referrer_url hardcoded null | Capture Referer header via headers() |
| W9: useState for eventFired | Changed to useRef |
| S1: Two sequential scans in RPC | Combined into single query with conditional aggregation |
| S2: Dead sub destructuring | Removed |
| S3: holdbackDate format | Changed to `{ month: "short", day: "numeric" }` |
| S4: window shadows global | Renamed to timeWindow |
| S5: Negative drop-off % | Added `count <= prevCount` guard |
| S6: adminClient vs supabase | Standardized to supabase (via shadowed const) |
| S7: Comment about removed import | Removed |
| S8: Sequential dashboard queries | Parallelized analytics + funnel with Promise.all() |
