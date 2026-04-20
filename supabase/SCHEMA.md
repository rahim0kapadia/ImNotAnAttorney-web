# Database Schema Reference

**Extracted from:** deprecated `docs/ARCHITECTURE.md` (deleted 2026-04-07)
**Status:** Schema snapshot as of migration ~012. Tables added by later migrations (referral-system, partner-portal, feature-flags, customer-portal, batch-id, charge-taxonomy, cron-executions, research-columns, blog-drafts, score-results, acquire-cron-lock-rpc, report-token-hash, guarantee_invocations, standalone_products, calculator_email_rpc, case-law-verification, phase0_feature_flags, enrichment-and-case-law-data) are NOT documented here, audit `supabase/migrations/20250101000012*.sql` onward to complete.
**Source of truth:** Actual migrations in `supabase/migrations/*.sql`. This file is a reference snapshot; always verify against current migrations for new work.

## Tables

### Core Tables

#### `orders`

| Column | Type | Purpose |
|------, |------|---------|
| id | uuid (PK) | Auto-generated |
| email | text | Customer email (lowercased) |
| tier | text | Product tier slug |
| amount | integer | Amount in cents |
| status | text | `paid` / `refunded` |
| stripe_session_id | text (unique) | Prevents duplicate webhook processing |
| stripe_payment_intent_id | text (indexed) | For refund matching |
| upgrade_credit_applied | integer | Credits from prior purchases (cents) |
| paid_at | timestamptz | Payment timestamp |
| refunded_at | timestamptz | Refund timestamp (null if not refunded) |
| priority_delivery | boolean | Priority add-on purchased |
| court_date | text | Customer's next court date |
| consent_timestamp | text | Consent for $2,497+ tiers |
| product_type | text | `service` or `digital-product` |
| download_token | uuid | Playbook download token |
| download_token_expires_at | timestamptz | 72h download window |
| download_count | integer | Number of downloads |

#### `cases`

| Column | Type | Purpose |
|------, |------|---------|
| id | uuid (PK) | Set by webhook (crypto.randomUUID) |
| order_id | uuid (FK) | Links to orders table |
| email | text | Customer email |
| tier | text | Product tier |
| status | text | See state machine below |
| intake_id | uuid (FK) | Links to intakes table |
| charge_type | text | From intake |
| report_html | text | Generated HTML report |
| report_token | uuid | URL-safe token for report access |
| report_token_hash | text | SHA-256 hex hash of report_token for indexed lookups |
| batch_id | text | Anthropic Batch API request ID for async generation |
| generated_at | timestamptz | When report was generated |
| delivered_at | timestamptz | When report was delivered |
| completed_at | timestamptz | When War Room / Situation Room monitoring engagement was closed (added 2026-04-09) |
| reviewed_by | text | Who approved delivery |
| reviewed_at | timestamptz | When approved |
| deliverable_url | text | Full report URL |
| file_urls | text[] | Discovery file storage paths |
| eval_results | jsonb | Evaluation scorecard (UPL + Psych teams) |
| buyer_states | jsonb | Detected buyer states from intake |
| review_reminder_sent | boolean | Prevents duplicate review reminders |
| report_token_expires_at | timestamptz | 12-month report access expiry |
| is_included_deliverable | boolean | `true` for auto-created lower-tier cases |
| parent_order_id | uuid (FK) | Links included case back to source order |
| court_case_number | text | Court-assigned case number |
| court_state | text | Jurisdiction state |
| court_county | text | County within state |
| docket_fetched_at | timestamptz | When docket data was last fetched |
| docket_source | text | `courtlistener`, `judyrecords`, `clerk_portal`, `none` |
| docket_entry_count | integer | Number of docket entries fetched |
| section_outputs | jsonb | IB Phase A/B section outputs for cross-referencing |
| judge_research_data | jsonb | Judge research data (optional, v4) |
| prior_case_id | uuid | Links to customer's prior Case Decoder |
| phase_a_completed_at | timestamptz | IB Phase A completion timestamp |
| phase_b_completed_at | timestamptz | IB Phase B completion timestamp |
| delivery_due_at | timestamptz | SLA deadline for delivery |
| next_update_due_at | timestamptz | War Room/Situation Room next update |
| phase | text | Current processing phase |
| phase_started_at | timestamptz | When current phase started |
| document_count | integer | Number of uploaded discovery documents |
| finding_count | integer | Number of findings extracted |
| witness_count | integer | Number of witnesses identified |
| discovery_health_score | integer | 0-100 discovery health rating |
| defense_opportunity_index | jsonb | Multi-dimensional opportunity scoring |
| upgrade_order_ids | uuid[] | Orders that used upgrade credits from this case |
| data_retention_until | timestamptz | Data retention deadline |
| data_purged_at | timestamptz | When data was purged |
| purge_reason | text | Why data was purged |
| operator_notes | text | Free-text operator notes |
| updated_at | timestamptz | Auto-updated via trigger |

#### `intakes`

| Column | Type | Purpose |
|------, |------|---------|
| id | uuid (PK) | Auto-generated |
| email | text | Customer email (lowercased, trimmed) |
| first_name | text | Customer's first name |
| last_name | text | Optional |
| charge_type | text | Primary charge |
| state | text | Jurisdiction state |
| phase2_data | jsonb | IB-specific fields (judge, attorney, hearing details) |
| ... | ... | 15+ additional charge-specific fields (see intake/route.ts) |

#### `subscribers`

| Column | Type | Purpose |
|------, |------|---------|
| id | uuid (PK) | Auto-generated |
| email | text (unique) | Subscriber email |
| source | text | How they subscribed (`blog`, `checkout`, `score`, `lead-capture`, `dui-72-hours`, `score-page`, `resources`) |
| score_band | text | `Critical` / `Concerning` / `Average` / `Adequate` / `Excellent` |
| score_value | integer | Raw score (0-100) from Defense Milestone Score |
| charge_type | text | Charge type from score quiz |
| unsubscribed_at | timestamptz | CAN-SPAM: null = active |
| created_at | timestamptz | Subscription date |

#### `drip_emails`

| Column | Type | Purpose |
|------, |------|---------|
| subscriber_id | uuid (FK) | Links to subscribers |
| email_key | text | Unique key per email template |
| created_at | timestamptz | When sent |
| **Unique constraint** | `(subscriber_id, email_key)` | Prevents duplicate sends |

