# Pipeline Audit Checklist

Reusable per-tier checklist for auditing the entire customer pipeline. Created 2026-02-24 after a 4-round deep audit that found 26 gaps across infrastructure, email, UX, and billing.

## Prior Audit Documents

| Doc | Date | Scope | Status |
|-----|------|-------|--------|
| `ImNotAnAttorney/docs/archive/GAP-ANALYSIS-2026-02-19.md` | 2026-02-19 | Full site, 105 items | Archived — open items migrated here |
| `ImNotAnAttorney/docs/archive/SESSION-STATUS-2026-02-23.md` | 2026-02-23 | 33 pipeline tasks | Archived — all tasks complete |
| `ImNotAnAttorney/docs/archive/SITE-AUDIT-REPORT-2026-02-21.md` | 2026-02-21 | 12-expert audit, 45+ items | Archived — open items migrated here |
| `ImNotAnAttorney/docs/plans/2026-02-19-full-launch-readiness.md` | 2026-02-19 | Original build plan | Complete |
| Plan: peppy-launching-rabbit | 2026-02-24 | 4-round deep audit, 26 gaps | Complete |
| 3-agent IB pipeline audit | 2026-03-03 | IB happy-path + gaps | Complete — fixes in this commit |

## Checklist (Per Tier)

### Infrastructure Safety Nets

- [x] Webhook failure detection (Stripe reconciliation in cron Part 9a)
- [x] Orphan order detection (order exists, no case — cron Part 9b)
- [x] Intake abandonment escalation (24h reminder → 72h alert → 7d alert)
- [x] Cron heartbeat monitoring (`cron_runs` table + staleness check)
- [x] Advisory lock prevents concurrent cron runs

### Customer Email Touchpoints

- [x] Payment confirmation (immediate via webhook, with retry)
- [x] "Complete your details" (if no intake, immediate via webhook)
- [x] Intake confirmation (immediate via intake route)
- [x] Generation started notification (Case Decoder — via deliver route)
- [ ] Status updates during processing (if >48h delivery — discovery tiers only)
- [x] Delivery email (with retry + simplified fallback)
- [x] Post-purchase drip sequence (with retry via sendEmailWithRetry)
- [x] Partial refund confirmation email (webhook charge.refunded handler)
- [x] Report expiring soon (30 days before token expiry — cron Part 10)
- [x] Abandoned checkout recovery (24-48h after abandonment — cron Part 11)

### Error States (Customer-Facing)

