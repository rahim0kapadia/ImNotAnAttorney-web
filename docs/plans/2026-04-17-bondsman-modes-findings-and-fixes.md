# Bondsman Modes — Consolidated Review Findings + Fix Decisions

**Date:** 2026-04-17
**Source plan:** [docs/plans/2026-04-17-bondsman-modes-implementation.md](2026-04-17-bondsman-modes-implementation.md)
**Source design:** [docs/plans/2026-04-17-modes-design.md](2026-04-17-modes-design.md)

**7 parallel reviewers** landed: code-reviewer (correctness, Opus), security-auditor, accesslint:reviewer (a11y, Opus), april-dunford (positioning, Opus), peep-laja (CRO, Opus), sabri-suby (offer, Opus), general-purpose (UPL + Atticus, Opus).

**Totals:** ~110 distinct findings after dedupe. 13 CRITICAL, 27 HIGH, 32 MEDIUM, 38 LOW.

Per repo policy (pristine-or-nothing, fix-all including LOW), this doc consolidates, dedupes, and locks the fix decision for every finding. The v2 plan at [2026-04-17-bondsman-modes-implementation-v2.md](2026-04-17-bondsman-modes-implementation-v2.md) applies them.

---

## Ship-blockers (CRITICAL — fix before any implementation)

### B1. PostgREST inner-join silently no-ops → referral-mode clients get check-in SMS
**Sources:** Security C1, Correctness CRIT.
**Root:** `court_reminders.partner_promo_code` is plain `text` (verified in `supabase/migrations/20260412b_court_reminders.sql:13`) — NOT a declared FK to `partners.promo_code`. The plan's `.select("..., partners!inner(check_in_enabled)")` requires a declared FK. PostgREST silently drops the join filter → cron blasts check-in prompts to every active reminder regardless of mode. UPL/TCPA exposure on defendants who never consented.
**Fix:** Adopt the "pre-fetch enabled promo codes, then `.in(...)`" pattern as PRIMARY, not fallback. Fetch `enabledCodes` once BEFORE Phase 1 and Phase 2 loops. Keep inline `check_in_enabled` re-verification on each sent reminder as defense-in-depth. Drop the inner-join attempt entirely. Add an integration test with a real `partners.check_in_enabled=false` seed that asserts no SMS/email fires.

### B2. Funnel fork: check-in signup redirects to `/prep/{token}`, not to `/r/{CODE}?fromCheckin=1`
**Sources:** Dunford MED-3, Laja C4, Correctness MED.
**Root:** `CourtReminderForm.tsx:71-73` hardcodes `router.push(\`/prep/${token}\`)`. Design doc §5 requires redirect into the quiz→product funnel at `/r/{CODE}?fromCheckin=1`. As planned, Check-in mode signups silently skip the revenue funnel — the core reason the bondsman program exists.
**Fix:** Extend `CourtReminderForm` with a `redirectTo` prop (default keeps current `/prep/{token}` for self-serve). `/checkin/[code]/page.tsx` passes `redirectTo={\`/r/${code}?fromCheckin=1\`}`. The welcome email still links to `/prep/{token}` so the defendant can return to it — the IMMEDIATE post-signup hop goes to the bridge.

### B3. Signup form promises SMS check-in prompts but has no phone field
**Sources:** Laja C2, Suby C2, design doc §5 vs CourtReminderForm.tsx.
**Root:** Design §5 specifies `Mobile phone *` required with helper "We text your check-in prompts and reminders here." `CourtReminderForm` asks: first_name, (optional charge_type), court_date, check_in_days picker, county_state, email — NO phone. Check-in prompts are SMS by domain rule. Form can't fulfill the hero's own promise. Plan's Task 11 reuses the form unchanged.
**Fix:** Add required `phone` field + `showPhone`/`requirePhone` props to `CourtReminderForm`. Required when inside `/checkin/[code]`. Helper: "Where we text your check-in prompts." Optional (or collected later) for self-serve `/r/[code]/reminders`.

