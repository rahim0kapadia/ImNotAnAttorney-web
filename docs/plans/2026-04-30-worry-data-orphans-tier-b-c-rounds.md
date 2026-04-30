# Round Log — worry data-orphans tier-B/C

**Plan:** `docs/plans/2026-04-30-worry-data-orphans-tier-b-c.md`
**Findings:** `docs/plans/2026-04-30-worry-data-orphans-tier-b-c-findings.md`
**Worktree:** `C:\Users\email\projects\ImNotAnAttorney\.claude\worktrees\data-orphans-tier-bc` (off origin/master, branch `feat/data-orphans-tier-bc`)

---

## Phase 0 — schema verification (2026-04-30)

Extended `apps/web/scripts/diag-data-orphans-schema.mjs` with `--set=tier-bc` and a `--set=tier-a|both` switch. Added one-off `apps/web/scripts/diag-tier-bc-extras.mjs` and `apps/web/scripts/diag-judge-resolver.mjs` to fill gaps surfaced by the first probe.

Outputs (in `apps/web/data/audit/`, gitignored):
- `data-orphans-schema-2026-04-30-tier-bc.json` — 5 tables × info_schema
- `data-orphans-extras-2026-04-30.json` — phantom-target verification + T5 cohort coverage + classified_opinions quality
- `data-orphans-judge-resolver-2026-04-30.json` — entities_judges resolver shape + jcpc match-class distribution + feature_flags state

