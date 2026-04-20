# Bondsman Referral Surface — Audit & Fix Master (2026-04-19)

Full audit consolidating 4 parallel Apex agent audits across all bondsman-referral-touched pages (client-facing + partner-facing). Ranked by cascade × revenue × effort.

## Scope audited

**Client-facing:**
- `src/app/r/[code]/page.tsx` — bridge
- `src/app/court-date/[code]/page.tsx` — bridge variant
- `src/components/BridgePage.tsx` — shared component
- `src/app/checkin/[code]/page.tsx` — check-in signup (separate white-label track)
- `src/app/r/[code]/reminders/page.tsx` — reminder opt-in
- `src/app/r/[code]/quiz/page.tsx` + `src/components/ReferralQuiz.tsx` — quiz
- `src/app/r/[code]/[product]/page.tsx` — product deep-link (currently pure redirect)

**Bondsman-facing:**
- `src/app/partners/bondsman/page.tsx` — bondsman acquisition
- `src/app/partners/page.tsx` — general partners overview
- `src/app/partners/terms/page.tsx` — legal
- `src/app/partner/dashboard/page.tsx` — main dashboard
- `src/app/partner/card/page.tsx` — bail-packet insert preview
- `src/app/partner/checklist/page.tsx` — bail conditions checklist preview
- `src/app/partner/compliance-report/page.tsx` + `ComplianceReportClient.tsx` — surety audit report

## Strategic decisions already locked

1. **White-label shell** for all pre-quiz bondsman-referral pages — bondsman logo + brand colors, INAA logo + UPL disclaimer at bottom.
2. **INAA-branded shell** takes over at the quiz (product territory) — "introduced by {Bondsman}" credit top-right.
3. **Quiz CTA button** lives on bondsman pages but quiz itself is INAA-branded.
4. **Brandfetch API + Color Thief v3 + manual hex override** for logo/color extraction.
5. **Forfeiture-reduction** ($1K-$10K per no-show) is bondsman's #1 pain — value prop for all partner acquisition copy.
6. **QR-code flyer** for jail-release handoff in v1 scope.
7. **Post-signup confirmation page** (new) bondsman-branded, offers quiz CTA.
8. **OG/link-preview cards** also partner-branded (use same partner logo + colors).

## 7 cross-cutting failure patterns

- **P1** — Forfeiture-reduction pitch quantified NOWHERE in product. Needs dollar hero on dashboard + math section on bondsman acquisition + bond-exposure total on compliance report.
- **P2** — Generic SaaS voice everywhere ("Creative Assets," "Partner Dashboard," "Here's what to consider"). Atti voice absent.
- **P3** — Tagline "Know What They Know" + brand DNA long-form absent from every page.
- **P4** — 10%-off discount framing undersells + contradicts product-tiers.md rule. Replace with bundle + risk reversal.
- **P5** — Unity→Authority handoff broken at paid-funnel entry (partner credit vanishes at quiz recommendation step; product page is pure redirect).
- **P6** — Proof points missing where they'd work hardest (15,386 judges / 33,000+ cases / every citation verified).
- **P7** — Primary CTAs buried or weak.

## Single biggest revenue finding

`src/app/r/[code]/[product]/page.tsx` renders NOTHING before redirecting to `/checkout`. Direct-to-checkout on cold $2,497 deep-link converts 0.1-0.5%. Proper A4-structured product page converts 1-3%. **5-30x revenue multiplier idle.** Also creates UPL compliance gap (no INAA-controlled surface between bondsman text and Stripe carries the disclaimer).

## Dead code to delete

- `src/components/BridgePage.tsx:78-82` countdown block — `daysUntilCourt` prop always undefined, zero renders ever.
- `src/components/BridgePage.tsx:28` `daysUntilCourt?: number` prop + line 31 destructure.
- `src/app/r/[code]/page.tsx:122-132` comment block explaining the undefined `daysUntilCourt`.
- `src/app/r/[code]/[product]/page.tsx:8` `sanitizeSubId` import — never applied.

## Ranked fix order

Status key: ✅ DONE + pushed · ⏳ pending · 🚫 deferred to separate plan

