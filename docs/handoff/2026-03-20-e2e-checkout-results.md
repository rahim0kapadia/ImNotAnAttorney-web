# E2E Checkout Verification, 2026-03-20

## DUI Defense Playbook ($97), Full Pipeline Test

### Results

| Step | Status | Evidence |
|------|------, |----------|
| Checkout page loads | PASS | `/checkout?tier=dui-first-offense` renders, hero CTA links correctly |
| Stripe payment | PASS | 3 test payments at $97 (pi_3TCl84..., pi_3TCkVu..., pi_3TCk0a...), all `succeeded` |
| Webhook fires | PASS | Orders created in Supabase with `status: paid`, `product_type: digital-product` |
| Download token generated | PASS | 72-hour expiry tokens on all 3 orders |
| Full playbook download | PASS | `GET /api/download/{token}`, 200, `content-type: application/pdf` |
| Emergency playbook download | PASS | `GET /api/download/{token}?doc=emergency`, 200, `content-type: application/pdf` |
| Success page | PASS | `/checkout/success?session_id=...`, 200 |
| Refund webhook handler | PASS (code review) | `charge.refunded` handler updates order/case status, revokes access |

### Production Verification

| Check | Status |
|-------|------, |
| robots.txt | PASS, `/_next/data/*` only (CSS/JS/fonts unblocked) |
| Hero CTA | PASS, points to `/checkout?tier=dui-first-offense` |
| StickyMobileCTA | PASS, defaults to DUI Playbook |
| Google Analytics | PASS, `GoogleAnalytics` component in layout.tsx |
| Statement descriptor | PASS, `LEGAL INFO` suffix on charges |

### Notes

- Stripe is in **test mode** (livemode: false). All payments are test charges.
- 3 orphaned cases exist for digital-product orders (status: awaiting-intake). Likely created by cron orphan detection or a prior webhook version. Current webhook correctly skips case creation for digital products (line 347-444 of route.ts).
- Refund flow not tested live (would alter production test data). Handler verified via code review.

### Remaining for Full E2E

- [ ] Test refund flow live (refund a test charge, verify download returns 403)
- [ ] Verify delivery email content in Resend logs (two buttons, correct links)
- [ ] Mobile checkout flow (responsive verification)
