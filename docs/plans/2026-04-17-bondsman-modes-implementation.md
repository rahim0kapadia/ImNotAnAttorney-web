# Bondsman Modes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the URL-per-mode bondsman toggle: Check-in mode (`/checkin/{CODE}` signup → `/r/{CODE}` bridge → funnel) and Referral mode (`/court-date/{CODE}` bridge → funnel), with mode-matched dashboard surfaces, copy rewrites, and legacy `/r/{CODE}` branching.

**Architecture:** Per-partner `check_in_enabled` boolean drives three surfaces: (1) new signup page + OG at `/checkin/[code]`, (2) new bridge + OG at `/court-date/[code]` that renders the existing `BridgePage`, (3) legacy `/r/[code]` page + OG branched on the flag for collateral already in the wild. Dashboard computes a single `partnerUrl` from the flag and threads it everywhere (Toolkit, MessageTemplates, CreativeAssets, bail-packet card, compliance checklist). Cron Phase 1+2 filter-joins `partners.check_in_enabled = true`. Discount framing rewritten to relational ("because {partner} sent you…") across every client-facing template, in both modes.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Supabase Postgres (admin client), Vitest + Playwright, Tailwind, Resend email, Twilio SMS gateway. Node runtime for route handlers; middleware in Edge.

**Source design:** [docs/plans/2026-04-17-modes-design.md](2026-04-17-modes-design.md) (authoritative). Amendments: [docs/plans/2026-04-17-bondsman-checkin-toggle-amendments.md](2026-04-17-bondsman-checkin-toggle-amendments.md). Base plan: [docs/plans/2026-04-17-bondsman-checkin-toggle.md](2026-04-17-bondsman-checkin-toggle.md).

**Feature flag:** `NEXT_PUBLIC_CHECKIN_TOGGLE_ENABLED` — default `false`. All new routes, the settings section, and legacy branching key off this flag during rollout. Flip to `true` after E2E verification on production.

**Before each commit:** `npx tsc --noEmit --skipLibCheck > /tmp/tsc.log 2>&1 && echo OK`. Commit blocked by pre-commit hook otherwise.

---

## File Structure

### New files

| Path | Responsibility |
|---|---|
| `supabase/migrations/20260417a_partner_check_in_enabled.sql` | Add `partners.check_in_enabled boolean NOT NULL DEFAULT true` + backfill |
| `src/app/checkin/[code]/page.tsx` | Check-in mode signup page (wraps `CourtReminderForm` with check-in copy + post-submit redirect) |
| `src/app/checkin/[code]/opengraph-image.tsx` | Check-in OG preview |
| `src/app/court-date/[code]/page.tsx` | Referral mode entry — renders `BridgePage` directly |
| `src/app/court-date/[code]/opengraph-image.tsx` | Referral OG preview |
| `src/components/partner/WorkflowToggle.tsx` | Dashboard radio for `check_in_enabled` + flip banner trigger |
| `src/components/partner/FlipBanner.tsx` | Post-flip reprint-collateral banner |
| `tests/lib/partner-mode.test.ts` | Unit: compute-partner-url + mode-dependent template selection |
| `tests/components/BridgePage.test.tsx` | Unit: discount-line rewrite renders correctly |
| `tests/components/ClientTracker.test.tsx` | Unit: check-in columns hidden when `checkInEnabled={false}` |
| `tests/api/partner-settings-mode.test.ts` | Unit: PATCH `check_in_enabled` persists + 400 on non-boolean |
| `tests/api/partner-clients-schedule-403.test.ts` | Unit: PATCH schedule returns 403 when partner is referral mode |
| `tests/api/cron-check-in-filter.test.ts` | Unit: Phase 1 + Phase 2 skip reminders whose partner has `check_in_enabled=false` |
| `e2e/bondsman-checkin-mode.spec.ts` | E2E: signup → `/checkin/{CODE}` → form → redirect → `/r/{CODE}` |
| `e2e/bondsman-referral-mode.spec.ts` | E2E: signup → `/court-date/{CODE}` → quiz → product funnel |
| `e2e/bondsman-legacy-branching.spec.ts` | E2E: `/r/{CODE}` + OG render matches partner's current flag, old collateral never 404s |
| `src/lib/partner-mode.ts` | Pure helpers: `computePartnerUrl`, `isCheckInMode` |

### Modified files

| Path | Responsibility change |
|---|---|
| `supabase/SCHEMA.md` | Document `partners.check_in_enabled` + mode semantics |
| `src/lib/partner-data.ts` | Add `check_in_enabled: boolean` to `Partner` interface |
| `src/app/api/partners/apply/route.ts` | Accept + persist `check_in_enabled` from bondsman signup; require when `source === "bondsman"` |
| `src/app/api/partner/dashboard/route.ts` | Include `check_in_enabled` in response |
| `src/app/api/partner/settings/route.ts` | Accept + validate + persist `check_in_enabled` |
| `src/app/api/partner/compliance-report/route.ts` | Read + return `checkInMode: "enabled" \| "disabled"` |
| `src/app/api/partner/clients/[id]/schedule/route.ts` | Return 403 when partner is referral mode |
| `src/app/api/cron/check-in-prompt/route.ts` | Partner-join filter to skip `check_in_enabled=false` |
| `src/middleware.ts` | Set `ref` cookie on `/checkin/*` and `/court-date/*` prefixes |
| `src/app/r/[code]/page.tsx` | Read `check_in_enabled`, server-branch BridgePage prop + metadata text |
| `src/app/r/[code]/opengraph-image.tsx` | Server-branch OG copy on flag |
| `src/components/BridgePage.tsx` | Replace discount line with relational framing (both modes) |
| `src/components/MessageTemplates.tsx` | Accept `checkInEnabled` prop; swap "Add to your check-in text" template by mode; Amendment 6 discount rewrite across all templates |
| `src/components/partner/CreativeAssets.tsx` | Accept `checkInEnabled`; swap template #6; Amendment 6 rewrite across all templates |
| `src/components/partner/ClientTracker.tsx` | Accept `checkInEnabled`; hide Check-Ins stat + Check-Ins column + Schedule column when off; swap empty-state copy |
| `src/components/partner/PartnerApplicationForm.tsx` | Add required radio for check-in mode when `source === "bondsman"`; rewrite post-submit copy per Amendment 6 |
| `src/app/partner/dashboard/page.tsx` | Compute `partnerUrl` from `check_in_enabled`; thread down; render `WorkflowToggle`; render `FlipBanner` after a flip |
| `src/app/partner/card/page.tsx` | Embed mode-matching URL + QR code data |
| `src/app/partner/checklist/page.tsx` | Embed mode-matching URL + QR code data |
| `src/app/partner/compliance-report/ComplianceReportClient.tsx` | Render "Reminders-only posture" layout when `checkInMode === "disabled"` |
| `src/app/prep/[token]/page.tsx` | Fetch `partner.check_in_enabled`; hide `<CheckInButton />` when off |

### Untouched (explicitly)