### Reference Data Tables (12 tables, Migration 004)

Source of truth for structured data previously scattered across 10+ markdown files. Seeded via `scripts/seed/run-all-seeds.mjs`.

| Table | Rows | Purpose |
|-------|------|---------|
| `experts` | 63 | .01% expert roster (attorneys, psychology, marketing) |
| `eval_criteria` | 58 | 5-team evaluation criteria with `applicable_tiers` and `charge_types` |
| `pipeline_eval_weights` | 40 | Per-pipeline team weights (GATE/HIGH/MEDIUM/LOW) |
| `buyer_states` | 6 | Why defendants buy (distrust, double-checking, information-vacuum) |
| `content_pain_points` | 20 | Reddit/Avvo defendant pain points with SEO data |
| `content_assets` | 15 | Ready-to-post content (email teasers, Reddit, Twitter) |
| `intake_questions` | 40 | Charge-specific intake questions (10 types x 4 questions) |
| `tiers` | 15 | Product tiers with pricing, delivery, features |
| `charge_types` | 21 | Charge type catalog with expert mappings |
| `content_posts` | 23 | Blog post catalog with subreddit targeting |
| `subreddits` | 5 | Subreddit profiles (rules, best post times) |
| `emotional_profiles` | 33 | Emotional calibration (fears, stances, attorney wounds, banned terms) |

All reference tables have `created_at`, `updated_at` (auto-trigger), and `active` boolean for soft-delete.

### Operational Tables

#### `email_log` (Migration 005)

Tracks all email send calls. Fire-and-forget logging, insert failures never crash the calling route.

| Column | Type | Purpose |
|------, |------|---------|
| id | uuid (PK) | Auto-generated |
| email_type | text | Category (`payment-confirmation`, `drip-nurture`, `operator-alert`) |
| recipient | text | Email address |
| case_id | uuid | Associated case (nullable) |
| order_id | uuid | Associated order (nullable) |
| tier | text | Product tier (nullable) |
| subject | text | Email subject line |
| status | text | `sent` / `failed` |
| error | text | Error message if failed |
| metadata | jsonb | Extra context (template key, retry count) |
| route_source | text | Which API route sent it |
| sent_at | timestamptz | Timestamp |

#### `audit_runs` (Migration 004)

| Column | Type | Purpose |
|------, |------|---------|
| id | uuid (PK) | Auto-generated |
| report_source | text | Source identifier (file path or persona name) |
| charge_type | text | Charge type evaluated |
| tier | text | Product tier |
| model_used | text | Claude model used |
| team_results | jsonb | Per-team pass/fail/needs_work breakdown |
| total_pass / total_fail / total_needs_work | integer | Aggregate counts |
| gate_passed | boolean | Whether UPL gate passed |
| created_at | timestamptz | When run completed |

#### `cron_runs`

| Column | Type | Purpose |
|------, |------|---------|
| id | uuid (PK) | Auto-generated |
| started_at | timestamptz | When cron started |
| completed_at | timestamptz | When cron finished |
| parts_run | integer | How many parts executed |
| errors | text[] | Any errors encountered |

#### `rate_limits` (Migration 004)

| Column | Type | Purpose |
|------, |------|---------|
| key | text (PK) | Rate limit identifier (e.g., `checkout:192.168.1.1`) |
| window_start | timestamptz | Current window start |
| request_count | integer | Requests in current window |

#### `counters` (Migration 012)

Generic atomic counter infrastructure for the Defense Accountability Index.

| Column | Type | Purpose |
|------, |------|---------|
| id | text (PK) | Counter identifier (e.g., `score_completions`) |
| value | bigint | Current count |
| updated_at | timestamptz | Last increment time |

#### `score_aggregates` (Migration 012)

Anonymous aggregate tracking from Defense Milestone Score. NO individual answers stored.

| Column | Type | Purpose |
|------, |------|---------|
| charge_type | text (PK part) | Charge category |
| metric | text (PK part) | What's being counted |
| count | bigint | Aggregate count |

**Tracked metrics:** `total_by_charge`, `no_motions_filed`, `never_seen_discovery`, `communication_never`, `no_strategy_discussion`.

#### `docket_entries` (Migration 011)

Court docket data from external sources (CourtListener, JudyRecords, clerk portals).

| Column | Type | Purpose |
|------, |------|---------|
| id | uuid (PK) | Auto-generated |
| case_id | uuid (FK) | Links to cases table |
| entry_date | date | When filed |
| entry_text | text | Description |
| entry_type | text | `order`, `motion`, `hearing`, `filing`, `notice`, `other` |
| filed_by | text | `court`, `defense`, `prosecution`, `clerk`, `unknown` |
| sequence_number | integer | Order within the docket |
| source | text | `courtlistener`, `judyrecords`, `clerk_portal`, `manual` |
| source_url | text | URL to source record |
| raw_data | jsonb | Raw API response |
| is_hearing | boolean | Whether this is a hearing |
| hearing_type | text | `trial`, `motion`, `status`, `pretrial`, `sentencing` |
| hearing_result | text | `continued`, `denied`, `granted`, `held` |
| created_at / updated_at | timestamptz | Timestamps |

#### `charge_packs` (Migration 006)

| Column | Type | Purpose |
|------, |------|---------|
| id | uuid (PK) | Auto-generated |
| tier_slug | text | Links to tier (e.g., `dui-first-offense`) |
| file_path | text | Storage path in `charge-packs` bucket |
| file_name | text | Display name |
| file_size | integer | Size in bytes |
| version | integer | Version number |
| active | boolean | Current version flag |

### Discovery & Analysis Tables (Migration 007-008, 010)

#### `discovery_documents`

| Column | Type | Purpose |
|------, |------|---------|
| id | uuid (PK) | Auto-generated |
| case_id | uuid (FK) | Links to cases |
| file_name | text | Original filename |
| file_type | text | MIME type |
| file_size | integer | Size in bytes |
| storage_path | text | Path in discovery-files bucket |
| category | text | Document classification |
| ocr_status | text | `pending`, `processing`, `completed`, `failed` |
| page_count | integer | Number of pages |
| uploaded_at | timestamptz | Upload timestamp |

#### `timeline_events`

Extracted timeline from discovery documents.

