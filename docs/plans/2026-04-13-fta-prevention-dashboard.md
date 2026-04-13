# FTA Prevention Dashboard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform the partner dashboard from a referral tracker into a free FTA prevention tool that replaces $99/mo bail bond software. 5 features: client tracker, branded prep pages, FTA savings calculator, compliance docs, and one-tap client sharing.

**Architecture:** Extends existing partner dashboard (client component at `/partner/dashboard`) and API (`/api/partner/dashboard`). New `ClientTracker` component fetches court_reminders by partner_promo_code. Prep page adds partner company branding. Add-client form creates a court_reminders row directly from the dashboard. All data from existing `court_reminders` table — no new tables.

**Spec:** `C:\Users\email\projects\ImNotAnAttorney-web\docs\superpowers\specs\2026-04-12-court-reminders-platform-design.md`

---

## Task 1: API — Extend Dashboard Route with Client Data

**Files:**
- Modify: `src/app/api/partner/dashboard/route.ts`

- [ ] **Step 1: Add client list query**

After the existing `reminderSignups` count query (line ~41), add a full client list query:

```typescript
    // Court prep clients — full list for client tracker
    const { data: courtClients } = await supabase
      .from("court_reminders")
      .select("id, token, first_name, charge_type, county_state, court_date, status, reminders_sent, created_at, converted_at")
      .eq("partner_promo_code", partner.promo_code)
      .order("court_date", { ascending: true })
      .limit(100);
```

- [ ] **Step 2: Add to response**

Add `courtClients: courtClients || []` to the JSON response object alongside existing `reminderSignups`.

- [ ] **Step 3: Build + verify**

Run: `npx tsc --noEmit --skipLibCheck`

- [ ] **Step 4: Commit**

```bash
git add src/app/api/partner/dashboard/route.ts
git commit -m "feat(fta-dashboard): add client list to partner dashboard API"
```

---

## Task 2: Client Tracker Component

**Files:**
- Create: `src/components/partner/ClientTracker.tsx`

- [ ] **Step 1: Create the component**

```tsx
"use client";
/**
 * ClientTracker — FTA prevention dashboard for partners.
 *
 * Shows all clients who signed up through the partner's link with
 * court dates, reminder status, and conversion tracking. Replaces
 * the simple "Court prep sign-ups: N" counter.
 */

import { CHARGE_DISPLAY_NAMES } from "@/lib/court-reminders";

interface CourtClient {
  id: string;
  token: string;
  first_name: string;
  charge_type: string;
  county_state: string;
  court_date: string;
  status: string;
  reminders_sent: string[];
  created_at: string;
  converted_at: string | null;
}

interface ClientTrackerProps {
  clients: CourtClient[];
  onAddClient: () => void;
}

function daysUntil(dateStr: string): number {
  const court = new Date(dateStr + "T00:00:00");
  const now = new Date();
  return Math.ceil((court.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function statusBadge(status: string, daysLeft: number, converted: boolean) {
  if (converted) return { label: "Converted", color: "text-green-400 bg-green-400/10" };
  if (status === "completed") return { label: "Past", color: "text-zinc-500 bg-zinc-500/10" };
  if (status === "unsubscribed") return { label: "Unsubscribed", color: "text-zinc-500 bg-zinc-500/10" };
  if (daysLeft <= 1) return { label: "Tomorrow", color: "text-red-400 bg-red-400/10" };
  if (daysLeft <= 3) return { label: `${daysLeft}d`, color: "text-amber-400 bg-amber-400/10" };
  if (daysLeft <= 7) return { label: `${daysLeft}d`, color: "text-yellow-400 bg-yellow-400/10" };
  return { label: `${daysLeft}d`, color: "text-zinc-300 bg-zinc-700" };
}

function reminderProgress(sent: string[]): string {
  const total = 4; // 14d, 7d, 3d, 1d
  const count = sent.filter(k => k.startsWith("reminder_")).length;
  return `${count}/${total}`;
}

export function ClientTracker({ clients, onAddClient }: ClientTrackerProps) {
  const activeClients = clients.filter(c => c.status === "active");
  const upcomingThisWeek = activeClients.filter(c => {
    const d = daysUntil(c.court_date);
    return d >= 0 && d <= 7;
  });

  return (
    <section className="bg-zinc-900 rounded-xl border border-zinc-700 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold">Your Clients</h2>
        <button
          onClick={onAddClient}
          className="px-4 py-2 bg-amber-500 text-black font-bold rounded-lg text-sm hover:bg-amber-400 transition-colors cursor-pointer"
        >
          + Add Client
        </button>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
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
      </div>

      {clients.length === 0 ? (
        <p className="text-zinc-400 text-sm">
          No clients yet. When defendants use your link and sign up for court prep, they&apos;ll appear here.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-zinc-400 border-b border-zinc-700">
                <th className="pb-2 pr-4">Name</th>
                <th className="pb-2 pr-4">Charge</th>
                <th className="pb-2 pr-4">Court Date</th>
                <th className="pb-2 pr-4">Status</th>
                <th className="pb-2 pr-4">Reminders</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((c) => {
                const days = daysUntil(c.court_date);
                const badge = statusBadge(c.status, days, !!c.converted_at);
                const chargeName = CHARGE_DISPLAY_NAMES[c.charge_type] || c.charge_type;
                return (
                  <tr key={c.id} className="border-b border-zinc-800">
                    <td className="py-3 pr-4 text-white">{c.first_name}</td>
                    <td className="py-3 pr-4 text-zinc-300">{chargeName}</td>
                    <td className="py-3 pr-4 text-zinc-300">
                      {new Date(c.court_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </td>
                    <td className="py-3 pr-4">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${badge.color}`}>
                        {badge.label}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-zinc-400">{reminderProgress(c.reminders_sent)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Build + verify**

