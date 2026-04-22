# Partner Portal — Pristine Pass (Design)

**Date:** 2026-04-21
**Branch strategy:** phased (4 short-lived branches off `master`)
**Source:** brainstorming session, auto-mode elite execution
**Next step:** expand into implementation plan via `superpowers:writing-plans`

---

## 1. Goal

Drive the full partner system — every surface that depends on a partner code, partner-facing and defendant-facing — to a state where:

- Zero known bugs (E2E walks clean end-to-end).
- Production-hardened (RLS verified, auth boundaries tight, rate limits sane, error tracking in place, no N+1).
- UX/copy polished (Atti voice, UPL-safe, crisis-buyer lens on defendant-facing only, accessibility ≥ AA, mobile-scannable).

"Pristine" = A + B + C from the brainstorm: nothing-broken + shippable-to-100-real-partners + cold-traffic-ready.

---

## 2. Scope (explicit surface inventory)

Everything touching partner codes, in two buckets:

**Partner-facing (B2B, bondsman / attorney / generic partner):**
- `/partner-signup` (route doesn't exist yet but referenced in handoffs — confirm during phase 1)
- `/partner/login`
- `/partner/dashboard/*` — root, `branding`, `compliance-report`
- `/partner/card`, `/partner/checklist`
- `/api/partner/*` — `add-client`, `branding/{fetch-website,save,upload}`, `clients`, `compliance-report`, `dashboard`, `logout`, `magic-link`, `notification-prefs`, `settings`, `track-event`
- Libs: `partner-auth`, `partner-by-code`, `partner-data`, `partner-emails`, `partner-helpers`, `partner-mode`, `partner-sms`, `partner-branding/*`

**Defendant-facing (crisis-buyer, 3AM-panic lens):**
- `/r/[code]` + OG image
- `/r/[code]/[product]` + OG image
- `/r/[code]/quiz`
- `/r/[code]/reminders`
- `/checkin/[code]` + `/court-date/[code]` (bondsman mode bridges)
- Middleware cookie-drop + attribution (`src/middleware.ts`)
- Libs: `promo-code`, `referral-product-map`, `referral`

---

## 3. Current state — findings from exploration

### 3.1 Active WIP audit (`fix/vercel-r-code-refactor` branch, 6 files modified)

| File | Change | Verdict |
|---|---|---|
| `src/lib/promo-code.ts` | tighten `isValidPromoCode` to type-guard | **KEEP** (pure type win) |
| `src/lib/referral-product-map.ts` | narrow key cast | **KEEP** (pure type win) |
| `src/lib/partner-auth.ts` | remove 9 brand fields from `validatePartnerSession` select + type | **DISCARD** — breaks `/partner/dashboard/branding/page.tsx` |
| `src/lib/partner-by-code.ts` | remove 9 brand fields from `getPartnerByCode` select | **DISCARD** — breaks both `/r/[code]/opengraph-image.tsx` and `/r/[code]/[product]/opengraph-image.tsx` and `PartnerBrandedShell` in `/r/[code]/page.tsx` |
| `src/app/api/partner/dashboard/route.ts` | remove 9 brand fields from response | **DISCARD** — dashboard consumers depend on brand data |
| `src/middleware.ts` | remove `x-pathname` header set | **DISCARD** — `src/app/layout.tsx:110` still reads it to suppress global chrome on partner-branded routes |

### 3.2 Hidden couplings worth documenting in code (prevent re-break)

- `getPartnerByCode` result shape is consumed by OG image routes → regression test must pin the shape.
- `validatePartnerSession` result shape is consumed by `/partner/dashboard/branding` → regression test must pin the shape.
- `x-pathname` request header is produced in `middleware.ts` and consumed in `layout.tsx` with no cross-reference → add a comment at the write site naming the read site.

---

## 4. Strategy — phased branches, each independently mergeable

Four branches off `master`, each its own PR, each with a measurable exit condition. If energy runs out after phase 2 you've still shipped real hardening value (E2E coverage).

### Phase 1 — WIP salvage + regression guardrails
**Branch:** `fix/partner-wip-salvage`
**Scope:**
1. Branch from `master`, cherry-pick only the two safe WIP pieces (`promo-code.ts`, `referral-product-map.ts`).
2. Discard the four regressive pieces; verify `getPartnerByCode`/`validatePartnerSession`/`dashboard` API response still include all brand fields; verify `x-pathname` header still set.
3. Add regression tests:
   - Unit test: `getPartnerByCode` result includes `logo_url`, `brand_color_primary`, `brand_color_accent`, `brand_color_bg`, `brand_color_source`, `brand_contrast_passed`, `website_url`, `brand_updated_at`, `logo_storage_path`.
   - Unit test: `validatePartnerSession` result includes the same brand fields.
   - Unit test: `dashboard` API response for a partner with branding includes those fields.
   - Smoke test: middleware sets `x-nonce` and `x-pathname` on request headers for partner routes.
4. Add inline comments at the two write-sites documenting the hidden consumers (`middleware.ts` x-pathname → layout.tsx; brand fields → OG images + PartnerBrandedShell + branding page).
5. `tsc` + `vitest` green.

**Exit:** PR merged, `fix/vercel-r-code-refactor` branch deleted, clean baseline established.

### Phase 2 — End-to-end coverage
**Branch:** `chore/partner-e2e-coverage`
**Scope:** one Playwright spec that walks the full happy path, plus OG/preview-link validators.

**Spec 1 — `e2e/partner-full-system.spec.ts`:**
1. `POST /api/partner/apply` with test payload (or direct DB seed if the public endpoint is gated).
2. Direct DB approve (set `status='approved'`) or admin route.
3. `POST /api/partner/magic-link` → intercept Resend webhook → visit magic URL → session cookie set.
4. Visit `/partner/dashboard` — assert earnings block, client list, copy-link affordance.
5. Visit `/partner/dashboard/branding` — upload logo, scrape website, save brand colors — assert contrast gate + preview.
6. Visit `/partner/dashboard/add-client` — submit client → assert redirect → assert `/r/[code]/reminders` appears as shareable URL.
7. Fetch `/r/[CODE]/opengraph-image` — assert 200, `content-type: image/png`, non-zero bytes, partner branding pixel-probe (accent color present).
8. Fetch `/r/[CODE]/[product]/opengraph-image` — same assertions.
9. Fetch `/r/[CODE]` as defendant — assert `PartnerBrandedShell` renders, `og:title`/`og:description`/`og:image` meta tags are partner-specific (not default), canonical URL correct.
10. Fetch `/r/[CODE]/reminders` — assert check-in enrollment flow works, partner-mode correct.
11. Click through to `/r/[CODE]/[product]` → Stripe test checkout → webhook fires → `cases` row attributes to partner (`partner_id` set) → commission row created in `partner_commissions` or equivalent.

**Spec 2 — `e2e/partner-preview-links.spec.ts`:**
- Crawl-simulates a Slack/iMessage/Facebook unfurl for a sample of 3 codes × 4 routes: `/r/[code]`, `/r/[code]/[product]`, `/r/[code]/quiz`, `/r/[code]/reminders`.
- Validates: OG image returns 200 with correct dimensions (1200×630), meta tags present + non-default, Twitter card tags correct, canonical = absolute URL to imnotanattorney.com, no `robots: noindex` leak on partner surfaces (check — may be intentional).

**Spec 3 — `e2e/partner-preview-deploy.spec.ts`:**
- Runs only in CI against a Vercel preview URL (env gate).
- Verifies: `/api/partner/magic-link` works (Resend API key present), Stripe test-mode checkout works, Supabase connects, no "Missing env var" 500s on any partner route, no preview-only auth bypass leaks.

**Visual regression add:**
- Snapshot OG images via Playwright's screenshot matcher → baseline committed → future brand-field regressions fail the PR automatically.

**Exit:** All 3 specs green locally + against Vercel preview + in CI.

### Phase 3 — Production hardening
**Branch:** `fix/partner-hardening`
**Scope:** fix everything phase 2 + a targeted audit surface.

**Audit checklist:**
- **RLS audit:** every partner-related table (`partners`, `partner_applications`, `partner_sessions`, `partner_commissions`, `sms_suspensions`, `partner_events` if exists, anything else) — RLS enabled, policies reviewed, admin-only vs self-select patterns explicit. Document in `supabase/SCHEMA.md`.
- **Auth-boundary audit:** every `/api/partner/*` route — confirm session cookie validated via `validatePartnerSession` at top, confirm no endpoint accepts `partner_id` from body/query (must come from session).
- **Rate-limit audit:** `magic-link`, `branding/fetch-website` (already at 20/hr), `branding/upload`, `add-client`, `track-event`, `apply`. Spot the holes; add Upstash-or-equivalent limits where missing. Document limits table in ARCHITECTURE.md.
- **Input validation:** add zod schemas to every POST/PUT `/api/partner/*` body. Centralize in `src/lib/partner-schemas.ts`.
- **Observability:** verify Sentry/error hook coverage. Add Telegram alerts on: new partner signup, fraud-flag events (e.g., unusual add-client velocity), repeated magic-link rate-limit trips.
- **Perf:** cold-start profile `/partner/dashboard` (goal < 2s p95); hunt N+1s in dashboard route (it aggregates earnings + referrals — one query each, not N).
- **Dead code:** grep for unreferenced exports in `partner-*` libs; delete.
- **Env-var audit:** confirm every env var the partner system reads is documented in ARCHITECTURE.md and present on Vercel production (`imnotanattorney` project, not `imnotanattorney-web`).
- **CSP audit:** partner routes serve partner-uploaded logos; confirm CSP `img-src` allowlist covers Supabase Storage + any website-scrape domains (with defense-in-depth via `logo-path-validator`).

**Elite add — Continuous Verification probe:**
Create `INNA-H12: Partner preview link integrity`. Probe that fetches `/r/[code]/opengraph-image` for the 3 most-referenced live partner codes every 6hr (hook into existing `~/projects/continuous-verification/verify.mjs`). Alerts if any returns non-200 or image < 10KB. Catches silent breakages in CDN or Supabase connectivity before partners notice.

**Elite add — Preview-mode sentinel:**
Add `?preview=1` query param support on `/r/[code]/*` pages that (a) marks the request as "don't track attribution" server-side, (b) passes through a banner ("This is how your link looks to defendants"). Gives partners a safe way to verify their own surface without polluting analytics. Linked from `/partner/dashboard` as "Preview my link."

**Exit:** audit items closed or explicitly triaged with `// TODO(pristine): …` + ticket. H12 probe green. All hardening PRs merged.

### Phase 4 — Copy / UX polish
**Branch:** `polish/partner-copy-ux`
**Scope:** voice + UX + accessibility, two lenses.

**Lens A — Partner-facing (B2B, not crisis-buyer):**
- Apply `.claude/rules/brand-voice.md` (bold, irreverent, direct, no corporate).
- Apply `.claude/rules/product-tiers.md` — no speed-selling, quality-and-methodology framing.
- Apply `.claude/rules/no-hallucinated-legal-data.md` — no inline citations / § numbers without source URLs.
- Dashboard patterns: consult UIU UX Pro Max skill for affiliate/partner-portal best-practices (empty states, first-run experience, earnings visualization, copy-to-clipboard feedback, share-link UX with QR code).
- Every partner-facing page: Atti voice, specificity > warmth.

**Lens B — Defendant-facing (crisis-buyer, 3AM-panic lens):**
- Apply `.claude/rules/brand-voice.md` + crisis-buyer memory (3AM panic test, 27-word key-message rule, mobile-scannable).
- UPL-safe language: no "legal advice," no guarantees, no "ask your attorney to verify."
- `/r/[code]/*` pages must feel warm-and-insider, not pitch-y. Trust via specificity (the 68.3g line pattern).

**Audits to run:**
- **Adversarial walkthrough** (`adversarial-walkthrough` skill) against a live partner preview URL — 7 agents, ranked findings, fix top 10.
- **Axe accessibility** via Playwright — zero AA violations on every partner route.
- **Mobile-scannable** — 375px viewport pass, nothing clips.
- **UPL gate** — manual scan + CV `H1`/`H5` probes green.
- **Speakable schema** — confirm where applicable.

**Exit:** all partner-facing pages pass brand-voice review, all defendant-facing pages pass crisis-buyer + UPL gates, axe zero AA violations, adversarial walkthrough top-10 findings closed, CV `H1`/`H5` CLEAN.

---

## 5. Cross-cutting exit criteria (definition of "pristine")

All of these must be green before the pristine pass is declared done:

- [ ] `npx tsc --noEmit --skipLibCheck` — clean
- [ ] `npx vitest run` — green (existing ~249 tests + new regression + hardening tests)
- [ ] `npx playwright test e2e/partner-*.spec.ts` — green locally, against Vercel preview, and in CI
- [ ] OG preview unfurl valid for 3 sample codes (image bytes present, partner branding visible in pixel probe)
- [ ] Zero console errors on any partner-facing or defendant-facing route (hand-walked in Playwright)
- [ ] Lighthouse ≥ 90 perf/a11y/best-practices on `/partner/dashboard`, `/r/[code]`, `/r/[code]/reminders`
- [ ] Axe zero AA violations on same routes
- [ ] UPL scan clean on defendant-facing copy (manual + CV `H1`+`H5` probes)
- [ ] CV `H12: Partner preview link integrity` probe CLEAN for 48 hrs
- [ ] All 4 PRs merged to `master`, Vercel prod auto-deployed, manual production smoke passes
- [ ] `ARCHITECTURE.md` + `supabase/SCHEMA.md` updated to reflect any new tables/columns/env vars

---

## 6. Branch & PR plan

| Phase | Branch | Rough PR size | Depends on |
|---|---|---|---|
| 1 | `fix/partner-wip-salvage` | small (6 files + 3 tests) | `master` |
| 2 | `chore/partner-e2e-coverage` | medium (3 specs + helpers) | phase 1 merged |
| 3 | `fix/partner-hardening` | medium-large (many touchpoints) | phase 2 merged (uses E2E to validate) |
| 4 | `polish/partner-copy-ux` | medium (copy-heavy) | phase 3 merged |

After phase 4 merges: delete obsolete `fix/vercel-r-code-refactor` branch.

---

## 7. Research-first commitments (deferred to plan expansion)

Per the atti-persona research-first rule, before writing implementation code in each phase, WebSearch current best-practices for:
- **Phase 2:** Playwright OG image testing patterns (2025/2026), Vercel preview env-var strategies, Next.js 15 middleware + App Router header-header coupling idioms.
- **Phase 3:** Supabase RLS audit checklists, Next.js 15 rate-limit patterns on edge/node runtimes, Upstash alternatives, zod + route-handler integration idioms.
- **Phase 4:** affiliate-portal UX patterns for B2B crisis-adjacent partners (bondsmen), OG-image + link-unfurl best-practices for iMessage/FB/Slack/WhatsApp.

Research cached into each phase's implementation plan before code is written.

---

## 8. Open items parked for later (not in this pass)

- Partner-facing analytics dashboard depth (CTR on preview links, heatmaps). Out of scope — post-pristine work.
- Auto-approval of partner applications (currently manual). Out of scope.
- Public partner directory. Out of scope.

---

## 9. Handoff

Next skill: `superpowers:writing-plans` to expand this design into a per-phase implementation plan with `- [ ]` checkbox steps, ready for `superpowers:subagent-driven-development` or `superpowers:executing-plans`.
