# Court Reminders Platform — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a free court prep tool (reminders + court logistics) to the partner referral quiz flow, capturing defendants who aren't ready to buy and converting them over time via email touchpoints.

**Architecture:** A secondary CTA on the quiz recommendation page routes to a 4-field form. Submission creates a `court_reminders` row and redirects to a personalized prep page. A 6-hourly cron sends reminder emails at -14/-7/-3/-1 days before court. Each email links back to the prep page which includes the product recommendation. Conversion attribution uses token-based tracking through Stripe metadata. The free tier shows court logistics only — questions and case-specific intelligence remain paid.

**Tech Stack:** Next.js 15 App Router, Supabase (PostgreSQL), Resend email, cron-job.org, existing partner referral infrastructure.

**Spec:** `C:\Users\email\projects\ImNotAnAttorney-web\docs\superpowers\specs\2026-04-12-court-reminders-platform-design.md`

---

## Task 0: CRO Copy Fixes (Independent — No Dependencies)

**Files:**
- Modify: `src/app/partners/page.tsx` (line 165)
- Modify: `src/app/partners/bondsman/page.tsx` (line 142)

These are 2-line fixes that ship independently.

- [ ] **Step 1: Fix copy inconsistency on generic partner page**

In `src/app/partners/page.tsx`, find the form footer text (approximately line 165):

```tsx
// OLD:
Takes 60 seconds. We&apos;ll review and get back to you within 24 hours.

// NEW:
Takes 60 seconds. Instant approval — check your email.
```

- [ ] **Step 2: Fix copy inconsistency on bondsman page**

In `src/app/partners/bondsman/page.tsx`, find the same text (approximately line 142):

```tsx
// OLD:
Takes 60 seconds. We&apos;ll review and get back to you within 24 hours.

// NEW:
Takes 60 seconds. Instant approval — check your email.
```

- [ ] **Step 3: Build to verify**

Run: `npx next build 2>&1 | tail -5`
Expected: Clean build, no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/partners/page.tsx src/app/partners/bondsman/page.tsx
git commit -m "fix(partners): update stale 24h copy to match auto-approve flow"
```

---

## Task 1: DB Migration

**Files:**
- Create: `supabase/migrations/20260412b_court_reminders.sql`

This MUST be applied first — Tasks 2-7 depend on the new table.

- [ ] **Step 1: Write the migration file**

```sql
-- Court reminders platform — free court prep for partner-referred defendants
-- Stores sign-ups, tracks reminder delivery, links to partner for attribution.

CREATE TABLE IF NOT EXISTS court_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text UNIQUE NOT NULL,
  first_name text NOT NULL,
  email text NOT NULL,
  charge_type text NOT NULL,
  county_state text NOT NULL,
  court_date date NOT NULL,
  recommended_tier text,
  partner_promo_code text,
  status text NOT NULL DEFAULT 'active',
  reminders_sent text[] DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  converted_at timestamptz,
  order_id uuid
);

-- Cron query: find active reminders approaching court date
CREATE INDEX IF NOT EXISTS idx_court_reminders_active_date
  ON court_reminders (status, court_date)
  WHERE status = 'active';

-- Prep page lookup by token
CREATE INDEX IF NOT EXISTS idx_court_reminders_token
  ON court_reminders (token);

-- Partner dashboard: count sign-ups per partner
CREATE INDEX IF NOT EXISTS idx_court_reminders_partner
  ON court_reminders (partner_promo_code)
  WHERE partner_promo_code IS NOT NULL;
```

- [ ] **Step 2: Save the migration file**

Save to `supabase/migrations/20260412b_court_reminders.sql`.

- [ ] **Step 3: Apply via Supabase Management API**

```bash
node -e "
const fs = require('fs');
const sql = fs.readFileSync('supabase/migrations/20260412b_court_reminders.sql', 'utf8');
fetch('https://api.supabase.com/v1/projects/jxjbjmgdukwkoclydqdr/database/query', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer ' + process.env.SUPABASE_ACCESS_TOKEN,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ query: sql })
}).then(r => r.json()).then(console.log).catch(console.error);
"
```

Verify the table exists:
```bash
node -e "
fetch('https://api.supabase.com/v1/projects/jxjbjmgdukwkoclydqdr/database/query', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer ' + process.env.SUPABASE_ACCESS_TOKEN,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ query: \"SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'court_reminders' ORDER BY ordinal_position\" })
}).then(r => r.json()).then(d => console.log(JSON.stringify(d, null, 2))).catch(console.error);
"
```

Expected: 14 columns matching the schema above.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260412b_court_reminders.sql
git commit -m "feat(court-prep): migration — court_reminders table + indexes"
```

---

## Task 2: Shared Library — Types, Content, Discount Helper

**Files:**
- Create: `src/lib/court-reminders.ts`
- Modify: `src/lib/referral.ts` (add `calculatePartnerDiscount`)

- [ ] **Step 1: Create `src/lib/court-reminders.ts`**

