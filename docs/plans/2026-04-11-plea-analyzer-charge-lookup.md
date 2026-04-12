# Plea Analyzer — Charge Lookup Widget

**Goal:** Reduce friction on the free plea analyzer form by letting defendants look up their specific charge and auto-fill sentencing exposure from our jurisdiction_statutes data (4,699 statutes across 52 jurisdictions).

**User story:** Defendant at 3AM selects State + Charge Type → clicks "Look up what you're facing" → sees matching charges with statute numbers and penalty ranges → picks theirs → sentencing exposure auto-fills.

**Spec reference:** B1 in `docs/superpowers/specs/2026-04-09-hybrid-stacking-cascade-design.md`

---

## Files Modified

| File | Changes |
|------|---------|
| `src/app/api/charge-taxonomy/charges/route.ts` | Add `penalty_min`, `penalty_max`, `fine_max`, `mandatory_minimum` to enriched response when jurisdiction is provided |
| `src/app/plea-analyzer/PleaAnalyzerClient.tsx` | Add charge lookup button + results panel below sentencing exposure field; auto-fill on selection |

## Files Created

None.

---

## Tasks

- [ ] **Task 1:** Extend charges API enrichment to include penalty fields (`penalty_min`, `penalty_max`, `fine_max`, `mandatory_minimum`) from `jurisdiction_statutes` table
- [ ] **Task 2:** Add `CHARGE_TYPE_TO_CATEGORY` mapping in PleaAnalyzerClient (maps form chargeType values to taxonomy category slugs)
- [ ] **Task 3:** Add "Look up what you're facing" button + inline results panel below sentencing exposure field. Shows when state + chargeType are both selected. Fetches from `/api/charge-taxonomy/charges?category=<mapped>&jurisdiction=<state>`.
- [ ] **Task 4:** Render charge cards showing label, statute number, offense class, penalty range. On click: auto-fill sentencing exposure with formatted penalty string.
- [ ] **Task 5:** Accessibility: labels, aria-live for results, keyboard navigation for charge cards, focus management.
- [ ] **Task 6:** Verify TypeScript compiles clean (`npx tsc --noEmit`)

## Accessibility Notes

Follows existing PleaAnalyzerClient patterns: aria-live region for results, button with descriptive text, charge cards as role="radio" group or button list, focus moves to results on load.

## Data Flow

```
Form: state + chargeType selected
  → "Look up what you're facing" button visible
  → Click → GET /api/charge-taxonomy/charges?category={mapped}&jurisdiction={state}
  → API enriches with penalty data from jurisdiction_statutes
  → Client renders charge cards
  → User clicks a charge card
  → Auto-fill: sentencingExposure = "Up to {penalty_max}, fine up to {fine_max}" (+ mandatory minimum if present)
```
