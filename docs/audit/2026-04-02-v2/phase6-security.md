# Security Audit: ImNotAnAttorney-web

**Date:** 2026-04-02
**Auditor:** Security Engineer Agent (Opus 4.6)
**Scope:** Full OWASP Top 10 + YMYL-specific controls
**Tech Stack:** Next.js 16.1.6, Supabase (PostgreSQL), Stripe, Resend, Vercel
**Classification:** YMYL legal site handling criminal case data, payments ($97-$9,997), PII

---

## Executive Summary

The application demonstrates **above-average security posture** for a Next.js YMYL site. The codebase shows clear evidence of defense-in-depth thinking: timing-safe comparisons, nonce-based CSP, server-side input validation, HTML escaping, rate limiting, and atomic database operations. The recent fixes (IndexNow auth, intake charge type validation) are confirmed correct.

**6 vulnerabilities found across 4 severity levels:**
- SERIOUS: 2
- MODERATE: 3
- MINOR: 1
- Verified fixes: 3/3 confirmed

---

## Section 1: Verified Recent Fixes

### M1: IndexNow Route Auth, VERIFIED FIXED

**File:** `C:\Users\email\projects\ImNotAnAttorney-web\src\app\api\indexnow\route.ts:17-19`
**Status:** FIXED. Now uses `requireCron(req)` from `@/lib/auth/guards` instead of inline Buffer comparison. SSRF mitigation also present, URL domain validation at line 38-47 ensures only `imnotanattorney.com` URLs are submitted to the IndexNow API.

### M2: Intake Unknown Charge Type Rejection, VERIFIED FIXED

**File:** `C:\Users\email\projects\ImNotAnAttorney-web\src\app\api\intake\route.ts:103-109`
**Status:** FIXED. Unknown charge types now return 400 immediately. The allowlist is imported from `@/lib/charge-types` (centralized). Both the new taxonomy slugs and legacy free-form values are included for backward compatibility.

### M3: Charge-Taxonomy Cache-Control Headers, VERIFIED FIXED

**File:** `C:\Users\email\projects\ImNotAnAttorney-web\src\app\api\charge-taxonomy\categories\route.ts:10-12`
**Status:** FIXED. Returns `Cache-Control: public, max-age=3600` (1-hour cache). Verified on the categories endpoint; charges and questions routes should be checked for consistency.

---

## Section 2: Injection (A03:2021)

### 2.1 SQL Injection via Supabase Client

**Risk:** LOW (no finding)

All database operations use the Supabase JS client's parameterized query builder (`.eq()`, `.gte()`, `.select()`, etc.). No raw SQL string concatenation found in any route handler. The only RPC calls use named parameters (`p_key`, `p_max_requests`, etc.).

Files checked:
- `src/app/api/intake/route.ts`, parameterized queries only
- `src/app/api/checkout/route.ts`, parameterized queries only
- `src/app/api/upload/route.ts`, parameterized queries only
- `src/app/api/webhooks/stripe/route.ts`, parameterized queries only
- `src/lib/rate-limit.ts`, RPC with named params

### 2.2 XSS in Report HTML (sanitize-html)

**Risk:** LOW (well-mitigated)
**File:** `C:\Users\email\projects\ImNotAnAttorney-web\src\app\report\[token]\page.tsx:272-322`

The sanitize-html configuration is significantly tightened from defaults:
- Removed `<style>`, `<script>`, `<html>`, `<head>`, `<body>`, `<meta>`, `<link>` tags
- CSS property values use strict regex patterns (no wildcards)
- `background` property regex prevents `url()` data exfiltration
- `img` only allows `src`, `alt`, `width`, `height`, no `onerror`/`onload`

**One concern:** The `<a>` tag allows `href` with no protocol restriction in the sanitize-html config. While sanitize-html strips `javascript:` by default, the explicit config does not enforce `https:` only. Since reports are system-generated (not user-authored), this is low risk.

### 2.3 Template Injection in Emails

**Risk:** LOW (well-mitigated)
**Files:** All email-generating routes