```typescript
/**
 * @fileoverview Court reminders shared types, constants, and content.
 *
 * COURT_PREP_CONTENT provides charge-type-specific court logistics
 * (what to expect, what to bring, what to wear). This is general legal
 * education — the kind available on any court website or legal blog.
 *
 * NO attorney questions. NO case-specific analysis. Those are paid products.
 */

// ── Types ───────────────────────────────────────────────────
export interface CourtReminder {
  id: string;
  token: string;
  first_name: string;
  email: string;
  charge_type: string;
  county_state: string;
  court_date: string;
  recommended_tier: string | null;
  partner_promo_code: string | null;
  status: "active" | "completed" | "unsubscribed";
  reminders_sent: string[];
  created_at: string;
  converted_at: string | null;
  order_id: string | null;
}

// ── Reminder intervals (days before court date) ─────────────
export const REMINDER_INTERVALS = [
  { key: "reminder_14d", daysBefore: 14 },
  { key: "reminder_7d", daysBefore: 7 },
  { key: "reminder_3d", daysBefore: 3 },
  { key: "reminder_1d", daysBefore: 1 },
] as const;

/** Post-court follow-up (1 day AFTER). Handled separately from pre-court. */
export const POST_COURT_KEY = "post_court";

// ── Prep page expiration: 30 days after court date ──────────
export const PREP_PAGE_EXPIRY_DAYS = 30;

// ── Court prep content per charge type ──────────────────────
export interface CourtPrepContent {
  whatToExpect: string;
  whatToBring: string[];
  whatToWear: string;
  arrivalTips: string;
  /** Teaser copy — describes what the paid product covers, NOT actual questions */
  paidProductTeaser: string;
}

const GENERIC_CONTENT: CourtPrepContent = {
  whatToExpect:
    "At your hearing, a judge will review the charges against you. The prosecutor will present their position, and your attorney will respond on your behalf. You may or may not be asked to speak — follow your attorney's guidance. Hearings typically last 10-30 minutes.",
  whatToBring: [
    "Government-issued photo ID",
    "Your bond paperwork",
    "Any documents your attorney asked you to bring",
    "A pen and notepad for notes",
  ],
  whatToWear:
    "Business casual or better. No hats, sunglasses, shorts, or tank tops. Courts take appearance seriously — dress like you take your case seriously.",
  arrivalTips:
    "Arrive 30 minutes early. Go through security (no phones in some courtrooms — check your county's rules). Find the correct courtroom number from the docket board in the lobby. Sit quietly until your case is called.",
  paidProductTeaser:
    "Your case has specific angles an attorney should investigate — charge-specific weaknesses, procedural requirements, and evidence standards. Our analysis identifies them and gives you the exact questions.",
};

const DUI_CONTENT: CourtPrepContent = {
  whatToExpect:
    "DUI hearings often involve a review of the traffic stop, field sobriety tests, and chemical test results. The prosecutor will present the officer's report. Your attorney may challenge the stop, the testing procedures, or the chain of custody for samples.",
  whatToBring: [
    ...GENERIC_CONTENT.whatToBring,
    "Any receipts or records from the night of the arrest (if available)",
  ],
  whatToWear: GENERIC_CONTENT.whatToWear,
  arrivalTips: GENERIC_CONTENT.arrivalTips,
  paidProductTeaser:
    "DUI cases have specific procedural requirements — calibration records, observation periods, rising blood alcohol timelines. Our analysis identifies the angles specific to YOUR stop and YOUR test results.",
};

const DRUG_CONTENT: CourtPrepContent = {
  whatToExpect:
    "Drug possession hearings focus on the circumstances of the search, the chain of custody for the substance, and lab testing procedures. Your attorney may challenge whether the search was lawful or whether the substance was properly identified.",
  whatToBring: GENERIC_CONTENT.whatToBring,
  whatToWear: GENERIC_CONTENT.whatToWear,
  arrivalTips: GENERIC_CONTENT.arrivalTips,
  paidProductTeaser:
    "Drug cases hinge on search legality and evidence handling. Our analysis identifies the specific procedural questions that apply to YOUR arrest circumstances.",
};

const THEFT_CONTENT: CourtPrepContent = {
  whatToExpect:
    "Theft hearings examine the evidence of intent, the value of the property, and any surveillance or witness testimony. The distinction between misdemeanor and felony theft depends on value thresholds that vary by state.",
  whatToBring: GENERIC_CONTENT.whatToBring,
  whatToWear: GENERIC_CONTENT.whatToWear,
  arrivalTips: GENERIC_CONTENT.arrivalTips,
  paidProductTeaser:
    "Theft charges have value thresholds, intent requirements, and restitution opportunities that vary by jurisdiction. Our analysis maps the specific angles for YOUR charge.",
};

export const COURT_PREP_CONTENT: Record<string, CourtPrepContent> = {
  "dui-first-offense": DUI_CONTENT,
  "drug-possession": DRUG_CONTENT,
  "drug-trafficking": DRUG_CONTENT,
  "white-collar": THEFT_CONTENT,
  "federal-criminal": GENERIC_CONTENT,
  "probation-violation": GENERIC_CONTENT,
  "sex-offense": GENERIC_CONTENT,
  "self-defense": GENERIC_CONTENT,
  other: GENERIC_CONTENT,
};

/** Get prep content for a charge type, always returns content (never undefined). */
export function getPrepContent(chargeSlug: string): CourtPrepContent {
  return COURT_PREP_CONTENT[chargeSlug] || GENERIC_CONTENT;
}

// ── Charge type display names ───────────────────────────────
export const CHARGE_DISPLAY_NAMES: Record<string, string> = {
  "dui-first-offense": "DUI / DWI",
  "drug-possession": "Drug Possession",
  "drug-trafficking": "Drug Trafficking",
  "white-collar": "White Collar",
  "federal-criminal": "Federal Charges",
  "probation-violation": "Probation Violation",
  "sex-offense": "Sex Offense",
  "self-defense": "Self-Defense Claim",
  other: "Criminal Charges",
};
```

- [ ] **Step 2: Add `calculatePartnerDiscount` to `src/lib/referral.ts`**

Add at the bottom of the file (after `getPartnerByPromoCode`):

```typescript
/**
 * Calculates 10% partner discount.
 * Shared between ReferralQuiz (client) and prep page (server).
 */
export function calculatePartnerDiscount(priceInCents: number): {
  original: number;
  discounted: number;
  savings: number;
} {
  const discounted = Math.round(priceInCents * 0.9);
  return {
    original: priceInCents,
    discounted,
    savings: priceInCents - discounted,
  };
}
```

- [ ] **Step 3: Build to verify types compile**