### B4. Signup form carries 9 fields; Suby/Laja 60-second target demands ≤5
**Sources:** Suby C2, Laja C2.
**Root:** After B3 adds phone, total interactions hit: first_name + phone + email + court_date + county_state + charge_type + check_in_days picker + "I don't know" checkbox + consent = 9. Crisis-buyer form should be ≤5 fields.
**Fix decision:** On `/checkin/[code]`:
- **Keep (5):** first_name, phone, email, court_date, consent (new required checkbox)
- **Drop from signup, move to `/prep/{token}`:** county_state (derive from partner.city, editable on prep), charge_type (already accepts `?charge=` query-param pre-fill; default to "Other" if missing)
- **Drop entirely from signup:** check_in_days picker + "I don't know" (partner sets schedule in ClientTracker; defendant self-edit arrives later on `/prep/{token}`)

Pass the mode into the form so referral mode hides the phone-required (still optional) and the check-in prompt copy.

### B5. Non-bondsman partners inserted with `check_in_enabled=true`, contradicting migration backfill
**Sources:** Security H1, Correctness LOW.
**Root:** Plan Task 4 Step 2 defaults `let checkInEnabled = true;` and only overrides for `source === "bondsman"`. New non-bondsman applicants insert `true`. Migration backfilled existing non-bondsman rows to `false`. Invariant "non-bondsman = referral mode" broken on every new non-bondsman signup.
**Fix:** Flip default to `false`. Set `true` ONLY when `source === "bondsman" && checkInMode === "enabled"`. Add unit test: POST apply with `source: "attorney"` asserts stored `check_in_enabled === false`.

### B6. `apply` endpoint has no `source` allowlist → attacker can self-register as "bondsman"
**Sources:** Security H2.
**Root:** `apply/route.ts` does length validation on `source` but no allowlist. Combined with B5 fixed, an attacker can POST `source: "bondsman"` + `checkInMode: "enabled"` → auto-approved bondsman partner. Uses to spam defendants with check-in SMS.
**Fix:** `const VALID_SOURCES = ["bondsman", "attorney", "advocate", "partner", "direct"] as const;` Reject unknown values with 400.

### B7. Printed bail-packet card says "Use code at checkout" + displays promo code prominently
**Sources:** Dunford CRIT-1, CRIT-2.
**Root:** `src/app/partner/card/page.tsx:267-290` renders a promo-code callout block ("Use code at checkout for 10% off" + `{promoCode}` in 28pt monospace). Amendment 6 killed code-dropping — the URL carries the code. The card is the highest-impression printed surface, and it fights every other surface by still framing the code as client-facing.
**Fix:** Rewrite the callout block. Lead relational line: `"Because ${companyLine} sent you, 10% off is built in. No code to type at checkout."` Keep internal reference ("ref: {promoCode}" in tiny zinc-500 6pt text at bottom) for partner-support calls. Thread `checkInEnabled` into `CardContent` + branch the H1 between "Court Check-In" and "Court Prep" equivalents.

### B8. Compliance checklist H1 says "Free Court Reminders" in both modes
**Sources:** Dunford CRIT-1.
**Root:** `src/app/partner/checklist/page.tsx:343-348` hardcodes H1 `"Free Court Reminders"` regardless of mode. Task 26 only rewrites URL/QR, leaves H1 alone. Printed checklist advertises "Reminders" while QR lands on `/checkin/{CODE}` page titled "Set up your court check-in." Category signal breaks at the printed surface.
**Fix:** Thread `checkInEnabled` into `ChecklistContent`. Branch H1:
- Check-in mode: `"Court Check-In Set-Up"` / sub: `"Daily check-ins, court date reminders, and what to expect at your hearing. Sign up in 60 seconds."`
- Referral mode: `"Court Date Prep"` / sub: `"Court date reminders and what to expect at your hearing. Sign up in 60 seconds."`

### B9. Toolkit section keeps promo code as the visually primary client-facing asset
**Sources:** Dunford CRIT-3.
**Root:** `src/components/partner/ToolkitSection.tsx` renders a large amber `{partner.promo_code}` with a Copy button as the first block. Task 19 threads `partnerUrl` but doesn't touch Toolkit's visual hierarchy. Dashboard still trains bondsmen to hand out the code verbally.
**Fix:** Demote promo code inside `ToolkitSection`. Make "Your Partner Link" the primary block (largest, Copy button primary). Move promo code to a secondary `text-zinc-500 text-xs` line with tooltip `"Clients don't need to type this. The link carries it."` Add as new subtask under Task 19.