| Column | Type | Purpose |
|------, |------|---------|
| case_id | uuid (FK) | Links to cases |
| event_date | date | When the event occurred |
| event_text | text | Description |
| involved_parties | text[] | People involved |
| date_confidence | text | `exact`, `approximate`, `inferred` |
| source_document_id | uuid (FK) | Which document this came from |

#### `case_analysis_results`

X-Ray analysis output.

| Column | Type | Purpose |
|------, |------|---------|
| case_id | uuid (FK) | Links to cases |
| discrepancies | jsonb | Contradictions found |
| red_flags | jsonb | Prosecution weaknesses |
| opportunities | jsonb | Defense opportunities |
| scores | jsonb | Discovery Strength Rating + DOI |

#### `case_witnesses`

| Column | Type | Purpose |
|------, |------|---------|
| case_id | uuid (FK) | Links to cases |
| name | text | Witness name |
| type | text | Witness type |
| agency | text | Associated agency |
| credibility_score | integer | 0-100 credibility rating |
| threat_level | text | Threat assessment |
| dossier_status | text | Research status |
| cross_exam_ready | boolean | Whether cross-exam prep is complete |

#### `case_findings`

Categorized findings: 4 types x 5 categories x 4 severity levels.

| Column | Type | Purpose |
|------, |------|---------|
| case_id | uuid (FK) | Links to cases |
| title | text | Finding title |
| type | text | Finding type |
| category | text | Finding category |
| severity | text | `critical`, `major`, `minor`, `info` |
| verification_status | text | Verification state |

#### `evidence_items` + `evidence_custody`

Chain of custody tracking with gap detection.

| Table | Key Columns | Purpose |
|-------|-------------|---------|
| `evidence_items` | case_id, item_id, description | Physical evidence catalog |
| `evidence_custody` | evidence_item_id, transfer_date, from_party, to_party, verified | Transfer chain + gap detection |

#### `case_law_references`

| Column | Type | Purpose |
|------, |------|---------|
| case_id | uuid (FK) | Links to cases |
| case_name | text | Case citation name |
| citation | text | Legal citation |
| court | text | Court that decided |
| year | integer | Year decided |
| is_binding | boolean | Binding in this jurisdiction |
| is_good_law | boolean | Still good law (not overturned) |

#### `motion_recommendations`

| Column | Type | Purpose |
|------, |------|---------|
| case_id | uuid (FK) | Links to cases |
| motion_type | text | Type of motion |
| motion_name | text | Display name |
| severity | text | Priority level |
| status | text | Recommendation status |
| strategic_score | integer | Strategic importance score |

#### `trial_materials`

Situation Room trial prep documents.

| Column | Type | Purpose |
|------, |------|---------|
| case_id | uuid (FK) | Links to cases |
| material_type | text | Type of material |
| content | text | Material content |

#### `processing_jobs` (Migration 007)

Background job queue for discovery pipeline.

| Column | Type | Purpose |
|------, |------|---------|
| id | uuid (PK) | Auto-generated |
| case_id | uuid (FK) | Links to cases |
| job_type | text | `ocr`, `classify`, `extract`, `analyze`, `timeline`, `witness`, `citation`, `motion`, `report` |
| status | text | `queued`, `processing`, `completed`, `failed` |
| progress | integer | 0-100 percentage |
| items_produced | integer | Output count |
| retries | integer | Retry count |
| priority | integer | 1 = highest |
| started_at | timestamptz | Processing start |
| completed_at | timestamptz | Processing end |
| error | text | Error if failed |
| batch_id | uuid | Groups related jobs in a single pipeline run |

#### `operator_tasks` (Migration 007)

| Column | Type | Purpose |
|------, |------|---------|
| id | uuid (PK) | Auto-generated |
| case_id | uuid (FK) | Links to cases |
| title | text | Task description |
| type | text | `pipeline_monitoring`, `sla_breach`, `engine_down`, etc. |
| priority | text | `LOW`, `MEDIUM`, `HIGH`, `URGENT` |
| priority_rank | integer | Sort order (1 = first) |
| status | text | `open`, `in_progress`, `completed`, `dismissed` |
| due_at | timestamptz | SLA deadline |
| assigned_to | text | Operator assignment |

### Admin/Demand Tables (Migration 010)

#### `inbound_emails`

Resend inbound webhook storage.

| Column | Type | Purpose |
|------, |------|---------|
| id | uuid (PK) | Auto-generated |
| from_email | text | Sender |
| subject | text | Subject line |
| body_text | text | Plain text body |
| body_html | text | HTML body |
| message_id | text | RFC 2822 Message-ID |
| read | boolean | Read status |

#### `emerging_topics`

| Column | Type | Purpose |
|------, |------|---------|
| id | uuid (PK) | Auto-generated |
| topic | text | Topic phrase |
| post_count | integer | Number of posts detected |
| status | text | `detected`, `promoted`, `dismissed` |
| urgency | text | Urgency level |
| engagement | integer | Engagement score |
| first_seen_at | timestamptz | When first detected |

#### `content_gaps`

| Column | Type | Purpose |
|------, |------|---------|
| id | uuid (PK) | Auto-generated |
| slug | text | Suggested URL slug |
| suggested_title | text | Article title |
| gap_score | integer | Priority score |
| demand_score | integer | Demand level |
| quadrant | text | Gold Mine / Red Ocean / Risky Bet / Dead Zone |
| status | text | `identified` → `queued` → `in-progress` → `published` / `declined` |

**Uniqueness (2026-04-19, migration `20260419a_content_gaps_open_partial_unique.sql`):** The original full-table `UNIQUE (charge_type_slug, pain_point_slug)` was dropped and replaced with a PARTIAL unique index `idx_content_gaps_open_charge_pain_unique` scoped to OPEN gaps:

```
UNIQUE (charge_type_slug, pain_point_slug) NULLS NOT DISTINCT
  WHERE status IN ('identified','in-progress') AND has_blog_post = false
```

This allows the same (charge, pain) pair to have multiple historical rows (e.g., a `published` gap followed by a newly-re-`identified` gap) while still serializing auto-seeding races in `blog-ops/scripts/match-blog.mjs`'s `ensureContentGap()` and `src/lib/demand/score-demand.ts`'s content-gap upsert. Callers MUST NOT use PostgREST `onConflict: "charge_type_slug,pain_point_slug"` (42P10: no matching unique constraint) — use find-then-update-else-insert with a 23505 fallback instead. `NULLS NOT DISTINCT` ensures (`charge`, `NULL` pain) serialize correctly.

