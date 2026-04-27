# D3 — Officer Background Check: State Coverage Transparency

**Date:** 2026-04-26
**Repo:** `C:\Users\email\projects\ImNotAnAttorney-web`
**Status:** Plan ready for execution
**Worry source:** `docs/handoff/2026-04-26-product-audit-deferred.md` D3 entry
**Related shipped pattern:** `docs/plans/2026-04-26-d2-similar-cases-state-coverage.md` (D2 — Similar Cases federal-fallback caption + AvailabilityChecker yellow banner). This plan reuses that pattern verbatim for the officer-bg-check coverage cliff.

---

## 1. Worry (verbatim from product audit, D3)

> $97 LIVE. 99% of `officer_external_intel` rows are GA+CA+AZ. 17 states have <50 rows. Most jurisdictions return near-empty. (a) Better state coverage in ingestion OR (b) gate purchase by available-state list.

This pass is **option (b) — disclosure transparency**, not ingestion. Audit's framing was: "CPD + NYPD already drove sub-flag products — extend that pattern." So the gate is a pre-purchase yellow banner + post-purchase caption that disclose thin state-level external-intelligence coverage WITHOUT hard-blocking the purchase. The customer chooses informed.

### Verified data state (confirmed via audit's queries — do NOT re-verify in this pass)

**Two coverage tables drive this product:**

| Table | Rows | Used by |
|---|---|---|
| `officer_reliability` | 25K | `checkOfficerCoverage` in `src/lib/tier9-reports/coverage.ts:100-236` (existing) |
| `officer_external_intel` | 454,288 | report deep query at `src/lib/tier9-reports/query.ts:875-880` (filtered by `eq('state', intake.state)`) |

**`officer_reliability` coverage:**
- 14 states have **0 rows**: CA, NY, GA, MA, LA, OR, OK, CT, NV, KS, NM, WV, NH, MT, ND
- Only 25 states have ≥10 rows
- Top: HI 143, VA 137, NJ 97, IL 92, PA 92

**`officer_external_intel` coverage by state:**
- GA 239,624 / CA 168,723 / AZ 41,300 = **99% of rows**
- All 51 jurisdictions have at least 1 row, but only **35 have ≥50 rows**
- **16 states have <50 rows** — the THIN tier this plan addresses:
  | State | Rows |
  |---|---|
  | NE | 47 |
  | CT | 45 |
  | MT | 40 |
  | NV | 38 |
  | ME | 37 |
  | NH | 33 |
  | ND | 23 |
  | WY | 23 |
  | AK | 18 |
  | SD | 17 |
  | VT | 16 |
  | DE | 15 |
  | DC | 10 |
  | RI | 9 |
  | HI | 8 |
  | (+ all 0-row states implicitly thin) |

**Threshold for "thin":** `officer_external_intel` row count for state < **50**. (Anything ≥50 is treated as adequate state-level coverage; the gate does not fire.)

### Existing infra (do NOT touch)

- **CPD enrichment path** (state=IL) — feature-flagged `officer_bg_check_cpd_enhanced`. Surfaces `cpdOfficers` + `cpdComplaints` counts. Adequate even when external_intel is thin in IL.
- **NYPD enrichment path** (state=NY) — feature-flagged `officer_bg_check_nypd_enhanced`. Surfaces `nypdOfficers` + `nypdAllegations`. Adequate even when external_intel is thin in NY.
- **Existing `available` boolean** at `coverage.ts:231`: `count >= 1 || hasCpd || hasNypdRoster`. The `count` falls back to a name-only nationwide `officer_reliability` lookup if the state-filtered query returns zero. **DO NOT change this contract** — existing customers in any state with a name match (or CPD/NYPD enrichment) keep their experience.

### Audit search counts (pre-execution)

| Symbol | Files matched | Notes |
|---|---|---|
| `checkOfficerCoverage` | 7 files (12 occurrences) | Real consumers: `coverage.ts` (definition), `route.ts` (call site), `2026-04-25-nypd-pristine-deferred.md`, `20260424g_officer_bg_check_cpd_flag.sql`, `2026-04-11-data-availability-gate.md` ×2, `2026-04-11-availability-gate-shipped.md`. Only ONE production call site. |
| `officer_external_intel` | 27 files (142 occurrences) | Coverage check + report query are the two production code paths. Rest is migrations, docs, ingestion scripts. |
| `renderOfficerBackground` | 7 files (40 occurrences) | Real consumers: `render.ts` (definition), `generate.ts` (call site), `tests/lib/officer-render.test.ts`. |