Run: `npx tsc --noEmit --skipLibCheck 2>&1 | tail -5`
Expected: Clean, no errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/court-reminders.ts src/lib/referral.ts
git commit -m "feat(court-prep): shared types, content map, discount helper"
```

---

## Task 3: Court Reminder API Route

**Files:**
- Create: `src/app/api/court-reminders/route.ts`
- Create: `src/app/api/court-reminders/unsubscribe/route.ts`

- [ ] **Step 1: Create the create-reminder API**

```typescript
/**
 * POST /api/court-reminders — Creates a court reminder sign-up.
 *
 * Validates input, generates a unique token, stores in Supabase,
 * sends confirmation email, returns the prep page token.
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
import { SITE_URL } from "@/lib/site";
import { escapeHtml } from "@/lib/email";
import { randomUUID } from "crypto";
import type { CourtReminder } from "@/lib/court-reminders";

interface CreateBody {
  first_name: string;
  email: string;
  charge_type: string;
  county_state: string;
  court_date: string;
  recommended_tier?: string;
  partner_promo_code?: string;
}

export async function POST(req: NextRequest) {
  let body: CreateBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // ── Validate required fields ──
  const { first_name, email, charge_type, county_state, court_date } = body;
  if (!first_name?.trim() || !email?.trim() || !charge_type?.trim() || !county_state?.trim() || !court_date?.trim()) {
    return NextResponse.json({ error: "All fields are required" }, { status: 400 });
  }

  // Basic email validation
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
  }

  // Court date must be in the future
  const courtDateObj = new Date(court_date + "T00:00:00");
  if (isNaN(courtDateObj.getTime()) || courtDateObj < new Date()) {
    return NextResponse.json({ error: "Court date must be in the future" }, { status: 400 });
  }

  const token = randomUUID();
  const supabase = createAdminClient();

  const { error: insertErr } = await supabase.from("court_reminders").insert({
    token,
    first_name: first_name.trim(),
    email: email.trim().toLowerCase(),
    charge_type,
    county_state: county_state.trim(),
    court_date,
    recommended_tier: body.recommended_tier || null,
    partner_promo_code: body.partner_promo_code || null,
  });

  if (insertErr) {
    console.error("[Court Reminders] Insert error:", insertErr);
    return NextResponse.json({ error: "Failed to create reminder" }, { status: 500 });
  }

  // ── Send confirmation email ──
  const prepUrl = `${SITE_URL}/prep/${token}`;
  const safeName = escapeHtml(first_name.trim());
  try {
    await sendEmail({
      to: email.trim().toLowerCase(),
      subject: "Your court prep page is ready",
      html: `
        <h1 style="color: #F59E0B; font-size: 24px; margin: 0 0 16px;">Your court prep is set up, ${safeName}.</h1>
        <p style="color: #D4D4D8; font-size: 15px; line-height: 1.6;">We'll send you reminders before your court date so you don't miss anything.</p>
        <p style="color: #D4D4D8; font-size: 15px; line-height: 1.6;">Your personalized prep page — what to expect, what to bring, and how to prepare:</p>
        <p style="margin: 24px 0;"><a href="${prepUrl}" style="display: inline-block; background: #F59E0B; color: #0C0A09; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 700;">View Your Court Prep</a></p>
        <p style="color: #71717A; font-size: 13px;">Bookmark this link — it's yours. We'll also include it in every reminder email.</p>
      `,
    });
  } catch (e) {
    console.warn("[Court Reminders] Confirmation email failed:", e);
    // Non-fatal — reminder was still created
  }

  return NextResponse.json({ token, prepUrl });
}
```

- [ ] **Step 2: Create the unsubscribe route**

```typescript
/**
 * GET /api/court-reminders/unsubscribe?token=xxx — Unsubscribes a reminder.
 * Sets status to 'unsubscribed'. Shows a simple confirmation page.
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) {
    return new NextResponse("Missing token", { status: 400 });
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("court_reminders")
    .update({ status: "unsubscribed" })
    .eq("token", token)
    .eq("status", "active");

  if (error) {
    console.error("[Court Reminders] Unsubscribe error:", error);
  }

  // Always show success (even if token not found — prevent enumeration)
  return new NextResponse(
    `<!DOCTYPE html>
    <html lang="en"><head><meta charset="utf-8"><title>Unsubscribed</title>
    <style>body{background:#0C0A09;color:#D4D4D8;font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;}
    .box{text-align:center;max-width:400px;padding:2rem;}</style></head>
    <body><div class="box"><h1 style="color:#F59E0B;">Unsubscribed</h1>
    <p>You won't receive any more court date reminders from us.</p>
    <p style="color:#71717A;font-size:13px;margin-top:2rem;">If you change your mind, you can sign up again anytime.</p>
    </div></body></html>`,
    { headers: { "Content-Type": "text/html" } }
  );
}
```

- [ ] **Step 3: Build to verify**

Run: `npx tsc --noEmit --skipLibCheck 2>&1 | tail -5`
Expected: Clean.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/court-reminders/route.ts src/app/api/court-reminders/unsubscribe/route.ts
git commit -m "feat(court-prep): API routes — create reminder + unsubscribe"
```

---

## Task 4: Court Reminder Form Component + Sign-Up Page

**Files:**
- Create: `src/components/CourtReminderForm.tsx`
- Create: `src/app/r/[code]/reminders/page.tsx`

- [ ] **Step 1: Create `src/components/CourtReminderForm.tsx`**

```tsx
"use client";
/**
 * Court reminder sign-up form.
 * 4 fields (charge type pre-filled from quiz if available).
 * Submits to /api/court-reminders, redirects to /prep/[token] on success.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CHARGE_DISPLAY_NAMES } from "@/lib/court-reminders";

interface CourtReminderFormProps {
  chargeType?: string;
  recommendedTier?: string;
  partnerPromoCode: string;
}

const CHARGE_OPTIONS = Object.entries(CHARGE_DISPLAY_NAMES).map(([slug, label]) => ({
  slug,
  label,
}));

export function CourtReminderForm({
  chargeType,
  recommendedTier,
  partnerPromoCode,
}: CourtReminderFormProps) {
  const router = useRouter();
  const [firstName, setFirstName] = useState("");
  const [courtDate, setCourtDate] = useState("");
  const [countyState, setCountyState] = useState("");
  const [email, setEmail] = useState("");
  const [charge, setCharge] = useState(chargeType || "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const showChargeField = !chargeType;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const res = await fetch("/api/court-reminders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name: firstName,
          email,
          charge_type: charge,
          county_state: countyState,
          court_date: courtDate,
          recommended_tier: recommendedTier,
          partner_promo_code: partnerPromoCode,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Something went wrong. Please try again.");
        setSubmitting(false);
        return;
      }

      const { token } = await res.json();
      router.push(`/prep/${token}`);
    } catch {
      setError("Connection error. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-md mx-auto">
      <div>
        <label htmlFor="firstName" className="block text-sm font-medium text-zinc-300 mb-1">
          First name
        </label>
        <input
          id="firstName"
          type="text"
          required
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          className="w-full px-4 py-3 bg-zinc-900 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:border-amber-500 focus:outline-none"
          placeholder="Your first name"
        />
      </div>

      {showChargeField && (
        <div>
          <label htmlFor="chargeType" className="block text-sm font-medium text-zinc-300 mb-1">
            What are you charged with?
          </label>
          <select
            id="chargeType"
            required
            value={charge}
            onChange={(e) => setCharge(e.target.value)}
            className="w-full px-4 py-3 bg-zinc-900 border border-zinc-700 rounded-xl text-white focus:border-amber-500 focus:outline-none"
          >
            <option value="">Select your charge type</option>
            {CHARGE_OPTIONS.map((opt) => (
              <option key={opt.slug} value={opt.slug}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label htmlFor="courtDate" className="block text-sm font-medium text-zinc-300 mb-1">
          Next court date
        </label>
        <input
          id="courtDate"
          type="date"
          required
          value={courtDate}
          onChange={(e) => setCourtDate(e.target.value)}
          min={new Date().toISOString().split("T")[0]}
          className="w-full px-4 py-3 bg-zinc-900 border border-zinc-700 rounded-xl text-white focus:border-amber-500 focus:outline-none"
        />
      </div>

      <div>
        <label htmlFor="countyState" className="block text-sm font-medium text-zinc-300 mb-1">
          County & State
        </label>
        <input
          id="countyState"
          type="text"
          required
          value={countyState}
          onChange={(e) => setCountyState(e.target.value)}
          className="w-full px-4 py-3 bg-zinc-900 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:border-amber-500 focus:outline-none"
          placeholder="e.g. Pinellas County, FL"
        />
      </div>

      <div>
        <label htmlFor="email" className="block text-sm font-medium text-zinc-300 mb-1">
          Email <span className="text-zinc-500">(where we send your reminders)</span>
        </label>
        <input
          id="email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full px-4 py-3 bg-zinc-900 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:border-amber-500 focus:outline-none"
          placeholder="your@email.com"
        />
      </div>

      {error && (
        <p className="text-red-400 text-sm" role="alert">{error}</p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="w-full px-6 py-4 bg-amber-500 text-black font-bold rounded-xl text-lg hover:bg-amber-400 hover:scale-[1.02] transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
      >
        {submitting ? "Setting up..." : "Set Up My Court Prep"}
      </button>

      <p className="text-zinc-500 text-xs text-center">
        Free. No account needed. Legal information, not legal advice.
      </p>
    </form>
  );
}
```

- [ ] **Step 2: Create `src/app/r/[code]/reminders/page.tsx`**

```tsx
/**
 * /r/[code]/reminders — Court reminder sign-up page.
 *
 * Server component: looks up partner, sets ref cookie, renders form.
 * Accepts ?charge= and ?rec= query params from the quiz.
 */

