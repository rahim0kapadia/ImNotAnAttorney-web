# Partner Portal QA, 2026-03-20

## Migration Status

Migrations 013-019 were NOT previously applied. Applied all 7 in this session:

| Migration | Description | Status |
|---------, |-------------|------, |
| 013 | Referral system (partners, referrals, partner_applications) | APPLIED |
| 014 | Partner portal (magic links, sessions, payouts, payment info) | APPLIED |
| 015-a | Emergency playbook split (charge_packs) | APPLIED |
| 015-b | Partner portal fixes (partner_referrals rename, heard_about_us) | APPLIED |
| 016 | Atomic payout RPC | APPLIED |
| 017 | Hash session tokens (SHA-256) | APPLIED |
| 018 | RLS on all 6 partner tables | APPLIED |
| 019 | Drop plaintext session_token column | APPLIED |

## Page Load Tests

| Page | Status | URL |
|------|------, |---, |
| Partner signup | PASS (200) | `/partners` |
| Partner login | PASS (200) | `/partner/login` |
| Bondsman landing | PASS (200) | `/partners/bondsman` |

## API Tests

| Endpoint | Method | Status | Notes |
|----------|------, |------, |-------|
| `/api/partners/apply` | POST | PASS (200) | Application created in `partner_applications` |
| `/api/admin/partners/[id]` | PATCH | BLOCKED | 401, local ADMIN_PASSWORD doesn't match Vercel production. Need Rahim to test admin approval from production env. |

## What Was Verified

- Partner application form submits correctly (bondsman source tracked)
- Row created in `partner_applications` with all fields
- Middleware correctly gates admin routes with timing-safe comparison
- Middleware allows public partner routes (apply, magic-link, logout)
- Middleware checks cookie for authenticated partner routes

## Remaining (needs Rahim or local dev server)

- [ ] Admin approval flow (create Stripe coupon + promo code, convert to partner)
- [ ] Magic link login flow (request, email delivery, token consumption)
- [ ] Dashboard rendering (all 6 sections)
- [ ] QR code generation and download
- [ ] Referral cookie flow (/r/{code} -> bridge -> quiz -> checkout with discount)
- [ ] Commission tracking after referred purchase
- [ ] Payment settings form save
- [ ] Partner logout