### B10. WorkflowToggle `<fieldset>` has no `<legend>` — radio group unnamed for SR users
**Sources:** a11y C1 (WCAG 1.3.1, 3.3.2, 4.1.2 Level A).
**Root:** Plan Task 20 wraps radios in a bare `<fieldset>` with no `<legend>`. The `<h2>Client workflow</h2>` sits outside the fieldset. Screen readers announce each radio without group context. Task 18 does the fieldset+legend pattern correctly one file away; Task 20 regressed it.
**Fix:** Move "How do you want your link to work?" into a `<legend>` inside the fieldset. Keep the `<h2>` as the section heading above.

### B11. ClientTracker column-count + missing `scope="col"` on headers
**Sources:** a11y C2 (WCAG 1.3.1 Level A).
**Root:** Existing table has zero `scope="col"` attributes. Plan Task 24 gates two `<th>`s + two `<td>`s on `checkInEnabled` without fixing the scope issue.
**Fix:** Add `scope="col"` to every `<th>`. Add a unit test asserting `getAllByRole("columnheader").length` matches cell count per row in both modes.

### B12. Middleware CSP nonce bug → every inline script blocked on /checkin, /court-date
**Sources:** Security M4.
**Root:** Plan Task 10 `setReferralCookie` helper returns `NextResponse.next()` bare — no `{ request: { headers: requestHeaders } }`. The existing `/r/` block at `middleware.ts:186-190` carries the nonce into both request-headers and response-headers. The refactored helper drops the request-headers step. Next.js 15+ SSR stamps inline `<script nonce="...">` using the request-headers nonce; without it, stamped nonce differs from the CSP header → every inline script blocked → page renders blank.
**Fix:** Port full nonce-forwarding pattern:
```ts
const requestHeaders = new Headers(req.headers);
requestHeaders.set("x-nonce", nonce);
requestHeaders.set("Content-Security-Policy", cspHeader);
const response = NextResponse.next({ request: { headers: requestHeaders } });
response.headers.set("Content-Security-Policy", cspHeader);
// set cookies on response as before
return response;
```
Add E2E smoke: load `/checkin/TEST` and assert a script with a nonce exists, no CSP violations.

### B13. Legacy `/r/{CODE}` for check-in-mode partner renders BridgePage body but metadata promises check-in signup
**Sources:** Dunford HIGH-3.
**Root:** Plan Task 15 branches METADATA + OG on `check_in_enabled` but leaves page body rendering BridgePage → BridgePage CTA sends to `/r/{CODE}/quiz`. Old QR codes: unfurl previews "Court Check-In," user taps, lands on a page that never enrolls them in check-ins.
**Fix:** In `src/app/r/[code]/page.tsx`, when `toggleEnabled && partner.check_in_enabled === true`, `redirect(\`/checkin/${code}\`)` at top of the page. Add E2E: `/r/{CHECK_IN_CODE}` end URL === `/checkin/{CHECK_IN_CODE}`.

---

## HIGH (required before ship)

### H1. Signup subhead is 42 words, fails Laja 27-word crisis-buyer ceiling
**Source:** Laja C1.
**Fix:** Two-beat subhead + bulleted deliverables list:
```
{partnerName} set this up for you.

You'll get:
  • Court-date reminders (SMS + email)
  • Check-in prompts between now and your hearing
  • A walkthrough of what happens in the courtroom
  • The questions your attorney should be answering for you
```

### H2. Discount note hedges with "if you want it later" → kills BOFU conversion
**Source:** Laja C3.
**Fix:** Commit, don't hedge:
```
Because {partnerName} sent you, 10% off case analysis is built in.
Already applied at checkout. No code to remember.
```
Mirror on BridgePage (Task 16) for funnel-voice consistency.

### H3. Suby "why NOW" missing from every CTA
**Source:** Suby C4.
**Fix:** Tether every CTA to the defendant's OWN deadline (court date):
- Signup page sub-CTA: `"First reminder lands within 10 minutes. Free until your court date."`
- Bridge page (Task 16) sub-CTA line: `"Your court date is [X days] away. Most people who prepare early get a second meeting with their attorney."`
- SMS templates: prefix `"Before your next court date:"` variant.