Run: `npx tsc --noEmit --skipLibCheck`

- [ ] **Step 3: Commit**

```bash
git add src/components/partner/ClientTracker.tsx
git commit -m "feat(fta-dashboard): client tracker component with status badges + reminder progress"
```

---

## Task 3: FTA Savings Calculator Component

**Files:**
- Create: `src/components/partner/FtaCalculator.tsx`

- [ ] **Step 1: Create the component**

```tsx
"use client";
/**
 * FTA Savings Calculator — shows partners the financial impact
 * of court reminders on their FTA rate.
 *
 * Based on research: court reminders reduce FTA by ~7%.
 * A single FTA costs the bondsman the full bail amount.
 */

import { useState } from "react";

export function FtaCalculator() {
  const [monthlyClients, setMonthlyClients] = useState(20);
  const [avgBail, setAvgBail] = useState(10000);

  // Industry average FTA rate: ~15% without reminders
  // With reminders: reduces by ~7 percentage points → ~8%
  const FTA_RATE_WITHOUT = 0.15;
  const FTA_REDUCTION = 0.07;
  const FTA_RATE_WITH = FTA_RATE_WITHOUT - FTA_REDUCTION;

  const annualClients = monthlyClients * 12;
  const ftaWithout = Math.round(annualClients * FTA_RATE_WITHOUT);
  const ftaWith = Math.round(annualClients * FTA_RATE_WITH);
  const ftaPrevented = ftaWithout - ftaWith;
  const savedAmount = ftaPrevented * avgBail;

  // Commission estimate (5% conversion at avg $197)
  const commissionEstimate = Math.round(annualClients * 0.05 * 197 * 0.1);

  return (
    <section className="bg-zinc-900 rounded-xl border border-zinc-700 p-6">
      <h2 className="text-xl font-bold mb-2">FTA Savings Calculator</h2>
      <p className="text-sm text-zinc-400 mb-6">
        See how court reminders protect your bottom line.
      </p>

      <div className="grid md:grid-cols-2 gap-4 mb-6">
        <div>
          <label htmlFor="monthlyClients" className="block text-sm text-zinc-300 mb-1">
            Clients per month
          </label>
          <input
            id="monthlyClients"
            type="number"
            min={1}
            max={500}
            value={monthlyClients}
            onChange={(e) => setMonthlyClients(Math.max(1, parseInt(e.target.value) || 1))}
            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:border-amber-500 focus:outline-none"
          />
        </div>
        <div>
          <label htmlFor="avgBail" className="block text-sm text-zinc-300 mb-1">
            Average bail amount ($)
          </label>
          <input
            id="avgBail"
            type="number"
            min={500}
            max={500000}
            step={500}
            value={avgBail}
            onChange={(e) => setAvgBail(Math.max(500, parseInt(e.target.value) || 500))}
            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:border-amber-500 focus:outline-none"
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="bg-zinc-800 rounded-lg p-4 text-center">
          <p className="text-3xl font-bold text-red-400">{ftaWithout}</p>
          <p className="text-xs text-zinc-400 mt-1">FTAs/year without reminders</p>
        </div>
        <div className="bg-zinc-800 rounded-lg p-4 text-center">
          <p className="text-3xl font-bold text-green-400">{ftaPrevented}</p>
          <p className="text-xs text-zinc-400 mt-1">FTAs prevented</p>
        </div>
        <div className="bg-zinc-800 rounded-lg p-4 text-center">
          <p className="text-3xl font-bold text-amber-400">${savedAmount.toLocaleString()}</p>
          <p className="text-xs text-zinc-400 mt-1">Estimated savings/year</p>
        </div>
      </div>

      <div className="mt-4 bg-zinc-800 rounded-lg p-4">
        <p className="text-sm text-zinc-300">
          <span className="text-amber-400 font-bold">Plus:</span> ~${commissionEstimate.toLocaleString()}/year in commission from clients who upgrade to case analysis.
        </p>
      </div>

      <p className="text-xs text-zinc-500 mt-3">
        Based on industry average 15% FTA rate and research showing court reminders reduce FTA by ~7 percentage points.
      </p>
    </section>
  );
}
```

