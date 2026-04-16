# Handoff: Partner Compliance Checklist + SMS Monitoring Stack

Date: 2026-04-15 22:30

## Task
Two threads completed + one in flight:

1. **SMS Delivery Monitoring (3 layers) — SHIPPED + REVIEWED**
2. **Partner Portal 4-Plan Audit — COMPLETE, gaps fixed**
3. **Bondsman Compliance Checklist — PLAN NEEDED (next step)**

## What Shipped This Session (11 commits on master, all pushed)

### SMS Monitoring (Layers 1-3)
- `0e49f52` Task 9 check-in verification (tsc, vitest 240/240, cron confirmed)
- `016bfd4` sms-health-check cron confirm (jobId 7485383, 10am ET)
- `2fa6298` **Layer 2**: real-time bounce detection via Resend webhook
  - `sms_suspensions` table + partial index on active rows
  - `src/lib/sms-suspensions.ts` (normalize/extract/suspend/check)
  - `src/lib/sms.ts` (pre-flight suspension check, fail-open)
  - `src/app/api/webhooks/resend/route.ts` (text.email bounce → suspend + Telegram)
  - 9 new tests (249 total pass)
- `6d3c244` E2E webhook verification scripts
- `18c6e7b` Resend webhook registered (id 76c51884), new signing secret rotated on Vercel
- `0dd1af9` **Review fixes**: RLS on sms_suspensions, NaN timestamp guard, data.to array normalize, recipient cap to 100, env-ify test phone, CRONJOB_API_KEY from loadEnv, NANP test phone, finally-block cleanup, trailing-slash normalize
- `0ad3e10` testSms 3-state fix (sent/failed/skipped)
- CV repo `4fc9af5` **Layer 3**: INNA-H11 with 5 probes (all pass)

### Partner Portal Audit + Fixes
- `d823db0` Audit gap fixes: sitemap dupe, ClientNotificationSettings component, 2 cron IDs documented
- `219c4cd` Contact page privacy fix

### Partner-Type Infrastructure
- `e2b8fad` `partners.source` column (backfill from partner_applications, wired into apply route + partner-auth)

## Key Decisions

1. **Resend webhook secret rotated** — old `RESEND_WEBHOOK_SECRET` was the inbound secret. New one: `whsec_i7uO2fo07azBUnF+WcuxQp6RIeo/maXc` for bounce webhook id `76c51884`. Both in Vercel prod + .env.local.
2. **RESEND_API_KEY_FULL** (Dev1 full-access key `re_iKN77H2h_Hu211U8TRE2EedLQv44VLGZL`) stored in all 3 INAA repos' .env files. NOT deployed to Vercel — local scripts only.
3. **SMS_HEALTH_TEST_PHONE** env var on Vercel prod (replaces hardcoded PII).
4. **partners.source** column added for partner-type awareness (bondsman vs generic vs attorney). Enables conditional checklist content.
5. **Crisis-buyer lens HARD RULE** saved to memory: defendants = crisis buyers (3AM panic), bondsmen = regular B2B partners (not in crisis). Crisis filter applies to defendant-facing artifacts only, NOT bondsman-facing dashboard/drip.

## What Didn't Work
- Inline `node -e` repeatedly blocked by triage hook — lesson: always write to a script file, triage first.
- First recommendation batch for partner portal applied info-product affiliate patterns to bondsmen (McWilliams framework unfiltered). Fixed: crisis-buyer lens memory created, McWilliams expert profile updated with INAA-specific adaptation section.
- Initial Layer 2 E2E failed because code wasn't pushed/deployed yet.

## Remaining Steps — BONDSMAN COMPLIANCE CHECKLIST

**Status: needs implementation plan written BEFORE building.**

### Context for the planner:
- **What it is:** Printable 8.5×11 compliance checklist the bondsman hands to the defendant at the jail desk. Replaces/evolves `/partner/card` (currently a pitch card).
- **Partner-type branching:** `partner.source === "bondsman"` → bondsman compliance checklist. Other sources → generic referral handoff (design later).
- **QR code infrastructure:** Already working in `/partner/card` via `qrcode` npm package. Reuse pattern.
- **Check-in system:** Already shipped (Task 9). The checklist is the DISTRIBUTION CHANNEL that gets defendants enrolled in check-ins.
- **URL on checklist:** Generic `/r/[code]/reminders` (bondsman's promo code). Defendant signs themselves up. Pen-fillable check-in days. NOT per-defendant tokens.

### Universal bondsman compliance items (researched):
1. Court date + courthouse (pen-fill)
2. Check-in days + link to `/r/[code]/reminders` + QR code
3. Don't leave jurisdiction without written permission
4. Keep contact info current (24h notice)
5. No new arrests
6. Follow all court-ordered conditions
7. Bond payment schedule (pen-fill)
8. Keep co-signer informed
9. Court-specific conditions (pen-fill blanks)
10. Bondsman emergency contact (auto-filled from partner profile)
11. Attorney info / PD office (pen-fill)

### Technical plan needs to cover:
- Route: `/partner/checklist` (new) or update `/partner/card` in-place
- Dashboard link update
- Welcome email link update (if referencing /partner/card)
- Print CSS (already proven in /partner/card)
- QR code pointing to `/r/[code]/reminders`
- Partner-type conditional (bondsman items vs generic — start with bondsman only)
- SCHEMA.md update for partners.source column

### Expert context:
- **Matt McWilliams** (cached at `~/.claude/experts/matt-mcwilliams.md`) — affiliate activation. His framework's skeleton applies to bondsman partners; INAA-specific adaptation section added to profile.
- **Crisis-buyer lens** (`feedback-crisis-buyer-lens-mandatory.md`) — defendant-facing items on the checklist must pass 3AM panic test. Bondsman-facing dashboard/drip is standard B2B.
- **Captira** is the market-leading bail bond software with GPS/photo check-ins. Our check-in system competes at $0.

## Verification
- `npx tsc --noEmit --skipLibCheck` — clean
- `npx vitest run` — 249/249 pass
- `node ~/projects/continuous-verification/verify.mjs --project inna --probe-only --no-trends` — 32/33 pass (1 pre-existing INNA-H2 CRON_SECRET drift)
- `node scripts/verify-resend-webhook-e2e.mjs` — Layer 2 E2E PASS in prod

## Ready-to-Paste Prompt

```
Continue from
  C:\Users\email\projects\ImNotAnAttorney-web\docs\handoffs\2026-04-15-partner-checklist-and-sms-monitoring.md

Write an implementation plan for the bondsman compliance checklist at
  /partner/checklist (or updated /partner/card).

All context is in the handoff: universal items, QR infra, partner-type branching,
expert framework (McWilliams + crisis-buyer lens). Partner-type infrastructure
already shipped (commit e2b8fad). Start by reading the handoff, then write the plan.
```