### H4. `/checkin` OG over-promises "Daily check-ins"
**Source:** Dunford HIGH-1.
**Fix:** OG subtitle in Tasks 12, 15 (check-in branch): `"Court check-in prompts, court date reminders,\nand what to expect at your hearing."` Drop "Daily." Keep category tag "Court Check-In" intact.

### H5. OG titles trailing-period, no service verb → iMessage unfurl unactionable
**Source:** Laja H5.
**Fix:**
- Check-in OG (Task 12): `title: "Set up your court check-in.\n— {partnerName}"`
- Referral OG (Task 14): `title: "Court date reminders +\nhearing prep — {partnerName}"`
- Legacy OG (Task 15): branch same.

### H6. Referral bridge reuses generic BridgePage → no mode-native value claim
**Source:** Dunford HIGH-2.
**Fix:** Add `checkInEnabled` prop to BridgePage. When `false`, render an extra body line:
```tsx
{!checkInEnabled && (
  <p className="text-zinc-300 mb-4">
    You'll get court-date reminders and a walkthrough of what to expect at your hearing, starting today.
  </p>
)}
```

### H7. FlipBanner contradicts "old link still works" in its first line
**Source:** Dunford HIGH-4.
**Fix:** Rewrite H1 from `"Your partner URL changed."` to `"You switched to {modeLabel}. Your link now points to the new mode."` Keep the "existing QR codes still work" reassurance below.

### H8. "Reminders only." label reads subtractive
**Source:** Dunford HIGH-5.
**Fix:** In Task 18 (signup radio) and Task 20 (dashboard toggle), change option-2 label to `"Referral-only."` Update design doc §8 to match.

### H9. Submit button "Set Up My Court Prep" mode-mismatched on check-in signup
**Source:** Correctness MED, Laja M4.
**Fix:** Add `submitLabel` prop to `CourtReminderForm`. Check-in mode passes `"Start My Check-Ins"`. Referral / self-serve uses `"Set Up My Court Prep"`.

### H10. MessageTemplates drops `aria-label` + `aria-live` (regression)
**Source:** a11y H1.
**Fix:** Copy buttons carry `aria-label={copiedIdx === i ? "Copied" : \`Copy ${t.label} template\`}` + `aria-live="polite"` — match `CreativeAssets.tsx:78-85` pattern.

### H11. FlipBanner no `role="status"` + vague "Dismiss" label
**Source:** a11y H2, H3.
**Fix:** Wrap banner div with `role="status"` + `aria-live="polite"`. Dismiss: `aria-label="Dismiss URL-change banner"` + `min-h-[44px]`.

### H12. 44×44 touch target floor violated on copy buttons, dismiss, radios
**Source:** a11y H4 (project rule overrides WCAG floor).
**Fix:** Copy buttons: `min-h-[44px] text-sm px-4 py-2.5`. Radio labels: `py-2 min-h-[44px]`.

### H13. ClientTracker dot indicators use `title` as only a11y name + color-only signal (1.4.1)
**Source:** a11y H5.
**Fix:** Replace each `title="…"` span with a visually-hidden `<span className="sr-only">…</span>` pattern. Replace the amber asterisk with a Lucide `<Star>` icon + sr-only label.

### H14. WorkflowToggle error message not associated with fieldset
**Source:** a11y M5.
**Fix:** `aria-describedby={error ? "workflow-error" : undefined}` + `aria-invalid={!!error}` on the fieldset; error `<p id="workflow-error" role="alert">`.

### H15. Radio tiles lack visible selected-state border
**Source:** a11y M6.
**Fix:** Conditional border on `<label>`: `border-amber-500 bg-amber-500/5` when selected.

### H16. `zinc-500` + `zinc-600` contrast failures
**Source:** a11y M1, M2.
**Fix:** Replace every `text-zinc-500` on `text-xs` with `text-zinc-400`. Replace ClientTracker `text-zinc-600` last-check-in date color with `text-zinc-400`.