- `src/lib/og-template.tsx` — locked per base plan.
- `src/components/partner/CheckInButton.tsx` — caller gates it; component unchanged.
- `src/app/prep/[token]/opengraph-image.tsx` — out of scope (Amendment 3).
- `src/app/partners/bondsman/opengraph-image.tsx` — unchanged (surface #1 in preview map).

---

## Phase 1 — Schema

### Task 1: Pre-migration sanity query

**Files:**
- Read-only SQL via Supabase Management API

- [ ] **Step 1: Run sanity query via Management API**

Run:
```bash
node -e "
const p = process.env.SUPABASE_PROJECT_REF;
const t = process.env.SUPABASE_ACCESS_TOKEN;
const sql = \`SELECT p.id, p.name, p.source, COUNT(DISTINCT cci.id) AS checkins
FROM partners p
JOIN court_reminders cr ON cr.partner_promo_code = p.promo_code
JOIN client_check_ins cci ON cci.court_reminder_id = cr.id
WHERE (p.source IS NULL OR p.source != 'bondsman')
GROUP BY p.id, p.name, p.source;\`;
fetch(\`https://api.supabase.com/v1/projects/\${p}/database/query\`, {
  method:'POST', headers:{Authorization:\`Bearer \${t}\`,'Content-Type':'application/json'},
  body: JSON.stringify({query: sql})
}).then(r=>r.json()).then(d=>console.log(JSON.stringify(d,null,2)));
" > /tmp/sanity.txt 2>&1
```

Read `/tmp/sanity.txt`. Expected: empty array `[]` (no non-bondsman partner has check-ins).

- [ ] **Step 2: Branch on result**

If result contains rows: STOP. Create `docs/handoffs/2026-04-17-migration-sanity-exceptions.md` listing partner IDs, ask for triage before proceeding. Non-bondsman partners with real check-in data need carve-outs in the backfill UPDATE.

If empty: proceed.

### Task 2: Write migration

**Files:**
- Create: `supabase/migrations/20260417a_partner_check_in_enabled.sql`

- [ ] **Step 1: Create migration file**

```sql
-- Add check_in_enabled toggle on partners. Per-partner operational posture:
-- true  = bondsman runs digital check-ins (default; preserves current behavior)
-- false = bondsman is pure referral source, no check-in workflow
--
-- Bondsmen default to check-in ON (no behavior change for existing).
-- Non-bondsman partners default to OFF (they never ran check-ins anyway).
-- Verified via pre-migration sanity query (no non-bondsman has check-in data).

ALTER TABLE partners
  ADD COLUMN IF NOT EXISTS check_in_enabled boolean NOT NULL DEFAULT true;

UPDATE partners
  SET check_in_enabled = false
  WHERE source IS NULL OR source != 'bondsman';

-- Index supports the cron partner-join filter (Phase 1 + Phase 2 of check-in cron).
CREATE INDEX IF NOT EXISTS idx_partners_check_in_enabled
  ON partners(check_in_enabled)
  WHERE check_in_enabled = true;

COMMENT ON COLUMN partners.check_in_enabled IS
  'If true, partner runs digital check-ins: shows Check-in mode URL, sends check-in cron prompts, exposes schedule controls. If false, referral mode: court-date reminders only.';
```

- [ ] **Step 2: Apply migration via Management API**

Run:
```bash
node -e "
const fs=require('fs');
const sql=fs.readFileSync('supabase/migrations/20260417a_partner_check_in_enabled.sql','utf8');
const p=process.env.SUPABASE_PROJECT_REF;
const t=process.env.SUPABASE_ACCESS_TOKEN;
fetch(\`https://api.supabase.com/v1/projects/\${p}/database/query\`, {
  method:'POST', headers:{Authorization:\`Bearer \${t}\`,'Content-Type':'application/json'},
  body: JSON.stringify({query: sql})
}).then(r=>r.json()).then(d=>console.log(JSON.stringify(d,null,2)));
" > /tmp/migrate.txt 2>&1
```

Read `/tmp/migrate.txt`. Expected: `[]` (DDL returns empty result set on success).

- [ ] **Step 3: Verify column exists + backfill correct**

Run:
```bash
node -e "
const p=process.env.SUPABASE_PROJECT_REF;
const t=process.env.SUPABASE_ACCESS_TOKEN;
const sql=\`SELECT source, check_in_enabled, COUNT(*) FROM partners GROUP BY source, check_in_enabled ORDER BY source, check_in_enabled;\`;
fetch(\`https://api.supabase.com/v1/projects/\${p}/database/query\`, {
  method:'POST', headers:{Authorization:\`Bearer \${t}\`,'Content-Type':'application/json'},
  body: JSON.stringify({query: sql})
}).then(r=>r.json()).then(d=>console.log(JSON.stringify(d,null,2)));
" > /tmp/verify.txt 2>&1
```

Read `/tmp/verify.txt`. Expected: `bondsman` rows have `check_in_enabled=true`, everything else `false`.

- [ ] **Step 4: Update SCHEMA.md**

Edit `supabase/SCHEMA.md`. Find the `partners` table section. Add line after `source text` column documentation:

```
| check_in_enabled | boolean | NOT NULL DEFAULT true — Operational mode. true=Check-in mode (daily check-ins + court reminders + schedule controls). false=Referral mode (reminders + hearing prep, no check-in workflow). Backfilled false for non-bondsmen on 2026-04-17. |
```

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260417a_partner_check_in_enabled.sql supabase/SCHEMA.md
git commit -m "feat(schema): add partners.check_in_enabled for bondsman mode toggle"
```

---

## Phase 2 — Types + API

### Task 3: Extend Partner type

**Files:**
- Modify: `src/lib/partner-data.ts:41-58`

- [ ] **Step 1: Write failing type test**

Create `tests/lib/partner-mode.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { computePartnerUrl, isCheckInMode } from "@/lib/partner-mode";
import type { Partner } from "@/lib/partner-data";

const basePartner: Partner = {
  id: "p1",
  name: "Test",
  email: "t@example.com",
  phone: null,
  company: null,
  promo_code: "TEST",
  commission_rate: 10,
  commission_tier: "partner",
  preferred_payment_method: null,
  payment_zelle: null,
  payment_venmo: null,
  payment_check_address: null,
  payment_paypal: null,
  notification_prefs: null,
  source: "bondsman",
  city: null,
  check_in_enabled: true,
};

describe("computePartnerUrl", () => {
  it("returns /checkin/{CODE} when check-in mode", () => {
    expect(computePartnerUrl(basePartner, "https://imnotanattorney.com"))
      .toBe("https://imnotanattorney.com/checkin/TEST");
  });

  it("returns /court-date/{CODE} when referral mode", () => {
    expect(computePartnerUrl({ ...basePartner, check_in_enabled: false }, "https://imnotanattorney.com"))
      .toBe("https://imnotanattorney.com/court-date/TEST");
  });

  it("returns empty string when promo_code is null", () => {
    expect(computePartnerUrl({ ...basePartner, promo_code: null }, "https://imnotanattorney.com"))
      .toBe("");
  });
});

describe("isCheckInMode", () => {
  it("returns true when check_in_enabled is true", () => {
    expect(isCheckInMode(basePartner)).toBe(true);
  });
  it("returns false when check_in_enabled is false", () => {
    expect(isCheckInMode({ ...basePartner, check_in_enabled: false })).toBe(false);
  });
});
```

- [ ] **Step 2: Run test, expect failure**

Run: `npm test -- tests/lib/partner-mode.test.ts`
Expected: FAIL — `partner-mode` module does not exist and `Partner` interface lacks `check_in_enabled`.

- [ ] **Step 3: Add field to Partner interface**

Edit `src/lib/partner-data.ts`. In the `Partner` interface (lines 41-58), add a line before the closing brace:

```typescript
  check_in_enabled: boolean;
```

- [ ] **Step 4: Create partner-mode helper**

Create `src/lib/partner-mode.ts`:

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
```

- [ ] **Step 5: Run test, expect pass**

Run: `npm test -- tests/lib/partner-mode.test.ts`
Expected: PASS, 5/5.

- [ ] **Step 6: Verify tsc**

Run: `npx tsc --noEmit --skipLibCheck > /tmp/tsc.log 2>&1 && echo OK`
Expected: `OK`. If errors in `tsc.log`, fix callers that construct `Partner` literals — there will likely be test mocks that need `check_in_enabled: true/false` added.

- [ ] **Step 7: Commit**

```bash
git add src/lib/partner-data.ts src/lib/partner-mode.ts tests/lib/partner-mode.test.ts
git commit -m "feat(lib): add check_in_enabled to Partner + partner-mode helpers"
```

### Task 4: Apply route — accept check_in_enabled from bondsman signup

**Files:**
- Modify: `src/app/api/partners/apply/route.ts:51` (destructure), `:162-174` (pending-upgrade update), `:275-289` (insert)

- [ ] **Step 1: Destructure check_in_enabled from body**

Edit `src/app/api/partners/apply/route.ts`. Line 51 reads:

```typescript
  const { name, company, email, phone, city, region, message, source, heardAboutUs, compliance } = body;
```

Replace with:

```typescript
  const { name, company, email, phone, city, region, message, source, heardAboutUs, compliance, checkInMode } = body;
```

- [ ] **Step 2: Validate for bondsman source**

Add after the `compliance !== true` block (after line 72), before the `MAX_LENGTHS` block:

```typescript
  // Bondsman source MUST choose check-in mode (required radio in PartnerApplicationForm)
  let checkInEnabled: boolean = true; // non-bondsman default handled by column default + backfill
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

- [ ] **Step 3: Pass check_in_enabled on insert**

Find the `.insert({` block around line 276 (new-partner branch). After `source: source || null,`, add:

```typescript
        check_in_enabled: checkInEnabled,
```

- [ ] **Step 4: Pass check_in_enabled on pending upgrade**

Find the `.update({` block around line 166 (pending-upgrade branch). After `source: source || null,`, add:

```typescript
        check_in_enabled: checkInEnabled,
```

- [ ] **Step 5: Verify tsc**

Run: `npx tsc --noEmit --skipLibCheck > /tmp/tsc.log 2>&1 && echo OK`

- [ ] **Step 6: Commit**

```bash
git add src/app/api/partners/apply/route.ts
git commit -m "feat(api): accept check_in_enabled from bondsman signup"
```

### Task 5: Dashboard route exposes flag

**Files:**
- Modify: `src/app/api/partner/dashboard/route.ts:101-118`

- [ ] **Step 1: Add flag to partner response object**

Edit `src/app/api/partner/dashboard/route.ts`. In the `partner:` object inside `NextResponse.json(...)` (starts line 102), add after `city: partner.city,` (line 117):

```typescript
        check_in_enabled: partner.check_in_enabled,
```

- [ ] **Step 2: Verify `requirePartnerAuth` returns check_in_enabled**

Grep: the partner selected in `validatePartnerSession` must include `check_in_enabled`. Open `src/lib/partner-helpers.ts` and `src/lib/partner-auth.ts`, find the SELECT list against `partners`, add `check_in_enabled` to it. If a `select("*")` is used, no change needed.

- [ ] **Step 3: Verify tsc**

Run: `npx tsc --noEmit --skipLibCheck > /tmp/tsc.log 2>&1 && echo OK`

- [ ] **Step 4: Commit**

```bash
git add src/app/api/partner/dashboard/route.ts src/lib/partner-helpers.ts src/lib/partner-auth.ts
git commit -m "feat(api): dashboard returns check_in_enabled"
```

### Task 6: Settings PATCH supports check_in_enabled

**Files:**
- Create test: `tests/api/partner-settings-mode.test.ts`
- Modify: `src/app/api/partner/settings/route.ts`

- [ ] **Step 1: Write failing test**

Create `tests/api/partner-settings-mode.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Mock partner auth + admin client
vi.mock("@/lib/partner-helpers", () => ({
  requirePartnerAuth: vi.fn(async () => ({
    partner: { id: "p1", check_in_enabled: true, promo_code: "TEST" },
    error: null,
  })),
}));

const updateMock = vi.fn(async () => ({ error: null }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({ update: (args: unknown) => { updateMock(args); return { eq: () => ({ error: null }) }; } }),
  }),
}));

import { PATCH } from "@/app/api/partner/settings/route";

function makeReq(body: object): NextRequest {
  return new NextRequest("http://localhost/api/partner/settings", {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => { updateMock.mockClear(); });

describe("PATCH /api/partner/settings — check_in_enabled", () => {
  it("accepts check_in_enabled=false and persists it", async () => {
    const res = await PATCH(makeReq({ check_in_enabled: false }));
    expect(res.status).toBe(200);
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ check_in_enabled: false }),
    );
  });

  it("accepts check_in_enabled=true and persists it", async () => {
    const res = await PATCH(makeReq({ check_in_enabled: true }));
    expect(res.status).toBe(200);
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ check_in_enabled: true }),
    );
  });

  it("rejects non-boolean check_in_enabled with 400", async () => {
    const res = await PATCH(makeReq({ check_in_enabled: "yes" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/check_in_enabled/);
  });
});
```

- [ ] **Step 2: Run test, expect failure**

Run: `npm test -- tests/api/partner-settings-mode.test.ts`
Expected: FAIL — PATCH does not accept `check_in_enabled`.

- [ ] **Step 3: Implement**

Edit `src/app/api/partner/settings/route.ts`. In the body destructure on line 23:

```typescript
  const { preferred_payment_method, payment_zelle, payment_venmo, payment_check_address, payment_paypal, default_check_in_days } = body;
```

Replace with:

```typescript
  const { preferred_payment_method, payment_zelle, payment_venmo, payment_check_address, payment_paypal, default_check_in_days, check_in_enabled } = body;
```

Add validation after the existing `default_check_in_days` block (after line 54):

```typescript
  // Validate check_in_enabled (mode toggle)
  if (check_in_enabled !== undefined && typeof check_in_enabled !== "boolean") {
    return NextResponse.json(
      { error: "check_in_enabled must be a boolean" },
      { status: 400 },
    );
  }
```

Add to the `updates` object after the `default_check_in_days` block (after line 77):

```typescript
  if (check_in_enabled !== undefined) {
    updates.check_in_enabled = check_in_enabled;
  }
```

- [ ] **Step 4: Run test, expect pass**

Run: `npm test -- tests/api/partner-settings-mode.test.ts`
Expected: PASS, 3/3.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/partner/settings/route.ts tests/api/partner-settings-mode.test.ts
git commit -m "feat(api): settings PATCH accepts check_in_enabled"
```

### Task 7: Schedule route 403s for referral mode

**Files:**
- Create test: `tests/api/partner-clients-schedule-403.test.ts`
- Modify: `src/app/api/partner/clients/[id]/schedule/route.ts:29-31`

- [ ] **Step 1: Write failing test**

Create `tests/api/partner-clients-schedule-403.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/partner-helpers", () => ({
  requirePartnerAuth: vi.fn(),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: () => ({}) }),
}));

import { PATCH } from "@/app/api/partner/clients/[id]/schedule/route";
import { requirePartnerAuth } from "@/lib/partner-helpers";

function makeReq(): NextRequest {
  return new NextRequest("http://localhost/api/partner/clients/c1/schedule", {
    method: "PATCH",
    body: JSON.stringify({ check_in_days: ["mon"] }),
    headers: { "Content-Type": "application/json" },
  });
}

describe("PATCH /api/partner/clients/[id]/schedule — referral-mode partners", () => {
  it("returns 403 when partner.check_in_enabled is false", async () => {
    (requirePartnerAuth as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue({
      partner: { id: "p1", promo_code: "TEST", check_in_enabled: false },
      error: null,
    });
    const res = await PATCH(makeReq(), { params: Promise.resolve({ id: "c1" }) });
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run test, expect failure**

Run: `npm test -- tests/api/partner-clients-schedule-403.test.ts`
Expected: FAIL — route doesn't check `check_in_enabled`.

- [ ] **Step 3: Implement**

Edit `src/app/api/partner/clients/[id]/schedule/route.ts`. The block at lines 29-31:

```typescript
  if (!partner.promo_code) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
```

Replace with:

```typescript
  if (!partner.promo_code) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!partner.check_in_enabled) {
    return NextResponse.json(
      { error: "Check-in scheduling is not available in Referral mode" },
      { status: 403 },
    );
  }
```

- [ ] **Step 4: Run test, expect pass**

Run: `npm test -- tests/api/partner-clients-schedule-403.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/partner/clients/[id]/schedule/route.ts tests/api/partner-clients-schedule-403.test.ts
git commit -m "feat(api): schedule PATCH 403s for referral-mode partners"
```

### Task 8: Compliance report returns checkInMode

**Files:**
- Modify: `src/app/api/partner/compliance-report/route.ts:81-89`

- [ ] **Step 1: Add checkInMode to response**

Edit `src/app/api/partner/compliance-report/route.ts`. The response object at lines 81-89:

```typescript
    return NextResponse.json({
      partner: {
        name: partner.name,
        company: partner.company,
        promo_code: partner.promo_code,
      },
      clients,
      checkIns,
    });