**Scope is narrow.** Only one coverage call site, one report-query call site, one render call site.

---

## 2. Key Decisions

### D-1. Threshold = 50 rows, not 100, not 10

**Decision:** Banner fires when `coverage.externalIntelState < 50`.

**Why:** 50 is the audit-cited "thin" cutoff. 35 states clear it; the 16 listed above + all zero-coverage states do not. Setting the threshold at 100 would over-fire (pulling adequate states like NJ/PA into the warning); setting it at 10 would under-fire (NV/NE/CT/MT/ME/NH/ND would slip through with banner-free 33-47 row counts that still produce thin reports).

### D-2. Disclosure, not hard-block

**Decision:** Banner is a yellow info-note. Buy button stays. Available boolean unchanged.

**Why:** Three reinforcing reasons.
1. **Cascade rule** — hard-blocking 16+ states pre-purchase eliminates customers who would have gotten useful name-match data from `officer_reliability` (which spans nationwide via the existing fallback) or from CPD/NYPD enrichment when applicable. That is a customer-loss with no offsetting win.
2. **Existing D2 pattern (Similar Cases banner)** is disclosure-not-block. Consistency.
3. **The `available` boolean** at `coverage.ts:231` is name-driven (any name match in `officer_reliability` returns true). Wiring the thin-state signal into `available` would silently downgrade customers who DO have a name match and would get a useful report. Disclosure is the correct lever.

### D-3. CPD and NYPD enrichment supersedes the banner

**Decision:** When `coverage.cpdComplaints > 0` OR `coverage.nypdOfficers > 0`, suppress the banner regardless of `externalIntelState` count.

**Why:** Those enrichment paths deliver structured roster + complaint data that is itself a deliverable; the report is NOT thin in IL or NY when those flags fire. Showing a "data is limited" banner over a CPD-rich or NYPD-rich result undermines the customer's trust in their actual purchase. Existing IL/NY customer experience MUST be preserved (constraint).

### D-4. Caption mirrors D2 federal-fallback shape

**Decision:** Render a yellow caption block before the External Intelligence section in the rendered report when `externalIntelState < 50` AND no CPD AND no NYPD enrichment is present.

**Why:** D2's `renderFederalFallbackNote` helper at `render.ts:141-150` already established the visual + tonal pattern (yellow `#FBBF24` text, `#422006` background, `#F59E0B` left border, "Note:" prefix, clinical no-UPL-drift voice). Reusing the visual language gives customers a consistent disclosure surface across Tier 9 SKUs.

### D-5. Coverage object grows, not replaces

**Decision:** Add `externalIntelState` field to the `coverage` dict alongside `officers`. Both ship to the AvailabilityChecker.

**Why:** The dl grid in `AvailabilityChecker.tsx:436-447` already iterates the coverage object and renders each numeric field with a label. Adding `externalIntelState` lets the customer see BOTH counts pre-purchase (nationwide reliability count + state external-intel count) — that transparency itself is the deliverable. No need for a hidden flag.

### D-6. Thin-state signal lives in `coverage.ts`, not the component

**Decision:** Compute the count in `checkOfficerCoverage`. Component only branches on the count value.

**Why:** Coverage logic centralized in `coverage.ts` matches the existing pattern (CPD/NYPD probes also live there). Component stays presentational. Future ingestion improvements that lift coverage will lower the count naturally — no component change needed.

### D-7. Report-side caption uses the SAME 50-row threshold AND the SAME suppression rules

**Decision:** Caption fires iff the same condition as the pre-purchase banner: `externalIntelState < 50` AND no CPD enrichment AND no NYPD enrichment is rendered.