| # | Status | Scope | Files | Effort | Agent-safe? |
|---|--------|-------|-------|--------|-------------|
| 1 | ✅ Session A | Build real product-detail page (A4 structure, UPL footer, partner credit, proof, bundle+guarantee) | `/r/[code]/[product]` | M | NO — structural |
| 2 | ⏳ | Dashboard forfeiture-dollars-saved hero + activation checklist + reorder | `partner/dashboard` | M | NO — needs data pipeline |
| 3 | ✅ Session A | Bondsman acquisition: forfeiture math hero > commission | `partners/bondsman` | S | YES |
| 4 | ✅ Session A | Port 595K/15,386 data grid from generic → bondsman page | `partners/bondsman` | XS | YES |
| 5 | ✅ Session A | Add "Why We're Not the 10th Referral Program" differentiator section | `partners/bondsman` | S | YES |
| 6 | ✅ Session B | Compliance report: forfeiture-prevented card + "program operated by" reframe | `ComplianceReportClient.tsx` | S | YES |
| 7 | ✅ Session B | Quiz: persistent partner credit + proof strip + cost-of-inaction anchor + bundle+guarantee reframe | `ReferralQuiz.tsx` | M | YES |
| 8 | ✅ Session A | BridgePage: hero revision, CTA→"Know what they know", UPL warm-up, delete dead countdown | `BridgePage.tsx` | S | YES |
| 9 | ✅ Session B | Reminders page: partner-name in hero + mutual-incentive framing | `/r/[code]/reminders` | XS | YES |
| 10 | ⏳ | Carbon-copy reminders feed on dashboard | `partner/dashboard` | S | NO — needs data pipeline |
| 11 | ✅ Session B | 404 fallback copy (3 files) — blame the code, not bondsman | `/r/`, `/court-date/`, `/r/reminders` | XS | YES |
| 12 | ✅ Session B | Voice pass across partner child components (6 files) | `components/partner/*` | M | YES (partial) |
| 13 | ⏳ | Card + checklist: bondsman-value-stack side panel | `partner/card`, `partner/checklist` | S | NO — UI layout decisions |
| 14 | ⏳ | Peer benchmark block (Firestone retention) | `partner/dashboard` | M | NO — needs aggregation queries |
| 15 | ✅ Session A | Sub-id wire-through + partner_events logging | `/r/[code]/[product]` | XS | YES |
| 16 | ✅ Session B | Terms: UPL clause + surface tier-never-downgrades + soften refund | `partners/terms` | XS | YES |
| 17 | ✅ Session A | Metadata titles/descriptions (link unfurls) | `/r/`, `/court-date/`, `/r/reminders` | XS | YES |
| 18 | ✅ Session B | "Anyone can partner" → name 4 segments + move bondsman CTA to hero | `/partners` | XS | YES |

**Round-2 review pass (2026-04-19, on all Session B items):** 3-reviewer fan-out (correctness / strategy / legal) surfaced 3 CRITICAL + 17 WARNING + ~13 SUGGESTION findings. All resolved per Pristine-Or-Nothing rule. Reports at `docs/reviews/2026-04-19-session-b-7items/{correctness,strategy,legal}.md` (gitignored). Highlights:
- Cost-of-inaction anchors in quiz now source-cited (Brennan Center / CAP).
- Quiz guarantee aligned to canonical "at least 15 case-specific questions" language.
- `partners/page.tsx:57` "Both of You" logic break fixed; HOW_IT_WORKS stopped contradicting the quiz on "10% off".
- `PARTNER_SEGMENTS[]` + `FORFEITURE_RANGE_*` constants hoisted to `src/lib/partner-data.ts` as single source of truth.
- UPL clause (terms) compressed 4→2 paragraphs without weakening protection; tier-for-life callout cross-refs Section 8 termination.
- Reminders page H1 stake-first ("Miss court, lose your bond."); `gets` → `can get` modal hedge; root `<div>` → `<main>`; unconditional `robots.index=false`.
- Compliance report: `FORFEITURE` constants consumed; zero-state; surety-auditor disclosure.
- ComplianceKit: Lucide `Check`/`X` swap; copy button 44×44 touch target.

**Remaining (⏳ items #2, #10, #13, #14):** all flagged "NO — structural / needs data pipeline / UI layout decisions" and deferred to a separate plan per the "Deferred to separate plan" section below.

## Deferred to separate plan

- **Items 1, 2, 10, 13, 14** — structural work + data pipelines + new component architecture. Needs a written plan per no-spaghetti rule.
- **White-label infrastructure** — DB migration (`partners.logo_url`, `brand_color_primary`, `brand_color_accent`, `website_url`), Brandfetch integration, Color Thief extraction fallback, manual hex override, partner dashboard upload UI, shared layout components (`<PartnerBrandedShell>` + `<InaaBrandedShell>`), Supabase Storage bucket, OG template refactor, contrast guard. Separate plan required.

## Follow-up audits flagged (not done this pass)

- `src/lib/tiers.ts` — audit `delivery` field for speed-selling language (leaks onto every tier display).
- `src/lib/partner-data.ts` — FAQ text audit.
- `src/components/partner/*` — hardcoded child-component copy audit (CreativeAssets, ComplianceKit, EarningsSection, PartnerAnalytics).

## Expert lens citations

- April Dunford — positioning (partner as introducer, bondsman = niche)
- Sabri Suby — A4 direct response
- Peep Laja — CRO hierarchy (narrative > positioning > messaging > copy)
- Russell Brunson — bridge framework + funnel discipline
- Robert Cialdini — Unity Principle + Authority transition
- Alex Hormozi — Value Equation (Dream × Likelihood / (Time × Effort)) + Grand Slam Offer
- Chris Dreyer — niche domination (bondsman vernacular)
- Ezra Firestone — ambassador program retention
- Andre Chaperon — trust-building via specificity
- Nir Eyal — Hooked (variable reward loops for dashboard retention)
- BJ Fogg — Tiny Habits (anchor to existing bondsman workflow)
- Sean Ellis — activation moment identification
- Seth Godin — Purple Cow + tribal identity
- Atti crisis-buyer lens (MANDATORY filter across all client-facing)
