# Partner Portal Pristine — Phases 2–4 Outline

> **For Claude:** Each phase below is a deliberately lean outline. Expand into
> a full TDD plan (like `2026-04-21-partner-portal-phase-1-wip-salvage.md`)
> **at the start of that phase**, not now. Just-in-time expansion keeps
> per-task detail from drifting while earlier phases shift the ground under
> it.

**Parent design:** `docs/plans/2026-04-21-partner-portal-pristine-design.md`
**Phase 1 plan:** `docs/plans/2026-04-21-partner-portal-phase-1-wip-salvage.md`

---

## Phase 2 — E2E Coverage

**Branch:** `chore/partner-e2e-coverage`
**Branches from:** `master` (after Phase 1 merged)

### Specs to deliver

1. **`e2e/partner-full-system.spec.ts`** — full walkthrough
   - Partner apply → admin approve → magic-link login → dashboard
   - Branding page: logo upload + website scrape + contrast gate
   - Add-client → shareable URL
   - `/r/[code]/opengraph-image` + `/r/[code]/[product]/opengraph-image` byte + dimension validation
   - `/r/[code]` PartnerBrandedShell render + meta-tag validation
   - `/r/[code]/reminders` enrollment
   - `/r/[code]/[product]` → Stripe test checkout → webhook → partner attribution on `cases` + commission row

2. **`e2e/partner-preview-links.spec.ts`** — unfurl validators
   - 3 codes × 4 routes = 12 combos
   - Assert: OG image 200 + 1200×630 + non-trivial bytes + accent-color pixel probe
   - Assert: `og:*` + `twitter:*` + canonical meta tags present + partner-specific
   - Assert: `robots` meta intentional (audit — partner surfaces may be noindex by design, confirm)

3. **`e2e/partner-preview-deploy.spec.ts`** — Vercel preview gate
   - Runs in CI against deploy-preview URL (env-gated)
   - Magic-link sends (Resend key present), Stripe test checkout works, Supabase connects, no 500s on any partner route

### Visual regression

- Commit OG baseline PNGs via Playwright `toHaveScreenshot`. Future brand-field regressions fail the PR automatically.
- Baseline images live in `e2e/screenshots/baseline/partner-og/`.

### Research-first commitments (do before writing specs)

- WebSearch: "Playwright OG image testing 2026", "Next.js 15 App Router opengraph-image.tsx testing"
- WebSearch: "Vercel preview deployment env vars Supabase", "Vercel preview secret scoping"

### Exit criteria

- All 3 specs green locally + in CI + against Vercel preview
- Visual-regression baselines committed

---

## Phase 3 — Production Hardening

**Branch:** `fix/partner-hardening`
**Branches from:** `master` (after Phase 2 merged)

### Audit checklist (one PR-of-fixes per item or grouped)

- **RLS audit** — every partner-related table (`partners`, `partner_applications`, `partner_sessions`, `partner_commissions`, `sms_suspensions`, any referral-attribution table). RLS enabled, policies explicit, admin-only access annotated. Document in `supabase/SCHEMA.md`.
- **Auth-boundary audit** — every `/api/partner/*` route. Confirm session cookie validated at top, no `partner_id` accepted from body/query.
- **Rate-limit audit** — `magic-link`, `branding/fetch-website` (already 20/hr), `branding/upload`, `add-client`, `track-event`, `apply`. Spot holes; add limits; document in ARCHITECTURE.md.
- **Input validation** — zod schemas for every POST/PUT `/api/partner/*` body. Centralize in `src/lib/partner-schemas.ts`.
- **Observability** — Sentry coverage; Telegram alerts on partner signups, fraud flags, repeated magic-link rate-limit trips.
- **Perf** — `/partner/dashboard` cold-start < 2s p95; hunt N+1 queries.
- **Dead code** — grep unreferenced exports in `partner-*` libs; delete.
- **Env-var audit** — partner-system env vars documented + present on Vercel `imnotanattorney` project (NOT `imnotanattorney-web`).
- **CSP audit** — `img-src` allowlist for Supabase Storage + website-scrape domains.

### Elite additions

- **Continuous Verification probe `INNA-H12: Partner preview link integrity`** — added to `~/projects/continuous-verification/verify.mjs`. Fetches `/r/[code]/opengraph-image` for top-3 active codes every 6hr; alerts on non-200 or < 10KB bytes.
- **Preview-mode sentinel** — `?preview=1` on `/r/[code]/*` pages. Server-side: skip attribution tracking + render a "preview banner." Linked from `/partner/dashboard` as "Preview my link."

### Research-first commitments

- WebSearch: "Supabase RLS audit checklist", "Next.js 15 rate-limit edge vs node", "zod route handler validation patterns 2026"

### Exit criteria

- Audit items closed (or triaged with `TODO(pristine)` + ticket)
- H12 probe CLEAN for 48hr
- All hardening PRs merged

---

## Phase 4 — Copy / UX Polish

**Branch:** `polish/partner-copy-ux`
**Branches from:** `master` (after Phase 3 merged)

### Two lenses

**Partner-facing (B2B — bondsman, attorney, generic partner):**
- Apply `.claude/rules/brand-voice.md` (bold, irreverent, direct).
- Apply `.claude/rules/product-tiers.md` (no speed-selling).
- Apply `.claude/rules/no-hallucinated-legal-data.md`.
- Use `ui-ux-pro-max` skill for affiliate-dashboard patterns (empty states, first-run UX, earnings viz, copy-to-clipboard feedback, QR share-link UX).

**Defendant-facing (crisis-buyer, 3AM panic lens):**
- Apply `.claude/rules/brand-voice.md` + crisis-buyer memory (27-word key-message, mobile-scannable).
- UPL-safe language — no "legal advice," no guarantees, no "attorney verification" framing.
- `/r/[code]/*` pages: warm-insider voice, specificity > warmth, trust via numbers (the 68.3g pattern).

### Audits to run

- **`adversarial-walkthrough` skill** against a live preview URL (7-agent swarm; fix top 10 findings).
- **axe-core via Playwright** — zero AA violations on every partner route.
- **375px viewport pass** — nothing clips.
- **UPL gate** — manual scan + CV `H1` / `H5` probes green.

### Research-first commitments

- WebSearch: "affiliate portal UX patterns 2026", "OG link unfurl best practices iMessage FB Slack WhatsApp 2026"
- Consult `ui-ux-pro-max`: search "partner dashboard affiliate B2B" and "crisis landing page mobile"

### Exit criteria

- Partner-facing pages pass brand-voice review
- Defendant-facing pages pass crisis-buyer + UPL gates
- axe zero AA violations
- Adversarial walkthrough top-10 findings closed
- CV `H1` + `H5` CLEAN

---

## Final "pristine" sign-off

When Phases 1-4 all merged, run the complete exit checklist from the parent design doc §5. Anything short-of-all-green means the pass isn't done.
