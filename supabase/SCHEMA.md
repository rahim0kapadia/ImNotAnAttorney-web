# Database Schema Reference

**Extracted from:** deprecated `docs/ARCHITECTURE.md` (deleted 2026-04-07)
**Status:** Schema snapshot as of migration ~012. Tables added by later migrations (referral-system, partner-portal, feature-flags, customer-portal, batch-id, charge-taxonomy, cron-executions, research-columns, blog-drafts, score-results, acquire-cron-lock-rpc, report-token-hash, guarantee_invocations, standalone_products, calculator_email_rpc, case-law-verification, phase0_feature_flags, enrichment-and-case-law-data) are NOT documented here — audit `supabase/migrations/20250101000012*.sql` onward to complete.
**Source of truth:** Actual migrations in `supabase/migrations/*.sql`. This file is a reference snapshot; always verify against current migrations for new work.

## Tables

### Core Tables

#### `orders`

| Column | Type | Purpose |
|--------|------|---------|
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
|--------|------|---------|
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
|--------|------|---------|
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
|--------|------|---------|
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
|--------|------|---------|
| subscriber_id | uuid (FK) | Links to subscribers |
| email_key | text | Unique key per email template |
| created_at | timestamptz | When sent |
| **Unique constraint** | `(subscriber_id, email_key)` | Prevents duplicate sends |

### Reference Data Tables (12 tables — Migration 004)

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

Tracks all email send calls. Fire-and-forget logging — insert failures never crash the calling route.

| Column | Type | Purpose |
|--------|------|---------|
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
|--------|------|---------|
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
|--------|------|---------|
| id | uuid (PK) | Auto-generated |
| started_at | timestamptz | When cron started |
| completed_at | timestamptz | When cron finished |
| parts_run | integer | How many parts executed |
| errors | text[] | Any errors encountered |

#### `rate_limits` (Migration 004)

| Column | Type | Purpose |
|--------|------|---------|
| key | text (PK) | Rate limit identifier (e.g., `checkout:192.168.1.1`) |
| window_start | timestamptz | Current window start |
| request_count | integer | Requests in current window |

#### `counters` (Migration 012)

Generic atomic counter infrastructure for the Defense Accountability Index.

| Column | Type | Purpose |
|--------|------|---------|
| id | text (PK) | Counter identifier (e.g., `score_completions`) |
| value | bigint | Current count |
| updated_at | timestamptz | Last increment time |

#### `score_aggregates` (Migration 012)

Anonymous aggregate tracking from Defense Milestone Score. NO individual answers stored.

| Column | Type | Purpose |
|--------|------|---------|
| charge_type | text (PK part) | Charge category |
| metric | text (PK part) | What's being counted |
| count | bigint | Aggregate count |

**Tracked metrics:** `total_by_charge`, `no_motions_filed`, `never_seen_discovery`, `communication_never`, `no_strategy_discussion`.

#### `docket_entries` (Migration 011)

Court docket data from external sources (CourtListener, JudyRecords, clerk portals).

| Column | Type | Purpose |
|--------|------|---------|
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
|--------|------|---------|
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
|--------|------|---------|
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
|--------|------|---------|
| case_id | uuid (FK) | Links to cases |
| event_date | date | When the event occurred |
| event_text | text | Description |
| involved_parties | text[] | People involved |
| date_confidence | text | `exact`, `approximate`, `inferred` |
| source_document_id | uuid (FK) | Which document this came from |

#### `case_analysis_results`

X-Ray analysis output.

| Column | Type | Purpose |
|--------|------|---------|
| case_id | uuid (FK) | Links to cases |
| discrepancies | jsonb | Contradictions found |
| red_flags | jsonb | Prosecution weaknesses |
| opportunities | jsonb | Defense opportunities |
| scores | jsonb | Discovery Strength Rating + DOI |

#### `case_witnesses`

| Column | Type | Purpose |
|--------|------|---------|
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
|--------|------|---------|
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
|--------|------|---------|
| case_id | uuid (FK) | Links to cases |
| case_name | text | Case citation name |
| citation | text | Legal citation |
| court | text | Court that decided |
| year | integer | Year decided |
| is_binding | boolean | Binding in this jurisdiction |
| is_good_law | boolean | Still good law (not overturned) |

