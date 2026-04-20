# Quality-Gate Deferred Fixes — Bondsman FAQ + Welcome-Reminder + Compliance-Report Session

**Date filed:** 2026-04-20
**Origin:** Quality-gate review of commits 5340bd9 / 74b42d0 / 6361201 / 276515a. Fixes in 36f710e landed the must-fix items; this plan covers everything else surfaced by code-reviewer, code-simplifier, security-auditor (a11y reviewer pending re-dispatch).
**Branch target:** one branch per tier, or one bundled if sequenced. Recommend Tier A (HIGH) as its own branch so it ships first.

## Tier A — HIGH severity (ship first, standalone branch each)

### A1. Rate-limit POST `/api/court-reminders` — spam-abuse surface
**Severity:** HIGH. OWASP A04 (Insecure Design) + A07 (Identification & Auth Failures).
**File:** `C:\Users\email\projects\ImNotAnAttorney-web\src\app\api\court-reminders\route.ts`

Endpoint is unauthenticated and now fires email + SMS on every request. Attacker scripts bulk POSTs, weaponizes Resend + SMS gateway ($$ + A2P trust burn).

**Acceptance:**
- IP + email-keyed rate limit: max 3 enrollments / IP / hour, max 1 / email / day. Reject with 429 + `Retry-After`.
- Phone opt-in path (`consent === true` + phone present): require additional signed partner-context token OR challenge.
- Storage: reuse `cron-idempotency` pattern (Supabase lock table) or add `rate_limits` table keyed by `(scope, identifier, window_start)`.
- Telemetry: fire Telegram alert when >20 rejections / hour (active abuse signal).

**Tests:**
- Vitest: happy path enrollment still works.
- Vitest: 4th POST from same IP within hour → 429.
- Vitest: 2nd POST with same email within day → 429.
- Manual: POST from curl 10× in a minute, confirm 4th+ rejected.

**Sequencing:** Ship BEFORE running any cold-outreach campaign that could expose the endpoint to higher volume. Urgent.

---

### A2. Pre-existing subject-line HTML-entity bug in other reminder builders
**Severity:** HIGH (same class as the one fixed in 36f710e).
**File:** `C:\Users\email\projects\ImNotAnAttorney-web\src\lib\court-reminder-emails.ts`

`reminder14d()`, `reminder7d()`, `reminder3d()`, `reminder1d()`, `postCourtEmail()` all put `escapeHtml()`d firstName into subject lines. HTML entities render literally in mail clients: "John &amp; Jane" displays as "John &amp; Jane".

**Acceptance:**
- Extract helper `subjectSafe(name: string) => string` that strips HTML chars + caps length at 40.
- Apply to every subject line across all 5 builders.
- `escapeHtml()` stays for the HTML body; `subjectSafe()` for subject lines only.