#### `abandoned_questions` (2026-04-18, migration `20260418a_abandoned_questions.sql`)

Storage for Reddit/Quora questions where the community's only answer is some variant of "hire a lawyer" (`defer_ratio >= 0.5`). Feeds the `/blog-pipeline` abandoned-question engine (Phase 2 of the 2026-04-18 plan).

| Column | Type | Purpose |
|------, |------|---------|
| id | bigserial (PK) | Auto-generated |
| source | text (NOT NULL, CHECK IN ('quora','reddit')) | Source platform |
| source_url | text (NOT NULL) | Canonical URL; `UNIQUE (source, source_url)` |
| question_text | text (NOT NULL) | Raw question body |
| charge_type_slug | text | Nullable; classified charge |
| pain_point_slug | text | Nullable; classified pain point |
| total_answers | integer (NOT NULL, default 0) | Total answers observed |
| defer_count | integer (NOT NULL, default 0) | Answers matching defer_patterns |
| defer_ratio | numeric(4,3) GENERATED STORED | `defer_count/total_answers` (`1.000` when `total_answers=0`) |
| top_answer_upvotes | integer | Nullable; highest observed upvotes |
| matched_blog_slug | text | Nullable; set by `match-blog.mjs` |
| match_confidence | smallint | Nullable; 0-10 |
| status | text (NOT NULL, default 'pending', CHECK) | `pending` \| `blog-needed` \| `answered` \| `skipped` \| `failed` |
| answered_at | timestamptz | Nullable; set on post |
| answered_url | text | Nullable; URL of posted answer |
| discovered_at | timestamptz (NOT NULL, default now()) | Row created |
| updated_at | timestamptz (NOT NULL, default now()) | Auto-updated via trigger |
| raw_meta | jsonb | Nullable; Playwright scrape payload |

**Indexes:**
- `abandoned_questions_pending_idx` — `(status, defer_ratio DESC, discovered_at DESC) WHERE status = 'pending'` (pipeline consumer ordering).
- `abandoned_questions_source_idx` — `(source, discovered_at DESC)` (per-platform dashboards).
- `abandoned_questions_charge_idx` — `(charge_type_slug) WHERE charge_type_slug IS NOT NULL`.

**Trigger:** `abandoned_questions_updated_at` BEFORE UPDATE → `updated_at = now()`.

**RLS:** enabled with no policies → default-deny for anon/authenticated. Service role bypasses RLS for pipeline writes.

#### `demand_scores`

| Column | Type | Purpose |
|------, |------|---------|
| charge_type | text | Charge or pain point |
| dimension | text | `charge_type` or `pain_point` |
| window | text | `7d`, `30d`, `90d` |
| demand_score | integer | Demand level |
| competition_score | integer | Competition level |

#### `content_performance`

| Column | Type | Purpose |
|------, |------|---------|
| blog_slug | text | Blog post identifier |
| subscriber_signups | integer | Attributed signups |
| orders_attributed | integer | Attributed orders |
| revenue_attributed | integer | Attributed revenue (cents) |

#### `discovered_subreddits`

| Column | Type | Purpose |
|------, |------|---------|
| subreddit | text | Subreddit name |
| subscriber_count | integer | Subreddit subscribers |
| relevance_score | integer | Relevance to business |
| description | text | Subreddit description |
| status | text | `pending`, `approved`, `rejected` |

## Tier 9: Data-Driven Defense Intelligence (Migration TBD)

Nine tables supporting the data-driven defense intelligence layer, judge profiles, officer reliability, sentencing distributions, appellate trends, and case feature engineering. All tables have Row Level Security enabled with `service_all` policy.

**Critical:** All columns with `source_urls` must comply with the no-hallucinated-legal-data safety rule, verification URLs MUST be stored alongside any legal claim (case law, statute, precedent, sentencing data).

#### `judge_prosecutor_pairings`

| Column | Type | Purpose |
|------, |------|---------|
| id | uuid (PK) | Auto-generated |
| judge_id | uuid (FK) | Links to judge_profiles |
| prosecutor_name | text (NOT NULL) | Named prosecutor |
| motion_type | text | Type of motion (nullable, e.g., `suppression`, `discovery`) |
| grant_rate | numeric | Percentage of motions granted (0-100) |
| sample_size | integer | Number of outcomes observed (default: 0) |
| source_urls | text[] | Verification URLs (CourtListener, docket records) |
| last_updated | timestamptz | When grant_rate was last updated |
| created_at | timestamptz | Record creation timestamp |

#### `case_feature_vectors`

| Column | Type | Purpose |
|------, |------|---------|
| cluster_id | text (PK) | CourtListener cluster ID |
| features | jsonb | Numeric feature vector for ML prediction (default: `{}`) |
| jurisdiction | text | State jurisdiction (nullable) |
| charge_slug | text | Charge category for this case (nullable) |
| created_at | timestamptz | When features were computed |

#### `officer_reliability`

| Column | Type | Purpose |
|------, |------|---------|
| id | uuid (PK) | Auto-generated |
| officer_name | text (NOT NULL) | Named law enforcement officer |
| court | text | Court jurisdiction (nullable) |
| jurisdiction | text | State jurisdiction (nullable) |
| testimony_count | integer | Number of times testified (default: 0) |
| discredited_count | integer | Number of times credibility challenged (default: 0) |
| reliability_score | numeric | Composite reliability score (0-100, nullable) |
| brady_history | jsonb | Brady violation history as objects (default: `[]`) |
| source_urls | text[] | Verification URLs (court records, opinions) |
| created_at | timestamptz | Record creation timestamp |

#### `judge_quotes`

| Column | Type | Purpose |
|------, |------|---------|
| id | uuid (PK) | Auto-generated |
| judge_id | uuid (FK) | Links to judge_profiles |
| quote | text (NOT NULL) | Extracted quote from opinion or ruling |
| topic | text | Subject area (e.g., `sentencing`, `suppression`, `credibility`) |
| case_cited | text | Case name where quote appears (nullable) |
| source_url | text | URL to full opinion (nullable, CourtListener) |
| cluster_id | text | CourtListener cluster ID (nullable) |
| created_at | timestamptz | When quote was extracted |

