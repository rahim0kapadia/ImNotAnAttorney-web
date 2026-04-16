# FTA Prevention Platform v2, Implementation Plan

**Spec:** `C:\Users\email\projects\ImNotAnAttorney-web\docs\superpowers\specs\2026-04-13-fta-prevention-platform-v2-design.md`
**Tech stack:** Next.js 15 App Router, Supabase, Tailwind CSS, Resend email
**Deploy:** `git push origin master` (Vercel auto-deploy)
**Migrations:** Apply via `scripts/apply-pending-sql.mjs` using Supabase Management API

---

## Context

The current prep page (`/prep/[token]`) shows generic content: "dress nice, arrive early." The spec transforms it into a data-driven defendant briefing using aggregate tables (`jurisdiction_statutes`, `outcome_benchmarks`, `sentencing_distributions`, `bench_jury_divergence`) we already have populated. Plus: check-ins, indemnitor notifications, compliance reports, and enhanced partner branding.

**Total:** 7 new files, 9 modified files, 1 migration.

---

## Key Decisions

1. **Single migration file**, all schema changes (check-ins table, indemnitor columns, last_name column) ship in one migration. Simpler rollback, no ordering issues.

2. **Content split: prep-content.ts vs prep-data.ts**, static insider tips go in `prep-content.ts` (no imports, pure content arrays). Database query functions go in `prep-data.ts` (mirrors `src/lib/tier9-reports/query.ts` pattern: typed results, `isEmpty` flag, graceful degradation). This separation means the prep page always renders something useful even if every query returns empty.

3. **State code parsing**, `county_state` stores "Pinellas County, FL". Parse via `county_state.split(',').pop()?.trim()` to get "FL". This becomes the `jurisdiction` filter for `jurisdiction_statutes` and the ILIKE seed for `bench_jury_divergence` district lookups (same `STATE_NAMES` map from `query.ts`).

4. **Charge slug mapping**, `court_reminders.charge_type` uses slugs like `dui-first-offense`. `jurisdiction_statutes.common_charge_slug` uses the taxonomy slugs (e.g., `dui-dwi`). Need a mapping constant in `prep-data.ts`. The `COURT_PREP_CONTENT` keys in `court-reminders.ts` show the charge types: `dui-first-offense`, `drug-possession`, `drug-trafficking`, `white-collar`, `federal-criminal`, `probation-violation`, `sex-offense`, `self-defense`, `other`. The `common_charges` taxonomy slugs (from seed migration) include `dui-dwi`, `drug-possession`, `drug-trafficking`, `theft-larceny`, etc. Build a `CHARGE_TO_TAXONOMY_SLUG` map.

5. **outcome_benchmarks query**, The spec says query by `offense_type`. The table has `offense_type text NOT NULL` + `jurisdiction_level` (national/state). The spec references `plea_rate` and `trial_rate` but `outcome_benchmarks` doesn't have those columns directly; it has `plea_conviction_rate`, `trial_conviction_rate`, `conviction_rate`, `dismissal_rate`. We can derive approximate plea/trial/dismissal percentages from `conviction_rate`, `dismissal_rate`, and the available rates. Query both `national` and `state` level rows.

6. **bench_jury_divergence query**, Same pattern as `query.ts`: ILIKE on `district` with state name, filter `judge_id IS NULL` for aggregate USSC data only.

7. **Check-in 12-hour cooldown**, Enforced server-side in the POST endpoint. Query last check-in for the `court_reminder_id`, reject if < 12 hours ago. Client shows disabled state based on response or last check-in timestamp passed from server.

8. **Compliance report**, Server component at `/partner/compliance-report` with `requirePartnerAuth()` pattern adapted for page routes (read session cookie from `cookies()`). Date range filtering happens client-side on pre-fetched data (no query params needed). Print CSS only, zero dependencies.

9. **Indemnitor email**, Reuse the same `EMAIL_BUILDERS` structure from the cron. When `indemnitor_email` is present, call the same builder but swap the greeting copy. Small helper function, not a full parallel template system.

---

## Schemas Involved

### New table: `client_check_ins`
```sql
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
```

### Altered: `court_reminders`
```sql
ALTER TABLE court_reminders ADD COLUMN IF NOT EXISTS indemnitor_name text;
ALTER TABLE court_reminders ADD COLUMN IF NOT EXISTS indemnitor_email text;
ALTER TABLE court_reminders ADD COLUMN IF NOT EXISTS last_name text;
```

