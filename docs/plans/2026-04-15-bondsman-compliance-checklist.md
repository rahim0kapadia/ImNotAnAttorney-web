# Bondsman Compliance Checklist — Implementation Plan

**Handoff:** `C:\Users\email\projects\ImNotAnAttorney-web\docs\handoffs\2026-04-15-partner-checklist-and-sms-monitoring.md`
**Tech stack:** Next.js 15 App Router, Supabase, Tailwind CSS, `qrcode` npm package
**Deploy:** `git push origin master` (Vercel auto-deploy)

---

## Context

Bondsmen need a printable 8.5×11" compliance checklist to hand defendants at the jail desk. Currently `/partner/card` is a pitch card (QR code + promo code + sales copy). The checklist replaces this for bondsman partners — it's the actual document a bondsman gives every client at bonding, covering bail conditions, check-in enrollment, and emergency contacts.

The existing `/partner/card` stays for non-bondsman partners (generic referral insert). Bondsman partners get routed to the compliance checklist instead. `partners.source` column already shipped (commit `e2b8fad`).

**Expert framework:** McWilliams activation applied through INAA crisis-buyer lens. The checklist IS the activation artifact — bondsmen who hand it to every client are activated partners. The checklist must be useful INDEPENDENT of INAA (bail conditions, court date, contact info) so bondsmen hand it out regardless. INAA check-in enrollment rides along as a value-add, not the primary purpose.

**Total:** 2 new files, 3 modified files. No migration needed.

---

## Key Decisions

1. **Route: `/partner/checklist` (new page), NOT replacing `/partner/card`.** The card and checklist serve different purposes. Card = marketing insert for generic partners. Checklist = compliance document for bondsmen. Bondsman partners see the checklist link on their dashboard; generic partners see the card link. Both pages stay.

2. **Partner-type routing on dashboard, not on card/checklist pages themselves.** The dashboard conditionally renders either the "Bail Packet Insert" link (→ `/partner/card`) or the "Compliance Checklist" link (→ `/partner/checklist`) based on `partner.source === "bondsman"`. Both pages remain directly accessible by URL for any authenticated partner — no gate on the page itself.

3. **QR code points to `/r/[code]/reminders`, NOT `/r/[code]`.** The card's QR goes to the quiz funnel. The checklist's QR goes straight to court reminder signup — defendants who just bailed out need check-in enrollment, not a quiz. The reminder page already validates partner promo codes and renders `CourtReminderForm`.

4. **Inline styles for print reliability.** Same pattern as `/partner/card` — all layout via inline styles, not Tailwind, because Tailwind classes are unreliable across print drivers. Tailwind `print:hidden` / `hidden print:block` only for show/hide toggles.

5. **Pen-fillable blanks sized for handwriting (4× print text height).** Print text is 12pt (~16px). Pen-fill blanks must be 48pt (~64px) tall — enough for messy jail-desk handwriting. Pattern: `border-bottom: 1.5px solid #d4d4d8` with `min-height: 48pt` (or `0.67in`) and `line-height: 48pt` so the baseline sits on the underline. Labels (e.g., "DEFENDANT:", "COURT DATE:") print at 10pt above the blank, not inline — stacked layout gives full line width for writing.

6. **Bondsman emergency contact auto-filled.** Partner's phone number from profile fills the "Bondsman Emergency Contact" line. If no phone on file, renders as blank pen-fillable line with "(update in dashboard)" note.

7. **No new API endpoint needed.** Checklist page fetches `/api/partner/dashboard` same as card page — partner profile already includes `phone`, `company`, `city`, `promo_code`, `source`. The `partner-auth.ts` `validatePartnerSession()` already selects `source`.

---

## Schemas Involved

No new tables or columns. Uses existing `partners` fields:
- `source` (text) — "bondsman" triggers checklist routing
- `phone` (text) — auto-fills emergency contact line
- `company` (text) — header co-branding
- `city` (text) — header co-branding
- `promo_code` (text) — QR code URL + displayed code

