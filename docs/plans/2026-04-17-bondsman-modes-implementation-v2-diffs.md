# Bondsman Modes — v2 Diffs (supersedes v1 tasks)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Read v1 plan + this diff together. This doc OVERRIDES v1 on every task where it appears. Findings traceability: [2026-04-17-bondsman-modes-findings-and-fixes.md](2026-04-17-bondsman-modes-findings-and-fixes.md).

**Supersedes:** [2026-04-17-bondsman-modes-implementation.md](2026-04-17-bondsman-modes-implementation.md) (v1 — task structure intact, code contents overridden per below).
**Design:** [2026-04-17-modes-design.md](2026-04-17-modes-design.md) (still authoritative for intent).
**Findings:** [2026-04-17-bondsman-modes-findings-and-fixes.md](2026-04-17-bondsman-modes-findings-and-fixes.md) (110 review findings).

**Added tasks:** 3.5 (CourtReminderForm props), 5.5 (partner-by-code helper), 19.5 (ToolkitSection demotion), 25.5 (card content), 26.5 (checklist content), 27 (ComplianceReportClient enumerated), 32.0 (E2E seed partners).

**Pre-commit invariant (every task):** `npx tsc --noEmit --skipLibCheck > /tmp/tsc.log 2>&1 && echo OK`. Em-dash entities (`&mdash;`) banned in new copy — use commas, periods, or unicode ` — `. Touch targets ≥ 44×44 on all new interactive elements. `text-zinc-500` on `text-xs` banned — use `text-zinc-400`.

---

## Task 2 — Migration (OVERRIDES v1)

**Findings:** B5, B6, H21, M1, L36-L38.

### New migration SQL

```sql
-- 20260417a_partner_check_in_enabled.sql
BEGIN;

ALTER TABLE partners
  ADD COLUMN IF NOT EXISTS check_in_enabled boolean NOT NULL DEFAULT true;

ALTER TABLE partners
  ADD COLUMN IF NOT EXISTS flip_at timestamptz NULL;

UPDATE partners
  SET check_in_enabled = false
  WHERE source IS NULL OR source != 'bondsman';

COMMENT ON COLUMN partners.check_in_enabled IS
  'Per-partner operational mode. true=check-in mode. false=referral mode. Backfilled false for non-bondsmen on 2026-04-17.';
COMMENT ON COLUMN partners.flip_at IS
  'Last mode-flip timestamp. Drives FlipBanner visibility for 14 days post-flip. Set server-side by settings PATCH.';

COMMIT;
```

No partial index (M1 — heavy-true column, planner skip).

### Rollback script (new file: `supabase/migrations/rollback_20260417a.sql`)

```sql
BEGIN;
ALTER TABLE partners DROP COLUMN IF EXISTS check_in_enabled;
ALTER TABLE partners DROP COLUMN IF EXISTS flip_at;
COMMIT;
```

### Step 3 verification — fail-hard

```bash
node -e "
const p=process.env.SUPABASE_PROJECT_REF, t=process.env.SUPABASE_ACCESS_TOKEN;
const sql=\`SELECT source, check_in_enabled, COUNT(*) AS n FROM partners GROUP BY source, check_in_enabled ORDER BY source, check_in_enabled;\`;
fetch(\`https://api.supabase.com/v1/projects/\${p}/database/query\`,{
  method:'POST',headers:{Authorization:\`Bearer \${t}\`,'Content-Type':'application/json'},
  body:JSON.stringify({query:sql})
}).then(r=>r.json()).then(rows=>{
  const bad=rows.filter(r=>(r.source==='bondsman'&&r.check_in_enabled===false)||(r.source!=='bondsman'&&r.check_in_enabled===true));
  if(bad.length){console.error('INVARIANT BROKEN:',JSON.stringify(bad,null,2));process.exit(1);}
  console.log('OK',JSON.stringify(rows,null,2));
});
" > /tmp/verify.txt 2>&1
```

---

## Task 3 — Partner type (OVERRIDES v1)

**Findings:** M2.

### Partner interface additions

Add to `src/lib/partner-data.ts` Partner interface:

```typescript
  check_in_enabled: boolean;
  flip_at: string | null;
```

### partner-mode.ts (same as v1 + discount constants)

```typescript
import type { Partner } from "@/lib/partner-data";

export function isCheckInMode(partner: Pick<Partner, "check_in_enabled">): boolean {
  return partner.check_in_enabled === true;
}

export function computePartnerUrl(
  partner: Pick<Partner, "promo_code" | "check_in_enabled">,
  siteUrl: string,
): string {
  if (!partner.promo_code) return "";
  const prefix = partner.check_in_enabled ? "checkin" : "court-date";
  return `${siteUrl}/${prefix}/${partner.promo_code}`;
}

export const DISCOUNT_DOLLAR_ANCHOR = 100; // 10% of IB $997
export const DISCOUNT_PERCENT = 10;
```

### Test update

Add `flip_at: null` to base partner literal in `tests/lib/partner-mode.test.ts`.

---

## Task 3.5 — CourtReminderForm props (NEW)

**Findings:** B2, B3, B4, H9, L1.

**File:** `src/components/CourtReminderForm.tsx`

### New props

```typescript
interface CourtReminderFormProps {
  chargeType?: string;
  recommendedTier?: string;
  partnerPromoCode: string;
  compactMode?: boolean;      // hide charge_type + county_state + check_in_days
  requirePhone?: boolean;     // show+require phone field
  submitLabel?: string;       // override "Set Up My Court Prep"
  redirectTo?: (token: string) => string;  // override /prep/{token}
  requireConsent?: boolean;   // show+require consent checkbox
}
```

### State additions

```typescript
  const [phone, setPhone] = useState("");
  const [consent, setConsent] = useState(false);
```

### Phone field JSX (rendered when `requirePhone`, between email and consent)

```tsx
{requirePhone && (
  <div>
    <label htmlFor="phone" className="block text-sm font-medium text-zinc-300 mb-1">
      Mobile phone
    </label>
    <input
      id="phone"
      type="tel"
      required
      value={phone}
      onChange={(e) => setPhone(e.target.value)}
      className="w-full px-4 py-3 min-h-[44px] bg-zinc-900 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:border-amber-500 focus:outline-none"
      placeholder="(555) 123-4567"
      autoComplete="tel"
    />
    <p className="text-xs text-zinc-400 mt-1">Where we text your check-in prompts.</p>
  </div>
)}
```

### Consent checkbox

```tsx
{requireConsent && (
  <label className="flex items-start gap-3 cursor-pointer min-h-[44px] py-2">
    <input
      type="checkbox"
      checked={consent}
      onChange={(e) => setConsent(e.target.checked)}
      required
      className="mt-1 h-5 w-5 rounded border-zinc-700 bg-zinc-800 text-amber-500 focus:ring-amber-500"
    />
    <span className="text-sm text-zinc-400">
      I agree to text and email from ImNotAnAttorney about my court date and
      check-ins. Message/data rates may apply. Reply STOP to opt out.{" "}
      <a href="/privacy" className="text-amber-400 underline">Privacy policy</a>.
    </span>
  </label>
)}
```

### Compact mode gating

Wrap `showChargeField` block with `{!compactMode && showChargeField && (...)}`. Wrap county_state block with `{!compactMode && (...)}`. Wrap `<CheckInDayPicker>` block with `{!compactMode && partnerPromoCode && (...)}`.

### Submit + redirect

```tsx
<button type="submit" disabled={submitting} className="w-full px-6 py-4 min-h-[44px] bg-amber-500 text-black font-bold rounded-xl text-lg hover:bg-amber-400 hover:scale-[1.02] transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer">
  {submitting ? "Setting up..." : (submitLabel || "Set Up My Court Prep")}
</button>
```

Replace line 71-73:

```typescript
      const { token } = await res.json();
      const dest = redirectTo ? redirectTo(token) : `/prep/${token}`;
      router.push(dest);
```

### Fetch body

