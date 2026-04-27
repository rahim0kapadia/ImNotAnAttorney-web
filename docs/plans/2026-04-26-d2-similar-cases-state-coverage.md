# D2 — `similar-cases-analyzer` state coverage gate + national fallback

**Date:** 2026-04-26
**Audit reference:** `docs/handoff/2026-04-26-product-audit-deferred.md` § D2
**Plan type:** Code-only (option b). Data ingestion is out of scope.
**Repo:** `C:\Users\email\projects\ImNotAnAttorney-web`

---

## 1. Worry (verbatim from audit D2)

> **D2 — `similar-cases-analyzer` data backfill (P1#6)**
> **Status:** $297 LIVE. `plea_discount_curves` covers only 13/51 states. `outcome_benchmarks` is national-only.
> **Why deferred:** data ingestion is hours of work + dependencies on USSC/state data sources. Not a code fix.
> **Next session unlock:**
> ```
> Plan + execute plea_discount_curves backfill for the 38 missing states
> (or gate purchase to available-state list as interim).
> Source: USSC FY2014-2023 + state-court sentencing aggregates per state's
> public reporting.
> ```

This plan is the **interim option (b)** from the unlock prompt: surface state coverage to the customer pre-purchase, fall back to federal/national data post-purchase, and label every fallback unambiguously.

---

## 2. Problem statement

`similar-cases-analyzer` ($297, LIVE) currently:

1. **Pre-purchase** — `checkSimilarCasesCoverage` only counts `case_feature_vectors` (≥3 = available) and `appellate_trends`. Coverage check **does not look at** `plea_discount_curves` or `sentencing_distributions`. A customer in Wyoming with 3 case_feature_vectors passes the gate even though zero plea-discount or sentencing-distribution rows exist for WY.
2. **Post-purchase** — `querySimilarCases` queries `plea_discount_curves` and `sentencing_distributions` filtered by `jurisdiction = state`. When the state is one of the 38 unsupported states the section renders the generic "no data available" stub. The renderer never tries the federal-level row that DOES exist.
3. **Customer impact** — defendant pays $297, receives a report whose plea-discount and sentencing-distribution sections are blank, with no explanation of WHY they're blank or what data WAS used.

### Verified data state (queried 2026-04-26)

| Table | Coverage |
|-------|----------|
| `plea_discount_curves` | **111 rows**, jurisdictions = `["FL","IA","IL","MI","MN","MS","NC","NE","NJ","TN","VA","WV","federal"]` — **12 states + federal** |
| `outcome_benchmarks` | **19 rows**, all `jurisdiction_level = "national"`, all `jurisdiction_name = "United States"` |
| `sentencing_distributions` | mostly federal-district numeric codes + state codes `["AZ","DE","IL","MI","NE","VA","WI","federal"]` (8 states) |
| `case_feature_vectors` | broad jurisdiction coverage (existing gate already counts this) |
| `appellate_trends` | broad jurisdiction coverage |

**The 12 supported state codes** for `plea_discount_curves`: `FL, IA, IL, MI, MN, MS, NC, NE, NJ, TN, VA, WV`.

---

## 3. Key decisions (and why)

### D-1. Option (b) interim, not (a) data ingestion
**Decision:** Ship the gate + fallback in code. Defer the 38-state backfill.
**Why:** Audit D2 says ingestion is "hours of work + dependencies on USSC/state data sources." This plan unblocks the truth-in-advertising worry today; the data-quality worry stays open under D2.
**Cost of delay:** Customer-facing transparency is the bigger reputational risk than incomplete coverage.

### D-2. Federal fallback over silent stub
**Decision:** When state-level `plea_discount_curves` returns 0 rows, auto-query `jurisdiction = 'federal'` for the same `charge_slug`. Track `pleaSource: 'state' | 'federal' | 'none'` on the returned data shape so the renderer can label it.
**Why:** A federal plea-discount row IS the closest available reference. Showing nothing wastes the data; showing it unlabeled would mislead. Labeling is the cascade-positive move — customer gets the data AND the disclosure.
**Same logic** applies to `sentencing_distributions`.

### D-3. National `outcome_benchmarks` is already the only level
**Decision:** Don't restructure `outcome_benchmarks` queries. The query already accepts `["national","state"]` so it's future-proof; the table just only has national rows today. Renderer caption already says "How cases like yours are resolved nationally and in your state, based on federal sentencing data" which is accurate.
**Why:** Out of scope. When 50-state outcome data lands, this query path lights up automatically.

### D-4. Pre-purchase yellow info-banner, not a hard block
**Decision:** When `coverage.pleaState === 0 && coverage.pleaFederal > 0`, show a yellow info-banner above the buy button. Do NOT downgrade `available` to false.
**Why:** A federal-level plea-discount row + national outcome-benchmark + state appellate trends + state case_feature_vectors is still a $297-worthy report — it just isn't a state-specific plea report. Hard-blocking would suppress purchases the customer would knowingly make. The disclosure banner gives them the choice.
**Cascade:** customer wins (informed consent), us wins (no refund risk on "I expected state data"), future-us wins (when state data lands, the banner disappears automatically).

### D-5. Disclosure copy is clinical, not apologetic
**Decision:** Caption text — "State-specific plea-discount data not yet ingested for [STATE NAME]. Showing federal-level data as the closest available reference."
**Why:** No "we're sorry," no UPL slop ("you should consider"), no marketing softener. INAA voice = direct, precise, candid. Mirrors the existing post-purchase report tone.

### D-6. New coverage shape — separate counts, no merging
**Decision:** `coverage` returns five distinct counts: `similarCases`, `pleaState`, `pleaFederal`, `sentencingState`, `outcomeNational`. Plus existing `appellate`.
**Why:** AvailabilityChecker UI already iterates `Object.entries(coverage).filter(count > 0)` and uses `COVERAGE_LABELS` per key. New keys plug into that loop. Merging would lose the signal needed for the banner logic.

### D-7. Test the fallback path, not the data
**Decision:** New test exercises the `pleaSource` resolution logic with mocked Supabase responses. No live-DB integration tests.
**Why:** Existing `__tests__/` directory uses pure-unit pattern with Vitest mocks (see `sentencing-fingerprint.test.ts`). Stays consistent.

---

## 4. Files to modify

### F-1. `src/lib/tier9-reports/coverage.ts` — extend `checkSimilarCasesCoverage`
**Lines:** 309-340.

**Changes:**
1. Add three new parallel COUNT queries:
   - `plea_discount_curves` filtered by `charge_slug = chargeType AND jurisdiction = state` → `pleaState`
   - `plea_discount_curves` filtered by `charge_slug = chargeType AND jurisdiction = 'federal'` → `pleaFederal`
   - `sentencing_distributions` filtered by `charge_slug = chargeType AND jurisdiction = state` → `sentencingState`
   - `outcome_benchmarks` filtered by `offense_type = chargeType AND jurisdiction_level = 'national'` → `outcomeNational`
2. Returned `coverage` object grows to:
   ```ts
   {
     similarCases: number,    // existing
     appellate: number,       // existing
     pleaState: number,       // new
     pleaFederal: number,     // new
     sentencingState: number, // new
     outcomeNational: number, // new
   }
   ```
3. `available` boolean stays `coverage.similarCases >= 3` (D-4 — don't hard-block).

### F-2. `src/lib/tier9-reports/query.ts` — `SimilarCasesData` shape + `querySimilarCases` fallback
**Lines:** 285-331 (interface), 901-961 (function).

**Interface changes (`SimilarCasesData`, ~line 285):**
Add discriminator field:
```ts
pleaSource: "state" | "federal" | "none";
sentencingSource: "state" | "federal" | "none";
```
(Federal-fallback applies to plea_discount_curves AND sentencing_distributions because both are filtered by `jurisdiction = state` today and both have a `'federal'` row set.)

**Function changes (`querySimilarCases`, lines 901-961):**
1. After the `Promise.all`, inspect `plea.data` length:
   - If `> 0` → `pleaSource = 'state'`, keep the rows.
   - If `=== 0` → run a second query with `jurisdiction = 'federal'`. If THAT returns rows → `pleaSource = 'federal'`. Else → `pleaSource = 'none'`, keep `pleaDiscountCurves: []`.
2. Same logic for `sentencing.data` → `sentencingSource`.
3. `outcome_benchmarks` query is unchanged (already filters `in.["national","state"]`).
4. `isEmpty` flag — unchanged semantics. Still true only when ALL of (vectors, sentencing, plea, benchmarks) are empty across both state and federal.

**Note:** the second query is conditional, so the cold path stays single-query for the 12 supported states. Federal-fallback is opt-in per call.

### F-3. `src/lib/tier9-reports/render.ts` — `renderSimilarCases` captions
**Lines:** 1349-1385 (Plea Discount section), 1311-1347 (Sentencing Distribution section).

**Changes:**
1. **Above the "Plea Discount Analysis" table** (after `sectionHeader("Plea Discount Analysis")`):
   - When `data.pleaSource === 'federal'`:
     ```html
     <p style="color: #FBBF24; background: #422006; border-left: 3px solid #F59E0B; padding: 12px 16px; margin-bottom: 16px; font-size: 14px;">
       <strong>Note:</strong> State-specific plea-discount data is not yet ingested for ${escapeHtml(stateName)}. Showing federal-level data as the closest available reference.
     </p>
     ```
   - When `data.pleaSource === 'none'`: existing `noDataMessage("plea discount")` stays.
   - When `data.pleaSource === 'state'`: no caption (default behavior).
2. **Above the "Sentencing Distribution" table** — same pattern, keyed on `data.sentencingSource`.
3. `stateName` resolution — render gets `intake.state` (a code like `"WY"`); reuse the `stateNames` map already in `coverage.ts` OR import a shared constant. **Recommended:** extract the state-code → name map to `src/lib/states.ts` since both `coverage.ts` and `render.ts` need it. (This is a lightweight refactor; see Task 6.)

**No UPL drift:** caption is informational, no "you should." No "consult your attorney." Pure data-provenance disclosure.

### F-4. `src/components/tier9/AvailabilityChecker.tsx` — pre-purchase banner
**Lines:** 126-142 (COVERAGE_LABELS), 340-393 (available state render).

**Changes:**
1. Extend `COVERAGE_LABELS`:
   ```ts
   pleaState: 'state plea-discount records',
   pleaFederal: 'federal plea-discount records',
   sentencingState: 'state sentencing records',
   outcomeNational: 'national outcome benchmarks',
   ```
2. In the `'available'` render block (after line 357, before the `<dl>` grid), add a conditional yellow banner:
   ```tsx
   {slug === 'similar-cases-analyzer' &&
    (coverage.pleaState ?? 0) === 0 &&
    (coverage.pleaFederal ?? 0) > 0 && (
     <div className="bg-amber-950/30 border-l-4 border-amber-500 rounded-r-lg p-4 mb-6" role="note">
       <p className="text-amber-200 text-sm">
         <strong>Heads up:</strong> State-specific plea-discount data is not yet
         available for {US_STATES.find(s => s.value === state)?.label ?? state}.
         The report will use federal-level data as the closest available reference.
       </p>
     </div>
   )}
   ```
3. Accessibility: `role="note"` (or `role="status"` if announcing dynamically). Color contrast amber-200 on amber-950 passes WCAG AA.

**No CTA changes.** Buy button stays. Customer chooses.

### F-5. `src/lib/states.ts` — NEW shared module
**Why:** Both `coverage.ts:244-258` and the new render caption need a state-code → name map. Currently duplicated inline.

**Content:**
```ts
export const US_STATE_NAMES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", /* ... full 50 + DC ... */
};

export function stateNameOrCode(code: string): string {
  return US_STATE_NAMES[code.toUpperCase()] ?? code;
}
```

This is the only NEW file. Adding it satisfies the Steal-Before-Building rule (one canonical source for a value used in 2+ places already).

### F-6. `src/lib/tier9-reports/__tests__/similar-cases-fallback.test.ts` — NEW
**Why:** Cover the federal-fallback path so a future regression doesn't silently revert to state-only.

**Test cases:**
1. State has plea_discount_curves rows → `pleaSource === 'state'`, `pleaDiscountCurves.length > 0`.
2. State has zero plea_discount_curves but federal has rows → `pleaSource === 'federal'`, `pleaDiscountCurves` populated from federal query.
3. Neither state nor federal has rows → `pleaSource === 'none'`, `pleaDiscountCurves === []`.
4. Same three cases for `sentencingSource`.
5. Coverage check returns separate counts: `pleaState`, `pleaFederal`, `sentencingState`, `outcomeNational`.

Mock pattern: stub `createAdminClient` to return canned `from(...).select(...).eq(...)` results, mirroring `sentencing-fingerprint.test.ts` style.

---

## 5. Files NOT to modify

- `src/app/standalone/similar-cases-analyzer/page.tsx` (sales page) — out of scope per audit; copy refactor is not in this PR.
- `src/lib/tiers.ts`, `src/lib/products.ts` — Stripe price ID, slug, isActive all stay.
- Database migrations — no schema change needed; this is pure read-path logic.
- `src/lib/defense-intelligence/query.ts` — re-exports `querySimilarCases` and types; the type extension at F-2 flows through automatically.

---

## 6. Numbered tasks (dependency order)

> Each task touches ≤3 files. Listed in dependency order so the swarm can checkpoint.

### Task 1 — Extract state-code → name map
**Files:** `src/lib/states.ts` (NEW)
**What:** Create the shared module with `US_STATE_NAMES` (50 states + DC) and `stateNameOrCode` helper.
**Verify:** `tsc --noEmit` clean. Module exports the helper.

### Task 2 — Replace inline map in coverage.ts
**Files:** `src/lib/tier9-reports/coverage.ts`
**What:** Replace `stateNames` inline literal at lines 244-258 with `import { US_STATE_NAMES, stateNameOrCode } from "@/lib/states"`. Keep `checkDistrictCoverage` semantics identical.
**Verify:** `tsc --noEmit` clean. Existing district test still green (or no district test exists, which is also fine — behavior unchanged).

### Task 3 — Extend `checkSimilarCasesCoverage`
**Files:** `src/lib/tier9-reports/coverage.ts`
**What:** Per F-1. Add four new parallel COUNT queries; expand returned `coverage` object. `available` boolean unchanged.
**Verify:** `tsc --noEmit` clean. Manually invoke against a known state (e.g., FL → expect `pleaState > 0`) and an unsupported state (e.g., WY → expect `pleaState === 0, pleaFederal > 0`).

### Task 4 — Extend `SimilarCasesData` shape
**Files:** `src/lib/tier9-reports/query.ts`
**What:** Add `pleaSource` and `sentencingSource` fields per F-2 interface section.
**Verify:** `tsc --noEmit` will fail in `render.ts` and `defense-intelligence/query.ts` (re-export consumer). Do NOT fix those yet — Task 5/6 will.

### Task 5 — Implement federal-fallback in `querySimilarCases`
**Files:** `src/lib/tier9-reports/query.ts`
**What:** Per F-2 function section. Conditional second-query for plea + sentencing. Set `pleaSource` / `sentencingSource` accordingly.
**Verify:** Pure logic. Will be exercised by Task 8 tests.

### Task 6 — Render captions for federal-fallback
**Files:** `src/lib/tier9-reports/render.ts`
**What:** Per F-3. Yellow caption above plea-discount + sentencing tables when `Source === 'federal'`. Use `stateNameOrCode` from Task 1.
**Verify:** `tsc --noEmit` clean. Snapshot the rendered HTML for a federal-fallback case (manual fixture in test) — confirm the caption appears.

### Task 7 — Pre-purchase banner in AvailabilityChecker
**Files:** `src/components/tier9/AvailabilityChecker.tsx`
**What:** Per F-4. Extend `COVERAGE_LABELS`, add conditional yellow banner in the `'available'` block.
**Verify:** Manual smoke — load `/standalone/similar-cases-analyzer`, pick FL (state-supported, banner hidden) then WY (federal-only, banner visible). `tsc --noEmit` clean.

### Task 8 — New test
**Files:** `src/lib/tier9-reports/__tests__/similar-cases-fallback.test.ts` (NEW)
**What:** Per F-6. Five test cases covering state-only / federal-fallback / none for both plea + sentencing, plus coverage-shape assertion.
**Verify:** `npm test -- similar-cases-fallback` passes. All new tests green.

### Task 9 — Regression sweep
**Files:** none (run-only)
**What:** Run `npm run typecheck` + `npm test` + `npm run build`. Fix any unrelated breaks ONLY if introduced by this PR.
**Verify:** Build green. No new failures.

---

## 7. Out of scope (explicit)

- **Data ingestion** — the 38 missing states. Tracked separately under D2 unlock prompt.
- **Stripe / pricing changes** — $297, price ID, slug all unchanged.
- **`/similar-cases-analyzer` sales-page copy** — separate refactor.
- **`outcome_benchmarks` 50-state expansion** — table is national-only by design today.
- **Schema migrations** — none needed.
- **Email-template / post-purchase-drip changes** — none needed (the report HTML carries the disclosure).
- **`SimilarCasesIntake` shape** — unchanged.
- **`DefenseIntelligenceData` / `UsscDistribution` paths** — unchanged.

---

## 8. Success criteria

1. `checkSimilarCasesCoverage` returns six distinct counts: `similarCases`, `appellate`, `pleaState`, `pleaFederal`, `sentencingState`, `outcomeNational`.
2. `querySimilarCases` returns `pleaSource: 'state' | 'federal' | 'none'` and `sentencingSource: 'state' | 'federal' | 'none'`. Federal-fallback fires only when state query returns zero rows.
3. Pre-purchase UI shows yellow info-banner for the 38 unsupported states (when at least one state is unsupported AND federal has data).
4. Post-purchase report renders a yellow caption above the plea-discount and sentencing tables when source is federal. Caption text is verbatim: *"State-specific plea-discount data is not yet ingested for [STATE NAME]. Showing federal-level data as the closest available reference."*
5. Renderer never emits an empty plea section for a valid charge if federal data exists — falls back to federal then to outcome_benchmarks national.
6. Caption is unambiguous: a customer reading the section knows the source is federal/national, not state-specific.
7. Existing tests still pass. New `similar-cases-fallback.test.ts` covers all three source states for plea + sentencing.
8. `tsc --noEmit` clean. `npm run build` clean.
9. **No UPL drift** — caption contains zero "should/recommend/advise/consult" tokens.

---

## 9. Cascade (6 nodes)

- **Us (INAA):** truth-in-advertising before the audit gets weaponized in a refund dispute or a Reddit post. Fixes the worry without paying ingestion costs.
- **Direct counterparty (defendant in unsupported state):** gets a $297 report whose data provenance is honest. Knows what's federal, knows what's state-specific. Can still proceed informed.
- **Their downstream (defendant's attorney):** receives a labeled fallback section. Can validate or reject based on whether federal-level data is appropriate for the case. Better artifact than a silently-blank table.
- **Ecosystem (legal-info content space):** raises the floor — most pSEO competitors emit unlabeled "data" without provenance. We ship the discipline of explicit labels, models the right behavior.
- **Future-us:** when state ingestion lands (data-quality D2), the fallback path silently disengages. Banner disappears. Captions disappear. No code change needed beyond loading the rows. Forward-compatible.
- **Adjacent players (other Tier 9 SKUs):** the `pleaSource` / `sentencingSource` discriminator pattern + `US_STATE_NAMES` shared module are reusable for `judge-report-card` and `district-court-intelligence` when they hit the same state-coverage cliff. Pattern compounds.

No node has a loss. Cascade-positive.

---

## 10. Grep evidence (pre-execution scan)

| Symbol | Match count | Files |
|--------|-------------|-------|
| `checkSimilarCasesCoverage` | 3 prod + 4 docs | `coverage.ts`, `check-availability/[slug]/route.ts`, AvailabilityChecker (indirect via API), plus 4 plan/spec docs |
| `querySimilarCases` | 4 prod + 6 docs | `query.ts` (def), `generate.ts` (consumer), `defense-intelligence/query.ts` (re-export), 1 spec consumer + plan refs |
| `pleaDiscountCurves` | 4 prod | `query.ts` (interface, return), `render.ts` (length check, loop) |
| `SimilarCasesData` | 5 prod | `query.ts` (def), `render.ts` (consumer), `defense-intelligence/query.ts` (re-export) |
| `SimilarCasesIntake` | 4 prod | `query.ts` (def), `generate.ts` (build), `defense-intelligence/query.ts` (re-export) |
| `plea_discount_curves` (table ref) | 1 prod query | `query.ts:925-930` only |

**Conclusion:** all consumers are inside the four files modified. No external repo / cron / Edge Function consumes these symbols directly.

---

## 11. Pre-flight verification commands

Run these against the current main branch before starting Task 1 to confirm the data state hasn't shifted:

```bash
cd C:/Users/email/projects/ImNotAnAttorney-web
node -e "
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  const { data } = await sb.from('plea_discount_curves').select('jurisdiction').limit(5000);
  const states = [...new Set(data.map(r => r.jurisdiction))].sort();
  console.log('Supported jurisdictions:', states);
})();"
```

Expected output (as of 2026-04-26):
`["FL","IA","IL","MI","MN","MS","NC","NE","NJ","TN","VA","WV","federal"]`

If the list has expanded, recount the "38 missing states" claim and re-run the audit.
