# FTA Prevention Platform v2 — Data-Driven Prep + Compliance Reports

## Problem

The free court prep page gives generic advice ("dress nice, arrive early") that a bondsman would never brag about sharing. Bondsmen need two things to justify using our platform:
1. **Client-facing:** Content so useful it makes the bondsman look like they went above and beyond
2. **Surety-facing:** Documentation proving systematic defendant management for twice-yearly audits

## Solution: Approach B+

Transform the prep page from generic logistics into a data-driven defendant briefing using aggregate data we already have. Add check-ins, indemnitor notifications, and a downloadable compliance report for surety audits.

**Free vs. paid line:** Aggregate statistics = free. Case-specific analysis = paid. Same model as Zillow (neighborhood stats free, property valuation paid).

## Expert Frameworks Applied

- **Hormozi (Value Equation):** Free content maximizes perceived likelihood (data-driven stats give concrete frame) while minimizing effort (one page, no research needed). "If THIS is free, what do I get for $197?"
- **Suby (HVCO):** Give away so much value that defendants feel obligated to buy case-specific analysis.
- **Godin (Purple Cow):** A free prep page with real statistics and insider tips IS remarkable. Nobody does this.
- **Brunson (Value Ladder):** Bottom rung demonstrates competence so dramatically the upsell sells itself.

## Cascade Check

- **Bondsman:** Looks professional to clients + has audit documentation for surety → better surety relationship → higher bond limits → more business
- **Defendant:** Gets actually useful prep content + someone actively tracking their court date + data-driven context for their charge
- **Surety company:** Better visibility into agent management practices, reduced FTA risk
- **Us:** Distribution channel + conversion funnel + defendant behavior data
- **Future-us:** Network effects — more bondsmen = more defendants = more conversion data

---

## Feature 1: Enhanced Prep Page Content

### What changes

Replace the generic `CourtPrepContent` (currently 4-5 sentences per section) with data-driven sections that query our aggregate tables at render time.

### Content sections (new)

**Section: "The Reality of Your Hearing"** (replaces "What to Expect")
Insider tips sourced from criminal defense attorney blogs, academic research, and court self-help guides:
- The cattle call: "Your summons says 9 AM. You'll sit for 2-4 hours while 40+ other cases go first. Bring something to read."
- Meeting your attorney: "If you have a public defender, you'll likely meet them for the first time minutes before your hearing. This is normal — they're assigned at arraignment."
- The sequence: Charges read → plea entered (almost always 'not guilty' at arraignment) → bail addressed → next date set. Your part takes 5-10 minutes.
- What NOT to do: "Do NOT 'explain what happened' to the judge. This is how people accidentally confess on the record. Your first appearance is about not hurting yourself, not proving innocence."
- Demeanor research: "Judges observe everything from the moment you walk in. Duke University research shows in-court demeanor is the #1 factor judges can't quantify. Don't cry — judges view it as manipulative. Don't make excuses. Quiet composure signals you take it seriously."

**Section: "What Can Get You Arrested at the Courthouse"** (replaces "What to Wear")
- Showing up under the influence or smelling like alcohol — clients have been taken into custody on the spot
- Anything illegal through security (metal detectors, bag search — TSA-style)
- Don't bring children — not allowed in courtroom, no childcare
- Don't bring food or beverages
- Dress: business casual or better. Courts notice. Not for fashion — it signals you take the process seriously.

**Section: "Before You Go"** (replaces "What to Bring")
- Government-issued photo ID
- Bond paperwork
- Any documents your attorney asked for
- Pen and notepad — you WILL want to write things down
- Charge your phone but check county rules — some courtrooms ban phones entirely
- Arrange childcare and clear your entire day — you may wait until afternoon
- Do NOT post about your case on social media. Prosecutors scour Facebook, Instagram, YouTube. Posts are permanent evidence.

**Section: "Your Charge in [State]"** (NEW — data-driven)
Queries `jurisdiction_statutes` by `charge_type` + parsed state code from `county_state`:
- Statute: [statute_number] — [statute_title]
- Offense class: [offense_class]
- Penalty range: [penalty_min] to [penalty_max]
- Fine: up to $[fine_max]
- Mandatory minimum: [yes/no + details]
- Elements the prosecution must prove: [elements array, bulleted]

**Section: "What Typically Happens in Cases Like Yours"** (NEW — data-driven)
Queries `outcome_benchmarks` by offense type + `sentencing_distributions` by charge+jurisdiction:
- [X]% of [charge_type] cases result in a plea deal
- [X]% result in dismissal
- [X]% go to trial
- Median sentence: [X] months [probation/incarceration]
- Bench vs. jury: [bench_acquittal_rate]% vs [jury_acquittal_rate]% acquittal rate (from `bench_jury_divergence`, district-level USSC data)