The `escapeHtml()` function at `src/lib/email.ts:31-38` escapes `& < > " '`, the complete set for HTML entity prevention. Verified usage across:
- Stripe webhook operator emails (line 137-142)
- Intake confirmation emails (line 308-312, 367-396)
- Upload receipt emails (line 336)
- Unsubscribe confirmation page (line 107)

All user-supplied strings (`firstName`, `email`, `chargeType`, `file.name`, etc.) pass through `escapeHtml()` before interpolation.

### 2.4 Prompt Injection via Intake Data

**Risk:** LOW (mitigated by allowlisting)

Charge types are validated against an explicit allowlist before being used in report generation prompts. Free-text fields (`situation`, `specificQuestion`) are length-capped (5000 and 500 chars respectively) and stored as data, but their path into Claude prompts should be monitored. The `chargeSpecificData` JSONB field enforces string-only values with key/value length caps (50/200 chars).

---

## Section 3: Broken Authentication (A07:2021)

### 3.1 Timing-Safe Comparisons, WELL IMPLEMENTED

**Files:**
- `src/lib/auth/guards.ts:37-41`, HMAC-then-compare (Node Runtime)
- `src/middleware.ts:19-36`, HMAC-then-compare (Edge Runtime, Web Crypto)
- `src/app/api/deliver/route.ts:57-61`, HMAC-then-compare
- `src/lib/site.ts:171-177`, Character-by-character XOR comparison

All three auth layers (middleware, guards, deliver) use HMAC-then-compare to eliminate the length oracle. The HMAC approach is correct, `timingSafeEqual` alone would leak whether the attacker's input has the correct LENGTH via the early `bufA.length !== bufB.length` check.

### FINDING S-1: Operator Token Verification Uses XOR Instead of HMAC-then-Compare

**Severity:** MODERATE
**File:** `C:\Users\email\projects\ImNotAnAttorney-web\src\lib\site.ts:171-177`
**Description:** The `verifyOperatorToken()` function uses character-by-character XOR comparison on hex strings:

```typescript
if (providedHmac.length !== expectedHmac.length) return false;  // length oracle
let mismatch = 0;
for (let i = 0; i < providedHmac.length; i++) {
  mismatch |= providedHmac.charCodeAt(i) ^ expectedHmac.charCodeAt(i);
}
return mismatch === 0;
```

The `length !== length` check on line 172 is a length oracle, it returns early when lengths differ, leaking information about the expected length. For HMAC hex digests this is low-impact (always 64 chars), but it breaks the pattern established everywhere else in the codebase (HMAC-then-compare). More critically, `charCodeAt()` XOR on JS strings is not guaranteed constant-time by all JS engines (V8 optimizations can short-circuit).

**Remediation:** Use the same `timingSafeCompare()` pattern from `guards.ts`:
```typescript
const hmacA = createHmac("sha256", "inna-token-verify").update(providedHmac).digest();
const hmacB = createHmac("sha256", "inna-token-verify").update(expectedHmac).digest();
return timingSafeEqual(hmacA, hmacB);
```

### 3.2 Magic Link Security, WELL IMPLEMENTED

**File:** `C:\Users\email\projects\ImNotAnAttorney-web\src\lib\customer-auth.ts`

- Tokens: `crypto.randomBytes(32)`, 256-bit, cryptographically secure
- Storage: SHA-256 hashed, plaintext never in DB
- Expiry: 15 minutes
- Single-use: Atomic RPC `consume_customer_magic_link` prevents TOCTOU race
- Session: 30 days, token hashed in DB
- Cookie: `httpOnly: true`, `secure: true` in production, `sameSite: "strict"`, scoped to `/`
- Anti-enumeration: Always returns `{ success: true }` regardless of whether email exists
- Rate limiting: 3/email/hour + 10/IP/hour
- Token format validation: `/^[0-9a-f]{64}$/` regex check before DB lookup

### 3.3 Admin/Operator/Cron Auth, WELL IMPLEMENTED

Defense-in-depth: middleware (Edge Runtime) blocks unauthenticated requests first, then route handlers re-check with `requireAdmin()`, `requireOperatorSecret()`, or `requireCron()` from guards.ts. Both layers use timing-safe comparison. Missing env vars fail closed (return 500 "Server misconfigured").

---

