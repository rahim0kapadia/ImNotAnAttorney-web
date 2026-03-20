## Context
- **Repo:** `C:\Users\email\projects\ImNotAnAttorney-web`
- **Problem:** 3 rounds of code review on partner portal changes. Round 1 found 27 issues (fixed). Round 2 found 24 issues (fixed). Round 3 found 23 more issues. Looping reviews until clean.
- **Key files to read first:** `src/middleware.ts`, `src/app/api/admin/partners/[id]/route.ts`, `src/lib/partner-data.ts`, `src/app/api/partners/apply/route.ts`, `src/app/api/partner/magic-link/route.ts`
- **Tech stack:** Next.js 15 (App Router), Tailwind CSS, Supabase, Stripe, Resend
- **Key decisions:** Fix all issues found across review rounds; loop until clean review.

---

## Round 3 Findings (23 issues)

### CRITICAL (3)

- [x] **#1** `middleware.ts:98` — `/api/partners/apply` blocked by `startsWith("/api/partner")` matching plural "partners". Partner signup returns 401 for all applicants.
- [x] **#2** `016-atomic-payout.sql` — `process_partner_payout` is SECURITY DEFINER callable by public/anon. Need REVOKE EXECUTE FROM public.
- [x] **#3** `015-partner-portal-fixes.sql` — Same for `increment_partner_total` and `consume_magic_link`.

### WARNING (15)

- [x] **#4** `partner/dashboard/page.tsx:437` — Wrong email `support@` → should use CONTACT_EMAIL from `@/lib/site`.
- [x] **#5** `admin/[id]/route.ts:103` + `settings/route.ts:11` — VALID_PAYOUT_METHODS duplicated. Extract to shared constant.
- [x] **#6** `magic-link/route.ts:18` — `req.json()` not in try/catch (other routes do this). Outer catch gives 500 instead of 400.
- [x] **#7** `settings/route.ts:40` — Empty string `""` bypasses payment method validation.
- [x] **#8** `apply/route.ts:63-67` — Non-string fields pass length validation silently.
- [x] **#9** `admin/[id]/route.ts:73,79` — PATCH silently ignores invalid status/commission_rate, returns 200.
- [x] **#10** `partner-data.ts:28` — xRayFiveMonthly parses formatted string. Derive from raw cents.
- [x] **#11** Partners + bondsman pages — "Why Defendants Buy" 4-card section duplicated.
- [x] **#12** `ShareButtons.tsx:84-86` — `order` prop dead code, both branches same.
- [x] **#13** `apply/route.ts:91` — `escapeHtml()` in email Subject (plaintext, shows `&amp;`).
- [x] **#14** `partner-auth.ts:131` — Comment says "DB avoids clock skew" but uses app clock. Fix comment.
- [x] **#15** `dashboard/page.tsx:169` — Empty referralUrl when promo_code null. QR/copy/preview broken.
- [x] **#16** `dashboard/page.tsx:18` — SITE_URL redeclared locally. Import from `@/lib/site`.
- [x] **#17** Multiple routes — `email.toLowerCase().trim()` inlined. Use `normalizeEmail()` from site.ts.
- [x] **#18** `admin/route.ts` + `apply/route.ts` — Email regex duplicated. Use existing utility.

### SUGGESTION (5)

- [x] **#19** `QRCode.tsx:35-49` — Canvas fallback stays hidden when lib fails.
- [x] **#20** Partners pages — FAQ mapped inline. Use `{question, answer}` shape in source data.
- [x] **#21** `apply/route.ts:89` — Operator notification await can 500 despite successful insert.
- [x] **#22** `ReferralQuiz.tsx:84,87,99` — `as TierSlug` type assertions bypass TS.
- [x] **#23** `ReferralQuiz.tsx:120-123` — else branch dead code.

---

## Round 4 Findings (10 issues — 0 CRITICAL)

### WARNING (5)

