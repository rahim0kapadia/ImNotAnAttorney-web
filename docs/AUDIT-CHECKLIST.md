# Pipeline Audit Checklist

Reusable per-tier checklist for auditing the entire customer pipeline. Created 2026-02-24 after a 4-round deep audit that found 26 gaps across infrastructure, email, UX, and billing.

## Prior Audit Documents

| Doc | Date | Scope | Status |
|-----|------|-------|--------|
| `ImNotAnAttorney/docs/GAP-ANALYSIS.md` | 2026-02-19 | Full site, 105 items | Most fixed by pipeline session |
| `ImNotAnAttorney/docs/SESSION-STATUS-2026-02-23.md` | 2026-02-23 | 33 pipeline tasks | All complete |
| `ImNotAnAttorney/docs/SITE-AUDIT-REPORT.md` | 2026-02-21 | 12-expert audit, 45+ items | Partial |
| `ImNotAnAttorney/docs/plans/2026-02-19-full-launch-readiness.md` | 2026-02-19 | Original build plan | Complete |
| Plan: peppy-launching-rabbit | 2026-02-24 | 4-round deep audit, 26 gaps | Complete |

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
| Intelligence Brief | $997 | Pending | -- |
| X-Ray | $1,497 | Pending | -- |
| War Room | $3,497 | Pending | -- |
| Situation Room | $9,997 | Pending | -- |

## Deferred Items (Other Tiers Only)

| ID | Item | Tier | Severity | Notes |
|----|------|------|----------|-------|
| E2 | 10-25 day silence during analysis | X-Ray/War Room/Sit Room | HIGH | Need status update emails at day 7/14/21 |
| E4 | Upload reminder broken template vars | X-Ray/War Room/Sit Room | HIGH | `{{CASE_ID}}` not resolved in cron |
| E7 | War Room weekly updates fires once | War Room | MEDIUM | Needs recurring scheduler |
| P3 | Customer coupon overrides upgrade credit | All upgrades | MEDIUM | Needs Stripe checkout config |
| P4 | Partial refund doesn't reduce credit | All upgrades | LOW | Current all-or-nothing is conservative |
| P5 | Same-tier double purchase allowed | All | LOW | By design -- two reports for two charges |
| U2 | Discovery success page "upload link emailed" | Discovery tiers | HIGH | Text promises email never sent |

## Items From Prior Audits Still Open

Cross-reference with SITE-AUDIT-REPORT.md:

| ID | Item | Status |
|----|------|--------|
| C1 | UPL risk -- rewrite higher-tier deliverables | Open (needs attorney) |
| C2 | Create sample deliverable | Open |
| C3 | Humanize founder (name + photo) | Open |
| C5 | Contact page + phone number | Open |
| C6 | Remove "not reviewed" notes from Terms/Privacy | Open (needs attorney) |
