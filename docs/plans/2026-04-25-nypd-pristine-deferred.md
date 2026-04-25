# NYPD Pristine Pass — Deferred Findings (2026-04-25)

Worry-to-pristine cycles W1-W4 returned **58 findings** (13 CRITICAL, 25 WARNING, 20 SUGGESTION). Pristine-Or-Nothing was applied: every finding addressed in scope OR documented here as cross-subsystem out-of-scope with the rationale + future-owner trigger.

## Deferred (cross-subsystem, tracked)

### Loader / migration system

**W1-CRITICAL #2 — Migration replay safety (DROP TABLE IF EXISTS CASCADE)**
- File: `supabase/migrations/20260425a_nypd_ccrb_misconduct.sql:27-30`
- Concern: an operator running `supabase db reset --linked` against prod, or restoring from a backup that drops the migration tracker row, would re-apply this migration and wipe 600K+ loaded rows.
- Why deferred: this is a project-wide migration philosophy concern. Every `CREATE TABLE` migration in the codebase has the same shape. Fixing it on this one migration creates inconsistency without addressing the root concern. Belongs in a sibling-repo migration-policy review (project-wide convention: should DROP TABLE be conditional on UNLOGGED-from-prior-failure-only? guarded by `--i-know-this-deletes-data`?).
- Future trigger: when a migration-policy review opens, this entry guides the change.

**W1-CRITICAL #3 — 4-table atomic load (CTAS swap)**
- File: `scripts/ingest/ingest-nypd-ccrb.mjs`
- Concern: partial load on table-3 crash leaves DB with inconsistent cross-table state.
- Mitigation applied: post-load integrity probe (orphan-rate detection across all 4 tables) — surfaces partial-load failures the morning after rather than weeks later.
- Why CTAS-swap deferred: full atomic-swap pattern (load to `_new`, atomic rename) at 423K-row scale is a significant refactor that changes the INSERT-SELECT contract project-wide. The detection-vs-prevention tradeoff here is reasonable: the integrity probe catches real partial-load events, and the daily refresh is a re-run-safe operation (next-day load reconciles).
- Future trigger: if integrity probe surfaces orphans 2+ days running.

**W1-WARNING #4 — Drop `total_complaints` columns + recompute from join**
- Concern: upstream-aggregated `total_complaints` / `total_substantiated_complaints` on `nypd_officers` may temporarily disagree with `COUNT(*) FROM nypd_allegations WHERE tax_id = X` during partial loads.
- Mitigation applied: `summarizeNypdAllegations` now prefers `officer.total_complaints` (the upstream source of truth) when ≥ join-derived count.
- Why full drop deferred: removing the columns invalidates the matcher's `NypdCandidate` shape and forces a join in every coverage probe. The "single source of truth" principle is right but the cost of the refactor exceeds the benefit at current scale.

**W1-WARNING #5 — Retired officer retention policy**
- Concern: ON CONFLICT DO UPDATE never DELETEs retired officers that fall out of the upstream CSV.
- Why deferred: retention is a domain decision (do we want to render historical reports for officers who retired? CCRB data spans 2000+ so the answer is probably yes — keeping them is a feature). Documenting an implicit "retain forever" policy in the schema is enough until the decision changes.

**W1-SUGGESTION #5 — Drop `nypd_penalties.id BIGSERIAL`, use natural `(complaint_id, tax_id)` PK**
- Concern: BIGSERIAL is gratuitous given the natural unique constraint already exists.
- Why deferred: schema change requires PK rename + every dependent index rebuild + migration coordination. Aesthetic improvement at non-trivial cost.

**W1-SUGGESTION #8 — `data_ingest_runs` observability table**
- Concern: no project-wide record of "did each ingest succeed today, what were the row counts."
- Why deferred: this is a project-wide infrastructure pattern that would touch every loader (CL bulk loader, USSC loader, FJC loader, NRE loader, etc.). The right place to land this is a separate sibling-repo plan that renders the pattern across all ingests, not on the NYPD loader alone.

### Coverage / availability

**W4-CRITICAL #4 — Feature-flag cache staleness across processes**
- File: `src/lib/feature-flags.ts:12`
- Concern: 5-minute in-process cache means `checkOfficerCoverage` and `queryOfficerBackground` can disagree when running in different Vercel lambda instances after a flag flip.
- Why deferred: this is a feature-flag-system-wide concern that affects every flag-gated path in the codebase, not specific to NYPD. The right fix is either (a) flag webhook to invalidate cache, or (b) shared Redis cache. Both are cross-cutting infrastructure changes.
- Mitigation: flag flips are operator-controlled (rare events). Risk window is ≤5 minutes.

**W4-WARNING #4 — AvailabilityChecker form lacks badge/shield input**
- File: `src/components/tier9/AvailabilityChecker.tsx`
- Concern: pre-purchase coverage runs without shield disambiguator; report path uses shield from checkout — pre/post mismatch on common surnames.
- Mitigation applied: coverage probe now mirrors `chooseNypdMatch` contract — when ambiguous, sets `nypdAllegations: 0` and surfaces only the roster count. Pre-purchase no longer promises allegation counts the report won't deliver. The remaining gap (customer doesn't know shield matters until checkout) is UX, not correctness.
- Why full form change deferred: adding an optional shield field is a substantial UI redesign — needs validation rules, error states, server-side echoing, and copy review. The mitigation closes the parity gap; the UX improvement is a separate piece of work.