Framing: "These are aggregate statistics from public court records — not a prediction for your case. Every case is different. But knowing what typically happens helps you have informed conversations with your attorney."

**Section: "Common Defense Approaches"** (NEW — data-driven)
Queries `jurisdiction_statutes.common_defenses` + `jurisdiction_statutes.defense_opportunities`:
- Bulleted list of defense categories (e.g., "Challenging the traffic stop," "Rising blood alcohol defense," "Testing procedure errors")
- NO case-specific application. NO "you should do X." Just: "These are the defense categories attorneys commonly explore for this charge type."
- Framing: "Ask your attorney which of these apply to your situation."

**Section: "Questions to Ask Your Attorney"** (NEW — general, not case-specific)
5-7 universal questions sourced from Gideon's Soldiers and criminal defense attorney guides:
- How much experience do you have with [charge_type] cases?
- What is your strategy — are we looking at a plea or going to trial?
- What discovery have you received from the prosecution?
- What motions do you plan to file, and on what timeline?
- What's the realistic range of outcomes for my case?
- When is the next court date and what will happen?
- The Supreme Court requires attorneys communicate ALL plea offers — have any been made?

**Section: "What Happens Next"** (NEW — educational)
- Arraignment → Pretrial conferences (discovery, plea negotiations) → Preliminary hearing (felonies only) → Trial → Sentencing
- "Most cases are NOT resolved at the first hearing. Expect multiple court dates over several months. This is normal."
- "Cases set for trial may be continued (rescheduled) multiple times. Nationally, pending criminal cases jumped from 383,879 (2019) to 546,727 (2021)."

### Data query architecture

The prep page (`src/app/prep/[token]/page.tsx`) is a Server Component. It already queries `court_reminders` by token. Add queries to:
- `jurisdiction_statutes` — filter by `common_charge_slug` matching `charge_type` + `jurisdiction` matching parsed state code
- `outcome_benchmarks` — filter by `offense_type` matching charge category
- `sentencing_distributions` — filter by `charge_slug` + `jurisdiction`, WHERE `judge_id IS NULL` (aggregate, not judge-specific)
- `bench_jury_divergence` — filter by district/jurisdiction, use USSC-level data only (not judge-specific)

**Parsing state from `county_state`:** The field stores "Pinellas County, FL". Parse state code: `county_state.split(',').pop().trim()` → "FL". Map to full jurisdiction code if needed.

**Graceful degradation:** If no data found for charge+state combo, fall back to the insider tips only (still way better than current "dress nice" content). Each data section renders only if data exists. No empty sections.

### What stays paid

- Judge-specific patterns (suppression grant rate, magic words, pet peeves, philosophy)
- Prosecutor-specific tendencies (judge×prosecutor pairings, motion grant rates)
- Case-specific questions derived from defendant's facts
- Discovery analysis, trap motions, officer reliability
- Anything from `judge_profiles` intelligence columns

### Files affected

- `src/lib/court-reminders.ts` — rewrite `CourtPrepContent` interface + content. Add data-driven section types.
- `src/app/prep/[token]/page.tsx` — add Supabase queries for aggregate data. Render new sections.
- New: `src/lib/prep-content.ts` — insider tips content (separated from court-reminders.ts to keep it focused). Static content arrays for the non-data-driven sections.
- New: `src/lib/prep-data.ts` — query functions for aggregate data (jurisdiction_statutes, outcome_benchmarks, sentencing_distributions, bench_jury_divergence). Handles graceful degradation.

---

## Feature 2: Defendant Check-Ins

### How it works

1. Defendant visits their prep page (which they already do via reminder emails)
2. A "Check In" button appears at the top of the page
3. Defendant taps it → browser requests geolocation permission → captures lat/lng + timestamp
4. Check-in recorded in `client_check_ins` table
5. Bondsman sees check-in history on partner dashboard (ClientTracker component)

### UX states for CheckInButton

- **Default:** "Check In" button (amber, prominent)
- **Requesting location:** "Locating..." spinner (browser permission prompt appears)
- **Permission denied:** "Check-in recorded (no location)" — still records timestamp + IP
- **Success:** "Checked in at [time]" with green checkmark, button disabled for 12 hours
- **Already checked in today:** Show last check-in time, button disabled
- **Error:** "Check-in failed — try again" with retry

### Schema

```sql
CREATE TABLE client_check_ins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  court_reminder_id uuid NOT NULL REFERENCES court_reminders(id),
  checked_in_at timestamptz NOT NULL DEFAULT now(),
  latitude double precision,
  longitude double precision,
  accuracy_meters double precision,
  method text NOT NULL DEFAULT 'web', -- 'web' for now, 'sms' later
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_check_ins_reminder ON client_check_ins(court_reminder_id);
```

No IP address or user agent storage — unnecessary for compliance purposes and raises privacy concerns.

### Check-in frequency

