# Post-Apex-Fix Smoke Test — 2026-04-27

**Verdict:** **NO-GO** — 1 CRITICAL discoverability gap, 1 WARNING sitemap drift.
Functional flow (HTTP, checkout, cron) is GREEN; the homepage router is silently
missing 3 of 10 Tier 9 SKUs.

**Scope:** Catalog smoke-check post-Apex-fix shipment (PRs #178/#179/#180/#183/
#188/#190/#193/#197/#199/#200/#201). 22 products live; 9 Tier 9 SKUs (10 with
the dual-route district-court-intelligence) shipped landings + AvailabilityChecker
+ post-purchase drip this session.

**Production deploy at audit time:** `7d72b9e2` = `master` HEAD.
- Created 2026-04-27 16:19:25Z (deployment id 4500908680, environment Production).
- All audited surfaces are running this SHA.

---

## Per-SKU pass/fail matrix

Columns:
- **Page** — `https://imnotanattorney.com/<slug>` returns 200
- **/services/<slug>** — `/services/<slug>` fallback returns 200
- **tiers.ts live** — `live: true` in `src/lib/tiers.ts`
- **products.ts active** — `isActive: true` in `src/lib/products.ts`
- **Sitemap canonical** — `<loc>https://imnotanattorney.com/<slug></loc>` present in `/sitemap.xml`
- **Homepage router** — surfaced in `src/app/page.tsx` Tier 9 router section

| SKU                              | Page | /services | tiers.ts | products.ts | Sitemap canonical | Homepage router |
|----------------------------------|:----:|:---------:|:--------:|:-----------:|:-----------------:|:---------------:|
| judge-report-card                | 200  | 200       | live     | active      | yes               | yes             |
| officer-background-check         | 200  | 200       | live     | active      | yes               | yes             |
| similar-cases-analyzer           | 200  | 200       | live     | active      | yes               | yes             |
| district-court-intelligence      | 200  | 200       | live     | active      | WARN /services    | yes             |
| arrest-survival-kit              | 200  | 200       | live     | active      | WARN /services    | yes             |
| motion-success-report            | 200  | 200       | live     | active      | yes               | yes             |
| federal-jury-instruction-brief   | 200  | 200       | live     | active      | yes               | yes             |
| federal-sentencing-distribution  | 200  | 200       | live     | active      | yes               | NO MISSING      |
| charge-authority-pack            | 200  | 200       | live     | active      | yes               | NO MISSING      |
| precedent-watchlist              | 200  | 200       | live     | active      | yes               | NO MISSING      |

Index pages: `/services` 200, `/` 200. All 22 catalog products render.

---

## CRITICAL — Homepage Tier 9 router missing 3 SKUs

**Severity:** CRITICAL (buyer-visible on highest-traffic page; entry-tier wedge invisible).
**Location:** `src/app/page.tsx:710-747` — the array literal feeding the Tier 9
router section.

**What's wrong:**
PR #197 (Apex Fix #5) shipped the homepage router with 7 hardcoded card entries.
PRs #193 (Apex Fix #1) and #201 (Apex C1+C2) subsequently flipped 3 more Tier 9
SKUs live but did NOT backfill the homepage router array. Result: 3 of the
cheapest/widest-applicable Tier 9 SKUs are not surfaced anywhere on the homepage.

Hardcoded today (7):
- arrest-survival-kit ($47)
- officer-background-check ($97)
- federal-jury-instruction-brief ($97)
- district-court-intelligence ($147)
- judge-report-card ($197)
- motion-success-report ($197)
- similar-cases-analyzer ($297)

Missing (3):
- **precedent-watchlist ($47)** — tied with arrest-survival-kit as the floor SKU,
  designed as the Hormozi entry-tier wedge. Crisis-buyers landing on `/` cannot
  see it.
- **charge-authority-pack ($97)** — sits next to officer-background-check / FJIB
  in price; no reason to omit.
- **federal-sentencing-distribution ($297)** — anchors the top of the instant
  ladder alongside similar-cases-analyzer.

**Verification commands:**
```
curl -sS https://imnotanattorney.com/ -o /tmp/home.html
node -e "const h=require('fs').readFileSync('/tmp/home.html','utf8');for(const s of ['precedent-watchlist','charge-authority-pack','federal-sentencing-distribution']){console.log((h.match(new RegExp(s,'g'))||[]).length, s)}"
# -> 0 precedent-watchlist
# -> 0 charge-authority-pack
# -> 0 federal-sentencing-distribution
```

