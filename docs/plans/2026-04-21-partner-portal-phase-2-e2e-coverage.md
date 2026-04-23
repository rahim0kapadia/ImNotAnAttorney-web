# Partner Portal Pristine — Phase 2: E2E Coverage

> **For Claude:** REQUIRED SUB-SKILL: `superpowers:executing-plans`

**Parent design:** `docs/plans/2026-04-21-partner-portal-pristine-design.md`

**Goal:** Fill the real gaps in partner-system E2E coverage, not rebuild what already exists. The existing spec set (`partner-full-walkthrough`, `og-preview`, `bridge-referral`, `product-deep-link`, `white-label-walkthrough`, `partner-checklist`, `checkin-signup`, `bondsman-hardening`) is already deep — 600+ LOC of partner walkthroughs. Phase 2 adds the OG/unfurl rigor that's missing.

**Architecture:** Extend `og-preview.spec.ts` where the surface already exists (meta-tag depth, byte-size guard, product OG); add one new spec for unfurl-bot UA simulation; add visual regression baselines via Playwright `toHaveScreenshot`. All new assertions gate on the same `E2E_SEED_READY` env var the existing spec already uses.

**Tech Stack:** Playwright 1.59.x, cheerio (already a dep), chromium only. Seeded test partners: `E2EREFE` (referral mode), `E2EBOND` (check-in mode). Seed script: `scripts/seed-e2e-partners.mjs`.

---

## Scope delta vs. original design outline

| Original outline | What's already done | Phase 2 action |
|---|---|---|
| `partner-full-system.spec.ts` — apply → approve → magic-link → dashboard → add-client → share | `partner-full-walkthrough.spec.ts` (311 LOC) already covers bondsman partner walkthrough end-to-end | **Skip** (already covered) |
| `partner-preview-links.spec.ts` — 3 codes × 4 routes OG unfurl | `og-preview.spec.ts` covers /r + /checkin but not /r/[code]/[product], and doesn't check byte size or full meta-tag bundle | **Extend** existing spec |
| `partner-preview-deploy.spec.ts` — Vercel preview gate | Existing specs already run against production; preview-gating is env-var + CI concern | **Drop** — fold into Task 6 (CI docs) |
| Visual regression | Nothing exists | **Add** baselines |

---

## Tasks

### Task 1: Branch + this plan doc
- Branch `chore/partner-e2e-coverage` from master ✅ (done)
- Commit this plan doc

### Task 2: OG byte-size + branding-specific assertions
**Files:** `e2e/og-preview.spec.ts`

Extend existing spec:
1. After each `expect(headers["content-type"]).toMatch(/image\/png/)`, add `expect(Buffer.byteLength(await res.body())).toBeGreaterThan(10 * 1024)` — 10KB floor guards against empty/placeholder PNG.
2. Parse og:title and assert it contains the partner fixture's name fragment (not just a pattern match). For E2EREFE: partner name contains "E2E Referral Bondsman", og:title should include some identifiable partner token — the existing `generateMetadata` builds `"— {referrer}"` style, so assert the og:title ends with a partner-identity slice.
3. Add `/r/{code}/{product}/opengraph-image` coverage for every REFERRAL_PRODUCT_MAP key (6 total). Assert 200 + PNG + ≥10KB.

### Task 3: Full meta-tag bundle
**Files:** `e2e/og-preview.spec.ts`

For each route already tested (/r/[code], /checkin/[code], plus new /r/[code]/[product]):
- Parse og:description — assert non-empty, <300 chars (Facebook cutoff), matches route branch copy.
- Parse twitter:card — assert `summary_large_image`.
- Parse twitter:image — assert present and returns 200 PNG (unfurl preview on Twitter/X).
- Parse canonical (`<link rel="canonical">`) — assert absolute URL on imnotanattorney.com, matches the route being fetched.

### Task 4: Unfurl-bot UA simulation
**Files:** `e2e/og-preview-unfurl-bots.spec.ts` (new)

Fetch each route with UA headers for: `facebookexternalhit/1.1`, `Slackbot-LinkExpanding 1.0`, `Twitterbot/1.0`, `LinkedInBot/1.0`, `WhatsApp/2.21.4.18`, `TelegramBot (like TwitterBot)`.

Assert:
- Status 200 (no UA-gated 403/404).
- Content-type text/html for page routes, image/png for /opengraph-image routes.
- No unintended redirect (no 3xx to /arrested or error pages).
- HTML response contains `og:image` meta tag (proves bot-served HTML still has the unfurl data).

Gate on `E2E_SEED_READY`.

### Task 5: Visual regression baselines
**Files:** `e2e/og-preview-visual.spec.ts` (new), `e2e/og-preview-visual.spec.ts-snapshots/*` (baselines)

Playwright `toHaveScreenshot`:
- `/r/E2EREFE/opengraph-image` → `og-referral-branded.png`
- `/checkin/E2EBOND/opengraph-image` → `og-checkin-branded.png`

Threshold: `maxDiffPixelRatio: 0.05` (5% to survive font-rendering micro-drift).

Baselines committed once; regenerate only via `--update-snapshots`. Runtime: must fetch the OG URL, write to buffer, use Playwright image diff. Actually simpler: use `toHaveScreenshot` against the image fetched and displayed in a minimal HTML shell, OR use @playwright/test's `toMatchSnapshot` on raw buffer.

Simplest implementation: fetch the PNG, save to `test-results/og-*.png`, compare bytes against committed baseline with 5% tolerance. Playwright has `toMatchSnapshot` for binary assertions.

### Task 6: Coverage map + CI fast-gate script
**Files:** `ARCHITECTURE.md`, `package.json`

Add to ARCHITECTURE.md a subsection "E2E coverage map" mapping spec file → what it covers. This makes future work (and future AI sessions) see the coverage before duplicating.

Add npm script:
```json
"test:e2e:og": "playwright test e2e/og-preview.spec.ts e2e/og-preview-unfurl-bots.spec.ts e2e/og-preview-visual.spec.ts"
```

Purpose: the OG/unfurl specs are cheap (no browser steps, just `request.get` + cheerio + image diff) — they can run on every PR without the full 5-minute walkthrough suite. Wire into CI later (out of scope for this phase).

### Task 7: Push + PR

Standard: push, open PR, merge.

---

## Exit criteria

- [ ] `npx playwright test e2e/og-preview.spec.ts` — green (with seeded partners)
- [ ] `npx playwright test e2e/og-preview-unfurl-bots.spec.ts` — green
- [ ] `npx playwright test e2e/og-preview-visual.spec.ts` — green against committed baselines
- [ ] `npm run test:e2e:og` exists and chains the three
- [ ] `ARCHITECTURE.md` has an E2E coverage map entry
- [ ] No regressions in existing specs (`npx playwright test` should still all green pre-merge)