#### `sentencing_distributions`

| Column | Type | Purpose |
|------, |------|---------|
| id | uuid (PK) | Auto-generated |
| judge_id | uuid (FK) | Links to judge_profiles |
| jurisdiction | text | State jurisdiction (nullable) |
| charge_slug | text | Charge category (e.g., `dui-first-offense`) |
| median_months | numeric | Median sentence length (nullable) |
| p25 | numeric | 25th percentile (lower quartile) |
| p75 | numeric | 75th percentile (upper quartile) |
| sample_size | integer | Number of sentences observed (default: 0) |
| source_urls | text[] | Verification URLs (docket records, sentencing data) |
| created_at | timestamptz | Record creation timestamp |

#### `bench_jury_divergence`

| Column | Type | Purpose |
|------, |------|---------|
| id | uuid (PK) | Auto-generated |
| judge_id | uuid (FK) | Links to judge_profiles (NULL for district/locality-level aggregate data) |
| charge_slug | text | Charge/offense category (nullable) |
| bench_acquittal_rate | numeric | Acquittal rate in bench trials (CL opinion data, nullable) |
| jury_acquittal_rate | numeric | Acquittal rate in jury trials (CL opinion data, nullable) |
| bench_sample | integer | Number of bench trials (default: 0) |
| jury_sample | integer | Number of jury trials (default: 0) |
| source_urls | text[] | Verification URLs |
| created_at | timestamptz | Record creation timestamp |
| district | text | District/locality name (USSC federal districts or VA county/city names) |
| state_code | text | 2-letter state code (e.g. "VA", "FL"). Indexed. Engine queries by this. |
| bench_median_sentence | numeric | Median sentence months for bench trials |
| jury_median_sentence | numeric | Median sentence months for jury trials |
| bench_mean_sentence | numeric | Mean sentence months for bench trials |
| jury_mean_sentence | numeric | Mean sentence months for jury trials |
| trial_penalty_pct | numeric | % difference: (jury−bench)/bench × 100 |
| plea_median_sentence | numeric | Median sentence months for plea deals (context) |
| plea_sample | integer | Number of plea deals (default: 0) |
| fiscal_year_range | text | Data year range, e.g. "FY2018-FY2024" or "2024" |
| offense_category | text | Human-readable offense category |

#### `appellate_trends`

| Column | Type | Purpose |
|------, |------|---------|
| id | uuid (PK) | Auto-generated |
| argument_type | text | Type of appeal (e.g., `sentencing`, `conviction`, `procedure`) |
| jurisdiction | text | State jurisdiction (nullable) |
| year | integer | Year of appellate decision (nullable) |
| reverse_rate | numeric | Rate of reversal (0-100, nullable) |
| affirm_rate | numeric | Rate of affirmance (0-100, nullable) |
| sample_size | integer | Number of appellate decisions (default: 0) |
| source_urls | text[] | Verification URLs (appellate opinions, dockets) |
| created_at | timestamptz | Record creation timestamp |

#### `co_defendant_analysis`

| Column | Type | Purpose |
|------, |------|---------|
| id | uuid (PK) | Auto-generated |
| primary_case_id | text | Case ID for primary defendant (nullable) |
| co_defendant_case_id | text | Case ID for co-defendant (nullable) |
| outcome_diff | text | Difference in outcomes (e.g., `acquitted vs. convicted`) |
| divergence_factors | jsonb | Analyzed factors explaining divergence (default: `{}`) |
| source_urls | text[] | Verification URLs (court records, dockets) |
| created_at | timestamptz | Record creation timestamp |

#### `plea_discount_curves`

| Column | Type | Purpose |
|------, |------|---------|
| id | uuid (PK) | Auto-generated |
| jurisdiction | text | State jurisdiction (nullable) |
| charge_slug | text | Charge category (e.g., `dui-first-offense`) |
| base_sentence | numeric | Sentence without plea discount (months, nullable) |
| plea_sentence | numeric | Sentence with plea (months, nullable) |
| cooperation_bonus | numeric | Additional reduction for cooperation (months, nullable) |
| sample_size | integer | Number of cases analyzed (default: 0) |
| source_urls | text[] | Verification URLs (sentencing data, plea agreements) |
| created_at | timestamptz | Record creation timestamp |

### Judge Profiles Extensions (New Columns)

The `judge_profiles` table receives five new columns to surface Tier 9 intelligence:

| Column | Type | Purpose |
|------, |------|---------|
| jurisdiction | text | 2-letter state code (e.g., "FL") derived from positions JSONB court_id. "FEDERAL" for circuit/SCOTUS/tax courts. Indexed. Backfilled via `scripts/backfill-judge-jurisdiction.mjs`. |
| sentencing_distributions | jsonb | Per-charge sentencing percentiles aggregated from `sentencing_distributions` table (nullable) |
| judicial_quotes | jsonb | Notable holding quotes by topic, aggregated from `judge_quotes` (nullable) |
| bench_acquittal_rate | numeric | Overall acquittal rate in bench trials across all charges (nullable) |
| jury_acquittal_rate | numeric | Overall acquittal rate in jury trials across all charges (nullable) |

### Engine-Specific Tables

Tables used by the ImNotAnAttorney-engine worker pipeline (not in web app code):