### H17. OG routes have no rate-limit, DB-hit per request → user enumeration + DoS surface
**Source:** Security H3.
**Fix:** Add `export const revalidate = 300;` to each OG route. Add IP-keyed rate limit (5/min) via `checkRateLimit`. Guard `code` with `/^[A-Z0-9]{2,20}$/i` before DB.

### H18. Task 27 (ComplianceReportClient) deferred — too loose for executable plan
**Source:** Correctness CRIT, Security M3.
**Fix:** Read the existing client component in v2 plan, enumerate every check-in-specific element, gate each on `checkInMode === "disabled"`. Add unit test asserting no text matching `/check.?in|missed|schedule/i` renders when mode is disabled.

### H19. Legacy `/r/[code]` metadata description change affects pre-approved partners silently
**Source:** Correctness HIGH.
**Fix:** Metadata rewrite affects every existing partner. Gate on `NEXT_PUBLIC_CHECKIN_TOGGLE_ENABLED === "true"` to preserve pre-toggle messaging during dark deploy.

### H20. Missing seeded test partners for E2E
**Source:** Correctness HIGH.
**Fix:** Add Task 32 Step 0 SQL: insert fixture partners (`E2EBOND` with `check_in_enabled=true`, `E2EREFE` with `check_in_enabled=false`) in E2E setup script. Run via `E2E_SEED_READY=1` env var.

### H21. FlipBanner localStorage-only → cross-device flip-migration broken
**Source:** Laja H4.
**Fix:** Add `flip_at timestamptz NULL` to migration 20260417a. WorkflowToggle `handleSave` sets `flip_at = now()` server-side via settings PATCH. FlipBanner reads from dashboard response (`partner.flip_at`) and shows when `flip_at > now() - 14 days` AND no dismissal cookie.

### H22. Follow-up email opens "Just checking in" — corporate voice regression
**Source:** Suby H6.
**Fix:** Rewrite opening to specific, brand-voice cadence:
```
Subject: Still worth checking out — that case research

Hey [name],

Three weeks in, the people I've sent to ImNotAnAttorney say the same
thing: they walked into their next attorney meeting knowing what to
ask, instead of nodding along.
```

### H23. Partner-name trust anchor missing from "Quick share" + "For someone else" templates
**Source:** Dunford MED-2, Suby M3.
**Fix:** Every template opens with `[your name]` or `[your name] from [company]`.

### H24. Printed bail-packet card + compliance checklist bodies have no sales copy audit
**Source:** Suby H4.
**Fix:** Add Task 25.5 + Task 26.5 to v2 plan. Rewrite card H1 + bullet list copy. Rewrite checklist per B8.

### H25. "your own attorney" in X/Twitter template wedges client vs defense
**Source:** UPL Finding 2.
**Fix:** `"your own attorney"` → `"your attorney"` in the X/Twitter post (Task 23).

### H26. Task 11 signup page missing UPL disclaimer footer
**Source:** UPL Finding 3.
**Fix:** Add `<p className="text-zinc-400 text-xs text-center mt-6">ImNotAnAttorney provides legal information and questions, not legal advice.</p>` below the discount note.

### H27. Em-dash entities (`&mdash;`) introduced in multiple templates
**Source:** UPL Finding 5, Correctness LOW.
**Fix:** Replace all `&mdash;` entity references in v2 plan copy blocks with commas, periods, or ` - `. Humanizer detector threshold at 65pt.

---

## MEDIUM (required)

### M1. Partial index `WHERE check_in_enabled = true` near-useless with heavy-true column
**Fix:** Drop the partial index. Pre-fetch `enabledCodes` uses the existing `promo_code` unique index.

### M2. `validatePartnerSession` SELECT missing `check_in_enabled`
**Fix:** `src/lib/partner-auth.ts:152` SELECT list needs `check_in_enabled` added. Remove `partner-helpers.ts` from Task 5 Step 4 commit (no SELECT lives there).

### M3. Duplicate `getPartnerByCode` between `/r/[code]/page.tsx` and `/court-date/[code]/page.tsx`
**Fix:** Extract helper to `src/lib/partner-by-code.ts`. Import in both routes.

### M4. URL-builder logic duplicated in dashboard, WorkflowToggle, card, checklist
**Fix:** Use `computePartnerUrl` from `src/lib/partner-mode.ts` in Tasks 25 + 26 and WorkflowToggle.