### Existing tables queried (read-only)
- `jurisdiction_statutes`, `common_charge_slug`, `jurisdiction`, `statute_number`, `statute_title`, `offense_class`, `penalty_min`, `penalty_max`, `fine_max`, `elements`, `mandatory_minimum`, `common_defenses`, `defense_opportunities`, `source_urls`
- `outcome_benchmarks`, `offense_type`, `jurisdiction_level`, `jurisdiction_name`, `conviction_rate`, `dismissal_rate`, `median_sentence_months`, `plea_conviction_rate`, `trial_conviction_rate`, `source_urls`, `data_period`
- `sentencing_distributions`, `charge_slug`, `jurisdiction`, `judge_id` (filter IS NULL), `median_months`, `p25`, `p75`, `sample_size`, `source_urls`
- `bench_jury_divergence`, `district` (ILIKE state name), `judge_id` (filter IS NULL), `bench_acquittal_rate`, `jury_acquittal_rate`, `bench_median_sentence`, `jury_median_sentence`, `trial_penalty_pct`, `offense_category`, `fiscal_year_range`, `source_urls`

---

## Phase 1: Migration + Content + Data Layer

**Goal:** Schema changes applied, new content and query modules ready. No UI changes yet, everything compiles and passes type checks but isn't wired to the page.

### Task 1.1: Create migration file
**File:** `C:\Users\email\projects\ImNotAnAttorney-web\supabase\migrations\20260413a_fta_platform_v2.sql` (NEW)
**What to do:**
- Create `client_check_ins` table with the schema above
- ALTER `court_reminders` to add `indemnitor_name`, `indemnitor_email`, `last_name` columns
- All `IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS` for idempotency
**Dependencies:** None
**Apply:** `SUPABASE_ACCESS_TOKEN=<token> node scripts/apply-pending-sql.mjs supabase/migrations/20260413a_fta_platform_v2.sql`
(Token is in `C:\Users\email\projects\ImNotAnAttorney\.env.local`)

### Task 1.2: Create prep-content.ts (static insider tips)
**File:** `C:\Users\email\projects\ImNotAnAttorney-web\src\lib\prep-content.ts` (NEW)
**What to do:**
- Export interface `PrepSection` with `title: string`, `items: string[]`, `framing?: string`
- Export function `getInsiderTips()` returning an array of `PrepSection` objects for the 3 non-data-driven sections from the spec:
  - "The Reality of Your Hearing" (cattle call, meeting attorney, sequence, what NOT to do, demeanor)
  - "What Can Get You Arrested at the Courthouse" (substances, security, no children, no food, dress code)
  - "Before You Go" (ID, bond paperwork, pen/notepad, phone rules, childcare, social media warning)