- [ ] **Step 2: Build + verify**

Run: `npx tsc --noEmit --skipLibCheck`

- [ ] **Step 3: Commit**

```bash
git add src/components/partner/FtaCalculator.tsx
git commit -m "feat(fta-dashboard): FTA savings calculator with interactive inputs"
```

---

## Task 4: Add-Client API Route

**Files:**
- Create: `src/app/api/partner/add-client/route.ts`

- [ ] **Step 1: Create the route**

```typescript
/**
 * POST /api/partner/add-client — Partner adds a client manually.
 *
 * Creates a court_reminders row attributed to the partner.
 * Sends the client a sign-up confirmation email with their prep page link.
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePartnerAuth } from "@/lib/partner-helpers";
import { sendEmail, escapeHtml } from "@/lib/email";
import { SITE_URL } from "@/lib/site";
import { randomUUID } from "crypto";

interface AddClientBody {
  first_name: string;
  email: string;
  charge_type: string;
  county_state: string;
  court_date: string;
}

export async function POST(req: NextRequest) {
  const { partner, error: authError } = await requirePartnerAuth(req);
  if (authError) return authError;

  let body: AddClientBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { first_name, email, charge_type, county_state, court_date } = body;
  if (!first_name?.trim() || !email?.trim() || !charge_type?.trim() || !county_state?.trim() || !court_date?.trim()) {
    return NextResponse.json({ error: "All fields are required" }, { status: 400 });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
  }

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
    partner_promo_code: partner.promo_code,
  });

  if (insertErr) {
    console.error("[Partner Add Client] Insert error:", insertErr);
    return NextResponse.json({ error: "Failed to add client" }, { status: 500 });
  }

  // Send client their prep page link
  const prepUrl = `${SITE_URL}/prep/${token}`;
  const safeName = escapeHtml(first_name.trim());
  const safeCompany = escapeHtml(partner.company || partner.name);
  try {
    await sendEmail({
      to: email.trim().toLowerCase(),
      subject: "Your court prep page is ready",
      html: `
        <h1 style="color: #F59E0B; font-size: 24px; margin: 0 0 16px;">Your court prep is set up, ${safeName}.</h1>
        <p style="color: #D4D4D8; font-size: 15px; line-height: 1.6;">${safeCompany} set this up for you. We'll send you reminders before your court date so you don't miss anything.</p>
        <p style="color: #D4D4D8; font-size: 15px; line-height: 1.6;">Your personalized prep page — what to expect, what to bring, and how to prepare:</p>
        <p style="margin: 24px 0;"><a href="${prepUrl}" style="display: inline-block; background: #F59E0B; color: #0C0A09; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 700;">View Your Court Prep</a></p>
        <p style="color: #71717A; font-size: 13px;">Bookmark this link — it's yours. We'll also include it in every reminder email.</p>
      `,
    });
  } catch (e) {
    console.warn("[Partner Add Client] Email failed:", e);
  }

  return NextResponse.json({ token, prepUrl });
}
```