**Tests:**
- Vitest: subject line with "O'Brien & Smith" renders literally (no &amp;/&#39;).
- Vitest: subject line with 100-char name caps to 40.

---

## Tier B — MEDIUM severity (batch in one follow-up branch)

### B1. Extract `CHECK_IN_MODE_COPY` shared constant
**Files:**
- `C:\Users\email\projects\ImNotAnAttorney-web\src\components\partner\PartnerApplicationForm.tsx`
- `C:\Users\email\projects\ImNotAnAttorney-web\src\components\partner\WorkflowToggle.tsx`
- `C:\Users\email\projects\ImNotAnAttorney-web\src\lib\partner-data.ts`

Two files now carry near-identical radio-label copy for same two modes. Drift risk every future edit.

**Acceptance:**
- Export `CHECK_IN_MODE_COPY: { enabled: { title, description }, disabled: { title, description } }` from `partner-data.ts`.
- Both components import and render. No inline copy duplication.
- Preserve current strings verbatim (no copy change — refactor only).

**Tests:** Snapshot the two components; confirm rendered output unchanged.

---

### B2. zod.email() migration on `/api/court-reminders` + audit other POST routes
**File:** `C:\Users\email\projects\ImNotAnAttorney-web\src\app\api\court-reminders\route.ts` + cross-cut.

Current email regex `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` is permissive, would need revisiting if refactor ever concatenates email into SMTP headers raw.

**Acceptance:**
- Add `zod` schema at top of route: `z.object({ first_name: z.string().min(1).max(80), email: z.string().email().max(254), phone: z.string().optional(), ... })`.
- Replace ad-hoc validation with `schema.safeParse(body)`. Return 400 with zod's formatted errors on failure.
- Audit other POST routes (`/api/partners/apply`, `/api/intake/*`, `/api/generate/*`) for same pattern. Separate per-route migration.

**Tests:** Vitest: malformed email → 400. Long first_name → 400 (over 80 chars). Valid payload → 200.

---

### B3. Server-side length caps on free-text inputs
**File:** `C:\Users\email\projects\ImNotAnAttorney-web\src\app\api\court-reminders\route.ts`

No length guards on `first_name`, `county_state`, `charge_type`, `recommended_tier`. 10KB name embeds into email subject + SMS, risks abuse + DB bloat.

**Acceptance:**
- `first_name.slice(0, 80)` before insert.
- `county_state.slice(0, 60)` before insert.
- `charge_type` validated against `CHARGE_DISPLAY_NAMES` keys (allowlist, reject unknown).
- Same cap in welcome email + SMS builders as defense-in-depth.

**Tests:** Vitest: insert with 1KB name succeeds with stored value ≤ 80 chars. Insert with invalid charge_type → 400.

**Note:** Handle inside B2 (zod) — `.max()` constraints are natural fit. File separately if B2 slips.

---

### B4. Wrap welcome SMS in `after()` for Vercel fire-and-forget
**File:** `C:\Users\email\projects\ImNotAnAttorney-web\src\app\api\court-reminders\route.ts`

Welcome email uses `await` + try/catch (correct). Welcome SMS uses `.catch()` fire-and-forget — on Vercel serverless, can be killed when the function returns before SMS resolves. Per project memory `pattern-after-for-vercel-fire-and-forget.md`.

**Acceptance:**
- Import `after` from `next/server`.
- Wrap SMS send: `after(async () => { await sendSMS(...).catch(...) })`.
- Response returns immediately; SMS completes post-response on the serverless lifecycle extension.

**Tests:** E2E: submit form with phone, confirm 200 response fast (< 500ms) AND SMS received.

---

### B5. Add source URL comments for FTA-reduction claims in BONDSMAN_FAQS
**File:** `C:\Users\email\projects\ImNotAnAttorney-web\src\lib\partner-data.ts`

Per project rule `no-hallucinated-legal-data.md`: any claim-with-number needs a source URL stored alongside. FAQ cites "26% (ideas42/NYC)" and "50%+ (Uptrust)" but URLs only in commit message — hunters through git log to re-verify.

**Acceptance:**
- Add `// Source: <url> — verified <date>` comment above the FAQ entry that cites each number.
- URLs: https://www.povertyactionlab.org/evaluation/text-message-reminders-decreased-failure-appear-court-new-york-city (ideas42/J-PAL) and https://www.abajournal.com/lawscribbler/article/text_messages_can_keep_people_out_of_jail (Uptrust reporting).

**Tests:** N/A — comments only.

---

### B6. Indemnitor reminder audit: FAQ claim vs actual wiring
**File:** `C:\Users\email\projects\ImNotAnAttorney-web\src\app\api\cron\court-reminders\route.ts` + `C:\Users\email\projects\ImNotAnAttorney-web\src\lib\partner-data.ts`

FAQ Q11 claims "indemnitor gets copy of every reminder." Verified in cron at line 147 (indemnitor_email receives 14/7/3/1d + post). BUT: welcome email on enrollment does NOT send to indemnitor.

**Decision required:** Either
- (a) extend welcome send to include indemnitor_email recipient if present, OR
- (b) soften FAQ to "receives copies of every scheduled reminder" (excluding welcome).

**Recommendation:** (a). Welcome is the first-impression message; indemnitor missing it is worse than code cost.

**Acceptance:**
- After welcome email send, if `body.indemnitor_email` is present AND valid, send same welcome to that address with slight salutation tweak ("[FirstName]'s court prep is set up…").
- Cap length on indemnitor fields same as B3.

**Tests:** Vitest: POST with indemnitor_email → two email sends (primary + indemnitor). POST without → one send.

---

## Tier C — LOW severity (polish pass, single branch)

### C1. Fix `customLabel` IIFE computing when unused
**File:** `C:\Users\email\projects\ImNotAnAttorney-web\src\app\partner\compliance-report\ComplianceReportClient.tsx`

`customLabel` runs every render, even when `dateRange !== "custom"`. Not expensive (string formatting only) but wasted work.

**Acceptance:** Wrap in `useMemo` with `[customFrom, customTo]` deps, OR inline into `dateRangeLabel.custom` lazy evaluator.

**Tests:** N/A — behavioral identical.

---

### C2. "Custom range…" ellipsis → "Custom range"
**File:** `C:\Users\email\projects\ImNotAnAttorney-web\src\app\partner\compliance-report\ComplianceReportClient.tsx`

Ellipsis implies dialog opens; actual UX reveals inline inputs. Misleading affordance.

**Acceptance:** Change select option text to `Custom range` (no ellipsis). Match the "Custom: {from — to}" printed header label.

---

### C3. Em-dash audit in BONDSMAN_FAQS
**File:** `C:\Users\email\projects\ImNotAnAttorney-web\src\lib\partner-data.ts`

Project has a humanizer-detector penalty that mass-replaced em-dashes in blog pipeline. FAQ content has `—` throughout. Confirm FAQs aren't subject to same detector; if they are, replace with commas/periods.

**Acceptance:**
- Check: does any QA gate scan `partner-data.ts` or rendered FAQ HTML for em-dashes?
- If yes: replace em-dashes with appropriate punctuation.
- If no: add comment noting the exemption so future sweeps skip this file.

---

### C4. Date parse TZ assumption in welcome email
**File:** `C:\Users\email\projects\ImNotAnAttorney-web\src\lib\court-reminder-emails.ts`

`new Date(ctx.courtDate + "T00:00:00")` parses as server local time. If Vercel region or DST shifts, the "Monday, April 20, 2026" format can show wrong weekday.

**Acceptance:**
- Document: vercel.json + Resend environment anchored to `America/New_York` (INAA operating tz).
- Either add comment explaining the assumption, OR migrate to explicit `Intl.DateTimeFormat` with `timeZone: 'America/New_York'` to match the check-in-schedule.ts pattern already in this repo.

---

### C5. TCPA audit log enrichment — IP + user-agent
**File:** `C:\Users\email\projects\ImNotAnAttorney-web\src\app\api\court-reminders\route.ts`

`sms_consent_at` timestamp is captured. TCPA defense best-practice adds IP + user-agent alongside to prove the consent came from the defendant's device.

**Acceptance:**
- Add `consent_ip` + `consent_user_agent` columns to `court_reminders` via migration.
- Populate on insert when phone + consent provided.
- Confirm RLS doesn't expose these to partner dashboard queries (PII).

**Tests:** Migration applies. Insert populates both fields. Partner dashboard API does NOT return them.

---

### C6. Welcome email partner branding asymmetry
**File:** `C:\Users\email\projects\ImNotAnAttorney-web\src\app\api\court-reminders\route.ts`

Welcome only fetches partner company on `check_in_idk` branch (existing code). Other enrollment paths get unbranded welcome; downstream 14/7/3/1d reminders re-fetch and get branding.

**Acceptance:**
- Unconditionally fetch `partners.company` when `body.partner_promo_code` is set (one small query).
- Pass to welcome ctx regardless of branch.

**Tests:** Vitest: POST with partner code → welcome email renders `Provided by {company}` in footer.

---

### C7. Mixed voice in mode toggle labels
**Files:**
- `C:\Users\email\projects\ImNotAnAttorney-web\src\components\partner\PartnerApplicationForm.tsx`
- `C:\Users\email\projects\ImNotAnAttorney-web\src\components\partner\WorkflowToggle.tsx`

Current labels mix voice:
- "Use our check-in system" (imperative)
- "I already have check-in software" (first-person)

Pick one voice. Recommendation: first-person for both (user is answering about themselves).

**Acceptance:**
- Update to: "I want to run check-ins through this platform" vs "I already have check-in software."
- Apply to both files via B1 shared constant.

---

### C8. Verify FAQ policy claims against actual enforcement
**File:** `C:\Users\email\projects\ImNotAnAttorney-web\src\lib\partner-data.ts`

BONDSMAN_FAQS has claims: "no sharing with third parties," "never sell client list," "encrypted at rest," "SOC-2-pattern storage." Per security-auditor: each needs a backing policy + actual enforcement.

**Acceptance:**
- Grep claims: "share", "sell", "private", "encrypt", "SOC" in BONDSMAN_FAQS.
- Reconcile with `/privacy` page + Supabase RLS policies + infra docs.
- Soften any claim that isn't backed (e.g., "SOC-2-pattern" without actual SOC-2 audit).

---

## Not addressed in this plan

- Rate-limit storage layer choice (Supabase vs Upstash vs Vercel KV) — decide at A1 implementation.
- Email humanizer detector coverage of non-blog content — if C3 finds gap, separate plan.

## Summary

| Tier | Count | Notes |
|------|-------|-------|
| A (HIGH) | 2 | A1 = standalone branch, urgent. A2 = can bundle with Tier B or ship A1-only. |
| B (MEDIUM) | 6 | Bundle in one branch. Sequenced: B2 + B3 first (input validation is the foundation), then B1/B4/B5/B6. |
| C (LOW) | 8 | Single polish branch. C8 may lift to Tier B if audit finds actual mismatches. |

## Copy-paste handoff

Execute the implementation plan at
  `C:\Users\email\projects\ImNotAnAttorney-web\docs\plans\2026-04-20-quality-gate-deferred-fixes.md`

Start with Tier A (A1 rate-limit) as its own branch, then Tier B bundle, then Tier C polish.