```typescript
        body: JSON.stringify({
          first_name: firstName,
          email,
          phone: requirePhone ? phone : undefined,
          charge_type: compactMode ? (chargeType || "other") : charge,
          county_state: compactMode ? undefined : countyState,
          court_date: courtDate,
          recommended_tier: recommendedTier,
          partner_promo_code: partnerPromoCode,
          check_in_days: compactMode ? undefined : (checkInIdk ? null : (checkInDays.length > 0 ? checkInDays : undefined)),
          check_in_idk: compactMode ? undefined : (checkInIdk ? true : undefined),
          consent: requireConsent ? consent : undefined,
        }),
```

### API route update

`src/app/api/court-reminders/route.ts` must accept `phone` + `consent` + treat missing `county_state`/`charge_type` as `"Unknown County"` / `"other"` when compactMode was used. Add subtask that reads current contract + adds the fields.

---

## Task 4 — apply route (OVERRIDES v1 Step 2)

**Findings:** B5, B6.

### Source allowlist (before body destructure)

```typescript
  const VALID_SOURCES = ["bondsman", "attorney", "advocate", "partner", "direct"] as const;
  type ValidSource = typeof VALID_SOURCES[number];
```

After destructure, validate:

```typescript
  if (source !== undefined && source !== null && !VALID_SOURCES.includes(source as ValidSource)) {
    return NextResponse.json({ error: "Invalid source" }, { status: 400 });
  }
```

### Inverted default

```typescript
  // Default OFF. Only bondsmen who affirmatively pick check-in mode opt in.
  let checkInEnabled: boolean = false;
  if (source === "bondsman") {
    if (checkInMode !== "enabled" && checkInMode !== "disabled") {
      return NextResponse.json(
        { error: "Please pick how you work with clients" },
        { status: 400 }
      );
    }
    checkInEnabled = checkInMode === "enabled";
  }
```

### New test

`tests/api/partner-apply-source.test.ts`:

```typescript
it("stores check_in_enabled=false when source='attorney'", async () => {
  // POST apply with source='attorney', compliance=true, etc.
  // Assert the DB insert payload has check_in_enabled: false
});

it("rejects unknown source with 400", async () => {
  // POST apply with source='made-up', assert 400
});
```

---

## Task 5 — dashboard route (OVERRIDES v1)

**Findings:** M2.

- Add `check_in_enabled, flip_at` to `src/lib/partner-auth.ts:152` SELECT list.
- Drop `src/lib/partner-helpers.ts` from Step 4 commit (no SELECT lives there).

---

## Task 5.5 — partner-by-code helper (NEW)

**Findings:** M3.

**File:** `src/lib/partner-by-code.ts`

```typescript
import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";

export const getPartnerByCode = cache(async (code: string) => {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("partners")
    .select("id, name, company, city, promo_code, status, check_in_enabled, flip_at")
    .eq("promo_code", code.toUpperCase())
    .eq("status", "approved")
    .limit(1)
    .maybeSingle();
  return data;
});
```

Callers: `/r/[code]/page.tsx`, `/court-date/[code]/page.tsx`, `/checkin/[code]/page.tsx` import from here. Delete their local `getPartnerByCode`.

---

## Task 6 — settings PATCH (OVERRIDES v1)

**Findings:** H21, M9, L18.

### Allowlist + flip_at stamp

```typescript
  const ALLOWED = new Set([
    "preferred_payment_method", "payment_zelle", "payment_venmo",
    "payment_check_address", "payment_paypal", "default_check_in_days",
    "check_in_enabled",
  ]);
  const unknown = Object.keys(body).filter(k => !ALLOWED.has(k));
  if (unknown.length) {
    return NextResponse.json({ error: `Unknown field(s): ${unknown.join(", ")}` }, { status: 400 });
  }

  const { preferred_payment_method, payment_zelle, payment_venmo, payment_check_address, payment_paypal, default_check_in_days, check_in_enabled } = body;
```

After validation, stamp flip_at on change:

```typescript
  if (check_in_enabled !== undefined) {
    updates.check_in_enabled = check_in_enabled;
    if (check_in_enabled !== partner.check_in_enabled) {
      updates.flip_at = new Date().toISOString();
    }
  }
```

---

## Task 7 — schedule 403 + audit log (OVERRIDES v1 Step 3)

**Findings:** M8, L16.

```typescript
  if (!partner.check_in_enabled) {
    console.warn("[Schedule] Referral-mode partner attempted schedule set", {
      partner_id: partner.id, client_id: id,
    });
    createAdminClient()
      .from("partner_events")
      .insert({
        partner_id: partner.id,
        event_type: "schedule_denied_referral_mode",
        metadata: { client_id: id },
      })
      .then(() => {})
      .catch((e) => console.error("[Schedule] Event insert failed:", e));
    return NextResponse.json(
      { error: "Check-in scheduling is not available in Referral mode" },
      { status: 403 },
    );
  }
```

### Positive-path test

```typescript
it("does not 403 when partner.check_in_enabled is true", async () => {
  (requirePartnerAuth as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue({
    partner: { id: "p1", promo_code: "TEST", check_in_enabled: true },
    error: null,
  });
  const res = await PATCH(makeReq(), { params: Promise.resolve({ id: "c1" }) });
  expect(res.status).not.toBe(403);
});
```

---

## Task 8 — compliance report (OVERRIDES v1)

**Findings:** M28.

```typescript
    const isReferralMode = !partner.check_in_enabled;
    const safeClients = isReferralMode
      ? clients.map((c) => ({ ...c, check_in_days: null, check_in_source: null }))
      : clients;

    return NextResponse.json({
      partner: { name: partner.name, company: partner.company, promo_code: partner.promo_code },
      checkInMode: isReferralMode ? "disabled" : "enabled",
      clients: safeClients,
      checkIns: isReferralMode ? [] : checkIns,
    });
```

---

## Task 9 — cron filter (OVERRIDES v1)

**Findings:** B1, M21.

### Pre-fetch enabled codes as PRIMARY pattern

Before the Phase 1 while loop:

```typescript
    const { data: enabledPartners } = await supabase
      .from("partners")
      .select("promo_code")
      .eq("check_in_enabled", true);
    const enabledCodes = (enabledPartners || [])
      .map((p) => p.promo_code)
      .filter(Boolean) as string[];

    if (enabledCodes.length === 0) {
      console.log("[Check-In] Phase 1: no enabled partners, skipping");
      await releaseCronLock(lock1.executionId!, "completed");
      return;
    }
```

Phase 1 reminder query:

```typescript
          const { data: reminders } = await supabase
            .from("court_reminders")
            .select("id, token, first_name, email, phone, notification_prefs, sms_consent_at, partner_promo_code")
            .eq("status", "active")
            .in("partner_promo_code", enabledCodes)
            .gt("court_date", todayDate)
            .contains("check_in_days", [todayDow])
            .or(`last_prompted_date.is.null,last_prompted_date.neq.${todayDate}`)
            .range(offset, offset + PAGE_SIZE - 1);
```

Phase 2: same pattern, drop `.not("partner_promo_code", "is", null)` (redundant with `.in`). Reuse `enabledCodes` from Phase 1 scope if both locks held, else re-fetch inside Phase 2 block.

### Test updates

```typescript
const reminderQuery = calls.find((c) => c.table === "court_reminders");
const inFilter = reminderQuery?.filters.find((f) => f.method === "in");
expect(inFilter).toBeDefined();
expect(inFilter?.args[0]).toBe("partner_promo_code");

const partnersPrefetch = calls.find((c) =>
  c.table === "partners" &&
  c.filters.some((f) => f.method === "eq" && f.args[0] === "check_in_enabled" && f.args[1] === true)
);
expect(partnersPrefetch).toBeDefined();

await new Promise(r => setTimeout(r, 0));
```

### New integration test

`tests/integration/cron-check-in-referral-mode.test.ts` against supabase-local fixture. Seed `check_in_enabled=false` partner + active reminder. Invoke cron. Assert zero sends. `test.skip(!process.env.SUPABASE_LOCAL, "...")`.

---

## Task 10 — middleware (OVERRIDES v1)

**Findings:** B12.

### Helper must forward nonce into request headers

