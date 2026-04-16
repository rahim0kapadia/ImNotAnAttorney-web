## Context
- **Repo:** C:/Users/email/projects/ImNotAnAttorney-web
- **Problem:** Code review loop (128 fixes across 9 commits) is complete but nothing has been tested in a running environment. Need to verify fixes work, catch regressions, and harden the site before going live.
- **Key files to read first:** package.json, .env.local, src/middleware.ts, src/app/layout.tsx, vercel.json
- **Tech stack:** Next.js 14+, Supabase (Postgres + Auth + Storage), Stripe (dual test/live), Resend (email), Tailwind CSS, TypeScript
- **Key decisions:** All code changes are committed. This plan is verification + hardening only.
- **Setup/prerequisites:** Dev server must be running (`npm run dev`), .env.local must have all keys

---

## Phase 1: QA, Click-Through Verification
**Goal:** Verify every user-facing flow works after the 128-fix batch.

### 1.1 Public Pages (no auth)
- [ ] Homepage loads, hero renders, ChargeTypeSelector arrow keys work
- [ ] Blog loads, BlogCategoryFilter aria-pressed works, category switching works
- [ ] Services/pricing page loads, all tier prices render
- [ ] Footer renders as server component (no hydration flash), all links work
- [ ] Footer Situation Room link goes to /intake (not /checkout)
- [ ] Score page loads, all 10 questions render, submit works
- [ ] Score result renders with correct band/color, email capture works

### 1.2 Checkout Flow
- [ ] Case Decoder one-time checkout creates Stripe session
- [ ] Case Decoder installment (2x) checkout creates subscription session
- [ ] Installment with promo code, discount applies to BOTH payments (P2-38 fix)
- [ ] Upgrade credit coupon applied correctly
- [ ] Combined referral + upgrade coupon works
- [ ] Verify endpoint returns quickly (no double-latency from P2-53 fix)
- [ ] Success page renders tier-specific content
- [ ] Priority delivery add-on works

### 1.3 Intake Flow
- [ ] /intake loads, form validates all fields
- [ ] Intake submission triggers report generation (check console for HTTP error logging from P3-13 fix)
- [ ] Intelligence Brief Phase 2 intake rejects non-IB tier cases (P3-10 fix)
- [ ] Upload page accepts valid files (PDF, JPEG, PNG, DOCX)
- [ ] Upload page rejects invalid files (ZIP disguised as DOCX, P2-52 fix)
- [ ] Upload page rejects WebP file claimed as WAV and vice versa (RIFF fix)

### 1.4 Customer Portal
- [ ] /my-cases loads after login
- [ ] StatusBadge renders correct colors for all statuses
- [ ] Report links work for delivered cases
- [ ] Unsubscribe flow works (form + confirmation page)

### 1.5 Operator Dashboard
- [ ] /operator login works
- [ ] Dashboard metrics load (count-based queries from P2-23 fix)
- [ ] Cases list loads with StatusBadge
- [ ] Case detail loads (jobs + tasks with explicit columns from P2-25 fix)
- [ ] Jobs list loads with pagination
- [ ] Tasks PATCH with notes > 5000 chars returns 400
- [ ] Case status transitions work
- [ ] Delivery approval sends email

### 1.6 Admin Panel
- [ ] Inbox loads (body_html excluded from list response, P2-62 fix)
- [ ] Reply sends email, log shows ID only (no recipient email, PII fix)
- [ ] Demand gaps/emerging/subreddits, PATCH with non-string id returns 400
- [ ] Email PATCH with non-string id returns 400

---

## Phase 2: Stripe End-to-End
**Goal:** Verify all payment paths work with real Stripe test cards.

### 2.1 Test Mode
- [ ] `stripe trigger checkout.session.completed`, order + case created
- [ ] `stripe trigger charge.refunded`, case marked refunded, commission reversed
- [ ] Installment subscription, cancel_at set, 2 payments process
- [ ] Webhook signature verification works (timing-safe comparison)
- [ ] Duplicate webhook handling (23505) returns 200
- [ ] Failed order insert returns 500 (Stripe will retry)

### 2.2 Live Mode (when ready)
- [ ] Live tier checkout creates session with correct Stripe account
- [ ] Reconciliation detects live sessions (P3-1 CRITICAL fix)
- [ ] Verify endpoint routes cs_live_ to live client first

---

## Phase 3: Cron Verification
**Goal:** Verify all cron tasks work correctly with batch-fetch refactoring.

### 3.1 Drip Emails
- [ ] Post-purchase drip sends correct email at correct delay
- [ ] Nurture sequence respects unsubscribe
- [ ] Dedup prevents re-sends (check drip_emails table)
- [ ] Batch-fetch for subscribers/drip_emails returns same results as N+1 would