- [ ] **Step 2: Build + verify**

Run: `npx tsc --noEmit --skipLibCheck`

- [ ] **Step 3: Commit**

```bash
git add src/app/api/partner/add-client/route.ts
git commit -m "feat(fta-dashboard): add-client API route for manual client entry"
```

---

## Task 5: Add-Client Modal Component

**Files:**
- Create: `src/components/partner/AddClientModal.tsx`

- [ ] **Step 1: Create the component**

```tsx
"use client";
/**
 * Modal for partners to manually add a client.
 * 5 fields: name, email, charge type, county/state, court date.
 * Submits to /api/partner/add-client.
 */

import { useState } from "react";
import { CHARGE_DISPLAY_NAMES } from "@/lib/court-reminders";

interface AddClientModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const CHARGE_OPTIONS = Object.entries(CHARGE_DISPLAY_NAMES).map(([slug, label]) => ({ slug, label }));

export function AddClientModal({ open, onClose, onSuccess }: AddClientModalProps) {
  const [firstName, setFirstName] = useState("");
  const [email, setEmail] = useState("");
  const [chargeType, setChargeType] = useState("");
  const [countyState, setCountyState] = useState("");
  const [courtDate, setCourtDate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const res = await fetch("/api/partner/add-client", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name: firstName,
          email,
          charge_type: chargeType,
          county_state: countyState,
          court_date: courtDate,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Something went wrong");
        setSubmitting(false);
        return;
      }

      // Reset form + close
      setFirstName(""); setEmail(""); setChargeType(""); setCountyState(""); setCourtDate("");
      setSubmitting(false);
      onSuccess();
      onClose();
    } catch {
      setError("Connection error");
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-zinc-900 border border-zinc-700 rounded-xl p-6 max-w-md w-full mx-4"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Add a client"
      >
        <h3 className="text-lg font-bold text-amber-400 mb-4">Add a Client</h3>
        <p className="text-sm text-zinc-400 mb-4">
          We&apos;ll send them a court prep page and reminder emails automatically.
        </p>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input type="text" required placeholder="Client first name" value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:border-amber-500 focus:outline-none text-sm"
            aria-label="Client first name" />
          <input type="email" required placeholder="Client email" value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:border-amber-500 focus:outline-none text-sm"
            aria-label="Client email" />
          <select required value={chargeType} onChange={(e) => setChargeType(e.target.value)}
            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:border-amber-500 focus:outline-none text-sm"
            aria-label="Charge type">
            <option value="">Charge type</option>
            {CHARGE_OPTIONS.map(o => <option key={o.slug} value={o.slug}>{o.label}</option>)}
          </select>
          <input type="text" required placeholder="County & State (e.g. Pinellas County, FL)" value={countyState}
            onChange={(e) => setCountyState(e.target.value)}
            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:border-amber-500 focus:outline-none text-sm"
            aria-label="County and state" />
          <input type="date" required value={courtDate} min={new Date().toISOString().split("T")[0]}
            onChange={(e) => setCourtDate(e.target.value)}
            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:border-amber-500 focus:outline-none text-sm"
            aria-label="Court date" />

          {error && <p className="text-red-400 text-sm" role="alert">{error}</p>}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-2 border border-zinc-600 text-zinc-300 rounded-lg text-sm hover:border-zinc-500 cursor-pointer">
              Cancel
            </button>
            <button type="submit" disabled={submitting}
              className="flex-1 px-4 py-2 bg-amber-500 text-black font-bold rounded-lg text-sm hover:bg-amber-400 disabled:opacity-50 cursor-pointer">
              {submitting ? "Adding..." : "Add Client"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Build + verify**

Run: `npx tsc --noEmit --skipLibCheck`

- [ ] **Step 3: Commit**

```bash
git add src/components/partner/AddClientModal.tsx
git commit -m "feat(fta-dashboard): add-client modal component"
```

---

## Task 6: Branded Prep Page

**Files:**
- Modify: `src/app/prep/[token]/page.tsx`

- [ ] **Step 1: Add partner company branding**

Read the prep page. Find the countdown section (Section A). Before the countdown, add partner branding when `partner_promo_code` exists.

Query the partner's company name from the partners table:

```typescript
// After fetching the reminder, look up partner company name
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