**Why:** Pre/post-purchase parity contract (already enforced for NYPD per `coverage.ts:178-221`). If the customer saw a banner pre-purchase, the report MUST show a caption — and vice-versa. Re-derive the count in the renderer from the queried data (`data.externalIntel.length` is the post-fetch count for that state, which is exactly what the coverage check measured). The CPD/NYPD enrichment rendering already happens in `renderCpdSection` / `renderNypdSection`; the caption check looks at whether `data.cpd?.status === "single"` and `data.nypd?.status === "single"` to suppress.

---

## 3. Files to Modify

### M-1. `src/lib/tier9-reports/coverage.ts` — extend `checkOfficerCoverage`

**Change:** Add a parallel COUNT query against `officer_external_intel` filtered by `state`. Store result as `coverage.externalIntelState`. Do NOT change the `available` boolean. Do NOT change CPD or NYPD probe logic.

**Insertion point:** After the existing nationwide-fallback block at line 121 (`const count = result.count ?? 0;`), before the CPD probe at line 127. Run the new query in parallel with the rest? — No, keep it sequential after the existing officer_reliability lookup to keep the change minimal and the diff readable. The query is a single COUNT, head-only, filtered by `eq('state', upperState)`. Cost is negligible.

**Resulting coverage shape:**
```ts
{
  officers: number,           // existing
  externalIntelState: number, // NEW — count of officer_external_intel rows for this state
  cpdOfficers?: number,        // existing, only when state=IL + flag + match
  cpdComplaints?: number,      // existing
  nypdOfficers?: number,       // existing, only when NY-routed + flag + match
  nypdAllegations?: number,    // existing
}
```

**Why state code is uppercased:** `officer_external_intel.state` stores ISO 2-letter codes uppercase (per the report query at line 879: `.eq("state", intake.state)` — intake.state arrives uppercase from the AvailabilityChecker). Use `state.toUpperCase()` defensively.

**Available-boolean rule:** UNCHANGED. The new field is informational only.

### M-2. `src/components/tier9/AvailabilityChecker.tsx` — yellow info banner for thin coverage

**Change:** When `slug === 'officer-background-check'` AND `coverage.externalIntelState < 50` AND no CPD enrichment AND no NYPD enrichment → render yellow info banner. Pattern mirrors D2's `fallbackBanner` for similar-cases-analyzer at lines 369-396.

**Suppression rules:**
- `(coverage.cpdComplaints ?? 0) > 0` → suppress
- `(coverage.nypdOfficers ?? 0) > 0` → suppress
- `(coverage.externalIntelState ?? 0) >= 50` → suppress (adequate)

**Banner copy** (keep clinical, no UPL drift, parallel to D2):
> **Heads up:** External-intelligence data for {STATE_LABEL} is currently limited (N records). The report will include name-match data from our reliability database (M records nationwide), plus any matching agency-specific records.

Where `N = coverage.externalIntelState` and `M = coverage.officers`. `STATE_LABEL` resolved via the existing `US_STATES` array at the top of the file (e.g., "California" not "CA").

**Insertion point:** Inside the `'available'` state render branch, after the existing `pleaStateMissing` / `sentencingStateMissing` branches at line 369, parallel to those. Add a new `officerThinExternalIntel` boolean and a new `fallbackBanner` branch that fires only when `slug === 'officer-background-check'`.

**dl-grid filter (W3 of D2 pattern):** No change needed. The new `externalIntelState` field is a real count and its label is user-meaningful — let it render in the grid alongside `officers`. Add an entry to `COVERAGE_LABELS` (line 127): `externalIntelState: "state-level external-intelligence records"`.

### M-3. `src/lib/tier9-reports/render.ts` — caption block in rendered report

**Change:** Inside `renderOfficerBackground` (line 1090), at the start of the External Intelligence Records block (line 1161, just before `body += sectionHeader("External Intelligence Records")`), insert a caption when:
- `data.externalIntel.length < 50` AND
- `data.cpd?.status !== "single"` AND
- `data.nypd?.status !== "single"`

**Caption helper:** Extend the existing `renderFederalFallbackNote` pattern at lines 141-150. Either reuse it directly with a different `sectionLabel` argument ("external-intelligence" — but the wording diverges) OR add a sibling helper `renderThinStateCoverageNote(stateCode, recordCount, nationwideCount)`. **Decision:** add a sibling helper. The helpers are 6 lines each; the wording difference (state-data-not-yet-ingested vs. state-data-currently-limited-but-fallback-present) doesn't fit cleanly into one parameterized template. Place the new helper next to `renderFederalFallbackNote`.