- [x] Success page: payment not verified → session ID + support email shown
- [x] Report page: expired token → explains expiration + contact info
- [x] Report page: refunded → explains policy + contact info
- [x] Report page: generation-failed → explains status + ETA
- [x] Report page: awaiting-intake → directs to intake form
- [x] Intake form: server error → specific message + retry
- [x] Checkout: invalid tier → links to /services (not /#pricing)

### Billing & Upgrade Logic

- [x] Upgrade credit only from lower tiers (no self-credit)
- [x] Refunded orders void future upgrade credit
- [x] Zero-amount sessions prevented (min $0.50 charge)
- [x] Refund bounce detection (charge.refund.updated webhook)

### Security

- [x] All user data in operator emails escaped (escapeHtml in cron Parts 3-5)
- [x] Duplicate submission prevention (intake: 60s dedup)
- [x] Rate limiting on public endpoints (Upstash via checkRateLimit)
- [x] HMAC-signed operator tokens with expiry

### UX

- [x] Required field indicators on forms (red asterisks on intake)
- [x] Email validation on blur (checkout page, not just submit)
- [x] Mobile touch targets >= 44px on interactive elements (score page)
- [ ] No silence gaps > 48h in customer communication (discovery tiers need status emails)
- [x] OTO timer uses server-side TTL (sessionCreated from Stripe, not localStorage only)

## Per-Tier Status

| Tier | Price | Checklist Status | Last Audited |
|------|-------|-----------------|-------------|
| Case Decoder | $197 | COMPLETE | 2026-02-24 |
| Intelligence Brief | $997 | AUDITED | 2026-03-03 |
| X-Ray | $2,497 | Pending | -- |
| War Room | $4,997 | Pending | -- |
| Situation Room | $9,997 | Pending | -- |

## Intelligence Brief ($997) — Audit Results (2026-03-03)

3-agent audit of the full IB pipeline. Happy path fully wired; bugs fixed in this commit.

### Pipeline Steps (all verified)

- [x] Stripe checkout creates session with `tier: intelligence-brief`
- [x] Webhook creates order + case, auto-triggers CD generation (included)
- [x] Phase 2 intake form collects judge/county/case details
- [x] Phase A dispatcher fires Edge Function with `phase: A`
- [x] Phase A generates 5 sections in parallel, saves to `section_outputs`
- [x] Phase A failure threshold aborts if 4+/5 sections fail (fixed this commit)
- [x] Operator email with judge-research instructions sent after Phase A
- [x] Judge-research endpoint saves data + triggers Phase B
- [x] Judge-research skip-save on empty `{}` retry (fixed this commit)
- [x] Phase B generates 4 sections sequentially with variable rebuild
- [x] `your-plan` section gets fresh variables after `case-intelligence` (fixed this commit)
- [x] HTML report includes ToC, Brady/Giglio checklist, Your Rights appendix (fixed this commit)
- [x] Page-break dividers between sections for print (fixed this commit)
- [x] Report token generated, HTML stored, case → review
- [x] Delivery email sent to customer with report link
- [x] Cron detects stuck-compiling (30min) → generation-failed + operator alert
- [x] Stuck-compiling email has working retry curl command (fixed this commit)
- [x] Cron detects stuck-researching (24h) → operator nudge
- [x] Migration 005 (`email_log`) applied
- [x] Report viewer renders IB HTML (tier-agnostic)
- [x] Refund webhook revokes report access
- [x] Upgrade credit from IB ($997) applied to X-Ray checkout
- [x] Rate limiting on IB-specific endpoints
- [x] Post-purchase drip: delivery + story harvest (day 5) + upsell (day 10)
- [x] Intake reminder SLA text branches for IB tier (fixed this commit)

## Deferred Items

Organized by severity. Each item includes full original context from the source audit document.

### HIGH Severity

#### E2. 10-25 Day Silence During Analysis
**Source:** peppy-launching-rabbit audit (2026-02-24) | **Tier:** X-Ray / War Room / Situation Room | **Effort:** Medium (8h)

Discovery-tier customers ($2,497+) experience 10-25 days of radio silence while their case is being analyzed. No status update emails exist during this period. For a panicking defendant who just spent thousands, silence equals abandonment.

**Fix needed:** Implement automated status update emails at day 7, 14, and 21 of analysis. Add to cron drip sequence with `relativeToDelivery: false` (relative to order date). Content should reassure: what phase the analysis is in, what's been completed, expected next update.

**Files:** `src/app/api/cron/drip/route.ts`, `src/lib/drip-emails.ts`, possibly `cases` table (add analysis milestone tracking)

---

#### E4. Upload Reminder — Broken Template Variables
**Source:** peppy-launching-rabbit audit (2026-02-24) | **Tier:** X-Ray / War Room / Situation Room | **Effort:** Low (30min)

The cron upload reminder email contains `{{CASE_ID}}` template variables that are never resolved — customers receive emails with raw template syntax like `{{CASE_ID}}` instead of their actual case ID.

**Fix needed:** Replace `{{CASE_ID}}` with JavaScript template literal interpolation (`${case.id}`) in the cron email builder.

**Files:** `src/app/api/cron/drip/route.ts`

---

#### U2. Discovery Success Page Says "Upload Link Emailed" — Never Sent
**Source:** peppy-launching-rabbit audit (2026-02-24) | **Tier:** Discovery tiers ($2,497+) | **Effort:** Low (30min)

The checkout success page for discovery tiers says "You'll receive an email with your upload link shortly" — but no such email is ever sent. The upload link IS shown directly on the success page, making the text a false promise that causes post-purchase anxiety when no email arrives.

**Fix needed:** Either (a) send a separate upload link email from the webhook (add to discovery-tier webhook flow), or (b) change the success page text to "Use the upload link above to submit your discovery documents."

**Files:** `src/app/checkout/success/page.tsx`, optionally `src/app/api/webhooks/stripe/route.ts`

---

### MEDIUM Severity

#### E7. War Room Weekly Updates — Fires Once, Not Recurring
**Source:** peppy-launching-rabbit audit (2026-02-24) | **Tier:** War Room ($4,997) | **Effort:** Medium (4h)

The War Room tier promises weekly progress updates to customers, but the cron job only sends a single update notification. No recurring scheduler tracks when the last update was sent or triggers the next one.

**Fix needed:** Add recurring weekly check in cron for active War Room cases (`status = 'in-progress'` or similar). Track `last_weekly_update_at` on the case, trigger new update email if >7 days since last. Content template needed for the weekly digest.

**Files:** `src/app/api/cron/drip/route.ts`, `src/lib/drip-emails.ts`, possibly `cases` table (add `last_weekly_update_at`)

---

#### P3. Customer Coupon Overrides Upgrade Credit
**Source:** peppy-launching-rabbit audit (2026-02-24) | **Tier:** All upgrades | **Effort:** Medium (4h)

If a customer has both a promotional coupon and an upgrade credit from a prior purchase, the Stripe checkout session only applies one discount. The upgrade credit (implemented as a Stripe coupon) may be overridden by a manual promotional coupon, causing the customer to lose their earned upgrade credit.

**Fix needed:** Configure Stripe checkout to stack coupons (use `discounts` array with multiple entries), or combine both discounts into a single calculated coupon at checkout time.

**Files:** `src/app/api/checkout/route.ts`

---

#### IB8 / M9. No Operator Dashboard
**Source:** IB audit (2026-03-03) + GAP-ANALYSIS (2026-02-19) | **Tier:** All | **Effort:** 16-24 hours

All operator awareness is email-driven — Rahim has no web dashboard to view orders, cases, intakes, pipeline status, or stuck cases. Every operational action requires checking email or querying Supabase directly. At low volume (pre-launch), email notifications are sufficient. At scale, this becomes a critical bottleneck.

**What it would need:** Order list with status filters, case pipeline view, intake queue, stuck-case alerts, delivery action buttons, revenue dashboard.

**Status:** Deferred — email-driven ops works at launch volume. Revisit after first 10-20 customers establish operational patterns.

---

#### M2. Tier Data in 3+ Places (Drift Risk)
**Source:** GAP-ANALYSIS (2026-02-19) | **Tier:** All | **Effort:** 4 hours

Tier names, prices, features, and delivery times are hardcoded in multiple files: `src/lib/stripe.ts`, `src/app/services/page.tsx`, `src/components/PricingTable.tsx` (originally 5 files per GAP-ANALYSIS, reduced to 3 during Feb 2026 pipeline session). Any pricing or feature change requires updating all locations manually — creating drift risk where one file shows $997 and another shows $497.

**Fix needed:** Make `stripe.ts` the single source of truth for all tier data. `PricingTable.tsx` and `services/page.tsx` should import tier config from `stripe.ts` instead of maintaining separate hardcoded copies.

**Files:** `src/lib/stripe.ts` (source), `src/app/services/page.tsx` (consumer), `src/components/PricingTable.tsx` (consumer)

---

### LOW Severity

#### P4. Partial Refund Doesn't Reduce Upgrade Credit
**Source:** peppy-launching-rabbit audit (2026-02-24) | **Tier:** All upgrades

If a customer receives a partial refund (e.g., $200 back on a $997 order) and later upgrades, they still receive the full $997 upgrade credit. The system is all-or-nothing: full refund voids credit entirely, but partial refund leaves full credit intact.

**Status:** Current behavior is conservative (favors customer). Low priority unless an abuse pattern emerges where customers request partial refunds then upgrade with full credit.

---

#### P5. Same-Tier Double Purchase Allowed
**Source:** peppy-launching-rabbit audit (2026-02-24) | **Tier:** All

Nothing prevents a customer from purchasing the same tier twice. Two purchases = two reports = two charges. No deduplication or warning.

**Status:** By design — a customer may want two reports for different case aspects. Not a bug unless it causes confusion. Consider adding a confirmation prompt if the same email has an existing order for the same tier.

---

#### IB1. Phase 2 Success Page Links to /blog, Not CD Report
**Source:** IB audit (2026-03-03) | **Tier:** Intelligence Brief

After submitting the Phase 2 intake (judge/county details), the success page links to `/blog` instead of the customer's Case Decoder report. The CD was already delivered by email, so customers can access it — but the UX gap adds unnecessary friction at a moment when the customer wants to see their included report.

**Fix needed:** Link to the customer's CD report (requires passing `report_token` through the Phase 2 intake flow, or showing a "Check your email for your Case Decoder" message with the delivery email subject line).

**Files:** `src/app/api/intake/intelligence-brief/route.ts`, Phase 2 success page

---

#### IB2. Included-CD Delivery Email Subject Is Redundant
**Source:** IB audit (2026-03-03) | **Tier:** Intelligence Brief

When the included Case Decoder is auto-delivered as part of the IB purchase, the email subject says "Part 1 of Your Case Decoder Package." This is confusing — the parent tier name ("Intelligence Brief") isn't mentioned, and "Case Decoder Package" isn't how the product is branded. The delivery endpoint doesn't have access to the parent tier context when sending the CD delivery email.

**Fix needed:** Pass parent tier info through the delivery flow so the subject reads "Your Case Decoder (included with Intelligence Brief) is Ready."

---

#### IB3. `src/lib/intelligence-brief/` Is Dead Code
**Source:** IB audit (2026-03-03) | **Tier:** Intelligence Brief | **Severity:** INFO

The `src/lib/intelligence-brief/` directory contains canonical TypeScript reference implementations for IB rendering (`render.ts`), section building (`sections.ts`), and variable construction (`variables.ts`). These are never imported at runtime — production code runs in the Supabase Edge Function (Deno), which has its own duplicate implementations. The Node.js versions serve as documentation and reference for the Deno implementations.

**Files:** `src/lib/intelligence-brief/render.ts`, `src/lib/intelligence-brief/sections.ts`, `src/lib/intelligence-brief/variables.ts`

**Status:** Intentional. Keep as reference. Mark with comments noting they're reference implementations.

---

#### IB4. No IB-Specific In-Progress Messages on Report Page
**Source:** IB audit (2026-03-03) | **Tier:** Intelligence Brief

When an IB case is in `researching` or `compiling` status, the report page (`/report/[token]`) shows generic "Your report is being prepared" text. It doesn't explain the IB-specific multi-phase process or set expectations for the operator research step between Phase A and Phase B.

**Fix needed:** Add tier-aware status messages. For IB in `researching`: "Phase A analysis is complete. Our team is researching your judge's patterns — this typically takes 12-24 hours." For IB in `compiling`: "Your Intelligence Brief is being compiled from 9 sections of analysis."

**Files:** `src/app/report/[token]/page.tsx`

---

#### IB5. No Backup Worker for IB Edge Function Timeouts
**Source:** IB audit (2026-03-03) | **Tier:** Intelligence Brief

If the Supabase Edge Function times out during IB generation (150s limit per invocation), there's no automatic retry mechanism. The cron job detects stuck-compiling cases after 30 minutes and alerts the operator with a retry curl command, but there's no automatic re-trigger.

**Status:** Cron 30min detection is sufficient at launch volume. A backup worker would add complexity without matching benefit until generation volume justifies it.

---

#### IB6. Phase 2 After Refund Returns Misleading 409
**Source:** IB audit (2026-03-03) | **Tier:** Intelligence Brief

If a customer's IB order is refunded and they attempt to submit the Phase 2 intake, the endpoint returns a 409 Conflict with a generic error message. The rejection is correct (refunded orders shouldn't proceed), but the message doesn't explain why or what the customer should do.

