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
| X-Ray | $1,497 | Pending | -- |
| War Room | $3,497 | Pending | -- |
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

| ID | Item | Tier | Severity | Notes |
|----|------|------|----------|-------|
| E2 | 10-25 day silence during analysis | X-Ray/War Room/Sit Room | HIGH | Need status update emails at day 7/14/21 |
| E4 | Upload reminder broken template vars | X-Ray/War Room/Sit Room | HIGH | `{{CASE_ID}}` not resolved in cron |
| E7 | War Room weekly updates fires once | War Room | MEDIUM | Needs recurring scheduler |
| P3 | Customer coupon overrides upgrade credit | All upgrades | MEDIUM | Needs Stripe checkout config |
| P4 | Partial refund doesn't reduce credit | All upgrades | LOW | Current all-or-nothing is conservative |
| P5 | Same-tier double purchase allowed | All | LOW | By design — two reports for two charges |
| U2 | Discovery success page "upload link emailed" | Discovery tiers | HIGH | Text promises email never sent |
| IB1 | Phase 2 success page links to /blog not CD report | IB | LOW | UX gap — customer can access CD via email |
| IB2 | Included-CD delivery email subject is redundant | IB | LOW | "Part 1 of Your Case Decoder Package" — parent tier name unavailable |
| IB3 | `src/lib/intelligence-brief/` is dead code | IB | INFO | Canonical reference only — Edge Function has Deno duplicates |
| IB4 | No IB-specific in-progress messages on report page | IB | LOW | researching/compiling show generic "being prepared" text |
| IB5 | No backup worker for IB Edge Function timeouts | IB | LOW | Cron 30min detection is sufficient at launch volume |
| IB6 | Phase 2 after refund returns misleading 409 | IB | LOW | Correct rejection, wrong message |
| IB7 | No minimum-field validation on judgeResearch object | IB | LOW | Operator-only endpoint, empty {} triggers Phase B on garbage |
| IB8 | No operator dashboard | All | MEDIUM | Email-driven awareness works at low volume |
| M2 | Tier data in 3 places (stripe.ts, services, PricingTable) | All | MEDIUM | From GAP-ANALYSIS — needs single source refactor |
| M5 | No white-collar blog content | Content | LOW | 0 posts for a listed case type |
| L4 | Additional PDF lead magnets | Content | LOW | 5 referenced in blog, only 1 exists |
| L9 | Payment plans for $1,497+ tiers | Discovery | LOW | No installment logic |
| L11 | Accessibility audit | All | LOW | Partial fixes (C8, C9 done), no formal audit |
| L12 | Upload link expiration | Discovery | LOW | UUID-gated, no time limit |

## Items From Prior Audits

Migrated from GAP-ANALYSIS (2026-02-19) and SITE-AUDIT-REPORT (2026-02-21). Originals archived in `ImNotAnAttorney/docs/archive/`.

### Still Open (business/human tasks)

| ID | Item | Owner | Notes |
|----|------|-------|-------|
| C1 | UPL risk — rewrite higher-tier deliverables | Attorney | Existential compliance risk |
| C2 | Create sample deliverable (redacted report) | Rahim | Highest-ROI trust signal |
| C3 | Humanize founder (name + photo on About page) | Rahim | Critical for trust |
| C5 | Contact page + phone number | Rahim | Trust signal, replaces Gmail in support contact |
| C6 | Remove "not reviewed" notes from Terms/Privacy | Attorney | Trust-destroying self-undermining |
| M9 | Admin dashboard | Dev | Email-driven ops works at low volume |
| H1 | 7-email nurture sequence content | Content | Structure built in drip-emails.ts, needs content |
| H2 | Move proof section above the fold | Rahim | Homepage design decision |
| H3 | Rewrite H1 headline | Rahim | Homepage copy decision |
| H4 | Reduce homepage to 3 tiers | Rahim | UX decision |

### Fixed (confirmed by code audit 2026-03-03)

| ID | Item | When Fixed |
|----|------|-----------|
| C4 | Canonical URLs broken | Feb 2026 pipeline session |
| C7 | Checkout disclaimer | Feb 2026 pipeline session |
| C8 | iOS zoom bug (text-sm → text-base) | Feb 2026 pipeline session |
| C9 | Global focus indicators | Feb 2026 pipeline session |
| C10 | "Confidential" → "private" on intake form | Feb 2026 — "confidential informant" is correct legal term (CI) |
| H5 | FAQ schema on homepage | Feb 2026 pipeline session |
| M1 | Add-on purchase flow | Feb 2026 — checkout supports all tiers |
| M3 | Rate limiting | Feb 2026 — Supabase RPC on 5 routes |
| M4 | Upgrade credit system | Feb 2026 — Stripe coupon creation |
| M6 | Email nurture sequence | Feb 2026 — drip-emails.ts (6 nurture + tier sequences) |
| M7 | Upload finalize endpoint | Feb 2026 — /api/upload/finalize |
| M8 | Pre-fill email in Stripe checkout | Feb 2026 |
| L1 | Success page Stripe session verification | Feb 2026 — /api/checkout/verify |
| L2 | Security headers (HSTS, X-Frame-Options) | Feb 2026 — next.config.ts |
| L3 | Server-side MIME validation on upload | Feb 2026 — allowlist in upload route |
