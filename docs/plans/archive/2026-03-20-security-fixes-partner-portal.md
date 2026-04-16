## Context
- **Repo:** C:\Users\email\projects\ImNotAnAttorney-web
- **Problem:** 3 security vulnerabilities in partner portal: TOCTOU race in magic link verification, non-atomic payout with no audit trail on failure, XSS in magic-link email
- **Key files to read first:**
  - `src/lib/partner-auth.ts`, verifyMagicLink with TOCTOU race
  - `src/app/api/admin/partners/[id]/route.ts`, POST handler with non-atomic payout
  - `src/app/api/partner/magic-link/route.ts`, XSS in email template
  - `src/lib/email.ts`, escapeHtml utility already exists
- **Tech stack:** Next.js 15, Supabase (Postgres RPC), Resend email
- **Key decisions:** Use existing `consume_magic_link` RPC (migration 015) for atomic verify; reorder payout to create audit record first; use existing `escapeHtml` from email.ts
- **Setup/prerequisites:** Migration 015 already deployed with `consume_magic_link` RPC

## Plan

### Task 1: Fix TOCTOU race in verifyMagicLink (C2)
- **File:** `src/lib/partner-auth.ts`
- Replace SELECT+check+UPDATE pattern (lines 67-89) with single `supabase.rpc("consume_magic_link", { p_token: token })` call
- Returns partner_id or null

### Task 2: Fix non-atomic payout (C3)
- **File:** `src/app/api/admin/partners/[id]/route.ts`
- Reorder POST handler: create payout record FIRST, then mark referrals paid, then increment total
- If payout record insert fails, return 500 immediately (no data modified)
- If later steps fail, return success with warning (audit trail exists)

### Task 3: Fix XSS in magic-link email (C4)
- **File:** `src/app/api/partner/magic-link/route.ts`
- Import `escapeHtml` from `@/lib/email`
- Wrap `partner.name` in `escapeHtml()` on line 59