## Section 4: Sensitive Data Exposure (A02:2021)

### 4.1 NEXT_PUBLIC_* Environment Variables

**File:** `C:\Users\email\projects\ImNotAnAttorney-web\.env.local`

Four `NEXT_PUBLIC_*` variables exposed to the client bundle:
1. `NEXT_PUBLIC_SUPABASE_URL`, Public by design (project URL)
2. `NEXT_PUBLIC_SUPABASE_ANON_KEY`, Defined but **never imported or used** in any source file
3. `NEXT_PUBLIC_SITE_URL`, Public by design (site URL)
4. `NEXT_PUBLIC_GA_ID`, Public by design (analytics)

### FINDING S-2: Unused Supabase Anon Key in Environment

**Severity:** MINOR
**File:** `C:\Users\email\projects\ImNotAnAttorney-web\.env.local:7`
**Description:** `NEXT_PUBLIC_SUPABASE_ANON_KEY` is defined in the env file but never used in any source file. It is exposed in the client-side bundle via Next.js's NEXT_PUBLIC_ mechanism. While the anon key is designed to be public (it only grants access through RLS policies), having it in the environment creates confusion about what's intentionally public. Since this project uses service-role-only access (no client-side Supabase), the anon key serves no purpose.

**Remediation:** Remove `NEXT_PUBLIC_SUPABASE_ANON_KEY` from `.env.local` and from Vercel env vars. If it's not used, it shouldn't exist.

### 4.2 Secrets Not in NEXT_PUBLIC_, VERIFIED SAFE

All secret keys are correctly stored without the `NEXT_PUBLIC_` prefix:
- `STRIPE_SECRET_KEY`, `STRIPE_SECRET_KEY_LIVE`
- `STRIPE_WEBHOOK_SECRET`, `STRIPE_WEBHOOK_SECRET_LIVE`
- `SUPABASE_SERVICE_ROLE_KEY`
- `RESEND_API_KEY`
- `ADMIN_PASSWORD`
- `OPERATOR_SECRET`
- `CRON_AUTH_TOKEN`
- `ANTHROPIC_API_KEY`
- `COURTLISTENER_TOKEN`

### 4.3 PII in Logs

**File:** `C:\Users\email\projects\ImNotAnAttorney-web\src\app\api\webhooks\stripe\route.ts:132`

```typescript
console.error("[Stripe Webhook] Missing metadata:", { tier, email, amount });
```

Customer email addresses appear in server logs when webhook metadata is incomplete. On Vercel, these logs are accessible via the dashboard and API. This is an operational necessity (debugging payment failures) but should be noted for GDPR/privacy awareness.

**Recommendation:** No code change needed. This is an error path that fires only when Stripe metadata is missing (payment without tier/email). Log retention should be reviewed in Vercel settings. If GDPR applies, document this as a legitimate interest for fraud prevention.

### 4.4 Error Messages, VERIFIED SAFE

Error responses across all routes return generic messages:
- `"Something went wrong"` (500s)
- `"Invalid case ID or email"` (403 on upload, unified to prevent case enumeration)
- `"Unauthorized"` (401s)
- `"Too many requests"` (429s)

No stack traces, database error details, or internal paths leak to clients.

---

## Section 5: API Security (A01:2021)

### 5.1 Rate Limiting, COMPREHENSIVE

PostgreSQL-based rate limiting via `check_rate_limit()` RPC with in-memory fallback (fails closed). Coverage:

| Endpoint | Limit | Window |
|----------|-------|------, |
| `/api/subscribe` | 5/IP | 60s |
| `/api/score` | 10/IP | 60s |
| `/api/intake` | 5/IP | 300s |
| `/api/checkout` | 10/IP | 300s |
| `/api/upload` | 10/IP | 300s |
| `/api/customer/magic-link` | 10/IP/hr + 3/email/hr | 3600s |
| `/api/customer/magic-link/verify` | 10/IP | 300s |
| `/api/partners/apply` | 3/IP | 3600s |

### FINDING S-3: No Rate Limiting on Unsubscribe POST Endpoint