#### `motion_recommendations`

| Column | Type | Purpose |
|--------|------|---------|
| case_id | uuid (FK) | Links to cases |
| motion_type | text | Type of motion |
| motion_name | text | Display name |
| severity | text | Priority level |
| status | text | Recommendation status |
| strategic_score | integer | Strategic importance score |

#### `trial_materials`

Situation Room trial prep documents.

| Column | Type | Purpose |
|--------|------|---------|
| case_id | uuid (FK) | Links to cases |
| material_type | text | Type of material |
| content | text | Material content |

#### `processing_jobs` (Migration 007)

Background job queue for discovery pipeline.

| Column | Type | Purpose |
|--------|------|---------|
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
|--------|------|---------|
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
|--------|------|---------|
| id | uuid (PK) | Auto-generated |
| from_email | text | Sender |
| subject | text | Subject line |
| body_text | text | Plain text body |
| body_html | text | HTML body |
| message_id | text | RFC 2822 Message-ID |
| read | boolean | Read status |

#### `emerging_topics`

| Column | Type | Purpose |
|--------|------|---------|
| id | uuid (PK) | Auto-generated |
| topic | text | Topic phrase |
| post_count | integer | Number of posts detected |
| status | text | `detected`, `promoted`, `dismissed` |
| urgency | text | Urgency level |
| engagement | integer | Engagement score |
| first_seen_at | timestamptz | When first detected |

#### `content_gaps`

| Column | Type | Purpose |
|--------|------|---------|
| id | uuid (PK) | Auto-generated |
| slug | text | Suggested URL slug |
| suggested_title | text | Article title |
| gap_score | integer | Priority score |
| demand_score | integer | Demand level |
| quadrant | text | Gold Mine / Red Ocean / Risky Bet / Dead Zone |
| status | text | `identified` → `queued` → `in-progress` → `published` / `declined` |

#### `demand_scores`

| Column | Type | Purpose |
|--------|------|---------|
| charge_type | text | Charge or pain point |
| dimension | text | `charge_type` or `pain_point` |
| window | text | `7d`, `30d`, `90d` |
| demand_score | integer | Demand level |
| competition_score | integer | Competition level |

#### `content_performance`

| Column | Type | Purpose |
|--------|------|---------|
| blog_slug | text | Blog post identifier |
| subscriber_signups | integer | Attributed signups |
| orders_attributed | integer | Attributed orders |
| revenue_attributed | integer | Attributed revenue (cents) |

#### `discovered_subreddits`

| Column | Type | Purpose |
|--------|------|---------|
| subreddit | text | Subreddit name |
| subscriber_count | integer | Subreddit subscribers |
| relevance_score | integer | Relevance to business |
| description | text | Subreddit description |
| status | text | `pending`, `approved`, `rejected` |

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
|-----|---------|
| `increment_counter(p_id TEXT)` | Atomic counter increment with upsert, returns new value |
| `increment_score_aggregate(p_charge_type TEXT, p_metric TEXT)` | Atomic aggregate increment with upsert |
| `check_rate_limit(p_key TEXT, p_max_requests INT, p_window_seconds INT)` | Sliding window rate limiter, returns boolean (true = allowed) |
| `cleanup_rate_limits()` | Removes expired rate limit entries |
| `acquire_cron_lock(p_lock_id INT)` | PostgreSQL advisory lock for cron dedup |
| `release_cron_lock(p_lock_id INT)` | Release advisory lock |
| `append_file_url(p_case_id UUID, p_url TEXT)` | Atomic array append to cases.file_urls |

## Indexes

| Index | Table(Column) | Purpose |
|-------|--------------|---------|
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

## Triggers

- `update_cases_updated_at` — Auto-sets `updated_at = now()` on every cases row update
- `update_docket_entries_updated_at` — Same for docket_entries
- `update_<table>_updated_at` — All 12 reference tables have `moddatetime` triggers