**SCHEMA.md update needed:** `partners.source`, `partners.city`, `partners.region` columns exist in DB but are undocumented. Add them.

---

## Implementation Phases

### Phase 1: Checklist Page (new file)

**File:** `src/app/partner/checklist/page.tsx` (~350 lines)

Create new page following `/partner/card` architecture exactly:
- `"use client"` (needs `useEffect`, `useState`, `useRouter`, dynamic QR import)
- Fetch partner from `/api/partner/dashboard`, redirect to `/partner/login` on 401
- Generate QR via dynamic `import("qrcode")` — URL: `https://imnotanattorney.com/r/{promo_code}/reminders`
- Dual render: screen preview wrapper (`print:hidden`) + print-only block (`hidden print:block`)
- Same print `<style>` block (`@page { size: letter; margin: 0 }`, `print-color-adjust: exact`)

**Page layout (8.5×11" letter):**

Pen-fill blanks = 48pt tall (4× the 12pt print text). Labels sit ABOVE blanks (stacked), not inline — gives full line width for handwriting. Two-column layout where fields are short (date + time, amount + due).

```
┌──────────────────────────────────────────────┐
│  [Company Name, City]                        │  ← Co-branded header
│  BAIL CONDITIONS CHECKLIST                   │
│  ──────────────────────────                  │
│                                              │
│  DEFENDANT NAME                              │  ← 10pt label
│  ____________________________________________│  ← 48pt tall blank (full width)
│                                              │
│  CASE NUMBER                                 │
│  ____________________________________________│  ← 48pt blank
│                                              │
│  COURT DATE          TIME                    │  ← Two-column labels
│  __________________  ________________________│  ← 48pt blanks side by side
│                                              │
│  COURTHOUSE / ADDRESS                        │
│  ____________________________________________│  ← 48pt blank
│                                              │
│  YOUR BAIL CONDITIONS                        │
│  ☐ Do not leave jurisdiction without         │  ← 18px checkbox squares
│    written permission from bondsman          │
│  ☐ Report any address/phone changes          │
│    within 24 hours                           │
│  ☐ No new arrests while on bail              │
│  ☐ Attend ALL scheduled court dates          │
│  ☐ Follow all court-ordered conditions       │
│  ☐ Keep co-signer informed of changes        │
│                                              │
│  ADDITIONAL CONDITIONS                       │
│  1. _________________________________________│  ← 48pt blanks
│  2. _________________________________________│
│  3. _________________________________________│
│                                              │
│  PAYMENT SCHEDULE                            │
│  AMOUNT              DUE DATE                │  ← Two-column labels
│  $_________________  ________________________│  ← 48pt blanks
│  $_________________  ________________________│
│                                              │
│  ┌────────────────────────────────────────┐  │
│  │  FREE COURT REMINDERS                  │  │
│  │  Never miss a court date.              │  │
│  │  [QR CODE]   imnotanattorney.com       │  │
│  │              /r/{code}/reminders       │  │
│  │                                        │  │
│  │  CHECK-IN DAYS                         │  │
│  │  _____________________________________│  │  ← 48pt blank
│  └────────────────────────────────────────┘  │
│                                              │
│  IMPORTANT CONTACTS                          │
│  BONDSMAN            ATTORNEY / PD OFFICE    │  ← Two-column
│  [auto-filled phone] ________________________│  ← 48pt blank for attorney
│                                              │
│  [Company] · imnotanattorney.com             │
│  Legal Information — Not Legal Advice        │
└──────────────────────────────────────────────┘
```

**Screen toolbar:** "Back to Dashboard" + "Print Checklist" buttons (same as card pattern).

**Design constraints:**
- Print text 12pt minimum (readable in jail lighting)
- Pen-fill blanks 48pt tall with `border-bottom: 1.5px solid #d4d4d8` — labels 10pt, stacked above
- Checkboxes 18px squares (pen-markable)
- QR code section visually distinct (light gray background box) but not dominant — compliance items first
- Footer: UPL-compliant "Legal Information — Not Legal Advice"
- No INAA branding except in reminders box and footer — checklist is the bondsman's document

### Phase 2: Dashboard Routing

**File:** `src/app/partner/dashboard/page.tsx` (modify ~10 lines)

Replace the static "Bail Packet Insert" `<Link>` block (lines 196-208) with conditional rendering:

```tsx
{partner.source === "bondsman" ? (
  <Link href="/partner/checklist" className="block bg-zinc-900 rounded-xl border border-zinc-700 p-4 hover:border-amber-500/50 transition-colors group">
    <div className="flex items-center justify-between">
      <div>
        <h3 className="font-bold text-amber-400 mb-1">Compliance Checklist</h3>
        <p className="text-sm text-zinc-400">Print a bail conditions checklist with court reminders. Hand to every client at bonding.</p>
      </div>
      <span className="text-zinc-500 group-hover:text-amber-400 transition-colors text-xl">&rarr;</span>
    </div>
  </Link>
) : (
  <Link href="/partner/card" className="block bg-zinc-900 rounded-xl border border-zinc-700 p-4 hover:border-amber-500/50 transition-colors group">
    <div className="flex items-center justify-between">
      <div>
        <h3 className="font-bold text-amber-400 mb-1">Bail Packet Insert</h3>
        <p className="text-sm text-zinc-400">Print a full-page insert with your QR code. Drop it in every bail packet.</p>
      </div>
      <span className="text-zinc-500 group-hover:text-amber-400 transition-colors text-xl">&rarr;</span>
    </div>
  </Link>
)}
```

The dashboard already receives `partner.source` from the API (via `partner-auth.ts` line 151).

### Phase 3: Partner Drip Email Update

**File:** `src/lib/partner-emails.ts` (modify ~5 lines)

Day 1 "First Share" email (key: `first_share`) currently says "Print your referral URL as a QR code on your business card." For bondsman partners, this should reference the compliance checklist instead.

Add partner `source` to the email builder context (it's already available on the partner object passed to the drip cron). Conditional copy:

- **Bondsman:** "Print your Compliance Checklist and hand it to every client at bonding → [dashboard link]"
- **Other:** Keep existing copy

This is a minor text swap in the `first_share` template, not a structural change.

### Phase 4: Schema Docs + Verification

**File:** `supabase/SCHEMA.md` (modify ~5 lines)

Add missing columns to `partners` table documentation:
```
| city | text | Partner city (from application) |
| region | text | Partner region/state (from application) |
| source | text | Partner type: `bondsman`, `attorney`, `generic`, or null |
| last_activation_email_key | text | Last drip email sent (cron dedup) |
```

**Verification:**
1. `npx tsc --noEmit --skipLibCheck` — clean
2. `npx vitest run` — all pass
3. Manual: log in as bondsman partner → dashboard shows "Compliance Checklist" link → checklist renders → print produces clean 8.5×11" page
4. Manual: log in as non-bondsman partner → dashboard shows "Bail Packet Insert" link → card renders as before

---

## Files Changed

| File | Action | Lines |
|------|--------|-------|
| `src/app/partner/checklist/page.tsx` | **NEW** | ~350 |
| `src/app/partner/dashboard/page.tsx` | MODIFY | ~10 (conditional link) |
| `src/lib/partner-emails.ts` | MODIFY | ~5 (bondsman copy variant) |
| `supabase/SCHEMA.md` | MODIFY | ~5 (document missing columns) |

**No migration.** No new API routes. No new npm dependencies (`qrcode` already installed).

---

## What This Does NOT Cover

- **Non-bondsman checklist variants** (attorney partners, generic partners) — design later when partner types diversify
- **Per-defendant pre-filled checklists** — requires auth tokens per defendant, scope creep. Pen-fill is the right UX for jail desk speed.
- **PDF generation** — browser print-to-PDF is sufficient. Native PDF adds a dependency for zero UX gain.
- **Checklist tracking/analytics** — no way to know if a printed page was handed out. Check-in enrollment IS the tracking signal.
