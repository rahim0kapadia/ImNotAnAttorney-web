# Findings — worry data-orphans tier-B/C (T3–T11)

**Date:** 2026-04-30
**Plan:** `docs/plans/2026-04-30-worry-data-orphans-tier-b-c.md`
**Phase 0 artifacts:**
- `apps/web/data/audit/data-orphans-schema-2026-04-30-tier-bc.json` (5 tables × info_schema)
- `apps/web/data/audit/data-orphans-extras-2026-04-30.json` (legacy phantoms + T5 coverage + classified_opinions quality)
- `apps/web/scripts/diag-data-orphans-schema.mjs` (extended; `--set=tier-bc`)
- `apps/web/scripts/diag-tier-bc-extras.mjs` (one-off probe)

Worktree: `C:\Users\email\projects\ImNotAnAttorney\.claude\worktrees\data-orphans-tier-bc` (branched `origin/master`, branch `feat/data-orphans-tier-bc`).

---

## Phase 0 results — schema reality vs plan assumption

| Plan task | Plan-named table | Reality | Verdict |
|---|---|---|---|
| **T3** | `judge_conflict_of_interest` (match_type='financial') | **Collapse target ABSENT.** Migration `20260421a_judge_conflict_of_interest.sql` is in tree but never applied. `judge_investments` (414,362 rows) IS LIVE — no `disclosure_url` column; only `disclosure_ids ARRAY` of FK refs into `cl_disclosure_investments`. Source-URL retrieval requires JOIN. | Re-scope. Predecessor R0 finding C1 was wrong — phantom-of-phantoms. |
| **T4** | `judge_conflict_of_interest` (match_type='civil_party') | **Collapse target ABSENT.** `judge_civil_party_conflicts` IS LIVE (2,565 rows) with `disclosure_url`, `case_url`, `match_confidence`, `match_type CHECK ('exact','fuzzy','subsidiary','inferred')`. Source-url ready (URL columns directly on table). | Ship. Most viable Tier-B candidate. |
| **T5** | `judge_demographic_sentencing` | Table has 2,937 rows but only **2 distinct judges** (3 race cohorts each = 2,937 ÷ ~3 ÷ ~490 districts isn't right; actual 2 judges × 3 cohorts × multiple districts). Plan threshold (≥30% of cases with judge ≥11/cohort) FAILS at the source: 99.99% of paid INAA cases reference judges absent from this table. JUSTFAIR seed only covered 2 federal judges. | **DEFER.** Data-coverage blocker. Need expanded JUSTFAIR ingest before re-evaluation. |
| **T6** | `classified_opinions` deep slice → X-Ray | 1,462,909 rows, **100% source_urls populated** ✓, 32% holding_text ≥ 40c (464,400), 25% motion_types (365,080), but only **38 rows** with `defense_theories` populated (0.003%). `is_good_law=true` is 100% (filter at ingest). | Ship narrowed: motion_types + holding_text dims. **Drop defense_theories dim entirely** — too thin to surface. |
| **T7** | `resolved_opinion_authorship` standalone | 432,324 rows, 99% high-confidence (427,341 ≥ 0.8). Schema is FK-only (`opinion_id`, `cluster_id`, `judge_canonical_id`, `resolution_method`, `resolution_confidence`). NO source_urls / case_name / surface-able fields. | **Drop standalone.** Use as JOIN partner inside T6 only (LEFT JOIN to surface authorship per opinion). Predecessor pre-R0 already noted this. |
| **T8** | `case_law` legacy | Out-of-scope per user directive (schema-cleanup worry). | — |
| **T9** | `case_law_references` feature flag | Table EXISTS, 0 rows. `verification_url` + `research_source` columns present (no-hallucinated guard available). | **Ship migration.** Single SQL `INSERT INTO feature_flags(flag_key, is_enabled) VALUES ('legal_research_case_law_references_enabled', false)` (matches predecessor R0 finding C6 — flags are DB rows, not static code). |
| **T10** | `entities_officers` + `pji_field_validation` | Out-of-scope per user directive (schema-cleanup worry). | — |
| **T11** | `case_law_applicability` + `verified_case_law` | Out-of-scope per user directive (schema-cleanup worry). | — |

---

## Path-2 scope cut (proposal, R0 swarm to confirm)

Default to ship-velocity per predecessor pattern. Ship the safe subset first.

### SHIP this round

- **T4** — `judge_civil_party_conflicts` → IB. 2,565 rows, source-url native. Match-confidence threshold gate. UPL-safe framing. Most viable Tier-B candidate.
- **T9** — `case_law_references` feature-flag migration. Single SQL line. Disables a UI surface that has nothing to render anyway.

### DEFER with documented blocker

- **T3** — `judge_investments`. Re-scope required: source-URL retrieval needs JOIN to `cl_disclosure_investments` (1.9M rows) or `cl_financial_disclosures` (32K). Defer until JOIN shape designed and tested. New finding overrides predecessor R0 C1's phantom-table claim.
- **T5** — `judge_demographic_sentencing`. Data-coverage blocker. 2 judges in source data ≠ 30% case coverage. Defer until expanded JUSTFAIR ingest. Open follow-up worry: `worry-justfair-coverage-expansion`.
- **T6** — `classified_opinions` X-Ray slice. Defer to next round of this same worry; ship narrowed scope (motion_types + holding_text only, drop defense_theories) once T4+T9 land. Worth the second pass — 1.46M rows × 100% source_urls is the largest unexploited legal-data asset.

### DROP

- **T7** — standalone surface infeasible (no source_urls, FK-only schema). Reuse as T6 JOIN partner inside the next round.

### OUT-OF-SCOPE (per user directive)

- T8, T10, T11 — covered by future schema-cleanup worry.

---

## Cascade — Path-2 ship subset (T4 + T9)

| Node | Specific win |
|---|---|
| Us | Close 1 documented data-orphan (T4) + 1 false-promise UI gate (T9). Two independent shippable units. |
| Direct counterparty (IB buyers $997) | Civil-party conflict signals surface where verifiable — `disclosure_url` + `case_url` per row, no fabrication. |
| Their downstream (defendant + attorney) | Recusal-grounds intelligence becomes usable input to motion strategy. |
| Future-us | T3 + T5 + T6 deferred under documented blockers, not silently dropped. T9's DB-row feature-flag pattern becomes the precedent. |
| Ecosystem | Industry floor rises — products that surface conflict data with verification URLs raise the trust standard. |

No node loses. Cascade-positive.

---

## Open questions for R0 swarm

1. **T4 surface — IB ($997) only, or X-Ray ($2,497) too?** Predecessor inheritance table says IB; April Dunford lens may push civil-party conflicts UP-tier (recusal-grounds = X-Ray Judge Intelligence territory). Reviewer to decide.
2. **T4 match-confidence threshold.** `match_confidence REAL`. What threshold gates a row as surfaceable? `0.85`? `0.9`? `match_type='exact'` only? Code-reviewer to recommend.
3. **T4 UPL-safe phrasing.** "Judge X has financial connection to civil party Y in case Z" — strictly information-side; never directive. April Dunford to lock framing.
4. **T9 feature flag default.** Plan said `is_enabled=false`. With 0 rows in `case_law_references`, is the right default `false` (UI gate disabled until data exists) or removing the surface entirely? Reviewer to confirm.
5. **T6 deferral vs include.** R0 may push to include T6 narrowed (motion_types + holding_text only). 1.46M rows × X-Ray scope justifies inclusion despite scope creep risk.

---

## Hook-or-Harder follow-up

The phantom-of-phantoms cascade (predecessor R0 named a non-existent collapse target as the truth) suggests a hook gap: when a plan cites a table name in scope-defining language, a Phase-0 information_schema verification should be required before plan-edit lock. Defer to a separate "plan-table-verification" worry.
