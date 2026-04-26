# D5 — Federal Jury Instruction Brief: Circuit Coverage Transparency + Flip Live

**Date:** 2026-04-26
**Repo:** `C:\Users\email\projects\ImNotAnAttorney-web`
**Status:** Plan ready for execution
**Worry source:** `docs/handoff/2026-04-26-product-audit-deferred.md` D5 entry
**Related shipped patterns:**
- `docs/plans/2026-04-26-d2-similar-cases-state-coverage.md` (D2 — federal-fallback caption + AvailabilityChecker yellow banner)
- `docs/plans/2026-04-26-d3-officer-bg-check-coverage.md` (D3 — thin-state external-intel banner)

---

## 1. Worry (verbatim from product audit, D5)

> $97 dark. `v_pji_public` empty for circuits 2, 4, 10, 11, DC, FC (6/13). PJI ingestion work for missing circuits.

This pass is **disclosure transparency + flip live**, not data ingestion. PJI ingestion for missing circuits is multi-week. The existing M4 resolver in `src/lib/tier9-reports/federal-jury-instruction-brief.ts` already implements graceful fallback: when the user's circuit has zero rows, it picks the closest-available circuit and adds a `limitations` line. That resolver behavior is already shipped and tested.

The remaining gap is **pre-purchase**: a customer in (e.g.) the 4th Circuit selects FJIB, sees no warning, pays $97, and only then learns "we used the 5th Circuit's pattern instruction as the closest available." That's the disclosure cliff D2/D3 closed for similar-cases and officer-bg-check. This plan applies the same yellow-banner pattern to FJIB.

### Verified data state (live prod, 2026-04-26)

```
v_pji_public total: 1,772 rows
Per circuit:
  1:  72   3: 285   5: 251   6: 140   7:  67   8: 141   9:  44
Missing circuits: 2, 4, 10, 11, DC, FC
```

**Confirmed:** circuit 10 has **zero** rows despite the existing
`PJI_COVERED_CIRCUITS = new Set([1, 3, 5, 6, 7, 8, 9, 10])` constant claiming
otherwise. Constant must be corrected to `[1, 3, 5, 6, 7, 8, 9]` (7 circuits).

### Existing infra (do NOT change semantics)

- **Resolver graceful fallback** — `queryFederalJuryBrief()` already picks
  closest-sibling circuit + adds limitation note. Post-purchase reports stay
  identical.
- **Federal-only gate** — `isFederalCharge()` rejects non-federal charges
  before anything else. Unchanged.
- **Stripe price** — `stripePriceId: null` (deferred-payment intake flow).
  Unchanged.
- **DB tier slug** — `federal-jury-instruction-brief`. Unchanged.

---

## 2. Plan

### Files to modify (4 production files + 1 test)

1. **`src/lib/tier9-reports/federal-jury-instruction-brief.ts`** — fix
   `PJI_COVERED_CIRCUITS` to drop circuit 10 (it has zero rows in prod).
   Update the `limitations` copy to say "First, Third, Fifth, Sixth, Seventh,
   Eighth, and Ninth Circuits" instead of "...and Tenth". Update the
   `circuitPref` selector to drop `10` from preference list.

2. **`src/lib/tier9-reports/coverage.ts`** — add
   `checkFJIBCoverage(federalCharge, circuit)` returning `CoverageResult`
   with `coverage = { pjiTotal, pjiInCircuit, supported }` and
   `available: true` (graceful fallback always renders something). Imports
   `PJI_COVERED_CIRCUITS` + `isFederalCharge` from the FJIB module to keep
   the supported-circuit list as a single source of truth.

3. **`src/app/api/check-availability/[slug]/route.ts`** — add
   `'federal-jury-instruction-brief'` to `TIER9_SLUGS`. Add a new switch
   case that requires `federalCharge` (must be a key of `FEDERAL_CHARGES`)
   + optional `circuit` (must be `1`–`11` or `DC`); cascades from `state`
   when `circuit` is omitted (reuses existing `STATE_TO_CIRCUIT` map). State
   stays mandatory (existing top-level guard).