**Caption copy:**
> **Note:** State-level external-intelligence coverage for {STATE_NAME} is currently limited (N records). This section shows the available records plus any nationwide name-match supplements.

Where `N = data.externalIntel.length`. Resolve `STATE_NAME` via existing `stateNameOrCode(stateCode)` import (already in scope, line 8).

**State code source:** `renderOfficerBackground(data: OfficerBackgroundData)` does NOT currently take an intake parameter. The state code must be derived from the data. Two options:

- **Option A:** Pull from `data.externalIntel[0]?.state` — but this is empty when externalIntel is sparse.
- **Option B:** Pull from `data.officers[0]?.jurisdiction` — but officers may be empty too if all came via nationwide fallback.
- **Option C:** Add `intake: { state: string }` parameter to `renderOfficerBackground` (mirrors `renderSimilarCases` signature at line 1308).

**Decision: Option C.** Cleaner, consistent with similar-cases pattern, and `generate.ts:201` is the only call site — easy to update. The intake state is already loaded upstream when `generate.ts` builds the report.

**Caption insertion location:** Before `body += sectionHeader("External Intelligence Records");` at line 1163. The caption fires whether or not externalIntel has rows (so the customer sees it even on a 0-row state with only nationwide name matches in `officers`).

**Wait — edge case.** When `data.externalIntel.length === 0`, the existing code skips the entire External Intelligence block (line 1162: `if (data.externalIntel.length > 0)`). The caption needs to render even in the 0-row case so the customer sees a disclosure. **Refactored insertion:** lift the caption check to fire BEFORE the `if (data.externalIntel.length > 0)` gate. Render the caption alone if there are 0 external-intel rows but the thin-state condition is met (and no CPD/NYPD enrichment). When there ARE rows, render caption then section as today.

### M-4. `src/lib/tier9-reports/generate.ts` — pass intake to renderer

**Change:** Update the `renderOfficerBackground(data)` call site at line 201 to pass intake: `renderOfficerBackground(data, { state: intake.state })`.

**Why:** Consequence of M-3 Option C. Single-line change.

---

## 4. Files to Create

### C-1. `src/lib/tier9-reports/__tests__/officer-coverage.test.ts`

**Purpose:** Unit tests for the extended `checkOfficerCoverage` covering the five required scenarios.

**Pattern:** Mirror `src/lib/tier9-reports/__tests__/similar-cases-fallback.test.ts` (already in repo, established as the D2 test pattern). Mock the Supabase admin client at module level. Each test seeds a per-call query log + canned rows. Vitest.

**Tests:**

1. **Rich coverage (GA, 239,624 ext-intel rows)** — mock returns 239,624 from `officer_external_intel`+state filter. Expect `coverage.externalIntelState >= 50`. Expect NO thin-state condition trip.

2. **Thin coverage (HI, 8 rows, no CPD, no NYPD)** — mock returns 8 from external_intel. Mock returns 0 from officer_reliability state-filtered, 1 from name-only fallback. CPD/NYPD flags off (state=HI). Expect `coverage.externalIntelState === 8`. Expect `coverage.officers === 1` (nationwide name match). Banner-trip condition met.

3. **Thin external_intel + CPD match (state=IL with feature flag on)** — mock returns 25 ext-intel rows for IL (under 50 — would be "thin"). Mock returns CPD match: `cpdOfficerCount=1`, `cpdComplaintCount=12`. Expect `coverage.cpdComplaints === 12`. Banner-trip condition NOT met (CPD supersedes).

4. **Thin external_intel + NYPD match (state=NY with feature flag on)** — mock returns 0 ext-intel rows for NY (NY has 0 in `officer_external_intel` per audit, since NY data was added via the NYPD path). Mock NYPD candidate fetch returning a single match. Expect `coverage.nypdOfficers >= 1`. Banner-trip condition NOT met (NYPD supersedes).

