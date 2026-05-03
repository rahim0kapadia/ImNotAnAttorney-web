# Data Sources — Master Inventory

> Maintenance reference for the INAA web stack. Cross-references every loaded
> dataset to the bulk URL it came from, the DB tables it landed in, the
> refresh cadence, and the product tiers that consume it.
>
> Built 2026-05-02 from project memory + `~/.claude/rules/cl-bulk-data-defensive.md`
> (rule #19 endpoint table) + existing `docs/ingest/coverage/`. The
> 47K-line bulk-data audit referenced in the source prompt was not present at
> the documented path; this inventory is built from the next-best surfaces.
>
> See per-source files in this directory for license posture, anti-patterns,
> and refresh-trigger detail.

## Overview

| Metric | Value |
|---|---|
| Datasets documented | 21 |
| Total approx rows | ~187M (CourtListener bulk dominates) |
| Statute jurisdictions covered | 49 states + DC + Federal (50/52 — NM and one tail outstanding 2026-05-03) |
| Bar discipline jurisdictions | 51 (49+DC+federal-courts pending) |
| Customer-facing legal-data tables under anti-hallucination audit | 5 |
| Last comprehensive audit | 2026-04-29 (`worry-bar-discipline-extended-coverage-resolved-2026-04-29`) |

## Master table

Sortable by: provider, refresh cadence, consuming tier, last-ingested.

| Source | Provider | Bulk URL | Format | Refresh | DB table(s) | Approx rows | Last ingested | Consuming tiers | Coverage doc |
|---|---|---|---|---|---|---|---|---|---|
| CourtListener bulk (opinions, dockets, clusters, citations, people, courts, parentheticals, opinion-bodies) | Free Law Project | https://storage.courtlistener.com/bulk-data/ | CSV.bz2 | weekly (CL publishes) / on-demand re-ingest | `cl_opinions`, `cl_clusters`, `cl_dockets`, `cl_citations`, `cl_people`, `cl_courts`, `cl_parentheticals`, `case_law`, `classified_opinions` | ~50GB opinions; `classified_opinions` ~1,462,909; `case_law` ~3,407 | 2026-04-19 (last full bulk pass) | All tiers (canonical case-law substrate) | [courtlistener-bulk.md](courtlistener-bulk.md) |
| FJC IDB + Judges | Federal Judicial Center | https://www.fjc.gov/research/idb · https://www.fjc.gov/history/judges | CSV | annual | `fjc_judges`, `judge_demographics` | ~3,400 judges | 2026-04-14 | Judge Report Card, Intelligence Brief, X-Ray | [fjc-judges-and-idb.md](fjc-judges-and-idb.md) |
| USSC Individual (FY02–FY24) | US Sentencing Commission | https://www.ussc.gov/research/datafiles | SAS + fixed-width CSV | annual (Q1 next FY) | `ussc_individual_fy*`, `ussc_sentencing_all` (view), `ussc_matview_meta`, `judge_sentencing_patterns`, `sentencing_distributions` | ~819,248 (`ussc_sentencing_all`) | FY13 added 2026-04-27 PR #187; FY02–FY12 loader queued (~30 min) | Federal Sentencing Distribution ($297), Judge Report Card, X-Ray, Sentencing Calculator | [ussc-individual-fy02-fy24.md](ussc-individual-fy02-fy24.md) |
| State + Federal statutes (entities_statutes) | per-state legislatures + Cornell LII (USC) | per-state — see file | HTML / PDF / sitemap | per-state weekly cron via `cron-job.org` | `entities_statutes`, `jurisdiction_statutes_active` (view) | ~48,500 across 49 states + DC + Federal | rolling — Phase 4 OR + AL/IL/ME/MI shipped 2026-05-01; CT/NY/MT/WV/NC/WA shipped 2026-05-02 | All tiers (charge taxonomy substrate) | [entities-statutes.md](entities-statutes.md) |
| Attorney discipline (per-state bar scrapes) | 51 state/territorial bars + CourtListener captions | per-state — see file | HTML / Apex JSON / PDF / Playwright | per-state quarterly (state cadence) | `attorney_discipline_events` | ~37,387 events across 51 jurisdictions | 2026-04-29 (MA 3779 + MN 1560 last big add) | Intelligence Brief, X-Ray, War Room | [attorney-discipline-events.md](attorney-discipline-events.md) |
| MPV (Mapping Police Violence) + WaPo Police Shootings | Campaign Zero / Washington Post | Airtable export · https://github.com/washingtonpost/data-police-shootings | CSV | annual / monthly | `officer_violence_events`, partial `officer_reliability` enrichment | MPV 467 partial (downloaded, not yet ingested per defense-intel memo); WaPo ~10K | downloaded 2026-04-14, ingest TBD via `scripts/ingest-mpv.mjs` | Officer Background Check ($97), X-Ray | [mpv-and-wapo-officer-violence.md](mpv-and-wapo-officer-violence.md) |
| DPIC executions | Death Penalty Information Center | dpic CSV | annual | `dpic_executions` | ~1,500 | shipped per `architecture-defense-intelligence-system.md` | Capital-case adjacency | [dpic-executions.md](dpic-executions.md) |
| NRE Exonerations | National Registry of Exonerations (UMich Law) | https://www.law.umich.edu/special/exoneration/Pages/detaillist.aspx | CSV (request-gated) | annual | `nre_exonerations` | ~3,500 | downloaded 2026-04-14, partial | Similar Cases Analyzer, X-Ray | [nre-exonerations.md](nre-exonerations.md) |
| Oyez SCOTUS cases | Cornell LII / oyez | https://api.oyez.org/cases · https://github.com/walling/oyez-api | JSON | annual | `oyez_cases`, SCOTUS Case Search index | ~28,000 cases | shipped — see SCOTUS Case Search standalone | SCOTUS Case Search ($0 free), X-Ray | [oyez-scotus-cases.md](oyez-scotus-cases.md) |
| NIBRS Florida (Kaplan) | FBI / Jacob Kaplan | NIBRS bulk via Kaplan archive | ZIP / CSV | annual | `nibrs_fl_*` (49 tables) | ~90M (state-level events) | ZIP extracted 2026-04-14, ingest deferred (complex agency-level shape) | District Court Intelligence ($97 planned), X-Ray | [nibrs-kaplan.md](nibrs-kaplan.md) |
| FARS (NHTSA Fatality Analysis Reporting System) | NHTSA | https://www.nhtsa.gov/file-downloads | CSV | annual | `fars_*` | ~36K crashes/yr | shipped 2026-04 (DUI playbook citation substrate) | DUI Playbook, X-Ray | [fars-nhtsa-fatality.md](fars-nhtsa-fatality.md) |
| NYPD CCRB allegations | NYC Civilian Complaint Review Board | NYC Open Data | CSV | quarterly | `nypd_ccrb_allegations` | ~370K | shipped (officer reliability substrate, NY-state) | Officer Background Check, X-Ray | [nypd-ccrb-allegations.md](nypd-ccrb-allegations.md) |
| Chicago CPD complaints | Invisible Institute / CPDP | https://github.com/invinst/CPDP-data | CSV | quarterly | `chicago_cpd_complaints` | ~250K | shipped (officer reliability substrate, IL) | Officer Background Check, X-Ray | [chicago-cpd-complaints.md](chicago-cpd-complaints.md) |
| Vera incarceration trends | Vera Institute of Justice | https://github.com/vera-institute/incarceration_trends | CSV | annual | `vera_incarceration` | ~1.9M county-year cells | shipped 2026-04 | District Court Intelligence, blog substrate | [vera-incarceration.md](vera-incarceration.md) |
| Pattern Jury Instructions (PJI) — federal circuits | per-circuit court (Free Law Project mirror where available) | per-circuit — see file | PDF + curated text | annual | `pattern_jury_instructions` | ~2,139 across 11 of 13 circuits | 4th + Federal Cir added 2026-04-27 PR #182 | Intelligence Brief, X-Ray, Federal Jury Instructions Brief (FJIB) standalone | [pji-pattern-jury-instructions.md](pji-pattern-jury-instructions.md) |
| Judge quotes + judge profiles | CourtListener `people` + opinion-text scrape | derived from CL bulk | derived | rolling per CL refresh | `judge_profiles`, `judge_quotes`, `judicial_quotes` (denormalized into judge_profiles) | `judge_profiles` ~15,613 (15,386 with jurisdiction); `judge_quotes` ~64,730 (15,652 linked, 5,494 keyword-classified) | 2026-04-11 (Tier 9 Phase 1) | Judge Report Card ($197), Intelligence Brief, X-Ray, War Room | [judge-quotes-and-profiles.md](judge-quotes-and-profiles.md) |
| Case feature vectors | derived from CL clusters + USSC + state court mappings | n/a (derived) | derived | rolling | `case_feature_vectors` | ~1,008 with charge_slug | 2026-04-11 (charge_slug backfill) | Similar Cases Analyzer ($297), X-Ray | [case-feature-vectors.md](case-feature-vectors.md) |
| Stanford Open Policing | Stanford Open Policing Project | https://openpolicing.stanford.edu/data/ | CSV | annual | `police_stops` | ~250M (state-level stops where loaded) | shipped 2026-04 | DUI Playbook (stop-pattern data), X-Ray | [stanford-open-policing.md](stanford-open-policing.md) |
| ACS county demographics | US Census Bureau | https://www.census.gov/programs-surveys/acs/data.html | CSV / API | annual | `acs_county_demographics` | ~3,200 counties × variables | shipped (jury-pool demographics substrate) | District Court Intelligence, IB jury-strategy | [acs-county-demographics.md](acs-county-demographics.md) |
| Federal Rules of Evidence / Civil Procedure / Criminal Procedure | Cornell LII | https://www.law.cornell.edu/rules/ | HTML / curated text | annual (rules amendments) | `federal_rules` | ~1,200 rule sections | shipped | Intelligence Brief, X-Ray, blog | [federal-rules.md](federal-rules.md) |
| US Code (Title 18 + adjacent) | Cornell LII (Carl Malamud-aligned) | https://www.law.cornell.edu/uscode/ | HTML | weekly cron (Mon 15:00 UTC, jobId 7523661) | `entities_statutes` (US jurisdiction), `jurisdiction_statutes` (legacy 36 USC rows) | 36 verified USC rows + state expansion in `entities_statutes` | 2026-04-24 (PR #117 weekly cron live) | All tiers (federal-charge substrate) | [uscode-cornell.md](uscode-cornell.md) |

## By product tier

Cross-reference: which datasets feed which SKU. If a dataset row is stale, the
linked product is at risk. Maintain refresh cadence accordingly.

### Tier 1 — Playbooks ($97–$147)

| Playbook | Required datasets |
|---|---|
| DUI | `entities_statutes` (per-state DUI sections), FARS (NHTSA), Stanford Open Policing, USSC (federal DUI rare but cited) |
| Drug Possession | `entities_statutes`, USC Title 21, NIBRS, USSC |
| Assault, Domestic Violence, etc. | `entities_statutes`, `case_law`, `classified_opinions` |

### Tier 2 — Case Decoder ($197)

`entities_statutes` + `classified_opinions` + `defense_theory_outcomes`. Weakest layer = pattern tables (empty, awaits Phase 2 bulk opinion-text).

### Tier 3 — Intelligence Brief ($997)

Adds: `attorney_discipline_events` (jurisdictional), `pattern_jury_instructions` (circuit), `judge_profiles` jurisdiction-narrowed, `acs_county_demographics`, `federal_rules`.

### Tier 4 — X-Ray ($2,497)

Adds: `judge_sentencing_patterns`, `judge_demographics`, `officer_reliability` (cross-case), `case_feature_vectors`, MPV/WaPo officer-violence enrichment, full `cl_opinions` body lookup.

### Tier 5 — War Room ($4,997)

Adds: judge × prosecutor pairing matrix (derived from CL `cl_dockets`), bench/jury divergence (district-level matview from `cl_clusters`), `vera_incarceration`, recurring weekly digest from `judge_quotes` + new opinions.

### Tier 6 — Situation Room ($9,997)

Adds: `co_defendant_analysis` (table exists per `worry-data-orphans` resolution; was incorrectly listed as missing in Tier 9 readiness memo — see drift fixes), plea-discount modeling derived from USSC.

### Tier 9 standalone

| SKU | Required datasets |
|---|---|
| Judge Report Card ($197) | `judge_profiles` + `judge_sentencing_patterns` + `judicial_quotes` (denormalized) |
| Officer Background Check ($97) | `officer_reliability` + MPV/WaPo + NYPD CCRB + Chicago CPD |
| Similar Cases Analyzer ($297) | `case_feature_vectors` + `cl_clusters` |
| Federal Sentencing Distribution ($297) | `ussc_sentencing_all` (819,248 rows) + `ussc_matview_meta` freshness gate |
| SCOTUS Case Search (free) | `oyez_cases` |
| Sentencing Calculator (free) | USSC Individual derived |
| FJIB — Federal Jury Instructions Brief | `pattern_jury_instructions` |
| Arrest Survival Kit ($47) | `entities_statutes` (per-state booking statutes) |

## Known gaps + planned ingests

Tracked in `docs/plans/` — re-evaluate weekly.

| Gap | Plan / blocker |
|---|---|
| **NM Chapter 30 statutes** | `nmonesource.com` Lexum SPA captcha + Justia 24-48h sister-IP ban (started 2026-05-01). Re-probe via ScheduleWakeup loop. |
| **MN bar 2019/2020/2021** | 8-12h pdfjs + tesseract OCR (PR #174 plan). |
| **MA per-attorney depth** | Paywalled (PR #175 plan). |
| **2nd Cir + DC Cir PJI** | Paywalled (Sand's, Bergman's). PR #182 plans. |
| **KY bar discipline** | CL gap. Alt-source candidates listed in PR #185 plan. |
| **MT bar discipline** | Wix JS-rendered ODC. 2-4h Playwright unblock. PR #195 plan. |
| **FJSP** | Needs Rahim's free ICPSR account (5min browser). `docs/plans/2026-04-27-followup-fjsp-icpsr-blocked.md`. |
| **Judge profiles thin states** (AK/ND/WY/PR/VI/GU) | CL exhausted. 4-6h state judiciary directory scrape (G8b plan). |
| **USSC FY02–FY12** | Loader committed PR #187, ~30 min compute remaining (12 years × 2 min). |
| **NIBRS Florida ingestion** | ZIP extracted 2026-04-14; complex agency-level transformation deferred. |
| **MPV ingestion** | CSV downloaded 2026-04-14; `scripts/ingest-mpv.mjs` not yet written. |
| **Defense intelligence pattern tables** (`defense_theory_outcomes`, `motion_success_patterns`) | Empty 0 rows; needs full opinion text from 50GB CL bulk + classification pass. |

## Memory drift fixes (corrections to stale claims in older memory)

When sources or table references in older memory don't match production reality, capture the correction here so the next session doesn't re-invent the wrong path.

1. **`attorney_discipline_events`, NOT `bar_discipline_events`.** Older memory and some plan files used `bar_discipline_events`; the production table is `attorney_discipline_events` (37,387 rows verified 2026-04-29). Apply this correction in any new query, ingest script, or doc.
2. **USSC FY13 gap closed.** `project-tier9-data-readiness-complete.md` (Apr 14) showed FY14–FY24 as the loaded range. PR #187 (2026-04-27) added FY13 (+80,035 rows). Full FY13–FY24 now loaded; FY02–FY12 loader queued, not yet executed (~30 min compute).
3. **`co_defendant_analysis` table EXISTS.** `project-tier9-data-readiness-complete.md` (Apr 14) listed it as "doesn't exist (Situation Room only)". Subsequent worry-resolution work confirmed the table exists and is wired to Situation Room. Verify in `supabase/SCHEMA.md` before asserting absence.
4. **`statute_case_law` was DROPPED.** Earlier memory (`project-legal-pipeline-status.md`) referenced `statute_case_law` as the web-owned case-law universe with 17,968 rows. The table was retired in favor of the per-tier cite-tag matview architecture (`v_entity_confidence`) + `case_law` (~3,407 rows) + `classified_opinions` (~1,462,909 rows). Do not write to `statute_case_law` in new code.
5. **`entities_statutes` schema is NOT what older designer documents assumed.** Actual columns: `jurisdiction, title, section, subsection, section_text, is_current, source_urls, text_hash, effective_date, scraped_at` (PK `canonical_id` uuid). Older designer notes that assumed `entity_type, entity_id, statute_id, citation, body, created_at` are stale — see `project-statutes-tonight-2026-05-03-49of50.md`.

## Hard rules in force

- **No-hallucinated-legal-data** (`~/.claude/rules/no-hallucinated-legal-data.md`): every legal-data row MUST carry a verification URL in `source_urls[]`. Empty `source_urls` = treat as fabricated.
- **CSV-bulk-before-API** (`~/.claude/rules/cl-bulk-data-defensive.md` #19): for any vendor that publishes a bulk endpoint, download the bulk file. Do NOT write an API fetcher unless the vendor publishes none.
- **Per-row INSERT banned** (`cl-bulk-data-defensive.md` #18): use COPY FROM STDIN via `scripts/lib/pg-bulk-defaults.mjs` for any bulk load >1,000 rows.
- **Anti-hallucination audit query** runs after every bulk ingest (5-min SQL pass on the 5 customer-facing legal-data tables: `attorney_discipline_events`, `case_law`, `classified_opinions`, `entities_statutes`, `jurisdiction_statutes_active`).

## Where to look when something breaks

| Symptom | First place to look |
|---|---|
| "Data we don't have" appearing on customer page | This file → consuming-tier table → which dataset feeds it |
| Stale row counts in IB / X-Ray | `/api/data-status` (USSC freshness) + per-source coverage doc `last_refresh` field |
| Anti-hallucination audit fails | The dataset whose row jumped — check its coverage doc for source-URL contract |
| Cron failed on Mon morning | `cron-job.org` jobs 7523661 (USSC weekly), 7523794–7523801 (FL per-chapter), 7544044 (War Room digest), 7550140 (OR statutes), etc. — see per-source coverage docs |