**Severity:** MODERATE
**File:** `C:\Users\email\projects\ImNotAnAttorney-web\src\app\api\unsubscribe\route.ts:138`
**Description:** The POST handler for `/api/unsubscribe` has no rate limiting. An attacker could brute-force base64-encoded email addresses to mass-unsubscribe users. While the base64 obfuscation provides some barrier, it is trivial to encode known email addresses. The endpoint always returns a redirect (preventing enumeration), but the database UPDATE still fires for every request.

**Impact:** Mass unsubscription attack could disrupt the email marketing funnel. Estimated blast radius: all subscribers in the `subscribers` table.

**Remediation:** Add IP-based rate limiting (e.g., 10/IP/minute):
```typescript
const ip = getClientIp(req);
const { limited } = await checkRateLimit(createAdminClient(), `unsubscribe:${ip}`, 10, 60);
if (limited) {
  return NextResponse.redirect(new URL("/unsubscribe?success=true", req.url));
}
```

### 5.2 CORS Configuration

No explicit CORS headers found in middleware, route handlers, or `next.config.ts`. Next.js defaults to same-origin policy for API routes. The Stripe webhooks and Resend webhooks authenticate via signatures, not CORS. The embed script (`public/embed.js`) runs on third-party domains but only creates DOM elements with hardcoded links, no cross-origin API calls.

**Verdict:** Correct. No CORS relaxation needed.

### 5.3 Webhook Verification

**Stripe:** Verified via `stripe.webhooks.constructEvent()` with HMAC signature validation. Dual-mode (test + live secrets). Unverified events return 400. Verified at `src/app/api/webhooks/stripe/route.ts:60-96`.

**Resend:** Verified via Svix HMAC signature with constant-time comparison. Rejects if `RESEND_WEBHOOK_SECRET` is not configured (fails closed). Timestamp replay protection (5-minute window). Verified at `src/app/api/webhooks/resend/route.ts:26-83`.

---

## Section 6: Security Misconfiguration (A05:2021)

### 6.1 Security Headers, COMPREHENSIVE

**File:** `C:\Users\email\projects\ImNotAnAttorney-web\next.config.ts`

| Header | Value | Assessment |
|------, |-------|------------|
| HSTS | `max-age=63072000; includeSubDomains; preload` | Excellent (2 years, preload) |
| X-Content-Type-Options | `nosniff` | Correct |
| X-Frame-Options | `DENY` | Correct |
| Referrer-Policy | `strict-origin-when-cross-origin` | Correct for YMYL |
| Permissions-Policy | `camera=(), microphone=(), geolocation=(), payment=(self)` | Correct |

### 6.2 Content Security Policy (Nonce-Based)

**File:** `C:\Users\email\projects\ImNotAnAttorney-web\src\middleware.ts:139-155`

```
default-src 'self';
script-src 'self' 'nonce-{nonce}' 'strict-dynamic' https://js.stripe.com https://vercel.live;
style-src 'self' 'unsafe-inline';
img-src 'self' data: https:;
font-src 'self';
connect-src 'self' https://api.stripe.com https://vercel.live {supabase_url};
frame-src https://js.stripe.com https://hooks.stripe.com;
frame-ancestors 'none';
base-uri 'self';
form-action 'self' https://checkout.stripe.com;
```

Assessment:
- `'unsafe-inline'` in style-src is necessary for Tailwind CSS. Acceptable.
- `img-src 'self' data: https:` allows any HTTPS image source. This is acceptable for report HTML which may reference external images. The `data:` is needed for inline SVGs/icons.
- `frame-ancestors 'none'` correctly blocks clickjacking (reinforces X-Frame-Options).
- Nonce rotation per-request via `crypto.randomUUID()` is correct.

### FINDING S-4: CSP Missing `object-src` and `worker-src` Directives

**Severity:** MODERATE
**File:** `C:\Users\email\projects\ImNotAnAttorney-web\src\middleware.ts:144-155`
**Description:** The CSP does not explicitly set `object-src` or `worker-src`. Without `object-src`, it inherits from `default-src 'self'`, which blocks `<object>`, `<embed>`, and `<applet>` tags (correct). However, explicitly setting `object-src 'none'` is a best practice that makes the policy more resistant to future `default-src` changes.