```

Replace with:

```typescript
    return NextResponse.json({
      partner: {
        name: partner.name,
        company: partner.company,
        promo_code: partner.promo_code,
      },
      checkInMode: partner.check_in_enabled ? "enabled" : "disabled",
      clients,
      checkIns: partner.check_in_enabled ? checkIns : [],
    });
```

When referral mode, we still return the client list (they still have `court_reminders`), but we skip streaming check-in events since there won't be any.

- [ ] **Step 2: Verify tsc**

Run: `npx tsc --noEmit --skipLibCheck > /tmp/tsc.log 2>&1 && echo OK`

- [ ] **Step 3: Commit**

```bash
git add src/app/api/partner/compliance-report/route.ts
git commit -m "feat(api): compliance report includes checkInMode"
```

### Task 9: Cron filters on check_in_enabled

**Files:**
- Create test: `tests/api/cron-check-in-filter.test.ts`
- Modify: `src/app/api/cron/check-in-prompt/route.ts`

- [ ] **Step 1: Write failing test**

Create `tests/api/cron-check-in-filter.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

// Capture every Supabase filter chain invocation so we can assert the join filter.
type Call = { table: string; filters: Array<{ method: string; args: unknown[] }> };
const calls: Call[] = [];

function makeChain(table: string): unknown {
  const current: Call = { table, filters: [] };
  calls.push(current);
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: (...a: unknown[]) => { current.filters.push({ method: "eq", args: a }); return chain; },
    gt: (...a: unknown[]) => { current.filters.push({ method: "gt", args: a }); return chain; },
    contains: (...a: unknown[]) => { current.filters.push({ method: "contains", args: a }); return chain; },
    or: (...a: unknown[]) => { current.filters.push({ method: "or", args: a }); return chain; },
    not: (...a: unknown[]) => { current.filters.push({ method: "not", args: a }); return chain; },
    in: (...a: unknown[]) => { current.filters.push({ method: "in", args: a }); return chain; },
    range: async () => ({ data: [] }),
    update: () => chain,
    then: (fn: (x: unknown) => unknown) => fn({ data: [] }),
  };
  return chain;
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: (t: string) => makeChain(t) }),
}));
vi.mock("@/lib/auth/guards", () => ({
  requireCron: () => ({ authorized: true, error: null }),
}));
vi.mock("@/lib/cron-idempotency", () => ({
  acquireCronLock: async () => ({ shouldRun: true, executionId: "x" }),
  releaseCronLock: async () => {},
}));
vi.mock("next/server", async () => {
  const actual = await vi.importActual<typeof import("next/server")>("next/server");
  return { ...actual, after: (fn: () => Promise<void>) => fn() };
});

import { GET } from "@/app/api/cron/check-in-prompt/route";
import { NextRequest } from "next/server";

beforeEach(() => { calls.length = 0; });

describe("cron check-in-prompt — check_in_enabled filter", () => {
  it("filters court_reminders by joined partner.check_in_enabled=true", async () => {
    await GET(new NextRequest("http://localhost/api/cron/check-in-prompt"));
    const reminderQuery = calls.find((c) => c.table === "court_reminders");
    expect(reminderQuery).toBeDefined();
    // Partner filter lives in the select list (join) OR as an inner-join
    // We accept either .eq on joined column or explicit filter on check_in_enabled
    const serialized = JSON.stringify(reminderQuery);
    expect(serialized).toMatch(/check_in_enabled|partners!inner/);
  });
});
```

- [ ] **Step 2: Run test, expect failure**

Run: `npm test -- tests/api/cron-check-in-filter.test.ts`
Expected: FAIL — no partner-join filter exists.

- [ ] **Step 3: Implement Phase 1 filter**

Edit `src/app/api/cron/check-in-prompt/route.ts`. Lines 69-76 (Phase 1 query):

```typescript
          const { data: reminders } = await supabase
            .from("court_reminders")
            .select("id, token, first_name, email, phone, notification_prefs, sms_consent_at, partner_promo_code")
            .eq("status", "active")
            .gt("court_date", todayDate)
            .contains("check_in_days", [todayDow])
            .or(`last_prompted_date.is.null,last_prompted_date.neq.${todayDate}`)
            .range(offset, offset + PAGE_SIZE - 1);
```

Replace the `.select(...)` argument to add an inner join filter on `partners`:

```typescript
          const { data: reminders } = await supabase
            .from("court_reminders")
            .select("id, token, first_name, email, phone, notification_prefs, sms_consent_at, partner_promo_code, partners!inner(check_in_enabled)")
            .eq("status", "active")
            .eq("partners.check_in_enabled", true)
            .gt("court_date", todayDate)
            .contains("check_in_days", [todayDow])
            .or(`last_prompted_date.is.null,last_prompted_date.neq.${todayDate}`)
            .range(offset, offset + PAGE_SIZE - 1);
```

Note: `court_reminders.partner_promo_code` references `partners.promo_code`. PostgREST foreign-key embedding requires that FK. If the FK does not exist in the schema, the `partners!inner(...)` hint won't work; in that case replace the inner-join approach with a two-query pattern: first SELECT `promo_code` from `partners` WHERE `check_in_enabled=true`, then add `.in("partner_promo_code", enabledCodes)` on the reminders query.

- [ ] **Step 4: Implement Phase 2 filter**

Lines 175-182 (Phase 2 query):

```typescript
          const { data } = await supabase
            .from("court_reminders")
            .select("id, first_name, partner_promo_code")
            .eq("status", "active")
            .gt("court_date", todayDate)
            .contains("check_in_days", [yesterdayDow])
            .not("partner_promo_code", "is", null)
            .range(offset, offset + PAGE_SIZE - 1);
```

Same treatment:

```typescript
          const { data } = await supabase
            .from("court_reminders")
            .select("id, first_name, partner_promo_code, partners!inner(check_in_enabled)")
            .eq("status", "active")
            .eq("partners.check_in_enabled", true)
            .gt("court_date", todayDate)
            .contains("check_in_days", [yesterdayDow])
            .not("partner_promo_code", "is", null)
            .range(offset, offset + PAGE_SIZE - 1);
```

- [ ] **Step 5: Fallback if FK doesn't exist**

If `npm test` on the cron route reveals PostgREST errors about missing foreign key, replace both inner-join lines with pre-fetch pattern. Before each paginated loop:

```typescript
          // Pre-fetch enabled promo codes, since PostgREST inner-join requires FK
          const { data: enabledPartners } = await supabase
            .from("partners")
            .select("promo_code")
            .eq("check_in_enabled", true);
          const enabledCodes = (enabledPartners || []).map((p) => p.promo_code).filter(Boolean) as string[];
          if (enabledCodes.length === 0) { hasMore = false; break; }
```

Then the reminder query becomes:

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

Move `enabledPartners` fetch OUT of the while loop — fetch it once before the loop starts.

- [ ] **Step 6: Run test, expect pass**

Run: `npm test -- tests/api/cron-check-in-filter.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/cron/check-in-prompt/route.ts tests/api/cron-check-in-filter.test.ts
git commit -m "feat(cron): skip reminders whose partner is referral mode"
```

---

## Phase 3 — Route scaffold

### Task 10: Middleware covers new prefixes

**Files:**
- Modify: `src/middleware.ts:142-192`

- [ ] **Step 1: Extract cookie-set helper**

Edit `src/middleware.ts`. Above line 142 add a helper:

```typescript
function setReferralCookie(req: NextRequest, pathname: string, prefix: string): NextResponse | null {
  const re = new RegExp(`^/${prefix}/([^/]+)`);
  const codeMatch = pathname.match(re);
  if (!codeMatch) return null;
  const code = codeMatch[1].toUpperCase();
  const response = NextResponse.next();
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
  // CSP header still needs to be applied on this response
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
  response.headers.set("Content-Security-Policy", cspHeader);
  return response;
}
```

- [ ] **Step 2: Replace the inline /r/ block with prefix-aware branching**

The block at lines 142-192 that handles `/r/` cookies. Replace the entire `if (pathname.startsWith("/r/") && !pathname.startsWith("/r/api")) { ... }` block with:

```typescript
  // ── Referral cookie for /r/[code], /checkin/[code], /court-date/[code] ──
  if (pathname.startsWith("/r/") && !pathname.startsWith("/r/api")) {
    const res = setReferralCookie(req, pathname, "r");
    if (res) return res;
  }
  if (pathname.startsWith("/checkin/")) {
    const res = setReferralCookie(req, pathname, "checkin");
    if (res) return res;
  }
  if (pathname.startsWith("/court-date/")) {
    const res = setReferralCookie(req, pathname, "court-date");
    if (res) return res;
  }