```typescript
function setReferralCookie(req: NextRequest, pathname: string, prefix: string): NextResponse | null {
  const re = new RegExp(`^/${prefix}/([^/]+)`);
  const codeMatch = pathname.match(re);
  if (!codeMatch) return null;
  const code = codeMatch[1].toUpperCase();

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const supabaseConnectSrc = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://*.supabase.co";
  const cspHeader = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://js.stripe.com https://vercel.live`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self'",
    `connect-src 'self' https://api.stripe.com https://vercel.live ${supabaseConnectSrc} https://www.google-analytics.com https://*.google-analytics.com https://*.analytics.google.com`,
    "frame-src https://js.stripe.com https://hooks.stripe.com",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "worker-src 'self'",
    "base-uri 'self'",
    "form-action 'self' https://checkout.stripe.com",
  ].join("; ");

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", cspHeader);

  const response = NextResponse.next({ request: { headers: requestHeaders } });

  response.cookies.set("ref", code, {
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 90 * 24 * 60 * 60,
    path: "/",
  });
  const url = new URL(req.url);
  const sub = url.searchParams.get("sub");
  if (sub) {
    const cleanSub = sub.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 50);
    if (cleanSub) {
      response.cookies.set("ref_sub", cleanSub, {
        httpOnly: false,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 90 * 24 * 60 * 60,
        path: "/",
      });
    }
  }

  response.headers.set("Content-Security-Policy", cspHeader);
  return response;
}
```

### E2E CSP smoke (new spec: `e2e/checkin-csp-smoke.spec.ts`)

```typescript
import { test, expect } from "@playwright/test";

test("/checkin page loads with matching script+CSP nonce", async ({ page }) => {
  test.skip(!process.env.E2E_SEED_READY, "needs seeded partner");
  const csp: string[] = [];
  page.on("response", (r) => {
    const h = r.headers()["content-security-policy"];
    if (h && r.url().includes("/checkin/E2EBOND")) csp.push(h);
  });
  await page.goto("/checkin/E2EBOND");
  expect(csp.length).toBeGreaterThan(0);
  const nonceMatch = csp[0].match(/nonce-([A-Za-z0-9+/=]+)/);
  expect(nonceMatch).toBeTruthy();
});
```

---

## Task 11 — /checkin/[code] signup page (OVERRIDES v1)

**Findings:** H1, H2, H3, H26, L1, L2, L5, M6, M12, M15, M16.

### Full file

```tsx
import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { CourtReminderForm } from "@/components/CourtReminderForm";
import { FadeInUp } from "@/components/motion/FadeInUp";

function truncateName(name: string, max = 24): string {
  return name.length > max ? name.slice(0, max - 1) + "…" : name;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>;
}): Promise<Metadata> {
  const { code } = await params;
  const supabase = createAdminClient();
  const { data: partner } = await supabase
    .from("partners")
    .select("name, company")
    .eq("promo_code", code.toUpperCase())
    .eq("status", "approved")
    .maybeSingle();
  const referrer = truncateName(partner?.company || partner?.name || "a trusted partner");
  const title = `Set up your court check-in — ${referrer}`;
  const description = "Court check-in prompts, court date reminders, and what to expect at your hearing.";
  return {
    title: `${title} | ImNotAnAttorney`,
    description,
    openGraph: { title, description, type: "website" },
    twitter: { card: "summary", title, description },
  };
}

interface PageProps {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ charge?: string; rec?: string }>;
}

export default async function CheckInSignupPage({ params, searchParams }: PageProps) {
  if (process.env.NEXT_PUBLIC_CHECKIN_TOGGLE_ENABLED !== "true") {
    notFound();
  }

  const { code } = await params;
  const { charge, rec } = await searchParams;

  const supabase = createAdminClient();
  const { data: partner } = await supabase
    .from("partners")
    .select("name, company, promo_code, status, check_in_enabled")
    .eq("promo_code", code.toUpperCase())
    .eq("status", "approved")
    .limit(1)
    .maybeSingle();

  if (!partner) notFound();
  if (!partner.promo_code) notFound();
  if (!partner.check_in_enabled) {
    redirect(`/court-date/${code}`);
  }

  const partnerName = truncateName(partner.company || partner.name);

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col">
      <div className="flex-1 flex items-center justify-center px-4 py-16">
        <div className="max-w-lg w-full">
          <FadeInUp delay={0}>
            <p className="text-amber-400 text-xs uppercase tracking-[0.2em] text-center mb-3">
              From your bondsman
            </p>
            <h1 className="font-display text-3xl md:text-4xl font-bold text-center mb-4 leading-tight">
              Set up your court check-in.
            </h1>
            <p className="text-lg text-zinc-300 text-center mb-6">
              <span className="text-amber-400 font-semibold break-words">{partnerName}</span> set this up for you.
            </p>
            <ul className="text-zinc-300 text-base mb-4 space-y-2 list-disc pl-6">
              <li>Court-date reminders (SMS + email)</li>
              <li>Check-in prompts between now and your hearing</li>
              <li>A walkthrough of what happens in the courtroom</li>
              <li>The questions your attorney should be answering for you</li>
            </ul>
            <p className="text-zinc-400 text-sm text-center mb-8">
              15,386 judges researched. 33,000+ cases analyzed.
            </p>
          </FadeInUp>

          <FadeInUp delay={0.1}>
            <CourtReminderForm
              chargeType={charge}
              recommendedTier={rec}
              partnerPromoCode={partner.promo_code}
              compactMode
              requirePhone
              requireConsent
              submitLabel="Start My Check-Ins"
              redirectTo={(_token) => `/r/${partner.promo_code}?fromCheckin=1`}
            />
            <p className="text-amber-400 font-bold text-center mt-6">
              Because {partnerName} sent you, 10% off case analysis is built in.
            </p>
            <p className="text-zinc-400 text-sm text-center mt-1">
              Already applied at checkout. No code to remember.
            </p>
            <p className="text-zinc-400 text-xs text-center mt-2">
              First reminder lands within 10 minutes. Free until your court date.
            </p>
            <p className="text-zinc-400 text-xs text-center mt-6">
              ImNotAnAttorney provides legal information and questions, not legal advice.
            </p>
          </FadeInUp>
        </div>
      </div>
    </div>
  );
}
```

---

## Task 12 — /checkin OG (OVERRIDES v1)

**Findings:** H4, H5, H17, M30, L22.

```tsx
import { renderOgImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-template";
import { createAdminClient } from "@/lib/supabase/admin";

export const alt = "Court check-in referred by a partner — ImNotAnAttorney";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const revalidate = 300;

function truncate(s: string, max = 24): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

export default async function Image({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  if (!/^[A-Z0-9]{2,20}$/i.test(code)) {
    return renderOgImage({
      title: "Set up your court check-in.",
      subtitle: "Court check-in prompts, court date reminders,\nand what to expect at your hearing.",
      category: "Court Check-In",
    });
  }
  let partnerName = "a trusted partner";
  try {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from("partners")
      .select("company, name")
      .eq("promo_code", code.toUpperCase())
      .maybeSingle();
    if (data) partnerName = truncate(data.company || data.name);
  } catch {}
  return renderOgImage({
    title: `Set up your court check-in.\n— ${partnerName}`,
    subtitle: "Court check-in prompts, court date reminders,\nand what to expect at your hearing.",
    category: "Court Check-In",
  });
}
```

---

## Task 13 — /court-date/[code] bridge (OVERRIDES v1)

**Findings:** B13 symmetric, H6, M5, M6.

```tsx
import type { Metadata } from "next";
import { after } from "next/server";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { BridgePage } from "@/components/BridgePage";
import { getPartnerByCode } from "@/lib/partner-by-code";

function truncate(s: string, max = 24): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>;
}): Promise<Metadata> {
  const { code } = await params;
  const partner = await getPartnerByCode(code);
  if (partner) {
    const referrer = truncate(partner.company || partner.name);
    const title = `Court date reminders + hearing prep — ${referrer}`;
    const description = "Court date reminders and what to expect at your hearing.";
    return {
      title: `${title} | ImNotAnAttorney`,
      description,
      openGraph: { title, description, type: "website" },
      twitter: { card: "summary", title, description },
    };
  }
  return {
    title: "Court Prep | ImNotAnAttorney",
    description: "Court date reminders and hearing prep.",
  };
}