**Six high-impact verified findings — see findings doc for full table.** Headlines:
1. `judge_conflict_of_interest` (predecessor's R0 collapse target) **does not exist** in the live DB. Migration in tree but never applied. Phantom-of-phantoms.
2. `judge_investments` (414,362 rows) AND `judge_civil_party_conflicts` (2,565 rows) are **both LIVE**. Predecessor R0 finding C1 was wrong about the collapse.
3. `judge_civil_party_conflicts` is unexpectedly clean: **100% `match_type='exact'`**, **100% both URLs populated** (disclosure_url + case_url), 439 distinct judges. The predicted UPL/defamation surface area collapsed to "all rows pass the strictest gate."
4. `judge_demographic_sentencing` has 2,937 rows but only **2 distinct judges**. Coverage gap is catastrophic for the original T5 hypothesis (>30% case coverage).
5. `classified_opinions`: 1,462,909 rows, **100% source_urls populated**, 100% `is_good_law=true`, 32% holding_text ≥40c, 25% motion_types, **0.003% defense_theories** (38 rows out of 1.46M).
6. `case_law_references` exists with `verification_url` + `research_source` columns, **0 rows**. Empty surface; flag-gate viable.

---

## Round 0 — plan-swarm review (2026-04-30, three reviewers in parallel)

Reviewers (all `model: opus`):
- `code-reviewer` (column shapes, migration shape, no-hallucinated guards, diag-script soundness)
- `security-auditor` (no-hallucinated row guards, tier leak, defamation, RLS, env-parser)
- `april-dunford` (5-Component Canvas, multi-product fit, UPL framing, cannibalization)

**Findings counts (raw):**

| Reviewer | Total | CRITICAL | WARNING | SUGGESTION |
|---|---|---|---|---|
| code-reviewer | 12 | 5 | 6 | 1 |
| security-auditor | 10 | 3 | 5 | 2 |
| april-dunford | 8 | 3 | 4 | 1 |
| **TOTAL** | **30** | **11** | **15** | **4** |

All three verdicts: **revise-and-rerun**.

**Convergence-health gates (G1–G8):** R0 — no prior round to compare. None fire. Clean baseline.

### Cross-reviewer convergent CRITICALs

1. **C1 — Plan body still cites the phantom collapse target.** Inherited-tasks table (lines 19–21) names `judge_conflict_of_interest` for T3/T4. Phase 0 falsified this. Plan must re-write rows to point at the live tables (`judge_investments`, `judge_civil_party_conflicts`) and add a one-line "Phase 0 verdict: PHANTOM" footnote.
2. **Match-confidence + match_type gate (C5 + S1 + D3 converge).** All three independently land on `match_type IN ('exact','subsidiary') AND match_confidence ≥ 0.90` as the public-render floor. Phase 0.5 made this safer than feared: 100% of jcpc rows are `match_type='exact'`. The gate still ships as defense-in-depth against future ingest drift. D3 added a phrasing matrix banded by match_type — locked for a future round if/when fuzzy/inferred rows appear.
3. **Per-row source-URL guard (C4 + S2 converge).** Both URLs (disclosure_url AND case_url) must be non-NULL non-empty AND HTTPS-prefixed. Two-layer enforcement: SQL filter + render-time skip. Phase 0.5 verified 100% jcpc rows pass — but defense-in-depth still mandatory.
4. **T9 migration shape (C2 + S7 + S8 converge).** 3-col `(flag_key, is_enabled, description)` + `ON CONFLICT (flag_key) DO NOTHING`, idempotent. S7's RLS-explicit demand verified by Phase 0.5 (`feature_flags`: RLS=true, 0 policies = default-deny). S8's tenant prefix adopted: `inaa_legal_research_case_law_references_enabled`.
5. **T4 surface DENY enumeration (S3).** Plan must explicitly forbid Case Decoder ($197) and playbooks ($97) from rendering jcpc data. Sub-tier upsell callouts banned by name. (D1 reinforces tier placement to IB; C3 disagreed and pushed X-Ray — synthesized: T4 → IB primary; per `product-tiers.md` canonical promise "Judge intel + accountability research." C3 cited migration COMMENT, which is non-canonical. D2 raised cannibalization with $197 Judge Report Card "Recusal Grounds" — needs `product-tiers.md` slice clarification before T4 ships.)
6. **T9 surface fate (D6).** Pure feature-flag row without enforcement = predecessor R0 finding C6 anti-pattern. Either flag the surface AT 3 read sites OR rip the surface entirely. Decision: flag-and-gate. Cleaner because both customer-facing surfaces (my-case portal + operator inbox + generate-report Edge Function) ALREADY tolerate empty results; adding the gate is a one-`if`-wrapper per site, no surface removal.

### Cross-reviewer convergent WARNINGs (folded in)

- **C6 — `cases.judge_canonical_id` does not exist.** T4 needs an `entities_judges` resolver. Phase 0.5 verified `entities_judges` exists (20,507 rows, columns `canonical_id` + `name_first`/`name_last`). Resolver writable. Not a blocker — but the resolver itself is unimplemented in apps/web today; counts as Phase 5 work to be specced.
- **C8 — T7 ships inline as T6 LEFT JOIN partner**, not "deferred." (Becomes moot under Path-2a, see scope cut below.)
- **C9 — T3 deferral keeps a JOIN-shape pin.** `JOIN cl_financial_disclosures fd ON fd.id = ANY(ji.disclosure_ids)` to recover disclosure URLs.
- **C10 — diag-script `countCandidates` missing `total_cases`.** Patched.
- **C11 — Plan §"Phase 0 — pre-R0 verification gates" stale.** Mark COMPLETE; strike the T5-UPL pre-pitch (T5 deferred upstream).
- **D2 — $197 Judge Report Card vs $997 IB cannibalization.** `product-tiers.md` lists Recusal Grounds nowhere on the $197 SKU; the migration comment (which is non-canonical) implied otherwise. Recommend Option A: Report Card = STATISTICAL-only; IB owns ALL relational/conflict intel. Out of scope for this code session (brand-doc change).
- **D3 — match_type phrasing matrix.** Locked but unused this round (100% rows are `exact`).
- **D4 — methodology footer ("checked / not found" state) for T4 + future T6.**
- **D7 — T5 stays silent in copy until JUSTFAIR ingest expands.**
- **S4 — `data/audit/` already in `apps/web/.gitignore`** (line 2). No-op fix.
- **S5 — diag-script log message hardening.** Low-risk; deferred.
- **S6 — env-parser hardening.** Already follows `cl-bulk-data-defensive` `.split("=").slice(1).join("=")` pattern in extras + resolver scripts. The canonical `diag-data-orphans-schema.mjs` predates this rule; one-line follow-up.
- **S9, S10 — T4 framing constraints + render-time HTTPS guard.**
- **D8, C12 — methodology footer + cascade mapping for any T6 ship.**

---

## Path-2a scope cut (2026-04-30, post-R0)

R0 produced **11 CRITICAL findings, 7 of which require multi-system coordination** — `product-tiers.md` rewrite (D2), UPL phrasing matrix authoring (D3), DENY enumeration (S3), `entities_judges` resolver implementation (C6), tier placement lock (D1 vs C3 disagreement), methodology-footer copy (D4), framing constraints (S9). Most are brand judgment + multi-file authoring, not single-session code work.

Per `pattern-worry-path-2-scope-cut.md`: when R0 returns ≥30 findings with ≥5 CRITICALs incl. structural items, path-2 (cut + accept R1+fixes as Phase 5 guardrails) ships faster without violating Pristine-or-Nothing.

**Path-2a chosen: ship T9 only this round.** T4 + T6 + T7 stack into a follow-up plan with all R0 findings as inheritable guardrails.

| Task | Path-2a verdict | Reason |
|---|---|---|
| T3 | DEFER | needs JOIN to `cl_financial_disclosures`; JOIN shape pinned in findings doc |
| T4 | DEFER | needs resolver (C6) + tier-doc rewrite (D2) + UPL phrasing matrix (D3) + DENY enum (S3) |
| T5 | DEFER | data-coverage blocker (2 judges only) |
| T6 | DEFER | tier-distinct review of motion_types render still owed; T7 inline JOIN partners with it |
| T7 | DEFER | join-only; ships with T6 |
| T8 | OUT-OF-SCOPE | schema-cleanup worry per user directive |
| **T9** | **SHIP** | empty table + RLS-default-deny verified; flag + 3-site gate fits one PR |
| T10 | OUT-OF-SCOPE | schema-cleanup worry per user directive |
| T11 | OUT-OF-SCOPE | schema-cleanup worry per user directive |

### CASCADE (Path-2a ship subset = T9 only)

| Node | Specific win |
|---|---|
| Us (INAA) | Close 1 false-promise UI gate without spawning multi-doc dependency. Three CR/SA/AD CRITICAL findings (C2/S7/S8) addressed in one migration. |
| Direct counterparty (paid IB/X-Ray buyers) | No change to behavior today (table empty); future post-ingest activation gated by an explicit operator flip — no surprise data surfaces. |
| Their downstream | Same — no surprise content in defendant-facing reports until ingest verifies non-empty + URL-bearing rows. |
| Future-us | Path forward for T4 (resolver + tier-doc + UPL matrix) is fully written down in this rounds doc; next session can proceed without re-deriving. |
| Ecosystem | Tenant-prefix flag-key precedent (`inaa_*`) addresses the shared-DB tenant-isolation concern (S8) early — adopted before any multi-tenant collision. |

No node loses. Cascade-positive.

---

## R0 fixes applied this round

- **T9 migration written** at `apps/web/supabase/migrations/20260430a_case_law_references_flag.sql` — 3-col + ON CONFLICT, prefixed `inaa_*`, default `false`, full doc-block citing R0 findings.
- **3 read sites gated** behind `isFeatureEnabled('inaa_legal_research_case_law_references_enabled')`:
  - `apps/web/src/app/my-case/[token]/page.tsx` (citation count Promise.all branch)
  - `apps/web/src/app/api/operator/cases/[id]/route.ts` (operator citation list Promise.all branch)
  - `apps/web/supabase/functions/generate-report/index.ts` (Edge Function `feature_flags` direct lookup, since `lib/feature-flags.ts` is Node-only)
- **C10 fix** applied to `apps/web/scripts/diag-data-orphans-schema.mjs` — `total_cases` added to `countCandidates`, listed first.
- **Plan + findings docs** updated to reflect Phase 0 schema reality + R0 outcomes.

## Deferred to follow-up worry `worry-data-orphans-tier-b-c-r2`

Open items for the stacked successor plan:
- T3 + T4 + T5 + T6 + T7 (per Path-2a table)
- D2 — `product-tiers.md` slice rewrite (Judge Report Card $197 vs IB $997 conflict-intel boundary)
- D3 — UPL phrasing matrix in `atti-persona.md` for match_type bands (only relevant when fuzzy/subsidiary/inferred rows arrive)
- C6 — `entities_judges` resolver implementation (`resolveJudgeCanonicalIdByName(first, last) → uuid | null`)
- D4 — methodology footer pattern for T4/T6 render
- D8 — methodology component spec
- S5 — diag-script log message hardening
- S6 — `diag-data-orphans-schema.mjs` env-parser hardening
- C12 — cascade row for T6 if/when shipped
- S9, S10 — T4 framing constraints + render-time HTTPS guard helper