import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { CourtReminderForm } from "@/components/CourtReminderForm";
import { REFERRAL_COOKIE_MAX_AGE } from "@/lib/referral";
import { FadeInUp } from "@/components/motion/FadeInUp";

export const metadata: Metadata = {
  title: "Free Court Prep | ImNotAnAttorney",
  description:
    "Court date reminders, what to expect at your hearing, and how to prepare. Free — no account needed.",
  openGraph: {
    title: "Free Court Prep",
    description: "Court date reminders + what to expect at your hearing.",
    type: "website",
  },
};

interface PageProps {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ charge?: string; rec?: string }>;
}

export default async function CourtRemindersPage({ params, searchParams }: PageProps) {
  const { code } = await params;
  const { charge, rec } = await searchParams;

  const supabase = createAdminClient();
  const { data: partner } = await supabase
    .from("partners")
    .select("name, promo_code, status")
    .eq("promo_code", code.toUpperCase())
    .eq("status", "approved")
    .limit(1)
    .maybeSingle();

  if (!partner) {
    redirect("/");
  }

  // Set referral cookie
  const cookieStore = await cookies();
  cookieStore.set("ref", partner.promo_code!, {
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: REFERRAL_COOKIE_MAX_AGE,
    path: "/",
  });

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col">
      <div className="flex-1 flex items-center justify-center px-4 py-16">
        <div className="max-w-lg w-full">
          <FadeInUp delay={0}>
            <h1 className="font-display text-3xl md:text-4xl font-bold text-center mb-4 leading-tight">
              Don&apos;t miss your court date.
            </h1>
            <p className="text-lg text-zinc-300 text-center mb-8">
              Free reminders + what to expect at your hearing.
            </p>
          </FadeInUp>

          <FadeInUp delay={0.1}>
            <CourtReminderForm
              chargeType={charge}
              recommendedTier={rec}
              partnerPromoCode={partner.promo_code!}
            />
          </FadeInUp>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Build to verify**

Run: `npx next build 2>&1 | tail -5`
Expected: Clean build. New route `/r/[code]/reminders` appears in output.

- [ ] **Step 4: Commit**

```bash
git add src/components/CourtReminderForm.tsx src/app/r/\[code\]/reminders/page.tsx
git commit -m "feat(court-prep): reminder sign-up form + /r/[code]/reminders page"
```

---

## Task 5: Personalized Prep Page

**Files:**
- Create: `src/app/prep/[token]/page.tsx`

- [ ] **Step 1: Create the prep page**

```tsx
/**
 * /prep/[token] — Personalized court prep page.
 *
 * Shows court date countdown, what to expect, what to bring,
 * and a product recommendation. Refreshes partner ref cookie
 * on every visit for attribution.
 *
 * Free content = court logistics. Paid = case-specific intelligence.
 */

import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  getPrepContent,
  CHARGE_DISPLAY_NAMES,
  PREP_PAGE_EXPIRY_DAYS,
} from "@/lib/court-reminders";
import { TIER_CORE } from "@/lib/tiers";
import { calculatePartnerDiscount, REFERRAL_COOKIE_MAX_AGE } from "@/lib/referral";

interface PageProps {
  params: Promise<{ token: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { token } = await params;
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("court_reminders")
    .select("county_state, charge_type, court_date")
    .eq("token", token)
    .maybeSingle();

  if (!data) {
    return { title: "Court Prep | ImNotAnAttorney" };
  }

  const chargeName = CHARGE_DISPLAY_NAMES[data.charge_type] || "Criminal Charges";
  return {
    title: `Court Prep — ${data.county_state} | ImNotAnAttorney`,
    description: `Your court date is ${data.court_date}. Here's what to expect and how to prepare.`,
    openGraph: {
      title: `Court Prep — ${chargeName}`,
      description: `Your court date is ${data.court_date}. What to expect at your hearing.`,
    },
  };
}