- [x] **#24** `middleware.ts:98` — Prefix `startsWith("/api/partner")` is fragile. Fix with trailing slash to not catch `/api/partners/*`.
- [x] **#25** `MessageTemplates.tsx:42` — `copyToClipboard` return value ignored — shows "Copied!" on failure.
- [x] **#26** `apply/route.ts:14` — OPERATOR_EMAIL hardcoded fallback. Use `OPERATOR_EMAIL_FALLBACK` from site.ts.
- [x] **#27** `admin/route.ts:47` + `apply/route.ts:44` — Whitespace-only `name` passes `!name` check, produces degenerate promo codes.
- [x] **#28** `middleware.ts` — `/api/partner/logout` not in allowlist; cleared-cookie logout returns 401 instead of clean response.

### SUGGESTION (5 — deferred, not fixing now)

- [ ] **#29** Session tokens stored plaintext — needs architectural change (hash tokens), separate task.
- [ ] **#30** No RLS on partner portal tables — needs migration + policy design, separate task.
- [ ] **#31** No UUID validation on admin `[id]` param — admin-only, DB rejects invalid UUIDs.
- [ ] **#32** `unpaid_commission` calc duplicated in 2 GET handlers — low impact.
- [ ] **#33** Promo code sanitization logic duplicated — low impact.

---

## Round 5 Findings

**CLEAN — no critical or warning issues found.**

4 SUGGESTIONs remain (all low-impact, not fixing):
- Missing `/api/partners/:path*` in explicit middleware matcher list (works via catch-all)
- `body.payment_method` not type-checked before use (admin-only)
- QR placeholder image always loaded (no functional impact)
- `referralUrl` not URL-encoded (safe due to alphanumeric-only promo codes)

## Summary

| Round | Found | Fixed | Remaining |
|-------|-------|-------|-----------|
| 1 | 27 | 27 | 0 |
| 2 | 24 | 24 | 0 |
| 3 | 23 | 23 | 0 |
| 4 | 10 | 5 (5 deferred) | 5 deferred |
| 5 | 0 CRITICAL/WARNING | — | CLEAN |
| **Total** | **84** | **79 fixed** | **5 deferred** |

---

## Deferred Items — Implementation Plans

### D1: Hash session tokens before storing (architectural)

**Problem:** `partner_sessions.session_token` stores raw hex tokens. If DB is compromised, all active sessions are immediately usable. The existing `portal_sessions` table already uses `session_token_hash` as the pattern.

**Implementation:**
1. **Migration `017-hash-session-tokens.sql`:**
   - Add `session_token_hash text` column to `partner_sessions`
   - Backfill: `UPDATE partner_sessions SET session_token_hash = encode(sha256(session_token::bytea), 'hex')`
   - Drop old column: `ALTER TABLE partner_sessions DROP COLUMN session_token`
   - Add unique index on `session_token_hash`
2. **`src/lib/partner-auth.ts` — `createPartnerSession()`:**
   - After generating `sessionToken = crypto.randomBytes(32).toString("hex")`, compute `hash = crypto.createHash("sha256").update(sessionToken).digest("hex")`
   - Insert `session_token_hash: hash` (not the raw token)
   - Return raw `sessionToken` to caller (for the cookie)
3. **`src/lib/partner-auth.ts` — `validatePartnerSession()`:**
   - Receive raw token from cookie
   - Compute `hash = crypto.createHash("sha256").update(sessionToken).digest("hex")`
   - Query `.eq("session_token_hash", hash)` instead of `.eq("session_token", sessionToken)`
4. **`src/lib/partner-auth.ts` — `destroyPartnerSession()`:**
   - Same: hash the token, delete by hash
5. **Same pattern for `partner_magic_links.token`** — lower priority since tokens are 15-min single-use, but same approach: store hash, compare by hash.

**Risk:** Migration must run atomically. Any active sessions at migration time get their tokens hashed in-place. New code must deploy simultaneously with migration. Use a maintenance window or feature flag.