### M5. OG files use `.single()`, page files use `.maybeSingle()` — inconsistent
**Fix:** Standardize on `.maybeSingle()` in all OG routes.

### M6. `/checkin/[code]` `notFound()` on mode mismatch → broken "old link still works" (Check-in → Referral flip)
**Fix:** `if (!partner.check_in_enabled) redirect(\`/court-date/${code}\`);` instead of `notFound()`. Symmetric with B13.

### M7. Legacy /r/ OG fallback renders check-in when DB fails (over-promise)
**Fix:** In `/r/[code]/opengraph-image.tsx` fallback path: `let checkInEnabled = false;` (generic safer).

### M8. Missing audit log when referral-mode partner hits schedule endpoint 403
**Fix:** After the 403 in Task 7, `console.warn("[Schedule] Referral-mode partner attempted schedule set", { partner_id: partner.id });` + insert `partner_events` row with `event_type: "schedule_denied_referral_mode"`.

### M9. Settings PATCH accepts unknown body keys (mass-assignment-adjacent)
**Fix:** Allowlist rejection at top of PATCH: if `Object.keys(body)` contains unknown keys, return 400.

### M10. Task 22/23 social template trailers identical
**Fix:** Per-channel variation: X ends `"10% off baked into the link:"`, Facebook `"(Discount built into the link. No code.)"`, general social `"Link + 10% off:"`.

### M11. Radios parallelism — "I run check-ins." vs "Reminders only." mixes verb + feature-label
**Fix:** Covered by H8 — use `"I run check-ins."` / `"Referral-only."` primary labels.

### M12. Task 11 eyebrow "COURT CHECK-IN" repeats H1
**Fix:** Eyebrow: `"FROM YOUR BONDSMAN"` or `"SET UP IN 60 SECONDS"`.

### M13. CTA weakness — Bridge CTA "Take Back Control of Your Case" is aspirational, not outcome-tangible
**Fix:** `"See My Case's Questions"` or `"Show Me The Questions My Attorney Should Answer"`. Keep pro-defendant posture.

### M14. CTA weakness — WorkflowToggle "Save workflow setting" generic admin-ops verb
**Fix:** Mode-aware: `"Switch to Referral Mode"` / `"Switch to Check-In Mode"`.

### M15. No numbers / social proof on signup + bridge
**Fix:** Proof-strip below headline on both pages: `"15,386 judges researched. 33,000+ cases analyzed."` Verified from INAA memory.

### M16. "Walkthrough of what to expect" is abstract — appears 8+ places
**Fix:** Name concretely ONCE: `"a page on your prep dashboard walking through exactly what happens in a [charge_type] hearing — who speaks when, what the judge asks, and the one sentence most defendants get wrong."` Apply same description on every surface.

### M17. WorkflowToggle helper text exposes raw URL paths, no category label pairing
**Fix:** Pair URL with category tag:
```
Check-in mode: your clients see "Court Check-In" previews at
  imnotanattorney.com/checkin/{CODE}
Referral mode: your clients see "Court Prep" previews at
  imnotanattorney.com/court-date/{CODE}
```

### M18. WorkflowToggle URL-hint block uses `<p>` for a list
**Fix:** Semantic `<ul>` + `<li>`.

### M19. FlipBanner URL can overflow → horizontal scroll (1.4.10)
**Fix:** Add `break-all` to the URL span.

### M20. Task 11 discount copy has vague "case analysis" — Suby abstraction
**Fix:** Covered by H2. "Case analysis" stays (shorthand for CD/IB/X-Ray bundle); drop "if you want it later."

### M21. Cron Phase 2 `.not("partner_promo_code", "is", null)` redundant after `.in(enabledCodes)`
**Fix:** Remove `.not(...)` after switching to `.in(enabledCodes)`.

### M22. Legacy `/r/{CODE}` page-body branch missing
**Fix:** When `toggleEnabled && !partner.check_in_enabled`, `/r/{code}` renders BridgePage with `checkInEnabled={false}` prop (H6). Pre-toggle: existing behavior.

### M23. Messaging + Creative asset copy doesn't mention the 10% anchor is dollar-indexed
**Fix:** Where space permits (intro email, follow-up email), quote a concrete dollar: `"10% off — that's $100 off case analysis, already in the link."` Anchor on IB ($997) since it's the most-converted tier.