| Table | Purpose |
|-------|---------|
| `document_pages` | OCR page-level output (text per page) |
| `entity_extractions` | Named entity recognition results per document |
| `finding_sources` | Source document linkage for each finding |
| `evidence_inventory` | Evidence catalog (engine's detailed version) |
| `chain_of_custody_records` | Custody chain analysis with gap detection |
| `case_persons` | Role-based person registry (witness/judge/prosecutor) |
| `case_analysis_scores` | Defense Strength Score (0-100) computation |
| `case_monitoring` | CourtListener docket alerts (War Room+ ongoing monitoring) |
| `job_cost_tracking` | Claude API cost per job (input/output tokens, cache hits, latency) |
| `legal_citations` | Citation verification results (confidence tier, source, verified date) |
| `jurisdiction_profiles` | Jurisdiction context cache (local rules, court procedures) |
| `verified_case_law` | Verified case law with Shepardize status |

## RPCs

| RPC | Purpose |
|---, |---------|
| `increment_counter(p_id TEXT)` | Atomic counter increment with upsert, returns new value |
| `increment_score_aggregate(p_charge_type TEXT, p_metric TEXT)` | Atomic aggregate increment with upsert |
| `check_rate_limit(p_key TEXT, p_max_requests INT, p_window_seconds INT)` | Sliding window rate limiter, returns boolean (true = allowed) |
| `cleanup_rate_limits()` | Removes expired rate limit entries |
| `acquire_cron_lock(p_lock_id INT)` | PostgreSQL advisory lock for cron dedup |
| `release_cron_lock(p_lock_id INT)` | Release advisory lock |
| `append_file_url(p_case_id UUID, p_url TEXT)` | Atomic array append to cases.file_urls |

## Indexes

| Index | Table(Column) | Purpose |
|-------|------------, |---------|
| `idx_orders_stripe_payment_intent` | orders(stripe_payment_intent_id) | Refund webhook matching |
| `idx_cases_court_lookup` | cases(court_case_number, court_state) | Cross-email identity matching |
| `idx_email_log_type` | email_log(email_type) | Email audit queries |
| `idx_email_log_recipient` | email_log(recipient) | Per-recipient lookups |
| `idx_email_log_case` | email_log(case_id) | Per-case email history |
| `idx_email_log_sent` | email_log(sent_at) | Time-range queries |
| `idx_docket_case` | docket_entries(case_id) | Case docket lookups |
| `idx_docket_date` | docket_entries(case_id, entry_date DESC) | Chronological docket |
| `idx_docket_hearings` | docket_entries(case_id) WHERE is_hearing = true | Hearing-only queries |
| `idx_discovery_docs_case` | discovery_documents(case_id) | Per-case document list |
| `idx_findings_case` | case_findings(case_id) | Per-case findings |
| `idx_evidence_case` | evidence_items(case_id) | Per-case evidence |
| `idx_custody_item` | evidence_custody(evidence_item_id) | Chain of custody |
| `idx_witnesses_case` | case_witnesses(case_id) | Per-case witnesses |
| `idx_citations_case` | case_law_references(case_id) | Per-case citations |
| `idx_motions_case` | motion_recommendations(case_id) | Per-case motions |
| `idx_jobs_case` | processing_jobs(case_id) | Per-case job queue |
| `idx_jobs_status` | processing_jobs(status) | Queue processing |
| `idx_tasks_case` | operator_tasks(case_id) | Per-case tasks |
| `idx_tasks_status` | operator_tasks(status) | Open task queries |
| `idx_cases_status` | cases(status) | Status-based queries |
| `idx_cases_email` | cases(email) | Per-email case lookup |
| `idx_cases_order` | cases(order_id) | Order→case join |
| `idx_subscribers_email` | subscribers(email) UNIQUE | Dedup lookups |
| `idx_drip_dedup` | drip_emails(subscriber_id, email_key) UNIQUE | Prevent duplicate sends |

### External Intelligence Layer (Phase 1, migration 20260411f)

#### `officer_external_intel`
Brady/Giglio + National Police Index data for officers. Populated by `ingest-brady-giglio.mjs` and `ingest-npi.mjs`.

| Column | Type | Purpose |
|------, |------|---------|
| id | uuid (PK) | Auto-generated |
| officer_name | text | Original name |
| officer_name_normalized | text | Lowercase, alpha-only (trgm indexed) |
| state | text | 2-letter state code |
| agency | text | Law enforcement agency |
| brady_status | text | 'listed' or null |
| brady_reason | text | Reason for Brady disclosure |
| giglio_letter_date | date | Date of Giglio letter |
| npi_employment_history | jsonb | Agency employment timeline |
| npi_is_wandering_officer | boolean | Employed by 2+ agencies |
| decertified | boolean | POST decertification flag |
| complaint_count | integer | Total complaints |
| use_of_force_count | integer | UOF incidents |
| sustained_complaints | integer | Sustained complaint count |
| credibility_risk_score | integer | Computed risk score |
| source_urls | text[] | Verification URLs (required) |
| sources | text[] | Source names |
| **UNIQUE** | (officer_name_normalized, state, agency) | |

#### `judge_sentencing_patterns`
USSC sentencing data aggregated by district. Populated by `ingest-ussc-sentencing.mjs`.

| Column | Type | Purpose |
|------, |------|---------|
| id | uuid (PK) | Auto-generated |
| judge_name | text | District name (USSC is anonymized) |
| judge_name_normalized | text | Lowercase (trgm indexed) |
| district | text | Federal district |
| state | text | State code |
| total_cases | integer | Case count |
| median_sentence_months | numeric | Median sentence |
| mean_sentence_months | numeric | Mean sentence |
| p25_sentence_months | numeric | 25th percentile |
| p75_sentence_months | numeric | 75th percentile |
| downward_departure_rate | numeric | Below-guideline rate |
| upward_departure_rate | numeric | Above-guideline rate |
| substantial_assistance_rate | numeric | 5K1.1 rate |
| offense_breakdown | jsonb | Offense type distribution |
| criminal_history_breakdown | jsonb | Criminal history categories |
| retention_elections | jsonb | Retention election data |
| aba_rating | text | ABA rating (wq/q/nq/ewq) |
| aba_rating_year | integer | Year of ABA rating |
| source_urls | text[] | Verification URLs (required) |
| data_period | text | e.g. 'FY2024' |
| **UNIQUE** | (judge_name_normalized, district) | |

#### `prosecution_profiles`
Prosecution office statistics. Deferred to Phase 2 (no free national dataset).

| Column | Type | Purpose |
|------, |------|---------|
| id | uuid (PK) | Auto-generated |
| office_name | text | Prosecutor's office |
| office_type | text | Type (SA, DA, USAO) |
| state | text | State code |
| conviction_rate | numeric | Overall conviction rate |
| plea_rate | numeric | Plea bargain rate |
| trial_rate | numeric | Trial rate |
| source_urls | text[] | Verification URLs (required) |
| **UNIQUE** | (office_name, state) | |

#### `outcome_benchmarks`
National/state outcome statistics by offense type. Populated by `ingest-bjs-outcomes.mjs`.

| Column | Type | Purpose |
|------, |------|---------|
| id | uuid (PK) | Auto-generated |
| jurisdiction_level | text | 'national' or 'state' |
| jurisdiction_name | text | State name or 'United States' |
| offense_type | text | Offense category |
| total_cases | integer | Case count |
| conviction_rate | numeric | Overall conviction rate |
| plea_trial_penalty_pct | numeric | Sentence premium for going to trial |
| median_sentence_months | numeric | Median sentence |
| source_urls | text[] | Verification URLs (required) |
| data_period | text | Dataset year |
| **UNIQUE** | (jurisdiction_level, jurisdiction_name, offense_type) | |

#### `exoneration_patterns`
Exoneration statistics by offense type. Populated by `ingest-exoneration-registry.mjs`.

| Column | Type | Purpose |
|------, |------|---------|
| id | uuid (PK) | Auto-generated |
| offense_type | text | Crime category |
| total_exonerations | integer | Count |
| false_confession_pct | numeric | FC contributing factor % |
| mistaken_id_pct | numeric | MWID contributing factor % |
| official_misconduct_pct | numeric | OM contributing factor % |
| forensic_error_pct | numeric | F/MFE contributing factor % |
| avg_years_served | numeric | Average years wrongfully served |
| top_factor | text | Highest contributing factor name |
| top_factor_pct | numeric | Highest factor % |
| source_urls | text[] | Verification URLs (required) |
| **UNIQUE** | (offense_type) | |

#### `forensic_lab_profiles`
Forensic lab accreditation/quality data. Deferred to Phase 2 (state-by-state FOIA).

| Column | Type | Purpose |
|------, |------|---------|
| id | uuid (PK) | Auto-generated |
| lab_name | text | Lab name |
| state | text | State code |
| accreditation_status | text | Current status |
| known_issues | jsonb | Documented problems |
| source_urls | text[] | Verification URLs (required) |
| **UNIQUE** | (lab_name, state) | |

#### `citation_authority`
Opinion authority scores from CourtListener citation depth analysis. Populated by `enrich-cl-citation-depth.mjs`.

| Column | Type | Purpose |
|------, |------|---------|
| cluster_id | text (PK) | CourtListener cluster ID |
| case_name | text | Case name |
| total_citing_opinions | integer | How many opinions cite this one |
| authority_score | numeric | Computed 0-100 authority score |
| source_urls | text[] | Verification URLs (required) |

#### `data_source_freshness`
Tracks ingestion recency for all external data sources.

| Column | Type | Purpose |
|------, |------|---------|
| source_key | text (PK) | e.g. 'brady_giglio_list' |
| source_name | text | Human-readable name |
| source_url | text | Download/API URL |
| last_ingested_at | timestamptz | Last successful ingest |
| last_row_count | integer | Rows from last ingest |
| staleness_threshold_days | integer | Days before flagged stale |
| is_stale | boolean | Auto-computed flag |

#### `judge_demographics`
Federal judge biographical data from JUSTFAIR (QSIDE Institute). 1,126 federal judges. Migration `20260414f_justfair_demographics.sql`.

| Column | Type | Purpose |
|------, |------|---------|
| id | uuid (PK) | Auto-generated |
| judge_name | text | Original judge name |
| judge_name_normalized | text | Lowercased for matching (GIN trigram index) |
| district | text | Federal district (e.g. "District of Columbia") |
| gender | text | Judge gender |
| race_ethnicity | text | Judge race/ethnicity |
| appointing_president | text | Appointing president name |
| appointing_party | text | Appointing party (Republican/Democrat) |
| aba_rating | text | ABA rating at confirmation |
| birth_year | integer | Birth year |
| law_school | text | Law school attended |
| senior_status_date | text | Senior status date if applicable |
| active_start | integer | Year active service began |
| active_end | integer | Year active service ended (null = current) |
| source_urls | text[] | Verification URLs (required) |
| created_at | timestamptz | Row creation timestamp |

Unique constraint: `(judge_name_normalized, district)`. Indexes: GIN trigram on `judge_name_normalized`, btree on `district`, btree on `appointing_party`.

#### `judge_sentencing_demographics`
Per-judge sentencing patterns broken down by defendant race. JUSTFAIR source. Migration `20260414f_justfair_demographics.sql`.

| Column | Type | Purpose |
|------, |------|---------|
| id | uuid (PK) | Auto-generated |
| judge_name_normalized | text | Lowercased judge name (GIN trigram index) |
| district | text | Federal district |
| defendant_race | text | Defendant race category |
| total_cases | integer | Number of cases for this judge+race combo |
| median_sentence_months | numeric | Median sentence length in months |
| mean_sentence_months | numeric | Mean sentence length in months |
| guideline_departure_rate | numeric | Rate of guideline departures (0-1) |
| avg_departure_pct | numeric | Average departure percentage |
| source_urls | text[] | Verification URLs (required) |
| created_at | timestamptz | Row creation timestamp |

Unique constraint: `(judge_name_normalized, district, defendant_race)`. Indexes: GIN trigram on `judge_name_normalized`, btree on `district`, btree on `defendant_race`.

#### `co_defendant_analysis`
Co-defendant outcome divergence. Populated by `bulk-master-extractor.mjs`.

| Column | Type | Purpose |
|------, |------|---------|
| id | uuid (PK) | Auto-generated |
| primary_case_id | text | Primary case cluster ID |
| co_defendant_case_id | text | Co-defendant case cluster ID |
| outcome_diff | text | Outcome divergence description |
| divergence_factors | jsonb | Contributing factors |
| source_urls | text[] | Verification URLs |

## Partner & Reminder Tables
*(Added by migrations post-012, not in original snapshot)*

#### `court_reminders`

| Column | Type | Purpose |
|------, |------|---------|
| id | uuid (PK) | Auto-generated |
| token | text | Unsubscribe/opt-in token |
| first_name | text | Client first name |
| last_name | text | Client last name (optional) |
| email | text | Client email |
| charge_type | text | Primary charge type |
| county_state | text | Jurisdiction |
| court_date | text | Next court date |
| recommended_tier | text | Suggested product tier |
| partner_promo_code | text | Referring partner promo code |
| status | text | `active` / `completed` / `unsubscribed` |
| reminders_sent | text[] | Keys of sent reminders |
| created_at | timestamptz | Row creation timestamp |
| converted_at | timestamptz | When client purchased |
| order_id | uuid | Linked order (FK) |
| indemnitor_name | text | Bondsman indemnitor name |
| indemnitor_email | text | Bondsman indemnitor email |
| phone | text | Client phone (E.164), added migration 20260414a |
| sms_consent_at | timestamptz | 10DLC consent timestamp, added migration 20260414a |
| notification_prefs | jsonb | Channel preference overrides (JSONB), added migration 20260414a |

#### `partners`

| Column | Type | Purpose |
|------, |------|---------|
| id | uuid (PK) | Auto-generated |
| name | text | Partner display name |
| email | text | Partner email (unique) |
| phone | text | Partner phone |
| company | text | Company name |
| promo_code | text | Unique referral code |
| commission_rate | integer | Commission percentage (default 10; see migration 20250101000012_referral-system.sql) |
| commission_tier | text | `partner` / `silver` / `gold` |
| status | text | `pending` / `approved` / `suspended` |
| preferred_payment_method | text | `zelle` / `venmo` / `check` / `paypal` |
| payment_zelle | text | Zelle handle |
| payment_venmo | text | Venmo handle |
| payment_check_address | text | Mailing address for checks |
| payment_paypal | text | PayPal email |
| total_referrals | integer | Lifetime referral count |
| total_commission | numeric | Lifetime commission earned (cents) |
| total_paid_out | numeric | Lifetime commission paid out (cents) |
| notification_prefs | jsonb | Channel preference overrides (JSONB), added migration 20260414a |
| city | text | Partner city (from application) |
| region | text | Partner region/state (from application) |
| source | text | Partner type: `bondsman`, `attorney`, `generic`, or null |
| last_activation_email_key | text | Last drip email sent (cron dedup) |
| check_in_enabled | boolean | NOT NULL DEFAULT true, Operational mode. true=Check-in mode (daily check-ins + court reminders + schedule controls). false=Referral mode (reminders + hearing prep, no check-in workflow). Backfilled false for non-bondsmen on 2026-04-17. Added migration 20260417a. |
| flip_at | timestamptz | NULL, Last mode-flip timestamp. Drives FlipBanner visibility for 14 days post-flip. Set server-side by settings PATCH. Added migration 20260417a. |
| logo_url | text | Public URL to partner logo — Supabase Storage (if `logo_storage_path` present) or Brandfetch CDN. Null until partner brands. Added migration 20260419f. |
| logo_storage_path | text | Supabase Storage object key under `partner-logos` bucket. Null when `logo_url` points to remote Brandfetch CDN. Added migration 20260419f. |
| brand_color_primary | text | Hex `#RRGGBB` (CHECK constrained). Partner primary color for CTAs + accents on /r/[code] pre-quiz. Added migration 20260419f. |
| brand_color_accent | text | Hex `#RRGGBB` (CHECK constrained). Secondary brand accent. Added migration 20260419f. |
| brand_color_bg | text | Hex `#RRGGBB` (CHECK constrained). Optional surface-bg override. Added migration 20260419f. |
| brand_color_source | text | Provenance: `brandfetch` / `colorthief` / `manual` (CHECK constrained). Added migration 20260419f. |
| website_url | text | Partner website URL — Brandfetch lookup key + footer "Visit Partner" link. Added migration 20260419f. |
| brand_contrast_passed | boolean | DEFAULT false. True iff `brand_color_primary` passes WCAG AA (>=4.5:1) against either `#000` or `#FFF`. Shell falls back to INAA default when false. Added migration 20260419f. |
| brand_updated_at | timestamptz | Stamp on any brand field write. Drives cache invalidation + dashboard "last updated" UI. Indexed. Added migration 20260419f. |

#### `referrals`

| Column | Type | Purpose |
|------, |------|---------|
| id | uuid (PK) | Auto-generated |
| partner_id | uuid (FK) | Referring partner |
| order_id | uuid (FK) | Linked order |
| commission_amount | numeric | Commission earned (cents) |
| status | text | `pending` / `paid` / `refunded` |
| created_at | timestamptz | Row creation timestamp |
| locked_at | timestamptz | Commission lock timestamp (45-day holdback), added migration 20260414a |

#### `partner_events`
Funnel + audit event log per partner. Service-role write only via `createAdminClient()`. Added migration 20260414g. CHECK constraint on `event_type` widened 20260417b.

| Column | Type | Purpose |
|------, |------|---------|
| id | uuid (PK) | Auto-generated |
| partner_id | uuid (FK) | Referring partner (NOT NULL) |
| event_type | text (CHECK) | One of: `link_click`, `quiz_start`, `quiz_complete`, `purchase`, `schedule_denied_referral_mode` |
| metadata | jsonb | Event payload (e.g., `{ client_id, promo_code }` for schedule-denied; UTM + referer for funnel events) |
| created_at | timestamptz | Row creation timestamp |

**`event_type` values and meaning:**
- `link_click`, `quiz_start`, `quiz_complete`, `purchase`, conversion funnel (migration 20260414g). Powers `partner_conversion_funnel(p_partner_id)` RPC.
- `schedule_denied_referral_mode`, audit trail for PATCH /api/partner/clients/[id]/schedule attempts by partners with `check_in_enabled=false` (referral mode). Added migration 20260417b. Writes happen via `after()` so they don't gate the 403 response.

Index: `idx_partner_events_funnel(partner_id, event_type, created_at)`.
RLS: enabled. No public policies, service_role only.

#### `sms_log`
SMS delivery audit log. Mirrors `email_log` pattern. Service-role write only via `createAdminClient()`.

| Column | Type | Purpose |
|------, |------|---------|
| id | uuid (PK) | Auto-generated |
| recipient | text (indexed) | E.164 phone number |
| body | text | Message body |
| category | text (indexed) | Message category (e.g. `court_reminder`, `magic_link`) |
| court_reminder_id | uuid (FK) | Linked court reminder (nullable, ON DELETE SET NULL) |
| partner_id | uuid (FK) | Linked partner (nullable, ON DELETE SET NULL) |
| success | boolean | Delivery success flag |
| error_message | text | Error detail if failed |
| metadata | jsonb | Provider response metadata |
| created_at | timestamptz | Row creation timestamp |

RLS: enabled. Policy `sms_log_deny_all` denies all anon/authenticated access.

## Triggers

- `update_cases_updated_at`, Auto-sets `updated_at = now()` on every cases row update
- `update_docket_entries_updated_at`, Same for docket_entries
- `update_<table>_updated_at`, All 12 reference tables have `moddatetime` triggers