Bondsman doesn't configure this. Default: one check-in allowed per 12-hour window. The check-in button appears every time the defendant visits the prep page. The compliance report counts total check-ins.

### Files

- New: `src/components/partner/CheckInButton.tsx` — client component (~80 lines)
- New: `src/app/api/check-in/route.ts` — POST endpoint, validates token, records check-in (~50 lines)
- Modified: `src/app/prep/[token]/page.tsx` — import + render CheckInButton
- Modified: `src/components/partner/ClientTracker.tsx` — show last check-in date + count per client
- Modified: `src/app/api/partner/dashboard/route.ts` — join check-in data (last check-in date, total count)
- Migration: `supabase/migrations/2026XXXX_client_check_ins.sql`

---

## Feature 3: Indemnitor Notifications

### How it works

When a bondsman adds a client via the AddClientModal, they can optionally enter the indemnitor (co-signer) name and email. The indemnitor receives the same court date reminder emails as the defendant, with slightly different copy ("Your co-signer [first_name]'s court date is in [X] days").

### Schema change

```sql
ALTER TABLE court_reminders ADD COLUMN IF NOT EXISTS indemnitor_name text;
ALTER TABLE court_reminders ADD COLUMN IF NOT EXISTS indemnitor_email text;
```

### Email approach

Separate emails (not CC) because:
- Indemnitor needs different copy ("your co-signer's court date")
- Each person should be able to unsubscribe independently (future)
- Simpler to track delivery per recipient

For v1: same email template, just swap "Your court date" → "Your co-signer [first_name]'s court date". Add one `sendEmail()` call in the reminder cron when `indemnitor_email` is present.

### Files

- Modified: `src/components/partner/AddClientModal.tsx` — add 2 optional fields (indemnitor name, indemnitor email)
- Modified: `src/app/api/partner/add-client/route.ts` — accept + insert indemnitor fields
- Modified: `src/app/api/cron/court-reminders/route.ts` — add second `sendEmail()` when indemnitor_email present
- Modified: `src/lib/court-reminders.ts` — update CourtReminder interface
- Migration: `supabase/migrations/2026XXXX_indemnitor_fields.sql`

---

## Feature 4: Compliance Report

### What it generates

A print-optimized HTML page (no new dependencies) at `/partner/compliance-report` that the bondsman can print to PDF or save. Styled with `@media print` CSS.

### Report contents

**Header:**
- Partner company name + agent name
- Report period (selectable: last 30 days, last 90 days, Q1/Q2/Q3/Q4, custom range)
- Generated date
- "Defendant Management Report — [Period]"

**Summary stats:**
- Total defendants under management: [N]
- Active defendants (upcoming court dates): [N]
- Completed (court date passed): [N]
- Court date reminders sent: [total count across all clients]
- Defendant check-ins recorded: [total count]
- Check-in compliance rate: [clients with 1+ check-in / total clients]%
- FTA rate: 0% (or calculated from status if we track FTAs later)
- Conversions to paid analysis: [N]

**Per-defendant table:**

| Name | Charge | Court Date | Status | Reminders Sent | Check-Ins | Last Check-In |
|------|--------|------------|--------|---------------|-----------|---------------|
| (first_name only — no last name stored) | DUI | May 15, 2026 | Active | 3/4 | 5 | Apr 12, 2026 |

**Footer:**
- "Report generated by ImNotAnAttorney Court Prep Platform"
- "This report documents court date reminder delivery and defendant check-in compliance."
- Partner promo code for reference

### Approach: HTML print page (zero new dependencies)

A server-rendered page at `/partner/compliance-report` with:
- `@media print` CSS for clean PDF output
- `@media screen` CSS for on-screen preview
- Print button that calls `window.print()`
- Date range selector (client-side state)

This mirrors the existing `PrintButton.tsx` pattern at `src/app/report/[token]/PrintButton.tsx`.

### Auth

Same `requirePartnerAuth()` used by the dashboard. Session cookie validates the partner.

### Files

- New: `src/app/partner/compliance-report/page.tsx` — server component, queries data, renders print-optimized HTML (~150 lines)
- New: `src/components/partner/ComplianceReportButton.tsx` — link/button on dashboard (~15 lines)
- Modified: `src/app/partner/dashboard/page.tsx` — add ComplianceReportButton

---

## Feature 5: Enhanced Partner Branding

### What changes

The prep page already shows "Court prep provided by {company} — powered by ImNotAnAttorney" (added in the FTA dashboard build). Enhance this to feel more like the bondsman's own tool:

