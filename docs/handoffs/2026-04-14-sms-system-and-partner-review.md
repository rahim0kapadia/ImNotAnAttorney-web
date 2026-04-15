# Handoff: SMS Notification System Complete + Partner Portal Review Needed
Date: 2026-04-14 01:00

## Task
Executed the full SMS notification system plan, then pivoted SMS providers until finding one that works. Now need: code review of the entire partner program buildout, stale ref cleanup, and SMS delivery monitoring.

## What Shipped (this session)

### SMS Notification System (14 tasks from the plan)
All 14 tasks from the SMS plan executed via subagent-driven development:
1. notification-prefs.ts — channel types, defaults, merge logic, consent guards
2. sms.ts — SMS sending utility (provider swapped 3x, see below)
3. DB migration — phone, sms_consent_at, notification_prefs on court_reminders/partners, locked_at on referrals, sms_log table
4. PhoneOptIn component on prep page + phone collection API
5. Court reminder cron — SMS + partner alerts with Promise.allSettled
6. Client magic link — SMS alongside email with preference routing
7. Client notification settings — GET/PATCH API with court_reminders safety gate
8. Check-in confirmation SMS
9. Partner magic link — preference-aware email/SMS routing
10. Partner notification settings UI + API on dashboard
11. Partner drip — SMS alongside email
12. Stripe webhook — commission sale SMS in both notification paths
13. Commission locking cron — 45-day holdback + partner notifications
14. ARCHITECTURE.md + CONTEXT.md updates

### Audit Fixes
- CRITICAL: court reminder cron force-emails when prefs route to zero channels
- IMPORTANT: magic link routes always send email (auth-critical)
- IMPORTANT: autoUpgradeOnPhone enforces court_reminders safety invariant defensively
- WARNING: rate limiting on phone collection endpoint (3/hr per token)