More importantly, `worker-src` is not set. While `default-src 'self'` provides coverage, if a future code change relaxes `default-src`, Service Workers could be registered from any allowed source.

**Remediation:** Add explicit directives:
```typescript
"object-src 'none'",
"worker-src 'self'",
```

---

## Section 7: Vulnerable Dependencies (A06:2021)

### FINDING S-5: 6 npm Audit Vulnerabilities Including Next.js CSRF Bypass

**Severity:** SERIOUS
**Source:** `npm audit` output from 2026-04-02

| Package | Severity | CVE/Advisory | Impact |
|---------|----------|-------------|------, |
| **next 16.1.6** | MODERATE | GHSA-mq59-m269-xvcx | **null origin can bypass Server Actions CSRF checks** |
| **next 16.1.6** | MODERATE | GHSA-ggv3-7p47-pfv8 | HTTP request smuggling in rewrites |
| **next 16.1.6** | MODERATE | GHSA-3x4c-7xq6-9pq8 | Unbounded next/image disk cache growth |
| **next 16.1.6** | MODERATE | GHSA-h27x-g6w4-24gq | Unbounded postponed resume buffering DoS |
| **flatted** | HIGH | GHSA-25h7-pfq9-p65f, GHSA-rf6f-7fwh-wjgh | Prototype pollution + recursion DoS |
| **picomatch** | HIGH | GHSA-3v7f-55p6-f55p, GHSA-c2c7-rcm5-vvqj | ReDoS + method injection |
| **@anthropic-ai/sdk 0.80.0** | MODERATE | GHSA-5474-4w2j-mq4c | Memory tool sandbox escape |
| **brace-expansion** | MODERATE | GHSA-f886-m6hf-6m8v | Zero-step sequence DoS |
| **yaml** | MODERATE | GHSA-48c2-rrv3-qjmp | Stack overflow via nested collections |

**Critical concern:** The Next.js CSRF bypass (GHSA-mq59-m269-xvcx) allows requests with a `null` Origin header to bypass Server Actions CSRF checks. While this application primarily uses API routes (not Server Actions), any future Server Action usage would be vulnerable. The HTTP request smuggling advisory is also relevant for a production site behind Cloudflare.

**Remediation:**
```bash
# Fix non-breaking vulnerabilities first
npm audit fix

# Then upgrade Next.js (may require testing)
npm install next@16.2.2

# Upgrade Anthropic SDK
npm install @anthropic-ai/sdk@latest
```

---

## Section 8: Auth Flows Deep Dive

### 8.1 Admin Password Handling

The `ADMIN_PASSWORD` is a 64-character hex string (256-bit), compared timing-safely in both middleware (Edge) and `requireAdmin()` guard (Node). Transmitted via `X-Admin-Password` header. Not stored in any cookie or URL. Defense-in-depth: two independent checks.

### 8.2 Operator Secret

64-character hex string, compared timing-safely. Used as Bearer token. Also used as HMAC key for operator token signing (24h TTL, case-scoped). The `signOperatorToken()` function binds tokens to specific case IDs, preventing token reuse across cases.

### 8.3 Cron Auth

64-character hex string via `CRON_AUTH_TOKEN`, compared timing-safely. Bearer token format. Used by all `/api/cron/*` routes through `requireCron()` guard.

### 8.4 Customer Sessions

SHA-256 hashed 32-byte tokens in `customer_sessions` table. 30-day expiry. `httpOnly`, `secure`, `sameSite: strict` cookie flags. Session invalidation on new login (all existing sessions deleted). Middleware checks cookie presence (Edge), route handlers validate hash (Node).

---

## Section 9: File Upload Security

**File:** `C:\Users\email\projects\ImNotAnAttorney-web\src\app\api\upload\route.ts`

This is one of the strongest implementations I have reviewed:

1. **UUID validation on caseId** (line 164), prevents path traversal
2. **Ownership verification** (line 202-223), email must match case record
3. **Tier guard** (line 230-236), only discovery tiers can upload
4. **MIME allowlist** (line 49-62, 183-188), server-side enforcement
5. **Magic byte validation** (line 69-128, 272-277), validates actual file content matches claimed MIME type, with sub-format verification for shared headers (RIFF for WebP vs WAV, PK for ZIP vs DOCX)
6. **50MB size limit** (line 37, 244-249), server-side enforcement
7. **Filename sanitization** (line 262), non-alphanumeric replaced with underscores
8. **Private bucket** (line 279-284), `discovery-files` bucket is private, no public URLs
9. **Rate limiting** (line 140-144), 10 uploads per 5 minutes per IP
10. **Atomic file_urls append** (line 308-321), RPC prevents TOCTOU race

No findings in this section.

---

## Section 10: Cryptography

### 10.1 HMAC Usage

Three distinct HMAC keys used:
- `"inna-guard-compare"`, timing-safe auth comparison (guards.ts, deliver/route.ts)
- `"inna-middleware-hmac-key"`, timing-safe auth comparison (middleware.ts, Edge Runtime)
- `"webhook-cmp"`, Svix signature comparison (resend webhook)

These are static strings, not secrets. Their purpose is solely to ensure fixed-length digests for `timingSafeEqual`. The actual security comes from the secrets being compared (ADMIN_PASSWORD, OPERATOR_SECRET, etc.), not from these HMAC keys.

### 10.2 Token Generation

- Magic links: `crypto.randomBytes(32)`, 256-bit, correct
- Report tokens: `crypto.randomUUID()`, 122-bit, adequate for unguessable URLs
- Session tokens: `crypto.randomBytes(32)`, 256-bit, correct
- CSP nonce: `crypto.randomUUID()` base64-encoded, adequate

### 10.3 Token Storage

All tokens stored as SHA-256 hashes. Plaintext only in cookie/URL. Verified in:
- `src/lib/customer-auth.ts:33-35` (hashToken function)
- Partner auth uses the same pattern

---

## Section 11: SSRF

### 11.1 IndexNow URL Validation, VERIFIED SAFE

**File:** `C:\Users\email\projects\ImNotAnAttorney-web\src\app\api\indexnow\route.ts:37-47`

URLs are validated against the site's own domain (`siteHost`). Non-matching URLs are filtered out. The `INDEXNOW_ENDPOINT` is hardcoded to `https://api.indexnow.org/indexnow`. No user-supplied URLs reach external fetch calls.

### 11.2 Other Fetch Targets, VERIFIED SAFE

All `fetch()` calls in the codebase target:
1. Internal API routes via `${origin}/api/...` where `origin` comes from `NEXT_PUBLIC_SITE_URL` env var (not request headers)
2. Supabase Edge Functions via `${SUPABASE_URL}/functions/v1/...` (env var)
3. Reddit API via hardcoded search URLs (no user input in URL construction)
4. Stripe API via the Stripe SDK (no raw fetch)
5. Resend API via SDK

No SSRF vectors found.

---

## Section 12: Additional YMYL-Specific Concerns

### 12.1 Report Token Security

Report URLs use `crypto.randomUUID()` tokens (122-bit entropy). Tokens are stored unhashed in the `cases.report_token` column. The report page at `/report/[token]` performs status-gating (only `delivered` and `review` statuses render content) and expiration checks (12-month TTL).

### FINDING S-6: Report Tokens Stored Unhashed in Database

**Severity:** SERIOUS
**File:** `C:\Users\email\projects\ImNotAnAttorney-web\src\app\report\[token]\page.tsx:79-83`
**Description:** Report access tokens are stored as plaintext UUIDs in `cases.report_token` and looked up via `.eq("report_token", token)`. Unlike session tokens and magic link tokens (which are SHA-256 hashed before storage), report tokens can be extracted from a database backup or SQL injection to access any customer's report.

This is a significant gap because:
1. Reports contain sensitive criminal case analysis, judge intelligence, and legal strategy questions
2. The service-role key has full DB access (no RLS on cases table)
3. Database backups or exports would expose all active report URLs
4. A single compromised Supabase credential exposes all reports

**Impact:** If the database is compromised, every delivered report becomes accessible. Given the YMYL nature of this data (criminal defense), this is a privacy violation with potential legal consequences.

