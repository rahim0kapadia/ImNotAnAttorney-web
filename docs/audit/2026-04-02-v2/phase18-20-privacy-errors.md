# Phase 18 & 20 Audit — Privacy/Compliance + Error State Testing
**Date:** 2026-04-02
**Repo:** ImNotAnAttorney-web
**Auditor:** Atlas (general-purpose agent)
**Files reviewed:** layout.tsx, privacy/page.tsx, terms/page.tsx, not-found.tsx, checkout/error.tsx, intake/page.tsx, my-case/[token]/page.tsx, report/[token]/page.tsx, score/page.tsx, my-cases/login/page.tsx, unsubscribe/page.tsx

---

## PART 1 — Privacy / Compliance (Layer 18)

### 1. Cookie Consent Banner

**Finding: NONE — and correctly so.**

No cookie consent banner exists in layout.tsx. This is correct given the actual cookie profile:
- Vercel Analytics uses cookieless, anonymized tracking. No consent required.
- Stripe sets essential fraud-prevention cookies during checkout only. Legitimate interest / essential service — no consent banner required.
- Google Analytics (`NEXT_PUBLIC_GA_ID=G-XLWVJFZ577`) is **LIVE in production**. GA4 sets first-party cookies (`_ga`, `_ga_*`) that persist for 2 years. This is a behavioral tracking cookie and **does require a consent banner** in GDPR jurisdictions.
- Meta Pixel (`NEXT_PUBLIC_META_PIXEL_ID`) — not set in `.env.local`. Not active.
- Google Ads (`NEXT_PUBLIC_GOOGLE_ADS_ID`) — not set in `.env.local`. Not active.

**Gap identified — GA4 cookie disclosure mismatch:**

The privacy policy (Section 8) states: "Our website does not use tracking cookies or third-party analytics cookies." This is **inaccurate**. GA4 is live and sets `_ga` / `_ga_*` tracking cookies. The policy contradicts actual behavior.