### SMS Provider Journey
Bird → rejected (requires sales call)
Telnyx → rejected (freemium locked to AI products, can't switch billing)
Twilio → works but 10DLC registration takes 10-15 days, carriers block unregistered
text.email → WINNER. Sends email to {phone}@text.email via Resend. $0/msg, no 10DLC needed, live-tested on Rahim's phone.

## Approach
- Final SMS: `src/lib/sms.ts` emails `{bare10digit}@text.email` via existing Resend API
- No new env vars — uses `RESEND_API_KEY` already configured
- Twilio account exists as backup (SID + number in .env.local across all 3 INAA repos as `TWILIO_ACCOUNT_SID` / `TWILIO_FROM_NUMBER`, label "Go2-INAA"), 10DLC pending
- Twilio creds saved in .env.local across all 3 INAA repos

## Files Modified (SMS-related only, excludes defense intelligence commits by other sessions)
- src/lib/sms.ts — text.email gateway via Resend
- src/lib/notification-prefs.ts — channel types, defaults, merge, consent guards
- src/lib/court-reminders.ts — phone, sms_consent_at, notification_prefs on CourtReminder interface
- src/lib/partner-auth.ts — notification_prefs in generateMagicLink + validatePartnerSession
- src/lib/partner-data.ts — notification_prefs on Partner interface
- src/lib/site.ts — normalizePhone, isValidPhone
- src/app/api/court-reminders/[token]/phone/route.ts — NEW, phone collection + rate limit
- src/app/api/court-reminders/[token]/prefs/route.ts — NEW, client notification settings
- src/app/api/partner/notification-prefs/route.ts — NEW, partner notification settings
- src/app/api/cron/lock-commissions/route.ts — NEW, 45-day holdback commission locking
- src/app/api/cron/court-reminders/route.ts — SMS + partner alerts + zero-channel fallback
- src/app/api/cron/partner-drip/route.ts — preference-aware SMS alongside email
- src/app/api/customer/magic-link/route.ts — SMS + always-email for auth-critical
- src/app/api/partner/magic-link/route.ts — preference-aware + always-email
- src/app/api/check-in/route.ts — SMS confirmation
- src/app/api/webhooks/stripe/route.ts — commission sale SMS (both paths)
- src/components/PhoneOptIn.tsx — NEW, phone + consent collection on prep page
- src/components/partner/NotificationSettings.tsx — NEW, dashboard notification prefs UI
- src/app/prep/[token]/page.tsx — PhoneOptIn + notification settings link
- src/app/partner/dashboard/page.tsx — NotificationSettings component
- tests/notification-prefs.test.ts — NEW, 18 tests
- tests/sms.test.ts — NEW, 7 tests
- supabase/migrations/20260414a_sms_notification_prefs.sql — NEW, applied to production
- supabase/SCHEMA.md — new columns + sms_log table documented
- ARCHITECTURE.md — SMS system + commission holdback documented (env vars STALE — still says TELNYX)
- src/lib/CONTEXT.md — twilio→telnyx→text.email (may have stale refs)

## What Didn't Work
- Bird: requires talking to sales team, no self-serve for SMS
- Telnyx: freemium account gives $25 AI credits but SMS balance was -$0.06, couldn't switch billing type
- Twilio: account works, SMS API works, but error 30034 — carriers block unregistered 10DLC. Registration takes 10-15 days.
- Email-to-carrier gateways (AT&T/T-Mobile/Verizon): all shut down 2024-2025
- Google Voice: no API, blocks automated sending

## Remaining Steps

### 1. Stale ref cleanup + ARCHITECTURE.md env vars
Grep src/ and docs for Bird/Telnyx/Twilio references. Fix ARCHITECTURE.md env vars section (still says TELNYX_API_KEY/TELNYX_FROM_NUMBER — should note text.email uses existing RESEND_API_KEY).

### 2. Partner portal code review
Read all 4 plans end-to-end, verify every task/phase exists in code:
- C:\Users\email\projects\ImNotAnAttorney-web\docs\superpowers\plans\2026-04-12-partner-program-best-in-class.md (10 tasks)
- C:\Users\email\projects\ImNotAnAttorney-web\docs\superpowers\plans\2026-04-12-court-reminders-platform.md (11 tasks)
- C:\Users\email\projects\ImNotAnAttorney-web\docs\plans\2026-04-13-fta-prevention-platform-v2.md (6 phases)
- C:\Users\email\projects\ImNotAnAttorney-web\docs\superpowers\plans\2026-04-13-bird-sms-notification-system-v2.md (14 tasks)

### 3. SMS delivery monitoring (build all 3 layers)
Layer 1: Weekly health check cron — /api/cron/sms-health-check sends test SMS to +16504846374, logs to sms_log, Telegram alert on failure via @BorisLegalBot. Register on cron-job.org weekly.
Layer 2: Resend bounce detection — monitor for bounces from @text.email addresses, Telegram alert on gateway rejection.
Layer 3: CV probe — add SMS delivery probe to ~/projects/continuous-verification/verify.mjs. Closed-loop: send test SMS, verify delivery via callback or sms_log success rate threshold.
Prerequisite: wire sms_log inserts into sendSMS() — table exists but no writes yet.

### 4. Verify + deploy
- tsc --noEmit
- vitest run tests/sms.test.ts tests/notification-prefs.test.ts
- CV: node ~/projects/continuous-verification/verify.mjs --project inna --probe-only --no-trends
- git push origin master

## Verification
- `npx tsc --noEmit` — type check (pre-existing errors in cross-validator.test.ts and mechanical-extractor.test.ts are unrelated)
- `npx vitest run tests/sms.test.ts tests/notification-prefs.test.ts` — 25 tests pass
- `node ~/projects/continuous-verification/verify.mjs --project inna --probe-only --no-trends` — CV probe
- `grep -r "BIRD\|TELNYX\|Bird\|Telnyx" src/ ARCHITECTURE.md src/lib/CONTEXT.md` — should return 0 matches after cleanup

## Key Decisions
- Court reminders NEVER sms-only — always email or both (safety invariant, keeps people out of jail)
- Magic links always send email regardless of pref (auth-critical, can't risk zero delivery)
- Commission locking uses 45-day holdback, excludes refunded orders (.gt("commission_amount", 0))
- text.email chosen over Twilio for speed — works today vs 10-15 day 10DLC wait
- Twilio kept as backup — 10DLC registration pending, creds saved, code can swap back in 2 minutes