interface PageProps {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ sub?: string }>;
}

export default async function CourtDatePage({ params }: PageProps) {
  if (process.env.NEXT_PUBLIC_CHECKIN_TOGGLE_ENABLED !== "true") {
    notFound();
  }
  const { code } = await params;
  const partner = await getPartnerByCode(code);

  if (!partner) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center px-4">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-bold mb-4">This referral link isn&apos;t active</h1>
          <p className="text-zinc-400 mb-8">
            The link you followed may have expired or is no longer available.
          </p>
          <Link href="/" className="inline-block px-8 py-3 bg-amber-500 text-black font-bold rounded-xl hover:bg-amber-400 transition-colors">
            Visit ImNotAnAttorney
          </Link>
        </div>
      </div>
    );
  }
  if (partner.check_in_enabled) {
    redirect(`/checkin/${code}`);
  }

  const headersList = await headers();
  const rawReferer = headersList.get("referer");
  const referrerUrl = rawReferer ? rawReferer.slice(0, 500) : null;

  after(async () => {
    try {
      const supabase = createAdminClient();
      await supabase.from("partner_events").insert({
        partner_id: partner.id,
        event_type: "link_click",
        metadata: { referrer_url: referrerUrl, entry_path: "court-date" },
      });
    } catch (e) {
      console.warn("[PartnerEvents] court-date link_click insert failed:", e);
    }
  });

  return (
    <BridgePage
      partnerName={partner.name}
      company={partner.company}
      city={partner.city}
      promoCode={partner.promo_code!}
      checkInEnabled={false}
    />
  );
}
```

---

## Task 14 — /court-date OG (OVERRIDES v1)

**Findings:** H4, H5, H17, M30, L22.

```tsx
import { renderOgImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-template";
import { createAdminClient } from "@/lib/supabase/admin";

export const alt = "Court prep referred by a partner — ImNotAnAttorney";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const revalidate = 300;

function truncate(s: string, max = 24): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

export default async function Image({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  if (!/^[A-Z0-9]{2,20}$/i.test(code)) {
    return renderOgImage({
      title: "Court date reminders + hearing prep.",
      subtitle: "Court date reminders and what to expect\nat your hearing.",
      category: "Court Prep",
    });
  }
  let partnerName = "a trusted partner";
  try {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from("partners")
      .select("company, name")
      .eq("promo_code", code.toUpperCase())
      .maybeSingle();
    if (data) partnerName = truncate(data.company || data.name);
  } catch {}
  return renderOgImage({
    title: `Court date reminders +\nhearing prep — ${partnerName}`,
    subtitle: "Court date reminders and what to expect\nat your hearing.",
    category: "Court Prep",
  });
}
```

---

## Task 15 — legacy /r/[code] (OVERRIDES v1)

**Findings:** B13, H19, M7, M22.

### Page redirect check-in partners

In `src/app/r/[code]/page.tsx`, after partner fetch (before BridgePage render):

```typescript
  if (process.env.NEXT_PUBLIC_CHECKIN_TOGGLE_ENABLED === "true" && partner.check_in_enabled) {
    redirect(`/checkin/${code}`);
  }
```

Pass `checkInEnabled={partner.check_in_enabled}` to BridgePage. Use `getPartnerByCode` from Task 5.5.

### Metadata branching (H19 — preserve pre-toggle copy when flag off)

```typescript
  const toggleOn = process.env.NEXT_PUBLIC_CHECKIN_TOGGLE_ENABLED === "true";
  if (partner) {
    const referrer = truncate(partner.company || partner.name);
    const title = toggleOn
      ? (partner.check_in_enabled
          ? `Set up your court check-in — ${referrer}`
          : `Court date reminders + hearing prep — ${referrer}`)
      : `Court Prep for Your Case -- Referred by ${referrer}`;
    const description = toggleOn
      ? (partner.check_in_enabled
          ? "Court check-in prompts, court date reminders, and what to expect at your hearing."
          : "Court date reminders and what to expect at your hearing.")
      : `${partner.name} from ${partner.company || "a trusted referral partner"} trusts this service.`;
    return { title: `${title} | ImNotAnAttorney`, description, openGraph: { title, description, type: "website" }, twitter: { card: "summary", title, description } };
  }
```

### OG file (M7 — safer fallback)

```tsx
import { renderOgImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-template";
import { createAdminClient } from "@/lib/supabase/admin";

export const alt = "Referred by a Partner — ImNotAnAttorney";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const revalidate = 300;

function truncate(s: string, max = 24): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

export default async function Image({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  if (!/^[A-Z0-9]{2,20}$/i.test(code)) {
    return renderOgImage({
      title: "Referred by a partner.",
      subtitle: "Court date reminders and what to expect\nat your hearing.",
      category: "Court Prep",
    });
  }
  let partnerName = "a trusted partner";
  let checkInEnabled = false;
  try {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from("partners")
      .select("company, name, check_in_enabled")
      .eq("promo_code", code.toUpperCase())
      .maybeSingle();
    if (data) {
      partnerName = truncate(data.company || data.name);
      checkInEnabled = data.check_in_enabled === true;
    }
  } catch {}
  const toggleOn = process.env.NEXT_PUBLIC_CHECKIN_TOGGLE_ENABLED === "true";
  const useCheckIn = toggleOn && checkInEnabled;
  return renderOgImage({
    title: useCheckIn
      ? `Set up your court check-in.\n— ${partnerName}`
      : `Court date reminders +\nhearing prep — ${partnerName}`,
    subtitle: useCheckIn
      ? "Court check-in prompts, court date reminders,\nand what to expect at your hearing."
      : "Court date reminders and what to expect\nat your hearing.",
    category: useCheckIn ? "Court Check-In" : "Court Prep",
  });
}
```

---

## Task 16 — BridgePage (OVERRIDES v1)

**Findings:** H2, H3, H6, M13.

### Full new component

```tsx
"use client";
import Link from "next/link";
import { TrustBadges } from "@/components/TrustBadges";
import { FadeInUp } from "@/components/motion/FadeInUp";

interface BridgePageProps {
  partnerName: string;
  company: string | null;
  city?: string | null;
  promoCode: string;
  checkInEnabled?: boolean;
  daysUntilCourt?: number;
}

export function BridgePage({ partnerName, company, city, promoCode, checkInEnabled = true, daysUntilCourt }: BridgePageProps) {
  let displayName = partnerName;
  if (company && city) displayName = `${partnerName} from ${company}, ${city}`;
  else if (company) displayName = `${partnerName} from ${company}`;

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col">
      <div className="flex-1 flex items-center justify-center px-4 py-16">
        <div className="max-w-lg text-center">
          <FadeInUp delay={0}>
            <h1 className="font-display text-3xl md:text-4xl font-bold mb-6 leading-tight">
              <span className="text-amber-400 break-words">{displayName}</span> referred you.
              <br />
              Here&apos;s why.
            </h1>
          </FadeInUp>

          <FadeInUp delay={0.1}>
            <p className="text-lg text-zinc-300 mb-4">
              They see a lot of people go through what you&apos;re going through.
              The ones who do best are the ones who show up to their attorney
              prepared with the right questions.
            </p>
            <p className="text-lg text-zinc-300 mb-4">
              This service researches your case and gives you exactly that.
            </p>
            {!checkInEnabled && (
              <p className="text-lg text-zinc-300 mb-4">
                You&apos;ll also get court-date reminders and a walkthrough of what to expect at your hearing, starting today.
              </p>
            )}
            <p className="text-zinc-200 mb-8">
              We research your specific charges, your judge, and your attorney&apos;s
              track record, then give you the exact questions that close the
              information gap.
            </p>
          </FadeInUp>

          <FadeInUp delay={0.15}>
            <p className="text-amber-400 font-bold text-lg mb-2">
              Because {displayName} sent you, 10% off case analysis is built in.
            </p>
            <p className="text-zinc-400 text-sm mb-2">
              Already applied at checkout. No code to remember.
            </p>
            {typeof daysUntilCourt === "number" && daysUntilCourt > 0 && (
              <p className="text-zinc-400 text-xs mb-6">
                Your court date is {daysUntilCourt} day{daysUntilCourt === 1 ? "" : "s"} away. Most people who prepare early get a second meeting with their attorney.
              </p>
            )}
            <p className="text-zinc-400 text-xs mb-6">
              15,386 judges researched. 33,000+ cases analyzed.
            </p>
            <TrustBadges variant="compact" />
          </FadeInUp>

          <FadeInUp delay={0.2}>
            <div className="mt-8">
              <Link
                href={`/r/${promoCode}/quiz`}
                className="inline-block px-8 py-4 min-h-[44px] bg-amber-500 text-black font-bold rounded-xl text-lg hover:bg-amber-400 hover:scale-[1.02] hover:shadow-lg hover:shadow-amber-500/20 transition-all"
              >
                See My Case&apos;s Questions
              </Link>
            </div>
            <p className="text-zinc-500 text-sm mt-8">
              ImNotAnAttorney provides legal information and questions, not legal advice.
            </p>
          </FadeInUp>
        </div>
      </div>
    </div>
  );
}
```

### Tests

Add:

```typescript
it("renders referral-mode line when checkInEnabled=false", () => {
  render(<BridgePage partnerName="Jordan" company="Acme" city="Tampa" promoCode="ACME" checkInEnabled={false} />);
  expect(screen.getByText(/court-date reminders and a walkthrough/i)).toBeTruthy();
});

it("renders outcome-tangible CTA", () => {
  render(<BridgePage partnerName="Jordan" company={null} city={null} promoCode="ACME" />);
  expect(screen.getByText(/See My Case's Questions/i)).toBeTruthy();
  expect(screen.queryByText(/Take Back Control/i)).toBeNull();
});
```

---

## Task 17 — prep page (no change)

Same as v1.

---

## Task 18 — PartnerApplicationForm (OVERRIDES v1)

**Findings:** H8, H15, H25, H27, M27.

### Option-2 label

```tsx
<strong className="text-white block">Referral-only.</strong>
```

### Selected-state border on labels

```tsx
<label
  className={`flex items-start gap-3 cursor-pointer mb-3 mt-2 py-2 min-h-[44px] rounded-lg border p-3 transition-colors ${
    checkInMode === "enabled" ? "border-amber-500 bg-amber-500/5" : "border-zinc-700 hover:border-zinc-600"
  }`}
>
```

(Mirror for option 2 with `checkInMode === "disabled"`.)

### Fieldset accessibility

```tsx
<fieldset
  className="border border-zinc-700 rounded-xl p-4"
  aria-describedby={error ? "checkin-mode-error" : undefined}
  aria-invalid={!!error && !checkInMode}
>
  <legend className="px-2 text-sm text-zinc-300 font-medium">
    How do you work with clients after bonding? *
  </legend>
  {/* radios */}
</fieldset>
```

### Error alert binding

```tsx
{error && (
  <div id="checkin-mode-error" role="alert" className="bg-red-900/50 border border-red-700 text-red-300 px-4 py-2 rounded-lg">
    {error}
  </div>
)}
```

### 3-step post-submit (M27)

```tsx
if (submitted) {
  return (
    <div ref={successRef} tabIndex={-1} className="text-center bg-green-900/30 border border-green-700 rounded-xl p-8">
      <p className="text-green-300 text-xl font-bold mb-2">You&apos;re in!</p>
      <p className="text-zinc-300 mb-4">Three things happen next:</p>
      <ol className="text-left text-zinc-300 text-sm space-y-3 mb-6 pl-6 list-decimal">
        <li>
          <strong>Check your email in the next 5 minutes.</strong> Click the activation link. That&apos;s your partner URL going live.
        </li>
        <li>
          <strong>Your activation email has your first-week game plan</strong>, how to hand off the link, what to say at the bail desk, and three message templates ready to copy-paste.
        </li>
        <li>
          <strong>First client through your link?</strong> You&apos;ll see them in your dashboard within 10 minutes.
        </li>
      </ol>
      <p className="text-zinc-400 text-xs">
        Questions? Reply to the activation email. You&apos;re replying to a human.
      </p>
    </div>
  );
}
```

---

## Task 19 — Dashboard (OVERRIDES v1)

**Findings:** H21 (flip_at from server), B9 threading.

Dashboard API (Task 5) returns `partner.flip_at`. Dashboard page:

```tsx
  <FlipBanner
    partnerUrl={partnerUrl}
    checkInEnabled={checkInEnabled}
    flipAt={partner.flip_at}
  />
```

Thread `checkInEnabled` into Toolkit, MessageTemplates, CreativeAssets, ClientTracker.

---

## Task 19.5 — ToolkitSection demotion (NEW)

**Findings:** B9.

**File:** `src/components/partner/ToolkitSection.tsx`

Read existing component first. Primary block = Partner Link (largest, prominent Copy). Promo code moves to collapsed `<details>` secondary block:

```tsx
<section className="bg-zinc-900 rounded-xl border border-zinc-700 p-6">
  <h2 className="text-xl font-bold mb-4">Your Partner Link</h2>
  <div className="bg-zinc-800 rounded-xl p-4 border border-zinc-700 flex items-center gap-3 mb-3">
    <code className="text-amber-400 text-base flex-1 break-all">{referralUrl}</code>
    <button
      onClick={handleCopyLink}
      aria-label={copiedLink ? "Copied" : "Copy partner link"}
      aria-live="polite"
      className="text-sm px-4 py-2.5 min-h-[44px] rounded-lg bg-amber-500 text-black font-bold hover:bg-amber-400 transition-colors cursor-pointer"
    >
      {copiedLink ? "Copied!" : "Copy"}
    </button>
  </div>
  <p className="text-zinc-400 text-xs">
    Clients use this link. The 10% discount is already built in.
  </p>
  {partner.promo_code && (
    <details className="mt-4">
      <summary className="text-zinc-500 text-xs cursor-pointer">Internal reference</summary>
      <div className="mt-2 text-zinc-500 text-xs">
        Code: <span className="font-mono">{partner.promo_code}</span>. You don&apos;t need to give this to clients. The link carries it.
      </div>
    </details>
  )}
</section>
```

---

## Task 20 — WorkflowToggle (OVERRIDES v1)

**Findings:** B10, H14, H15, M14, M17, M18, M25.

### Full new component

```tsx
"use client";
import { useState } from "react";

interface Props {
  initialCheckInEnabled: boolean;
  promoCode: string;
  siteUrl: string;
  onSaved: () => void;
}

export function WorkflowToggle({ initialCheckInEnabled, promoCode, siteUrl, onSaved }: Props) {
  const [checkInEnabled, setCheckInEnabled] = useState(initialCheckInEnabled);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (checkInEnabled === initialCheckInEnabled) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/partner/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ check_in_enabled: checkInEnabled }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Save failed");
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const checkInUrl = `${siteUrl}/checkin/${promoCode}`;
  const courtDateUrl = `${siteUrl}/court-date/${promoCode}`;
  const dirty = checkInEnabled !== initialCheckInEnabled;
  const buttonLabel = saving
    ? "Saving..."
    : dirty
      ? (checkInEnabled ? "Switch to Check-In Mode" : "Switch to Referral Mode")
      : "No changes to save";

  return (
    <section className="bg-zinc-900 rounded-xl border border-zinc-700 p-6">
      <h2 className="text-xl font-bold mb-1">Client workflow</h2>

      <fieldset
        className="space-y-3 mt-4"
        aria-describedby={error ? "workflow-error" : undefined}
        aria-invalid={!!error}
      >
        <legend className="text-sm text-zinc-300 font-medium mb-2">
          How do you want your link to work?
        </legend>

        <label
          className={`flex items-start gap-3 cursor-pointer rounded-lg border p-3 min-h-[44px] transition-colors ${
            checkInEnabled ? "border-amber-500 bg-amber-500/5" : "border-zinc-700 hover:border-zinc-600"
          }`}
        >
          <input
            type="radio"
            name="workflowMode"
            checked={checkInEnabled}
            onChange={() => setCheckInEnabled(true)}
            className="mt-1 h-5 w-5 border-zinc-700 bg-zinc-800 text-amber-500 focus:ring-amber-500"
          />
          <span>
            <strong className="text-white block">Check-in mode</strong>
            <span className="text-sm text-zinc-400 block mt-1">
              <em>Best if you already track clients between bond and court.</em> Your clients get daily check-in prompts plus court date reminders. You see who&apos;s checking in, who&apos;s not, and missed-check-in alerts land in your inbox.
            </span>
          </span>
        </label>

        <label
          className={`flex items-start gap-3 cursor-pointer rounded-lg border p-3 min-h-[44px] transition-colors ${
            !checkInEnabled ? "border-amber-500 bg-amber-500/5" : "border-zinc-700 hover:border-zinc-600"
          }`}
        >
          <input
            type="radio"
            name="workflowMode"
            checked={!checkInEnabled}
            onChange={() => setCheckInEnabled(false)}
            className="mt-1 h-5 w-5 border-zinc-700 bg-zinc-800 text-amber-500 focus:ring-amber-500"
          />
          <span>
            <strong className="text-white block">Referral-only.</strong>
            <span className="text-sm text-zinc-400 block mt-1">
              <em>Best if you bond-and-forward.</em> Your surety doesn&apos;t let you run check-ins, or you&apos;ve decided not to. Your clients get court date reminders and hearing prep. You stay out of the check-in workflow entirely.
            </span>
          </span>
        </label>
      </fieldset>

      <div className="mt-4 text-xs text-zinc-400 space-y-2">
        <p>You can switch modes later. When you do, your partner link changes:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Check-in mode: your clients see <span className="text-amber-400">Court Check-In</span> previews at <span className="text-amber-400 break-all">{checkInUrl}</span></li>
          <li>Referral mode: your clients see <span className="text-amber-400">Court Prep</span> previews at <span className="text-amber-400 break-all">{courtDateUrl}</span></li>
        </ul>
        <p>
          The old link keeps working for any QR codes or flyers you already printed, but it&apos;ll show the new mode&apos;s preview. Best practice: reprint your bail-packet insert within a week.
        </p>
      </div>

      {error && (
        <p id="workflow-error" role="alert" className="text-red-400 text-sm mt-3">
          {error}
        </p>
      )}

      <button
        onClick={handleSave}
        disabled={saving || !dirty}
        className="mt-4 px-5 py-2.5 min-h-[44px] bg-amber-500 text-black font-bold rounded-lg hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors"
      >
        {buttonLabel}
      </button>
    </section>
  );
}
```

---

## Task 21 — FlipBanner (OVERRIDES v1)

**Findings:** H7, H11, H21, M19.

```tsx
"use client";
import { useEffect, useState } from "react";

interface Props {
  partnerUrl: string;
  checkInEnabled: boolean;
  flipAt: string | null;
}

export function FlipBanner({ partnerUrl, checkInEnabled, flipAt }: Props) {
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!flipAt) return;
    try {
      if (localStorage.getItem(`inaa.flipDismissed.${flipAt}`)) setDismissed(true);
    } catch {}
  }, [flipAt]);

  if (!flipAt || dismissed) return null;
  const ageDays = (Date.now() - new Date(flipAt).getTime()) / (1000 * 60 * 60 * 24);
  if (ageDays > 14) return null;

  function dismiss() {
    try { localStorage.setItem(`inaa.flipDismissed.${flipAt}`, "1"); } catch {}
    setDismissed(true);
  }

  const modeLabel = checkInEnabled ? "Check-in mode" : "Referral mode";

  return (
    <div role="status" aria-live="polite" className="bg-amber-500/10 border border-amber-500/50 rounded-xl px-5 py-4">
      <p className="text-amber-300 font-semibold text-base">
        You switched to {modeLabel}. Your link now points to the new mode.
      </p>
      <p className="text-zinc-300 text-sm mt-1">
        New link: <span className="text-amber-400 font-mono text-xs break-all">{partnerUrl}</span>
      </p>
      <p className="text-zinc-300 text-sm mt-1">
        Existing QR codes and printed inserts still work. They&apos;ll show the new mode&apos;s preview.{" "}
        <a href="/partner/card" className="underline hover:text-white">Reprint your bail-packet insert</a>{" "}
        and{" "}
        <a href="/partner/checklist" className="underline hover:text-white">your compliance checklist</a>{" "}
        with the new URL within a week.
      </p>
      <button
        onClick={dismiss}
        aria-label="Dismiss URL-change banner"
        className="text-amber-400 text-xs mt-2 underline hover:text-amber-300 cursor-pointer min-h-[44px] px-2"
      >
        Dismiss
      </button>
    </div>
  );
}
```

---

## Task 22 — MessageTemplates (OVERRIDES v1)

**Findings:** H10, H23, H27, M10, M26.

```tsx
"use client";
import { useState } from "react";
import { copyToClipboard } from "@/lib/clipboard";

interface MessageTemplatesProps {
  promoCode: string;
  referralUrl: string;
  checkInEnabled: boolean;
}

type Template = { label: string; template: (code: string, url: string) => string };

const CHECK_IN_FIRST: Template = {
  label: "Add to your check-in text",
  template: (_c, url) =>
    `Hey [name], this is [your name]. Check-in: [day/time]. Two minutes now locks in your court-date reminders + a walkthrough of what happens in the courtroom: ${url}. Because you're our client, 10% off any case analysis is built in. Do it tonight.`,
};

const REFERRAL_FIRST: Template = {
  label: "After the bail packet hand-off",
  template: (_c, url) =>
    `Hey [name], this is [your name] from [company]. Your court date reminders and hearing prep are ready at ${url}. Takes 60 seconds. Because you're our client, 10% off any case analysis is built in, no code to remember. Do it tonight.`,
};

const SHARED_TEMPLATES: Template[] = [
  {
    label: "Quick share",
    template: (_c, url) =>
      `Hey [name], it's [your name]. Before your court date sneaks up: court-date reminders + courtroom walkthrough here (free): ${url}. Takes a minute. 10% off if you ever need deeper analysis, already in the link.`,
  },
  {
    label: "For someone else",
    template: (_c, url) =>
      `A friend or family member dealing with a case? I work with a service that helps a lot of my clients. Free court-date reminders + courtroom walkthrough: ${url}. 10% off analysis if they need the deeper version, already in the link.`,
  },
];

export function MessageTemplates({ promoCode, referralUrl, checkInEnabled }: MessageTemplatesProps) {
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  async function handleCopy(text: string, idx: number) {
    const ok = await copyToClipboard(text);
    if (!ok) return;
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  }

  const templates: Template[] = [
    checkInEnabled ? CHECK_IN_FIRST : REFERRAL_FIRST,
    ...SHARED_TEMPLATES,
  ];

  return (
    <div className="space-y-3">
      {templates.map((t, i) => {
        const text = t.template(promoCode, referralUrl);
        return (
          <div key={i} className="bg-zinc-800 rounded-xl p-4 border border-zinc-700">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-amber-400">{t.label}</span>
              <button
                onClick={() => handleCopy(text, i)}
                aria-label={copiedIdx === i ? "Copied" : `Copy ${t.label} template`}
                aria-live="polite"
                className="text-sm px-4 py-2.5 min-h-[44px] rounded-lg bg-zinc-700 hover:bg-zinc-600 text-white transition-colors cursor-pointer"
              >
                {copiedIdx === i ? "Copied!" : "Copy"}
              </button>
            </div>
            <p className="text-sm text-zinc-300 leading-relaxed">{text}</p>
          </div>
        );
      })}
      <p className="text-xs text-zinc-400">
        Replace [name] and [your name]. The link carries the 10% discount, no codes.
      </p>
    </div>
  );
}
```

---

## Task 23 — CreativeAssets (OVERRIDES v1)

**Findings:** H22, H23, H25, H27, M10, M23.

### New TEMPLATES

```typescript
const SHARED_TEMPLATES: { label: string; template: (code: string, url: string) => string }[] = [
  {
    label: "X (Twitter) Post",
    template: (_c, url) =>
      `Most people walk into court blind. The judge, prosecutor, and your attorney all know each other. You're the only stranger in the room.\n\nThis service asks 10 questions about your case and gives back 25 specific questions your attorney should be able to answer.\n\n10% off baked into this link: ${url}\n\n— [your name]`,
  },
  {
    label: "Facebook Post",
    template: (_c, url) =>
      `If you or someone you know is dealing with criminal charges, this changed the game for a lot of people I work with.\n\nThey research your case, charges, judge history, everything, and give you the specific questions to bring to your attorney. Not legal advice. Better: the information that closes the gap between you and everyone else in that courtroom.\n\n(Discount built into the link. No code.)\n${url}\n\n— [your name]`,
  },
  {
    label: "General Social Post",
    template: (_c, url) =>
      `Your attorney works with the judge and prosecutor every week. You meet them once.\n\nImNotAnAttorney researches your case and gives you the questions that level the playing field.\n\nLink + 10% off: ${url}\n\n— [your name]`,
  },
  {
    label: "Intro Email",
    template: (_c, url) =>
      `Subject: Something that might help with your case\n\nHey [name],\n\nI wanted to pass along a resource that's helped a lot of people I work with. It's called ImNotAnAttorney. They research your specific charges, your judge, and your case details, then generate the exact questions you should be asking your attorney.\n\nIt's not legal advice. It's the information that helps you hold your attorney accountable and actually understand what's happening with your case.\n\nHere's the link: ${url}\n(Because you're our client, 10% off, that's $100 off case analysis, is already in the link. No code to remember.)\n\nWorth checking out while everything is still fresh.\n\n[Your name]`,
  },
  {
    label: "Follow-Up Email",
    template: (_c, url) =>
      `Subject: Still worth checking out, that case research\n\nHey [name],\n\nThree weeks in, the people I've sent to ImNotAnAttorney say the same thing: they walked into their next attorney meeting knowing what to ask, instead of nodding along.\n\nThat's the whole point. They dig into your case, your charges, and your judge, and give you the exact questions.\n\nLink: ${url}\n(The $100 off is already in the link. No code.)\n\nDo it while the details are still fresh.\n\n[Your name]`,
  },
];

const VERBAL_CHECK_IN = {
  label: "Verbal One-Liner (for check-ins)",
  template: (_c: string, url: string) =>
    `After you tell them about check-ins, say:\n\n"Your court date reminders and what to expect at your hearing are on this link. ${url.replace(/^https?:\/\//, "")}. Because you're our client, 10% off is already built in."\n\nOne sentence. That's it.`,
};

const VERBAL_REFERRAL = {
  label: "Verbal One-Liner (at the bail desk)",
  template: (_c: string, url: string) =>
    `When you hand them the bail paperwork, say:\n\n"Your court date reminders and hearing prep are on this card. Scan the QR or go to the link. Because you're our client, 10% off is built in if you want deeper case analysis."\n\nOne sentence. That's it.`,
};
```

Copy buttons retain existing `aria-label` + `aria-live` pattern. Bump to `min-h-[44px] text-sm px-4 py-2.5`.

---

## Task 24 — ClientTracker (OVERRIDES v1)

**Findings:** B11, H13, H16.

### thead with scope

```tsx
<thead>
  <tr className="text-left text-zinc-400 border-b border-zinc-700">
    <th scope="col" className="pb-2 pr-4">Name</th>
    <th scope="col" className="pb-2 pr-4">Charge</th>
    <th scope="col" className="pb-2 pr-4">Court Date</th>
    <th scope="col" className="pb-2 pr-4">Status</th>
    <th scope="col" className="pb-2 pr-4">Reminders</th>
    {checkInEnabled && <th scope="col" className="pb-2 pr-4">Check-Ins</th>}
    {checkInEnabled && <th scope="col" className="pb-2 pr-4">Schedule</th>}
  </tr>
</thead>
```

### Dot indicators — sr-only pattern

```tsx
{checkInEnabled && (
  hasSchedule ? (
    checkedInToday ? (
      <>
        <span aria-hidden="true" className="inline-block w-2.5 h-2.5 rounded-full bg-green-500" />
        <span className="sr-only">Checked in today</span>
      </>
    ) : isScheduledToday ? (
      <>
        <span aria-hidden="true" className="inline-block w-2.5 h-2.5 rounded-full bg-red-500" />
        <span className="sr-only">Missed check-in today</span>
      </>
    ) : (
      <>
        <span aria-hidden="true" className="inline-block w-2.5 h-2.5 rounded-full bg-zinc-600" />
        <span className="sr-only">Not scheduled today</span>
      </>
    )
  ) : (
    c.court_date > todayDateStr ? <span className="text-xs text-amber-400 font-medium">Schedule needed</span> : null
  )
)}
```

### Partner asterisk → Lucide Star

```tsx
import { Star } from "lucide-react";
```

```tsx
{c.check_in_source === "partner" && (
  <>
    <Star className="inline ml-1 h-3 w-3 text-amber-400" aria-hidden="true" />
    <span className="sr-only">Set by partner</span>
  </>
)}
```

### Contrast fix

Replace `text-zinc-600 text-xs` → `text-zinc-400 text-xs` in last-check-in date cell.

### Column-count invariant test

```typescript
it("column count in thead matches tbody cells in referral mode", () => {
  render(
    <ClientTracker
      clients={[sampleClient]}
      onAddClient={() => {}}
      checkInSummary={{}}
      checkInEnabled={false}
    />,
  );
  const headers = screen.getAllByRole("columnheader");
  const rows = screen.getAllByRole("row");
  const dataCells = screen.getAllByRole("cell");
  expect(dataCells.length).toBe(headers.length * (rows.length - 1));
});
```

---

## Task 25 — bail-packet card URL (OVERRIDES v1)

**Findings:** M4, L8.

Use `computePartnerUrl`. Import:

```typescript
import { computePartnerUrl } from "@/lib/partner-mode";
```

Replace manual prefix logic:

```typescript
  const toggleEnabled = process.env.NEXT_PUBLIC_CHECKIN_TOGGLE_ENABLED === "true";
  const baseUrl = "https://imnotanattorney.com";
  const fullUrl = toggleEnabled
    ? computePartnerUrl({ promo_code: partner.promo_code, check_in_enabled: partner.check_in_enabled }, baseUrl)
    : `${baseUrl}/r/${partner.promo_code}`;
  const referralUrl = fullUrl.replace(/^https?:\/\//, "");
```

Thread `checkInEnabled` into `<CardContent>` via new prop.

---

## Task 25.5 — bail-packet card content rewrite (NEW)

**Findings:** B7, H24.

### Promo-code callout replacement

Replace block at lines 267-290 of `src/app/partner/card/page.tsx`:

```tsx
<div
  className="w-full text-center"
  style={{
    background: "#1a1a1a",
    padding: "20px 32px",
    maxWidth: "5in",
    marginBottom: "32px",
    borderRadius: "12px",
  }}
>
  <p style={{ fontSize: "16px", marginBottom: "4px", color: "#ffffff" }}>
    Because <strong>{companyLine}</strong> sent you,
  </p>
  <p style={{ fontSize: "22px", color: "#fbbf24", fontWeight: 700, marginBottom: "4px" }}>
    10% off is built in.
  </p>
  <p style={{ fontSize: "13px", color: "#d4d4d8" }}>
    No code to type at checkout.
  </p>
</div>
<p style={{ fontSize: "8px", color: "#a1a1aa", textAlign: "center", marginTop: "4px" }}>
  Ref: {promoCode}
</p>
```

### Mode-branched H1 block

When `checkInEnabled`:

```tsx
<h1 style={{ fontSize: "32px", lineHeight: "1.25", marginBottom: "16px", fontFamily: "'Playfair Display', Georgia, serif", color: "#18181b", fontWeight: 700 }}>
  Your court check-in starts here.
</h1>
<p style={{ fontSize: "17px", lineHeight: "1.6", marginBottom: "32px", color: "#52525b" }}>
  Daily check-in prompts, court-date reminders, and a walkthrough of what to
  expect at your hearing. Scan the QR or visit the link below.
</p>
```

When `!checkInEnabled`:

```tsx
<h1 style={{ fontSize: "32px", lineHeight: "1.25", marginBottom: "16px", fontFamily: "'Playfair Display', Georgia, serif", color: "#18181b", fontWeight: 700 }}>
  Court date reminders. Hearing prep.
</h1>
<p style={{ fontSize: "17px", lineHeight: "1.6", marginBottom: "32px", color: "#52525b" }}>
  Court-date reminders and what to expect at your hearing. Scan the QR or
  visit the link below.
</p>
```

---

## Task 26 — compliance checklist URL (OVERRIDES v1)

**Findings:** M4, L8.

Use `computePartnerUrl`. Thread `checkInEnabled` into `<ChecklistContent>`.

---

## Task 26.5 — checklist H1 branching (NEW)

**Findings:** B8.

Rewrite "Court Reminders Box" block (lines 331-374):

```tsx
<div style={{ flex: 1 }}>
  <div style={{ fontSize: "13pt", fontWeight: 800, color: "#18181b", marginBottom: "2px" }}>
    {checkInEnabled ? "Court Check-In Set-Up" : "Court Date Prep"}
  </div>
  <p style={{ fontSize: "10pt", color: "#52525b", margin: "0 0 8px", lineHeight: 1.4 }}>
    {checkInEnabled
      ? "Daily check-ins, court date reminders, and what to expect at your hearing. Sign up in 60 seconds."
      : "Court date reminders and what to expect at your hearing. Sign up in 60 seconds."}
  </p>
  <p style={{ fontSize: "10pt", color: "#18181b", fontWeight: 700, margin: 0 }}>
    {reminderUrl}
  </p>
  {checkInEnabled && (
    <div style={{ marginTop: "8px" }}>
      <span style={{ ...LABEL, fontSize: "9pt" }}>Check-in Days</span>
      <div style={{ ...BLANK, minHeight: "36pt", lineHeight: "36pt" }} />
    </div>
  )}
</div>
```

---

## Task 27 — ComplianceReportClient (OVERRIDES v1 — NO LONGER DEFERRED)

**Findings:** H18, M28.

### Steps

1. Read `src/app/partner/compliance-report/ComplianceReportClient.tsx` fully.
2. Identify every check-in-specific element: summary cards, table columns, filter controls, section headings.
3. Accept `checkInMode: "enabled" | "disabled"` prop from page (`src/app/partner/compliance-report/page.tsx` passes from API response).
4. Gate every check-in element: `{checkInMode === "enabled" && (...)}`.
5. Branch intro copy:

```tsx
<p className="text-zinc-400 mb-6">
  {checkInMode === "enabled"
    ? "This report shows check-in compliance and court-date reminder activity across your clients."
    : "This report shows court-date reminder activity across your clients. Your account is in Referral mode. Check-in workflows are off."}
</p>
```

### Unit test

`tests/components/ComplianceReportClient.test.tsx`:

```typescript
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ComplianceReportClient } from "@/app/partner/compliance-report/ComplianceReportClient";

const sampleData = {
  partner: { name: "Test", company: "Test Co", promo_code: "TEST" },
  clients: [],
  checkIns: [],
  checkInMode: "disabled" as const,
};

describe("ComplianceReportClient referral mode", () => {
  it("renders no check-in text when checkInMode=disabled", () => {
    render(<ComplianceReportClient data={sampleData} />);
    expect(screen.queryByText(/check.?in/i)).toBeNull();
    expect(screen.queryByText(/missed/i)).toBeNull();
    expect(screen.queryByText(/schedule/i)).toBeNull();
  });
});
```

---

## Task 28-30 — E2E specs (UPDATES)

**Findings:** L12, B2 (post-signup redirect assertion), B12 (CSP smoke in Task 10).

- Task 28: assert CTA button label `Start My Check-Ins`. Assert post-submit URL matches `/r/E2EBOND/quiz` (NOT `/prep/...`).
- Task 29: assert discount line shows "Because … sent you" relational framing. Assert no promo code visible on page.
- Task 30: tighten OG regex to `/Court Prep.*Referred/i` for referral; `/Court Check-In|Set up your court check-in/i` for check-in.

---

## Task 32 — Deploy (OVERRIDES v1)

**Findings:** H20, L10, L11.

### Step 0 — seed E2E partners (NEW)

Create `e2e/seed-partners.sql`:

```sql
INSERT INTO partners (name, email, status, promo_code, commission_rate, source, check_in_enabled)
VALUES ('E2E Check-In Bondsman', 'e2e-checkin@example.com', 'approved', 'E2EBOND', 10, 'bondsman', true)
ON CONFLICT (email) DO UPDATE SET check_in_enabled = EXCLUDED.check_in_enabled, status = 'approved';

INSERT INTO partners (name, email, status, promo_code, commission_rate, source, check_in_enabled)
VALUES ('E2E Referral Bondsman', 'e2e-referral@example.com', 'approved', 'E2EREFE', 10, 'bondsman', false)
ON CONFLICT (email) DO UPDATE SET check_in_enabled = EXCLUDED.check_in_enabled, status = 'approved';
```

Run via direct Postgres (`scripts/apply-migration-*.mjs`) with `E2E_SEED_READY=1`.

### Step 6 — operator follow-up

Mark as NOTE, not checkbox. Produce `docs/handoffs/2026-04-18-bondsman-modes-cron-watch.md` at deploy time.

---

## Tasks unchanged from v1

Tasks 1, 17, 31. Execute as v1 specifies.

---

## Sign-off gates

- [ ] Migration atomic (BEGIN/COMMIT); rollback script present; `flip_at` column added
- [ ] PostgREST `.in(enabledCodes)` pattern replaces inner-join everywhere
- [ ] `CourtReminderForm` supports compactMode/requirePhone/submitLabel/redirectTo/requireConsent
- [ ] Signup page ≤5 fields, UPL disclaimer, relational discount, proof strip
- [ ] BridgePage mode-native referral body + "See My Case's Questions" CTA
- [ ] OG titles lead with service verb + partner name truncated to 24 chars
- [ ] Legacy `/r/{CODE}` redirects check-in partners to `/checkin/{CODE}`
- [ ] Bail-packet card + checklist H1 branch on mode; callout framing relational
- [ ] ToolkitSection demotes promo code to `<details>` secondary block
- [ ] WorkflowToggle has `<legend>`, selected-state border, mode-aware Save, server-side flip_at
- [ ] FlipBanner has role="status", aria-label on Dismiss, reads server flip_at
- [ ] MessageTemplates + CreativeAssets Copy buttons have aria-label + aria-live + 44×44
- [ ] ClientTracker headers have scope="col" + column-count invariant test; dots use sr-only
- [ ] ComplianceReportClient enumerated + gated; test asserts no check-in text in referral mode
- [ ] `apply` accepts only allowlisted sources; default check_in_enabled=false; bondsman opts in
- [ ] Settings PATCH rejects unknown keys; stamps flip_at on value change
- [ ] Schedule 403 logs audit event
- [ ] OG routes: revalidate=300, code-regex guard
- [ ] All `&mdash;` removed from new copy blocks
- [ ] No `text-zinc-500` on `text-xs` in new code
- [ ] E2E seeded partners + /r/ redirect test + CSP smoke
- [ ] Follow-up handoffs written for F1, F2, F3

---

## Amendments post-ship

- **Fix #7 (commit f8e5377):** Removed `?fromCheckin=1` from post-submit redirect — was causing a loop between `/partner/apply` and `/r/{code}/quiz`. Redirect target is now `/r/{code}/quiz` bare.
- **Migration application (commit 7a4b7b4):** Supabase Management API token is dead. Migrations applied via direct Postgres using `scripts/apply-migration-*.mjs` helper.