### M24. Bondsman "Reminders only" helper uses consultant language
**Fix:** Lead with bondsman reality:
```
Your surety doesn't let you run check-ins, or you've decided not to.
Your clients get court date reminders and hearing prep. You stay out
of the check-in workflow entirely.
```

### M25. Task 20 WorkflowToggle missing "best if" persuasion for mode decision
**Fix:** Prepend each mode radio with a "Best if…" one-liner:
```
Check-in mode — Best if you already track clients between bond and court.
Referral mode — Best if you bond-and-forward.
```

### M26. SMS templates missing "do it tonight" urgency
**Fix:** Every SMS template gets a time-to-complete ("60 seconds") + "do it tonight" line.

### M27. PartnerApplicationForm post-submit uses passive "check email" framing
**Fix:** Three-step active onboarding — activation, game plan, first-client-within-10-minutes. Full copy in v2 plan.

### M28. Compliance report must also blank `check_in_days` + `check_in_source` in referral mode
**Fix:** In API response (Task 8), when `!partner.check_in_enabled`, map clients to strip those fields.

### M29. Task 16 partial snippet safe (flagged false-positive in correctness)
**Fix:** V2 plan explicitly notes surgical `<p>` replacement; closing tags preserved.

### M30. OG subtitle `\n` hardcoded — long partner names overflow
**Fix:** Truncate `partnerName` to 24 chars (with ellipsis) before passing to `renderOgImage()`.

### M31. Toolkit promo code demotion
**Covered by B9.**

### M32. CourtReminderForm funnel fork
**Covered by B2.**

---

## LOW (fix all per repo policy)

### L1. Consent checkbox + STOP + privacy line absent from check-in signup
**Fix:** Add explicit consent near phone field:
```
☐ I agree to text and email from ImNotAnAttorney about my court date
  and check-ins. Message/data rates may apply. Reply STOP to opt out.
  Privacy policy.
```

### L2. Task 11 long partner-name span may wrap mid-word
**Fix:** Add `break-words` to the partner-name `<span>`.

### L5. Task 11 `partner.promo_code!` non-null assertion
**Fix:** Replace `!` with explicit guard `if (!partner.promo_code) notFound();`.

### L7. Task 22 closing helper text verbose
**Fix:** `"Replace [name] and [your name]. The link carries the 10% discount, no codes."`

### L8. Task 26 QR builder nested-ternary
**Fix:** Use `computePartnerUrl` helper (M4).

### L9. OG em-dash entities
**Covered by H27.**

### L10. Task 32 `vercel env ls` allowed
**Fix:** CLAUDE.md bans `vercel deploy`, `vercel env pull`, `vercel domains`. `env ls` not listed. Allow. Document.

### L11. Task 32 "check logs next day" is operator follow-up
**Fix:** Mark as follow-up note, not checkbox task.

### L12. Task 30 OG-metadata assertion too loose
**Fix:** Tighten regex to `/Court Prep.*Referred/i`.

### L13. OG alt text static
**Fix:** Accept as-is; Next.js `alt` is module-level, cannot be dynamic.

### L14. Task 11 eyebrow casing — Tailwind `uppercase` handles it. No-op.

### L15. Task 9 cron mock microtask flush
**Fix:** Add `await new Promise(r => setTimeout(r, 0));` before assertions.

### L16. Task 7 test lacks positive-path
**Fix:** Second test: `check_in_enabled=true` + valid client → expected behavior.

### L18. Apply/settings `check_in_enabled` unknown/missing behavior
**Fix:** Both routes: undefined → column default. Null → default. Invalid → 400.

### L19. OG subtitle `\n` rendering
**Fix:** No action; `og-template.tsx` handles it.

### L20. BridgePage test negative assertion
**Fix:** Present in plan (`expect(queryByText(/saves you 10%/)).toBeNull();`).

### L24. `/court-date/[code]/page.tsx` 404 copy
**Fix:** Match `/r/[code]/page.tsx:72-89` pattern.

### L28. OG title character budget
**Covered by M30.**

### L29. E2E CI env var
**Covered by H20.**