- Move branding from small text to a proper header bar
- Show partner company name prominently
- Add "Provided by [Company]" in reminder emails too (currently emails don't mention the partner)
- The compliance report header uses the partner's company name prominently

### Files

- Modified: `src/app/prep/[token]/page.tsx` — upgrade branding section
- Modified: `src/lib/court-reminder-emails.ts` — add partner company name to email templates (query partners table when partner_promo_code present)

---

## Schema Changes Summary

One migration file:

```sql
-- 1. Client check-ins table
CREATE TABLE client_check_ins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  court_reminder_id uuid NOT NULL REFERENCES court_reminders(id),
  checked_in_at timestamptz NOT NULL DEFAULT now(),
  latitude double precision,
  longitude double precision,
  accuracy_meters double precision,
  method text NOT NULL DEFAULT 'web',
  created_at timestamptz DEFAULT now()
);
CREATE INDEX idx_check_ins_reminder ON client_check_ins(court_reminder_id);

-- 2. Indemnitor fields
ALTER TABLE court_reminders ADD COLUMN IF NOT EXISTS indemnitor_name text;
ALTER TABLE court_reminders ADD COLUMN IF NOT EXISTS indemnitor_email text;

-- 3. Last name for future re-arrest monitoring (backlog)
ALTER TABLE court_reminders ADD COLUMN IF NOT EXISTS last_name text;
```

Adding `last_name` now (optional field) even though re-arrest monitoring is backlogged — avoids a future migration and lets the AddClientModal collect it.

---

## Files Summary

| Category | File | Action |
|----------|------|--------|
| Prep content | `src/lib/prep-content.ts` | NEW — insider tips static content |
| Prep data | `src/lib/prep-data.ts` | NEW — aggregate data query functions |
| Prep page | `src/app/prep/[token]/page.tsx` | MODIFY — new content sections + data queries + enhanced branding |
| Court reminders | `src/lib/court-reminders.ts` | MODIFY — update interface, simplify (move content to prep-content.ts) |
| Check-in button | `src/components/partner/CheckInButton.tsx` | NEW |
| Check-in API | `src/app/api/check-in/route.ts` | NEW |
| Compliance report | `src/app/partner/compliance-report/page.tsx` | NEW |
| Report button | `src/components/partner/ComplianceReportButton.tsx` | NEW |
| Add client modal | `src/components/partner/AddClientModal.tsx` | MODIFY — add indemnitor + last_name fields |
| Add client API | `src/app/api/partner/add-client/route.ts` | MODIFY — accept new fields |
| Client tracker | `src/components/partner/ClientTracker.tsx` | MODIFY — check-in status column |
| Dashboard API | `src/app/api/partner/dashboard/route.ts` | MODIFY — join check-in data |
| Dashboard page | `src/app/partner/dashboard/page.tsx` | MODIFY — add compliance report button |
| Reminder cron | `src/app/api/cron/court-reminders/route.ts` | MODIFY — indemnitor emails + partner branding |
| Reminder emails | `src/lib/court-reminder-emails.ts` | MODIFY — partner branding in email templates |
| Migration | `supabase/migrations/2026XXXX_fta_platform_v2.sql` | NEW |

**Total: 7 new files, 9 modified files, 1 migration**

---

## NOT in scope

- Re-arrest monitoring (backlogged — CL state court coverage gap)
- SMS notifications (Phase 2 — needs Twilio, separate scope)
- Standalone /reminders page for non-partner defendants (separate scope)
- Court record lookup (Phase 2)
- Geofencing or facial recognition (never — that's Captira's lane)
- Any case-specific data on the free page (that's our paid products)

---

## Research Sources

- [Duke Judicature — Sentencing Colloquy](https://judicature.duke.edu/articles/conversations-of-a-lifetime-the-power-of-the-sentencing-colloquy-and-how-to-make-it-matter/)
- [Fishman Firm — Five Deadly Mistakes](https://www.thefishmanfirm.com/top-five-biggest-mistakes-of-the-criminal-defendant/)
- [Gideon's Soldiers — Questions for Your PD](https://gideonssoldiers.com/questions-to-ask-your-public-defender/)
- [AIA Surety — Audit Proof Your Business](https://www.aiasurety.com/bail/audit-proof-your-bail-bond-business/)
- [Washington DOL — Bail Bond Audits](https://dol.wa.gov/professional-licenses/bail-bond-agency/audits-and-recordkeeping-bail-bonds)
- [Reynolds Defense — Court Etiquette](https://www.reynoldsdefensefirm.com/client-guide-rdf-client-guide-court-etiquette/)
- [California Courts Self-Help](https://selfhelp.courts.ca.gov/criminal-court/overview/pretrial)
- [DOJ Justice 101 — Plea Bargaining](https://www.justice.gov/usao/justice-101/pleabargaining)
- [NOLO — Continuances](https://www.nolo.com/legal-encyclopedia/continuances-criminal-cases.html)
- [AIA VisionPRO](https://www.aiasurety.com/bail/aia-launches-new-software-program-visionpro/)
- [Captira Features](https://www.captira.com/pages/bail-software)