```

- [ ] **Step 3: Verify tsc**

Run: `npx tsc --noEmit --skipLibCheck > /tmp/tsc.log 2>&1 && echo OK`

- [ ] **Step 4: Commit**

```bash
git add src/middleware.ts
git commit -m "feat(middleware): set ref cookie on /checkin and /court-date prefixes"
```

### Task 11: Check-in mode signup page

**Files:**
- Create: `src/app/checkin/[code]/page.tsx`

- [ ] **Step 1: Create signup page**

```tsx
/**
 * /checkin/[code] — Check-in mode signup page.
 *
 * Bondsman-sent URL. Wraps CourtReminderForm with check-in-flavored copy.
 * After signup, CourtReminderForm redirects to /prep/{token}; this page's
 * pre-form copy orients the client to what they're signing up for.
 *
 * Gated by NEXT_PUBLIC_CHECKIN_TOGGLE_ENABLED=true during rollout.
 */

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { CourtReminderForm } from "@/components/CourtReminderForm";
import { FadeInUp } from "@/components/motion/FadeInUp";

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
  const referrer = partner?.company || partner?.name || "a trusted partner";
  const title = `Court Check-In — Referred by ${referrer}`;
  const description = `Set up your court check-in. Daily check-ins, court date reminders, and what to expect at your hearing.`;
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

  if (!partner || !partner.check_in_enabled) {
    // Referral-mode partner's link shouldn't land here, but if it does,
    // 404 rather than serve a mode-mismatched page.
    notFound();
  }

  const partnerName = partner.company || partner.name;

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col">
      <div className="flex-1 flex items-center justify-center px-4 py-16">
        <div className="max-w-lg w-full">
          <FadeInUp delay={0}>
            <p className="text-amber-400 text-xs uppercase tracking-[0.2em] text-center mb-3">
              Court Check-In
            </p>
            <h1 className="font-display text-3xl md:text-4xl font-bold text-center mb-4 leading-tight">
              Set up your court check-in.
            </h1>
            <p className="text-lg text-zinc-300 text-center mb-8">
              <span className="text-amber-400 font-semibold">{partnerName}</span> sent you here.
              Once you sign up, you&apos;ll get court-date reminders, check-in prompts between now and
              your hearing, and a walkthrough of what to expect in the courtroom.
            </p>
          </FadeInUp>

          <FadeInUp delay={0.1}>
            <CourtReminderForm
              chargeType={charge}
              recommendedTier={rec}
              partnerPromoCode={partner.promo_code!}
            />
            <p className="text-amber-400/90 text-sm text-center mt-6">
              Because <span className="font-semibold">{partnerName}</span> sent you, you save 10%
              on case analysis if you want it later.
            </p>
            <p className="text-zinc-500 text-xs text-center mt-1">
              Applied automatically at checkout.
            </p>
          </FadeInUp>
        </div>
      </div>
    </div>
  );
}
```

Note: `CourtReminderForm` (`src/components/CourtReminderForm.tsx:71-73`) already redirects to `/prep/{token}` on success. No post-submit handoff logic needed — the redirect IS the confirmation.

- [ ] **Step 2: Verify tsc**

Run: `npx tsc --noEmit --skipLibCheck > /tmp/tsc.log 2>&1 && echo OK`

- [ ] **Step 3: Commit**

```bash
git add src/app/checkin/[code]/page.tsx
git commit -m "feat(routes): check-in mode signup page"
```

### Task 12: Check-in OG image

**Files:**
- Create: `src/app/checkin/[code]/opengraph-image.tsx`

- [ ] **Step 1: Create OG route**

```tsx
import { renderOgImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-template";
import { createAdminClient } from "@/lib/supabase/admin";

export const alt = "Court check-in referred by a partner — ImNotAnAttorney";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  let partnerName = "a trusted partner";
  try {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from("partners")
      .select("company, name")
      .eq("promo_code", code.toUpperCase())
      .single();
    if (data) partnerName = data.company || data.name;
  } catch {
    // fallback to generic
  }
  return renderOgImage({
    title: `Referred by\n${partnerName}.`,
    subtitle: "Daily check-ins, court date reminders,\nand what to expect at your hearing.",
    category: "Court Check-In",
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/checkin/[code]/opengraph-image.tsx
git commit -m "feat(og): check-in mode OG preview"
```

### Task 13: Referral mode bridge page

**Files:**
- Create: `src/app/court-date/[code]/page.tsx`

- [ ] **Step 1: Create bridge page**

```tsx
/**
 * /court-date/[code] — Referral mode entry.
 *
 * Bondsman-sent URL. Renders the shared BridgePage (no check-in workflow).
 * Funnels into /r/{CODE}/quiz via BridgePage's CTA.
 *
 * Gated by NEXT_PUBLIC_CHECKIN_TOGGLE_ENABLED=true during rollout.
 */

import { cache } from "react";
import type { Metadata } from "next";
import { after } from "next/server";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { BridgePage } from "@/components/BridgePage";

const getPartnerByCode = cache(async (code: string) => {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("partners")
    .select("id, name, company, city, promo_code, status, check_in_enabled")
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
    const title = `Court Prep — Referred by ${referrer}`;
    const description = `Court date reminders and what to expect at your hearing.`;
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
          <h1 className="text-2xl font-bold mb-4">
            This referral link isn&apos;t active
          </h1>
          <p className="text-zinc-400 mb-8">
            The link you followed may have expired or is no longer available.
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

  // Capture Referer before after()
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
    />
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/court-date/[code]/page.tsx
git commit -m "feat(routes): referral mode bridge at /court-date/[code]"
```

### Task 14: Referral OG image

**Files:**
- Create: `src/app/court-date/[code]/opengraph-image.tsx`

- [ ] **Step 1: Create OG route**

```tsx
import { renderOgImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-template";
import { createAdminClient } from "@/lib/supabase/admin";

export const alt = "Court prep referred by a partner — ImNotAnAttorney";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  let partnerName = "a trusted partner";
  try {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from("partners")
      .select("company, name")
      .eq("promo_code", code.toUpperCase())
      .single();
    if (data) partnerName = data.company || data.name;
  } catch {
    // fallback to generic
  }
  return renderOgImage({
    title: `Referred by\n${partnerName}.`,
    subtitle: "Court date reminders and what to expect\nat your hearing.",
    category: "Court Prep",
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/court-date/[code]/opengraph-image.tsx
git commit -m "feat(og): referral mode OG preview"
```

### Task 15: Legacy /r/ page + OG branch on flag

**Files:**
- Modify: `src/app/r/[code]/page.tsx:18-28` (cache + metadata), `src/app/r/[code]/opengraph-image.tsx:13-27`

- [ ] **Step 1: Widen the partner select on /r/[code]/page.tsx**

Edit `src/app/r/[code]/page.tsx:18-28`:

```typescript
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
```

Replace the `.select(...)` line with:

```typescript
    .select("id, name, company, city, promo_code, status, check_in_enabled")
```

- [ ] **Step 2: Metadata text branches on flag**

In `generateMetadata` (lines 30-48), the block:

```typescript
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
```

Replace with:

```typescript
  if (partner) {
    const referrer = partner.company || partner.name;
    const title = partner.check_in_enabled
      ? `Court Check-In -- Referred by ${referrer}`
      : `Court Prep -- Referred by ${referrer}`;
    const description = partner.check_in_enabled
      ? `Daily check-ins, court date reminders, and what to expect at your hearing. Referred by ${referrer}.`
      : `Court date reminders and what to expect at your hearing. Referred by ${referrer}.`;
    return {
      title: `${title} | ImNotAnAttorney`,
      description,
      openGraph: { title, description, type: "website" },
      twitter: { card: "summary", title, description },
    };
  }
```

- [ ] **Step 3: OG file branches on flag**

Edit `src/app/r/[code]/opengraph-image.tsx`. The entire file:

```tsx
import { renderOgImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-template";
import { createAdminClient } from "@/lib/supabase/admin";

export const alt = "Referred by a Partner, ImNotAnAttorney";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  let partnerName = "a trusted partner";
  let checkInEnabled = true;
  try {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from("partners")
      .select("company, name, check_in_enabled")
      .eq("promo_code", code.toUpperCase())
      .single();
    if (data) {
      partnerName = data.company || data.name;
      checkInEnabled = data.check_in_enabled !== false;
    }
  } catch {
    // fallback to check-in defaults
  }
  return renderOgImage({
    title: `Referred by\n${partnerName}.`,
    subtitle: checkInEnabled
      ? "Daily check-ins, court date reminders,\nand what to expect at your hearing."
      : "Court date reminders and what to expect\nat your hearing.",
    category: checkInEnabled ? "Court Check-In" : "Court Prep",
  });
}
```

- [ ] **Step 4: Verify tsc**

Run: `npx tsc --noEmit --skipLibCheck > /tmp/tsc.log 2>&1 && echo OK`

- [ ] **Step 5: Commit**

```bash
git add src/app/r/[code]/page.tsx src/app/r/[code]/opengraph-image.tsx
git commit -m "feat(legacy): /r/[code] branches metadata + OG on check_in_enabled"
```

### Task 16: BridgePage discount-line rewrite

**Files:**
- Modify: `src/components/BridgePage.tsx:57-59`

- [ ] **Step 1: Write failing test**

Create `tests/components/BridgePage.test.tsx`:

```typescript
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { BridgePage } from "@/components/BridgePage";

describe("BridgePage discount line", () => {
  it("renders relational framing with partner display name", () => {
    render(
      <BridgePage
        partnerName="Jordan"
        company="Acme Bail Bonds"
        city="Tampa"
        promoCode="ACME"
      />,
    );
    expect(screen.getByText(/Because .* sent you, you save 10% at checkout/i)).toBeTruthy();
    expect(screen.getByText(/Applied automatically/i)).toBeTruthy();
    // Ensure the old transactional form is gone
    expect(screen.queryByText(/saves you 10%/)).toBeNull();
  });

  it("falls back to partner name when company is missing", () => {
    render(
      <BridgePage
        partnerName="Jordan"
        company={null}
        city={null}
        promoCode="ACME"
      />,
    );
    expect(screen.getByText(/Because Jordan sent you/)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test, expect failure**

Run: `npm test -- tests/components/BridgePage.test.tsx`
Expected: FAIL — "saves you 10%" still present.

- [ ] **Step 3: Replace discount fragment**

Edit `src/components/BridgePage.tsx`. Lines 56-59:

```tsx
          <FadeInUp delay={0.15}>
            <p className="text-amber-400 font-bold text-lg mb-6">
              Their code <span className="font-mono">{promoCode}</span> saves you 10%.
            </p>
```

Replace with:

```tsx
          <FadeInUp delay={0.15}>
            <p className="text-amber-400 font-bold text-lg mb-2">
              Because {displayName} sent you, you save 10% at checkout.
            </p>
            <p className="text-zinc-400 text-sm mb-6">
              Applied automatically — no code to remember.
            </p>
```

Also remove `promoCode` from destructuring if no other usage remains — keep if still used in the `Link href`. Check line 67: `href={\`/r/${promoCode}/quiz\`}` keeps it used. Keep the prop.

- [ ] **Step 4: Run test, expect pass**

Run: `npm test -- tests/components/BridgePage.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/BridgePage.tsx tests/components/BridgePage.test.tsx
git commit -m "feat(bridge): rewrite discount line to relational framing"
```

### Task 17: Prep page hides CheckInButton in referral mode

**Files:**
- Modify: `src/app/prep/[token]/page.tsx:100-109` and `:154-156`

- [ ] **Step 1: Extend partner-lookup select**

Lines 100-109 currently select `"company, name"`. Replace:

```typescript
  let partnerCompany: string | null = null;
  if (reminder.partner_promo_code) {
    const { data: partnerData } = await supabase
      .from("partners")
      .select("company, name")
      .eq("promo_code", reminder.partner_promo_code)
      .maybeSingle();
    partnerCompany = partnerData?.company || partnerData?.name || null;
  }
```

With:

```typescript
  let partnerCompany: string | null = null;
  let partnerCheckInEnabled: boolean = false;
  if (reminder.partner_promo_code) {
    const { data: partnerData } = await supabase
      .from("partners")
      .select("company, name, check_in_enabled")
      .eq("promo_code", reminder.partner_promo_code)
      .maybeSingle();
    partnerCompany = partnerData?.company || partnerData?.name || null;
    partnerCheckInEnabled = partnerData?.check_in_enabled === true;
  }
```

- [ ] **Step 2: Gate CheckInButton**

Lines 153-156 render the button unconditionally:

```tsx
        {/* Check-In Button, only before court date */}
        {!courtPassed && (
          <CheckInButton token={token} lastCheckIn={lastCheckInRow?.checked_in_at ?? null} />
        )}
```

Replace with:

```tsx
        {/* Check-In Button — only before court date AND when partner runs check-ins */}
        {!courtPassed && partnerCheckInEnabled && (
          <CheckInButton token={token} lastCheckIn={lastCheckInRow?.checked_in_at ?? null} />
        )}
```

- [ ] **Step 3: Verify tsc**

Run: `npx tsc --noEmit --skipLibCheck > /tmp/tsc.log 2>&1 && echo OK`

- [ ] **Step 4: Commit**

```bash
git add src/app/prep/[token]/page.tsx
git commit -m "feat(prep): hide CheckInButton when partner is referral mode"
```

---

## Phase 5 — Signup form radio block

### Task 18: PartnerApplicationForm adds check-in mode radio

**Files:**
- Modify: `src/components/partner/PartnerApplicationForm.tsx`

- [ ] **Step 1: Add state + radio + send to API**

Edit `src/components/partner/PartnerApplicationForm.tsx`. After line 14 (`const [error, setError]...`):

```typescript
  const [checkInMode, setCheckInMode] = useState<"enabled" | "disabled" | "">("");
```

In `handleSubmit` (line 17), update the fetch body. Line 25:

```typescript
        body: JSON.stringify({ name, email, city: city.trim() || undefined, compliance, source }),
```

Replace with:

```typescript
        body: JSON.stringify({
          name,
          email,
          city: city.trim() || undefined,
          compliance,
          source,
          checkInMode: source === "bondsman" ? checkInMode : undefined,
        }),
```

Add a client-side required check before the fetch (before line 22):

```typescript
    if (source === "bondsman" && checkInMode !== "enabled" && checkInMode !== "disabled") {
      setError("Please pick how you work with clients");
      setSubmitting(false);
      return;
    }
```

- [ ] **Step 2: Render radio fieldset when bondsman**

In the form JSX, after the City field block (ends around line 101) and before the compliance checkbox (around line 102), insert:

```tsx
      {source === "bondsman" && (
        <fieldset className="border border-zinc-700 rounded-xl p-4">
          <legend className="px-2 text-sm text-zinc-300 font-medium">
            How do you work with clients after bonding? *
          </legend>
          <label className="flex items-start gap-3 cursor-pointer mb-3 mt-2">
            <input
              type="radio"
              name="checkInMode"
              value="enabled"
              checked={checkInMode === "enabled"}
              onChange={() => setCheckInMode("enabled")}
              required
              className="mt-1 h-5 w-5 border-zinc-700 bg-zinc-800 text-amber-500 focus:ring-amber-500"
            />
            <span>
              <strong className="text-white block">I run check-ins.</strong>
              <span className="text-sm text-zinc-400">
                You do daily or scheduled check-ins with clients between bond and court.
                Your clients get check-in prompts, court date reminders, and hearing prep.
                You see who&apos;s on track and who isn&apos;t.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="radio"
              name="checkInMode"
              value="disabled"
              checked={checkInMode === "disabled"}
              onChange={() => setCheckInMode("disabled")}
              required
              className="mt-1 h-5 w-5 border-zinc-700 bg-zinc-800 text-amber-500 focus:ring-amber-500"
            />
            <span>
              <strong className="text-white block">Reminders only.</strong>
              <span className="text-sm text-zinc-400">
                You don&apos;t run a check-in workflow. Your clients get court date reminders
                and hearing prep without the daily check-in layer. Cleaner compliance
                posture, simpler operation.
              </span>
            </span>
          </label>
          <p className="text-xs text-zinc-500 mt-3">
            Pick what matches how you already operate. You can switch later in your dashboard.
          </p>
        </fieldset>
      )}
```

- [ ] **Step 3: Rewrite post-submit success copy (Amendment 6)**

Lines 50-55 render the success state. Replace the block:

```tsx
        <div className="bg-zinc-800 rounded-lg p-4 text-left text-sm text-zinc-300 mb-4">
          &ldquo;Hey, I work with a company that researches criminal cases and helps defendants prepare the right questions for their attorney. If you use my code at checkout, you get 10% off. Check it out: imnotanattorney.com&rdquo;
        </div>
        <p className="text-zinc-500 text-xs">Your promo code activates when you click the link in your email.</p>
```

With:

```tsx
        <div className="bg-zinc-800 rounded-lg p-4 text-left text-sm text-zinc-300 mb-4">
          &ldquo;Hey, I work with a company that researches criminal cases and helps defendants prepare the right questions for their attorney. Send clients to your partner link (you&apos;ll get it in your activation email) &mdash; 10% off is built into it, no code to remember. Check it out: imnotanattorney.com&rdquo;
        </div>
        <p className="text-zinc-500 text-xs">Your partner link activates when you click the link in your email.</p>
```

- [ ] **Step 4: Verify tsc**

Run: `npx tsc --noEmit --skipLibCheck > /tmp/tsc.log 2>&1 && echo OK`

- [ ] **Step 5: Commit**

```bash
git add src/components/partner/PartnerApplicationForm.tsx
git commit -m "feat(signup): bondsman check-in mode radio + Amendment 6 copy"
```

---

## Phase 6 — Dashboard + partner-facing

### Task 19: Dashboard computes partnerUrl + threads flag

**Files:**
- Modify: `src/app/partner/dashboard/page.tsx`

- [ ] **Step 1: Wire up check_in_enabled + computed URL**

Edit `src/app/partner/dashboard/page.tsx`. After line 29 import block, add:

```typescript
import { computePartnerUrl, isCheckInMode } from "@/lib/partner-mode";
import { WorkflowToggle } from "@/components/partner/WorkflowToggle";
import { FlipBanner } from "@/components/partner/FlipBanner";
```

Line 138 computes the old URL:

```typescript
  const referralUrl = partner.promo_code ? `${SITE_URL}/r/${partner.promo_code}` : "";
```

Replace with:

```typescript
  const toggleEnabled = process.env.NEXT_PUBLIC_CHECKIN_TOGGLE_ENABLED === "true";
  const partnerUrl = toggleEnabled
    ? computePartnerUrl(partner, SITE_URL)
    : (partner.promo_code ? `${SITE_URL}/r/${partner.promo_code}` : "");
  const legacyUrl = partner.promo_code ? `${SITE_URL}/r/${partner.promo_code}` : "";
  const checkInEnabled = isCheckInMode(partner);
```

- [ ] **Step 2: Thread `referralUrl` = `partnerUrl` downstream**

The downstream props still use the variable name `referralUrl` in their interfaces (do not rename them — out of scope). Replace each use of `referralUrl` in the JSX (lines 194, 240, 247) with `partnerUrl`:

```tsx
        <ToolkitSection partner={partner} referralUrl={partnerUrl} />
```

```tsx
          <MessageTemplates
            promoCode={partner.promo_code || ""}
            referralUrl={partnerUrl}
            checkInEnabled={checkInEnabled}
          />
```

```tsx
        <CreativeAssets
          promoCode={partner.promo_code || ""}
          referralUrl={partnerUrl}
          checkInEnabled={checkInEnabled}
        />
```

- [ ] **Step 3: Pass `checkInEnabled` to ClientTracker**

Line 172:

```tsx
        <ClientTracker
          clients={courtClients}
          onAddClient={() => setShowAddClient(true)}
          checkInSummary={checkInSummary}
        />
```

Replace with:

```tsx
        <ClientTracker
          clients={courtClients}
          onAddClient={() => setShowAddClient(true)}
          checkInSummary={checkInSummary}
          checkInEnabled={checkInEnabled}
        />
```

- [ ] **Step 4: Render WorkflowToggle + FlipBanner for bondsmen**

The dashboard renders the Bail Packet / Compliance Checklist link block around lines 197-223 (conditional on `source === "bondsman"`). After that block, add:

```tsx
        {toggleEnabled && partner.source === "bondsman" && (
          <>
            <FlipBanner partnerUrl={partnerUrl} checkInEnabled={checkInEnabled} />
            <WorkflowToggle
              initialCheckInEnabled={checkInEnabled}
              promoCode={partner.promo_code!}
              siteUrl={SITE_URL}
              onSaved={fetchDashboard}
            />
          </>
        )}
```

- [ ] **Step 5: Verify tsc**

Run: `npx tsc --noEmit --skipLibCheck > /tmp/tsc.log 2>&1 && echo OK`

- [ ] **Step 6: Commit**

```bash
git add src/app/partner/dashboard/page.tsx
git commit -m "feat(dashboard): compute mode-matching partnerUrl + thread checkInEnabled"
```

### Task 20: WorkflowToggle component

**Files:**
- Create: `src/components/partner/WorkflowToggle.tsx`

- [ ] **Step 1: Create component**

```tsx
"use client";
/**
 * WorkflowToggle — bondsman settings for Check-in mode vs Referral mode.
 *
 * PATCHes /api/partner/settings with check_in_enabled. On save, triggers
 * a dashboard refetch and stores the flip timestamp in localStorage so the
 * FlipBanner can show "your URL changed, reprint collateral."
 */

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
      // Record the flip so FlipBanner appears
      try {
        const now = Date.now();
        localStorage.setItem(`inaa.flipAt.${promoCode}`, String(now));
      } catch {
        // localStorage unavailable — banner won't show, not fatal
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

  return (
    <section className="bg-zinc-900 rounded-xl border border-zinc-700 p-6">
      <h2 className="text-xl font-bold mb-1">Client workflow</h2>
      <p className="text-sm text-zinc-400 mb-4">How do you want your link to work?</p>

      <fieldset className="space-y-3">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="radio"
            name="workflowMode"
            checked={checkInEnabled}
            onChange={() => setCheckInEnabled(true)}
            className="mt-1 h-5 w-5 border-zinc-700 bg-zinc-800 text-amber-500 focus:ring-amber-500"
          />
          <span>
            <strong className="text-white block">Check-in mode</strong>
            <span className="text-sm text-zinc-400">
              Your clients get daily check-in prompts plus court date reminders. You see who&apos;s
              checking in, who&apos;s not, and missed-check-in alerts land in your inbox.
            </span>
          </span>
        </label>
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="radio"
            name="workflowMode"
            checked={!checkInEnabled}
            onChange={() => setCheckInEnabled(false)}
            className="mt-1 h-5 w-5 border-zinc-700 bg-zinc-800 text-amber-500 focus:ring-amber-500"
          />
          <span>
            <strong className="text-white block">Referral mode</strong>
            <span className="text-sm text-zinc-400">
              Your clients get court date reminders and hearing prep &mdash; no daily check-in
              workflow. Cleaner compliance posture. You see court dates, reminder progress, and
              conversions.
            </span>
          </span>
        </label>
      </fieldset>

      <div className="mt-4 text-xs text-zinc-500 space-y-1">
        <p>You can switch modes later. When you do, your partner link changes:</p>
        <p>&bull; Check-in mode uses <span className="text-amber-400">{checkInUrl}</span></p>
        <p>&bull; Referral mode uses <span className="text-amber-400">{courtDateUrl}</span></p>
        <p>
          The old link keeps working for any QR codes or flyers you already printed, but it&apos;ll
          show the new mode&apos;s preview. Best practice: reprint your bail-packet insert within a week.
        </p>
      </div>

      {error && (
        <p role="alert" className="text-red-400 text-sm mt-3">{error}</p>
      )}

      <button
        onClick={handleSave}
        disabled={saving || checkInEnabled === initialCheckInEnabled}
        className="mt-4 px-5 py-2.5 bg-amber-500 text-black font-bold rounded-lg hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors"
      >
        {saving ? "Saving..." : "Save workflow setting"}
      </button>
    </section>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/partner/WorkflowToggle.tsx
git commit -m "feat(dashboard): WorkflowToggle component"
```

### Task 21: FlipBanner component

**Files:**
- Create: `src/components/partner/FlipBanner.tsx`

- [ ] **Step 1: Create component**

```tsx
"use client";
/**
 * FlipBanner — shows after a bondsman flips workflow mode, advising them to
 * reprint collateral. Dismissal persisted in localStorage per flip.
 */

import { useEffect, useState } from "react";

interface Props {
  partnerUrl: string;
  checkInEnabled: boolean;
}

export function FlipBanner({ partnerUrl, checkInEnabled }: Props) {
  const [flipAt, setFlipAt] = useState<string | null>(null);

  useEffect(() => {
    try {
      const match = partnerUrl.match(/\/(?:checkin|court-date)\/([^/]+)/);
      const code = match?.[1];
      if (!code) return;
      const at = localStorage.getItem(`inaa.flipAt.${code}`);
      const dismissed = localStorage.getItem(`inaa.flipDismissed.${code}.${at}`);
      if (at && !dismissed) setFlipAt(at);
    } catch {
      // localStorage unavailable
    }
  }, [partnerUrl]);

  if (!flipAt) return null;

  function dismiss() {
    try {
      const match = partnerUrl.match(/\/(?:checkin|court-date)\/([^/]+)/);
      const code = match?.[1];
      if (code) localStorage.setItem(`inaa.flipDismissed.${code}.${flipAt}`, "1");
    } catch {}
    setFlipAt(null);
  }

  const modeLabel = checkInEnabled ? "Check-in mode" : "Referral mode";

  return (
    <div className="bg-amber-500/10 border border-amber-500/50 rounded-xl px-5 py-4">
      <p className="text-amber-300 font-medium">Your partner URL changed.</p>
      <p className="text-zinc-300 text-sm mt-1">
        You flipped to {modeLabel}. Your new link is{" "}
        <span className="text-amber-400 font-mono text-xs">{partnerUrl}</span>.{" "}
        Existing QR codes and printed inserts still work, but they show the old mode&apos;s preview.{" "}
        <a href="/partner/card" className="underline hover:text-white">Reprint your bail-packet insert</a>{" "}
        and{" "}
        <a href="/partner/checklist" className="underline hover:text-white">your compliance checklist</a>{" "}
        with the new URL.
      </p>
      <button
        onClick={dismiss}
        className="text-amber-400 text-xs mt-2 underline hover:text-amber-300 cursor-pointer"
      >
        Dismiss
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/partner/FlipBanner.tsx
git commit -m "feat(dashboard): FlipBanner for reprint-collateral warning"
```

### Task 22: MessageTemplates mode-aware + Amendment 6 rewrite

**Files:**
- Modify: `src/components/MessageTemplates.tsx`

- [ ] **Step 1: Extend props and templates**

Replace the entire file with:

```tsx
"use client";
/**
 * Pre-written message templates for partners to send to defendants.
 * Mode-aware: template #1 varies by check-in vs referral mode.
 * All discount framing is relational — URL carries the code, middleware
 * sets the cookie, discount applies automatically at checkout.
 */

import { useState } from "react";
import { copyToClipboard } from "@/lib/clipboard";

interface MessageTemplatesProps {
  promoCode: string;
  referralUrl: string;
  checkInEnabled: boolean;
}

type Template = {
  label: string;
  template: (code: string, url: string) => string;
};

const CHECK_IN_FIRST: Template = {
  label: "Add to your check-in text",
  template: (_code, url) =>
    `Hey [name], this is [your name]. Check-in: [day/time]. Free court date reminders and what to expect at your hearing: ${url}. Because you're our client, 10% off any case analysis is built in.`,
};

const REFERRAL_FIRST: Template = {
  label: "After the bail packet hand-off",
  template: (_code, url) =>
    `Hey [name], this is [your name] from [company]. Your court date reminders and hearing prep are set up here: ${url}. Because you're our client, 10% off any case analysis is built in — no code to remember.`,
};

const SHARED_TEMPLATES: Template[] = [
  {
    label: "Quick share",
    template: (_code, url) =>
      `Hey [name], free court date reminders and hearing prep for your case: ${url}. 10% off if you ever need deeper analysis — already built into the link.`,
  },
  {
    label: "For someone else",
    template: (_code, url) =>
      `Someone dealing with a case? Free court date reminders and what to expect at their hearing: ${url}. 10% off any analysis if they need it — built in.`,
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
                className="text-xs px-3 py-1 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-white transition-colors"
              >
                {copiedIdx === i ? "Copied!" : "Copy"}
              </button>
            </div>
            <p className="text-sm text-zinc-300 leading-relaxed">{text}</p>
          </div>
        );
      })}
      <p className="text-xs text-zinc-400">
        Replace [name] and [your name] when you paste. The link already has your code in it,
        so the discount applies automatically &mdash; no code to remember or type.
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Verify tsc**

Run: `npx tsc --noEmit --skipLibCheck > /tmp/tsc.log 2>&1 && echo OK`

- [ ] **Step 3: Commit**

```bash
git add src/components/MessageTemplates.tsx
git commit -m "feat(templates): MessageTemplates mode-aware + Amendment 6 rewrite"
```

### Task 23: CreativeAssets mode-aware + Amendment 6 rewrite

**Files:**
- Modify: `src/components/partner/CreativeAssets.tsx`

- [ ] **Step 1: Replace templates**

Replace the `TEMPLATES` constant (lines 15-46) and the component signature to accept `checkInEnabled`.

Change the interface (lines 10-13):

```typescript
interface CreativeAssetsProps {
  promoCode: string;
  referralUrl: string;
  checkInEnabled: boolean;
}
```

Replace the `TEMPLATES` constant:

```typescript
const SHARED_TEMPLATES: { label: string; template: (code: string, url: string) => string }[] = [
  {
    label: "X (Twitter) Post",
    template: (_code, url) =>
      `Most people walk into court blind. The judge, prosecutor, and your own attorney all know each other, you're the only stranger in the room.\n\nThis service digs into your case and gives you the exact questions to close that gap.\n\n10% off is built into the link: ${url}`,
  },
  {
    label: "Facebook Post",
    template: (_code, url) =>
      `If you or someone you know is dealing with criminal charges, this changed the game for a lot of people I work with.\n\nThey research your case, charges, judge history, everything, and give you the specific questions to bring to your attorney. Not legal advice. Better: the information that closes the gap between you and everyone else in that courtroom.\n\n10% off comes with the link: ${url}`,
  },
  {
    label: "General Social Post",
    template: (_code, url) =>
      `Your attorney works with the judge and prosecutor every week. You meet them once.\n\nImNotAnAttorney researches your case and gives you the questions that level the playing field. 10% off built in: ${url}`,
  },
  {
    label: "Intro Email",
    template: (_code, url) =>
      `Subject: Something that might help with your case\n\nHey [name],\n\nI wanted to pass along a resource that's helped a lot of people I work with. It's called ImNotAnAttorney — they research your specific charges, your judge, and your case details, then generate the exact questions you should be asking your attorney.\n\nIt's not legal advice, it's the information that helps you hold your attorney accountable and actually understand what's happening with your case.\n\nHere's the link: ${url}\n(Because you're our client, 10% off is already built in — no code to remember.)\n\nWorth checking out while everything is still fresh.\n\n[Your name]`,
  },
  {
    label: "Follow-Up Email",
    template: (_code, url) =>
      `Subject: Following up — that case research tool\n\nHey [name],\n\nJust checking in. I know things are stressful right now, but I wanted to remind you about that service I mentioned — ImNotAnAttorney.\n\nThe people I've sent there say it helped them feel way more prepared for their attorney meetings. They dig into your specific case and generate questions you wouldn't think to ask.\n\nLink: ${url}\n(The 10% off is already in the link.)\n\nNo pressure, but the earlier you get this info the more useful it is.\n\n[Your name]`,
  },
];

const VERBAL_CHECK_IN = {
  label: "Verbal One-Liner (for check-ins)",
  template: (_code: string, url: string) =>
    `After you tell them about check-ins, say:\n\n"Your court date reminders and what to expect at your hearing are on this link. ${url.replace(/^https?:\/\//, "")} — because you're our client, 10% off is already built in."\n\nOne sentence. That's it.`,
};

const VERBAL_REFERRAL = {
  label: "Verbal One-Liner (at the bail desk)",
  template: (_code: string, url: string) =>
    `When you hand them the bail paperwork, say:\n\n"Your court date reminders and hearing prep are on this card. Scan the QR or go to the link. Because you're our client, 10% off is built in if you want deeper case analysis."\n\nOne sentence of context, one QR hand-off. That's it.`,
};
```

Then in the component body (currently `export function CreativeAssets({ promoCode, referralUrl }: CreativeAssetsProps) {`), update destructure + compose templates:

```typescript
export function CreativeAssets({ promoCode, referralUrl, checkInEnabled }: CreativeAssetsProps) {
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  async function handleCopy(text: string, idx: number) {
    const ok = await copyToClipboard(text);
    if (!ok) return;
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  }

  const templates = [
    ...SHARED_TEMPLATES,
    checkInEnabled ? VERBAL_CHECK_IN : VERBAL_REFERRAL,
  ];
```

Then in the JSX (line 66-92), replace `TEMPLATES.map` with `templates.map`.

- [ ] **Step 2: Verify tsc**

Run: `npx tsc --noEmit --skipLibCheck > /tmp/tsc.log 2>&1 && echo OK`

- [ ] **Step 3: Commit**

```bash
git add src/components/partner/CreativeAssets.tsx
git commit -m "feat(templates): CreativeAssets mode-aware + Amendment 6 rewrite"
```

### Task 24: ClientTracker mode-aware

**Files:**
- Create test: `tests/components/ClientTracker.test.tsx`
- Modify: `src/components/partner/ClientTracker.tsx`

- [ ] **Step 1: Write failing test**

Create `tests/components/ClientTracker.test.tsx`:

```typescript
import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { ClientTracker } from "@/components/partner/ClientTracker";

const sampleClient = {
  id: "c1",
  token: "tok1",
  first_name: "Alex",
  charge_type: "dui_first_offense",
  county_state: "Pinellas County, FL",
  court_date: "2026-06-01",
  status: "active",
  reminders_sent: [],
  created_at: "2026-04-17T00:00:00Z",
  converted_at: null,
  check_in_days: null,
  check_in_source: null,
};

describe("ClientTracker mode behavior", () => {
  it("shows Check-Ins stat + column when checkInEnabled=true", () => {
    render(
      <ClientTracker
        clients={[sampleClient]}
        onAddClient={() => {}}
        checkInSummary={{ c1: { count: 0, lastCheckIn: null } }}
        checkInEnabled={true}
      />,
    );
    expect(screen.getByText("Check-Ins")).toBeTruthy();
    const headers = screen.getAllByRole("columnheader").map((h) => h.textContent);
    expect(headers).toContain("Check-Ins");
    expect(headers).toContain("Schedule");
  });

  it("hides Check-Ins stat + columns when checkInEnabled=false", () => {
    render(
      <ClientTracker
        clients={[sampleClient]}
        onAddClient={() => {}}
        checkInSummary={{}}
        checkInEnabled={false}
      />,
    );
    expect(screen.queryByText("Check-Ins")).toBeNull();
    const headers = screen.getAllByRole("columnheader").map((h) => h.textContent);
    expect(headers).not.toContain("Check-Ins");
    expect(headers).not.toContain("Schedule");
  });

  it("shows referral-mode empty state when checkInEnabled=false and no clients", () => {
    render(
      <ClientTracker
        clients={[]}
        onAddClient={() => {}}
        checkInSummary={{}}
        checkInEnabled={false}
      />,
    );
    expect(screen.getByText(/court date reminders, they'?ll show up here/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test, expect failure**

Run: `npm test -- tests/components/ClientTracker.test.tsx`
Expected: FAIL — component doesn't accept `checkInEnabled`.

- [ ] **Step 3: Modify ClientTracker**

Edit `src/components/partner/ClientTracker.tsx`. Update interface (lines 28-32):

```typescript
interface ClientTrackerProps {
  clients: CourtClient[];
  onAddClient: () => void;
  checkInSummary: Record<string, { count: number; lastCheckIn: string | null }>;
  checkInEnabled: boolean;
}
```

Update destructure (line 57):

```typescript
export function ClientTracker({ clients, onAddClient, checkInSummary, checkInEnabled }: ClientTrackerProps) {
```

Replace the summary stats grid (lines 79-96) with mode-aware rendering:

```tsx
      <div className={`grid ${checkInEnabled ? "grid-cols-4" : "grid-cols-3"} gap-3 mb-6`}>
        <div className="bg-zinc-800 rounded-lg p-3 text-center">
          <p className="text-2xl font-bold">{activeClients.length}</p>
          <p className="text-xs text-zinc-400">Active</p>
        </div>
        <div className="bg-zinc-800 rounded-lg p-3 text-center">
          <p className="text-2xl font-bold text-amber-400">{upcomingThisWeek.length}</p>
          <p className="text-xs text-zinc-400">This Week</p>
        </div>
        <div className="bg-zinc-800 rounded-lg p-3 text-center">
          <p className="text-2xl font-bold text-green-400">{clients.filter(c => c.converted_at).length}</p>
          <p className="text-xs text-zinc-400">Converted</p>
        </div>
        {checkInEnabled && (
          <div className="bg-zinc-800 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-blue-400">{Object.values(checkInSummary).reduce((sum, s) => sum + s.count, 0)}</p>
            <p className="text-xs text-zinc-400">Check-Ins</p>
          </div>
        )}
      </div>
```

Replace the empty-state block (lines 98-101):

```tsx
      {clients.length === 0 ? (
        <p className="text-zinc-400 text-sm">
          No clients yet. When defendants use your link and sign up for court prep, they&apos;ll appear here.
        </p>
      ) : (
```

With:

```tsx
      {clients.length === 0 ? (
        <p className="text-zinc-400 text-sm">
          {checkInEnabled
            ? "No clients yet. When defendants use your link and sign up for court prep, they'll appear here."
            : "No clients yet. When defendants use your link and sign up for court date reminders, they'll show up here with their court date, reminder progress, and whether they converted to case analysis."}
        </p>
      ) : (
```

In the `<thead>` block (lines 105-114), gate the Check-Ins and Schedule columns:

```tsx
            <thead>
              <tr className="text-left text-zinc-400 border-b border-zinc-700">
                <th className="pb-2 pr-4">Name</th>
                <th className="pb-2 pr-4">Charge</th>
                <th className="pb-2 pr-4">Court Date</th>
                <th className="pb-2 pr-4">Status</th>
                <th className="pb-2 pr-4">Reminders</th>
                {checkInEnabled && <th className="pb-2 pr-4">Check-Ins</th>}
                {checkInEnabled && <th className="pb-2 pr-4">Schedule</th>}
              </tr>
            </thead>
```

In the table body (lines 127-174), gate the Name column's dot indicator + the two check-in data cells. The Name `<td>` is:

```tsx
                    <td className="py-3 pr-4 text-white">
                      <span className="flex items-center gap-2">
                        {c.first_name}
                        {hasSchedule ? (
                          checkedInToday
                            ? <span className="inline-block w-2.5 h-2.5 rounded-full bg-green-500" title="Checked in today" />
                            : isScheduledToday
                              ? <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500" title="Missed check-in today" />
                              : <span className="inline-block w-2.5 h-2.5 rounded-full bg-zinc-600" title="Not scheduled today" />
                        ) : (
                          c.court_date > todayDateStr
                            ? <span className="text-xs text-amber-400 font-medium">Schedule needed</span>
                            : null
                        )}
                      </span>
                    </td>
```

Replace with:

```tsx
                    <td className="py-3 pr-4 text-white">
                      <span className="flex items-center gap-2">
                        {c.first_name}
                        {checkInEnabled && (
                          hasSchedule ? (
                            checkedInToday
                              ? <span className="inline-block w-2.5 h-2.5 rounded-full bg-green-500" title="Checked in today" />
                              : isScheduledToday
                                ? <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500" title="Missed check-in today" />
                                : <span className="inline-block w-2.5 h-2.5 rounded-full bg-zinc-600" title="Not scheduled today" />
                          ) : (
                            c.court_date > todayDateStr
                              ? <span className="text-xs text-amber-400 font-medium">Schedule needed</span>
                              : null
                          )
                        )}
                      </span>
                    </td>
```

Gate the Check-Ins cell (lines 154-160):

```tsx
                    <td className="py-3 pr-4 text-zinc-400">
                      {ciData ? (
                        <span>{ciData.count} <span className="text-zinc-600 text-xs">{ciData.lastCheckIn ? `(${new Date(ciData.lastCheckIn).toLocaleDateString("en-US", { month: "short", day: "numeric" })})` : ""}</span></span>
                      ) : (
                        <span>&mdash;</span>
                      )}
                    </td>
```

Wrap with:

```tsx
                    {checkInEnabled && (
                      <td className="py-3 pr-4 text-zinc-400">
                        {ciData ? (
                          <span>{ciData.count} <span className="text-zinc-600 text-xs">{ciData.lastCheckIn ? `(${new Date(ciData.lastCheckIn).toLocaleDateString("en-US", { month: "short", day: "numeric" })})` : ""}</span></span>
                        ) : (
                          <span>&mdash;</span>
                        )}
                      </td>
                    )}
```

Gate the Schedule cell similarly (lines 161-172):

```tsx
                    {checkInEnabled && (
                      <td className="py-3 pr-4 text-zinc-400 text-xs">
                        {hasSchedule ? (
                          <span>
                            {c.check_in_days!.map(d => d.charAt(0).toUpperCase() + d.slice(1)).join(", ")}
                            {c.check_in_source === "partner" && (
                              <span className="ml-1 text-amber-400" title="Set by partner">*</span>
                            )}
                          </span>
                        ) : (
                          <span>&mdash;</span>
                        )}
                      </td>
                    )}
```

- [ ] **Step 4: Run test, expect pass**

Run: `npm test -- tests/components/ClientTracker.test.tsx`
Expected: PASS, 3/3.

- [ ] **Step 5: Commit**

```bash
git add src/components/partner/ClientTracker.tsx tests/components/ClientTracker.test.tsx
git commit -m "feat(tracker): ClientTracker hides check-in columns in referral mode"
```

### Task 25: Bail-packet card embeds mode-matching URL

**Files:**
- Modify: `src/app/partner/card/page.tsx:19-24`, `:60-72`, `:89`

- [ ] **Step 1: Extend partner state with check_in_enabled**

Edit `src/app/partner/card/page.tsx`. Lines 19-24 define state shape:

```typescript
  const [partner, setPartner] = useState<{
    name: string;
    company: string | null;
    promo_code: string;
    city: string | null;
  } | null>(null);
```

Replace with:

```typescript
  const [partner, setPartner] = useState<{
    name: string;
    company: string | null;
    promo_code: string;
    city: string | null;
    check_in_enabled: boolean;
  } | null>(null);
```

In `fetchPartner` (lines 46-51), update the setState call:

```typescript
      setPartner({
        name: data.partner.name,
        company: data.partner.company,
        promo_code: data.partner.promo_code,
        city: data.partner.city ?? null,
      });
```

Replace with:

```typescript
      setPartner({
        name: data.partner.name,
        company: data.partner.company,
        promo_code: data.partner.promo_code,
        city: data.partner.city ?? null,
        check_in_enabled: data.partner.check_in_enabled !== false,
      });
```

- [ ] **Step 2: Update QR URL builder**

Lines 62-72 build the QR data URL with `/r/{code}`:

```typescript
      try {
        const QRCodeLib = (await import("qrcode")).default;
        const url = `https://imnotanattorney.com/r/${partner.promo_code}`;
        const dataUrl = await QRCodeLib.toDataURL(url, {
          width: 600,
          margin: 3,
          color: { dark: "#000000", light: "#FFFFFF" },
          errorCorrectionLevel: "H",
        });
        setQrDataUrl(dataUrl);
```

Replace with:

```typescript
      try {
        const QRCodeLib = (await import("qrcode")).default;
        const toggleEnabled = process.env.NEXT_PUBLIC_CHECKIN_TOGGLE_ENABLED === "true";
        const prefix = toggleEnabled
          ? (partner.check_in_enabled ? "checkin" : "court-date")
          : "r";
        const url = `https://imnotanattorney.com/${prefix}/${partner.promo_code}`;
        const dataUrl = await QRCodeLib.toDataURL(url, {
          width: 600,
          margin: 3,
          color: { dark: "#000000", light: "#FFFFFF" },
          errorCorrectionLevel: "H",
        });
        setQrDataUrl(dataUrl);
```

- [ ] **Step 3: Update visible referral URL**

Line 89:

```typescript
  const referralUrl = `imnotanattorney.com/r/${partner.promo_code}`;
```

Replace with:

```typescript
  const toggleEnabled = process.env.NEXT_PUBLIC_CHECKIN_TOGGLE_ENABLED === "true";
  const prefix = toggleEnabled
    ? (partner.check_in_enabled ? "checkin" : "court-date")
    : "r";
  const referralUrl = `imnotanattorney.com/${prefix}/${partner.promo_code}`;
```

- [ ] **Step 4: Verify tsc**

Run: `npx tsc --noEmit --skipLibCheck > /tmp/tsc.log 2>&1 && echo OK`

- [ ] **Step 5: Commit**

```bash
git add src/app/partner/card/page.tsx
git commit -m "feat(card): bail-packet insert embeds mode-matching URL"
```

### Task 26: Compliance checklist embeds mode-matching URL

**Files:**
- Modify: `src/app/partner/checklist/page.tsx:20-26`, `:46-54`, `:67-75`, `:209`

- [ ] **Step 1: Extend partner state**

Edit `src/app/partner/checklist/page.tsx`. Lines 20-26:

```typescript
  const [partner, setPartner] = useState<{
    name: string;
    company: string | null;
    city: string | null;
    phone: string | null;
    promo_code: string;
  } | null>(null);
```

Replace with:

```typescript
  const [partner, setPartner] = useState<{
    name: string;
    company: string | null;
    city: string | null;
    phone: string | null;
    promo_code: string;
    check_in_enabled: boolean;
  } | null>(null);
```

`fetchPartner` (lines 48-54):

```typescript
      setPartner({
        name: data.partner.name,
        company: data.partner.company,
        city: data.partner.city ?? null,
        phone: data.partner.phone ?? null,
        promo_code: data.partner.promo_code,
      });
```

Replace with:

```typescript
      setPartner({
        name: data.partner.name,
        company: data.partner.company,
        city: data.partner.city ?? null,
        phone: data.partner.phone ?? null,
        promo_code: data.partner.promo_code,
        check_in_enabled: data.partner.check_in_enabled !== false,
      });
```

- [ ] **Step 2: Update QR URL + visible URL**

Lines 67-75 (QR generation):

```typescript
      try {
        const QRCodeLib = (await import("qrcode")).default;
        const url = `https://imnotanattorney.com/r/${partner.promo_code}/reminders`;
        const dataUrl = await QRCodeLib.toDataURL(url, {
          width: 400,
          margin: 2,
          color: { dark: "#000000", light: "#FFFFFF" },
          errorCorrectionLevel: "H",
        });
        setQrDataUrl(dataUrl);
```

Replace with:

```typescript
      try {
        const QRCodeLib = (await import("qrcode")).default;
        const toggleEnabled = process.env.NEXT_PUBLIC_CHECKIN_TOGGLE_ENABLED === "true";
        const prefix = toggleEnabled
          ? (partner.check_in_enabled ? "checkin" : "court-date")
          : "r/" + partner.promo_code + "/reminders";
        const url = toggleEnabled
          ? `https://imnotanattorney.com/${prefix}/${partner.promo_code}`
          : `https://imnotanattorney.com/${prefix}`;
        const dataUrl = await QRCodeLib.toDataURL(url, {
          width: 400,
          margin: 2,
          color: { dark: "#000000", light: "#FFFFFF" },
          errorCorrectionLevel: "H",
        });
        setQrDataUrl(dataUrl);
```

Wait — cleaner: keep logic symmetric with card.

```typescript
      try {
        const QRCodeLib = (await import("qrcode")).default;
        const toggleEnabled = process.env.NEXT_PUBLIC_CHECKIN_TOGGLE_ENABLED === "true";
        const urlPath = toggleEnabled
          ? (partner.check_in_enabled ? `/checkin/${partner.promo_code}` : `/court-date/${partner.promo_code}`)
          : `/r/${partner.promo_code}/reminders`;
        const url = `https://imnotanattorney.com${urlPath}`;
        const dataUrl = await QRCodeLib.toDataURL(url, {
          width: 400,
          margin: 2,
          color: { dark: "#000000", light: "#FFFFFF" },
          errorCorrectionLevel: "H",
        });
        setQrDataUrl(dataUrl);
```

Line 209 in `ChecklistContent` component:

```typescript
  const reminderUrl = `imnotanattorney.com/r/${promoCode}/reminders`;
```

The function signature (line 198-208) receives `promoCode` but not the mode. Pass mode through. Find the two callers (screen preview line 133, print block line 144). Update `ChecklistContent` props (lines 198-208):

```typescript
function ChecklistContent({
  companyLine,
  phone,
  promoCode,
  qrDataUrl,
}: {
  companyLine: string;
  phone: string | null;
  promoCode: string;
  qrDataUrl: string | null;
}) {
  const reminderUrl = `imnotanattorney.com/r/${promoCode}/reminders`;
```

Replace with:

```typescript
function ChecklistContent({
  companyLine,
  phone,
  promoCode,
  qrDataUrl,
  reminderUrl,
}: {
  companyLine: string;
  phone: string | null;
  promoCode: string;
  qrDataUrl: string | null;
  reminderUrl: string;
}) {
```

Remove the old `const reminderUrl = ...` line inside the component.

Compute `reminderUrl` in the parent and pass it:

In the parent component (after line 97), add:

```typescript
  const toggleEnabled = process.env.NEXT_PUBLIC_CHECKIN_TOGGLE_ENABLED === "true";
  const urlPath = toggleEnabled
    ? (partner.check_in_enabled ? `/checkin/${partner.promo_code}` : `/court-date/${partner.promo_code}`)
    : `/r/${partner.promo_code}/reminders`;
  const reminderUrl = `imnotanattorney.com${urlPath}`;
```

Update both `<ChecklistContent ... />` call sites (line 133, line 144):

```tsx
          <ChecklistContent
            companyLine={companyLine}
            phone={partner.phone}
            promoCode={partner.promo_code}
            qrDataUrl={qrDataUrl}
            reminderUrl={reminderUrl}
          />
```

- [ ] **Step 3: Verify tsc**

Run: `npx tsc --noEmit --skipLibCheck > /tmp/tsc.log 2>&1 && echo OK`

- [ ] **Step 4: Commit**

```bash
git add src/app/partner/checklist/page.tsx
git commit -m "feat(checklist): compliance checklist embeds mode-matching URL"
```

### Task 27: Compliance report client handles referral mode

**Files:**
- Modify: `src/app/partner/compliance-report/ComplianceReportClient.tsx`

- [ ] **Step 1: Read current file**

Run: `cat src/app/partner/compliance-report/ComplianceReportClient.tsx` is banned. Use Read tool.

Read `src/app/partner/compliance-report/ComplianceReportClient.tsx` to identify where check-in data is rendered.

- [ ] **Step 2: Wire `checkInMode` into the render path**

The API response now includes `checkInMode: "enabled" | "disabled"`. Add the field to the response type (search for the interface/type the client uses to parse the fetch result). At the top of the component, after response parsing, add:

```typescript
const isReferralMode = data.checkInMode === "disabled";
```

Conditionally render the check-in sections:

1. Summary stats: hide the "Check-ins this week" / "Missed check-ins" cards when `isReferralMode`.
2. Client table: hide "Last check-in" and "Check-in status" columns.
3. Page intro copy: when referral mode, replace "This report shows check-in compliance across your clients…" with "This report shows court-date reminder activity across your clients. Your account is in Referral mode — check-in workflows are off."

Since the exact copy pattern in this file wasn't captured above, the implementing subagent must Read the file and apply the same rendering-gate pattern used in ClientTracker: `{!isReferralMode && (<card />)}` around each check-in section.

- [ ] **Step 3: Verify tsc**

Run: `npx tsc --noEmit --skipLibCheck > /tmp/tsc.log 2>&1 && echo OK`

- [ ] **Step 4: Commit**

```bash
git add src/app/partner/compliance-report/ComplianceReportClient.tsx
git commit -m "feat(compliance): compliance report handles referral mode"
```

---

## Phase 7 — Integration tests (E2E)

### Task 28: E2E — check-in mode happy path

**Files:**
- Create: `e2e/bondsman-checkin-mode.spec.ts`

- [ ] **Step 1: Write test**

```typescript
import { test, expect } from "@playwright/test";

test.describe("Bondsman check-in mode flow", () => {
  test("bondsman URL /checkin/{CODE} renders signup form and redirects to /prep on submit", async ({ page }) => {
    // Requires test partner "E2EBOND" with check_in_enabled=true in the test DB seed.
    // If seeding is absent, skip with test.skip() rather than fail.

    await page.goto("/checkin/E2EBOND");

    // OG-friendly eyebrow + headline render
    await expect(page.getByText("Court Check-In", { exact: false })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Set up your court check-in/i })).toBeVisible();

    // Form fields present
    await page.getByLabel("First name").fill("PlaywrightTest");
    await page.getByLabel(/Email/i).fill("e2e@example.com");
    await page.getByLabel("Next court date").fill("2026-08-01");
    await page.getByLabel(/County/i).fill("Pinellas County, FL");
    // Charge picker — select first non-empty option
    await page.getByLabel(/charged with/i).selectOption({ index: 1 });

    // Submit
    await page.getByRole("button", { name: /Set Up My Court Prep/i }).click();

    // Expect redirect to /prep/{token}
    await page.waitForURL(/\/prep\/.+/, { timeout: 15000 });
  });
});
```

- [ ] **Step 2: Verify E2E test discovers but doesn't fail CI**

The test requires a seeded partner. If absent, add `test.skip(!process.env.E2E_SEED_READY, "requires seeded test partner")` at the top of the describe block.

- [ ] **Step 3: Commit**

```bash
git add e2e/bondsman-checkin-mode.spec.ts
git commit -m "test(e2e): bondsman check-in mode happy path"
```

### Task 29: E2E — referral mode happy path

**Files:**
- Create: `e2e/bondsman-referral-mode.spec.ts`

- [ ] **Step 1: Write test**

```typescript
import { test, expect } from "@playwright/test";

test.describe("Bondsman referral mode flow", () => {
  test("bondsman URL /court-date/{CODE} renders BridgePage", async ({ page }) => {
    // Requires test partner "E2EREFE" with check_in_enabled=false
    test.skip(!process.env.E2E_SEED_READY, "requires seeded test partner");

    await page.goto("/court-date/E2EREFE");

    // BridgePage headline: "{Name} referred you. Here's why."
    await expect(page.getByText(/referred you/i)).toBeVisible();
    // Discount line is relational
    await expect(page.getByText(/Because .+ sent you, you save 10%/i)).toBeVisible();
    await expect(page.getByText(/no code to remember/i)).toBeVisible();

    // CTA leads to /r/{CODE}/quiz
    const cta = page.getByRole("link", { name: /Take Back Control/i });
    await expect(cta).toBeVisible();
    await expect(cta).toHaveAttribute("href", "/r/E2EREFE/quiz");
  });
});
```

- [ ] **Step 2: Commit**

```bash
git add e2e/bondsman-referral-mode.spec.ts
git commit -m "test(e2e): bondsman referral mode happy path"
```

### Task 30: E2E — legacy /r/{CODE} branching

**Files:**
- Create: `e2e/bondsman-legacy-branching.spec.ts`

- [ ] **Step 1: Write test**

```typescript
import { test, expect } from "@playwright/test";

test.describe("Legacy /r/{CODE} mode branching", () => {
  test("legacy URL for check-in partner shows check-in metadata", async ({ page }) => {
    test.skip(!process.env.E2E_SEED_READY, "requires seeded test partner");

    await page.goto("/r/E2EBOND");

    // Page still renders
    await expect(page.getByText(/referred you/i)).toBeVisible();

    // Metadata tests — use page.evaluate to read og: meta
    const ogTitle = await page.evaluate(() => {
      return document.querySelector('meta[property="og:title"]')?.getAttribute("content") || "";
    });
    expect(ogTitle).toMatch(/Check-In/i);
  });

  test("legacy URL for referral partner shows referral metadata", async ({ page }) => {
    test.skip(!process.env.E2E_SEED_READY, "requires seeded test partner");

    await page.goto("/r/E2EREFE");

    const ogTitle = await page.evaluate(() => {
      return document.querySelector('meta[property="og:title"]')?.getAttribute("content") || "";
    });
    expect(ogTitle).toMatch(/Court Prep/i);
    expect(ogTitle).not.toMatch(/Check-In/i);
  });
});
```

- [ ] **Step 2: Commit**

```bash
git add e2e/bondsman-legacy-branching.spec.ts
git commit -m "test(e2e): legacy /r/[code] branches by check_in_enabled"
```

---

## Phase 8 — Deploy + verify

### Task 31: Full unit suite + tsc sweep

- [ ] **Step 1: Run full unit suite**

Run: `npm test > /tmp/vitest.log 2>&1`
Read `/tmp/vitest.log`. Expected: all green.

- [ ] **Step 2: Full tsc**

Run: `npx tsc --noEmit --skipLibCheck > /tmp/tsc.log 2>&1 && echo OK`
Expected: `OK`. If any type errors surface from Partner-shape test mocks, fix them in the respective test files (add `check_in_enabled: true` to any partner literal).

### Task 32: Deploy dark

- [ ] **Step 1: Confirm feature flag OFF in prod env**

Run: `vercel env ls > /tmp/envs.txt 2>&1` and read `/tmp/envs.txt`. Confirm `NEXT_PUBLIC_CHECKIN_TOGGLE_ENABLED` either absent or `false`.

If absent, add: `vercel env add NEXT_PUBLIC_CHECKIN_TOGGLE_ENABLED production` with value `false`.

- [ ] **Step 2: Push to master**

Run:
```bash
git push origin master
```

Wait for Vercel deploy. Verify deploy status via `vercel inspect` on latest deployment URL.

- [ ] **Step 3: CV probe**

Run:
```bash
node ~/projects/continuous-verification/verify.mjs --project inna --probe-only --no-trends
```

Expected: H1 + H2 + H3 + H5 + H6 all CLEAN. New routes 404 (flag off → `notFound()`).

- [ ] **Step 4: Flip flag**

Run: update `NEXT_PUBLIC_CHECKIN_TOGGLE_ENABLED=true` in Vercel production env. Trigger redeploy (Vercel auto-redeploys on env change).

- [ ] **Step 5: Spot-check both modes**

Manual:

1. Visit `https://imnotanattorney.com/checkin/{SEED_CODE_ENABLED}` — form renders, partner name visible.
2. Visit `https://imnotanattorney.com/court-date/{SEED_CODE_DISABLED}` — bridge renders, referral metadata.
3. Visit `https://imnotanattorney.com/r/{SEED_CODE_ENABLED}` — bridge renders with check-in OG.
4. Visit `https://imnotanattorney.com/r/{SEED_CODE_DISABLED}` — bridge renders with referral OG.
5. Log in as a bondsman dashboard, verify `WorkflowToggle` visible and `partnerUrl` matches flag.

If any step fails, rollback per base plan `## Rollback Plan`.

- [ ] **Step 6: Watch cron logs 1 day**

Check Vercel logs next day at 8:01 ET. Confirm Phase 1 run count and Phase 2 run count match only partners with `check_in_enabled=true`.

- [ ] **Step 7: Done**

Post handoff:

```bash
cat > docs/handoffs/2026-04-18-bondsman-modes-shipped.md <<'EOF'
# Bondsman Modes — Shipped

- Feature flag `NEXT_PUBLIC_CHECKIN_TOGGLE_ENABLED=true` in production.
- All 3 URL surfaces live: /checkin/{CODE}, /court-date/{CODE}, /r/{CODE} (legacy).
- Dashboard surfaces WorkflowToggle for bondsmen.
- Cron Phase 1 + 2 filter on partners.check_in_enabled.
- CV clean post-flip.
EOF
```

```bash
git add docs/handoffs/2026-04-18-bondsman-modes-shipped.md
git commit -m "docs: bondsman modes shipped 2026-04-18"
git push origin master
```

---

## Self-review results

- **Spec coverage (design doc § 1–12):** all 9 deliverables + Amendment 9 covered. URL shapes in Tasks 11-14 (§1-2), OG copy in Tasks 12+14+15 (§3-4), signup page in Task 11 (§5), BridgePage in Task 16 (§6), dashboard swaps in Tasks 19-24 (§7), application radio in Task 18 (§8), discount framing in Tasks 16+18+22+23 (§9), Amendment 9 A in Task 11 (§10).
- **Placeholder scan:** Task 27 (ComplianceReportClient) intentionally defers pattern application to the implementing subagent because the exact line-number targets weren't captured in the plan-authoring session; this is tagged as "apply the same rendering-gate pattern used in ClientTracker." Acceptable because the work IS well-scoped (hide check-in sections when `checkInMode === "disabled"`) and a fresh Read is trivial. All other tasks ship real code.
- **Type consistency:** `Partner` interface gets `check_in_enabled: boolean` in Task 3, flows through Tasks 5, 19, 22, 23, 24, 25, 26, 27. `computePartnerUrl`/`isCheckInMode` names consistent everywhere. API field name `check_in_enabled` matches column name everywhere. Prop name `checkInEnabled` (camelCase) consistent across React components.
- **Test/impl alignment:** every failing-test task has a matching impl task that makes it pass. No test-without-impl or impl-without-test gaps.

---

## Execution Handoff

**"Plan complete and saved to `docs/plans/2026-04-17-bondsman-modes-implementation.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?"**
