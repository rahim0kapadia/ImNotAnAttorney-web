# Post-Purchase UX Fix — All 52 Paid SKUs

**Plan file:** `C:\Users\email\projects\ImNotAnAttorney-web\docs\plans\2026-04-27-post-purchase-ux-fix-plan.md`
**Date:** 2026-04-27
**Repo:** `C:\Users\email\projects\ImNotAnAttorney-web`
**Branch base:** `master` @ `c92924d9` (post-FSD-backfill PR #210)
**Target executor:** Sonnet swarm with one Opus task flagged

## CASCADE

- **us (INAA / future-Atlas):** every Tier 9 buyer henceforth lands on a success page that confirms what they bought and how it reaches them — kills a recurring crisis-buyer drop-off pattern that would otherwise compound across 10 SKUs.
- **counterparty (the defendant who just paid $47-$297 in crisis):** immediate clarity that the report is generating + accurate "60 seconds, check email" expectation, instead of "Your Analysis Is Being Built / Thank you" ambiguity at the worst moment of their life.
- **downstream (the defendant's family, attorney, supporter who shares the email):** receives an artifact that resolves cleanly, no "did anything actually happen?" follow-up burden.
- **future-us:** a single normalized resolver in `src/lib/checkout/post-purchase.ts` ends the `?tier=` vs `?product=` schism — every future SKU drops in by adding one entry to one map, not by adding a new render branch.
- **ecosystem (defendants who never buy):** success page confirmation copy becomes the reference example for crisis-buyer post-purchase UX in the legal niche — raises the category floor.
- **no node loses:** existing 42 working SKUs keep working (regression locked by Task C1); webhook contract unchanged; tokens stay hashed; Stripe metadata unchanged.

---

## Context

A live `arrest-survival-kit` ($47, Tier 9) test purchase landed on `/checkout/success?session_id=...&product=arrest-survival-kit` and rendered the generic "Your Analysis Is Being Built / Thank you for your purchase. Check your email" fallback (`src/app/checkout/success/page.tsx:692-696`). No download link, no report-viewer link, no tier-specific copy. The customer's only path to the thing they paid for is email.

Root cause is structural: the success page has three render branches (`standaloneProduct`, `info`, generic) keyed off two mutually-exclusive query params (`?product=` vs `?tier=`). Tier 9 SKUs are now ALSO members of `TIER_CORE` (live: true) but absent from `TIER_NEXT_STEPS`. AvailabilityChecker drives Tier 9 checkouts through the standalone path (`?product=`), which hits the `standaloneProduct` block — but that block has its own bug: it shows "Next: Complete Your Details" even for SKUs where the webhook auto-completes intake from pre-purchase data.

This plan covers all 52 paid SKUs (25 in TIER_CORE + 27 paid standalone).

---

## Phase 1 — Audit (read-only)

### 1.1 Render-branch resolution rule (current behaviour)

The current `/checkout/success/page.tsx` selects a branch using the first-match rule:

```
1. ?product=<slug> AND getProduct(slug) truthy → standaloneProduct branch (line 340)
2. else if ?tier=<slug> AND TIER_NEXT_STEPS[slug] truthy → info branch (line 366)
3. else → generic "Thank you" fallback (line 692)
```

The hardcoded `<h1>Your Analysis Is Being Built</h1>` (line 333) renders ABOVE all three branches, so even the standalone branch's "instant in 60 seconds" delivery shows that misleading heading.

### 1.2 Upstream `success_url` builders

`src/app/api/checkout/route.ts` writes `success_url` in three places:

| Line | Path | URL shape |
|---|---|---|
| 191 | Standalone product checkout (line 109 entry) | `?session_id=X&product=<slug>` |
| 761 | Installment digital-product checkout | `?session_id=X&tier=<slug>` |
| 816 | Standard tier checkout (default path) | `?session_id=X&tier=<slug>` |

**Key conflict:** Tier 9 SKUs are in BOTH `TIER_CORE` and `STANDALONE_PRODUCTS`. If a customer ever hits `/checkout?tier=judge-report-card` (e.g., a future direct deep-link or an OTO upgrade pointing to one), they go through path 816 → success URL has `?tier=judge-report-card` → `TIER_NEXT_STEPS[judge-report-card]` is missing → generic fallback. Same break happens for all 10 Tier 9 SKUs.

`AvailabilityChecker.tsx:466` always sets `?standaloneProduct=` when posting to `/api/checkout`, so Tier 9 customers from dedicated landing pages currently always go through path 191. The break is latent but real: the moment any internal link, partner code, OTO upgrade, or referral lands a Tier 9 buyer on the tier path, generic fallback fires.

### 1.3 Webhook delivery branch matrix

`src/app/api/webhooks/stripe/route.ts`:

| Line | Trigger | What it does |
|---|---|---|
| 181-321 | `metadata.product_type === "standalone"` | Creates order, mints intake token (hashed), checks `buildPrePopulatedIntake`. If intake builds → writes `standalone_intake` JSONB + `generateTier9Report(orderId)` fire-and-forget → operator email. If not → emails customer the intake link. |
| 754-810 | `digital-product` AND `TIER9_SLUGS.has(tier)` | Sets standalone columns on order, sends Tier 9 intake email. (This branch fires only when checkout went through the tier path with `product_type=digital-product`.) |
| 813-905 | `digital-product` (playbooks) | Mints download_token, emails playbook PDF link. |
| 1220+ | Service tier | Creates case/processing_jobs, sends drip email, etc. |

Pre-populated intake auto-generation **is implemented but only for 5 of 10 Tier 9 SKUs** (per `prepopulated-intake.ts` switch): judge-report-card, officer-background-check, similar-cases-analyzer, district-court-intelligence, arrest-survival-kit. The other 5 (federal-sentencing-distribution, federal-jury-instruction-brief, precedent-watchlist, charge-authority-pack, motion-success-report) require all intake fields to come through Stripe metadata — they don't currently, so those 5 fall through to the email-the-intake-link path.

### 1.4 Token security model (load-bearing)

Two tokens per Tier 9 / standalone order, both hashed-only in DB:

- `standalone_intake_token_hash` — set in webhook line 218; plaintext in customer email only.
- `standalone_report_token_hash` — minted by `generateTier9Report()` (`src/lib/tier9-reports/generate.ts:488`); plaintext in operator notification + (currently) NOT exposed to success page.

Per the `verify` endpoint comment block (`src/app/api/checkout/verify/route.ts:126-132`), exposing plaintext tokens through the verify JSON response is explicitly forbidden — that endpoint can be replayed by anyone who learns the session_id (which appears in the success URL itself). Any success-page surfacing of intake/report URLs must use a server-mediated redirect, not a JSON token exposure.

### 1.5 The 52 Paid SKUs

Archetype legend: **A** = Playbook PDF (instant + download_token), **B** = Tier 9 instant standalone with pre-purchase data (auto-generates), **C** = Tier 9 instant standalone WITHOUT pre-purchase data (intake-then-instant), **D** = Standalone research with intake-then-60s, **E** = Service tier (intake → 48-72h or upload → 10-28 days).

Source columns: `live` flag for TIER_CORE, `isActive` + `price > 0` for STANDALONE.

| # | Slug | Source | Price | Delivery | Archetype | Landing | Checkout path | Success URL | Branch today | TIER_NEXT_STEPS | Working today? |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | dui-first-offense | TIER_CORE | $127 | Instant | A | /playbook/dui-first-offense | tier | ?tier= | info (digital) | Y | YES (download buttons render) |
| 2 | drug-possession | TIER_CORE | $127 | Instant | A | /playbook/drug-possession | tier | ?tier= | info (digital) | Y | YES |
| 3 | probation-violation | TIER_CORE | $127 | Instant | A | /playbook/probation-violation | tier | ?tier= | info (digital) | Y | YES |
| 4 | white-collar | TIER_CORE | $147 | Instant | A | /playbook/white-collar | tier | ?tier= | info (digital) | Y | YES |
| 5 | sex-offense | TIER_CORE | $127 | Instant | A | /playbook/sex-offense | tier | ?tier= | info (digital) | Y | YES |
| 6 | federal-criminal | TIER_CORE | $147 | Instant | A | /playbook/federal-criminal | tier | ?tier= | info (digital) | Y | YES |
| 7 | drug-trafficking | TIER_CORE | $147 | Instant | A | /playbook/drug-trafficking | tier | ?tier= | info (digital) | Y | YES |
| 8 | self-defense | TIER_CORE | $127 | Instant | A | /playbook/self-defense | tier | ?tier= | info (digital) | Y | YES |
| 9 | case-decoder | TIER_CORE | $197 | 48h | E | /services/case-decoder | tier | ?tier= | info (intake CTA) | Y | YES (intake CTA fires) |
| 10 | intelligence-brief | TIER_CORE | $997 | 72h | E | /services/intelligence-brief | tier | ?tier= | info | Y | YES |
| 11 | x-ray | TIER_CORE | $2,497 | 10d | E | /services/x-ray | tier | ?tier= | info (upload CTA) | Y | YES |
| 12 | war-room | TIER_CORE | $4,997 | 25-28d | E | /services/war-room | tier | ?tier= | info (4-step plan) | Y | YES |
| 13 | situation-room | TIER_CORE | $9,997 | per-stage | E | /services/situation-room | tier | ?tier= | info (upload CTA) | Y | YES |
| 14 | extra-witness | TIER_CORE | $149 | next cycle | E (addon) | /addons/extra-witness | tier | ?tier= | info | Y | YES |
| 15 | witness-pack | TIER_CORE | $297 | 3-5d | E (addon) | /addons/witness-pack | tier | ?tier= | info (upload CTA) | Y | YES |
| 16 | judge-report-card | TIER_CORE+STANDALONE | $197 | Instant | B | /judge-report-card | standalone | ?product= | standaloneProduct | **N** | NO — heading wrong, no report link, no progress signal |
| 17 | officer-background-check | TIER_CORE+STANDALONE | $97 | Instant | B | /officer-background-check | standalone | ?product= | standaloneProduct | **N** | NO — same bug |
| 18 | similar-cases-analyzer | TIER_CORE+STANDALONE | $297 | Instant | B | /similar-cases-analyzer | standalone | ?product= | standaloneProduct | **N** | NO — same bug |
| 19 | district-court-intelligence | TIER_CORE+STANDALONE | $147 | Instant | B | /district-court-intelligence | standalone | ?product= | standaloneProduct | **N** | NO — same bug |
| 20 | arrest-survival-kit | TIER_CORE+STANDALONE | $47 | Instant | B | /arrest-survival-kit | standalone | ?product= | standaloneProduct | **N** | NO — confirmed live, generic fallback observed |
| 21 | federal-sentencing-distribution | TIER_CORE+STANDALONE | $297 | Instant | C | /federal-sentencing-distribution | standalone | ?product= | standaloneProduct | **N** | PARTIAL — heading lies + no progress signal |
| 22 | federal-jury-instruction-brief | TIER_CORE+STANDALONE | $97 | Instant | C | /federal-jury-instruction-brief | standalone | ?product= | standaloneProduct | **N** | PARTIAL |
| 23 | precedent-watchlist | TIER_CORE+STANDALONE | $47 | Instant + 30d drip | C | /precedent-watchlist | standalone | ?product= | standaloneProduct | **N** | PARTIAL |
| 24 | charge-authority-pack | TIER_CORE+STANDALONE | $97 | Instant | C | /charge-authority-pack | standalone | ?product= | standaloneProduct | **N** | PARTIAL |
| 25 | motion-success-report | TIER_CORE+STANDALONE | $197 | Instant | C | /motion-success-report | standalone | ?product= | standaloneProduct | **N** | PARTIAL |
| 26 | employment-impact | STANDALONE | $197 | <60s | D | /services/employment-impact | standalone | ?product= | standaloneProduct | n/a | YES |
| 27 | license-risk | STANDALONE | $297 | <60s | D | /services/license-risk | standalone | ?product= | standaloneProduct | n/a | YES |
| 28 | immigration-impact | STANDALONE | $297 | <60s | D | /services/immigration-impact | standalone | ?product= | standaloneProduct | n/a | YES |
| 29 | collateral-consequences | STANDALONE | $147 | <60s | D | /services/collateral-consequences | standalone | ?product= | standaloneProduct | n/a | YES |
| 30 | security-clearance | STANDALONE | $147 | <60s | D | /services/security-clearance | standalone | ?product= | standaloneProduct | n/a | YES |
| 31 | custody-impact | STANDALONE | $197 | <60s | D | /services/custody-impact | standalone | ?product= | standaloneProduct | n/a | YES |
| 32 | breathalyzer-challenge | STANDALONE | $97 | <60s | D | /services/breathalyzer-challenge | standalone | ?product= | standaloneProduct | n/a | YES |
| 33 | fst-review | STANDALONE | $97 | <60s | D | /services/fst-review | standalone | ?product= | standaloneProduct | n/a | YES |
| 34 | plea-consequences | STANDALONE | $97 | <60s | D | /services/plea-consequences | standalone | ?product= | standaloneProduct | n/a | YES |
| 35 | drug-test-reliability | STANDALONE | $97 | <60s | D | /services/drug-test-reliability | standalone | ?product= | standaloneProduct | n/a | YES |
| 36 | bail-hearing-prep | STANDALONE | $97 | <60s | D | /services/bail-hearing-prep | standalone | ?product= | standaloneProduct | n/a | YES |
| 37 | sentencing-prep | STANDALONE | $97 | <60s | D | /services/sentencing-prep | standalone | ?product= | standaloneProduct | n/a | YES |
| 38 | family-case-research | STANDALONE | $97 | <60s | D | /services/family-case-research | standalone | ?product= | standaloneProduct | n/a | YES |
| 39 | arrest-report-review | STANDALONE | $97 | <60s | D | /services/arrest-report-review | standalone | ?product= | standaloneProduct | n/a | YES |
| 40 | expungement-research | STANDALONE | $97 | <60s | D | /services/expungement-research | standalone | ?product= | standaloneProduct | n/a | YES |
| 41 | sentence-reduction | STANDALONE | $147 | <60s | D | /services/sentence-reduction | standalone | ?product= | standaloneProduct | n/a | YES |
| 42 | appeal-viability | STANDALONE | $297 | <60s | D | /services/appeal-viability | standalone | ?product= | standaloneProduct | n/a | YES |
| 43 | ineffective-counsel | STANDALONE | $297 | <60s | D | /services/ineffective-counsel | standalone | ?product= | standaloneProduct | n/a | YES |
| 44 | attorney-performance-review | STANDALONE | $97 | <60s | D | /services/attorney-performance-review | standalone | ?product= | standaloneProduct | n/a | YES |
| 45 | probation-violation-response | STANDALONE | $97 | <60s | D | /services/probation-violation-response | standalone | ?product= | standaloneProduct | n/a | YES |
| 46 | discovery-decoder | STANDALONE | $147 | <60s | D | /services/discovery-decoder | standalone | ?product= | standaloneProduct | n/a | YES |
| 47 | constructive-possession | STANDALONE | $97 | <60s | D | /services/constructive-possession | standalone | ?product= | standaloneProduct | n/a | YES |
| 48 | self-surrender-prep | STANDALONE | $97 | <60s | D | /services/self-surrender-prep | standalone | ?product= | standaloneProduct | n/a | YES |
| 49 | probation-rights | STANDALONE | $97 | <60s | D | /services/probation-rights | standalone | ?product= | standaloneProduct | n/a | YES |
| 50 | first-72-hours | STANDALONE (bundle) | $97 | <60s | D | /bundles/first-72-hours | standalone | ?product= | standaloneProduct | n/a | YES |
| 51 | defense-preparation | STANDALONE (bundle) | $197 | <60s | D | /bundles/defense-preparation | standalone | ?product= | standaloneProduct | n/a | YES |
| 52 | pre-plea-package | STANDALONE (bundle) | $197 | <60s | D | /bundles/pre-plea-package | standalone | ?product= | standaloneProduct | n/a | YES |

**Tally:** 5 SKUs (16-20) **fully broken** today (Archetype B). 5 SKUs (21-25) **partial** (Archetype C — intake CTA still correct, heading lies and no progress signal once intake submitted). 42 SKUs **working** with cosmetic gaps (heading "Your Analysis Is Being Built" applies even to instant downloads).

### 1.6 Why archetype B SKUs need their own treatment

For the 5 archetype-B SKUs the webhook **already auto-generates the report** (`generate.ts` mints `standalone_report_token_hash`). The customer email gets the report URL. But the success page renders "Next: Complete Your Details" — which is false; the report is already generating server-side by the time intake-CTA copy fires. Customer sees a CTA pointing to an intake form they don't actually need to complete.

**The asymmetry:** archetype B has a real, ready report URL the customer earned. Surfacing in-page is the polish work. Archetype C and D require explicit intake; the existing standaloneProduct copy is correct for those.

---

## Phase 2 — Design (opinionated picks)

### 2.1 Heading conditional logic — PICK

Kill the hardcoded `<h1>Your Analysis Is Being Built</h1>` on line 333. Replace with a function-derived heading per archetype.

```ts
function successHeading({ archetype, productName }: { archetype: 'A'|'B'|'C'|'D'|'E', productName: string }): string {
  if (archetype === 'A') return `Your ${productName} Is Ready`;          // playbooks (download)
  if (archetype === 'B') return `Your ${productName} Is Ready`;          // tier 9 instant + pre-pop
  if (archetype === 'C') return `Almost There — One Step Left`;          // tier 9 instant + needs intake
  if (archetype === 'D') return `Almost There — One Step Left`;          // standalone research + intake
  if (archetype === 'E') return `Your Order Is Confirmed`;               // service tier
  return `Your Order Is Confirmed`;                                       // safe default
}
```

**Voice check (Mercer / brand-voice):** "Your X Is Ready" reads as the closer-archetype delivering. "Almost There — One Step Left" mirrors the existing CD intake copy ("One step left, tell us about your case") so we stay consistent. None promise outcomes; none give advice. UPL-clean.

### 2.2 Tier 9 entries in `TIER_NEXT_STEPS` — PICK

The current `TIER_NEXT_STEPS` is keyed by `?tier=` and has `isDigitalProduct: boolean` to distinguish playbook PDFs. Tier 9 SKUs have a different shape: "instant data report, intake may already be auto-completed, exposure path is email link to report viewer".

Add a new flag `isInstantStandalone: true` and an `archetype: 'A'|'B'|'C'|'D'|'E'` field to the `TIER_NEXT_STEPS` entry shape. Add 10 entries — one per Tier 9 SKU. For each, pull `name` and `delivery` from `TIER_CORE[slug]`. `action` copy follows §3 templates.

Resolution rule:
- If checkout came in via `?product=`, the standaloneProduct branch handles everything and uses `STANDALONE_PRODUCTS[slug]` for `productName` + archetype lookup.
- If checkout came in via `?tier=` (e.g., future OTO or partner deeplink), `TIER_NEXT_STEPS[tier]` carries the same archetype + copy.

This is the cross-pollination decision (§2.3) made concrete.

### 2.3 `?tier=` and `?product=` cross-pollination — PICK

Normalize at the top of `SuccessContent`. Replace the current "tier OR product, branches don't talk" pattern with a single resolved descriptor:

```ts
type ResolvedSku = {
  slug: string;
  productName: string;
  archetype: 'A'|'B'|'C'|'D'|'E';
  delivery: string;
  intakeUrl?: string | null;       // from /api/checkout/verify response (rare)
  downloadUrl?: string | null;     // archetype A only
  emergencyDownloadUrl?: string | null; // archetype A only
  showUpload?: boolean;            // archetype E discovery tiers
  showOTO?: boolean;               // archetype A + E
};

function resolveSku(searchParams): ResolvedSku | null {
  const product = searchParams.get('product');
  const tier = searchParams.get('tier');
  // Priority: ?product= wins (more specific — AvailabilityChecker uses it for Tier 9 + all standalone).
  if (product) return resolveStandalone(product);
  if (tier) return resolveTier(tier);
  return null;
}
```

`resolveTier` consults a new `TIER_TO_ARCHETYPE` map. `resolveStandalone` consults `STANDALONE_TO_ARCHETYPE`. Both maps live in a new module `src/lib/checkout/post-purchase.ts` so the success page stays under 800 LOC.

### 2.4 Intake-link & report-link surfacing without exposing tokens — PICK

The verify endpoint comment (verify/route.ts:126-132) explicitly forbids returning plaintext tokens. We need an option that survives security review.

Options considered:
1. **Server-mediated redirect endpoint** — new `GET /api/checkout/post-purchase-redirect?session_id=X&kind=intake|report` looks up the order, mints a short-lived session-scoped second token, redirects to the intake/report page. Adds 1 schema migration + 1 endpoint + verifier patch.
2. **Verify endpoint returns intake URL only when intake_token plaintext was just minted** — impossible, plaintext token is gone server-side after webhook send.
3. **Email-only path with success-page copy "link sent to <email>"** — what the current standaloneProduct branch does in fallback.

**The pick — Option 3 for v1, Option 1 deferred to follow-up.** v1 ships clean copy + correct heading for ALL 52 SKUs in a 1-hour swarm, defers the "in-page report download button on success page" to a tracked follow-up plan. Success-page copy becomes informative ("X is being generated; we've emailed it to user@x.com") instead of misleading ("Next: Complete Your Details"). Tokens never exposed. v2 adds a real in-page CTA button via the redirect endpoint.

**Why the trade is worth it:** The biggest defect today is the heading lying + the customer not knowing what just happened. That's a copy + branching fix. The in-page download CTA is polish. Shipping v1 cleanly removes the "did I just lose $47?" panic moment — Suby's #1 conversion killer for crisis buyers — without paying the schema-migration tax.

### 2.5 AvailabilityChecker pre-purchase data persistence — PICK (no change)

Already implemented. `AvailabilityChecker.tsx:466-487` threads judge/officer/charge/state/circuit/courthouse into the checkout body, which `route.ts:194-203` writes to Stripe metadata, which the webhook `buildPrePopulatedIntake` consumes. **No change.** The 5 archetype-C SKUs that aren't in the `prepopulated-intake` switch (federal-sentencing-distribution, federal-jury-instruction-brief, precedent-watchlist, charge-authority-pack, motion-success-report) **should be added** if their required intake fields are deterministically present in the AvailabilityChecker payload — see Task A6.

### 2.6 Service-tier vs instant copy — PICK (mostly no change)

Archetype E (service tiers, SKUs 9-15) already has well-tuned copy in `TIER_NEXT_STEPS`. **No change.** The only edit is the heading function (§2.1) — service tiers get "Your Order Is Confirmed" instead of "Your Analysis Is Being Built".

### 2.7 Webhook coverage check

Coverage map per archetype:

| Archetype | Webhook creates order? | Mints intake token? | Mints report token? | Sends email? | Auto-generates? |
|---|---|---|---|---|---|
| A (playbook) | YES | n/a | n/a (download_token instead) | YES (PDF link) | n/a |
| B (Tier 9 + pre-pop) | YES | YES | YES (via generateTier9Report) | YES (operator only — customer report email needs verification) | YES |
| C (Tier 9, no pre-pop) | YES | YES | NO (waits for intake) | YES (intake link) | NO |
| D (standalone research) | YES | YES | NO | YES (intake link) | NO |
| E (service tier) | YES (orders + cases + processing_jobs) | n/a | n/a | YES (drip start) | n/a |

**Gap flagged:** for archetype B, generation happens fire-and-forget. There's no obviously-wired "report ready" customer email — the operator gets the "Pre-populated intake" notification but the actual report-ready email path needs verification (see Task C2).

---

## Phase 3 — Swarm Execution Plan

Total estimated swarm time: ~50 minutes parallel + 10 minutes sequential = ~60 minutes wall time.

### Task A1 — Add 10 Tier 9 entries to `TIER_NEXT_STEPS` [PARALLEL, Sonnet]

- **Files touched:** `src/app/checkout/success/page.tsx` (only)
- **Change:** add 10 entries to `TIER_NEXT_STEPS` (judge-report-card, officer-background-check, similar-cases-analyzer, district-court-intelligence, arrest-survival-kit, federal-sentencing-distribution, federal-jury-instruction-brief, precedent-watchlist, charge-authority-pack, motion-success-report). Each entry includes `isInstantStandalone: true` and a new optional `archetype: 'B'|'C'` field. Use `TIER_CORE[slug].name` and `TIER_CORE[slug].deliveryDetail` for `name` and `delivery`.
- **Acceptance:** `info` is non-null when `?tier=<any-tier-9-slug>` is in URL. The 5 archetype-B entries have `archetype: 'B'`. The 5 archetype-C entries have `archetype: 'C'`. TypeScript compiles. No other entries modified.
- **Lines of change:** ~80 LOC added.
- **Dependencies:** none.

**Archetype B `action` template (all 5):**
> "Your {name} is generating now. Typical delivery: 60 seconds. We'll email a link to {email} when it's ready. Most reports complete before this page closes — check the inbox you used to purchase."

**Archetype C `action` template (all 5):**
> "Your {name} is ready to generate. We just need a few details. We've sent a link to {email} — click it to complete intake (about 2 minutes). The report renders within 60 seconds of submission."

### Task A2 — Refactor `SuccessContent` branching [SEQUENTIAL after A1, Sonnet]

- **Files touched:** `src/app/checkout/success/page.tsx` (only)
- **Change:**
  1. Delete the hardcoded `<h1>Your Analysis Is Being Built</h1>` on line 333.
  2. Add `successHeading()` function from §2.1 inside `SuccessContent`.
  3. Add `resolveArchetype(tier, productSlug)` helper that returns 'A'|'B'|'C'|'D'|'E'.
  4. Render the heading via `<h1>{successHeading(...)}</h1>`.
  5. Inside the existing `standaloneProduct ? ... : info ? ... : <generic>` ladder, gate the "Next: Complete Your Details" CTA on `archetype === 'C' || archetype === 'D'`. For archetype B, replace the CTA block with: "Your report is generating now. We'll email it to {customerEmail} within 60 seconds."
  6. Generic fallback (line 692) gets new copy: "Your order is confirmed. We've sent details to {customerEmail}. If you don't see anything within 5 minutes, check spam or email {CONTACT_EMAIL}."
- **Acceptance:** archetype A still renders download buttons. Archetype B (live test purchase of arrest-survival-kit reproduces) renders "Your Arrest Survival Kit Is Ready" + "generating now" message + email confirmation. Archetype C (e.g., charge-authority-pack) renders "Almost There" heading + "We've sent a link". Archetype D (e.g., employment-impact) unchanged. Archetype E (e.g., x-ray) renders "Your Order Is Confirmed". OTO blocks (lines 481-651) untouched. Referral CTA (line 706) untouched.
- **Lines of change:** ~80 LOC modified, ~30 LOC added.
- **Dependencies:** A1.

### Task A3 — Document `success_url` builder contract [PARALLEL, Sonnet]

- **Files touched:** `src/app/api/checkout/route.ts` (only)
- **Change:** verify all three `success_url` builders (lines 191, 761, 816) consistently include the SKU descriptor (they do). Add a comment block above each `success_url` documenting the resolver contract — the success page resolves on `?product=` first, `?tier=` second.
- **Acceptance:** comments added, no behavioral change. `npm run build` clean.
- **Lines of change:** ~15 LOC comments only.
- **Dependencies:** none.

### Task A5 — Brand-voice copy review for new strings [PARALLEL, Opus] [JUDGMENT-FLAGGED]

- **Files touched:** `src/app/checkout/success/page.tsx` (only — strings added in A1+A2)
- **Change:** review the 10 new `action` strings, the new `successHeading` returns, and the new generic fallback copy against `.claude/rules/brand-voice (1).md` (Mercer persona, single-name brand, value-first reveal, UPL guardrail). Edit any string that drifts into outcome-promising, advice-giving, hype-man, or generic-saas-thank-you territory. Verify zero use of banned words ("leverage", "utilize", "optimize", "actionable", "deep dive"). Verify no "?" trailing on any UI string.
- **Acceptance:** all new strings pass `.claude/rules/brand-voice (1).md`. Tone matches existing `TIER_NEXT_STEPS["case-decoder"].action` cadence. No emoji. No corporate slop.
- **Lines of change:** ~10-30 LOC string edits.
- **Dependencies:** A1 wrote first draft; A5 polishes.
- **Why Opus:** copy with brand voice + UPL is judgment, not mechanical.

### Task A6 — Extend `prepopulated-intake.ts` for the 5 archetype-C SKUs [PARALLEL, Sonnet]

- **Files touched:** `src/lib/tier9-reports/prepopulated-intake.ts`, `src/components/tier9/AvailabilityChecker.tsx` (verify metadata is sent), `src/app/api/checkout/route.ts` (extend metadata mapping for circuit + federalCharge if missing).
- **Change:** add cases to `prepopulated-intake.ts` switch for: `federal-sentencing-distribution`, `federal-jury-instruction-brief`, `precedent-watchlist`, `charge-authority-pack`, `motion-success-report`. Each requires its declared `intakeFields` (per `STANDALONE_PRODUCTS[slug].intakeFields`). Verify Stripe metadata threading already covers `chargeType`, `state`, `judgeName`, `officerName`, and add `circuit` + `federalCharge` if needed.
- **Acceptance:** when AvailabilityChecker form is fully filled, webhook auto-generates the report for all 10 Tier 9 SKUs (not just 5). Reproduce by inspecting webhook logs for a test purchase of charge-authority-pack and confirming `[Webhook] pre-populated generation` line, not "intake email" line.
- **Lines of change:** ~40 LOC added, 3 files.
- **Dependencies:** none.
- **Out-of-scope flag:** if any SKU has fields the AvailabilityChecker doesn't collect deterministically, that SKU stays archetype C — document in plan body, file as deferred follow-up.

### Task B — Per-archetype manual test plan [SEQUENTIAL after A2+A6, Sonnet]

- **Files touched:** new file `docs/plans/2026-04-27-post-purchase-ux-verification.md`
- **Change:** write a 5-test manual verification plan, one per archetype, using the existing internal QA coupon (100% off, `INTERNAL_QA_COUPON_ID`) on the live site:
  - A: dui-first-offense — confirm download buttons render
  - B: arrest-survival-kit — confirm "Your X Is Ready" + "generating now" + email confirmation + report email arrives
  - C: charge-authority-pack — confirm "Almost There" + intake email arrives
  - D: employment-impact — confirm "Almost There" + intake email arrives (regression)
  - E: case-decoder — confirm "Your Order Is Confirmed" + intake CTA renders
- **Acceptance:** doc shipped, 5 test purchases run, screenshots filed in PR description.
- **Lines of change:** ~150 LOC new doc + 5 screenshots.
- **Dependencies:** A2, A6.

### Task C1 — Regression test for `?tier=` Tier 9 path [PARALLEL with B, Sonnet]

- **Files touched:** new test file at `src/__tests__/checkout/success-tier9-tier-path.test.tsx` (Vitest + RTL).
- **Change:** unit test that mounts `SuccessContent` with `?session_id=cs_test_X&tier=arrest-survival-kit`, mocks `/api/checkout/verify` to return `{ verified: true, tier: 'arrest-survival-kit', email: 'qa@example.com' }`, asserts heading is "Your Arrest Survival Kit Is Ready" and NOT "Your Analysis Is Being Built", and OTO/upload blocks don't render.
- **Acceptance:** test passes, regression locked.
- **Lines of change:** ~80 LOC new file.
- **Dependencies:** A2.

### Task C2 — Verify `generateTier9Report` sends customer email [PARALLEL, Sonnet]

- **Files touched:** read-only audit of `src/lib/tier9-reports/generate.ts`, possibly add ~30 LOC if customer-email-on-completion isn't currently wired.
- **Change:** Grep `generate.ts` for `sendEmail.*to:.*email` (the order's customer email, not OPERATOR_EMAIL). If absent, add a `sendEmail` call after the `standalone_report_token_hash` write that sends the customer the `/report/standalone/<plaintext>` link. If already wired, no-op.
- **Acceptance:** customer who buys arrest-survival-kit receives a "Your report is ready" email with the report URL. Closes the §2.7 gap.
- **Lines of change:** 0-30 LOC.
- **Dependencies:** none.

### Task D — One PR, single base branch [SEQUENTIAL final, swarm dispatcher]

- **Files touched:** none directly; PR assembly only.
- **Change:** merge A1+A2+A3+A5+A6+B+C1+C2 onto `fix/post-purchase-ux-archetypes` branched from `master @ c92924d9`. Run `npm run build`. Run `npm test`. Open PR with §4 verification checklist.
- **Acceptance:** PR green, build clean, tests pass.

---

## Phase 4 — Verification + Rollout

### 4.1 How to test without 52 real Stripe purchases

**Triple-tier test pyramid:**

1. **Unit (cheapest, 10 min):** Vitest tests at `SuccessContent` level mock `useSearchParams` + `/api/checkout/verify` response. One test per archetype = 5 tests. Cover heading, CTA presence/absence, OTO presence (only on archetype A + E).

2. **Integration (moderate, 20 min):** spin one local dev server, hit `/checkout/success?session_id=cs_test_FAKE&product=arrest-survival-kit` with mocked verify endpoint via MSW or route override. Visual inspection. Repeat for `?tier=arrest-survival-kit` (regression case).

3. **End-to-end (highest fidelity, 15 min):** use the existing internal QA coupon (100% off, `INTERNAL_QA_COUPON_ID` env). Run 5 real test purchases on production:
   - 1 archetype A (any playbook)
   - 1 archetype B (arrest-survival-kit — reproduces original bug)
   - 1 archetype C (charge-authority-pack)
   - 1 archetype D (employment-impact — regression)
   - 1 archetype E (case-decoder)

   Capture screenshots, attach to PR.

### 4.2 Rollout strategy

**Single PR, single deploy.** All 52 SKUs touch the same success page. Splitting per-archetype creates a window where some archetypes have new copy and others have old copy on the same render path — confusing for live customers in flight. Atomic ship is the right call.

Branch name: `fix/post-purchase-ux-archetypes`. Push → PR → CI green → squash merge → Vercel auto-deploy.

### 4.3 Pre-merge checklist

- [ ] `npm run build` clean (no TS errors)
- [ ] `npm test` clean (Vitest, 5+ new tests pass)
- [ ] All new strings reviewed against `.claude/rules/brand-voice (1).md` (Task A5 sign-off)
- [ ] `prepopulated-intake.ts` 10/10 Tier 9 SKUs covered (or each gap explicitly documented as deferred follow-up)
- [ ] 5 manual test purchases on production with screenshots in PR description
- [ ] No edits to `content/blog/`, `scripts/blog-pipeline/`, `scripts/qa-existing-post*` (sibling-session boundary)
- [ ] No Stripe price ID, URL slug, or DB tier_slug change
- [ ] UPL guardrail audit pass on all new copy strings (no advice, no outcome promise)
- [ ] Heading matches archetype across all 5 test purchases

### 4.4 Post-merge smoke test

Mirror format of `docs/plans/2026-04-27-post-apex-smoke-test.md`. Smoke test runner: bash one-liner that loops 5 archetypes, hits the success page with a mock session_id, asserts the OLD heading is absent in the response HTML.

```bash
# Quick post-deploy smoke (run on production after merge lands)
for sku in dui-first-offense arrest-survival-kit charge-authority-pack employment-impact case-decoder; do
  echo "=== $sku ==="
  curl -sf "https://imnotanattorney.com/checkout/success?session_id=cs_test_smoke&product=$sku" \
    -o "/tmp/smoke-$sku.html" && \
    node -e "const fs=require('fs'); const h=fs.readFileSync('/tmp/smoke-$sku.html','utf8'); console.log(h.includes('Your Analysis Is Being Built') ? 'FAIL: old heading present' : 'OK: old heading absent');"
done
```

(Confirms the OLD heading is absent. Full archetype-specific heading verification requires real session_ids and is run in §4.1.3.)

### 4.5 Rollback plan

Single PR → single revert. If a customer reports a regression, `git revert <merge-sha> && git push origin master` reverts in ~3 minutes. Vercel re-deploys auto.

### 4.6 Deferred follow-ups (out of scope for v1)

1. **Server-mediated `post-purchase-redirect` endpoint** (§2.4) — surfaces a real in-page CTA button to the report viewer / intake form. Adds 1 schema migration + 1 endpoint + verifier patch. Worth doing once analytics confirm customers want in-page over email.
2. **Real-time polling on archetype B success page** — show "Generating... 30s elapsed... Done — check email" while webhook works. Adds ~50 LOC + polling endpoint. Defer.
3. **In-page report download for archetype B** — once 1 ships, render a "View your report" button hitting `post-purchase-redirect?kind=report`. Defer.

---

## Constraints (re-confirmed from prompt)

- No edits to `content/blog/`, `scripts/blog-pipeline/`, `scripts/qa-existing-post*` (sibling session active)
- No Stripe price ID, URL slug, or DB tier_slug changes
- Brand voice: `.claude/rules/brand-voice (1).md` (Mercer persona, single-name brand, UPL guardrail)
- UPL: no advice, no outcome promise, no "verify with attorney"
- Plan executable by Sonnet swarm in ≤1 hour, with Task A5 (copy review) flagged as Opus-keep

---

## Append: brand-voice cheatsheet for swarm copy work

Mercer voice tuning notes for any string written by tasks A1, A2, A5:

- **Tone:** confident closer, never hype. "Your report is generating" not "🎉 Your report is on its way!"
- **Banned words:** leverage, utilize, optimize, streamline, impactful, actionable, deep dive, "rapidly evolving landscape", great choice, awesome, congrats.
- **Banned framings:** "?" on technical content, options-without-decision, hedging, performative helpfulness.
- **UPL guardrail:** information not advice. "Here's where to find your intake link" / "Your report is generating" — not "You should do X" / "We recommend Y".
- **Trailing closer signature:** every brand-DNA moment can use "Researchers. Defendants, still fighting." Optional on success page.
- **Two-mode awareness:** TACTICAL when discussing the system; CHARM when addressing the buyer directly. Success page is CHARM mode end-to-end.

End of plan.