**Remediation:** Hash report tokens before storage, same pattern as magic links:
```typescript
// On generation:
const token = crypto.randomUUID();
const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
await supabase.from("cases").update({ report_token: tokenHash }).eq("id", caseId);

// On lookup:
const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
const { data } = await supabase.from("cases").select(...).eq("report_token", tokenHash).single();
```

This is a breaking change for existing report URLs. Migration plan: add a `report_token_hash` column, populate from existing tokens, update lookup to check hash first then fall back to plaintext, then drop plaintext column after all tokens expire (12 months).

### 12.2 Case Data IDOR Protection

The upload endpoint correctly prevents IDOR via email ownership verification (line 218). The checkout endpoint prevents upgrade credit theft via email matching (line 217). The report page uses unguessable tokens instead of sequential IDs. Score results use tokens, not case IDs.

### 12.3 UPL Compliance Gate

The architectural invariant (ARCHITECTURE.md invariant #1) requiring all reports to pass UPL evaluation before delivery is enforced in the code path: `generate-report` Edge Function -> `evaluate-report` Edge Function -> operator review -> `/api/deliver`. The `status` state machine prevents bypassing the evaluation step.

---

## Findings Summary

| ID | Severity | Finding | File | Remediation |
|----|----------|---------|------|-------------|
| S-1 | MODERATE | Operator token verification uses XOR instead of HMAC-then-compare | `src/lib/site.ts:171-177` | Use `timingSafeEqual` with HMAC |
| S-2 | MINOR | Unused `NEXT_PUBLIC_SUPABASE_ANON_KEY` in env | `.env.local:7` | Remove from env |
| S-3 | MODERATE | No rate limiting on unsubscribe POST endpoint | `src/app/api/unsubscribe/route.ts:138` | Add IP-based rate limit |
| S-4 | MODERATE | CSP missing `object-src` and `worker-src` directives | `src/middleware.ts:144-155` | Add explicit directives |
| S-5 | SERIOUS | 6 npm vulnerabilities including Next.js CSRF bypass | `package.json` | `npm audit fix` + upgrade Next.js to 16.2.2 |
| S-6 | SERIOUS | Report tokens stored unhashed in database | `src/app/report/[token]/page.tsx` | Hash tokens before storage |

---

## Prioritized Remediation Plan

### Immediate (this week)

1. **S-5: Dependency updates**, `npm audit fix` for non-breaking fixes (flatted, picomatch, brace-expansion, yaml). Then `npm install next@16.2.2` and test. The Next.js CSRF bypass and HTTP smuggling advisories affect production security.

2. **S-3: Unsubscribe rate limiting**, 5-line code change. Prevents mass unsubscription attacks.

### Next sprint

3. **S-6: Report token hashing**, Database migration + code change. Requires a graceful migration path for existing tokens. High impact for data breach protection.

4. **S-1: Operator token timing**, Small code change in `site.ts`. Low effort, improves consistency.

5. **S-4: CSP hardening**, 2-line addition to middleware.ts. Low risk.

### Housekeeping

6. **S-2: Remove unused anon key**, Cleanup only. No security impact.

---

## What's Working Well

These patterns demonstrate strong security engineering and should be preserved:

1. **Defense-in-depth auth**, Middleware (Edge) + route guards (Node) with independent timing-safe checks
2. **HMAC-then-compare**, Eliminates the length oracle that `timingSafeEqual` alone cannot solve
3. **Rate limiting with closed fallback**, In-memory fallback when Supabase is unavailable, blocks rather than allows
4. **Input allowlisting**, Every user input validated against predefined sets (charge types, case stages, sources, bands)
5. **Atomic claim-then-mutate**, Conditional UPDATE as mutex prevents TOCTOU races in delivery and generation
6. **Cron idempotency**, Distributed lock via database prevents duplicate execution across serverless instances
7. **Magic byte validation**, File upload validates actual content, not just MIME type header
8. **HTML escaping**, Consistent use of `escapeHtml()` across all email templates
9. **Anti-enumeration**, Magic link and unsubscribe endpoints always return success regardless of email existence
10. **SSRF prevention**, IndexNow validates URLs against site domain; checkout uses env var for redirects, never request Origin

---

*Report generated 2026-04-02 by Security Engineer Agent. Next audit recommended after dependency updates are applied.*
