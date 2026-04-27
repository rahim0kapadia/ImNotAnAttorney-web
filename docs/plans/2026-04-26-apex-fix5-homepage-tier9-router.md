# Apex Fix #5 — Homepage Tier 9 Router Section

**Worry source:** `docs/plans/2026-04-26-apex-catalog-health-pass.md` finding **F-L4-3** — homepage `src/app/page.tsx` mentions only CD/IB/X-Ray. Crisis buyer at 2am sees the $197 → $997 → $2,497 ladder and never learns $47 (arrest-survival-kit) or $97 (officer-bg) wedge options exist. Bottom-of-funnel buyer never reaches Tier 9 from homepage.

**Branch:** `fix/apex-homepage-tier9-router`
**Repo:** `C:\Users\email\projects\ImNotAnAttorney-web`
**Layer:** L4 Distribution (Crestodina — content nobody can find converts at zero)
**Cited expert:** Alex Hormozi, *$100M Offers* — entry-tier wedge: when the floor is invisible, budget-constrained buyers bounce; when the floor is discoverable from the primary acquisition surface, the wedge captures buyers who would otherwise leave.

---

## What Ships

A new homepage section between the Pricing/bonus-stack section and the Lead Capture section (i.e. above FAQ, below the ladder). Heading: "Need just one piece? Start at $47." Frames Tier 9 as **narrow questions answered in 60 seconds from public court data** — distinct from the ladder's full-case synthesis.

7 small cards, ascending price, each linking to its dedicated landing.

| Order | Slug | Price | Card one-liner |
|------:|------|------:|----------------|
| 1 | `arrest-survival-kit` | $47 | First-72-hours checklist tuned to your state |
| 2 | `officer-background-check` | $97 | Public discipline + complaint history for the arresting officer |
| 3 | `federal-jury-instruction-brief` | $97 | Circuit-pattern jury instructions for your federal charge |
| 4 | `district-court-intelligence` | $147 | Courthouse Intelligence Pack — judges, prosecutors, motion patterns at your courthouse |
| 5 | `judge-report-card` | $197 | Judge Question Brief — sentencing patterns + ruling tendencies for your assigned judge |
| 6 | `motion-success-report` | $197 | Grant rates by motion type for your judge + jurisdiction |
| 7 | `similar-cases-analyzer` | $297 | Sentencing cohort: cases that look like yours and what happened |

All 7 verified live (`live: true`) in `src/lib/tiers.ts:261-380` as of 2026-04-26.

## Files Modified

- `src/app/page.tsx` — single new `<section>` block between current pricing section (closes L689) and lead-capture section (opens L692). No other edits.

## Out of Scope

- Copy refactor of any existing homepage section
- Visual redesign of the bonus-stack or pricing ladder
- `precedent-watchlist` ($47, dark) and `charge-authority-pack` (dark) — `live: false` per F-L4-1 stop-bleed
- Drip emails (Fix #4 — separate session)
- IB defensive moat copy (Fix #3 — separate session)
- Sitemap changes (Fix #1 already covered)

## Hard Constraints

1. Read `priceDisplay` from `TIER_CORE` for every SKU — no hardcoded prices (staleness detector hook will block).
2. NO em-dashes (humanizer detector blocks > 65pt). Use `&mdash;` HTML entity (existing convention) only inside JSX strings — and even those sparingly.
3. NO banned UPL phrases ("consult your attorney", "you should", "we recommend", "your best option", "we advise").
4. NO claim that Tier 9 reports are personalized in a way they aren't — frame as **"narrow questions answered from public court data"**, not "case-specific synthesis."
5. Match existing homepage card visual conventions: `border border-zinc-500 bg-zinc-900/50`, amber accents, mobile-first grid, hover state on cards that link.
6. Mobile-first — match existing breakpoints (`sm:grid-cols-2`, `lg:grid-cols-3` or similar).

## Cascade Check

- **us:** floor wedge ($47) discoverable from primary acquisition surface. Hormozi entry-tier captures budget-constrained buyer who would have bounced.
- **customer:** crisis buyer with sub-$197 budget finds an entry point. Wedge solves "I can't afford the ladder right now" objection.
- **downstream:** more attorneys see informed defendants — even at $47 (arrest-survival-kit) the defendant walks in with a checklist.
- **ecosystem:** signals to legal-info category that wedge pricing is legit (vs 5-tier ladder only).
- **future-us:** establishes Tier 9 as first-class on homepage — pattern reusable for next Tier 9 SKUs.
- **adjacent players:** competitors see the wedge model — raises floor for whole legal-info category.
- **No node loses.** Cascade-positive. SHIP.

## Verification

1. `rm -rf .next/types && node node_modules/typescript/bin/tsc --noEmit --skipLibCheck` — 0 errors.
2. Grep `src/app/page.tsx` for: "consult your attorney", "you should", "we recommend", "your best option", "we advise" — 0 matches.
3. Grep `src/app/page.tsx` for em-dash literal `—` count — should not increase relative to master.
4. Mental visual diff: section renders between Pricing (L590 region) and Lead Capture (L692 region).

## Commit + PR

Single commit `feat(apex-5): homepage Tier 9 router section`. Push branch, open PR vs master.