export default async function PrepPage({ params }: PageProps) {
  const { token } = await params;
  const supabase = createAdminClient();

  const { data: reminder } = await supabase
    .from("court_reminders")
    .select("*")
    .eq("token", token)
    .maybeSingle();

  if (!reminder || reminder.status === "unsubscribed") {
    notFound();
  }

  // Check expiration (30 days past court date)
  const courtDate = new Date(reminder.court_date + "T00:00:00");
  const expiryDate = new Date(courtDate);
  expiryDate.setDate(expiryDate.getDate() + PREP_PAGE_EXPIRY_DAYS);
  const isExpired = new Date() > expiryDate;

  if (isExpired) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center px-4">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-bold mb-4">This prep page has expired</h1>
          <p className="text-zinc-400 mb-8">Your court date has passed. If your case is ongoing, explore our services.</p>
          <Link href="/services" className="inline-block px-8 py-3 bg-amber-500 text-black font-bold rounded-xl hover:bg-amber-400 transition-colors">
            Explore Services
          </Link>
        </div>
      </div>
    );
  }

  // Refresh ref cookie for attribution
  if (reminder.partner_promo_code) {
    const cookieStore = await cookies();
    cookieStore.set("ref", reminder.partner_promo_code, {
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: REFERRAL_COOKIE_MAX_AGE,
      path: "/",
    });
  }

  // Calculate countdown
  const now = new Date();
  const diffMs = courtDate.getTime() - now.getTime();
  const daysUntil = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  const courtPassed = daysUntil < 0;

  const content = getPrepContent(reminder.charge_type);
  const chargeName = CHARGE_DISPLAY_NAMES[reminder.charge_type] || "Criminal Charges";

  // Product recommendation
  const tier = reminder.recommended_tier ? TIER_CORE[reminder.recommended_tier] : null;
  const discount = tier ? calculatePartnerDiscount(tier.price) : null;

  // Checkout URL with reminder token for conversion tracking
  const checkoutUrl = tier
    ? `/checkout?tier=${reminder.recommended_tier}${reminder.partner_promo_code ? `&ref=${reminder.partner_promo_code}` : ""}&reminder_token=${token}`
    : "/services";

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="max-w-2xl mx-auto px-4 py-16">
        {/* Section A: Countdown */}
        <section className="text-center mb-12">
          {courtPassed ? (
            <>
              <p className="text-zinc-400 text-lg mb-2">Your court date was</p>
              <p className="text-2xl font-bold">{courtDate.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</p>
              <p className="text-zinc-400 mt-2">If your case is ongoing, talk to your attorney about next steps.</p>
            </>
          ) : (
            <>
              <p className="text-zinc-400 text-lg mb-2">Your court date is in</p>
              <p className="text-5xl font-bold text-amber-400 mb-2">{daysUntil} day{daysUntil !== 1 ? "s" : ""}</p>
              <p className="text-xl text-zinc-300">
                {courtDate.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
                {" — "}{reminder.county_state}
              </p>
            </>
          )}
        </section>

        {/* Section B: What to Expect */}
        <section className="mb-10">
          <h2 className="font-display text-2xl font-bold text-amber-400 mb-4">
            What to Expect at a {chargeName} Hearing
          </h2>
          <p className="text-zinc-300 leading-relaxed">{content.whatToExpect}</p>
        </section>

        {/* What to Bring */}
        <section className="mb-10">
          <h2 className="font-display text-xl font-bold mb-3">What to Bring</h2>
          <ul className="space-y-2">
            {content.whatToBring.map((item, i) => (
              <li key={i} className="text-zinc-300 flex items-start gap-2">
                <span className="text-amber-400 mt-0.5">•</span>
                {item}
              </li>
            ))}
          </ul>
        </section>

        {/* What to Wear */}
        <section className="mb-10">
          <h2 className="font-display text-xl font-bold mb-3">What to Wear</h2>
          <p className="text-zinc-300 leading-relaxed">{content.whatToWear}</p>
        </section>

        {/* Arrival Tips */}
        <section className="mb-10">
          <h2 className="font-display text-xl font-bold mb-3">Day-Of Tips</h2>
          <p className="text-zinc-300 leading-relaxed">{content.arrivalTips}</p>
        </section>

        {/* Section D: Product Recommendation */}
        {tier && discount && !courtPassed && (
          <section className="mt-12 bg-zinc-900 rounded-xl border border-zinc-700 p-6">
            <h2 className="font-display text-xl font-bold text-amber-400 mb-3">
              Want questions specific to YOUR case?
            </h2>
            <p className="text-zinc-300 mb-4">{content.paidProductTeaser}</p>

            <div className="flex items-baseline gap-3 mb-4">
              <span className="text-zinc-500 line-through text-lg">
                ${(discount.original / 100).toFixed(0)}
              </span>
              <span className="text-3xl font-bold text-white">
                ${(discount.discounted / 100).toFixed(2)}
              </span>
              <span className="text-amber-400 text-sm font-medium">
                Save ${(discount.savings / 100).toFixed(0)}
              </span>
            </div>

            <p className="text-zinc-400 text-sm mb-6">
              {tier.name} — {tier.delivery}
            </p>

            <Link
              href={checkoutUrl}
              className="block w-full text-center px-6 py-4 bg-amber-500 text-black font-bold rounded-xl text-lg hover:bg-amber-400 hover:scale-[1.02] transition-all"
            >
              Get Questions Specific to Your Case
            </Link>
          </section>
        )}

        {/* Section E: Footer */}
        <footer className="mt-12 pt-8 border-t border-zinc-800 text-center">
          <p className="text-zinc-500 text-sm">
            ImNotAnAttorney provides legal information — not legal advice.
          </p>
          <p className="text-zinc-600 text-xs mt-2">
            Reminders will be sent to {reminder.email} at 14, 7, 3, and 1 day(s) before your court date.
          </p>
          <a
            href={`/api/court-reminders/unsubscribe?token=${token}`}
            className="text-zinc-600 text-xs hover:text-zinc-400 mt-1 inline-block"
          >
            Unsubscribe from reminders
          </a>
        </footer>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Build to verify**

Run: `npx next build 2>&1 | tail -5`
Expected: Clean build. `/prep/[token]` appears as a dynamic route.

- [ ] **Step 3: Commit**

```bash
git add src/app/prep/\[token\]/page.tsx
git commit -m "feat(court-prep): personalized prep page with countdown + product rec"
```

---

## Task 6: Quiz Second CTA

**Files:**
- Modify: `src/components/ReferralQuiz.tsx` (recommendation phase, step 4)

- [ ] **Step 1: Add secondary CTA to recommendation phase**

In the recommendation phase (the `if (step === totalSteps)` block), find the "See other options" link and add the court prep CTA between the checkout button and the "See other options" link:

After the existing `<Link href={...} className="block w-full text-center...">Get Started</Link>`, add:

```tsx
            {/* Divider */}
            <div className="flex items-center gap-3 my-4">
              <div className="flex-1 h-px bg-zinc-700" />
              <span className="text-zinc-500 text-sm">or</span>
              <div className="flex-1 h-px bg-zinc-700" />
            </div>

            {/* Free court prep CTA */}
            <Link
              href={`/r/${promoCode}/reminders?charge=${chargeSlug}&rec=${rec.slug}`}
              className="block w-full text-center px-6 py-3 border border-zinc-500 text-zinc-300 rounded-xl hover:border-amber-500 hover:text-white transition-colors"
            >
              Get Free Court Prep
            </Link>
            <p className="text-zinc-500 text-xs text-center mt-2">
              Court date reminders + what to expect at your hearing.
            </p>
```

- [ ] **Step 2: Build to verify**

Run: `npx next build 2>&1 | tail -5`
Expected: Clean build.

- [ ] **Step 3: Commit**

```bash
git add src/components/ReferralQuiz.tsx
git commit -m "feat(court-prep): add free court prep CTA to quiz recommendation page"
```

---

## Task 7: Reminder Email Templates + Cron Engine

**Files:**
- Create: `src/lib/court-reminder-emails.ts`
- Create: `src/app/api/cron/court-reminders/route.ts`

- [ ] **Step 1: Create email templates**

```typescript
/**
 * @fileoverview Court reminder email templates.
 *
 * 5 emails: -14d, -7d, -3d, -1d, +1d post-court.
 * All return { subject: string; html: string } where html is INNER HTML.
 * sendEmail() wraps in branded dark template automatically.
 */

import { SITE_URL } from "@/lib/site";
import { escapeHtml } from "@/lib/email";
import { CHARGE_DISPLAY_NAMES, getPrepContent } from "@/lib/court-reminders";

const AMBER = "#F59E0B";
const ZINC = "#D4D4D8";
const btnStyle = `display: inline-block; background: ${AMBER}; color: #0C0A09; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 700; font-size: 16px;`;
const pStyle = `color: ${ZINC}; font-size: 15px; line-height: 1.6; margin: 0 0 12px;`;

interface ReminderContext {
  firstName: string;
  chargeType: string;
  countyState: string;
  courtDate: string;
  token: string;
}

function prepUrl(token: string) {
  return `${SITE_URL}/prep/${token}`;
}

function unsubUrl(token: string) {
  return `${SITE_URL}/api/court-reminders/unsubscribe?token=${token}`;
}

function footer(token: string) {
  return `<p style="color: #71717A; font-size: 12px; margin-top: 32px; border-top: 1px solid #27272A; padding-top: 16px;">
    ImNotAnAttorney provides legal information — not legal advice.<br/>
    <a href="${unsubUrl(token)}" style="color: #71717A; text-decoration: underline;">Unsubscribe from reminders</a>
  </p>`;
}

export function reminder14d(ctx: ReminderContext): { subject: string; html: string } {
  const safeName = escapeHtml(ctx.firstName);
  const chargeName = CHARGE_DISPLAY_NAMES[ctx.chargeType] || "your hearing";
  return {
    subject: `Your court date is in 2 weeks — ${ctx.countyState}`,
    html: `
      <h1 style="color: ${AMBER}; font-size: 24px; margin: 0 0 16px;">${safeName}, your court date is in 2 weeks.</h1>
      <p style="${pStyle}">We know this is stressful. Here's what helps: being prepared.</p>
      <p style="${pStyle}">Your prep page has everything you need — what to expect at a ${escapeHtml(chargeName)} hearing, what to bring, and how to show up ready.</p>
      <p style="margin: 24px 0;"><a href="${prepUrl(ctx.token)}" style="${btnStyle}">View Your Court Prep</a></p>
      ${footer(ctx.token)}
    `,
  };
}

export function reminder7d(ctx: ReminderContext): { subject: string; html: string } {
  const safeName = escapeHtml(ctx.firstName);
  return {
    subject: `1 week until your court date — ${ctx.countyState}`,
    html: `
      <h1 style="color: ${AMBER}; font-size: 24px; margin: 0 0 16px;">1 week, ${safeName}.</h1>
      <p style="${pStyle}">Your hearing is next week. Now's the time to prepare — review what to expect, plan what to bring, and make sure you know when and where to show up.</p>
      <p style="margin: 24px 0;"><a href="${prepUrl(ctx.token)}" style="${btnStyle}">Review Your Court Prep</a></p>
      ${footer(ctx.token)}
    `,
  };
}

export function reminder3d(ctx: ReminderContext): { subject: string; html: string } {
  const safeName = escapeHtml(ctx.firstName);
  const content = getPrepContent(ctx.chargeType);
  const items = content.whatToBring.map((b) => `<li style="color: ${ZINC}; margin: 4px 0;">${escapeHtml(b)}</li>`).join("");
  return {
    subject: `3 days — are you prepared?`,
    html: `
      <h1 style="color: ${AMBER}; font-size: 24px; margin: 0 0 16px;">3 days, ${safeName}.</h1>
      <p style="${pStyle}">Quick checklist:</p>
      <ul style="padding-left: 20px; margin: 0 0 16px;">${items}</ul>
      <p style="${pStyle}">${escapeHtml(content.whatToWear)}</p>
      <p style="margin: 24px 0;"><a href="${prepUrl(ctx.token)}" style="${btnStyle}">Full Prep Page</a></p>
      ${footer(ctx.token)}
    `,
  };
}

export function reminder1d(ctx: ReminderContext): { subject: string; html: string } {
  const safeName = escapeHtml(ctx.firstName);
  return {
    subject: `Tomorrow: ${ctx.countyState} Court`,
    html: `
      <h1 style="color: ${AMBER}; font-size: 24px; margin: 0 0 16px;">Tomorrow, ${safeName}.</h1>
      <p style="${pStyle}">Arrive 30 minutes early. Bring your ID and any documents your attorney asked for. Dress like you take your case seriously.</p>
      <p style="${pStyle}">You've prepared. You're ready.</p>
      <p style="margin: 24px 0;"><a href="${prepUrl(ctx.token)}" style="${btnStyle}">Last-Minute Review</a></p>
      ${footer(ctx.token)}
    `,
  };
}

export function postCourtEmail(ctx: ReminderContext): { subject: string; html: string } {
  const safeName = escapeHtml(ctx.firstName);
  return {
    subject: `How did it go?`,
    html: `
      <h1 style="color: ${AMBER}; font-size: 24px; margin: 0 0 16px;">${safeName}, how did your hearing go?</h1>
      <p style="${pStyle}">If your case is ongoing, staying prepared for what comes next makes a real difference.</p>
      <p style="${pStyle}">Your prep page is still available if you need it.</p>
      <p style="margin: 24px 0;"><a href="${prepUrl(ctx.token)}" style="${btnStyle}">View Your Prep Page</a></p>
      ${footer(ctx.token)}
    `,
  };
}
```

- [ ] **Step 2: Create the cron route**

```typescript
/**
 * GET /api/cron/court-reminders — Sends court date reminder emails.
 *
 * Schedule: Every 6 hours via cron-job.org.
 * Protected by CRON_AUTH_TOKEN bearer token.
 *
 * Queries active reminders, checks which intervals are due,
 * sends emails, marks as sent. Handles post-court follow-up separately.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/auth/guards";
import { acquireCronLock, releaseCronLock } from "@/lib/cron-idempotency";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
import { REMINDER_INTERVALS, POST_COURT_KEY } from "@/lib/court-reminders";
import {
  reminder14d,
  reminder7d,
  reminder3d,
  reminder1d,
  postCourtEmail,
} from "@/lib/court-reminder-emails";

const EMAIL_BUILDERS: Record<
  string,
  (ctx: { firstName: string; chargeType: string; countyState: string; courtDate: string; token: string }) => { subject: string; html: string }
> = {
  reminder_14d: reminder14d,
  reminder_7d: reminder7d,
  reminder_3d: reminder3d,
  reminder_1d: reminder1d,
  [POST_COURT_KEY]: postCourtEmail,
};

export async function GET(req: NextRequest) {
  const auth = requireCron(req);
  if (!auth.authorized) return auth.error;

  const lock = await acquireCronLock("court-reminders", 5 * 60 * 60 * 1000);
  if (!lock.shouldRun) {
    return NextResponse.json({ skipped: true, reason: lock.reason });
  }

  const supabase = createAdminClient();
  let sent = 0;
  let errors = 0;

  try {
    // Fetch all active reminders
    const { data: reminders, error: fetchErr } = await supabase
      .from("court_reminders")
      .select("*")
      .eq("status", "active")
      .limit(200);

    if (fetchErr) {
      console.error("[Court Reminders Cron] Fetch error:", fetchErr);
      await releaseCronLock(lock.executionId, "failed");
      return NextResponse.json({ error: "Fetch failed" }, { status: 500 });
    }

    if (!reminders || reminders.length === 0) {
      await releaseCronLock(lock.executionId, "success");
      return NextResponse.json({ sent: 0, message: "No active reminders" });
    }

    const now = new Date();

    for (const r of reminders) {
      const courtDate = new Date(r.court_date + "T00:00:00");
      const diffMs = courtDate.getTime() - now.getTime();
      const daysUntil = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
      const alreadySent = new Set<string>(r.reminders_sent || []);

      const ctx = {
        firstName: r.first_name,
        chargeType: r.charge_type,
        countyState: r.county_state,
        courtDate: r.court_date,
        token: r.token,
      };

      // Pre-court reminders
      for (const interval of REMINDER_INTERVALS) {
        if (daysUntil <= interval.daysBefore && !alreadySent.has(interval.key)) {
          const builder = EMAIL_BUILDERS[interval.key];
          if (!builder) continue;

          try {
            const email = builder(ctx);
            await sendEmail({ to: r.email, subject: email.subject, html: email.html });
            alreadySent.add(interval.key);
            sent++;
          } catch (e) {
            console.error(`[Court Reminders Cron] Failed ${interval.key} for ${r.id}:`, e);
            errors++;
          }
        }
      }

      // Post-court follow-up (+1 day)
      if (daysUntil < -1 && !alreadySent.has(POST_COURT_KEY)) {
        try {
          const email = postCourtEmail(ctx);
          await sendEmail({ to: r.email, subject: email.subject, html: email.html });
          alreadySent.add(POST_COURT_KEY);
          sent++;

          // Mark as completed after post-court email
          await supabase
            .from("court_reminders")
            .update({ status: "completed", reminders_sent: Array.from(alreadySent) })
            .eq("id", r.id);
          continue; // Skip the regular update below
        } catch (e) {
          console.error(`[Court Reminders Cron] Failed post_court for ${r.id}:`, e);
          errors++;
        }
      }

      // Update reminders_sent if anything was added
      if (alreadySent.size > (r.reminders_sent || []).length) {
        await supabase
          .from("court_reminders")
          .update({ reminders_sent: Array.from(alreadySent) })
          .eq("id", r.id);
      }
    }

    await releaseCronLock(lock.executionId, "success");
    return NextResponse.json({ sent, errors, processed: reminders.length });
  } catch (err) {
    console.error("[Court Reminders Cron] Fatal:", err);
    await releaseCronLock(lock.executionId, "failed");
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
```

- [ ] **Step 3: Build to verify**

Run: `npx next build 2>&1 | tail -5`
Expected: Clean build.

- [ ] **Step 4: Commit**

```bash
git add src/lib/court-reminder-emails.ts src/app/api/cron/court-reminders/route.ts
git commit -m "feat(court-prep): reminder email templates + cron engine"
```

---

## Task 8: Conversion Attribution + Cron Registration

**Files:**
- Modify: `src/app/api/webhooks/stripe/route.ts` (add token-based tracking)
- Modify: `src/app/api/checkout/route.ts` (pass reminder_token to Stripe metadata)

- [ ] **Step 1: Pass reminder_token through checkout**

In `src/app/api/checkout/route.ts`, find where `metadata` is constructed for the Stripe checkout session. Add `court_reminder_token` from the request body or query param:

```typescript
// In the metadata object passed to stripe.checkout.sessions.create:
court_reminder_token: body.reminder_token || null,
```

The checkout page reads `reminder_token` from the URL query params (set by the prep page's checkout link) and includes it in the checkout POST body.

- [ ] **Step 2: Track conversion in webhook**

In `src/app/api/webhooks/stripe/route.ts`, after the existing `track_referral` RPC call succeeds, add:

```typescript
// ── Court reminder conversion tracking ──
const reminderToken = session.metadata?.court_reminder_token;
if (reminderToken) {
  const { error: crErr } = await supabase
    .from("court_reminders")
    .update({
      converted_at: new Date().toISOString(),
      order_id: orderId,
    })
    .eq("token", reminderToken)
    .eq("status", "active");

  if (crErr) {
    console.warn("[Webhook] Court reminder conversion tracking failed:", crErr);
  }
}
```

- [ ] **Step 3: Register cron job**

```bash
node -e "
const CRON_API_KEY = 'qmy3F+k6DrUgKCz/Jp8fEnpViJrE3pgaUfOoO8yAQn4=';
fetch('https://api.cron-job.org/jobs', {
  method: 'PUT',
  headers: {
    'Authorization': 'Bearer ' + CRON_API_KEY,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    job: {
      url: 'https://imnotanattorney.com/api/cron/court-reminders',
      title: 'INAA Court Reminder Emails',
      enabled: true,
      saveResponses: true,
      schedule: { timezone: 'America/New_York', hours: [0,6,12,18], mdays: [-1], months: [-1], wdays: [-1] },
      requestMethod: 0,
      extendedData: { headers: { Authorization: 'Bearer ' + process.env.CRON_AUTH_TOKEN } }
    }
  })
}).then(r => r.json()).then(console.log).catch(console.error);
"
```

- [ ] **Step 4: Build + verify**

Run: `npx next build 2>&1 | tail -5`
Expected: Clean build.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/checkout/route.ts src/app/api/webhooks/stripe/route.ts
git commit -m "feat(court-prep): conversion attribution via Stripe metadata + cron registration"
```

---

## Task 9: Partner Dashboard + Pitch Copy Updates

**Files:**
- Modify: `src/app/partner/dashboard/page.tsx` (reminder stats + getting started copy)
- Modify: `src/app/partners/bondsman/page.tsx` (differentiated pitch)
- Modify: `src/app/partners/page.tsx` (generic pitch update)
- Modify: `src/components/MessageTemplates.tsx` (court prep framing)
- Modify: `src/components/partner/CreativeAssets.tsx` (verbal script update)

- [ ] **Step 1: Add reminder stats to partner dashboard**

In the dashboard's earnings/stats section, add after the existing stats:

```tsx
{/* Court prep stats */}
<div className="bg-zinc-900 rounded-xl border border-zinc-700 p-4">
  <p className="text-sm text-zinc-400">Court prep sign-ups</p>
  <p className="text-2xl font-bold">{reminderSignups}</p>
</div>
```

Where `reminderSignups` comes from a new query in the dashboard's data fetching:

```typescript
const { count: reminderSignups } = await supabase
  .from("court_reminders")
  .select("*", { count: "exact", head: true })
  .eq("partner_promo_code", partner.promo_code);
```

- [ ] **Step 2: Update dashboard "Getting Started" copy**

Add to the toolkit/getting started section:

```tsx
<div className="bg-zinc-900 rounded-xl border border-zinc-700 p-4">
  <h3 className="font-bold text-amber-400 mb-2">How your link works</h3>
  <p className="text-sm text-zinc-300">
    When clients use your link, they take a quick quiz and get a product recommendation.
    They can also set up free court prep — date reminders + what to expect at their hearing.
    You earn commission whether they buy now or later through a reminder.
  </p>
</div>
```

- [ ] **Step 3: Update bondsman page pitch**

In `src/app/partners/bondsman/page.tsx`, update the value proposition section. Replace the current generic content with bondsman-specific pitch:

Hero sub-headline:
```tsx
Your clients need help preparing for court. We handle that — and you earn on every case.
```

Value prop bullets:
```tsx
{ title: "Free Court Prep for Your Clients", desc: "Date reminders, what to expect at their hearing, and how to show up ready." },
{ title: "You Earn 10-20% on Upgrades", desc: "When they're ready for case-specific analysis, your code gets them 10% off and you earn commission." },
{ title: "One Link. Every Client.", desc: "Text it, say it, email it. We do the rest." },
```

- [ ] **Step 4: Update generic partner page**

In `src/app/partners/page.tsx`, update the subtitle or value prop to mention court prep:

```tsx
Your referrals get free court prep — date reminders and hearing guidance. You earn 10-20% on every product they purchase.
```

- [ ] **Step 5: Update message templates with court prep framing**

In `src/components/MessageTemplates.tsx`, update template text to lead with court prep:

```typescript
const TEMPLATES = [
  {
    label: "Add to your check-in text",
    template: (code: string, url: string) =>
      `Hey [name], this is [your name]. Check-in: [day/time]. Free court prep — reminders and what to expect at your hearing: ${url} — code ${code} saves 10% on upgrades.`,
  },
  {
    label: "Quick share",
    template: (code: string, url: string) =>
      `Hey [name], free court date reminders + hearing prep for your case: ${url} — code ${code} saves 10% if you need anything more.`,
  },
  {
    label: "For someone else",
    template: (code: string, url: string) =>
      `Someone dealing with a case? Free court prep — date reminders, what to expect, how to prepare: ${url} — code ${code} for 10% off.`,
  },
];
```

- [ ] **Step 6: Update verbal script in CreativeAssets**

In `src/components/partner/CreativeAssets.tsx`, update the "Verbal One-Liner (for bondsmen)" template:

```typescript
{
  label: "Verbal One-Liner (for bondsmen)",
  template: (code: string, url: string) =>
    `After you tell them about check-ins, say:\n\n"Free court prep — reminders before your court date and what to expect at your hearing. imnotanattorney.com, code ${code} saves you 10%."\n\nOne sentence. That's it.`,
},
```

- [ ] **Step 7: Build + verify**

Run: `npx next build 2>&1 | tail -5`
Expected: Clean build.

- [ ] **Step 8: Commit**

```bash
git add src/app/partner/dashboard/page.tsx src/app/partners/bondsman/page.tsx src/app/partners/page.tsx src/components/MessageTemplates.tsx src/components/partner/CreativeAssets.tsx
git commit -m "feat(court-prep): partner pitch + dashboard + message template updates"
```

---

## Task 10: Deploy + Verify E2E

- [ ] **Step 1: Full build**

Run: `npx next build 2>&1 | tail -15`
Expected: Clean build, all new routes visible.

- [ ] **Step 2: Push to deploy**

```bash
git push origin master
```

- [ ] **Step 3: Verify deployment**

Wait for Vercel deploy, then verify:
- `/r/TEST/reminders` loads (or redirects if TEST isn't a valid partner code)
- `/api/court-reminders` returns 400 on GET (method not allowed or missing body)
- `/api/court-reminders/unsubscribe?token=fake` shows unsubscribe page

- [ ] **Step 4: Run CV**

```bash
node ~/projects/continuous-verification/verify.mjs --project inna --probe-only --no-trends
```

Expected: All probes pass.