### L32. BridgePage "hold your attorney accountable" wording
**Track:** Out-of-scope follow-up at `docs/handoffs/2026-04-18-bridge-page-attorney-framing-rewrite.md`.

### L33-L35. Em-dash in paste-copy, post-submit, WorkflowToggle helper
**Covered by H27.**

### L36. Migration atomicity — explicit BEGIN/COMMIT
**Fix:** Wrap migration body in `BEGIN; … COMMIT;`.

### L37. Migration rollback script
**Fix:** Commit `supabase/migrations/rollback_20260417a.sql` with `ALTER TABLE partners DROP COLUMN check_in_enabled; DROP COLUMN flip_at;`. Not auto-applied.

### L38. Step 3 invariant fail-hard
**Fix:** Node wrapper asserts no `bondsman,false` or `non-bondsman,true` rows. Exit 1 if violations.

---

## Out-of-scope (tracked follow-ups)

### F1. BridgePage "hold your attorney accountable" wording (UPL Finding 1)
Track: `docs/handoffs/2026-04-18-bridge-page-attorney-framing-rewrite.md`.

### F2. Bondsman `apply` endpoint admin-approval gate (Security H2 extended)
Track: `docs/handoffs/2026-04-18-bondsman-apply-approval-gate.md`.

### F3. Full card-copy rewrite beyond the callout block
V2 plan handles the callout (B7). Full card rewrite (new H1, new bullets) lands in a follow-up design pass.

---

## Fix ordering for v2 plan

1. **Migration** (B5, B6, H21, L36-L38): bondsman-only default, source allowlist, `flip_at` column, rollback, atomicity.
2. **PostgREST FK fix** (B1): swap inner-join for `.in(enabledCodes)` pre-fetch as primary.
3. **CourtReminderForm extension** (B2, B3, B4, H9, L1): add `phone`, `submitLabel`, `redirectTo`, `requirePhone`, `consent` props. Cut signup fields to ≤5.
4. **Signup page rewrite** (H1, H2, H3, M12, M15, M16, H26): subhead + bulleted deliverables + commit discount + UPL disclaimer + proof strip + concrete walkthrough.
5. **BridgePage mode-aware** (H6, H2, M13): accept `checkInEnabled` prop + outcome-tangible CTA.
6. **OG titles** (H4, H5, M30): new verbs + partner-name truncation.
7. **Legacy /r/[code] branching** (B13, H19, M22): redirect check-in partners + mode-aware page body.
8. **Printed collateral** (B7, B8, H24): card + checklist copy + H1 branching.
9. **Dashboard surfaces** (B9, B10, H10-H16, H21, M17-M19, M25): Toolkit demotion + WorkflowToggle legend + FlipBanner live region + table scope + aria-labels + 44×44 + selected-state border + server-side `flip_at`.
10. **Templates** (H22, H23, H25, H27, M10, M23, M26, M27, L7): copy rewrites across MessageTemplates + CreativeAssets + PartnerApplicationForm.
11. **API hardening** (B5, B6, H17, M7, M8, M9, M28): source allowlist + OG rate-limit + 403 audit log + PATCH key-allowlist + response-field stripping.
12. **Tests + DevOps** (H20, H18, L15, L16, L29, L37, L38, M21): seeded partners + ComplianceReportClient enumeration + test integrity + rollback script + invariant assertions.
13. **Cleanup** (M2-M6, L2, L5, L8, L12, L36): helper extractions + `.maybeSingle()` standardization + guards + regex tightening.

---

## Sign-off checklist for v2 plan

- [ ] All 13 CRITICALs resolved
- [ ] All 27 HIGHs resolved
- [ ] All 32 MEDIUMs resolved
- [ ] All 38 LOWs resolved (including 3 out-of-scope tracked as follow-up docs)
- [ ] Dunford cascade test re-run
- [ ] Atticus UPL pass re-run
- [ ] Laja 27-word crisis-buyer ceiling enforced on every hero
- [ ] Suby "why NOW" on every primary CTA
- [ ] 44×44 touch-target audit passes
- [ ] E2E seeded test partners added
- [ ] Rollback script committed
- [ ] CLAUDE.md pristine-or-nothing policy satisfied