5. **Zero coverage, no CPD, no NYPD (HI without enrichment paths)** — mock returns 0 ext-intel rows for HI, 0 officer_reliability rows. Expect `coverage.externalIntelState === 0`. Expect `coverage.officers === 0`. Banner-trip condition met. (Note: `available` boolean will be false here per existing logic — that's the "unavailable" state, separately handled.)

**File header:**
```ts
/**
 * Unit tests for the officer-background-check state-coverage gating
 * (D3 plan, 2026-04-26). Mirrors the similar-cases-fallback test pattern.
 *
 * Focus:
 *   - checkOfficerCoverage exposes externalIntelState count
 *   - CPD enrichment suppresses the thin-state signal (IL)
 *   - NYPD enrichment suppresses the thin-state signal (NY)
 *   - Banner-trip condition: externalIntelState < 50 AND no CPD AND no NYPD
 */
```

**Test mock contract:** Use the same `scriptedRows` map keyed by `${table}|${stateFilter}` shape from `similar-cases-fallback.test.ts`. Add support for `ilike` filter recording (officer_reliability uses ilike + eq) so the per-table behavior can be observed.

---

## 5. Numbered Tasks (dependency order)

### Task 1 — Extend `checkOfficerCoverage` (M-1)

**File:** `src/lib/tier9-reports/coverage.ts`

**Steps:**
1. Locate the existing `checkOfficerCoverage` block (lines 100-236).
2. After line 121 (`const count = result.count ?? 0;`), add:
   ```ts
   // Thin-state coverage probe (D3 plan, 2026-04-26): officer_external_intel
   // is heavily concentrated in GA/CA/AZ. 16 states have <50 rows. Surface
   // the state-level count so the AvailabilityChecker can display a yellow
   // info banner when coverage is thin AND no CPD/NYPD enrichment fires.
   const upperState = state.toUpperCase();
   const externalIntelResult = await supabase
     .from("officer_external_intel")
     .select("officer_name", { count: "exact", head: true })
     .eq("state", upperState);
   const externalIntelStateCount = externalIntelResult.count ?? 0;
   ```
3. After line 122 (`const coverage: Record<string, number> = { officers: count };`), add:
   ```ts
   coverage.externalIntelState = externalIntelStateCount;
   ```
4. Confirm the existing `available` calculation at line 231 is UNCHANGED:
   ```ts
   available: count >= 1 || hasCpd || hasNypdRoster,
   ```
5. tsc check: `npx tsc --noEmit`.

**Acceptance:** `coverage.externalIntelState` returned in every call. CPD/NYPD probes still run unchanged. `available` boolean still computed identically.

---

### Task 2 — Write coverage unit tests (C-1)

**File (new):** `src/lib/tier9-reports/__tests__/officer-coverage.test.ts`

**Steps:**
1. Read `src/lib/tier9-reports/__tests__/similar-cases-fallback.test.ts` to understand the mock pattern.
2. Implement the 5 tests from §4-C1 above.
3. Mock surface needs `from(...).select(...).ilike(...).eq(...)` chain for `officer_reliability` AND `from(...).select(...).eq(...)` chain for `officer_external_intel`. Extend the existing mockBuilder pattern.
4. Tests must mock both `isFeatureEnabled` (to control CPD/NYPD flag-on/off) and the NYPD candidate-fetch helper or the supabase NYPD table queries directly. Easiest path: mock `@/lib/feature-flags` returning `false` by default; mock the NYPD module's `fetchNypdCandidates` and `chooseNypdMatch` to return canned `{candidates: []}` in tests where NYPD should not fire.
5. Run `npx vitest run src/lib/tier9-reports/__tests__/officer-coverage.test.ts`.

**Acceptance:** All 5 tests pass. Coverage returns the expected `externalIntelState` value for each scenario. CPD/NYPD enrichment fields populated where expected.

---

### Task 3 — Add yellow banner to AvailabilityChecker (M-2)

**File:** `src/components/tier9/AvailabilityChecker.tsx`

**Steps:**
1. Locate `COVERAGE_LABELS` map at line 127. Add entry:
   ```ts
   externalIntelState: 'state-level external-intelligence records',
   ```
2. Inside the `'available'` state render branch (line 346 onward), after the existing similar-cases derived booleans (~line 363), add officer-bg-check derived booleans:
   ```ts
   const isOfficerBgCheck = slug === 'officer-background-check';
   const officerExternalIntelStateCount =
     (coverage.externalIntelState ?? 0) as number;
   const officerNationwideCount = (coverage.officers ?? 0) as number;
   const officerHasCpd = (coverage.cpdComplaints ?? 0) > 0;
   const officerHasNypd = (coverage.nypdOfficers ?? 0) > 0;
   const officerThinState =
     isOfficerBgCheck &&
     officerExternalIntelStateCount < 50 &&
     !officerHasCpd &&
     !officerHasNypd;
   ```
3. Extend the existing `fallbackBanner` JSX-or-null variable to ALSO branch on `officerThinState`. The simplest approach: fall through after the `else if (sentencingStateMissing)` branch — add `else if (officerThinState) { fallbackBanner = (<p ...>...) }`. The banner JSX must use `text-amber-200 text-sm` styling matching the existing fallbackBanner branches. Body copy:
   ```jsx
   <p className="text-amber-200 text-sm">
     <strong>Heads up:</strong> External-intelligence data for {stateLabel}
     is currently limited ({officerExternalIntelStateCount.toLocaleString()}
     {' '}records). The report will include name-match data from our
     reliability database ({officerNationwideCount.toLocaleString()} records
     nationwide), plus any matching agency-specific records.
   </p>
   ```
4. The existing `<div role="note">` that wraps `fallbackBanner` (lines 426-433) does not need changes — it already conditionally renders when `fallbackBanner` is non-null.
5. tsc check: `npx tsc --noEmit`.

**Acceptance:** Banner renders for officer-bg-check thin-state cases. Does NOT render for similar-cases (existing branches keep working). Does NOT render when CPD or NYPD enrichment present.

---

### Task 4 — Add caption helper + thin-state caption to report renderer (M-3, M-4)

**Files:**
- `src/lib/tier9-reports/render.ts`
- `src/lib/tier9-reports/generate.ts`

**Steps:**
1. In `render.ts`, after the `renderFederalFallbackNote` helper (line 150), add the sibling helper:
   ```ts
   /**
    * Thin-state external-intelligence caption (D3 plan, 2026-04-26).
    *
    * Officer Background Check has heavy state coverage skew: 99% of
    * officer_external_intel rows are GA/CA/AZ. 16 states have <50 rows.
    * When the requested state is thin AND no CPD/NYPD enrichment fires,
    * surface a provenance disclosure parallel to the federal-fallback
    * caption used by Similar Cases. Tone stays clinical — no UPL drift.
    *
    * @param stateCode    Two-letter ISO state code from intake.
    * @param recordCount  Count of officer_external_intel rows for this state.
    */
   function renderThinStateExternalIntelNote(
     stateCode: string,
     recordCount: number,
   ): string {
     return `
         <p style="color: #FBBF24; background: #422006; border-left: 3px solid #F59E0B; padding: 12px 16px; margin-bottom: 16px; font-size: 14px;">
           <strong>Note:</strong> State-level external-intelligence coverage for ${escapeHtml(stateNameOrCode(stateCode))} is currently limited (${recordCount.toLocaleString()} record${recordCount === 1 ? "" : "s"}). This section shows the available records plus any nationwide name-match supplements.
         </p>
         `;
   }
   ```
2. Update the `renderOfficerBackground` signature at line 1090:
   ```ts
   export function renderOfficerBackground(
     data: OfficerBackgroundData,
     intake: { state: string },
   ): string {
   ```
3. Inside `renderOfficerBackground`, just before line 1161 (the `// External Intelligence Records` comment), add the thin-state caption logic:
   ```ts
   // Thin-state coverage caption (D3 plan, 2026-04-26): when the requested
   // state has fewer than 50 officer_external_intel rows AND no CPD/NYPD
   // enrichment fires, surface a provenance disclosure. Mirrors the
   // pre-purchase yellow banner so pre/post-purchase parity holds.
   const externalIntelStateCount = data.externalIntel.length;
   const cpdResolved = data.cpd?.status === "single";
   const nypdResolved = data.nypd?.status === "single";
   const thinStateCoverage =
     externalIntelStateCount < 50 && !cpdResolved && !nypdResolved;
   if (thinStateCoverage) {
     body += renderThinStateExternalIntelNote(
       intake.state,
       externalIntelStateCount,
     );
   }
   ```
   Place this block BEFORE the existing `if (data.externalIntel.length > 0)` gate so the caption fires whether or not the intel block renders.
4. In `generate.ts` line 201, update the call:
   ```ts
   html = renderOfficerBackground(data, { state: intake.state });
   ```
   Confirm `intake.state` is in scope at that line (it is — `intake` is the report's intake object passed into the generate function).
5. Update `tests/lib/officer-render.test.ts` (existing) to pass `{ state: 'CA' }` (or appropriate test state) as the new second argument. Run that test to confirm it still passes. If the existing test only inspects rendered HTML output and the new caption fires for the test fixture, the test will need a state choice that doesn't trigger the caption (use `CA` — 168K external-intel rows, well above 50) OR explicitly seed enough externalIntel array entries to clear the threshold. **Recommended:** pass `{ state: 'CA' }` and seed the test fixture's `data.externalIntel` array with however many entries the existing test already uses (caption fires only if BOTH state has <50 rows AND CPD/NYPD don't resolve). Read the existing test and adapt minimally.
6. tsc check: `npx tsc --noEmit`.
7. Run vitest: `npx vitest run tests/lib/officer-render.test.ts`.

**Acceptance:** Caption renders before External Intelligence section in the report HTML when thin-state condition is met. Caption suppressed for CA/GA/AZ. Caption suppressed when CPD or NYPD resolved. Existing officer-render test still passes.

---

### Task 5 — Run full test sweep + tsc + manual smoke check

**Steps:**
1. `npx tsc --noEmit` — must be clean.
2. `npx vitest run src/lib/tier9-reports/__tests__/officer-coverage.test.ts` — 5/5 passing.
3. `npx vitest run tests/lib/officer-render.test.ts` — passing (existing test, adapted).
4. `npx vitest run src/lib/tier9-reports/__tests__/similar-cases-fallback.test.ts` — passing (regression check; D2 still works).
5. Manual smoke: hit `/api/check-availability/officer-background-check` locally with payload `{officerName: "Smith", state: "HI"}` (thin) and `{officerName: "Smith", state: "GA"}` (rich). Confirm response includes `coverage.externalIntelState` field with appropriate count.
6. Manual smoke: from a dev preview, walk through `/officer-background-check` AvailabilityChecker for state=HI and confirm yellow banner renders. For state=CA confirm no banner. For state=IL with a name that hits the CPD path confirm no banner.

**Acceptance:** All gates green.

---

## 6. Out of Scope

- **Actual data ingestion** for the 16 thin states or the 14 zero-coverage states. That is a separate ingestion sprint (option (a) from the audit). This plan ships option (b) — disclosure transparency — only.
- **CPD or NYPD enrichment changes.** Both paths work; both stay untouched.
- **URL slug / Stripe price ID / DB tier_slug / product rename.** All immutable per the constraints.
- **Changing the `available` boolean's behavior.** Existing customers in any state with a name match in `officer_reliability` keep their flow.
- **Lowering the threshold below 50 or raising it above 50.** 50 is the audit-cited cutoff; tuning is a follow-up data decision.
- **Adding banner copy A/B variants.** Disclosure copy ships as one canonical version per the D2 pattern.
- **Modifying `checkArrestKitCoverage`** at coverage.ts:270, even though it ALSO queries `officer_external_intel` (line 279). Different SKU, different threshold logic, different deliverable. Out of scope.

## 7. Success Criteria

1. **Coverage shape extended:** `checkOfficerCoverage` returns `coverage.externalIntelState: number` in addition to existing fields. `available` boolean and CPD/NYPD probe outputs UNCHANGED.
2. **Pre-purchase banner:** Yellow info banner renders in AvailabilityChecker when `slug === 'officer-background-check'` AND state-level external-intel coverage is <50 rows AND neither CPD nor NYPD enrichment is present.
3. **Banner suppression:** Banner does NOT render in any of these cases:
   - State has ≥50 external-intel rows (rich coverage)
   - CPD enrichment fires (`cpdComplaints > 0`)
   - NYPD enrichment fires (`nypdOfficers > 0`)
   - Slug is anything other than `officer-background-check`
4. **Post-purchase caption:** Yellow caption renders before the External Intelligence Records section in the rendered report when the SAME thin-state condition is met. Suppressed identically.
5. **Pre/post-purchase parity:** A customer who saw the pre-purchase banner sees the post-purchase caption, and vice-versa. No state where one fires without the other.
6. **Existing customer experience preserved:** CA / GA / AZ / IL (with CPD) / NY (with NYPD) customers see no new disclosures. Existing tests (`tests/lib/officer-render.test.ts`, `similar-cases-fallback.test.ts`) still pass.
7. **5 new unit tests pass:** `officer-coverage.test.ts` covers the 5 scenarios.
8. **tsc clean:** No type errors in the touched files.
9. **No new files outside the test path.** Only one new file: the test.
10. **No URL / Stripe / tier_slug / rename changes.**

## 8. Cascade

- **Us (Atlas / INAA).** Officer Background Check $97 stops shipping silent-thin reports to defendants in 16 states. Trust in the SKU compounds; refunds and complaints from "the report was empty" will drop. We get a reusable thin-state-disclosure pattern alongside the federal-fallback pattern from D2 — both ride the same renderFederalFallback / renderThinStateExternalIntel helper shape, so future Tier 9 SKUs that hit the same coverage cliff inherit a known surface.

- **Direct counterparty (the defendant).** Pre-purchase: they see honest coverage numbers BEFORE they pay $97 — they choose informed (buy, or wait for the waitlist via the existing 'unavailable' branch when even name-match returns nothing). Post-purchase: when the report has thin state coverage, they see a clear caption explaining the data shape; they don't get blindsided by a section with two name-matched rows where they expected dozens. Trust earned.

- **Their downstream (defendant's attorney).** Attorney receives a report with a clear data-provenance caption, not a thin section that looks like incompetence on our side or like legitimate negative evidence. Caption frames the data shape as a coverage limitation, not a finding of "no problems with this officer." Attorney can use the data without having to debug it.

- **Ecosystem (Tier 9 SKU pattern).** D2 + D3 establish a consistent disclosure language across two coverage cliffs (federal-fallback for Similar Cases, thin-state for Officer BG Check). Future SKUs that hit similar cliffs (Judge Question Brief, District Court Intelligence, anything new) ride the same yellow-caption pattern. Industry floor of "legal data products that disclose coverage limits" rises — a competitor reading our public site sees us doing this and may feel pressure to match. Adjacent good.

- **Future-us.** When ingestion catches up (option (a) from the audit) and a state crosses 50 rows, the banner and caption auto-disappear without any code change. Threshold lives in one place per surface (component check, render check); both are single-line constants. The 50 number is easy to tune. Pristine path: no special-case state lists baked into code; the gate reads from the data. The reusable `renderThinStateExternalIntelNote` helper joins the renderFederalFallback helper as core Tier 9 disclosure infrastructure.

- **Adjacent players (other Tier 9 operators / internal report renderers).** Engineers who later build a new Tier 9 SKU see the D2 + D3 pattern in `coverage.ts` and `render.ts` and know the conventions: probe count → disclose at threshold → suppress when alternate-source enrichment exists. No special-snowflake code in this plan. Industry floor of internal codebase consistency rises.

**Cascade test passed.** No node loses. No escape clause needed.

---

## Appendix — Audit Pre-Execution Counts

| Symbol | Files | Real production code paths |
|---|---|---|
| `checkOfficerCoverage` | 7 | `coverage.ts` (def), `route.ts` (call). Rest is docs + 1 migration comment. |
| `officer_external_intel` | 27 | `coverage.ts` (existing arrest-kit query line 279 — out of scope), `query.ts` (report deep query), plus ingestion scripts + migrations + plans. |
| `renderOfficerBackground` | 7 | `render.ts` (def), `generate.ts` (call), `tests/lib/officer-render.test.ts` (test). |

**Confirmed thin-coverage state codes (16):** NE, CT, MT, NV, ME, NH, ND, WY, AK, SD, VT, DE, DC, RI, HI, plus zero-coverage states (which trip the same gate trivially since 0 < 50).