**Hash parity verification:** Before the destructive `DROP COLUMN` step, verify that PostgreSQL `encode(sha256(session_token::bytea), 'hex')` produces identical output to Node.js `crypto.createHash("sha256").update(sessionToken).digest("hex")`. Both hash the token's UTF-8/ASCII bytes (not the hex-decoded binary), so they should match for hex-only tokens. **Test this explicitly** in a staging environment by inserting a known token, running the backfill, then querying via the Node.js hash path. Do NOT drop the old column until parity is confirmed.

### D2: Enable RLS on partner portal tables

**Problem:** `partner_magic_links`, `partner_sessions`, `partner_payouts`, `partner_applications`, `referrals` have no RLS. All access goes through `service_role` key (bypasses RLS), but defense-in-depth dictates RLS should be on.

**Implementation:**
1. **Migration `018-partner-rls.sql`** (separate from D1's `017`):
   ```sql
   ALTER TABLE partner_magic_links ENABLE ROW LEVEL SECURITY;
   ALTER TABLE partner_sessions ENABLE ROW LEVEL SECURITY;
   ALTER TABLE partner_payouts ENABLE ROW LEVEL SECURITY;
   ALTER TABLE partner_applications ENABLE ROW LEVEL SECURITY;
   ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;

   -- No permissive policies for anon/authenticated — service_role bypasses RLS
   -- This means anon key cannot read/write these tables even if exposed
   ```
   Note: `partners` table intentionally excluded — it holds data queried by public partner pages.
2. **Verify:** All partner API routes use `createAdminClient()` which uses `service_role` key — RLS is bypassed. No code changes needed.
3. **Test:** Confirm anon-key Supabase client cannot query these tables after migration.

**Risk:** Low. `service_role` bypasses RLS entirely. Only breaks if any code path accidentally uses an anon-key client for partner data (none do currently).

### D3: UUID validation on admin `[id]` route parameter

**Problem:** `id` from URL path used directly in `.eq("id", id)` without format validation. DB rejects invalid UUIDs, but produces noisy logs and generic 500s.

**Implementation:**
1. **`src/app/api/admin/partners/[id]/route.ts`** — add at top of each handler:
   ```ts
   const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
   ```
   Then in GET, PATCH, POST:
   ```ts
   if (!UUID_RE.test(id)) {
     return NextResponse.json({ error: "Invalid partner ID" }, { status: 400 });
   }
   ```
2. Regex is short, applied to a short known-format string (not file contents) — compliant with project regex rules.

**Risk:** None. Purely additive validation.

### D4: Extract `unpaid_commission` calculation

**Problem:** `(p.total_commission || 0) - (p.total_paid_out || 0)` duplicated in `admin/partners/route.ts` (GET list) and `admin/partners/[id]/route.ts` (GET detail).

**Implementation:**
1. Add to `src/lib/partner-data.ts`:
   ```ts
   export function computeUnpaidCommission(partner: { total_commission?: number; total_paid_out?: number }): number {
     return (partner.total_commission || 0) - (partner.total_paid_out || 0);
   }
   ```
2. Import and use in both GET handlers.

**Risk:** None. Pure refactor.

### D5: Extract promo code sanitization

**Problem:** The alphanumeric filter `split("").filter(c => (c >= "A" && c <= "Z") || (c >= "0" && c <= "9")).join("")` appears twice in `admin/partners/route.ts` — once for user-provided codes and once in the collision retry loop.

**Implementation:**
1. Add to `src/app/api/admin/partners/route.ts` (local helper, not worth a separate file):
   ```ts
   function sanitizePromoCode(s: string): string {
     return s.toUpperCase().split("").filter(c => (c >= "A" && c <= "Z") || (c >= "0" && c <= "9")).join("");
   }
   ```
2. Replace both inline usages with `sanitizePromoCode(...)`.

**Risk:** None. Pure refactor.