**Impact:** Discoverability gap, not a checkout-flow break. Homepage is the
highest-traffic surface; cheapest entry SKUs are exactly the ones designed to
catch crisis-buyers before they bounce. Per Hormozi entry-tier wedge logic
cited in the PR #197 source comment ("when the floor is invisible the buyer
bounces"), this is a regression of the same fix that PR #197 shipped.

**Fix shape (NOT applied — awaiting approval per smoke-test rules):**
- Add 3 entries to the array at `src/app/page.tsx:710-747` in ascending-price
  order: precedent-watchlist ($47), charge-authority-pack ($97),
  federal-sentencing-distribution ($297).
- Each needs a one-line `blurb` matching the existing voice. Use the existing
  landing-page hero copy as source so the blurb tracks the live page.
- No other code changes needed. The map(...) is data-driven — adding rows
  Just Works.
- Re-deploy via `git push origin master`. Re-verify with curl.

---

## WARNING — Sitemap canonical drift on 2 SKUs

**Severity:** WARNING (SEO-only, no functional break; documented as deferred).
**Location:** `src/app/sitemap.ts:69-83` — `DEDICATED_ROUTE_SLUGS` Set.

`district-court-intelligence` and `arrest-survival-kit` BOTH have:
- A dedicated route (`/<slug>`, returns 200) AND
- A `/services/<slug>` route (returns 200)

The sitemap currently emits ONLY the `/services/<slug>` form for these two,
because they are absent from `DEDICATED_ROUTE_SLUGS`. The other 8 Tier 9 SKUs
are listed in `DEDICATED_ROUTE_SLUGS` and emit only the canonical `/<slug>`.

This is **explicitly documented as deferred** in a code comment at
`src/app/sitemap.ts:330-333`:

> district-court-intelligence + arrest-survival-kit have dedicated routes
> too; they're auto-included via productsByCategory("research") above as
> /services/<slug> until promoted to DEDICATED_ROUTE_SLUGS in a future
> pass (out of scope for Fix #1).

**Impact:** Search engines may index `/services/<slug>` as the canonical URL
for these two, while the rest of the catalog uses `/<slug>` as canonical.
Inconsistent canonical structure across one product family. Not user-facing.
Minor authority-dilution risk on the two affected URLs.

**Fix shape (NOT applied):** Promote both slugs into `DEDICATED_ROUTE_SLUGS`
and add explicit canonical entries to the sitemap return array (mirroring the
8 entries already at lines 280-329).

---

## What PASSED

### 1. Live HTTP smoke (12/12 URLs return 200)
```
200  /judge-report-card
200  /officer-background-check
200  /similar-cases-analyzer
200  /district-court-intelligence
200  /arrest-survival-kit
200  /motion-success-report
200  /federal-jury-instruction-brief
200  /federal-sentencing-distribution
200  /charge-authority-pack
200  /precedent-watchlist
200  /services
200  /
```

### 2. Operator QA checkout (3/3 SKUs generate Stripe sessions)
`/api/qa-checkout?key=<OPERATOR_SECRET>&tier=<slug>` -> 307 -> cs_live_*

| SKU                    | Status | Stripe session |
|------------------------|:------:|----------------|
| arrest-survival-kit    | 307    | cs_live_a1uKMvLIEPkJOsbEnCNOdOi0A6soV1rb61UqwxZemBTBdMIGxXnU5C2erb |
| charge-authority-pack  | 307    | cs_live_a1Cy92OkKh9Wm4ZQApA8yQmvcWM7iZa8Zke4z2w0s0Nuqrr5ug23pCD46r |
| precedent-watchlist    | 307    | cs_live_a1o8r52D3LcFhtAGXKK3gnDXcuN8vstcVgC79iLSnmzb7Bp8mSyRevU9Ct |

`cs_live_*` prefix confirms LIVE Stripe mode (not `cs_test_`). Real-payment
path validated end-to-end through `/api/qa-checkout` -> `/api/checkout` ->
Stripe Checkout Session creation. Did NOT pay; only verified session
generation per the smoke-test brief.

### 3. Vercel deploy state
Latest production deployment is from `master` HEAD:
- id 4500908680, sha `7d72b9e2`, ref `7d72b9e21eb064cb...`
- created 2026-04-27 16:19:25Z, environment=Production
- Two earlier preview deployments correspond to feature branches (PR #201 and
  the docs-only PR #d7f3942f); both superseded by the master merge.

### 4. Cron job registration (cron-job.org via API)
All 41 INAA cron jobs ON. Tier 9-relevant:

| jobId    | Status | Title                                                       | URL                                                |
|----------|:------:|-------------------------------------------------------------|----------------------------------------------------|
| 7403323  | ON     | ImNotAnAttorney: drip                                       | /api/cron/drip                                     |
| 7522215  | ON     | INAA precedent-watchlist-emails weekly (M3)                 | /api/cron/precedent-watchlist-emails               |
| 7516619  | ON     | Rising Precedent Alerts (WR weekly + SR 72hr)               | /api/cron/rising-precedent-alerts                  |
| 7522368  | ON     | INAA warroom-monthly-precedent-delta daily (E3)             | /api/cron/warroom-monthly-precedent-delta          |
| 7477716  | ON     | partner-drip                                                | /api/cron/partner-drip                             |

The Tier 9 post-purchase drip rides the main `/api/cron/drip` route via the
`sendPostPurchaseEmails` task at `src/lib/cron/drip-post-purchase.ts:71`. The
task is registered in the TASKS array at `src/app/api/cron/drip/route.ts:49`.
Tier 9 SKU coverage in `src/lib/drip-emails.ts`: 35 references across the
10 SKU slugs (PR #200 — Apex Fix #4 — 21 emails for 7 SKUs verified).

The dedicated precedent-watchlist email cron (job 7522215) hits its own
endpoint weekly Mon 09:00 UTC for the 30-day rising-precedent drip.

### 5. AvailabilityChecker mount on Tier 9 landings
Spot-check on `/precedent-watchlist`: server-rendered HTML contains form
fixtures (`chargeType` x4, "availability" x6, "Check " x4). Client island
hydrates the AvailabilityChecker component imported at
`src/app/precedent-watchlist/page.tsx:22`. Same import pattern present on the
other 9 Tier 9 landings (verified via Glob).

### 6. Catalog config consistency
All 10 Tier 9 SKUs satisfy:
- `live: true` in `src/lib/tiers.ts`
- `isActive: true` in `src/lib/products.ts`
No flag-split detected. Both definitions match (slug, name, price, intake
fields).

### 7. Working tree clean
`git status` reports clean working tree on `master @ 7d72b9e2`. No drift,
no untracked files, no in-flight edits from this session (verification only,
per brief constraints).

---

## What was NOT verified (out of scope or blocked)

1. **End-to-end actual purchase flow** (brief item 5).
   Did not run a Stripe-test-card payment because the brief said "don't
   actually pay — just verify the Stripe URL generates and the price displays
   match tiers.ts". Webhook + order row + drip email queue verification
   therefore not exercised in this pass. Recommend a single test purchase on
   `arrest-survival-kit` ($47) as the lowest-cost confirmation, with manual
   refund afterward, before the next real customer.

2. **Render-time visual QA** (browser screenshot, layout, mobile breakpoints).
   Brief asked for live-site smoke; that was satisfied via HTTP probes. A
   visual QA pass via the Playwright MCP would be a tighter belt-and-suspenders
   check but was not requested.

3. **Drip-email content QA on the 21 newly-shipped Tier 9 emails** (PR #200).
   The cron route is wired and the email definitions exist in
   `src/lib/drip-emails.ts`, but I did not render/preview each Day-0/Day-3/
   Day-7 email body. PR #200 was its own ship; presume it was reviewed there.

4. **Performance** (LCP / TTFB / Core Web Vitals on Tier 9 landings).
   Out of scope for a functional smoke test.

---

## Recommended next steps

In order of priority:

1. **CRITICAL fix:** add the 3 missing entries to `src/app/page.tsx:710-747`
   so the homepage router lists all 10 Tier 9 SKUs. Re-deploy. Re-verify with
   the curl + node one-liner above.
2. **WARNING fix:** promote `district-court-intelligence` + `arrest-survival-kit`
   into `DEDICATED_ROUTE_SLUGS` at `src/app/sitemap.ts:69-83` and add their
   canonical sitemap entries (mirror lines 280-329).
3. Optional belt-and-suspenders: 1 actual Stripe-test-card purchase on
   `arrest-survival-kit` to exercise the webhook -> orders row -> drip email
   queue path before the next real customer.

---

## Final verdict

**NO-GO** — homepage router CRITICAL needs to ship before this catalog state
can be called "all clear." Functional flow (HTTP, checkout, cron, drip
wiring, deploy state, catalog config consistency) is otherwise GREEN.

Per smoke-test brief: "If anything FAILS: stop, document, dispatch fix swarm
only after asking what to do." This document is the stop. Awaiting direction
on whether to dispatch the fix swarm for items 1+2.