Then in the JSX, before the countdown section, add:

```tsx
{partnerCompany && (
  <p className="text-zinc-500 text-sm text-center mb-4">
    Court prep provided by {partnerCompany} — powered by ImNotAnAttorney
  </p>
)}
```

- [ ] **Step 2: Build + verify**

Run: `npx tsc --noEmit --skipLibCheck`

- [ ] **Step 3: Commit**

```bash
git add src/app/prep/\[token\]/page.tsx
git commit -m "feat(fta-dashboard): branded prep page with partner company name"
```

---

## Task 7: Wire Everything into Dashboard

**Files:**
- Modify: `src/app/partner/dashboard/page.tsx`

- [ ] **Step 1: Add imports and state**

Add imports at the top:
```typescript
import { ClientTracker } from "@/components/partner/ClientTracker";
import { FtaCalculator } from "@/components/partner/FtaCalculator";
import { AddClientModal } from "@/components/partner/AddClientModal";
```

Add state:
```typescript
const [courtClients, setCourtClients] = useState<CourtClient[]>([]);
const [showAddClient, setShowAddClient] = useState(false);
```

Add the CourtClient interface near the other interfaces:
```typescript
interface CourtClient {
  id: string;
  token: string;
  first_name: string;
  charge_type: string;
  county_state: string;
  court_date: string;
  status: string;
  reminders_sent: string[];
  created_at: string;
  converted_at: string | null;
}
```

- [ ] **Step 2: Wire data fetching**

In `fetchDashboard`, add after existing `setReminderSignups`:
```typescript
setCourtClients(data.courtClients || []);
```

- [ ] **Step 3: Replace simple counter with Client Tracker**

Replace the existing court prep sign-ups stat card:
```tsx
{/* Court prep sign-ups stat */}
<div className="bg-zinc-900 rounded-xl border border-zinc-700 p-4">
  <p className="text-sm text-zinc-400">Court prep sign-ups</p>
  <p className="text-2xl font-bold">{reminderSignups}</p>
</div>
```

With the full Client Tracker + FTA Calculator + Add Client Modal:
```tsx
{/* Client Tracker — FTA Prevention Dashboard */}
<ClientTracker
  clients={courtClients}
  onAddClient={() => setShowAddClient(true)}
/>

{/* FTA Savings Calculator */}
<FtaCalculator />

{/* Add Client Modal */}
<AddClientModal
  open={showAddClient}
  onClose={() => setShowAddClient(false)}
  onSuccess={() => fetchDashboard()}
/>
```

- [ ] **Step 4: Build + verify**

Run: `npx next build 2>&1 | tail -5`

- [ ] **Step 5: Commit**

```bash
git add src/app/partner/dashboard/page.tsx
git commit -m "feat(fta-dashboard): wire client tracker + FTA calculator + add-client modal into dashboard"
```

---

## Task 8: Update Landing Page Pitch

**Files:**
- Modify: `src/app/partners/bondsman/page.tsx`

- [ ] **Step 1: Update hero and value props**

Update the hero subtitle to lead with FTA prevention:
```
"Free FTA prevention for your bond company. Court reminders + defendant prep — something other companies charge $99/month for."
```

Update the first value prop item to:
```
{ title: "Free FTA Prevention", desc: "Your clients get court date reminders and hearing prep automatically. Reduce your FTA rate — protect your bottom line." }
```

- [ ] **Step 2: Build + verify**

Run: `npx next build 2>&1 | tail -5`

- [ ] **Step 3: Commit**

```bash
git add src/app/partners/bondsman/page.tsx
git commit -m "feat(fta-dashboard): update bondsman page pitch — FTA prevention positioning"
```

---

## Task 9: Deploy + E2E Verify

- [ ] **Step 1: Full build**

Run: `npx next build 2>&1 | tail -5`

- [ ] **Step 2: Run tests**

```bash
npx vitest run tests/court-reminders.test.ts
npx playwright test e2e/court-reminders.spec.ts
```

- [ ] **Step 3: Push to deploy**

```bash
git push origin master
```

- [ ] **Step 4: Run CV**

```bash
node ~/projects/continuous-verification/verify.mjs --project inna --probe-only --no-trends
```