4. **`src/components/tier9/AvailabilityChecker.tsx`** —
   - Add `'federal-jury-instruction-brief'` to `Slug` union.
   - Add federal-charge `<select>` (sourced from `FEDERAL_CHARGES`) and
     circuit `<select>` (sourced from `CIRCUIT_NAMES`) input fields, gated
     to this slug only.
   - Pass `federalCharge` + `circuit` into the POST body.
   - Pre-purchase yellow banner pattern (matches D2/D3): when
     `coverage.pjiInCircuit === 0` AND `coverage.pjiTotal > 0`, render the
     amber-styled `<div role="note">` with copy:
     "**Heads up:** Pattern jury instructions for the [Nth] Circuit are not
     yet ingested. The report will use the closest available circuit's
     instruction as a reference, with the deviation called out clearly."
   - Pass `federalCharge` + `circuit` into `buildCheckoutUrl()`.
   - Add coverage labels for new keys (`pjiTotal`, `pjiInCircuit`).

5. **`src/lib/tiers.ts`** — flip
   `federal-jury-instruction-brief.live` from `false` to `true`. Comment:
   "2026-04-26 D5 PR — circuit-coverage gating + transparent fallback
   disclosure satisfies $97 pricing without backfilling 6 circuits."

6. **`src/lib/products.ts`** — flip
   `federal-jury-instruction-brief.isActive` from `false` to `true`. Same
   audit-trail comment.

7. **`src/lib/tier9-reports/__tests__/fjib-coverage.test.ts`** — NEW. Mock
   the Supabase admin client, exercise three paths:
   - Circuit with rows → `coverage.pjiInCircuit > 0`, no banner-trigger
   - Circuit without rows → `coverage.pjiInCircuit === 0`, banner-trigger
   - Non-federal charge → still returns coverage shape (federal-only check
     is downstream, this helper is for ANY federal charge by definition —
     route-layer enforces `isFederalCharge` validation)

### Out of scope

- **PJI ingestion for missing circuits.** Per audit framing, deferred
  (multi-week — each circuit has its own publication source).
- **Stripe price changes.** $97 unchanged.
- **DB slug renames.** Unchanged.
- **Resolver behavior in `queryFederalJuryBrief`.** The existing
  closest-sibling fallback IS the post-purchase honesty layer — banner is
  pre-purchase only.
- **New landing page.** `/services/federal-jury-instruction-brief` (the
  generic services route) becomes accessible automatically via
  `isActive: true`. A dedicated landing page with embedded
  AvailabilityChecker is a downstream PR.

### Hard constraints (from prompt)

- Stripe price ID UNCHANGED ($97)
- DB tier_slug UNCHANGED
- URL slug UNCHANGED
- Existing graceful fallback in resolver UNCHANGED — banner is pre-purchase
  only
- Tone: clinical, no UPL slop
- AvailabilityChecker pattern matches D2/D3 yellow-banner styling
- 7 supported circuits hardcoded in shared module (the FJIB module)

---

## 3. Success criteria

- `npx tsc --noEmit --skipLibCheck` → 0 errors
- `npx vitest run src/lib/tier9-reports/__tests__/` → all green including
  new fjib-coverage tests
- Existing `federal-jury-instruction-brief.test.ts` → still green
- POST `/api/check-availability/federal-jury-instruction-brief` returns
  expected shape for both supported and unsupported circuits
- `tiers.ts` + `products.ts` reflect live state for FJIB
- No changes to Stripe price ID, slug, or resolver fallback behavior

---

## 4. Cascade

- **us:** D5 closed; one fewer dark $97 SKU; transparency pattern stays
  consistent across D2/D3/D5 — easier to extend for D1/D4 later.
- **direct counterparty (defendant):** before paying $97, sees a
  one-sentence amber heads-up that their circuit's instruction will be
  served by the closest sibling. No surprise post-purchase.
- **downstream (attorney reviewing the brief):** report has the same
  transparent limitations note + closest-sibling label; pre/post parity.
- **ecosystem:** UPL stays intact (no advice; only disclosure of the
  data-state); Hormozi-style "make it impossible to feel scammed" pricing
  defense.
- **future-us:** when ingestion lands for circuit 4 (etc.), drop
  `PJI_COVERED_CIRCUITS` update + the helper auto-clears the banner.
  No customer code change required.

No node loses. Cascade-positive.