**Fix needed:** Return user-friendly message: "This order has been refunded. If you believe this is an error, please contact us at help@imnotanattorney.com."

**Files:** `src/app/api/intake/intelligence-brief/route.ts`

---

#### IB7. No Minimum-Field Validation on judgeResearch Object
**Source:** IB audit (2026-03-03) | **Tier:** Intelligence Brief

The judge-research endpoint accepts any JSON object as `judgeResearch`, including `{}` or garbage data. The endpoint is operator-only (requires OPERATOR_SECRET), so this is a usability gap rather than a security issue. An empty first submission would trigger Phase B with no judge research data, producing lower-quality report sections.

**Note:** The empty `{}` retry scenario is now handled (Task 4 fix: skip-save if existing data exists). But a first-time submission of `{}` still triggers Phase B with no data.

---

#### L4. Additional PDF Lead Magnets (5 Referenced, 1 Exists)
**Source:** GAP-ANALYSIS (2026-02-19) | **Tier:** Content | **Effort:** 2-4 hours each

Five lead magnets are referenced in blog posts and strategy docs, but only one actually exists:
- **EXISTS:** "10 Questions Your Attorney Hopes You Never Ask" (PDF at `public/guides/`)
- **MISSING:** "The Plea Deal Calculator" (referenced in blog post #1)
- **MISSING:** "The Discovery Decoder" (referenced in strategy docs)
- **MISSING:** "The Pre-Court Emergency Checklist" (referenced in strategy docs)
- **MISSING:** "Probation Survival Guide" (referenced in strategy docs)
- **MISSING:** "First-Time Defendant Survival Kit" (referenced in blog post #3)

**Impact:** Blog CTAs link to non-existent resources, breaking the lead capture funnel for those posts.

---

#### L9. Payment Plans for $2,497+ Tiers
**Source:** GAP-ANALYSIS (2026-02-19) | **Tier:** Discovery tiers | **Effort:** 8 hours

No installment payment option exists for $2,497+ tiers. Defendants already under financial stress from legal fees may not have $2,497-$9,997 available upfront, even if they want the service.

**Fix needed:** Stripe Payment Links with installment mode, or Stripe Checkout subscription for 3-4 monthly payments. Would need to handle access gating (don't deliver full report until paid in full, or deliver incrementally).

---

#### L11. Accessibility Audit — No Formal Assessment
**Source:** GAP-ANALYSIS (2026-02-19) | **Tier:** All | **Effort:** 4-8 hours

No formal WCAG 2.1 AA accessibility audit has been performed. Partial fixes implemented during Feb 2026 pipeline session:
- C8: iOS zoom bug fixed (`text-base` on form inputs)
- C9: Global focus indicators added (`focus-visible` outline in `globals.css`)

Many SITE-AUDIT accessibility items (H7 error ARIA, H8 color contrast, P5 escape key, P6 duplicate nav ARIA, P7 footer headings, P8 decorative chars) remain unaddressed or unverified.

---

#### L12. Upload Link Expiration
**Source:** GAP-ANALYSIS (2026-02-19) | **Tier:** Discovery tiers | **Effort:** 2 hours

Upload links are gated by unguessable UUID (`/upload?case=<uuid>`) but have no time expiration. A link works forever once created. Low risk (UUID is unguessable), but a stale link from a refunded order would still allow uploads.

**Fix needed:** Add `upload_expires_at` column to `cases` table (set to 30 days after order creation), validate in upload route. Refund webhook should also invalidate upload access.

---

#### M5. No White-Collar Blog Content
**Source:** GAP-ANALYSIS (2026-02-19) | **Tier:** Content | **Effort:** 4-8 hours for 3-5 posts

Zero white-collar crime blog posts despite being one of the 3 case types on the services page. The footer links to `/blog?category=white-collar` which shows an empty blog page — actively harmful for any visitor arriving via that link.

**Topics needed:** Federal sentencing guidelines, cooperation agreements, loss calculations, RICO basics, wire fraud defenses, white-collar discovery challenges.

---

#### L5. Twitter/X Account Creation
**Source:** GAP-ANALYSIS (2026-02-19) | **Owner:** Rahim | **Effort:** Ongoing

Twitter/X account not created. 3 threads + 9 standalone tweets + posting calendar are drafted in `content/twitter/` but the account `@ImNotAnAttorney` doesn't exist. The footer currently links to a 404 Twitter page.

**Note:** Footer link to nonexistent Twitter was also flagged in SITE-AUDIT as M12.

---

#### L7. Automated Report Generation — Higher Tiers
**Source:** GAP-ANALYSIS (2026-02-19) | **Effort:** 40+ hours (original estimate)

The original plan called for a full `ImNotAnAttorney-engine` repo with OCR pipeline, extraction engine, analysis engine, dossier generator, motion awareness, PDF generator, delivery packager, and client dashboard. **Partial resolution:** Case Decoder and Intelligence Brief generation are now automated via Supabase Edge Function (`generate-report/index.ts`). X-Ray, War Room, and Situation Room remain manual delivery using templates.

---

#### L8. Client Dashboard
**Source:** GAP-ANALYSIS (2026-02-19) | **Effort:** 40+ hours

No customer-facing dashboard where clients can check order status, view reports, or upload additional documents. Currently all customer interaction is via email links and one-time report tokens. Same underlying need as IB8/M9 (operator dashboard) but customer-facing.

---

#### L10. Organization Schema — Social Links Empty
**Source:** GAP-ANALYSIS (2026-02-19) + SITE-AUDIT H14 | **Effort:** 5 min (once Twitter exists)

`sameAs: []` in Organization schema (`layout.tsx`) is empty. Need to add Twitter/X profile URL once account exists. Affects E-E-A-T authority signals in Google.

---

## Items From Prior Audits

Migrated from GAP-ANALYSIS (2026-02-19) and SITE-AUDIT-REPORT (2026-02-21). Full original detail preserved below — expert attribution, effort estimates, impact assessments, file references, and fix instructions all retained from source documents. Originals archived in `ImNotAnAttorney/docs/archive/`.

### Still Open — Critical (SITE-AUDIT Priority 1)

These items either block revenue, create legal liability, or will cause immediate trust failures with real customers.

#### C1. UPL Risk — Rewrite Higher-Tier Deliverables
**Source:** Harlan Schillinger (Legal Marketing/Compliance) | **Effort:** Medium | **Impact:** Existential

The $4,997 (War Room) and $9,997 (Situation Room) tier deliverables describe services that constitute unauthorized practice of law. Specific language that must change:
- "Strategy recommendations" → "Research-based questions about case strategy for your attorney"
- "JOA motion packages" → "Research and questions about JOA standards for your case type"
- "Reply brief templates" → "Research summaries your attorney can use when drafting reply briefs"
- "Voir dire + opening + closing frameworks" → "Research-based questions about trial strategy for your attorney"
- "Witness battle scripts" / "CI destruction playbook" → "Research on witness backgrounds and credibility questions for your attorney"
- "Motion awareness + wave strategy" → "Questions about motion timing for your attorney"
- "Motion overview for your charges" (Case Decoder) → "Common motion types for [charge category] cases"

**Files:** `checkout/page.tsx`, `services/page.tsx`, `PricingTable.tsx`, `stripe.ts`

**Owner:** Attorney review required. **Status:** BLOCKER for live payments.

---

#### C2. Create a Sample Deliverable (Redacted Report)
**Source:** Dan Kennedy (F for "Houdini Factor"), BJ Fogg, Alex Hormozi, Tim Ash | **Effort:** Medium | **Impact:** Highest-ROI single change

Every expert flagged the same thing: visitors cannot see what they're buying. A scared defendant is being asked to spend $197-$9,997 on a product they've never seen, from a person they don't know, with zero evidence it has ever worked.

**What to build:** A redacted 2-page sample Case Decoder report from the founder's real case showing the format, the specificity, and the quality of analysis. Display it on the homepage and checkout page. Also add 3-5 example questions formatted exactly as they appear in the deliverable:
> "Why does the scene inventory (Exhibit 4, p.3) list 93.9g but the lab report (Exhibit 7, p.1) shows only 25.59g?"

**Files:** New asset (PDF/image), `page.tsx` (homepage), `checkout/page.tsx`

**Owner:** Rahim (uses real case data — needs redaction decisions)

---

#### C3. Humanize the Founder
**Source:** BJ Fogg (2/10 trust score), Dan Kennedy, Gary Vee, Harlan Schillinger | **Effort:** Low | **Impact:** Critical for trust

The About page says "Built by a defendant" but never names the person. Anonymous services do not sell to scared buyers. Criminal defendants are terrified — they need to know a real human is behind this.

**At minimum:** Add Rahim's first name, case type, and a photo. Tell the Epiphany Bridge story in first person. The founder's story IS the product demonstration — "I was a defendant. I read my own discovery. I found things my attorney missed."

**Files:** `about/page.tsx`, `page.tsx` (add founder section to homepage)

**Owner:** Rahim (personal decision — name, photo, story comfort level)

---

#### C5. Add Contact Page + Phone Number
**Source:** BJ Fogg (2/10 for contactability), Tim Ash, Sarah Crisp | **Effort:** Low | **Impact:** Critical trust signal

No contact page. No phone number anywhere on the site. The checkout success page previously showed a personal Gmail (`rahim0kapadia@gmail.com`) — now shows `help@imnotanattorney.com` but that email routing isn't set up yet (see AUDIT.md #6).

**What to build:** Dedicated `/contact` page with email, phone number (even Google Voice), and business hours. Add phone number to footer. Replace any remaining Gmail references with business email.

**Files:** New `contact/page.tsx`, `Footer.tsx`, verify `checkout/success/page.tsx`

**Owner:** Rahim (needs to set up Google Voice or similar, plus Cloudflare email routing)

---

#### C6. Remove "Not Reviewed by Attorney" Notes from Terms/Privacy
**Source:** BJ Fogg, Harlan Schillinger | **Effort:** Low | **Impact:** Trust-destroying

The Terms and Privacy pages both have yellow banners saying "This document should be reviewed by a licensed attorney before relying on it." This tells visitors that a legal services company hasn't had its own legal documents reviewed by a lawyer. For a business selling legal information, this is self-undermining.

**Fix needed:** Either (a) get the Terms/Privacy actually reviewed by an attorney and remove the banners, or (b) remove the self-undermining banners and get review done before going live.

**Files:** `terms/page.tsx`, `privacy/page.tsx`

**Owner:** Attorney (review content), then Rahim/Dev (remove banners)

---

### Still Open — High-Impact (SITE-AUDIT Priority 2)

These items significantly improve conversion or trust. Original expert attribution and rationale preserved.

#### H1. Build 7-Email Nurture Sequence Content
**Source:** Russell Brunson (F for nurture), Gary Vee | **Effort:** Medium (content writing) | **Impact:** Highest-leverage funnel fix

The email infrastructure is built (`drip-emails.ts` has 6 nurture slots + tier sequences), but the actual email **content** needs to be written. Currently: one welcome email with PDF, then silence forever. The email list is dead after signup.

**Soap Opera Sequence plan (Russell Brunson framework):**
- Day 0: Welcome + PDF (exists)
- Day 1: Founder's story + real case findings
- Day 2: Warning signs your attorney isn't working
- Day 3: Objection handling ("Is this just AI?")
- Day 4: Urgency (motion deadline windows)
- Day 5: Example questions from a real report
- Day 6: Last chance + referral ask

**Key insight:** Content already exists in blog posts — this is assembly and personalization, not writing from scratch.

**Owner:** Content (writing), then Dev (populate `drip-emails.ts` templates)

---

#### H2. Move Proof Section Above the Fold
**Source:** Sabri Suby (9/10 content, 4/10 placement), Dan Kennedy | **Effort:** Quick | **Impact:** 20-40% conversion lift potential

The 73% weight discrepancy, CI phone dual attribution, and drug type variance are the strongest conversion elements on the entire site. They demonstrate that the product actually works — real findings from a real case. Currently buried below 3 full scrolls of hero text and pain points.

**Fix needed:** Move the real case findings section immediately after the hero, before the "how it works" section. The proof IS the hook.

**File:** `page.tsx` (homepage)

**Owner:** Rahim (design/layout decision)

---

#### H3. Rewrite the H1 Headline
**Source:** Sabri Suby (5/10 for current headline), Dan Kennedy | **Effort:** Quick | **Impact:** The headline IS the page

Current: "Your attorney works for you. Make sure they remember that." — clever and memorable but abstract. No dream outcome. No specificity. Doesn't speak to the defendant's actual fear.

**Test alternatives:**
- "Find What Your Attorney Missed — Before the Deadline That Closes Your Case"
- "A defendant found 3 critical errors in his own discovery. His attorney had it for 6 months."
- "50+ Questions Your Attorney Should Have Answered by Now"

**File:** `page.tsx` (homepage)

**Owner:** Rahim (copy decision — recommend A/B testing)

---

#### H4. Reduce Homepage Pricing to 3 Tiers Max
**Source:** Dan Kennedy (D+ for prescription model), Tim Ash, Sarah Crisp | **Effort:** Medium | **Impact:** Reduces decision paralysis

Currently 5 tiers + 2 add-ons on homepage = 7 products for a panicking user who can't think straight. Choice overload kills conversion. The Hormozi principle: "Make one decision, not seven."

**Fix needed:** Show only Case Decoder ($197), Intelligence Brief ($997), and X-Ray ($2,497) on homepage. Add "See premium tiers →" link to the full services page. Remove add-ons from homepage entirely — those are for existing customers who already trust the brand.

**Files:** `PricingTable.tsx`, `page.tsx`

**Owner:** Rahim (UX/business decision on which 3 tiers to feature)

---

#### H6. Complete Article Schema on Blog Posts
**Source:** Rand Fishkin (SEO) | **Effort:** Quick | **Impact:** Blog post rich result eligibility in Google

Blog post schema is missing: `dateModified`, `image`, `publisher` with `logo`, `url`, `mainEntityOfPage`. Without these, blog posts are ineligible for Google's rich result cards (article carousels, knowledge panels).

**File:** `blog/[slug]/page.tsx`

**Status:** UNVERIFIED — may have been fixed during Feb 2026 sessions. Needs codebase check.

---

#### H7. Fix Accessibility — Error Messages + ARIA Attributes
**Source:** WCAG 2.1 AA Audit (17 findings, 3 critical) | **Effort:** Quick (across 6 files) | **Impact:** Screen reader users, potential legal compliance

Missing ARIA attributes across multiple form components:
- Add `role="alert"` to error messages: `LeadCapture.tsx`, `checkout/page.tsx`, `FileUpload.tsx`, `upload/page.tsx`
- Add `role="status"` to success states: `LeadCapture.tsx`, `intake/page.tsx`, `upload/page.tsx`
- Add `aria-label="Email address"` to LeadCapture input
- Add `aria-expanded` to mobile menu toggle and FAQ accordion buttons
- Add skip-to-content link in `layout.tsx`

**Status:** UNVERIFIED — partial fixes may have been applied during Feb 2026 sessions. Needs codebase check.

---

#### H8. Fix Color Contrast Failures
**Source:** WCAG 2.1 AA Audit | **Effort:** Quick (global find-replace) | **Impact:** Readability on low-quality screens and in bright environments

Specific contrast failures:
- Replace all `text-zinc-500` with `text-zinc-400` (10+ files) — zinc-500 on dark bg is 4.10:1 (fails AA), zinc-400 is 7.72:1 (passes)
- Replace `text-zinc-600` with `text-zinc-400` on `checkout/success/page.tsx`
- Replace `placeholder-zinc-600` with `placeholder-zinc-400` on `intake/page.tsx`

**Status:** UNVERIFIED — needs codebase check.

---

#### H9. Add Security Trust Signals to Checkout Page
**Source:** Sarah Crisp (Checkout Expert), Tim Ash (Conversion UX) | **Effort:** Low | **Impact:** Checkout conversion

The checkout page has tiny "Powered by Stripe" text but no visual security signals. A scared defendant about to enter credit card info needs to see security.

**Fix needed:** Replace tiny Stripe text with: Stripe logo badge, payment method icons (Visa/MC/Amex), lock icon. Make security text `text-sm text-zinc-300` (larger, higher contrast). Consider adding "256-bit SSL encryption" text.

**File:** `checkout/page.tsx`

**Status:** UNVERIFIED — needs codebase check.

---

#### H10. Surface Upload Link Directly on Success Page
**Source:** Sarah Crisp, Tim Ash | **Effort:** Medium | **Impact:** Reduces post-purchase anxiety for $2,497+ customers

For discovery tiers ($2,497+), the success page references upload but the experience could be smoother. Upload link should be prominently displayed with clear "Next Step" framing.

**File:** `checkout/success/page.tsx`

**Status:** UNVERIFIED — may overlap with U2 fix. Needs codebase check.

---

#### H12. Move Guarantee Before Pricing
**Source:** Dan Kennedy | **Effort:** Quick | **Impact:** Risk reversal must come BEFORE the purchase decision

The guarantee section is currently buried after the pricing table. In Dan Kennedy's framework, risk reversal must precede the price reveal — the prospect needs to feel safe before they see the number.

**Fix needed:** Move guarantee section above the pricing table on the homepage. Rewrite for strength:
> "If your Case Decoder doesn't contain at least 10 specific questions you can bring to your attorney — you pay nothing."

**File:** `page.tsx` (homepage)

**Status:** UNVERIFIED — needs codebase check.

---

#### H13. Add Physical Address to Website Footer
**Source:** Rand Fishkin (E-E-A-T), BJ Fogg | **Effort:** Quick | **Impact:** Trust signal, E-E-A-T compliance

The physical address (195 Dr MLK Jr St N, St Petersburg, FL 33701) exists in email templates (`src/lib/site.ts` — `PHYSICAL_ADDRESS` constant) but is NOT displayed on the website. CAN-SPAM emails show it, but the website doesn't — inconsistent and reduces trust.

**File:** `Footer.tsx`

**Status:** UNVERIFIED — needs codebase check.

---

#### H14. Populate Organization Schema sameAs
**Source:** Rand Fishkin (SEO) | **Effort:** Quick (5 min, once Twitter exists) | **Impact:** E-E-A-T authority signals

`sameAs: []` in Organization schema (`layout.tsx`) is empty. Google uses `sameAs` to connect the business entity across platforms and build authority graph. Same as L10 from GAP-ANALYSIS.

**File:** `layout.tsx`

---

#### H15. Remove Unused Geist Mono Font
**Source:** Addy Osmani (Performance) | **Effort:** Quick (5 min) | **Impact:** 29KB saved per page load

Geist Mono (28.7KB woff2) is loaded on every page via `layout.tsx` but never referenced by any CSS class or element. Pure dead weight.

**Files:** `layout.tsx` (remove import), `globals.css` (remove any `--font-geist-mono` reference)

**Status:** UNVERIFIED — needs codebase check.

---

#### H16. Add AI Disclosure to Privacy Policy
**Source:** Harlan Schillinger (Legal Marketing/Compliance) | **Effort:** Low | **Impact:** Legal compliance, transparency

The privacy policy doesn't disclose that customer-submitted documents and case details are processed by AI (Claude/Anthropic) or sent to third-party AI providers. As AI regulation evolves, this disclosure becomes increasingly important.

**File:** `privacy/page.tsx`

**Status:** UNVERIFIED — needs codebase check.

---

### Still Open — Growth (SITE-AUDIT Priority 3)

Distribution, nurture, and audience-building items. Most are Rahim-owned execution tasks.

#### G1. Activate Reddit Engagement
**Source:** Gary Vee | **Owner:** Rahim | **Effort:** Ongoing | **Impact:** Primary organic traffic source

Start leaving genuinely helpful responses on r/legaladvice, r/criminaldefense, r/DUI. No links first — be the most helpful person in the thread. After establishing credibility (Week 2+), share blog links when relevant. The audience is on Reddit at 2 AM, scared and searching.

**Content exists:** 20 blog posts + `content/REDDIT-PAIN-POINTS.md` maps subreddit pain points to existing content.

---

#### G2. Write Founder's Story Blog Post
**Source:** Gary Vee, Dan Kennedy, Russell Brunson | **Owner:** Rahim | **Effort:** Medium | **Impact:** Most powerful content piece not yet created

"I Was a Criminal Defendant. Here's What I Found When I Read My Own Discovery." Uses the real case findings (73% weight discrepancy, CI phone dual attribution, drug type variance). First-person narrative. This would spread organically on Reddit — it's the kind of post that gets shared because it's a real story, not marketing.

---

#### G3. Activate Twitter/X
**Source:** Gary Vee | **Owner:** Rahim | **Effort:** Low setup, ongoing | **Impact:** Brand awareness

Account doesn't exist yet (footer links to 404). Content is drafted: 3 threads + 9 standalone tweets + posting calendar in `content/twitter/`.

**First action:** Post the first thread — "10 signs your attorney isn't working your case" (content already exists in blog). Target cadence: 2 threads/week, 5 standalone tweets/day.

---

#### G5. Add Plausible Analytics
**Source:** Analytics Assessment | **Effort:** Low (3-4 hours) | **Impact:** Conversion visibility

Install `next-plausible` ($9/month). Add custom events for `email_subscribe`, `intake_submit`, `checkout_initiate`, `checkout_complete`. Privacy-safe (cookieless, EU-hosted).

**Critical note:** Do NOT add GA4. Criminal defendants fear surveillance. Cookieless-only analytics. Plausible is specifically designed for privacy-first tracking.

---

#### G6. Fill Content Gaps — Drug Cases + White Collar
**Source:** Gary Vee, Rand Fishkin | **Effort:** Medium (4-8 posts) | **Impact:** SEO cluster completeness

Drug Cases has 1 post (may have more now). White Collar has 0 posts. Both are service categories displayed on `/services`. Incomplete content clusters hurt SEO authority.

**Drug topics needed:** CI challenges, weight discrepancies, trafficking vs possession thresholds, Franks hearings, lab testing chain of custody

**White-collar topics needed:** Federal sentencing guidelines, cooperation agreements, loss calculations, RICO basics, wire fraud defenses

---

#### G7. Start Content Repurposing
**Source:** Gary Vee | **Effort:** Ongoing | **Impact:** 200+ pieces of micro-content from existing 20 posts

Each blog post → Twitter thread + Reddit comment + Instagram carousel + TikTok script + email newsletter segment. Start with the 5 highest-performing posts (once analytics show which they are per G5).

**Owner:** Content / Rahim

---

#### G10. Add Breadcrumb Navigation + Schema
**Source:** Rand Fishkin (SEO) | **Effort:** Medium | **Impact:** Navigation UX + SEO rich results in Google

No breadcrumb navigation exists on any page. Add `BreadcrumbList` JSON-LD schema and visual breadcrumb trail to blog posts and core pages. Pattern: Home > Blog > [Category] > [Post Title].

---

### Still Open — Polish (SITE-AUDIT Priority 4)

Nice-to-have refinements. Quick wins organized by file impact. Full original detail from SITE-AUDIT-REPORT preserved.

#### P1. Remove `backdrop-blur-sm` from Sticky Header
**Source:** Addy Osmani (Performance) | **Effort:** Quick | **Impact:** Mobile scroll performance

The backdrop blur filter causes jank on mobile scroll — forces GPU compositing on every frame.

**File:** `Header.tsx` | **Status:** UNVERIFIED

#### P2. Remove `scroll-behavior: smooth` from globals.css
**Source:** Addy Osmani (Performance) | **Effort:** Quick | **Impact:** Perceived INP improvement

Smooth scroll delays perceived interaction responsiveness.

**File:** `globals.css` | **Status:** UNVERIFIED

#### P3-polish. Add `prefetch={false}` to Footer Links
**Source:** Addy Osmani (Performance) | **Effort:** Quick | **Impact:** 30KB less speculative prefetch

Footer links are below the fold — prefetching them wastes bandwidth for content users haven't expressed interest in.

**File:** `Footer.tsx` (below-fold links only) | **Status:** UNVERIFIED

#### P4. Make State Field a Dropdown on Intake Form
**Source:** Tim Ash (Conversion UX) | **Effort:** Low | **Impact:** Data quality

Free-text state field allows "FL", "Florida", "florda" etc. Use a `<select>` dropdown of US states for consistent data. Same as GAP-ANALYSIS M16.

**File:** `intake/page.tsx` | **Status:** UNVERIFIED

#### P5. Add Escape Key Handler for Mobile Menu
**Source:** WCAG Accessibility Audit | **Effort:** Quick | **Impact:** Keyboard accessibility

Mobile menu opens but can't be closed with Escape key — keyboard trap.

**File:** `Header.tsx` | **Status:** UNVERIFIED

#### P6. Add `aria-label` to Duplicate Nav Elements
**Source:** WCAG Accessibility Audit | **Effort:** Quick | **Impact:** Screen reader navigation

Header has both desktop and mobile nav — screen readers see two unlabeled `<nav>` elements. Add `aria-label="Main navigation"` and `aria-label="Mobile navigation"`.

**File:** `Header.tsx` | **Status:** UNVERIFIED

#### P7. Change Footer Section Headings from `<p>` to `<h2>`
**Source:** WCAG Accessibility Audit | **Effort:** Quick | **Impact:** Screen reader heading navigation

Footer section labels ("Services", "Resources", etc.) use `<p>` tags instead of `<h2>`. Screen reader users can't navigate footer by headings.

**File:** `Footer.tsx` | **Status:** UNVERIFIED

#### P8. Hide Decorative Characters from Screen Readers
**Source:** WCAG Accessibility Audit | **Effort:** Quick | **Impact:** Cleaner screen reader experience

Decorative characters (checkmarks, arrows, bullets) in pricing cards and FAQ are read aloud by screen readers. Add `aria-hidden="true"` to decorative `<span>` elements.

**Files:** `PricingTable.tsx`, `checkout/page.tsx`, `FAQAccordion.tsx` | **Status:** UNVERIFIED

#### P9. Improve Blog Index H1 and Meta Description
**Source:** Rand Fishkin (SEO) | **Effort:** Quick | **Impact:** Better SERP CTR

Current H1 is just "Blog" — not descriptive, not keyword-rich. Change to "Criminal Defense Blog — Questions Your Attorney Should Answer". Meta description should mention content depth (20+ articles) and differentiation.

**File:** `blog/page.tsx` | **Status:** UNVERIFIED

#### P10. Add Loading Spinner to Checkout Button
**Source:** Tim Ash, Sarah Crisp | **Effort:** Quick | **Impact:** Prevents double-clicks, reduces anxiety

After clicking "Proceed to Checkout," the button should show a loading state while Stripe session is being created. Note: double-submit guard was added (SESSION-STATUS Task 15h), but visual loading state may be separate.

**File:** `checkout/page.tsx` | **Status:** UNVERIFIED

#### P11. Upgrade Service Schema to LegalService
**Source:** Rand Fishkin (SEO) | **Effort:** Medium | **Impact:** Better Google classification

Services page uses generic `ProfessionalService` schema. `LegalService` is more specific and appropriate for legal information services.

**File:** `services/page.tsx` | **Status:** UNVERIFIED

#### P12. Add Decision Guidance to Pricing Tiers
**Source:** Sarah Crisp, Tim Ash | **Effort:** Low | **Impact:** Reduces choice paralysis

Add "Best for:" descriptors to each tier:
- Case Decoder: "Just arrested, need clarity"
- Intelligence Brief: "Case underway, attorney not communicating"
- X-Ray: "Have discovery, want deep analysis"

**File:** `PricingTable.tsx` | **Status:** UNVERIFIED

#### P13. Create Category Landing Pages for Blog
**Source:** Rand Fishkin (SEO) | **Effort:** Medium | **Impact:** Indexable category pages for SEO

Currently `/blog?category=dui` is a query param — not indexable as a separate URL. Should be `/blog/dui-defense` with its own metadata and H1.

**Status:** UNVERIFIED

#### P14. Add Intake Form Progress Indicator
**Source:** Tim Ash (Conversion UX) | **Effort:** Medium | **Impact:** Reduces form abandonment

The intake form is long and single-page. Split into 2-3 steps with a "Step 1 of 3" progress bar. Multi-step forms have higher completion rates for long forms.

**File:** `intake/page.tsx` | **Status:** UNVERIFIED

#### P15. Add Confirmation Dialog Before Upload Finalize
**Source:** Tim Ash | **Effort:** Low | **Impact:** Prevents accidental submission

The "Submit Documents" button on the upload page is a one-way action. Add a confirmation dialog: "Submit X documents for analysis? You can't add more files after submitting."

**File:** `upload/page.tsx` | **Status:** UNVERIFIED

---

### Still Open — GAP-ANALYSIS Deep Review Items (MEDIUM)

These items were identified in the GAP-ANALYSIS deep review section (2026-02-19). Many may have been fixed during the Feb 2026 pipeline sessions but have not been verified against the current codebase.

#### M10. Add Metadata for Checkout/Success/Upload Pages
**Source:** GAP-ANALYSIS deep review | **Effort:** 30 min

Client component pages (`checkout`, `checkout/success`, `upload`) inherit default title "ImNotAnAttorney — We Research. You Ask." with no page-specific title or description. Browser tab shows generic text. Add `layout.tsx` files with metadata exports for each.

**Status:** UNVERIFIED — likely fixed during Feb 2026 sessions.

#### M11. Block Checkout/Upload/Success in robots.txt
**Source:** GAP-ANALYSIS deep review | **Effort:** 5 min

These pages aren't in the robots.txt disallow list — search engines can index `/checkout?tier=case-decoder` and `/upload?case=...`. The sitemap correctly excludes them, but robots.txt should explicitly block them.

**Status:** UNVERIFIED — likely fixed during Feb 2026 sessions.

#### M12. Remove Dead Twitter Link in Footer
**Source:** GAP-ANALYSIS deep review | **Effort:** 5 min

Footer links to `https://twitter.com/ImNotAnAttorney` which 404s. Live on every page of the site. Related to L5 (account doesn't exist) and G3 (account creation planned).

**File:** `Footer.tsx` | **Status:** UNVERIFIED

#### M13. FAQ Accordion Not Keyboard/Screen-Reader Accessible
**Source:** GAP-ANALYSIS deep review | **Effort:** 1 hour

`FAQAccordion.tsx` uses `<div onClick>` for toggle, not `<button>`. Screen readers can't operate it. No `aria-expanded` or `aria-controls` attributes. Convert to proper `<button>` elements with ARIA attrs.

**File:** `FAQAccordion.tsx` | **Status:** UNVERIFIED

#### M14. Add Skip-to-Content Link
**Source:** GAP-ANALYSIS deep review | **Effort:** 15 min

The sticky header forces keyboard users to tab through all nav links on every page before reaching content. Add `<a href="#main-content" class="sr-only focus:not-sr-only">Skip to content</a>` at the top of `layout.tsx`.

**File:** `layout.tsx` | **Status:** UNVERIFIED

#### M15. Intake Form lastName Required in HTML but Optional in API
**Source:** GAP-ANALYSIS deep review | **Effort:** 5 min

The intake form has `required` attribute on `lastName` and `state` fields, but the API contract lists both as optional. Customers who don't want to share their last name are blocked at the form level.

**File:** `intake/page.tsx` | **Status:** UNVERIFIED

#### M17. Delete Default Next.js SVGs from public/
**Source:** GAP-ANALYSIS deep review | **Effort:** 5 min

`file.svg`, `globe.svg`, `next.svg`, `vercel.svg`, `window.svg` in `public/` are boilerplate from `create-next-app`. Not referenced anywhere — dead files adding clutter.

**Status:** UNVERIFIED

---

### Fixed (confirmed by code audit)

Items confirmed fixed through code review. Organized by source document with implementation details preserved.

#### From SITE-AUDIT-REPORT (2026-02-21)

| ID | Item | When Fixed | Details |
|----|------|-----------|---------|
| C4 | Canonical URLs broken on 8+ pages | Feb 2026 pipeline session | Each page now has its own canonical URL in metadata. Root layout default removed. |
| C7 | No disclaimer on checkout page | Feb 2026 pipeline session | Added "ImNotAnAttorney provides legal information and research — not legal advice" before Pay button. Also added to upload and success pages. |
| C8 | iOS zoom bug on form inputs | Feb 2026 pipeline session | Changed all form inputs from `text-sm` (14px) to `text-base` (16px). iOS Safari no longer auto-zooms on focus. |
| C9 | No global focus indicators | Feb 2026 pipeline session | Added `*:focus-visible { outline: 2px solid var(--color-amber-400); outline-offset: 2px; }` to `globals.css`. |
| C10 | "Confidential" on intake form | Feb 2026 | NOT changed — "confidential informant" (CI) is the correct legal term. The intake form uses "CI" in the context of confidential informant cross-examination, which is proper legal terminology. |
| H5 | No FAQ schema on homepage | Feb 2026 pipeline session | Added FAQPage JSON-LD matching the pattern on services page. 7 FAQ items now have structured data. |
| H11 | No post-purchase upsell on success page | Feb 2026 pipeline session | Implemented OTO (One-Time Offer) with server-side TTL timer. After Case Decoder purchase, shows upgrade to Intelligence Brief with credit applied. Uses `sessionCreated` from Stripe for server-side expiry. |
| G4 | No post-purchase email sequence | Feb 2026 pipeline session | Full tier-specific post-purchase sequences in `drip-emails.ts`. CD: story harvest (day 3) + IB upsell (day 7). IB: delivery + story harvest (day 5) + X-Ray upsell (day 10). |
| G8 | No abandoned checkout recovery | Feb 2026 pipeline session | Cron Part 11: detects checkouts where email was captured but no paid order within 24-48h. Sends recovery email. |
| G9 | No upgrade credit mechanism | Feb 2026 pipeline session | Stripe coupon system. 100% credit from lower tier applied to higher tier checkout. 12-month window, refunded orders excluded. |

#### From GAP-ANALYSIS (2026-02-19)

| ID | Item | When Fixed | Details |
|----|------|-----------|---------|
| B1 | No Terms of Service page | Feb 2026 | `/terms` page created with placeholder content. Content complete. Attorney review recommended. |
| B2 | No Privacy Policy page | Feb 2026 | `/privacy` page created with placeholder content. Content complete. Attorney review recommended. |
| B5 | Resend domain not verified | Feb 23, 2026 | Domain verified in Resend. DKIM record configured in Cloudflare DNS. DMARC added. Sending from `noreply@imnotanattorney.com`. |
| B6 | No unsubscribe link in emails (CAN-SPAM) | Feb 2026 pipeline session | Unsubscribe link added to all commercial emails. `/unsubscribe` route with GET confirmation + POST handler. `List-Unsubscribe` headers added. |
| B7 | No physical mailing address in emails (CAN-SPAM) | Feb 2026 pipeline session | Physical address (195 Dr MLK Jr St N, St Petersburg, FL 33701) added to email footer. Centralized in `src/lib/site.ts` as `PHYSICAL_ADDRESS`. |
| H1-GAP | FileUpload.tsx `data.url` undefined bug | Feb 2026 pipeline session | Changed `data.url` to `data.path`. React key collisions resolved. |
| H2-GAP | Silent case creation failure in webhook | Feb 2026 pipeline session | Error handling added — operator notified if case insert fails. |
| H3-GAP | No operator notification for intake submissions | Feb 2026 pipeline session | Operator notification email sent on intake submission. |
| H5-GAP | $2,497+ delivery templates missing | Feb 2026 | All tier templates created in `system/templates/`. |
| H7-GAP | Upload "Submit" does nothing operationally | Feb 2026 pipeline session | `/api/upload/finalize` endpoint created. Updates case status, sends operator notification. |
| H8-GAP | HTML injection in email templates | Feb 2026 pipeline session | `escapeHtml()` applied to all user-supplied data in email HTML across all routes. |
| H9-GAP | Canonical URLs broken on 8+ pages | Feb 2026 pipeline session | Same as C4. Per-page canonical URLs in metadata exports. |
| H10-GAP | Checkout page doesn't recognize add-on tiers | Feb 2026 pipeline session | Add-on tiers added to `TIER_INFO` and `TIER_NEXT_STEPS`. |
| H11-GAP | Intake success says "24h" with no operator notification | Feb 2026 pipeline session | Operator notification added. Success message updated. |
| M1 | Add-on purchase flow (no checkout links) | Feb 2026 pipeline session | Checkout supports all 7 tiers including add-ons. |
| M3 | No rate limiting on API routes | Feb 2026 pipeline session | Supabase-based rate limiting via `checkRateLimit()` on checkout, intake, score, subscribe, upload. |
| M4 | No upgrade credit backend | Feb 2026 pipeline session | Stripe coupon-based upgrade credits. 12-month window, refunded orders excluded. |
| M6 | No email follow-up/nurture sequence | Feb 2026 pipeline session | Full drip email system in `drip-emails.ts`. 6 nurture + per-tier post-purchase sequences. Daily cron sends due emails with retry. |
| M7 | Upload finalize endpoint missing | Feb 2026 pipeline session | `/api/upload/finalize` — updates case status, notifies operator. |
| M8 | Email not pre-filled in Stripe checkout | Feb 2026 | `customer_email` set on Stripe session from intake/form email. |
| L1 | Success page trusts URL params | Feb 2026 pipeline session | `/api/checkout/verify` verifies Stripe session server-side. |
| L2 | No security headers | Feb 2026 pipeline session | HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy in `next.config.ts`. |
| L3 | No server-side MIME validation on upload | Feb 2026 pipeline session | MIME type allowlist in upload route. |

---

## Files Impact Summary (from SITE-AUDIT-REPORT)

Preserved from original audit for implementation reference. Excludes already-fixed items.

| File | Open Items |
|------|-----------|
| `page.tsx` (homepage) | C2, H2, H3, H4, H12 |
| `checkout/page.tsx` | C1, H9, P10 |
| `checkout/success/page.tsx` | H10, U2 |
| `layout.tsx` | H14, H15, M14 |
| `intake/page.tsx` | P4, P14, M15 |
| `PricingTable.tsx` | C1, H4, P8, P12 |
| `services/page.tsx` | C1, P11 |
| `about/page.tsx` | C3 |
| `Footer.tsx` | H13, P3-polish, P7, M12 |
| `globals.css` | P2 |
| `LeadCapture.tsx` | H7 |
| `FAQAccordion.tsx` | M13, P8 |
| `Header.tsx` | P1, P5, P6 |
| `upload/page.tsx` | P15 |
| `terms/page.tsx` | C6 |
| `privacy/page.tsx` | C6, H16 |
| `blog/[slug]/page.tsx` | H6 |
| `blog/page.tsx` | P9 |
| New files needed | Contact page (C5), sample report PDF (C2) |