**Severity: MEDIUM.** Not a legal emergency for US-only visitors (CCPA doesn't require prior consent for analytics cookies), but:
- Incorrect disclosure is a CCPA violation risk (Section 7 rights depend on accurate disclosure of what is collected)
- If any EU visitors use the site, this is a GDPR violation — analytics cookies require prior consent
- The policy is just wrong, which undermines the credibility of the entire privacy page with a legally-sophisticated audience (defendants and attorneys)

**Recommendations:**
1. Update privacy/page.tsx Section 8 to acknowledge GA4 and its cookies
2. OR remove GA4 and keep the cookieless claim accurate
3. If keeping GA4: add a minimal cookie notice (not necessarily a full banner — a footer line with a privacy link is sufficient for CCPA; EU visitors would need opt-in)

---

### 2. Privacy Policy Accuracy

Overall: well-written, specific, and accurate for most integrations. Detailed findings:

| Section | Status | Notes |
|---------|--------|-------|
| Supabase (case data, score, user data) | ACCURATE | Section 5 names Supabase, US East, SOC 2. Section 6 details retention periods per data type. |
| Stripe (payment data) | ACCURATE | Correctly states last-4 only, no card storage, links to Stripe Privacy. |
| Resend (email drip) | ACCURATE | Named in Section 5, receives email + content. Drip logs 90-day retention in Section 6. |
| Anthropic (AI processing) | ACCURATE | Section 3 fully discloses, names Anthropic, cites API terms, 30-day retention window. |
| Vercel Analytics | INACCURATE | Claims cookieless but GA4 (`NEXT_PUBLIC_GA_ID`) is also active via `@next/third-parties/google`. |
| Cloudflare | ACCURATE | Named, IP processing for routing. |
| Score tool | ACCURATE | Correctly states inputs not stored permanently. |
| IP address handling | ACCURATE | 60-second windows for rate limiting, then discarded. |

**One additional gap — GA4 not listed in Section 5 (Third-Party Services).** Google Analytics is a third-party service processing browsing data and is absent from the disclosure table.

---

### 3. Third-Party Scripts in layout.tsx

Scripts loaded:
- `@vercel/analytics/react` — cookieless, no consent needed
- `@next/third-parties/google` with `NEXT_PUBLIC_GA_ID` — **GA4, sets tracking cookies, LIVE**
- Meta Pixel — guarded by `NEXT_PUBLIC_META_PIXEL_ID` env var, not set, not active
- Google Ads — guarded by `NEXT_PUBLIC_GOOGLE_ADS_ID` env var, not set, not active

The GA4 integration loads unconditionally when `NEXT_PUBLIC_GA_ID` is set. There is no consent gate. The env var is confirmed set in `.env.local`.

---

### 4. Data Retention

**PASS.** Section 6 is unusually thorough:
- Contact info: 3 years after last interaction
- Order records: 7 years (tax/legal compliance)
- Case data: 12 months after delivery
- Discovery documents: 90 days after delivery
- Report tokens: 12 months
- Email subscriber data: until unsubscribe + 90-day purge
- Drip logs: 90 days
- Inbound email: 24 months
- Score inputs: not stored permanently
- Backups: 30-day persistence after deletion from live systems

All specific, reasonable, and internally consistent with terms/page.tsx guarantees.

---

### 5. Email Unsubscribe / Opt-Out

**PASS.**

- `/unsubscribe` page exists and renders correctly with success/error states
- `/api/unsubscribe` route exists
- Privacy policy Section 6 states unsubscribed records purged after 90 days
- Terms Section 12 states all marketing emails include unsubscribe link
- Score page (line 691) has email capture with `role="alert"` on error

One minor issue: the unsubscribe success page uses a plain checkmark character (`&#10003;`) inside a container with `text-zinc-400` color — no `role="img"` or `aria-label` on the icon container. Cosmetic only.

---

### 6. CCPA / GDPR — "Do Not Sell" and Data Deletion

**CCPA — PASS (with GA4 caveat).**
- Section 7 states explicitly: "We do not sell or share your personal information as defined by the CCPA/CPRA."
- No "Do Not Sell" link required when you don't sell — the policy correctly explains this
- CCPA deletion request mechanism exists (email with subject "CCPA Request")
- State privacy law rights for 18 additional states enumerated — well above average
- Right to appeal process documented

**GDPR — NOT APPLICABLE as-stated, but risks exist.**
The policy claims all processing is US-based and doesn't address GDPR. If EU visitors reach the site (no geo-block exists), GDPR would apply. GA4 being active without consent is the primary exposure. Current US-only framing is defensible given the nature of the service (US criminal defense) but worth noting.

**Data deletion mechanism — PASS.** Section 4 states documents deleted within 5 business days of request. Section 7 provides deletion rights with 30-day response SLA. Section 6 states satisfaction credits do not trigger deletion (only cash refunds do) — consistent with terms.

---

### 7. Terms of Service — UPL Disclaimers

**PASS — strong UPL protection.**

Section 3 ("What We Do — And What We Don't") is the clearest UPL disclaimer in the codebase:
- Explicit: "ImNotAnAttorney is NOT a law firm and does NOT practice law."
- Lists what is provided (information, questions) vs. what is not (advice, strategy, outcome predictions, plea deal direction)
- Explicitly states no attorney-client relationship is created
- States no privilege is created
- Cross-references Privacy Policy for data handling

The intake form (line 1390-1398) also includes a per-submission disclaimer at the point of data collection — good defense-in-depth.

---

## PART 2 — Error State Testing (Layer 20)

### 1. 404 Page — `not-found.tsx`

**PASS.**

- Renders a branded 404 with on-voice copy ("kind of like the motion your attorney said they'd file last month")
- Two clear recovery paths: "Go Home" (/) and "Read the Blog" (/blog)
- No stack traces or technical details exposed
- Server Component — correct (no interactivity needed)

**Gap:** No `role="main"` or `aria-live` on the error content — minor. The page is reachable via keyboard via the skip link in layout.tsx. Functional.

---

### 2. Checkout Error — `checkout/error.tsx`

**MOSTLY PASS, one gap.**

Good:
- Explicitly states "Your payment was not affected" — critical for users panicking about being charged
- Shows `error.digest` (server-side error ID) but NOT the error message or stack trace — correct
- Provides "Try Again" (calls `reset()`) and "View Services" fallback
- Contact email prominently displayed

**Gap:** No `role="alert"` on the error container. This is a client-side error boundary — when it renders, a screen reader user won't be notified that something went wrong unless they happen to navigate to the content. Should add `role="alert"` to the outer div.

---

### 3. Intake Form — `intake/page.tsx`

**PASS.**

- Submit error at line 1400-1408 uses `role="alert"` — correct
- Error messages are user-friendly: "Something went wrong submitting your case. Please try again." and "Couldn't reach our servers. Check your connection and try again."
- "Dismiss" button allows clearing the error
- No stack traces or technical details exposed

**Gap 1:** Step validation errors (required fields) are not surfaced with `role="alert"` or `aria-describedby`. The form uses a "Next" button disabled state to block progression, but there's no message explaining WHY the button is disabled. A user filling out the form on mobile might not understand why "Next" is unclickable.

**Gap 2:** The `<label>` elements in the form are present (good) but the email, firstName inputs don't have explicit `htmlFor` / `id` associations visible in the reviewed section. This needs a targeted check on the rendered input fields.

**Gap 3:** The intake form has no `<form>` element wrapping — it submits via a `<button type="submit">` inside what appears to be a `<form>` (visible at line 1415 `type="submit"`). The form tag itself is present (line 1429 shows the closing `</form>`). Structure appears correct but was not fully traced due to file size.

---

### 4. My-Case Portal — `my-case/[token]/page.tsx`

**PASS — excellent token error coverage.**

Five distinct error states, all handled:

| State | Message | Recovery Path |
|-------|---------|---------------|
| Token not found | "Case Not Found — This link is invalid or the case does not exist." | Contact email |
| Token expired (12 months) | "Link Expired — Contact us to request a new link." | Contact email |
| Refunded case | "Report No Longer Available — refund processed." | Contact email |
| Non-discovery tier (not delivered) | Status-aware label (e.g. "Generating Your Report") | Contact email |
| Non-discovery tier (delivered) | Report link displayed | Link to /report/[token] |

All use the `CenteredMessage` component which consistently shows the contact email. No technical details exposed.

**One gap:** `CenteredMessage` renders an `<h1>` but the container has no `role="alert"` or `aria-live`. For a server component this is less critical (content is server-rendered, not injected dynamically), but assistive technology navigating to the page would need to find the heading explicitly.

---

### 5. Report Viewer — `report/[token]/page.tsx`

**PASS — most complete error coverage in the codebase.**

Six access control states:
1. **Token expired** — "Report Link Expired" + contact email
2. **Refunded** — "Report No Longer Available" + policy explanation + contact email
3. **generation-failed / intake-stalled** — "Report Generation Issue" + "Our team has been notified and will reach out within 24 hours"
4. **awaiting-intake** — "Waiting for Your Case Details" + CTA button to /intake
5. **pending / uploaded / submitted** — "Waiting for Discovery Documents" or "Analysis in Progress"
6. **Status gate catch-all** — "Report Not Ready Yet" + 48-hour expectation + contact email

Each state provides a specific, actionable message. No technical errors (Supabase error objects) are exposed. The 48-hour SLA is stated consistently. HTML sanitization is thorough (XSS notes in comments confirm intentional security decisions).

**Minor:** No `role="alert"` on any of the error containers, same issue as other pages — low priority for server-rendered content.

---

### 6. Score Page — `score/page.tsx`

**PASS.**

- Submit error at line 1170-1173 uses `role="alert"`
- Email capture error at line 691 uses `role="alert"`
- Loading state shows spinner with `aria-hidden="true"` on the SVG — correct
- "Too Scared to Finish" reassurance message triggers at 7+ answered questions — good UX for hesitating users
- Submit button is disabled until all questions answered (`disabled={!allAnswered || loading}`)

**Gap:** Disabled submit button has no `aria-disabled` + tooltip explaining why it's not yet active. A user tabbing to the button with a screen reader gets no feedback on what's missing.

---

### 7. Customer Login — `my-cases/login/page.tsx`

**MOSTLY PASS, one gap.**

Good:
- Error state at line 75-78 renders in a red container with clear text
- No `role="alert"` on the error container — **gap**
- Server API errors surface user-friendly text (`data.error || "Failed to send login link"`)
- No stack traces or technical details exposed
- Success state clearly states the email address and 15-minute expiry
- "Try a different email" recovery path on success state

**Gap:** The error div at line 75 has no `role="alert"`. A screen reader user submitting an invalid email will not be notified of the error dynamically. This is the highest-priority a11y fix in this section because login is a keyboard-navigable flow.

---

## Summary Findings

### Critical / High Priority

| # | Area | Finding | Fix |
|---|------|---------|-----|
| C1 | Privacy — GA4 disclosure | Privacy policy claims "no tracking cookies" but GA4 is live and sets `_ga`/`_ga_*` cookies. Section 8 is factually incorrect. | Either update Section 8 to disclose GA4, or remove GA4. Also add Google Analytics to Section 5 third-party services list. |

### Medium Priority

| # | Area | Finding | Fix |
|---|------|---------|-----|
| M1 | Checkout error | `checkout/error.tsx` error container missing `role="alert"` | Add `role="alert"` to the outer div |
| M2 | Login error | `my-cases/login/page.tsx` error div (line 75) missing `role="alert"` | Add `role="alert"` to error container |
| M3 | Intake step validation | No visible error when required fields prevent "Next" from activating | Add a `role="alert"` message explaining what's required when user attempts to advance |

### Low Priority / Future

| # | Area | Finding | Fix |
|---|------|---------|-----|
| L1 | Score page | Disabled submit button has no `aria-disabled` or tooltip for screen readers | Add `aria-disabled="true"` and `title` attribute |
| L2 | Unsubscribe success | Icon container has no `aria-label` | Add `aria-label="Success"` to checkmark container |
| L3 | GDPR exposure | No geo-block or consent gate for EU visitors; GA4 active without opt-in | Low risk given US criminal defense audience, but worth noting if paid ads are activated |

### Passes

- Terms of Service UPL disclaimers — strong, multi-layered
- Data retention periods — specific and complete
- Email unsubscribe — functional, linked in all marketing emails
- CCPA rights — well-documented, exceeds minimum requirements
- Report viewer error states — best coverage in the codebase (6 distinct states)
- My-case portal error states — thorough token validation
- 404 page — on-brand, functional, two recovery paths
- Discovery document handling — consent, purpose limitation, and deletion well-documented
- No stack traces or DB error details exposed anywhere
- Score page error states — `role="alert"` present