- Export function `getAttorneyQuestions(chargeDisplayName: string)` returning the 7 universal questions array (parameterized with charge display name for question #1)
- Export function `getWhatHappensNext()` returning the educational timeline section (arraignment -> pretrial -> etc.)
- Content sourced directly from the spec. Plain string arrays, no dependencies.
**Dependencies:** None

### Task 1.3: Create prep-data.ts (aggregate data queries)
**File:** `C:\Users\email\projects\ImNotAnAttorney-web\src\lib\prep-data.ts` (NEW)
**What to do:**
- Import `createAdminClient` from `@/lib/supabase/admin`
- Export `STATE_NAMES` map (copy from `src/lib/tier9-reports/query.ts`, or better, extract to a shared `src/lib/us-states.ts` if the implementing agent prefers DRY. But the simpler path is to duplicate the ~55-line map since it's static data, not logic.)
- Export `CHARGE_TO_TAXONOMY_SLUG` map:
  ```ts
  const CHARGE_TO_TAXONOMY_SLUG: Record<string, string> = {
    "dui-first-offense": "dui-dwi",
    "drug-possession": "drug-possession",
    "drug-trafficking": "drug-trafficking",
    "white-collar": "theft-larceny",
    "federal-criminal": "federal-other",
    "probation-violation": "probation-violation",
    "sex-offense": "sex-offense",
    "self-defense": "self-defense",
    other: "other",
  };
  ```
- Export `parseStateCode(countyState: string): string | null`, `countyState.split(',').pop()?.trim() || null`
- Export typed interfaces:
  - `StatuteData`, statute_number, statute_title, offense_class, penalty_min, penalty_max, fine_max, elements, mandatory_minimum, common_defenses, defense_opportunities, source_urls
  - `OutcomeData`, conviction_rate, dismissal_rate, median_sentence_months, plea_conviction_rate, trial_conviction_rate, source_urls, data_period, jurisdiction_level
  - `SentencingData`, median_months, p25, p75, sample_size, source_urls
  - `BenchJuryData`, bench_acquittal_rate, jury_acquittal_rate, bench_median_sentence, jury_median_sentence, trial_penalty_pct, offense_category, fiscal_year_range, source_urls
  - `PrepAggregateData`, `{ statute: StatuteData | null, outcomes: OutcomeData[], sentencing: SentencingData | null, benchJury: BenchJuryData | null, isEmpty: boolean }`
- Export `async function queryPrepData(chargeType: string, countyState: string): Promise<PrepAggregateData>`
  - Parse state code from countyState
  - Map chargeType to taxonomy slug
  - If state code is null, return empty result with `isEmpty: true`
  - Run 4 parallel Supabase queries (same pattern as `queryJudgeReportCard` in `query.ts`):
    1. `jurisdiction_statutes`, `.eq("common_charge_slug", taxonomySlug).eq("jurisdiction", stateCode).maybeSingle()`
    2. `outcome_benchmarks`, `.eq("offense_type", taxonomySlug).in("jurisdiction_level", ["national", "state"]).limit(5)`
    3. `sentencing_distributions`, `.eq("charge_slug", taxonomySlug).eq("jurisdiction", stateCode).is("judge_id", null).order("sample_size", { ascending: false }).limit(1)`
    4. `bench_jury_divergence`, `.ilike("district", `%${escapeIlike(stateName)}%`).is("judge_id", null).order("jury_sample", { ascending: false }).limit(5)`
  - Use `escapeIlike()` helper (copy from query.ts or extract to shared)
  - Return typed result with `isEmpty` flag based on whether any data came back
- All queries use `createAdminClient()` (server-side only, no RLS)
**Dependencies:** Task 1.1 (migration applied so tables exist with correct columns)

### Task 1.4: Update CourtReminder interface in court-reminders.ts
**File:** `C:\Users\email\projects\ImNotAnAttorney-web\src\lib\court-reminders.ts` (MODIFY)
**What to do:**
- Add 3 optional fields to the `CourtReminder` interface: `indemnitor_name?: string | null`, `indemnitor_email?: string | null`, `last_name?: string | null`
- Do NOT remove existing `CourtPrepContent` or `getPrepContent()` yet, they're still used by the email templates (`court-reminder-emails.ts` uses `getPrepContent` in `reminder3d`). They will be deprecated later but removing them now would break emails.
**Dependencies:** Task 1.1

### Test strategy, Phase 1
- Type check: `npx tsc,noEmit` passes
- Unit: `queryPrepData("dui-first-offense", "Pinellas County, FL")` returns data (run against prod Supabase, which has FL statutes populated)
- Unit: `parseStateCode("Pinellas County, FL")` returns `"FL"`
- Unit: `parseStateCode("Cook County, IL")` returns `"IL"`
- Unit: `getInsiderTips()` returns 3 sections with non-empty items
- Verify migration applied: query `SELECT column_name FROM information_schema.columns WHERE table_name = 'client_check_ins'` returns expected columns

---

## Phase 2: Enhanced Prep Page

**Goal:** Wire the new content and data into the existing prep page. Replace generic sections with insider tips + data-driven sections.

### Task 2.1: Rewrite prep page
**File:** `C:\Users\email\projects\ImNotAnAttorney-web\src\app\prep\[token]\page.tsx` (MODIFY)
**What to do:**
- Add import: `import { getInsiderTips, getAttorneyQuestions, getWhatHappensNext } from "@/lib/prep-content"`
- Add import: `import { queryPrepData } from "@/lib/prep-data"`
- After the existing `reminder` query, add: `const prepData = await queryPrepData(reminder.charge_type, reminder.county_state);`
- Replace "What to Expect" section (Section B) with the 3 insider tip sections from `getInsiderTips()`. Each section renders as `<h2>` + bulleted list.
- Replace "What to Bring" section with the "Before You Go" section from insider tips.
- Replace "What to Wear" section with the "What Can Get You Arrested" section from insider tips.
- Remove "Day-Of Tips" section (content is now distributed across the new sections).
- Add data-driven sections AFTER insider tips, each conditional on data availability:
  - **"Your Charge in [State]"**, renders only if `prepData.statute` is not null. Shows statute number, title, offense class, penalty range, fine, mandatory minimum, elements (bulleted). Framing text from spec.
  - **"What Typically Happens in Cases Like Yours"**, renders only if `prepData.outcomes.length > 0` or `prepData.sentencing` is not null. Show rates (conviction, dismissal, median sentence) from outcomes. Show bench vs jury from benchJury. Include the disclaimer framing from spec.
  - **"Common Defense Approaches"**, renders only if `prepData.statute?.common_defenses?.length > 0` or `prepData.statute?.defense_opportunities?.length > 0`. Bulleted list. Include "Ask your attorney" framing.
- Add "Questions to Ask Your Attorney" section, always renders (from `getAttorneyQuestions(chargeName)`).
- Add "What Happens Next" section, always renders (from `getWhatHappensNext()`).
- Keep the product recommendation section (Section D) and footer (Section E) unchanged.
- Keep the partner branding section as-is for now (Phase 6 upgrades it).
- Section ordering: Countdown -> Insider tips (3 sections) -> Data-driven sections (3, conditional) -> Attorney questions -> What happens next -> Product recommendation -> Footer
**Dependencies:** Tasks 1.2, 1.3, 1.4

### Test strategy, Phase 2
- Visual: Load `/prep/[token]` for a FL DUI reminder, verify data-driven sections render with real statute data
- Visual: Load `/prep/[token]` for a reminder in a state with no data (e.g., Wyoming), verify graceful degradation (insider tips render, data sections hidden)
- Verify: No "undefined" or "null" text appears in any section
- Verify: Page still works for expired reminders (shows expiry message)
- Verify: Product recommendation still renders correctly
- Accessibility: All sections have proper heading hierarchy (h2 for section titles)

---

## Phase 3: Defendant Check-Ins

**Goal:** CheckInButton on prep page, API endpoint, check-in data on partner dashboard.

### Task 3.1: Create check-in API route
**File:** `C:\Users\email\projects\ImNotAnAttorney-web\src\app\api\check-in\route.ts` (NEW, ~60 lines)
**What to do:**
- POST endpoint accepting JSON body: `{ token: string, latitude?: number, longitude?: number, accuracy_meters?: number }`
- Validate `token` exists and matches an active `court_reminders` row
- Query last check-in for this `court_reminder_id`: `SELECT checked_in_at FROM client_check_ins WHERE court_reminder_id = $id ORDER BY checked_in_at DESC LIMIT 1`
- If last check-in was < 12 hours ago, return `{ error: "Already checked in", lastCheckIn: <timestamp> }` with 429 status
- Insert into `client_check_ins`: `court_reminder_id`, `latitude`, `longitude`, `accuracy_meters`, `method: 'web'`
- Return `{ success: true, checkedInAt: <timestamp> }`
- No auth required (token IS the auth, same as prep page access)
**Dependencies:** Task 1.1 (migration)

### Task 3.2: Create CheckInButton component
**File:** `C:\Users\email\projects\ImNotAnAttorney-web\src\components\partner\CheckInButton.tsx` (NEW, ~80 lines)
**What to do:**
- `"use client"` component
- Props: `token: string`, `lastCheckIn: string | null` (ISO timestamp of most recent check-in, passed from server)
- States: idle, requesting-location, submitting, success, already-checked-in, error
- On mount: if `lastCheckIn` is within 12 hours, show "Checked in at [time]" with disabled button
- On click: call `navigator.geolocation.getCurrentPosition()` with timeout
  - Success: POST to `/api/check-in` with token + coordinates
  - Permission denied: POST to `/api/check-in` with token only (no coordinates)
  - Error: show error state with retry
- Success state: green checkmark, "Checked in at [time]", button disabled
- Styling: amber button matching existing design system, `print:hidden`
**Dependencies:** Task 3.1

### Task 3.3: Wire CheckInButton into prep page
**File:** `C:\Users\email\projects\ImNotAnAttorney-web\src\app\prep\[token]\page.tsx` (MODIFY)
**What to do:**
- Import `CheckInButton`
- After the reminder query, query last check-in:
  ```ts
  const { data: lastCheckInRow } = await supabase
    .from("client_check_ins")
    .select("checked_in_at")
    .eq("court_reminder_id", reminder.id)
    .order("checked_in_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  ```
- Render `<CheckInButton token={token} lastCheckIn={lastCheckInRow?.checked_in_at ?? null} />` at the top of the page, below partner branding, above countdown. Only render if `!courtPassed` and `!isExpired`.
**Dependencies:** Tasks 3.1, 3.2, Phase 2

### Task 3.4: Add check-in data to partner dashboard API
**File:** `C:\Users\email\projects\ImNotAnAttorney-web\src\app\api\partner\dashboard\route.ts` (MODIFY)
**What to do:**
- After the `courtClients` query, run a second query to get check-in summaries per client:
  ```ts
  const reminderIds = (courtClients || []).map(c => c.id);
  let checkInSummary: Record<string, { count: number; lastCheckIn: string | null }> = {};
  if (reminderIds.length > 0) {
    const { data: checkIns } = await supabase
      .from("client_check_ins")
      .select("court_reminder_id, checked_in_at")
      .in("court_reminder_id", reminderIds)
      .order("checked_in_at", { ascending: false });
    // Aggregate: count per reminder, last check-in per reminder
    for (const ci of (checkIns || [])) {
      const existing = checkInSummary[ci.court_reminder_id];
      if (!existing) {
        checkInSummary[ci.court_reminder_id] = { count: 1, lastCheckIn: ci.checked_in_at };
      } else {
        existing.count++;
      }
    }
  }
  ```
- Add `checkInSummary` to the response JSON
**Dependencies:** Task 1.1

### Task 3.5: Add check-in columns to ClientTracker
**File:** `C:\Users\email\projects\ImNotAnAttorney-web\src\components\partner\ClientTracker.tsx` (MODIFY)
**What to do:**
- Add `checkInSummary` to props: `checkInSummary: Record<string, { count: number; lastCheckIn: string | null }>`
- Add "Check-Ins" column to table header (after "Reminders")
- In each row, show: `{count}` check-ins, with last check-in date. If no check-ins, show ", "
- Add to summary stats grid: a 4th stat card "Check-Ins" showing total check-ins across all clients
- Update the grid from `grid-cols-3` to `grid-cols-4`
**Dependencies:** Task 3.4

### Task 3.6: Update dashboard page to pass checkInSummary
**File:** `C:\Users\email\projects\ImNotAnAttorney-web\src\app\partner\dashboard\page.tsx` (MODIFY)
**What to do:**
- Add `checkInSummary` to state (initialized to `{}`)
- Extract `checkInSummary` from dashboard API response in `fetchDashboard()`
- Pass `checkInSummary` prop to `<ClientTracker>`
**Dependencies:** Tasks 3.4, 3.5

### Test strategy, Phase 3
- Functional: Visit prep page -> click Check In -> verify check-in recorded (check API response)
- Functional: Click Check In again within 12 hours -> verify rejection (429)
- Functional: Deny geolocation -> verify check-in still records (no location)
- Functional: Partner dashboard shows check-in count and last check-in date for the client
- Visual: CheckInButton states (idle, requesting, success, already-checked-in) all render correctly

---

## Phase 4: Indemnitor Notifications

**Goal:** Partners can add indemnitor info when adding clients. Indemnitors receive court date reminders too.

### Task 4.1: Update AddClientModal with indemnitor fields
**File:** `C:\Users\email\projects\ImNotAnAttorney-web\src\components\partner\AddClientModal.tsx` (MODIFY)
**What to do:**
- Add state variables: `lastName`, `indemnitorName`, `indemnitorEmail`
- Add 3 new optional fields to the form, AFTER the existing 5 required fields, with a visual separator (e.g., `<p className="text-xs text-zinc-500 mt-3">Optional</p>`):
  - Last name (text input, optional, placeholder "Client last name (optional)")
  - Indemnitor name (text input, optional, placeholder "Co-signer name (optional)")
  - Indemnitor email (email input, optional, placeholder "Co-signer email (optional)")
- Include `last_name`, `indemnitor_name`, `indemnitor_email` in the POST body (only if non-empty)
- If `indemnitor_email` is provided, validate it's a valid email format
- Reset new fields in the form reset block
**Dependencies:** Task 1.1

### Task 4.2: Update add-client API route
**File:** `C:\Users\email\projects\ImNotAnAttorney-web\src\app\api\partner\add-client\route.ts` (MODIFY)
**What to do:**
- Extend `AddClientBody` interface with optional fields: `last_name?: string`, `indemnitor_name?: string`, `indemnitor_email?: string`
- Validate `indemnitor_email` format if provided (same regex as `email`)
- Include new fields in the Supabase insert (only if truthy after trim)
- If `indemnitor_email` is provided, send a separate welcome email to the indemnitor:
  - Subject: "Court date reminder set up for [first_name]"
  - Copy: "[Company] set up court date reminders for [first_name]. You'll receive reminder emails before their court date on [date]."
  - No prep page link for indemnitor (they don't need it, just reminders)
**Dependencies:** Task 1.1, Task 4.1

### Task 4.3: Add indemnitor emails to reminder cron
**File:** `C:\Users\email\projects\ImNotAnAttorney-web\src\app\api\cron\court-reminders\route.ts` (MODIFY)
**What to do:**
- In the `select("*")` query, the indemnitor fields come back automatically (they're on `court_reminders`)
- After each successful defendant email send (in the pre-court reminder loop), check if `r.indemnitor_email` exists
- If yes, build an indemnitor version of the email:
  - Same subject, prefixed with "[first_name]'s" (e.g., "[first_name]'s court date is in 2 weeks")
  - Replace the greeting: "Hi [indemnitor_name]," instead of "[first_name],"
  - Replace "Your court date" with "[first_name]'s court date"
  - Same CTA button pointing to the prep page
- Send via `sendEmail({ to: r.indemnitor_email, ... })`
- Do NOT add indemnitor sends to the `reminders_sent` tracking (that tracks defendant reminders only). This is fire-and-forget for the indemnitor.
- Also send indemnitor version of the post-court email if applicable
**Dependencies:** Task 1.1

### Test strategy, Phase 4
- Functional: Add client with indemnitor fields via modal -> verify `court_reminders` row has indemnitor columns populated
- Functional: Trigger reminder cron (or manually test the email builder) -> verify indemnitor receives a separate email
- Functional: Add client WITHOUT indemnitor -> verify no errors, no extra emails
- Visual: Modal renders correctly with the new optional fields

---

## Phase 5: Compliance Report

**Goal:** Print-optimized HTML page at `/partner/compliance-report` accessible from dashboard.

### Task 5.1: Create compliance report page
**File:** `C:\Users\email\projects\ImNotAnAttorney-web\src\app\partner\compliance-report\page.tsx` (NEW, ~150 lines)
**What to do:**
- Server component with partner auth. Read session cookie via `cookies()`, validate with `validatePartnerSession()` (import from `@/lib/partner-auth`). Redirect to `/partner/login` if invalid.
- Query data:
  ```ts
  const { data: clients } = await supabase
    .from("court_reminders")
    .select("id, first_name, last_name, charge_type, county_state, court_date, status, reminders_sent, created_at, converted_at")
    .eq("partner_promo_code", partner.promo_code)
    .order("court_date", { ascending: true });
  ```
  ```ts
  const { data: allCheckIns } = await supabase
    .from("client_check_ins")
    .select("court_reminder_id, checked_in_at")
    .in("court_reminder_id", (clients || []).map(c => c.id));
  ```
- Compute summary stats: total clients, active, completed, total reminders sent (sum of `reminders_sent.length`), total check-ins, compliance rate (clients with 1+ check-in / total), conversions
- Render HTML with `@media print` CSS:
  - `@media print`, white background, black text, no buttons, proper page breaks
  - `@media screen`, dark theme matching the rest of the site
- Header: partner company name, agent name, report period (client-side date range picker), generated date
- Summary stats grid
- Per-defendant table: Name (first_name + last_name initial if available), Charge, Court Date, Status, Reminders Sent (X/4), Check-Ins count, Last Check-In date
- Footer: "Report generated by ImNotAnAttorney Court Prep Platform", partner promo code
- Include a client-side `PrintButton` at the top (same pattern as `src/app/report/[token]/PrintButton.tsx`, `"use client"` component with `window.print()`)
- Date range filtering: wrap the table + stats in a client component that accepts all data as props and filters by date range. Use `"use client"` wrapper for the filter, keep the data fetch server-side.
**Dependencies:** Phase 3 (check-ins exist)

### Task 5.2: Create ComplianceReportButton component
**File:** `C:\Users\email\projects\ImNotAnAttorney-web\src\components\partner\ComplianceReportButton.tsx` (NEW, ~15 lines)
**What to do:**
- Simple `<Link>` to `/partner/compliance-report` styled as a secondary button
- Text: "Download Compliance Report"
- Styling: border button (not filled) to differentiate from primary CTAs
**Dependencies:** None

### Task 5.3: Add ComplianceReportButton to dashboard
**File:** `C:\Users\email\projects\ImNotAnAttorney-web\src\app\partner\dashboard\page.tsx` (MODIFY)
**What to do:**
- Import `ComplianceReportButton`
- Render it in the ClientTracker section area, between the ClientTracker and the FTA Calculator. Place it as a standalone element:
  ```tsx
  <div className="flex justify-end">
    <ComplianceReportButton />
  </div>
  ```
**Dependencies:** Task 5.2

### Test strategy, Phase 5
- Visual: Navigate to `/partner/compliance-report` -> verify page renders with correct data
- Functional: Click "Download as PDF" -> verify browser print dialog opens with clean layout
- Visual: Print preview shows white background, no buttons, proper table formatting
- Functional: Unauthenticated access -> redirects to login
- Functional: Date range filtering works (if implemented as client-side filter)

---

## Phase 6: Enhanced Partner Branding

**Goal:** Upgrade branding on prep page from small text to prominent header bar. Add partner name to reminder emails.

### Task 6.1: Upgrade partner branding on prep page
**File:** `C:\Users\email\projects\ImNotAnAttorney-web\src\app\prep\[token]\page.tsx` (MODIFY)
**What to do:**
- Replace the existing small `<p>` branding text:
  ```tsx
  {partnerCompany && (
    <p className="text-zinc-500 text-sm text-center mb-6">
      Court prep provided by {partnerCompany}, powered by ImNotAnAttorney
    </p>
  )}
  ```
  With a proper header bar:
  ```tsx
  {partnerCompany && (
    <div className="bg-zinc-900 border border-zinc-700 rounded-xl px-6 py-4 mb-8 text-center">
      <p className="text-zinc-400 text-sm">Court prep provided by</p>
      <p className="text-white text-lg font-bold mt-1">{partnerCompany}</p>
      <p className="text-zinc-500 text-xs mt-1">Powered by ImNotAnAttorney</p>
    </div>
  )}
  ```
**Dependencies:** Phase 2 (prep page already modified)

### Task 6.2: Add partner branding to reminder emails
**File:** `C:\Users\email\projects\ImNotAnAttorney-web\src\lib\court-reminder-emails.ts` (MODIFY)
**What to do:**
- Extend `ReminderContext` interface with optional `partnerCompany?: string`
- In the reminder cron (`route.ts`), when building `ctx`, look up partner company name if `r.partner_promo_code` exists:
  - Query `partners` table: `.select("company, name").eq("promo_code", r.partner_promo_code).maybeSingle()`
  - Add to ctx: `partnerCompany: partnerData?.company || partnerData?.name || undefined`
- In each email builder function (`reminder14d`, `reminder7d`, `reminder3d`, `reminder1d`), add partner branding line above the footer if `ctx.partnerCompany` is provided:
  ```html
  <p style="color: #71717A; font-size: 13px; margin-top: 24px;">
    Provided by ${escapeHtml(ctx.partnerCompany)}
  </p>
  ```
- Do NOT add branding to `postCourtEmail` (that's a sales-oriented follow-up, not a partner-branded reminder)

### Task 6.3: Update cron to pass partner context
**File:** `C:\Users\email\projects\ImNotAnAttorney-web\src\app\api\cron\court-reminders\route.ts` (MODIFY)
**What to do:**
- Before the reminder loop, batch-fetch partner names for all reminders that have `partner_promo_code`:
  ```ts
  const promoCodes = [...new Set(reminders.filter(r => r.partner_promo_code).map(r => r.partner_promo_code))];
  let partnerMap: Record<string, string> = {};
  if (promoCodes.length > 0) {
    const { data: partners } = await supabase
      .from("partners")
      .select("promo_code, company, name")
      .in("promo_code", promoCodes);
    for (const p of (partners || [])) {
      partnerMap[p.promo_code] = p.company || p.name;
    }
  }
  ```
- Add `partnerCompany` to the `ctx` object: `partnerCompany: r.partner_promo_code ? partnerMap[r.partner_promo_code] : undefined`
- This is the same route already modified in Phase 4 (Task 4.3) for indemnitor emails. Both changes go into the same file.
**Dependencies:** Phase 4 (cron already modified)

### Test strategy, Phase 6
- Visual: Prep page with partner attribution shows prominent branded header bar
- Visual: Prep page without partner shows no branding (no "undefined" or empty bar)
- Functional: Trigger reminder email for a partner-attributed reminder -> verify partner company name appears in email
- Functional: Trigger reminder email for a non-partner reminder -> verify no branding line

---

## File Summary

| Phase | File | Action | Lines (est.) |
|-------|------|------, |-------------|
| 1 | `supabase/migrations/20260413a_fta_platform_v2.sql` | NEW | ~20 |
| 1 | `src/lib/prep-content.ts` | NEW | ~100 |
| 1 | `src/lib/prep-data.ts` | NEW | ~120 |
| 1 | `src/lib/court-reminders.ts` | MODIFY | +3 lines |
| 2 | `src/app/prep/[token]/page.tsx` | MODIFY | major rewrite |
| 3 | `src/app/api/check-in/route.ts` | NEW | ~60 |
| 3 | `src/components/partner/CheckInButton.tsx` | NEW | ~80 |
| 3 | `src/app/prep/[token]/page.tsx` | MODIFY | +15 lines |
| 3 | `src/app/api/partner/dashboard/route.ts` | MODIFY | +20 lines |
| 3 | `src/components/partner/ClientTracker.tsx` | MODIFY | +15 lines |
| 3 | `src/app/partner/dashboard/page.tsx` | MODIFY | +5 lines |
| 4 | `src/components/partner/AddClientModal.tsx` | MODIFY | +30 lines |
| 4 | `src/app/api/partner/add-client/route.ts` | MODIFY | +25 lines |
| 4 | `src/app/api/cron/court-reminders/route.ts` | MODIFY | +30 lines |
| 5 | `src/app/partner/compliance-report/page.tsx` | NEW | ~150 |
| 5 | `src/components/partner/ComplianceReportButton.tsx` | NEW | ~15 |
| 5 | `src/app/partner/dashboard/page.tsx` | MODIFY | +5 lines |
| 6 | `src/app/prep/[token]/page.tsx` | MODIFY | ~10 lines |
| 6 | `src/lib/court-reminder-emails.ts` | MODIFY | +15 lines |
| 6 | `src/app/api/cron/court-reminders/route.ts` | MODIFY | +20 lines |

**Totals: 7 new files, 9 modified files, 1 migration** (matches spec)

---

## Execution Order

Phases are independent once Phase 1 (migration + data layer) is done. Recommended order:
1. Phase 1 (foundation, everything depends on it)
2. Phase 2 (highest user impact, dramatically better prep page)
3. Phase 3 (check-ins, new functionality)
4. Phase 4 (indemnitor, extends existing flow)
5. Phase 5 (compliance report, new page, no dependencies on Phase 3/4 check-in data to render, but better if Phase 3 is done first)
6. Phase 6 (branding polish, builds on Phase 4's cron modifications)

Phases 3 and 4 can run in parallel if different agents handle them, since they touch different files (except the cron route, which Phase 4 and Phase 6 both modify, Phase 6 must follow Phase 4).

---

## Gotchas for Implementers

1. **`outcome_benchmarks` does not have `plea_rate` or `trial_rate` columns.** It has `plea_conviction_rate` and `trial_conviction_rate` (conviction rates within pleas/trials, not overall rates). The spec's "X% result in a plea deal" language needs to be adapted, use `conviction_rate` + `dismissal_rate` and note the remainder goes to trial/other dispositions. Or use the `prosecution_profiles` table which has `plea_rate` and `trial_rate` but scoped to prosecution offices, not offense types.

2. **`jurisdiction_statutes` doesn't have `source_urls` in the original schema.** It was added by migration `20250101000030_research-columns-and-case-law.sql`. It exists in production. The data IS there.

3. **Charge slug mismatch:** `court_reminders.charge_type` uses `dui-first-offense` but `jurisdiction_statutes.common_charge_slug` uses `dui-dwi`. The `CHARGE_TO_TAXONOMY_SLUG` map in `prep-data.ts` handles this. Verify the mapping against `common_charges` table slugs.

4. **`court-reminder-emails.ts` references `getPrepContent` in `reminder3d`** (for the what-to-bring checklist). Don't remove `COURT_PREP_CONTENT` from `court-reminders.ts`, it's still used. Future cleanup can update the email to use `prep-content.ts` instead, but that's out of scope.

5. **Partner auth for compliance report page:** The dashboard uses client-side fetch to `/api/partner/dashboard` which checks the session cookie. The compliance report is a server component that needs to read the cookie directly. Use `cookies()` from `next/headers` + `validatePartnerSession()` from `@/lib/partner-auth`. Import `PARTNER_SESSION_COOKIE` for the cookie name.

6. **Windows + geolocation:** The CheckInButton uses the browser Geolocation API. On Windows, Chrome may prompt for location access. If denied, the component should still work (records check-in without coordinates). Test both paths.

7. **Supabase `.in()` with empty array** will error. Guard with `if (reminderIds.length > 0)` before the check-ins query in the dashboard API.