**W4-WARNING #5 — Telegram exec() command-injection in availability route**
- File: `src/app/api/check-availability/[slug]/route.ts:73-77`
- Why deferred: this is a pre-existing security concern in an unrelated route. The NYPD pristine cycle's scope was the depth integration; this finding belongs in a security-pass triage on the route file.

### Build / test infrastructure

**W2-SUGGESTION #1 — Mapped-type for SELECT vs interface drift**
- Concern: NYPD_*_SELECT strings can drift from `Nypd*Row` interfaces without compile-time detection.
- Why deferred: TypeScript mapped-type approach requires a non-trivial refactor of the `from(...)` / `select(...)` chain across the codebase (CPD has the same shape; pSEO does too). Better landed as a lib-wide PR.

## Applied (in this pass)

The following are addressed in the diff that ships as part of this fix pass — see `nypd-match.ts`, `query.ts`, `render.ts`, `coverage.ts`, `ingest-nypd-ccrb.mjs`, `tests/lib/nypd-match.test.ts`, `tests/lib/coverage.test.ts`, the migration files, and the prod DDL applications:

- W1-C1 CSV header drift validator (caught a real drift in penalties COLUMN_MAPS during this pass)
- W1-C4 Unicode whitespace (NBSP / ZWSP / BOM) + NULL-token list ('NULL', 'N/A', 'None', 'null') in cast pipeline
- W1-C5 Date overflow guard for YYYYMMDD branch + post-load NULL-rate canary
- W1-W1 Post-load cross-table orphan-rate integrity probe
- W1-W2 Per-loader `application_name` for pg_stat_activity diagnosability
- W1-W3 `quoteIdent` length + NUL validation
- W1-W5 Atomic-rename download (`.tmp` → final) + 0-byte CSV refusal + 15-min fetch timeout
- W1-W6 NULL-token collapse in trim
- W1-W7 Partial index for `nypd_allegations.tax_id WHERE tax_id IS NOT NULL` (applied to prod)
- W1-W9 ON CONFLICT DO NOTHING for flag migration (CPD parity)
- W1-S1 Atomic-rename download
- W1-S2 Fetch timeout
- W1-S3 Post-load row-count canary (NULL-rate threshold)
- W1-S6 SUGGESTION (cast Map refactor) — partially: cast logic now reuses NOT_NULL_GUARDS + columnMap lookup
- W2-C1/C2/C3 `classifyNypdSignal` + non-NYPD agency suppression + thin-confidence downgrade for state-fallback / firstName-empty single matches
- W2-C4 Render caveat broadened to categorical phrasing (any non-NYPD NY agency including municipal PDs, sheriffs, NYS Police, MTA, Port Authority, etc.) + only renders under state-fallback routing
- W2-W1 normalizeShield zero-pads to 6 chars so leading-zero variants compare equal
- W2-W1b chooseNypdMatch runs shield filter BEFORE single-candidate short-circuit
- W2-W2 Compound surname prefix list (St, Van, De, La, Mc, Mac, O, Da, Di, Du, San, Santa, El, Al, Saint, Del, Dela, Le, Von) in parseNypdName
- W2-W3 isNypdSubstantiated allowlist (9 verified variants from prod) + prefix fallback w/ correct trailing-space discriminator
- W2-W4 `summarizeNypdAllegations` accepts `officerTotalComplaints` for headline truth
- W2-W5 `truncated` flag propagates from fetch to render → "20+" display
- W2-W6/W7 Tests added for thin-single-match + state-fallback caveat + compound surnames + shield leading-zero parity
- W2-S2 City-of-New-York agency variants
- W2-S3/S4 Control char sanitization in escapeIlike + parseNypdName
- W2-S5 Placeholder no-op test removed; real escape-related tests added
- W3-W1 Truth-in-headers parity: zero-allegation single-match cites only roster source, not allegations
- W3-W2 Test for above truth-in-headers parity
- W3-W3 "If this officer serves" → "Where this officer serves" (operational present-tense)
- W3-W4 "released after 2020 §50-a repeal" → "comprehensive disclosure following the June 2020 §50-a repeal"
- W3-S1 Allegations-vs-penalties units footnote when allegations present
- W3-S2 (skip — no behavior change needed)
- W3-S3 Test gap closed by test for state-fallback caveat + truncated count + zero-allegation footer
- W4-C1 Coverage probe shares chooseNypdMatch contract — no allegation sum on ambiguous
- W4-C2 Coverage label semantics aligned with matcher exact-match shape
- W4-C3 limit(20) population bug closed via `truncated` propagation + ambiguous-on-truncation
- W4-W1 Roster-only match enables `available: true` (transparent: customer sees what they get)
- W4-W2 Labels updated: "officer roster matches" + "allegations on the matched officer"
- W4-W3 Apostrophe path: parseNypdName + escapeIlike together preserve the literal apostrophe; supabase-js URL-encodes it; verified safe
- W4-S1 New `tests/lib/coverage.test.ts` covers the 7 parity cases
- W4-S2 (skip — refactor of state branching deferred until 4th jurisdiction)

## Verification

- 67/67 vitest tests pass
- `scripts/verify-officer-render-nypd.mjs` returns clean against the 3 top-substantiated officers
- Loader re-runs under the new validator + canary + integrity-probe pipeline; CSV header drift caught at write-time, NULL rates within thresholds, zero cross-table orphans
