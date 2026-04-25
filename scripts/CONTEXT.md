# Scripts, scripts/

> 220+ utility scripts across 11 categories: infrastructure setup, validation, legal research, charge taxonomy, Tier 9 data pipeline (judge/officer/sentencing analytics), external data ingestion, E2E testing, backfills/fixes, diagnostics, content/marketing, and one-off task appliers. Bulk-loaders (CL / USSC / FJC / Vera / JUSTFAIR / PJI / SCOTUS / open-policing / FARS / DPIC / attorney-discipline), judge-fingerprint v3 builders, Phase 2 matview refresh, tier-ladder retroactive-regen, and derivation pipelines are all catalogued below or in ARCHITECTURE.md Component Map Scripts row.

## Script Inventory

### Infrastructure & Setup
| File | Purpose |
|------|---------|
| `setup-cronjob-org.js` | Registers cron-job.org jobs for Vercel routes (drip, batch-poller, reconcile). Saves IDs to `cronjob-org-ids.json` |
| `setup-blog-pipeline-crons.js` | Registers cron-job.org jobs for blog pipeline (generation, QA, publish, demand). Saves IDs to `blog-pipeline-cron-ids.json` |
| `setup-storage-and-seed.mjs` | Creates `charge-packs` storage bucket, uploads all 8 playbook PDFs, upserts `charge_packs` rows. Options: `, skip-upload`, `, skip-seed`, `, dry-run` |
| `setup-demand-feedback-crons.js` | Registers demand-feedback-score + demand-feedback-patterns cron-job.org jobs (weekly Sundays) |
| `setup-durable-rate-limit.mjs` | Provisions Upstash Redis DB + writes URL/TOKEN/DURABLE_RL_PROVIDER envs to Vercel prod |
| `apply-pending-sql.mjs` | Ad-hoc SQL applier via Supabase Management API. Takes filepath arg. Used for quick DB fixes outside migration flow |
| `apply-enrichment-batches.mjs` | Applies enrichment UPDATE statements in batches of 100 (avoids Management API 413 payload limit) |
| `apply-migration-20260417a.mjs` | Applies `20260417a_partner_check_in_enabled.sql` via direct Postgres; verifies distribution invariant |
| `apply-migration-20260417b.mjs` | Applies `20260417b_partner_events_schedule_denial.sql` (widens event_type CHECK) |
| `apply-migration-20260418a.mjs` | Applies abandoned_questions + content_gaps_open_partial_unique migrations via session-mode pg |
| `apply-migration-20260419b.mjs` | Applies `20260419b_partner_peer_benchmark.sql` (creates benchmark function) |
| `apply-migration-20260419c.mjs` | Applies `20260419c_partner_peer_benchmark_revoke_authenticated.sql` (revokes EXECUTE from authenticated) |
| `apply-migration-20260419d.mjs` | Applies `20260419d_posted_answers.sql` (CREATE TABLE + increment function) |
| `apply-migration-20260419e.mjs` | Applies `20260419e_posted_answers_updated_at.sql` (adds updated_at trigger) |
| `apply-migration-20260420b.mjs` | Applies `20260420b_posted_answers_fixups.sql` with exitCode-not-exit pattern for pool cleanup |
| `apply-migration-20260420c.mjs` | Applies `20260420c_partner_branding_hardening.sql` via direct Postgres |
| `apply-motion-data-rest.mjs` | Applies cached motion-extraction results from `data/bulk-verify/motion-extraction-results.json` via PostgREST additive merge |
| `apply-partners-source-migration.mjs` | Applies `20260415d_partners_source_column.sql`; verifies source column + backfill count |
| `apply-sms-suspensions-migration.mjs` | Applies `20260415b_sms_suspensions.sql` (idempotent via IF NOT EXISTS) |
| `apply-sms-suspensions-rls.mjs` | Applies `20260415c_sms_suspensions_rls.sql`; verifies RLS is enabled |
| `register-resend-bounce-webhook.mjs` | Registers bounce/complaint webhook on Resend; returns signing_secret for RESEND_WEBHOOK_SECRET env |
| `register-sms-health-check-cron.mjs` | Registers `/api/cron/sms-health-check` on cron-job.org (daily 10:00 UTC) |
| `register-dpic-sync-cron.mjs` | Registers `/api/cron/dpic-sync` on cron-job.org (weekly Monday 13:00 UTC, after DPIC's noon ET weekday refresh) |
| `update-vercel-env.mjs` | Sets a single Vercel env var on the production `imnotanattorney` project (bypasses stale `.env.local` project ref) |

### Test-Data Isolation (2026-04-24)
| File | Purpose |
|------|---------|
| `lib/test-db.mjs` | Transactional test-fixture helper (Leach pattern): `withTestTx(fn)` opens BEGIN on port 5432, issues `SET LOCAL session_replication_role = replica`, runs callback, ROLLBACK in finally. Factories (`createTestOrder`, `createTestCase`, `createTestIntake`, `createTestSubscriber`, `createTestDripEmail`) use raw pg INSERTs via tx arg. `newTestRunId(tables)` writes marker file at call time for reaper. Module-load self-test. See `docs/plans/2026-04-24-worry-test-pollution-cv.md` T1. |
| `lib/test-db.test.mjs` | Node --test suite for test-db.mjs: rollback-on-return, rollback-on-error, marker file at call time, parallel-safety (MVCC isolation), SQL-injection fragment rolls back cleanly, factory smoke. |
| `lib/reap-test-runs.mjs` | Storage gardener for `test_run_id`-tagged rows. Reads OS temp markers, DELETEs tagged rows in 8 in-scope tables, unlinks markers. Skips markers <60s old; unlinks (no DELETE) markers >30d old. Run on cadence. T1a of plan. |
| `diag-test-pollution-status.mjs` | Read-only audit. Inspects hook warning log buckets + marker-path coverage per in-scope table. Invoke on day 3 + 6 of `enforce-test-isolation.js` DRY_RUN window. T7a. |

### Validation & Linting
| File | Purpose |
|------|---------|
| `check-tiers.mjs` | Verifies tier names/prices in `src/lib/tiers.ts` match across docs (CLAUDE.md, PRD, SERVICES). Catches pricing drift |
| `inspect-motion-schemas.mjs` | One-shot helper used during M1 build; introspects `motion_outcome_rates` family column shapes via supabase-js |
| `smoke-motion-success-report.mjs` | End-to-end smoke test for M1 Motion Success Report $197 SKU: exercises query + render against prod data |
| `generate-session-handoff.mjs` | Assembles session handoff markdown from git log + MEMORY.md + recent PR list |
| `brand-voice-scan.mjs` | Heuristic flagger for partner-surface copy. Outputs ranked candidates with file:line references. 10 rules (6 hard, 4 soft) per `.claude/rules/brand-voice.md` + `no-hallucinated-legal-data.md`. Never rewrites. Usage: `node scripts/brand-voice-scan.mjs` or `--json` for tooling. Exits 0 regardless of findings; exit 2 on tool error |
| `audit-charge-coverage.mjs` | Aggregates charge-type coverage across jurisdiction_statutes candidate slugs (drug, assault, DV, etc.) |
| `audit-w3-upl.mjs` | Seeds fake orders for 5 HIGH-UPL products, polls generate-standalone, downloads HTML to `data/w3-audit/` for manual review |
| `check-price-staleness.mjs` | Validates every `// anchor:SLUG` in src/ references a dollar value >= canonical tiers.ts price; checks playbook totalValue sums |
| `check-partner-envs.mjs` | Queries `/api/admin/env-presence` and pretty-prints partner env var status on the deploy |
| `check-missing-crons.mjs` | Checks cron-job.org for partner-cleanup + court-reminders registrations |
| `validate-gold-set.mjs` | Phase 0B GO/NO-GO gate: runs mechanical-extractor on 200 opinions vs human labels; demands 90%+ field agreement |
| `validate-matrix.mjs` | Validates product-matrix.ts slugs against products.ts + tiers.ts (catches drift) |
| `verify-checkin-cron.mjs` | Verifies cron-job.org registration for check-in-prompt cron job |
| `verify-checkin-integration.mjs` | Task 9 Step 4 integration test: creates test court_reminder, verifies cron query logic + idempotency |
| `verify-officer-render-ca-ga.mjs` | Mirrors queryOfficerBackground() for CA+GA; asserts npi_employment_history shape matches render preconditions |
| `verify-resend-webhook-e2e.mjs` | Layer 2 E2E: Svix-signs a bounce webhook, POSTs to prod, asserts phone now suspended, cleans up |
| `verify-resend-webhook.mjs` | Verifies RESEND_WEBHOOK_SECRET set + webhook registered + subscribed to bounced/complained events |
| `verify-tasks-applied.mjs` | Verifies Task 1-3 (enrichment + CAP verification + CL URLs) applied correctly via Management API |

### Diagnostic & Inspection
| File | Purpose |
|------|---------|
| `diagnose-content-gaps-dups.mjs` | Inspects content_gaps status CHECK constraint + dup distribution pre-consolidation |
| `check-posted-answers-state.mjs` | Inspects posted_answers columns, moderation_status CHECK, and function ACL post-migration |
| `inspect-ga-officer-intel.mjs` | Samples officer_external_intel by sources for GA (npi/brady/decertified coverage) |
| `inspect-authority-schemas.mjs` | One-shot live-schema inspector for the 4 tables backing the $97 Charge Authority Pack — dumps column shapes + sample rows via supabase-js |
| `sanity-bondsman-modes.mjs` | Pre-migration sanity: confirms zero non-bondsman partners own check-ins |
| `score-observations-index.mjs` | Scans `src/lib/score.ts`, emits `docs/audits/2026-04-24-score-observations-line-index.json` indexing every observation-string return site with charge-branch / attorney-state / time-window context (Hagan A2J UPL audit methodology) |

### Report Generation
| File | Purpose |
|------|---------|
| `generate-worker.mjs` | Backup Case Decoder generator. Picks up cases stuck in `generating` > 3 min (Edge Function timeout). Calls Opus 4.6, renders HTML, evaluates UPL, emails operator |

### Legal Research Pipeline
| File | Purpose |
|------|---------|
| `load-jurisdiction-data.mjs` | Loads jurisdiction statute JSONs from `data/charge-taxonomy/` into Supabase `jurisdiction_statutes` table. Single state or all states |
| `legal-research-fl.mjs` | FL statute verification: validates on FL Online Sunshine, searches CourtListener for citing case law, updates `source_urls` + `confidence_score`. Rate-limited 2s/request |
| `legal-research-all.mjs` | All-state statute verification: FL via Online Sunshine, federal via Cornell LII, other states via Justia URL + CourtListener case law. Rate-limited 1.5s/request. Supports single jurisdiction, single statute, dry-run, summary modes |
| `classify-case-law.mjs` | Case law classifier: fetches CourtListener opinions, extracts outcome, classifies DEFENSE/PROSECUTION/NEUTRAL, determines binding authority. Rate-limited 750ms/request |
| `generate-case-law-enrichment.ts` | Enrichment generator: creates missing-state jurisdiction data (ID, SC) and prosecution/defense strategic analysis. NEVER generates case law (see `no-hallucinated-legal-data`). Commands: `, missing-states`, `, enrich,all`, `, full,all`, `, build-migration`, `, validate`, `, stats`, `, dry-run` |
| `scrub-enrichment-citations.mjs` | Safety scrubber: DELETES enrichment items containing case citations (`X v. Y`), inline pinpoint statute section refs, or `[verify with attorney]` placeholders. Leaves general legal concepts intact |
| `generate-charge-enrichment-de-hi-id-md-sc.mjs` | Scrub-safe enrichment JSON generator for DE/HI/ID/MD/SC, pre-filters known banned patterns (case names, `§` refs, state code prefixes, article cites) before writing |
| `validate-enrichment-de-hi-id-md-sc.mjs` | Validator for DE/HI/ID/MD/SC enrichment files, every source slug has an entry, 3-5 items per array, no scrub-triggering content |
| `run-full-pipeline.mjs` | Full charge taxonomy + case law pipeline runner (outside Claude Code). Steps: load jurisdiction data → verify statutes → classify cases. ZERO Claude tokens. Flags: `, skip-load`, `, skip-verify`, `, classify-limit N`. ~6-12 hours end-to-end |
| `pipeline-status.mjs` | Read-only progress monitor for the verification pipeline. `, watch` refreshes every 30s |
| `fix-orphan-slugs.mjs` | One-time remapper: remaps non-standard charge slugs to canonical COMMON_CHARGES slugs across all jurisdiction JSONs. Delete after use |
| `add-reference-urls.mjs` | Appends cross-reference URLs (Justia, Google Scholar, CourtListener search) to `statute_case_law.source_urls[]` from citation patterns. Does not fetch, stores for manual verification. `, limit`, `, dry-run` |
| `verify-statutes-openstates.mjs` | Verifies unverified statutes against OpenStates API (all 50 states). Appends OpenStates URL to `source_urls[]` and bumps `confidence_score`. Free tier 500 req/day. `, limit`, `, jurisdiction`, `, dry-run` |
| `verify-via-cap.mjs` | Verifies case law against Harvard CAP static archive (6.7M cases, 1658–2018). Appends CAP URL to `source_urls[]`; deletes unverifiable rows with no CourtListener cluster. `, limit`, `, dry-run` |
| `verify-via-cornell-scotus.mjs` | Verifies SCOTUS cases via Cornell LII HEAD checks. Appends URL to `source_urls[]`; deletes unverifiable rows. Rate-limited 1s/request. `, limit`, `, dry-run` |
| `verify-via-courtlistener-citation.mjs` | Verifies case law via CourtListener `/citation-lookup/` POST endpoint. Stores `cluster_id` + URL; deletes unverifiable rows. Rate-limited 1.5s/request. `, limit`, `, dry-run` |
| `bulk-dump-cases.mjs` | Exports all `statute_case_law` rows to local JSON via single Supabase Management API query. Writes to `data/bulk-verify/`. `, output` |
| `bulk-download-cap.mjs` | Downloads needed CAP CasesMetadata.json volumes from `static.case.law` to `.cap-cache/`. Parses citations from dump JSON, deduplicates. `, dry-run`, `, concurrency N` |
| `bulk-verify-cases.mjs` | Matches citations against local CAP cache, generates + batch-applies SQL updates. Marks unverifiable as `NOT_IN_DB` (safer than delete for bulk). Zero API calls during verify. `, dry-run` |
| `bulk-add-reference-urls.mjs` | True-bulk `UPDATE ... FROM (VALUES)` variant of add-reference-urls (Justia/Scholar/CL/FindLaw URL append); ~5x faster |
| `bulk-verify-courtlistener.mjs` | Marks CL-tracked cases with source URLs + validation_level=VALID_MODERATE (no download needed) |
| `bulk-is-good-law.mjs` | Zero-citation fast path: rows with citation_count=0 in CL clusters CSV → is_good_law=true (no API calls) |
| `bulk-good-law-by-cluster.mjs` | Per-cluster is_good_law verification (4x fewer CL API calls than row-by-row) |
| `bulk-good-law-from-graph.mjs` | 4-phase Lissner/FLP pattern: cluster→opinion map → citing graph → citing texts → negative-treatment scan |
| `run-full-good-law-pipeline.mjs` | Sequential runner: dump → 4 graph phases → reference URLs; walk-away execution |
| `bulk-classify-cases.mjs` | Streams CL clusters CSV (2.3 GB bzip2) for party_side DEFENSE/PROSECUTION/NEUTRAL classification (zero API) |
| `bulk-classify-from-opinions.mjs` | Streams 50 GB opinions CSV, classifies party_side/outcome/holding_excerpt/key_quote/application per cluster |
| `bulk-classify-from-csv.mjs` | Streams pre-filtered opinions CSV (10,839 records), runs mechanical + cross-validation; upserts classified_opinions |
| `bulk-classify-full-corpus.mjs` | Full 50 GB opinions stream, criminal filter + mechanical extraction; targets 100K-500K classified_opinions rows |
| `classify-existing-opinions.mjs` | Classifies existing 3,407 case_law rows via mechanical-extractor + cross-validator → classified_opinions |

#### Citation Verification, Offline vs Runtime

The web pipeline does **NOT** verify citations at runtime. All citation verification happens **offline** through the scripts above before anything ships to a customer:

1. `legal-research-all.mjs` searches CourtListener for real cases citing each statute and populates `statute_case_law` with verified rows (`case_name`, `citation`, `court`, `year`, `holding`, `courtlistener_cluster_id`, `source_urls`).
2. `classify-case-law.mjs` fetches actual opinion text from CourtListener, classifies each case as DEFENSE / PROSECUTION / NEUTRAL, then runs `checkNegativeTreatment()` against the CourtListener citing-opinions endpoint to set `is_good_law`, cases that have been overruled or negatively treated are flagged.

The `generate-report` Edge Function only **filters** on `statute_case_law.is_good_law=eq.true`, it does not verify Claude-generated citations against any live source. If a case is not in the table with `is_good_law=true`, it never appears in a report.

The full multi-source verification cascade (Harvard CAP, GovInfo, eCFR, Cornell LII statutes) lives in the engine repo at `ImNotAnAttorney-engine/integrations/legal-verifier.mjs`, not in this web repo. Web only consumes the already-verified rows.

**Why this split matters:** Per the project's `no-hallucinated-legal-data` rule, any case citation that ships to a defendant must have a stored `source_urls[]` pointing at the opinion we actually read. The offline scripts enforce that invariant at write time; runtime reads can trust the flag.

### Charge Taxonomy
| File | Purpose |
|------|---------|
| `generate-charge-taxonomy.ts` | Claude API calls for all 52 jurisdictions. Commands: `, all`, `, jurisdiction FL`, `, questions`, `, validate`, `, dry-run` |
| `build-seed-migration.ts` | Builds migration 029 SQL from COMMON_CHARGES + questions.json + jurisdiction JSONs |
| `backfill-charge-slugs.mjs` | Backfills case_feature_vectors.charge_slug via jurisdiction_statute_id FK (fixes NULL-slug similar-case 0-results bug) |
| `generate-state-charge-data.mjs` | Generates state charge law TS files (drug/assault/theft/etc.) from curated jurisdiction_statutes |
| `bulk-extract-charge-types.mjs` | Focused counterpart to bulk-classify-full-corpus: extracts only charge_types on pre-filtered criminal CSV |
| `seed-charge-defense-theories.mjs` | Seeds charge_defense_theories from `data/defense-intelligence/charge-defense-theories.json` |
| `pull-dui-all-states.mjs` | Pulls DUI/DWI opinions from CL search API for all 50 states → case_feature_vectors charge_slug=dui |
| `pull-all-charges-all-states.mjs` | Extends pull-dui across all supported charge types (drug, assault, theft, etc.) per state |
| `promote-to-engine-tier.mjs` | Copies verified good-law rows from statute_case_law → engine-tier case_law + case_law_references + verified_case_law |

### Tier 9 Data Pipeline
> Populates analytics tables that back Tier 9 standalone SKUs: Judge Report Card ($197), Officer Background Check ($97), Similar Cases Analyzer ($297), Federal Sentencing Distribution ($297), plus War Room / Situation Room consumers. Streams CourtListener bulk data (50 GB opinions CSV, 2.3 GB clusters, 522 MB citations) locally — zero API cost after initial download.

| File | Purpose |
|------|---------|
| `pipeline-runner.mjs` | Sequential Tier 9 runner: bulk-master-extractor → appeal-correlator (4 phases) → similar-case-matcher |
| `bulk-master-extractor.mjs` | Single-pass 50 GB opinions CSV: populates 8 tables (judge_quotes, sentencing_distributions, officer_reliability, pairings, bench_jury_divergence, co_defendant_analysis, plea_discount_curves, appellate_trends) |
| `bulk-judge-quote-extractor.mjs` | Extracts verbatim judicial holding quotes from 50 GB opinions CSV → judge_quotes (topic-classified) |
| `bulk-judge-prosecutor-pairing.mjs` | Builds judge x prosecutor grant-rate matrix per motion_type → judge_prosecutor_pairings (sample >= 2) |
| `bulk-sentencing-outlier-detector.mjs` | Per-judge p25/median/p75 sentencing percentiles by jurisdiction+charge → sentencing_distributions |
| `bulk-officer-reliability-aggregator.mjs` | Extracts officer testimony credibility signals (Brady/impeached/discredited) → officer_reliability (testimony >= 2) |
| `bulk-bench-jury-divergence.mjs` | Per-judge bench vs jury acquittal rate divergence from opinions CSV → bench_jury_divergence + judge_profiles |
| `bulk-co-defendant-divergence-analyzer.mjs` | Extracts co-defendant outcome divergences from opinions CSV → co_defendant_analysis |
| `bulk-plea-discount-modeler.mjs` | Models plea-vs-trial sentence discount curves by jurisdiction+charge (>= 3 plea + 3 trial) → plea_discount_curves |
| `bulk-appeal-outcome-correlator.mjs` | 4-phase: citation-map + opinions streams → reversal/affirmance rates by argument_type+jurisdiction+year → appellate_trends |
| `bulk-similar-case-matcher.mjs` | O(n^2) k-NN on good-law cases using jurisdiction/court_level/year/party_side/outcome/motion_types → case_feature_vectors neighbors |
| `bulk-populate-judge-profiles.mjs` | Populates judge_profiles from CourtListener people-db (people + positions CSVs) |
| `bulk-populate-prosecution-counters.mjs` | Populates prosecution_counters grouping top 5 defense cases per PROSECUTION-side statute |
| `link-quotes-to-judges.mjs` | Phase 1b link pass: streams opinions-filtered.csv cluster→author_id, matches to judge_profiles.cl_person_id |
| `link-quotes-via-cl-api.mjs` | CL-API follow-up linker: hits /opinions for unlinked cluster_ids after CSV ceiling (15,652) |
| `link-sentencing-to-judges.mjs` | Re-derives per-judge sentencing distributions via cluster→author match (fixes NULL-judge_id aggregate bug) |
| `build-judge-coi.mjs` | Judge Conflict of Interest build: investment disclosures x case parties via trigram match → judge_conflict_of_interest |
| `build-judge-coi-v2.mjs` | COI v3: dedupe companies first then trigram-match (reduces scan count ~30x) |
| `build-judge-coi-v3.mjs` | COI v4 EXACT-match after canonical-name normalization (hash join, seconds vs timeouts) |
| `build-judge-coi-v4.mjs` | COI builds Signal 3 + Signal 4 in one session via cl_dockets.assigned_to_id anchor |
| `build-judge-coi-lateral.mjs` | COI Plan C: LATERAL with LIMIT bounds per-(judge,company) work to deterministic pool |
| `build-judge-coi-finish.mjs` | COI resumer: trigram-join with tighter threshold on existing UNLOGGED staging; dedup via ON CONFLICT |
| `build-judge-coi-finalize.mjs` | Post-v4 finalization: backfills case_url via scalar subquery lateral (vs 9.9M-row DISTINCT ON timeout) |
| `build-judge-coi-actionable.mjs` | Final COI variant: actionable-recusal filter (case.judges must contain judge last name); ~1-10K vs 315K noise |
| `build-judge-criminal-recusal-v2.mjs` | Per-author LATERAL scan on cl_opinion_bodies (fixes v1 row-dependent phraseto_tsquery GIN-blindness) |
| `build-judge-criminal-recusal-v3.mjs` | Batched-by-author-chunks variant of criminal-recusal (progress visibility per commit) |
| `build-judge-sentencing-fingerprint.mjs` | Judge sentencing fingerprint v1 (errored on cl_opinion_clusters.court_id) |
| `build-judge-sentencing-fingerprint-v2.mjs` | Sentencing fingerprint: case-volume + offense-mix only (criminal IDB has no disposition data) |
| `build-judge-disposition-profile-v2.mjs` | Disposition profile v2: normalizes FJC compact vs PACER docket formats to (court, yy, seq) join key |
| `build-judge-reversal-rate-v2.mjs` | Reversal-rate v2: federal-only filter + true_reversal_rate denom = all authored (kills selection bias) |
| `build-judge-fingerprint-v3.mjs` | Judge fingerprint v3: adds federal-only jurisdiction filter + per-race sentencing delta |
| `build-judge-fingerprint-v3-safe.mjs` | Worry-to-pristine CRITICAL fixes: tightened WHERE, surname-collision guard, k-anonymity >= 11, jackknife baseline |
| `build-court-jurisdiction-map.mjs` | Builds court_id → two-letter state code map from CL courts CSV (jurisdiction column + patterns) |
| `build-final-jurisdiction-map.mjs` | Authoritative cluster_id → jurisdiction merger via cluster→docket→court→jurisdiction chain |
| `extract-cluster-jurisdictions.mjs` | Streams CL opinion-clusters bz2 for cluster_id jurisdiction + cluster_id→docket_id maps |
| `prefilter-opinions-csv.mjs` | readline scan (no csv-parse) of 50 GB opinions CSV by target cluster IDs → opinions-filtered.csv (~350 MB) |
| `bulk-extract-motion-legal-issues.mjs` | Extracts motion_types[], legal_issues[], supporting_rulings[] from 50 GB opinions CSV → statute_case_law |
| `enrich-case-vectors.mjs` | CL API enrichment: cluster detail + opinion text → features.outcome/party_side/motion_types on case_feature_vectors |
| `enrich-from-bulk.mjs` | Zero-API variant of enrich-case-vectors: streams CL clusters bz2 + opinions-filtered.csv to fill features jsonb |
| `enrich-cl-aba-ratings.mjs` | Fetches CL `/aba-ratings/?person=X` for judges → judge_profiles.aba_rating (fixes engine TODO) |
| `enrich-cl-citation-depth.mjs` | Computes authority score from CL citation-count + opinions-cited depth → citation_authority |
| `enrich-cl-retention-events.mjs` | Fetches CL `/retention-events/?person=X` for judges → judge_sentencing_patterns.retention_elections jsonb |
| `compute-pattern-tables.mjs` | Aggregates classified_opinions → defense_theory_outcomes + motion_success_patterns (weighted by opinion_type) |
| `convert-ussc-dat.py` | Parses USSC fixed-width .dat + .sas column positions, extracts bench/jury + sentencing columns to CSV |
| `convert-ussc-sas.py` | Converts USSC .sas7bdat → CSV via pyreadstat (FY18+ format) |
| `extract-ussc-columns.mjs` | Extracts 7 needed columns from 27K-column USSC CSV via line-by-line split (csv-parse cannot handle 27K cols) |
| `refresh-ussc-matview.mjs` | REFRESH MATERIALIZED VIEW CONCURRENTLY ussc_similar_cases_summary (post-USSC ingest) |
| `filter-criminal-opinions.py` | Stage 1 of classification pipeline: indexed_bzip2 parallel decompression filters criminal opinions from 50 GB bz2 |

### Data Ingestion
> One-shot or periodic ingesters for external datasets that power Tier 9 analytics. Each writes to a specific analytics table with source URL tracking.

| File | Purpose |
|------|---------|
| `download-all-external-datasets.mjs` | Parallel download: JUSTFAIR, NPI, FJC IDB, MPV, Fatal Encounters, MfJ, FBI Crime |
| `download-external-datasets.mjs` | Playwright downloads (bypasses 403s) for Brady/exoneration/NPI/BJS datasets |
| `browser-download-datasets.mjs` | Playwright automation for FBI Crime Data + Measures for Justice downloads |
| `browser-download-remaining.mjs` | Playwright v4 fixes for FJC criminal-IDB dropdown + FBI Location overlay |
| `ingest-bjs-felony-sentences.mjs` | BJS Felony Sentences in State Courts → outcome_benchmarks (national + state aggregates) |
| `ingest-bjs-outcomes.mjs` | BJS felony CSV aggregated to (level, name, offense_type) → outcome_benchmarks (conviction/acquittal/plea-penalty rates) |
| `ingest-brady-giglio.mjs` | Scrapes giglio-bradylist.com → officer_external_intel (UPSERT on normalized name+state+agency) |
| `ingest-exoneration-html.mjs` | Parses cached NRE HTML table → exoneration_patterns (sets factor cols NULL; CSV overwrites later) |
| `ingest-exoneration-registry.mjs` | Full NRE CSV → exoneration_patterns with FC/MWID/P-FA/OM/ILD/F-MFE factor percentages |
| `ingest-fatal-encounters.mjs` | Fatal Encounters CSV → officer_external_intel agency-level rows (sentinel `__agency__:` prefix) |
| `ingest-justfair.mjs` | 595K federal sentencing records (FinalDataset.csv, 1.3 GB) → judge_sentencing_patterns + sentencing_distributions + judge_demographics |
| `ingest-npi.mjs` | National Police Index per-state gz CSVs → officer_external_intel (employment history + wandering-officer detection) |
| `ingest-ussc-bench-jury.mjs` | USSC Individual Offender FY14-FY24 DISPOSIT codes → bench_jury_divergence (trial penalty per district + offense) |
| `ingest-ussc-sentencing.mjs` | USSC individual (district-anonymized) → judge_sentencing_patterns (departure rates, offense/criminal-history breakdowns) |
| `ingest-virginia-court-data.mjs` | Virginia circuit criminal 2024 ConcludedBy/SentenceTime → bench_jury_divergence (state_code='VA') |
| `ingest-cl-parties-attorneys.mjs` | CL `/search/?type=r` federal criminal → judge_prosecutor_pairings (USAO/DOJ vs PD/private classification) |
| `marshall-covid-prisons-ingest.mjs` | Marshall Project COVID-19 prison data CSV → explicit schema + TRUNCATE + COPY FROM STDIN |

### Backfills & Fixes
| File | Purpose |
|------|---------|
| `backfill-defendant-profiles.mjs` | Seeds defendant_profiles for cases with intake_id but no profile (replicates src/lib/defendant-profile.ts deterministic mapping) |
| `backfill-judge-jurisdiction.mjs` | Derives judge_profiles.jurisdiction from positions JSONB court_ids (prefers non-FEDERAL state codes) |
| `backfill-officer-jurisdiction.mjs` | Derives officer_reliability.jurisdiction from brady_history cluster_ids → majority state |
| `backfill-pillar-tags.mjs` | One-time backfill: tags content_gaps, blog_drafts, MDX posts with Content Pillar Engine metadata |
| `backfill-published-hash.mjs` | Backfills `.qa-state/<slug>.json` sidecars with published_hash from MDX source |
| `consolidate-content-gaps-dups.mjs` | Non-destructive dedup: keeps lower id, marks higher ids status='declined' (pre partial-unique migration) |
| `fix-em-dashes.mjs` | Tree-wide em-dash/double-hyphen replacement with file-type-aware rules and 4 punctuation variants |
| `fix-humanizer-slop.mjs` | Mechanical fixer for 10 posts that failed humanizer gate; drops AI-slop vocab + em-dash density |
| `fix-pairings-judge-ids.mjs` | One-shot: replaces CL person_ids with UUIDs in judge_prosecutor_pairings-updates.sql (self-deletes) |
| `fix-e2e-partner-source.mjs` | Carve-out: reclassifies "E2E Test Partner" as source='bondsman' so pre-migration backfill preserves check_in_enabled=true |

### E2E Testing
| File | Purpose |
|------|---------|
| `qa-e2e-test.mjs` | **Main E2E purchase runner.** Playwright-driven full flow: `/api/qa-checkout` ($0) → Stripe checkout → success page → download both PDFs → verify delivery email. Usage: `node scripts/qa-e2e-test.mjs [tier\|all]` (default `dui-first-offense`) |
| `e2e-playbook-visual.mjs` | Read-only Playwright visual validation of playbook sales + checkout + services pages. No Stripe/DB writes, safe against prod. `, base-url` flag supported |
| `test-ib-pipeline.ts` | Intelligence Brief E2E: render, validate, push (create order+case), update section, cleanup |
| `test-batch-generation.mjs` | Case Decoder batch flow: Batch API submit → poll → render |
| `e2e-all-pipelines.mjs` | Full E2E: Case Decoder + Intelligence Brief + Playbook flows. Creates test data, verifies transitions, cleans up |
| `test-e2e-dashboard.mjs` | Operator dashboard + customer portal API tests. Creates test orders/cases/jobs, verifies response structure |
| `test-inclusion-flow.mjs` | Tier inclusion logic (parent_order_id, is_included_deliverable) |
| `verify-download-flow.mjs` | Download token flow for all 8 playbooks. Options: `, skip-cleanup`, `, skip-api` |
| `e2e-tier9.mjs` | Full purchase flow for all 5 Tier 9 standalone SKUs (webhook → order → intake → generation → viewer → operator retry → cleanup) |
| `seed-e2e-partners.mjs` | Seeds E2EBOND (check-in) + E2EREFE (referral) fixtures via ON CONFLICT; requires E2E_SEED_CONFIRMED=1 prod guard |
| `teardown-e2e-partners.mjs` | Removes fixture partners seeded by seed-e2e-partners.mjs; same E2E_SEED_CONFIRMED=1 guard |
| `smoke-test-tier8a-edge-fn.mjs` | Validates fetchDefendantProfileBlock + fetchCaseIntelligenceBlock SQL shapes against backfilled data (no Edge Function call) |
| `qa-existing-post.mjs` | DEPRECATED Humanizer-only QA runner; LLM gates moved to /blog-pipeline skill. Retained for pre-commit hook only |
| `test-aba-sample.mjs` | CL ABA-ratings API smoke probe: fetches 5 ratings to validate auth + shape |
| `reviewer-fanout.mjs` | Fateev/Temporal durable reviewer fan-out; shells `claude -p` parallel with per-reviewer OS timeouts (replaces hung Agent tool) |

### Misc / One-off
| File | Purpose |
|------|---------|
| `task-1-apply-enrichment.mjs` | Task 1 applier: batch-applies ID+SC enrichment UPDATEs via Management API |
| `task-2-apply-cap-verification.mjs` | Task 2 applier: batches of 50 from `verification-updates.sql` → Management API |
| `task-3-apply-cl-urls.mjs` | Task 3 applier: CL verification updates from pre-generated `cl-verification-updates.sql` |
| `task-2-3-final-apply.mjs` | Combined Task 2+3 final applier (helper for apply-enrichment-batches workflow) |

### Continuous Verification Probes
| File | Purpose |
|------|---------|
| `verify-partner-preview-integrity.mjs` | CV probe INNA-H12. Fetches top-3 partner OG images, asserts 200 + PNG + =10KB. JSON-lines output. Exits 0/1. Usage: `node scripts/verify-partner-preview-integrity.mjs`. Wire into `~/projects/continuous-verification/verify.mjs` as hypothesis H12 |

### Content & Marketing
| File | Purpose |
|------|---------|
| `geo-prompt-test.mjs` | GEO baseline test (Evan Bailyn method). Logs 10 prompts for manual testing across ChatGPT, Perplexity, Google AI |
| `schedule-tweets.mjs` | Schedules pending tweets via Postiz API, 2/day at 9 AM and 6 PM EST, reads `content/queue/twitter/pending` |
| `schedule-social.mjs` | Multi-platform Postiz scheduler (twitter, facebook, or `, all`). Skips image/video platforms. `, dry-run` supported |
| `schedule-social-slow.mjs` | Hourly-friendly single-post scheduler (one post per run) to stay under Postiz 30 req/hr limit. Designed for Task Scheduler |

### Asset Rendering
| File | Purpose |
|------|---------|
| `render-gbp-cover.js` | GBP cover image → 1024x576 PNG via Puppeteer |
| `render-gbp-photos.js` | GBP photo assets → PNG via Puppeteer |
| `render-gbp-profile.js` | GBP profile section → PNG via Puppeteer |
| `redact-discovery.py` | Redacts PII from real PCSO discovery PDFs and exports pages as 2x retina PNGs for the website. Uses PyMuPDF. Output: `public/discovery/` |

### Migration Helpers
| File | Purpose |
|------|---------|
| `migrate-009-tier-inclusion.mjs` | Adds is_included_deliverable, parent_order_id, court columns to cases. Runs via Management API |

## Key Constants

| Constant | Value | File:Line |
|----------|-------|---------, |
| Supabase project ref | `jxjbjmgdukwkoclydqdr` | `load-jurisdiction-data.mjs:17`, `apply-pending-sql.mjs:12`, `classify-case-law.mjs:32` |
| CourtListener fetch delay | 750ms | `classify-case-law.mjs:33` |
| FL statute fetch delay | 2000ms | `legal-research-fl.mjs:32` |
| All-state fetch delay | 1500ms | `legal-research-all.mjs:32` |
| Generate-worker max retries | 3 (on 529 overloaded) | `generate-worker.mjs` |
| GBP render dimensions | 1024x576 (2x DPI) | `render-gbp-cover.js:15` |
| Parent env file | `../ImNotAnAttorney/.env.local` | `load-jurisdiction-data.mjs:20`, `legal-research-fl.mjs:36` |

## Data Flow

```
Charge Taxonomy Pipeline:
  COMMON_CHARGES (static) → Claude API (52 jurisdiction calls)
  → data/charge-taxonomy/{AL,AK,...}.json (local files)
  → build-seed-migration.ts → migration 029 SQL → DB populated

Legal Research Pipeline:
  jurisdiction_statutes (DB) → FL Online Sunshine (verify statute)
  → CourtListener API (fetch citing cases)
  → UPDATE jurisdiction_statutes (source_urls, confidence_score)
  → classify-case-law.mjs → UPDATE statute_case_law (classification, holding)

All-State Legal Research Pipeline:
  jurisdiction_statutes (DB) → FL Online Sunshine (FL only)
  → Cornell LII (federal only) → Justia URL reference (other states)
  → CourtListener API (case law search, boosts confidence)
  → UPDATE jurisdiction_statutes (source_urls, confidence_score, verified_at)

Report Backup Pipeline:
  SELECT cases WHERE status='generating' AND updated_at < now() - 3min
  → Claude Opus API → UPDATE cases (report_html, status)
  → Resend API (operator email) → POST /api/evaluate (UPL gate)

Cron Setup:
  setup-cronjob-org.js → PUT cron-job.org API → cronjob-org-ids.json
```

## Integration Points

**Reads from:**
- `.env.local`, ANTHROPIC_API_KEY, SUPABASE_SERVICE_ROLE_KEY, CRONJOB_API_KEY, CRON_AUTH_TOKEN, RESEND_API_KEY, COURTLISTENER_TOKEN
- `../ImNotAnAttorney/.env.local`, SUPABASE_ACCESS_TOKEN (Management API token, NOT service role key)
- `src/lib/tiers.ts`, check-tiers.mjs lints against this
- `data/charge-taxonomy/*.json`, load-jurisdiction-data.mjs reads these
- Supabase tables (test scripts read/write orders, cases, partners, etc.)
- CourtListener API, FL Online Sunshine (legal research scripts)

**Writes to:**
- Supabase tables via Management API (load-jurisdiction-data → jurisdiction_statutes)
- Supabase tables via PostgREST (classify-case-law → statute_case_law)
- Local files: `data/charge-taxonomy/*.json` (generate-charge-taxonomy.ts)
- Migration SQL: `supabase/migrations/029*.sql` (build-seed-migration.ts)
- cron-job.org API (setup scripts register jobs)
- Local files: `cronjob-org-ids.json`, `blog-pipeline-cron-ids.json`

## Gotchas

1. **SUPABASE_ACCESS_TOKEN vs SUPABASE_SERVICE_ROLE_KEY.** Scripts that use Management API need the Access Token (personal, from parent repo `.env.local`). Scripts that use PostgREST need the Service Role Key (from this project's `.env.local`). Never confuse them.

2. **Legal research scripts read from parent repo.** `legal-research-fl.mjs` and `classify-case-law.mjs` read `../ImNotAnAttorney/.env.local`. Fails silently if parent repo not checked out.

3. **Rate limiting is intentional.** FL Online Sunshine: 2s between fetches. CourtListener: 750ms. These are respectful scraping policies. Speed up only with permission from the source.

4. **Script ordering for charge taxonomy:** `generate-charge-taxonomy.ts` MUST complete before `build-seed-migration.ts` (reads generated questions.json). Migration 029 MUST run before web code expects charge data.

5. **Test scripts create real DB records.** If a test script crashes, test data persists. Cleanup: delete test orders by email prefix (`test-*`) or use `, skip-cleanup` on next run.

6. **TypeScript scripts require `tsx`.** Run with `npx tsx scripts/your-script.ts`, not `ts-node`.

7. **GBP render scripts hardcode Puppeteer path** to `C:/Users/email/projects/KDP-Publishing/node_modules/puppeteer`. Windows-specific and fragile.

## How To

- **Add a new script:** Create `scripts/your-script.mjs` (ESM). Parse env vars at top (copy from generate-worker.mjs). If scheduled, add to setup-cronjob-org.js.
- **Debug a failing script:** Run with `, dry-run` if supported. Check `.env.local` for required keys. Verify Supabase project ref matches (`jxjbjmgdukwkoclydqdr`).
- **Run legal research:** `node scripts/legal-research-fl.mjs` (FL statutes) → `node scripts/classify-case-law.mjs,limit 50` (classify 50 cases). Check COURTLISTENER_TOKEN is set.

## Maintenance Triggers

- **New cron route added** → Register in `setup-cronjob-org.js` or `setup-blog-pipeline-crons.js`
- **Tier pricing changed** → Run `node scripts/check-tiers.mjs` to catch drift
- **New jurisdiction added** → Run `npx tsx scripts/generate-charge-taxonomy.ts,jurisdiction XX`
- **Reports stuck in generating** → Run `node scripts/generate-worker.mjs` manually
- **Supabase project ref changed** → Update in all 3 scripts that hardcode it
