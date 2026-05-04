# TICKET-3 Substrate Coverage — Motion-Success-by-Judge

**Date:** 2026-05-03
**Ticket:** TICKET-3 — Per-judge motion-success rates for MSR ($197), JRC, X-Ray
**Status:** BLOCKED on substrate (T6-class). No matview shipped.
**Pattern:** Mirrors TICKET-1 PR #293 substrate-doc handoff.

## Customer-feature target (from ticket)

> "Motion to Suppress in front of Judge X: filed 47 times, granted 6 (12.8%). Compare district median 18.4%."

Per-judge numerator/denominator on 8 canonical motion types (Suppress, Dismiss, in Limine, Summary Judgment, Compel, Sever, Discovery, Strike). District-level fallback when judge sample N < 10. Anti-hallucination: every percentage backed by judge_id + motion_type + N + source docket-id list with source URL.

## Substrate findings

Probes (read-only, run from `scripts/`):
- `probe-motion-signal.mjs` — schema + rowcount + 500K signal scan on `cl_docket_entries`
- `probe-motion-success-rowcounts.mjs` — rowcounts + judge-distinct-count probe
- `probe-motion-variance.mjs` — judge-coverage on existing patterns table; outcome-string variance on `classified_opinions`

### Source-of-truth tables

| Table | Rows | Notes |
|---|---|---|
| `cl_dockets` | 71,243,855 | `assigned_to_id bigint` populated. Distinct-judge query timed out at 60s — judge cardinality is large. |
| `cl_docket_entries` | **30** | Empty cache. JIT read-through populated by ImNotAnAttorney-engine `docket-fetcher.mjs` (per migration 20260425a comment). NO bulk load has occurred. Schema: `description text` + `short_description text` present and ready to receive bulk data. |
| `motion_success_patterns` | 1,353 | Already populated, but `judge_id` is NULL on **all 1,353 rows** (with_judge=0). Existing customer-facing data is jurisdiction-level only. |
| `classified_opinions` | 1,462,909 | Has `motion_outcomes jsonb` — 76,896 rows match `granted`, 70,818 match `denied`. Variance present. **No judge column** — cannot bridge to per-judge data. Outcomes are appellate ("affirmed"/"reversed" per sample), not trial-court grant/deny. |

### Why the matview cannot ship today

1. **Trial-court substrate is empty.** The ticket spec — "Motion to Suppress filed 47 times, granted 6" — is a trial-court grant/deny pattern. The only table that could carry that text is `cl_docket_entries.description`. It has 30 rows. No bulk extraction has landed yet. Per ticket pre-flight: "If signal absent ... that's the blocker."

2. **Existing `motion_success_patterns` is judge-blind by row, not by schema.** Schema has `judge_id uuid` already (migration `20260414c`), but every row has `judge_id IS NULL`. The populator (not located in this audit) only writes jurisdiction-level aggregates. Adding a judge pivot to a NULL column doesn't produce the customer feature.

3. **Existing 1,353 rows show data-quality concerns** (deferred to separate worry, not this ticket):
    - Top 5 rows: `motion_type='case_disposition'` (NOT a real motion type).
    - All 5 have `granted_count=0`, `denied_count=filed_count`, `grant_rate=0.0000`.
    - Pattern smells like "every disposition got tagged as a denied motion." This populator should be audited before extending it with judge-pivot logic.

4. **`classified_opinions` is wrong-substrate.** It has motion outcomes with real variance, but:
    - **No judge bridge** (no `judge_id` / `judge_name` column on the table).
    - Outcomes are appellate (`affirmed`, `reversed`) — semantically different from trial-court motion grant/deny.
    - Per T1 PR #293 finding: `is_good_law` uniformly true on this table — populator known to have variance issues.

## Unblock options (cheapest → most expensive)

### Option A — Bulk-load `cl_docket_entries` from CourtListener bulk dump (RECOMMENDED)

CourtListener publishes daily docket-entry bz2 dumps at `https://storage.courtlistener.com/bulk-data/`. The 22-column `cl_dockets` cache shows we already use bulk loads from this source. Per `cl-bulk-data-defensive #19`: "CSV bulk download BEFORE API. Check bulk-download endpoint FIRST."

- **Approach:** New script `scripts/bulk-load-cl-docket-entries.mjs` modeled on `scripts/cl-bulk-loader.mjs`. Uses `bulkCopyCsv` per `pg-bulk-defaults.mjs`. UNLOGGED → COPY → SET LOGGED.
- **Then:** Re-run TICKET-3 build. With ~M-row description text, the winners-pattern matview from the ticket spec becomes shippable.
- **Estimated size:** Federal RECAP docket-entries dump is in the multi-GB bz2 range. Tier-XL workstation can handle.
- **Pre-req:** Run `WebSearch "courtlistener bulk-data docket-entries csv"` to confirm current filename + size before queuing.

### Option B — Audit + repair existing `motion_success_patterns` populator first

Find where the existing 1,353 rows were written. The "case_disposition / 0% grant rate" pattern suggests the populator is mistreating final dispositions as denied motions. Repair the populator, repopulate the table, THEN add judge-pivot column population.

- Avoids needing the bulk dump.
- But: source data is still `classified_opinions` (which has no judge column) so even a repaired populator cannot produce the per-judge numbers TICKET-3 needs.

### Option C — Engine-side opportunistic capture

Modify ImNotAnAttorney-engine's `docket-fetcher.mjs` (per migration comment in `20260425a_cl_docket_entries_cache.sql`) so every customer-driven docket fetch ALSO classifies motions in the entries it pulls. Over time the cache fills.

- Zero bulk-load cost.
- Coverage scales only with paying-customer flow. Cold-start: a judge with zero customers gets no data.
- Strands the JRC and X-Ray product surfaces (which need broad judge coverage from day one).

### Option D — Defer ticket; ship judge-pivot infrastructure with district-only fallback today

Add `judge_id uuid` resolver helper and "district median" calculator to the existing `motion_success_patterns` consumer code. No new data, but the moment substrate lands the matview slots in.

- Zero new data risk.
- Customer-visible value = zero today.

## Recommended unblock

**Option A.** Bulk-load `cl_docket_entries` from CourtListener bz2 dump, then re-open TICKET-3. Same pattern as TICKET-1's recommended unblock (run `scripts/bulk-appeal-outcome-correlator.mjs`). The substrate gap is well-understood and the fix is mechanical.

If Option A's bulk dump is unavailable or excessive, fall back to Option C (engine-side opportunistic capture) and document that JRC/X-Ray motion-success will populate over weeks, not on day one.

## What was NOT done (per ticket "STOP and report")

- No matview migration written.
- No `motion_success_*` table extended.
- No helper at `src/lib/motions/success-rates.ts` written.
- No MSR / JRC / X-Ray wiring.
- No cron-job.org registration.
- No vitest fixtures.

Per ticket Pre-flight step 4: "If `cl_docket_entries.description` is sparse / empty, that's the blocker. STOP."

## Reproduction

```bash
# from worktree root
node scripts/probe-motion-signal.mjs
node scripts/probe-motion-success-rowcounts.mjs
node scripts/probe-motion-variance.mjs
```

All three are read-only. `SET statement_timeout = '60s'` (or 120s on variance) on every probe.

## Files (this PR draft)

- `docs/coverage/2026-05-03-ticket-3-motion-success-substrate.md` (this doc)
- `scripts/probe-motion-signal.mjs` — pre-flight
- `scripts/probe-motion-success-rowcounts.mjs` — rowcount + judge-distinct
- `scripts/probe-motion-variance.mjs` — variance + judge-bridge