### 3.2 Operator Alerts
- [ ] Stuck intake detection fires alert after 2h
- [ ] Stuck generating detection fires alert after 30min
- [ ] Review reminder fires after 12h
- [ ] Awaiting-intake reminder sends to customer after 24h
- [ ] Escalation fires at 72h and 7d
- [ ] Researching nudge/escalation creates subscriber if none exists (dedup bypass fix)
- [ ] Phase 2 intake reminder fires after 48h, escalation at 7d

### 3.3 Pipeline + Monitoring
- [ ] Pipeline completion check transitions case to review when all jobs done
- [ ] Stuck job detection marks jobs as failed after 30min
- [ ] SLA breach detection creates operator task (batch-fetch fix)
- [ ] Weekly progress email sends to War Room/Situation Room customers

### 3.4 Reconciliation
- [ ] Test mode: detects paid session with no order, auto-creates
- [ ] Live mode: same (P3-1 CRITICAL fix)
- [ ] Orphan order detection: creates case for orderless orders (batch-fetch fix)
- [ ] Upsert guard prevents duplicate orders on concurrent webhook+cron

### 3.5 Compliance
- [ ] Abandoned intake cleanup runs with .limit(500)
- [ ] Drip email log cleanup runs for unsubscribed only
- [ ] Discovery document cleanup runs with .limit(50) per cycle

---

## Phase 4: Security Hardening
**Goal:** Verify security fixes and identify remaining gaps.

### 4.1 Auth
- [ ] All operator routes require ADMIN_PASSWORD
- [ ] All admin routes require ADMIN_PASSWORD
- [ ] Timing-safe comparison works (no timing leak)
- [ ] Rate limiting works on public routes (subscribe, intake, score, upload)
- [ ] In-memory fallback activates when Supabase is down

### 4.2 Input Validation
- [ ] XSS in unsubscribe page, escaped emailParam renders safely
- [ ] Webhook signature, forged payload returns 400
- [ ] Score band, invalid band value falls through to non-score email path
- [ ] Array fields in intake, non-string elements filtered before escapeHtml

### 4.3 Supabase RLS Audit (NOT done in code review)
- [ ] Verify RLS policies on: cases, orders, subscribers, intakes, referrals, partners
- [ ] Verify admin client bypasses RLS (service role key)
- [ ] Verify anon key cannot access admin data
- [ ] Verify report_token access is properly scoped

### 4.4 Environment Variables
- [ ] All required env vars present in Vercel production config
- [ ] No secrets in client-side NEXT_PUBLIC_ vars
- [ ] STRIPE_SECRET_KEY_LIVE set (required for live mode reconciliation)
- [ ] STRIPE_WEBHOOK_SECRET_LIVE set
- [ ] OPERATOR_SECRET rotated if ever committed to git

---

## Phase 5: Production Readiness
**Goal:** Infrastructure and monitoring before go-live.

### 5.1 Error Monitoring
- [ ] Set up Sentry (or Vercel Error Tracking) for runtime error capture
- [ ] Configure source maps upload for readable stack traces
- [ ] Set up alerts for: 500 errors > 5/min, webhook failures, cron failures

### 5.2 Uptime & Alerting
- [ ] Uptime monitor on homepage + /api/score/count (lightweight health check)
- [ ] Cron endpoint monitoring (Vercel Cron dashboard or external)
- [ ] Stripe webhook delivery monitoring (Stripe Dashboard > Webhooks > Events)

### 5.3 Performance
- [ ] Lighthouse audit on homepage, blog, services pages
- [ ] Core Web Vitals baseline (LCP, CLS, INP)
- [ ] Image optimization audit (next/image usage, WebP/AVIF)
- [ ] Bundle size check (no unnecessary client components)

### 5.4 SEO
- [ ] sitemap.xml generates correctly
- [ ] robots.txt allows crawling
- [ ] Open Graph / Twitter meta tags on all public pages
- [ ] Structured data (FAQ schema on services page if applicable)
- [ ] Canonical URLs set correctly

### 5.5 Legal Compliance
- [ ] CAN-SPAM: physical address in footer, unsubscribe in every email
- [ ] Terms of Service and Privacy Policy pages exist and are linked
- [ ] "Not legal advice" disclaimer visible on all public pages
- [ ] Cookie consent if using analytics/tracking (check for GA, Hotjar, etc.)

### 5.6 Backup & Recovery
- [ ] Supabase point-in-time recovery enabled
- [ ] Stripe webhook retry strategy understood (3 retries over 72h)
- [ ] Reconciliation cron as safety net for missed webhooks
- [ ] Git commits pushed to remote (currently 36+ commits ahead of origin)

---

## Phase 6: Post-Launch Monitoring (First 7 Days)
- [ ] Daily: check Stripe webhook delivery success rate
- [ ] Daily: check cron execution logs in Vercel
- [ ] Daily: review operator alert emails for false positives
- [ ] Day 3: review Sentry for any new errors
- [ ] Day 7: run reconciliation audit (manual Stripe vs DB comparison)
- [ ] Day 7: review rate limit hit counts for abuse attempts
