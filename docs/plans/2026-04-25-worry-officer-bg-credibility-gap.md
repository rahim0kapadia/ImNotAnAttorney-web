# Worry — Officer Background Check report claims data sources we have 0 rows for

## Worry

Officer Background Check landing page promises Brady/Giglio listing + Decertified-officer data, but `officer_external_intel.brady_status='listed'` returns 0 rows and `decertified=true` returns 0 rows. The render code at `src/lib/tier9-reports/render.ts:847` (Brady alert) and `:861` (Decertification alert) is unreachable. The "External Intelligence Records" section header at `:841` reads literally "Data from Brady/Giglio List, National Police Index, and state POST databases" — that header fires whenever any externalIntel row exists (which happens in 50 states via NPI), so non-Chicago customers see the report claim Brady and POST data sources we never deliver. This is a credibility / UPL hole on a live SKU.

## Expert lens

**Peep Laja** (`~/.claude/experts/peep-laja.md` — cached) — Messaging Hierarchy + Strategic Narrative layer. Laja's #1 rule: "Don't claim what you can't prove." Page-level promises that the body can't deliver are the highest-impact CRO + trust hit. The fix is at the messaging layer (don't claim it) OR the proof layer (load the data).

**Cross-ref:** `~/.claude/rules/no-hallucinated-legal-data.md` (UPL safety rule) — anything we say is "verified" MUST have a stored source URL. Claiming a data source for which we have zero rows is borderline same-class violation (not falsification, but unsubstantiated implication).

## Cascade

- **us:** removes credibility risk; non-Chicago customers get accurate report (no false data-source claim)
- **non-Chicago customer:** sees only data sources actually populated for them; if Brady/POST gets ingested later, header re-adds it automatically
- **future-us:** dynamic header means adding Brady/POST data later requires zero copy edits
- **ecosystem:** raises the floor — the public-data legal-tech category is full of vague "comprehensive database" claims; we model honest-by-default
- **Rahim:** zero new ongoing work
- **No node loses.** Cascade-positive.

## Decision (root-cause vs symptom)

Three paths existed:
1. **Load partial Brady/Decertification data** for 1-2 states — multi-hour ingest per state, defers fix
2. **Remove the dead render branches + downgrade the header** — fast, accurate, but loses optionality
3. **Make the header dynamically reflect actually-populated columns** — surgical, ~30 LOC, fixes the credibility issue today AND keeps the Brady/Decertified branches alive so future ingestion just lights them up automatically

**Choose path 3 (root-cause).** Producer = the static header string. Fix the producer so it reflects reality.

## Numbered tasks

1. Add a helper `summarizeIntelSources(externalIntel)` returning the array of human-readable source labels actually represented in the rows. Logic:
   - If any row has `brady_status` non-null → include "Brady/Giglio Lists"
   - If any row has `npi_employment_history` non-null → include "National Police Index"
   - If any row has `decertified === true` → include "state POST databases"
2. Replace `render.ts:841` static string with dynamic call to the helper. If empty → fall back to a generic "Data from public court records and officer-data sources." which is true for any non-empty externalIntel.
3. Add unit test in `tests/lib/officer-render.test.ts` asserting the header for an externalIntel-with-NPI-only fixture says "National Police Index" and DOES NOT say "Brady/Giglio" or "state POST".
4. Add unit test for populated-Brady case → header includes Brady label (regression guard for future ingest).
5. tsc + vitest.

## Out of scope (deferred to next worry phases)

- Actual ingestion of Brady/Giglio data (deferred — separate worry; covered by P3 Invisible Institute National Police Index API request after their 1-2 day approval)
- Decertification data ingest (deferred — covered by P2 LLEAD Louisiana statewide which includes POST decertifications)
- Fatal Encounters source-label addition for agencies (already firing correctly via separate render branch; not affected)

## Success criteria (gradeable, binary PASS/FAIL)

1. **Static header string at render.ts:841 is gone.** Grep for "Data from Brady/Giglio List, National Police Index, and state POST databases" in src/ returns 0 hits.
2. **Header is data-driven.** New helper `summarizeIntelSources` exists in `render.ts` AND is called by `renderOfficerBackground`.
3. **Empty-data fixture omits Brady label.** Unit test passes asserting header for externalIntel-with-NPI-only fixture does NOT contain "Brady/Giglio" AND does NOT contain "state POST".
4. **Populated-data fixture includes Brady label.** Unit test passes asserting header for externalIntel-with-brady_status='listed' fixture DOES contain "Brady/Giglio".
5. **No regression.** `vitest run tests/lib/officer-render.test.ts` shows ≥10 passes (was 10 before this change), 0 failures.
6. **Type-clean.** `tsc --noEmit` exits 0.
