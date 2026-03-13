-- =============================================================================
-- ImNotAnAttorney — Full Database Schema
-- Project: jxjbjmgdukwkoclydqdr (Supabase)
-- Exported: 2026-03-13T01:22:57.471Z
-- Tables: 52
-- Functions: 11
-- Triggers: 38
-- RLS Policies: 26
-- =============================================================================

-- =============================================================================
-- EXTENSIONS
-- =============================================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS moddatetime SCHEMA extensions;

-- =============================================================================
-- SEQUENCES
-- =============================================================================
CREATE SEQUENCE IF NOT EXISTS public.content_assets_id_seq AS integer;
CREATE SEQUENCE IF NOT EXISTS public.content_gaps_id_seq AS integer;
CREATE SEQUENCE IF NOT EXISTS public.content_performance_id_seq AS integer;
CREATE SEQUENCE IF NOT EXISTS public.content_posts_id_seq AS integer;
CREATE SEQUENCE IF NOT EXISTS public.demand_scores_id_seq AS integer;
CREATE SEQUENCE IF NOT EXISTS public.discovered_subreddits_id_seq AS integer;
CREATE SEQUENCE IF NOT EXISTS public.emerging_topics_id_seq AS integer;
CREATE SEQUENCE IF NOT EXISTS public.intake_questions_id_seq AS integer;
CREATE SEQUENCE IF NOT EXISTS public.reddit_signals_id_seq AS integer;

-- =============================================================================
-- TABLES
-- =============================================================================

-- Table: audit_runs
CREATE TABLE IF NOT EXISTS public.audit_runs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  report_source text NOT NULL,
  charge_type text NOT NULL,
  tier text DEFAULT 'case-decoder'::text NOT NULL,
  model text NOT NULL,
  gate_passed boolean NOT NULL,
  complete boolean DEFAULT true NOT NULL,
  teams jsonb NOT NULL,
  total_pass integer DEFAULT 0 NOT NULL,
  total_needs_work integer DEFAULT 0 NOT NULL,
  total_fail integer DEFAULT 0 NOT NULL,
  cost_usd numeric,
  duration_ms integer,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT audit_runs_pkey PRIMARY KEY (id)
);

-- Table: buyer_states
CREATE TABLE IF NOT EXISTS public.buyer_states (
  id text NOT NULL,
  label text NOT NULL,
  signal_rules jsonb NOT NULL,
  need text NOT NULL,
  addressing text NOT NULL,
  anti_pattern text NOT NULL,
  source text NOT NULL,
  active boolean DEFAULT true NOT NULL,
  sort_order integer DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT buyer_states_pkey PRIMARY KEY (id)
);

-- Table: case_findings
CREATE TABLE IF NOT EXISTS public.case_findings (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  case_id uuid NOT NULL,
  finding_type text NOT NULL,
  category text NOT NULL,
  severity text DEFAULT 'MEDIUM'::text NOT NULL,
  severity_rank integer DEFAULT 3 NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  question text,
  significance text,
  doc1_id uuid,
  doc1_page integer,
  doc1_excerpt text,
  doc2_id uuid,
  doc2_page integer,
  doc2_excerpt text,
  value1 text,
  value2 text,
  difference text,
  motion_types text[],
  attack_vectors text[],
  verification_status text DEFAULT 'unverified'::text NOT NULL,
  verified_at timestamp with time zone,
  confidence text DEFAULT 'MEDIUM'::text NOT NULL,
  witness_id uuid,
  generated_by text,
  reviewed boolean DEFAULT false NOT NULL,
  notes text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT case_findings_pkey PRIMARY KEY (id)
);

-- Table: case_law_references
CREATE TABLE IF NOT EXISTS public.case_law_references (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  case_id uuid NOT NULL,
  case_name text NOT NULL,
  citation text NOT NULL,
  court text,
  year integer,
  holding text,
  key_quote text,
  application text,
  is_binding boolean DEFAULT true NOT NULL,
  is_good_law boolean DEFAULT true NOT NULL,
  shepardized_at timestamp with time zone,
  verification_url text,
  motion_id uuid,
  finding_id uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT case_law_references_pkey PRIMARY KEY (id)
);

-- Table: case_persons
CREATE TABLE IF NOT EXISTS public.case_persons (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  case_id uuid NOT NULL,
  person_type text NOT NULL,
  name text NOT NULL,
  full_name text,
  title text,
  court text,
  bar_number text,
  profile jsonb,
  research_status text DEFAULT 'pending'::text NOT NULL,
  threat_level text,
  dossier_html text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT case_persons_pkey PRIMARY KEY (id),
  CONSTRAINT case_persons_case_id_person_type_name_key UNIQUE (case_id, person_type, name)
);

-- Table: case_updates
CREATE TABLE IF NOT EXISTS public.case_updates (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  case_id uuid NOT NULL,
  update_type text NOT NULL,
  update_number integer NOT NULL,
  period_start timestamp with time zone NOT NULL,
  period_end timestamp with time zone NOT NULL,
  summary text,
  new_findings jsonb,
  status_changes jsonb,
  upcoming_deadlines jsonb,
  questions text[],
  content_html text,
  delivered boolean DEFAULT false NOT NULL,
  delivered_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT case_updates_pkey PRIMARY KEY (id)
);

-- Table: case_witnesses
CREATE TABLE IF NOT EXISTS public.case_witnesses (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  case_id uuid NOT NULL,
  name text NOT NULL,
  full_name text,
  name_variants text[],
  witness_type text NOT NULL,
  subtype text,
  agency text,
  title text,
  badge_number text,
  doc_count integer DEFAULT 0 NOT NULL,
  finding_count integer DEFAULT 0 NOT NULL,
  high_severity_count integer DEFAULT 0 NOT NULL,
  credibility_score real,
  reliability_dimensions jsonb,
  threat_level text,
  dossier_status text DEFAULT 'pending'::text NOT NULL,
  research_status text DEFAULT 'pending'::text NOT NULL,
  research_priority integer DEFAULT 5 NOT NULL,
  will_testify boolean DEFAULT true NOT NULL,
  testimony_order integer,
  cross_exam_ready boolean DEFAULT false NOT NULL,
  notes text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT case_witnesses_pkey PRIMARY KEY (id),
  CONSTRAINT case_witnesses_case_id_name_key UNIQUE (case_id, name)
);

-- Table: cases
CREATE TABLE IF NOT EXISTS public.cases (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  order_id uuid NOT NULL,
  email text NOT NULL,
  tier text NOT NULL,
  status text DEFAULT 'intake'::text NOT NULL,
  intake_id uuid,
  file_urls text[],
  deliverable_url text,
  notes text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  commenced_at timestamp with time zone,
  report_html text,
  report_token uuid,
  generated_at timestamp with time zone,
  delivered_at timestamp with time zone,
  reviewed_by text,
  reviewed_at timestamp with time zone,
  review_reminder_sent boolean DEFAULT false,
  charge_type text,
  report_token_expires_at timestamp with time zone,
  eval_results jsonb,
  buyer_states jsonb,
  is_included_deliverable boolean DEFAULT false,
  parent_order_id uuid,
  court_case_number text,
  court_state text,
  court_county text,
  section_outputs jsonb,
  judge_research_data jsonb,
  prior_case_id uuid,
  phase_a_completed_at timestamp with time zone,
  phase_b_completed_at timestamp with time zone,
  delivery_due_at timestamp with time zone,
  next_update_due_at timestamp with time zone,
  phase text,
  phase_started_at timestamp with time zone,
  document_count integer DEFAULT 0 NOT NULL,
  finding_count integer DEFAULT 0 NOT NULL,
  witness_count integer DEFAULT 0 NOT NULL,
  discovery_health_score integer,
  defense_opportunity_index jsonb,
  upgrade_order_ids uuid[],
  data_retention_until timestamp with time zone,
  data_purged_at timestamp with time zone,
  purge_reason text,
  CONSTRAINT cases_pkey PRIMARY KEY (id)
);

-- Table: charge_packs
CREATE TABLE IF NOT EXISTS public.charge_packs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  slug text NOT NULL,
  display_name text NOT NULL,
  charge_type text NOT NULL,
  price_cents integer NOT NULL,
  description text,
  contents jsonb DEFAULT '[]'::jsonb NOT NULL,
  pdf_storage_path text,
  is_active boolean DEFAULT true NOT NULL,
  upgrade_credit_window_days integer DEFAULT 30 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT charge_packs_pkey PRIMARY KEY (id),
  CONSTRAINT charge_packs_slug_key UNIQUE (slug)
);

-- Table: charge_types
CREATE TABLE IF NOT EXISTS public.charge_types (
  slug text NOT NULL,
  label text NOT NULL,
  jurisdiction text NOT NULL,
  parent_slug text,
  expert_slugs text[],
  intake_question_count integer DEFAULT 4,
  sort_order integer DEFAULT 0 NOT NULL,
  active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  prompt_label text,
  focus_areas text,
  CONSTRAINT charge_types_pkey PRIMARY KEY (slug)
);

-- Table: content_assets
CREATE TABLE IF NOT EXISTS public.content_assets (
  id integer DEFAULT nextval('content_assets_id_seq'::regclass) NOT NULL,
  campaign_slug text NOT NULL,
  asset_type text NOT NULL,
  content text NOT NULL,
  target_subreddits text[],
  utm_params text,
  personalization_notes text,
  tone_checks text[],
  pain_point_id integer,
  active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT content_assets_pkey PRIMARY KEY (id)
);

-- Table: content_gaps
CREATE TABLE IF NOT EXISTS public.content_gaps (
  id integer DEFAULT nextval('content_gaps_id_seq'::regclass) NOT NULL,
  charge_type_slug text NOT NULL,
  pain_point_slug text,
  demand_quadrant text,
  demand_score numeric(4,2) DEFAULT 0 NOT NULL,
  has_blog_post boolean DEFAULT false NOT NULL,
  blog_slug text,
  gap_score numeric(4,2) DEFAULT 0 NOT NULL,
  suggested_title text,
  suggested_keywords text[],
  status text DEFAULT 'identified'::text NOT NULL,
  decided_at timestamp with time zone,
  notes text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT content_gaps_pkey PRIMARY KEY (id),
  CONSTRAINT content_gaps_charge_type_slug_pain_point_slug_key UNIQUE (charge_type_slug, pain_point_slug)
);

-- Table: content_pain_points
CREATE TABLE IF NOT EXISTS public.content_pain_points (
  id integer NOT NULL,
  category text NOT NULL,
  title text NOT NULL,
  real_post_quote text NOT NULL,
  emotional_tone text NOT NULL,
  frequency text NOT NULL,
  blog_title text NOT NULL,
  blog_teaser text NOT NULL,
  target_keyword text NOT NULL,
  priority_rank integer,
  search_volume text,
  emotional_intensity text,
  blog_slug text,
  active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT content_pain_points_pkey PRIMARY KEY (id)
);

-- Table: content_performance
CREATE TABLE IF NOT EXISTS public.content_performance (
  id integer DEFAULT nextval('content_performance_id_seq'::regclass) NOT NULL,
  content_post_id integer,
  blog_slug text NOT NULL,
  subscriber_signups integer DEFAULT 0 NOT NULL,
  score_submissions integer DEFAULT 0 NOT NULL,
  orders_attributed integer DEFAULT 0 NOT NULL,
  revenue_attributed numeric(10,2) DEFAULT 0 NOT NULL,
  charge_type_slug text,
  pain_point_slug text,
  demand_score_at_publish numeric(4,2),
  current_demand_score numeric(4,2),
  window_start timestamp with time zone NOT NULL,
  window_end timestamp with time zone NOT NULL,
  window_label text NOT NULL,
  computed_at timestamp with time zone DEFAULT now() NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT content_performance_pkey PRIMARY KEY (id),
  CONSTRAINT content_performance_blog_slug_window_label_window_start_key UNIQUE (blog_slug, window_label, window_start)
);

-- Table: content_posts
CREATE TABLE IF NOT EXISTS public.content_posts (
  id integer DEFAULT nextval('content_posts_id_seq'::regclass) NOT NULL,
  blog_slug text NOT NULL,
  pain_point_id integer,
  primary_subreddit text NOT NULL,
  secondary_subreddits text[],
  priority text NOT NULL,
  status text DEFAULT 'published'::text NOT NULL,
  published_url text,
  active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT content_posts_pkey PRIMARY KEY (id),
  CONSTRAINT content_posts_blog_slug_key UNIQUE (blog_slug)
);

-- Table: cron_runs
CREATE TABLE IF NOT EXISTS public.cron_runs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  ran_at timestamp with time zone DEFAULT now(),
  result jsonb,
  CONSTRAINT cron_runs_pkey PRIMARY KEY (id)
);

-- Table: cv_runs
CREATE TABLE IF NOT EXISTS public.cv_runs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  project text NOT NULL,
  run_type text DEFAULT 'full'::text NOT NULL,
  started_at timestamp with time zone NOT NULL,
  completed_at timestamp with time zone DEFAULT now() NOT NULL,
  duration_ms integer,
  total_probes integer DEFAULT 0 NOT NULL,
  passed_probes integer DEFAULT 0 NOT NULL,
  failed_probes integer DEFAULT 0 NOT NULL,
  hypotheses_tested text[] DEFAULT '{}'::text[],
  hypotheses_violated text[] DEFAULT '{}'::text[],
  eval_results jsonb,
  adversarial_results jsonb,
  probe_details jsonb,
  trend_alerts jsonb,
  metadata jsonb DEFAULT '{}'::jsonb,
  CONSTRAINT cv_runs_pkey PRIMARY KEY (id)
);

-- Table: data_purge_log
CREATE TABLE IF NOT EXISTS public.data_purge_log (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  case_id uuid NOT NULL,
  email text NOT NULL,
  tier text NOT NULL,
  purge_reason text NOT NULL,
  documents_deleted integer DEFAULT 0 NOT NULL,
  pages_deleted integer DEFAULT 0 NOT NULL,
  findings_deleted integer DEFAULT 0 NOT NULL,
  witnesses_deleted integer DEFAULT 0 NOT NULL,
  dossiers_deleted integer DEFAULT 0 NOT NULL,
  storage_bytes_freed bigint DEFAULT 0 NOT NULL,
  purged_at timestamp with time zone DEFAULT now() NOT NULL,
  purged_by text DEFAULT 'system'::text NOT NULL,
  CONSTRAINT data_purge_log_pkey PRIMARY KEY (id)
);

-- Table: demand_scores
CREATE TABLE IF NOT EXISTS public.demand_scores (
  id integer DEFAULT nextval('demand_scores_id_seq'::regclass) NOT NULL,
  dimension_type text NOT NULL,
  dimension_slug text NOT NULL,
  dimension_label text NOT NULL,
  window_start timestamp with time zone NOT NULL,
  window_end timestamp with time zone NOT NULL,
  window_label text NOT NULL,
  post_count integer DEFAULT 0 NOT NULL,
  question_count integer DEFAULT 0 NOT NULL,
  total_score integer DEFAULT 0 NOT NULL,
  total_comments integer DEFAULT 0 NOT NULL,
  avg_score numeric(6,2) DEFAULT 0 NOT NULL,
  avg_comments numeric(6,2) DEFAULT 0 NOT NULL,
  avg_urgency numeric(4,2) DEFAULT 0 NOT NULL,
  high_urgency_count integer DEFAULT 0 NOT NULL,
  prev_period_post_count integer,
  trend_direction text,
  trend_pct numeric(6,2),
  demand_score numeric(4,2) DEFAULT 0 NOT NULL,
  competition_score numeric(4,2) DEFAULT 0 NOT NULL,
  opportunity_score numeric(4,2) DEFAULT 0 NOT NULL,
  quadrant text DEFAULT 'UNKNOWN'::text NOT NULL,
  has_blog_coverage boolean DEFAULT false NOT NULL,
  blog_post_count integer DEFAULT 0 NOT NULL,
  content_gap_score numeric(4,2) DEFAULT 0 NOT NULL,
  scored_at timestamp with time zone DEFAULT now() NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT demand_scores_pkey PRIMARY KEY (id),
  CONSTRAINT demand_scores_dimension_type_dimension_slug_window_label_wi_key UNIQUE (dimension_type, dimension_slug, window_label, window_start)
);

-- Table: discovered_subreddits
CREATE TABLE IF NOT EXISTS public.discovered_subreddits (
  id integer DEFAULT nextval('discovered_subreddits_id_seq'::regclass) NOT NULL,
  subreddit text NOT NULL,
  display_name text,
  subscribers integer DEFAULT 0 NOT NULL,
  description text,
  discovered_via_charge_type text,
  relevance_score numeric(4,2) DEFAULT 0 NOT NULL,
  status text DEFAULT 'candidate'::text NOT NULL,
  approved_at timestamp with time zone,
  last_checked_at timestamp with time zone DEFAULT now() NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT discovered_subreddits_pkey PRIMARY KEY (id),
  CONSTRAINT discovered_subreddits_subreddit_key UNIQUE (subreddit)
);

-- Table: discovery_documents
CREATE TABLE IF NOT EXISTS public.discovery_documents (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  case_id uuid NOT NULL,
  storage_path text NOT NULL,
  original_name text NOT NULL,
  file_type text NOT NULL,
  mime_type text,
  file_size_bytes bigint NOT NULL,
  file_hash text,
  doc_type text,
  doc_subtype text,
  doc_number text,
  doc_date date,
  doc_author text,
  disc_number integer,
  status text DEFAULT 'uploaded'::text NOT NULL,
  page_count integer,
  ocr_method text,
  error_message text,
  retry_count integer DEFAULT 0 NOT NULL,
  version integer DEFAULT 1 NOT NULL,
  supersedes_id uuid,
  uploaded_at timestamp with time zone DEFAULT now() NOT NULL,
  processed_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT discovery_documents_pkey PRIMARY KEY (id)
);

-- Table: document_entities
CREATE TABLE IF NOT EXISTS public.document_entities (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  document_id uuid NOT NULL,
  case_id uuid NOT NULL,
  page_id uuid,
  entity_type text NOT NULL,
  entity_value text NOT NULL,
  normalized text,
  context text,
  page_number integer,
  confidence text DEFAULT 'MEDIUM'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT document_entities_pkey PRIMARY KEY (id)
);

-- Table: document_pages
CREATE TABLE IF NOT EXISTS public.document_pages (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  document_id uuid NOT NULL,
  case_id uuid NOT NULL,
  page_number integer NOT NULL,
  content text,
  char_count integer,
  word_count integer,
  confidence real,
  needs_review boolean DEFAULT false NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT document_pages_pkey PRIMARY KEY (id),
  CONSTRAINT document_pages_document_id_page_number_key UNIQUE (document_id, page_number)
);

-- Table: drip_emails
CREATE TABLE IF NOT EXISTS public.drip_emails (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  subscriber_id uuid NOT NULL,
  email_key text NOT NULL,
  sent_at timestamp with time zone DEFAULT now(),
  CONSTRAINT drip_emails_pkey PRIMARY KEY (id),
  CONSTRAINT drip_emails_subscriber_id_email_key_key UNIQUE (subscriber_id, email_key)
);

-- Table: email_log
CREATE TABLE IF NOT EXISTS public.email_log (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  recipient text NOT NULL,
  subject text NOT NULL,
  category text NOT NULL,
  email_key text,
  case_id uuid,
  order_id uuid,
  resend_id text,
  success boolean NOT NULL,
  error_message text,
  metadata jsonb,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT email_log_pkey PRIMARY KEY (id)
);

-- Table: emerging_topics
CREATE TABLE IF NOT EXISTS public.emerging_topics (
  id integer DEFAULT nextval('emerging_topics_id_seq'::regclass) NOT NULL,
  topic_phrases text[] NOT NULL,
  representative_title text,
  post_count integer DEFAULT 0 NOT NULL,
  first_seen_at timestamp with time zone NOT NULL,
  last_seen_at timestamp with time zone NOT NULL,
  avg_urgency numeric(4,2) DEFAULT 0 NOT NULL,
  avg_engagement numeric(6,2) DEFAULT 0 NOT NULL,
  status text DEFAULT 'detected'::text NOT NULL,
  promoted_to_charge_type text,
  promoted_to_pain_point text,
  notes text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT emerging_topics_pkey PRIMARY KEY (id)
);

-- Table: emotional_profiles
CREATE TABLE IF NOT EXISTS public.emotional_profiles (
  id text NOT NULL,
  dimension text NOT NULL,
  label text NOT NULL,
  signals text,
  calibration text,
  validation_approach text,
  bridging_pattern text,
  letter_calibration text,
  banned_term text,
  replacement text,
  charge_type text,
  active boolean DEFAULT true NOT NULL,
  sort_order integer DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT emotional_profiles_pkey PRIMARY KEY (id)
);

-- Table: engine_config
CREATE TABLE IF NOT EXISTS public.engine_config (
  key text NOT NULL,
  value text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT engine_config_pkey PRIMARY KEY (key)
);

-- Table: eval_criteria
CREATE TABLE IF NOT EXISTS public.eval_criteria (
  id text NOT NULL,
  team text NOT NULL,
  team_name text NOT NULL,
  criterion_name text NOT NULL,
  what_to_check text NOT NULL,
  fail_triggers text NOT NULL,
  expert_grounding text,
  active boolean DEFAULT true NOT NULL,
  sort_order integer DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  charge_types text[],
  applicable_tiers text[],
  CONSTRAINT eval_criteria_pkey PRIMARY KEY (id)
);

-- Table: evidence_custody
CREATE TABLE IF NOT EXISTS public.evidence_custody (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  evidence_id uuid NOT NULL,
  case_id uuid NOT NULL,
  event_type text NOT NULL,
  event_date date,
  event_time time without time zone,
  handler_from text,
  handler_to text NOT NULL,
  location text,
  weight_value real,
  weight_unit text,
  document_id uuid,
  page_number integer,
  is_gap boolean DEFAULT false NOT NULL,
  gap_note text,
  sequence_order integer,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT evidence_custody_pkey PRIMARY KEY (id)
);

-- Table: evidence_items
CREATE TABLE IF NOT EXISTS public.evidence_items (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  case_id uuid NOT NULL,
  item_number text,
  property_receipt text,
  exhibit_number text,
  description text NOT NULL,
  location_found text,
  location_stored text,
  substance text,
  schedule text,
  weights jsonb,
  weight_discrepancy boolean DEFAULT false NOT NULL,
  lab_tested boolean DEFAULT false NOT NULL,
  lab_result text,
  lab_method text,
  custody_intact boolean,
  custody_gaps integer DEFAULT 0 NOT NULL,
  first_doc_id uuid,
  first_page integer,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT evidence_items_pkey PRIMARY KEY (id)
);

-- Table: experts
CREATE TABLE IF NOT EXISTS public.experts (
  id text NOT NULL,
  name text NOT NULL,
  category text NOT NULL,
  subcategory text,
  charge_types text[],
  why_elite text NOT NULL,
  key_framework text NOT NULL,
  application text,
  unused_strengths text,
  status text DEFAULT 'active'::text NOT NULL,
  tier integer DEFAULT 1 NOT NULL,
  pipeline_mapping jsonb,
  active boolean DEFAULT true NOT NULL,
  sort_order integer DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT experts_pkey PRIMARY KEY (id)
);

-- Table: finding_sources
CREATE TABLE IF NOT EXISTS public.finding_sources (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  finding_id uuid NOT NULL,
  case_id uuid NOT NULL,
  document_id uuid NOT NULL,
  page_number integer,
  excerpt text NOT NULL,
  context text,
  role text DEFAULT 'supporting'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT finding_sources_pkey PRIMARY KEY (id)
);

-- Table: inbound_emails
CREATE TABLE IF NOT EXISTS public.inbound_emails (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  from_email text NOT NULL,
  from_name text,
  to_email text NOT NULL,
  subject text,
  body_text text,
  body_html text,
  headers jsonb,
  raw_payload jsonb,
  read boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  message_id text,
  CONSTRAINT inbound_emails_pkey PRIMARY KEY (id)
);

-- Table: intake_questions
CREATE TABLE IF NOT EXISTS public.intake_questions (
  id integer DEFAULT nextval('intake_questions_id_seq'::regclass) NOT NULL,
  tier text NOT NULL,
  charge_type text NOT NULL,
  question_order integer NOT NULL,
  question_text text NOT NULL,
  options jsonb NOT NULL,
  expert_rationale text NOT NULL,
  expert_names text[],
  active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT intake_questions_pkey PRIMARY KEY (id),
  CONSTRAINT intake_questions_tier_charge_type_question_order_key UNIQUE (tier, charge_type, question_order)
);

-- Table: intakes
CREATE TABLE IF NOT EXISTS public.intakes (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  first_name text NOT NULL,
  last_name text,
  email text NOT NULL,
  phone text,
  charge_type text NOT NULL,
  state text,
  has_attorney text,
  has_discovery text,
  services text[],
  situation text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  time_since_arrest text,
  arrest_circumstances text[],
  incident_location text,
  co_defendants text,
  attorney_strategy text,
  specific_question text,
  case_number text,
  court_date date,
  plea_offered text,
  plea_terms text,
  communication_frequency text,
  last_attorney_contact text,
  arrest_date date,
  evidence_type text[],
  charge_specific_data jsonb DEFAULT '{}'::jsonb,
  jurisdiction_level text DEFAULT 'unknown'::text,
  phase2_data jsonb,
  criminal_history text,
  employment_status text,
  employment_industry text,
  case_stage text,
  filled_out_by text,
  mental_health_relevant text,
  court_case_number text,
  court_state text,
  court_county text,
  judge_name text,
  attorney_name text,
  next_hearing_date date,
  next_hearing_type text,
  total_charges integer,
  charge_details jsonb,
  CONSTRAINT intakes_pkey PRIMARY KEY (id)
);

-- Table: job_cost_tracking
CREATE TABLE IF NOT EXISTS public.job_cost_tracking (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  job_id uuid NOT NULL,
  case_id uuid NOT NULL,
  provider text DEFAULT 'anthropic'::text NOT NULL,
  model text NOT NULL,
  endpoint text,
  input_tokens integer DEFAULT 0 NOT NULL,
  output_tokens integer DEFAULT 0 NOT NULL,
  cache_read_tokens integer DEFAULT 0 NOT NULL,
  cache_write_tokens integer DEFAULT 0 NOT NULL,
  cost_usd numeric(10,6) NOT NULL,
  latency_ms integer,
  purpose text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT job_cost_tracking_pkey PRIMARY KEY (id)
);

-- Table: motion_recommendations
CREATE TABLE IF NOT EXISTS public.motion_recommendations (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  case_id uuid NOT NULL,
  motion_type text NOT NULL,
  motion_track text,
  motion_name text NOT NULL,
  severity text DEFAULT 'MEDIUM'::text NOT NULL,
  severity_rank integer DEFAULT 3 NOT NULL,
  strategic_score real,
  description text NOT NULL,
  basis text,
  potential_outcome text,
  risk_if_denied text,
  finding_ids uuid[],
  supporting_evidence jsonb,
  recommended_wave integer,
  depends_on uuid[],
  status text DEFAULT 'identified'::text NOT NULL,
  content_html text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT motion_recommendations_pkey PRIMARY KEY (id)
);

-- Table: operator_tasks
CREATE TABLE IF NOT EXISTS public.operator_tasks (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  case_id uuid NOT NULL,
  task_type text NOT NULL,
  title text NOT NULL,
  description text,
  priority text DEFAULT 'MEDIUM'::text NOT NULL,
  priority_rank integer DEFAULT 3 NOT NULL,
  due_at timestamp with time zone,
  sla_breach boolean DEFAULT false NOT NULL,
  status text DEFAULT 'open'::text NOT NULL,
  assigned_to text,
  started_at timestamp with time zone,
  completed_at timestamp with time zone,
  reference_type text,
  reference_id uuid,
  resolution text,
  notes text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT operator_tasks_pkey PRIMARY KEY (id)
);

-- Table: orders
CREATE TABLE IF NOT EXISTS public.orders (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  email text NOT NULL,
  tier text NOT NULL,
  amount integer NOT NULL,
  status text DEFAULT 'pending'::text NOT NULL,
  stripe_session_id text,
  stripe_payment_intent_id text,
  upgrade_credit_applied integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  paid_at timestamp with time zone,
  refunded_at timestamp with time zone,
  priority_delivery boolean DEFAULT false,
  court_date date,
  consent_timestamp timestamp with time zone,
  product_type text DEFAULT 'service'::text NOT NULL,
  download_token uuid,
  download_token_expires_at timestamp with time zone,
  download_count integer DEFAULT 0 NOT NULL,
  CONSTRAINT orders_pkey PRIMARY KEY (id),
  CONSTRAINT orders_stripe_session_id_key UNIQUE (stripe_session_id)
);

-- Table: pipeline_eval_weights
CREATE TABLE IF NOT EXISTS public.pipeline_eval_weights (
  pipeline text NOT NULL,
  team text NOT NULL,
  weight text NOT NULL,
  CONSTRAINT pipeline_eval_weights_pkey PRIMARY KEY (pipeline, team)
);

-- Table: portal_sessions
CREATE TABLE IF NOT EXISTS public.portal_sessions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  case_id uuid NOT NULL,
  session_token_hash text NOT NULL,
  email text NOT NULL,
  ip_address text,
  user_agent text,
  expires_at timestamp with time zone NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT portal_sessions_pkey PRIMARY KEY (id)
);

-- Table: processing_jobs
CREATE TABLE IF NOT EXISTS public.processing_jobs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  case_id uuid NOT NULL,
  job_type text NOT NULL,
  job_subtype text,
  target_id uuid,
  target_type text,
  depends_on uuid[],
  priority integer DEFAULT 5 NOT NULL,
  batch_id uuid,
  status text DEFAULT 'queued'::text NOT NULL,
  progress integer DEFAULT 0 NOT NULL,
  started_at timestamp with time zone,
  completed_at timestamp with time zone,
  error_message text,
  error_details jsonb,
  retry_count integer DEFAULT 0 NOT NULL,
  max_retries integer DEFAULT 3 NOT NULL,
  next_retry_at timestamp with time zone,
  result_summary jsonb,
  items_produced integer DEFAULT 0 NOT NULL,
  worker_id text,
  model_used text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT processing_jobs_pkey PRIMARY KEY (id)
);

-- Table: rate_limits
CREATE TABLE IF NOT EXISTS public.rate_limits (
  key text NOT NULL,
  window_start timestamp with time zone DEFAULT now() NOT NULL,
  request_count integer DEFAULT 1 NOT NULL,
  CONSTRAINT rate_limits_pkey PRIMARY KEY (key)
);

-- Table: reddit_signals
CREATE TABLE IF NOT EXISTS public.reddit_signals (
  id integer DEFAULT nextval('reddit_signals_id_seq'::regclass) NOT NULL,
  reddit_id text NOT NULL,
  subreddit text NOT NULL,
  title text NOT NULL,
  body_snippet text,
  author text,
  score integer DEFAULT 0 NOT NULL,
  num_comments integer DEFAULT 0 NOT NULL,
  post_url text NOT NULL,
  permalink text NOT NULL,
  reddit_created_at timestamp with time zone NOT NULL,
  charge_type_slugs text[],
  pain_point_slugs text[],
  search_query text,
  has_question boolean DEFAULT false NOT NULL,
  urgency_score integer DEFAULT 0 NOT NULL,
  emotional_tone text,
  geographic_mentions text[],
  price_sensitivity boolean DEFAULT false NOT NULL,
  price_mentions text[],
  classified_by text DEFAULT 'keyword'::text NOT NULL,
  fetched_at timestamp with time zone DEFAULT now() NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT reddit_signals_pkey PRIMARY KEY (id),
  CONSTRAINT reddit_signals_reddit_id_key UNIQUE (reddit_id)
);

-- Table: subreddits
CREATE TABLE IF NOT EXISTS public.subreddits (
  name text NOT NULL,
  size text,
  rules_summary text,
  best_post_time text,
  content_fit text,
  can_post boolean DEFAULT true NOT NULL,
  active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT subreddits_pkey PRIMARY KEY (name)
);

-- Table: subscribers
CREATE TABLE IF NOT EXISTS public.subscribers (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  email text NOT NULL,
  source text DEFAULT 'lead-capture'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  unsubscribed_at timestamp with time zone,
  CONSTRAINT subscribers_pkey PRIMARY KEY (id),
  CONSTRAINT subscribers_email_key UNIQUE (email)
);

-- Table: tiers
CREATE TABLE IF NOT EXISTS public.tiers (
  slug text NOT NULL,
  name text NOT NULL,
  price integer NOT NULL,
  delivery text NOT NULL,
  requires_discovery boolean DEFAULT false NOT NULL,
  priority_price integer,
  priority_delivery text,
  guarantee text,
  description text,
  features jsonb,
  best_for text,
  sort_order integer DEFAULT 0 NOT NULL,
  is_addon boolean DEFAULT false NOT NULL,
  requires_tier text,
  upgrade_credit_eligible boolean DEFAULT true NOT NULL,
  active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT tiers_pkey PRIMARY KEY (slug)
);

-- Table: timeline_events
CREATE TABLE IF NOT EXISTS public.timeline_events (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  case_id uuid NOT NULL,
  event_type text NOT NULL,
  event_date date,
  event_time time without time zone,
  event_label text NOT NULL,
  description text,
  location text,
  primary_person text,
  other_persons text[],
  document_id uuid,
  page_number integer,
  sequence_order integer,
  has_conflict boolean DEFAULT false NOT NULL,
  conflict_note text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT timeline_events_pkey PRIMARY KEY (id)
);

-- Table: trial_materials
CREATE TABLE IF NOT EXISTS public.trial_materials (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  case_id uuid NOT NULL,
  material_type text NOT NULL,
  material_subtype text,
  title text NOT NULL,
  content text,
  content_html text,
  version integer DEFAULT 1 NOT NULL,
  witness_id uuid,
  motion_id uuid,
  quality_score integer,
  reviewed boolean DEFAULT false NOT NULL,
  reviewer_notes text,
  generated_by text,
  generation_model text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT trial_materials_pkey PRIMARY KEY (id),
  CONSTRAINT trial_materials_case_id_material_type_material_subtype_key UNIQUE (case_id, material_type, material_subtype)
);

-- Table: witness_dossiers
CREATE TABLE IF NOT EXISTS public.witness_dossiers (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  witness_id uuid NOT NULL,
  case_id uuid NOT NULL,
  part integer NOT NULL,
  section_name text NOT NULL,
  content text,
  content_html text,
  generated_by text,
  generation_model text,
  version integer DEFAULT 1 NOT NULL,
  quality_score integer,
  reviewed boolean DEFAULT false NOT NULL,
  reviewer_notes text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT witness_dossiers_pkey PRIMARY KEY (id),
  CONSTRAINT witness_dossiers_witness_id_part_section_name_key UNIQUE (witness_id, part, section_name)
);

-- Table: witness_mentions
CREATE TABLE IF NOT EXISTS public.witness_mentions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  witness_id uuid NOT NULL,
  case_id uuid NOT NULL,
  document_id uuid NOT NULL,
  page_number integer,
  context text,
  role_in_doc text,
  name_variant text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT witness_mentions_pkey PRIMARY KEY (id)
);

-- =============================================================================
-- FOREIGN KEY CONSTRAINTS
-- =============================================================================

ALTER TABLE public.case_findings
  ADD CONSTRAINT case_findings_case_id_fkey
  FOREIGN KEY (case_id)
  REFERENCES public.cases (id)
  ON DELETE CASCADE;

ALTER TABLE public.case_findings
  ADD CONSTRAINT case_findings_doc1_id_fkey
  FOREIGN KEY (doc1_id)
  REFERENCES public.discovery_documents (id);

ALTER TABLE public.case_findings
  ADD CONSTRAINT case_findings_doc2_id_fkey
  FOREIGN KEY (doc2_id)
  REFERENCES public.discovery_documents (id);

ALTER TABLE public.case_findings
  ADD CONSTRAINT case_findings_witness_id_fkey
  FOREIGN KEY (witness_id)
  REFERENCES public.case_witnesses (id);

ALTER TABLE public.case_law_references
  ADD CONSTRAINT case_law_references_case_id_fkey
  FOREIGN KEY (case_id)
  REFERENCES public.cases (id)
  ON DELETE CASCADE;

ALTER TABLE public.case_law_references
  ADD CONSTRAINT case_law_references_finding_id_fkey
  FOREIGN KEY (finding_id)
  REFERENCES public.case_findings (id);

ALTER TABLE public.case_law_references
  ADD CONSTRAINT case_law_references_motion_id_fkey
  FOREIGN KEY (motion_id)
  REFERENCES public.motion_recommendations (id);

ALTER TABLE public.case_persons
  ADD CONSTRAINT case_persons_case_id_fkey
  FOREIGN KEY (case_id)
  REFERENCES public.cases (id)
  ON DELETE CASCADE;

ALTER TABLE public.case_updates
  ADD CONSTRAINT case_updates_case_id_fkey
  FOREIGN KEY (case_id)
  REFERENCES public.cases (id)
  ON DELETE CASCADE;

ALTER TABLE public.case_witnesses
  ADD CONSTRAINT case_witnesses_case_id_fkey
  FOREIGN KEY (case_id)
  REFERENCES public.cases (id)
  ON DELETE CASCADE;

ALTER TABLE public.cases
  ADD CONSTRAINT cases_intake_id_fkey
  FOREIGN KEY (intake_id)
  REFERENCES public.intakes (id);

ALTER TABLE public.cases
  ADD CONSTRAINT cases_order_id_fkey
  FOREIGN KEY (order_id)
  REFERENCES public.orders (id);

ALTER TABLE public.cases
  ADD CONSTRAINT cases_parent_order_id_fkey
  FOREIGN KEY (parent_order_id)
  REFERENCES public.orders (id);

ALTER TABLE public.cases
  ADD CONSTRAINT cases_prior_case_id_fkey
  FOREIGN KEY (prior_case_id)
  REFERENCES public.cases (id);

ALTER TABLE public.content_assets
  ADD CONSTRAINT content_assets_pain_point_id_fkey
  FOREIGN KEY (pain_point_id)
  REFERENCES public.content_pain_points (id);

ALTER TABLE public.content_performance
  ADD CONSTRAINT content_performance_content_post_id_fkey
  FOREIGN KEY (content_post_id)
  REFERENCES public.content_posts (id);

ALTER TABLE public.content_posts
  ADD CONSTRAINT content_posts_pain_point_id_fkey
  FOREIGN KEY (pain_point_id)
  REFERENCES public.content_pain_points (id);

ALTER TABLE public.discovery_documents
  ADD CONSTRAINT discovery_documents_case_id_fkey
  FOREIGN KEY (case_id)
  REFERENCES public.cases (id)
  ON DELETE CASCADE;

ALTER TABLE public.discovery_documents
  ADD CONSTRAINT discovery_documents_supersedes_id_fkey
  FOREIGN KEY (supersedes_id)
  REFERENCES public.discovery_documents (id);

ALTER TABLE public.document_entities
  ADD CONSTRAINT document_entities_case_id_fkey
  FOREIGN KEY (case_id)
  REFERENCES public.cases (id)
  ON DELETE CASCADE;

ALTER TABLE public.document_entities
  ADD CONSTRAINT document_entities_document_id_fkey
  FOREIGN KEY (document_id)
  REFERENCES public.discovery_documents (id)
  ON DELETE CASCADE;

ALTER TABLE public.document_entities
  ADD CONSTRAINT document_entities_page_id_fkey
  FOREIGN KEY (page_id)
  REFERENCES public.document_pages (id)
  ON DELETE SET NULL;

ALTER TABLE public.document_pages
  ADD CONSTRAINT document_pages_case_id_fkey
  FOREIGN KEY (case_id)
  REFERENCES public.cases (id)
  ON DELETE CASCADE;

ALTER TABLE public.document_pages
  ADD CONSTRAINT document_pages_document_id_fkey
  FOREIGN KEY (document_id)
  REFERENCES public.discovery_documents (id)
  ON DELETE CASCADE;

ALTER TABLE public.drip_emails
  ADD CONSTRAINT drip_emails_subscriber_id_fkey
  FOREIGN KEY (subscriber_id)
  REFERENCES public.subscribers (id);

ALTER TABLE public.evidence_custody
  ADD CONSTRAINT evidence_custody_case_id_fkey
  FOREIGN KEY (case_id)
  REFERENCES public.cases (id)
  ON DELETE CASCADE;

ALTER TABLE public.evidence_custody
  ADD CONSTRAINT evidence_custody_document_id_fkey
  FOREIGN KEY (document_id)
  REFERENCES public.discovery_documents (id);

ALTER TABLE public.evidence_custody
  ADD CONSTRAINT evidence_custody_evidence_id_fkey
  FOREIGN KEY (evidence_id)
  REFERENCES public.evidence_items (id)
  ON DELETE CASCADE;

ALTER TABLE public.evidence_items
  ADD CONSTRAINT evidence_items_case_id_fkey
  FOREIGN KEY (case_id)
  REFERENCES public.cases (id)
  ON DELETE CASCADE;

ALTER TABLE public.evidence_items
  ADD CONSTRAINT evidence_items_first_doc_id_fkey
  FOREIGN KEY (first_doc_id)
  REFERENCES public.discovery_documents (id);

ALTER TABLE public.finding_sources
  ADD CONSTRAINT finding_sources_case_id_fkey
  FOREIGN KEY (case_id)
  REFERENCES public.cases (id)
  ON DELETE CASCADE;

ALTER TABLE public.finding_sources
  ADD CONSTRAINT finding_sources_document_id_fkey
  FOREIGN KEY (document_id)
  REFERENCES public.discovery_documents (id);

ALTER TABLE public.finding_sources
  ADD CONSTRAINT finding_sources_finding_id_fkey
  FOREIGN KEY (finding_id)
  REFERENCES public.case_findings (id)
  ON DELETE CASCADE;

ALTER TABLE public.job_cost_tracking
  ADD CONSTRAINT job_cost_tracking_case_id_fkey
  FOREIGN KEY (case_id)
  REFERENCES public.cases (id)
  ON DELETE CASCADE;

ALTER TABLE public.job_cost_tracking
  ADD CONSTRAINT job_cost_tracking_job_id_fkey
  FOREIGN KEY (job_id)
  REFERENCES public.processing_jobs (id)
  ON DELETE CASCADE;

ALTER TABLE public.motion_recommendations
  ADD CONSTRAINT motion_recommendations_case_id_fkey
  FOREIGN KEY (case_id)
  REFERENCES public.cases (id)
  ON DELETE CASCADE;

ALTER TABLE public.operator_tasks
  ADD CONSTRAINT operator_tasks_case_id_fkey
  FOREIGN KEY (case_id)
  REFERENCES public.cases (id)
  ON DELETE CASCADE;

ALTER TABLE public.portal_sessions
  ADD CONSTRAINT portal_sessions_case_id_fkey
  FOREIGN KEY (case_id)
  REFERENCES public.cases (id)
  ON DELETE CASCADE;

ALTER TABLE public.processing_jobs
  ADD CONSTRAINT processing_jobs_case_id_fkey
  FOREIGN KEY (case_id)
  REFERENCES public.cases (id)
  ON DELETE CASCADE;

ALTER TABLE public.timeline_events
  ADD CONSTRAINT timeline_events_case_id_fkey
  FOREIGN KEY (case_id)
  REFERENCES public.cases (id)
  ON DELETE CASCADE;

ALTER TABLE public.timeline_events
  ADD CONSTRAINT timeline_events_document_id_fkey
  FOREIGN KEY (document_id)
  REFERENCES public.discovery_documents (id);

ALTER TABLE public.trial_materials
  ADD CONSTRAINT trial_materials_case_id_fkey
  FOREIGN KEY (case_id)
  REFERENCES public.cases (id)
  ON DELETE CASCADE;

ALTER TABLE public.trial_materials
  ADD CONSTRAINT trial_materials_motion_id_fkey
  FOREIGN KEY (motion_id)
  REFERENCES public.motion_recommendations (id);

ALTER TABLE public.trial_materials
  ADD CONSTRAINT trial_materials_witness_id_fkey
  FOREIGN KEY (witness_id)
  REFERENCES public.case_witnesses (id);

ALTER TABLE public.witness_dossiers
  ADD CONSTRAINT witness_dossiers_case_id_fkey
  FOREIGN KEY (case_id)
  REFERENCES public.cases (id)
  ON DELETE CASCADE;

ALTER TABLE public.witness_dossiers
  ADD CONSTRAINT witness_dossiers_witness_id_fkey
  FOREIGN KEY (witness_id)
  REFERENCES public.case_witnesses (id)
  ON DELETE CASCADE;

ALTER TABLE public.witness_mentions
  ADD CONSTRAINT witness_mentions_case_id_fkey
  FOREIGN KEY (case_id)
  REFERENCES public.cases (id)
  ON DELETE CASCADE;

ALTER TABLE public.witness_mentions
  ADD CONSTRAINT witness_mentions_document_id_fkey
  FOREIGN KEY (document_id)
  REFERENCES public.discovery_documents (id)
  ON DELETE CASCADE;

ALTER TABLE public.witness_mentions
  ADD CONSTRAINT witness_mentions_witness_id_fkey
  FOREIGN KEY (witness_id)
  REFERENCES public.case_witnesses (id)
  ON DELETE CASCADE;

-- =============================================================================
-- INDEXES
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_audit_runs_charge ON public.audit_runs USING btree (charge_type);
CREATE INDEX IF NOT EXISTS idx_audit_runs_created ON public.audit_runs USING btree (created_at);
CREATE INDEX IF NOT EXISTS idx_audit_runs_source ON public.audit_runs USING btree (report_source);
CREATE INDEX IF NOT EXISTS idx_cf_case_id ON public.case_findings USING btree (case_id);
CREATE INDEX IF NOT EXISTS idx_cf_case_severity ON public.case_findings USING btree (case_id, severity_rank);
CREATE INDEX IF NOT EXISTS idx_cf_case_type ON public.case_findings USING btree (case_id, finding_type);
CREATE INDEX IF NOT EXISTS idx_cf_category ON public.case_findings USING btree (category);
CREATE INDEX IF NOT EXISTS idx_cf_motion_types ON public.case_findings USING gin (motion_types);
CREATE INDEX IF NOT EXISTS idx_cf_verification ON public.case_findings USING btree (verification_status) WHERE (verification_status <> 'verified'::text);
CREATE INDEX IF NOT EXISTS idx_cf_witness ON public.case_findings USING btree (witness_id) WHERE (witness_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_clr_case_id ON public.case_law_references USING btree (case_id);
CREATE INDEX IF NOT EXISTS idx_clr_citation ON public.case_law_references USING btree (citation);
CREATE INDEX IF NOT EXISTS idx_clr_motion ON public.case_law_references USING btree (motion_id) WHERE (motion_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_cp_case_id ON public.case_persons USING btree (case_id);
CREATE INDEX IF NOT EXISTS idx_cp_research ON public.case_persons USING btree (research_status) WHERE (research_status <> 'complete'::text);
CREATE INDEX IF NOT EXISTS idx_cp_type ON public.case_persons USING btree (person_type);
CREATE INDEX IF NOT EXISTS idx_cu_case_id ON public.case_updates USING btree (case_id);
CREATE INDEX IF NOT EXISTS idx_cu_case_type ON public.case_updates USING btree (case_id, update_type);
CREATE INDEX IF NOT EXISTS idx_cu_undelivered ON public.case_updates USING btree (case_id) WHERE (delivered = false);
CREATE INDEX IF NOT EXISTS idx_cw_case_id ON public.case_witnesses USING btree (case_id);
CREATE INDEX IF NOT EXISTS idx_cw_case_type ON public.case_witnesses USING btree (case_id, witness_type);
CREATE INDEX IF NOT EXISTS idx_cw_credibility ON public.case_witnesses USING btree (case_id, credibility_score) WHERE (credibility_score IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_cw_dossier_status ON public.case_witnesses USING btree (dossier_status) WHERE (dossier_status <> 'complete'::text);
CREATE INDEX IF NOT EXISTS idx_cw_type ON public.case_witnesses USING btree (witness_type);
CREATE INDEX IF NOT EXISTS idx_cases_court_lookup ON public.cases USING btree (court_case_number, court_state);
CREATE INDEX IF NOT EXISTS idx_cases_delivery_due ON public.cases USING btree (delivery_due_at) WHERE ((delivery_due_at IS NOT NULL) AND (status <> ALL (ARRAY['delivered'::text, 'refunded'::text])));
CREATE INDEX IF NOT EXISTS idx_cases_email ON public.cases USING btree (email);
CREATE INDEX IF NOT EXISTS idx_cases_eval_results_null ON public.cases USING btree (status, generated_at) WHERE (eval_results IS NULL);
CREATE INDEX IF NOT EXISTS idx_cases_order ON public.cases USING btree (order_id);
CREATE INDEX IF NOT EXISTS idx_cases_phase ON public.cases USING btree (phase) WHERE (phase IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_cases_prior_case ON public.cases USING btree (prior_case_id) WHERE (prior_case_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_cases_report_token ON public.cases USING btree (report_token);
CREATE INDEX IF NOT EXISTS idx_cases_status ON public.cases USING btree (status);
CREATE INDEX IF NOT EXISTS idx_cases_status_updated ON public.cases USING btree (status, updated_at);
CREATE INDEX IF NOT EXISTS idx_cases_update_due ON public.cases USING btree (next_update_due_at) WHERE ((next_update_due_at IS NOT NULL) AND (status <> ALL (ARRAY['delivered'::text, 'refunded'::text])));
CREATE INDEX IF NOT EXISTS idx_content_assets_campaign ON public.content_assets USING btree (campaign_slug);
CREATE INDEX IF NOT EXISTS idx_content_assets_type ON public.content_assets USING btree (asset_type);
CREATE INDEX IF NOT EXISTS idx_content_gaps_score ON public.content_gaps USING btree (gap_score DESC);
CREATE INDEX IF NOT EXISTS idx_content_gaps_status ON public.content_gaps USING btree (status);
CREATE INDEX IF NOT EXISTS idx_content_performance_revenue ON public.content_performance USING btree (revenue_attributed DESC);
CREATE INDEX IF NOT EXISTS idx_content_performance_slug ON public.content_performance USING btree (blog_slug);
CREATE INDEX IF NOT EXISTS idx_content_posts_priority ON public.content_posts USING btree (priority);
CREATE INDEX IF NOT EXISTS idx_cv_runs_hypotheses_violated ON public.cv_runs USING gin (hypotheses_violated);
CREATE INDEX IF NOT EXISTS idx_cv_runs_project ON public.cv_runs USING btree (project);
CREATE INDEX IF NOT EXISTS idx_cv_runs_project_completed ON public.cv_runs USING btree (project, completed_at DESC);
CREATE INDEX IF NOT EXISTS idx_dpl_case_id ON public.data_purge_log USING btree (case_id);
CREATE INDEX IF NOT EXISTS idx_dpl_purged_at ON public.data_purge_log USING btree (purged_at);
CREATE INDEX IF NOT EXISTS idx_dpl_reason ON public.data_purge_log USING btree (purge_reason);
CREATE INDEX IF NOT EXISTS idx_demand_scores_dimension ON public.demand_scores USING btree (dimension_type, dimension_slug);
CREATE INDEX IF NOT EXISTS idx_demand_scores_quadrant ON public.demand_scores USING btree (quadrant);
CREATE INDEX IF NOT EXISTS idx_discovered_subreddits_status ON public.discovered_subreddits USING btree (status);
CREATE INDEX IF NOT EXISTS idx_dd_case_id ON public.discovery_documents USING btree (case_id);
CREATE INDEX IF NOT EXISTS idx_dd_case_status ON public.discovery_documents USING btree (case_id, status);
CREATE INDEX IF NOT EXISTS idx_dd_doc_type ON public.discovery_documents USING btree (doc_type) WHERE (doc_type IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_dd_file_hash ON public.discovery_documents USING btree (file_hash) WHERE (file_hash IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_dd_status ON public.discovery_documents USING btree (status);
CREATE INDEX IF NOT EXISTS idx_de_case_id ON public.document_entities USING btree (case_id);
CREATE INDEX IF NOT EXISTS idx_de_document_id ON public.document_entities USING btree (document_id);
CREATE INDEX IF NOT EXISTS idx_de_type ON public.document_entities USING btree (entity_type);
CREATE INDEX IF NOT EXISTS idx_de_type_value ON public.document_entities USING btree (case_id, entity_type, normalized);
CREATE INDEX IF NOT EXISTS idx_dp_case_id ON public.document_pages USING btree (case_id);
CREATE INDEX IF NOT EXISTS idx_dp_document_id ON public.document_pages USING btree (document_id);
CREATE INDEX IF NOT EXISTS idx_dp_fulltext ON public.document_pages USING gin (to_tsvector('english'::regconfig, content));
CREATE INDEX IF NOT EXISTS idx_drip_emails_email_key ON public.drip_emails USING btree (email_key);
CREATE INDEX IF NOT EXISTS idx_drip_emails_subscriber_id ON public.drip_emails USING btree (subscriber_id);
CREATE INDEX IF NOT EXISTS idx_email_log_case_id ON public.email_log USING btree (case_id) WHERE (case_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_email_log_created_at ON public.email_log USING btree (created_at);
CREATE INDEX IF NOT EXISTS idx_email_log_failures ON public.email_log USING btree (success) WHERE (success = false);
CREATE INDEX IF NOT EXISTS idx_email_log_recipient ON public.email_log USING btree (recipient);
CREATE INDEX IF NOT EXISTS idx_emerging_topics_last_seen ON public.emerging_topics USING btree (last_seen_at);
CREATE INDEX IF NOT EXISTS idx_emerging_topics_status ON public.emerging_topics USING btree (status);
CREATE INDEX IF NOT EXISTS idx_emotional_profiles_dimension ON public.emotional_profiles USING btree (dimension);
CREATE INDEX IF NOT EXISTS idx_eval_criteria_team ON public.eval_criteria USING btree (team);
CREATE INDEX IF NOT EXISTS idx_ec_case_id ON public.evidence_custody USING btree (case_id);
CREATE INDEX IF NOT EXISTS idx_ec_evidence_id ON public.evidence_custody USING btree (evidence_id);
CREATE INDEX IF NOT EXISTS idx_ec_gaps ON public.evidence_custody USING btree (case_id) WHERE (is_gap = true);
CREATE INDEX IF NOT EXISTS idx_ei_case_id ON public.evidence_items USING btree (case_id);
CREATE INDEX IF NOT EXISTS idx_ei_custody ON public.evidence_items USING btree (case_id) WHERE (custody_intact = false);
CREATE INDEX IF NOT EXISTS idx_ei_item_number ON public.evidence_items USING btree (item_number) WHERE (item_number IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_ei_weight_disc ON public.evidence_items USING btree (case_id) WHERE (weight_discrepancy = true);
CREATE INDEX IF NOT EXISTS idx_experts_category ON public.experts USING btree (category);
CREATE INDEX IF NOT EXISTS idx_experts_charge_types ON public.experts USING gin (charge_types);
CREATE INDEX IF NOT EXISTS idx_fs_case_id ON public.finding_sources USING btree (case_id);
CREATE INDEX IF NOT EXISTS idx_fs_document_id ON public.finding_sources USING btree (document_id);
CREATE INDEX IF NOT EXISTS idx_fs_finding_id ON public.finding_sources USING btree (finding_id);
CREATE INDEX IF NOT EXISTS idx_inbound_emails_created_at ON public.inbound_emails USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inbound_emails_read ON public.inbound_emails USING btree (read) WHERE (read = false);
CREATE INDEX IF NOT EXISTS idx_intake_questions_charge ON public.intake_questions USING btree (charge_type);
CREATE INDEX IF NOT EXISTS idx_intake_questions_tier ON public.intake_questions USING btree (tier);
CREATE INDEX IF NOT EXISTS idx_intakes_email ON public.intakes USING btree (email);
CREATE INDEX IF NOT EXISTS idx_jct_case_id ON public.job_cost_tracking USING btree (case_id);
CREATE INDEX IF NOT EXISTS idx_jct_created ON public.job_cost_tracking USING btree (created_at);
CREATE INDEX IF NOT EXISTS idx_jct_job_id ON public.job_cost_tracking USING btree (job_id);
CREATE INDEX IF NOT EXISTS idx_jct_model ON public.job_cost_tracking USING btree (model);
CREATE INDEX IF NOT EXISTS idx_mr_case_id ON public.motion_recommendations USING btree (case_id);
CREATE INDEX IF NOT EXISTS idx_mr_case_severity ON public.motion_recommendations USING btree (case_id, severity_rank);
CREATE INDEX IF NOT EXISTS idx_mr_status ON public.motion_recommendations USING btree (status);
CREATE INDEX IF NOT EXISTS idx_mr_type ON public.motion_recommendations USING btree (motion_type);
CREATE INDEX IF NOT EXISTS idx_ot_case_id ON public.operator_tasks USING btree (case_id);
CREATE INDEX IF NOT EXISTS idx_ot_open_priority ON public.operator_tasks USING btree (priority_rank, due_at) WHERE (status = ANY (ARRAY['open'::text, 'in_progress'::text]));
CREATE INDEX IF NOT EXISTS idx_ot_sla ON public.operator_tasks USING btree (due_at) WHERE ((sla_breach = false) AND (status = ANY (ARRAY['open'::text, 'in_progress'::text])));
CREATE INDEX IF NOT EXISTS idx_ot_status ON public.operator_tasks USING btree (status);
CREATE INDEX IF NOT EXISTS idx_ot_type ON public.operator_tasks USING btree (task_type);
CREATE INDEX IF NOT EXISTS idx_orders_download_token ON public.orders USING btree (download_token) WHERE (download_token IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_orders_email ON public.orders USING btree (email);
CREATE INDEX IF NOT EXISTS idx_orders_email_status ON public.orders USING btree (email, status);
CREATE INDEX IF NOT EXISTS idx_orders_product_type ON public.orders USING btree (product_type) WHERE (product_type = 'digital-product'::text);
CREATE INDEX IF NOT EXISTS idx_orders_stripe_payment_intent ON public.orders USING btree (stripe_payment_intent_id);
CREATE INDEX IF NOT EXISTS idx_orders_stripe_session ON public.orders USING btree (stripe_session_id);
CREATE INDEX IF NOT EXISTS idx_ps_case_id ON public.portal_sessions USING btree (case_id);
CREATE INDEX IF NOT EXISTS idx_ps_expires ON public.portal_sessions USING btree (expires_at);
CREATE INDEX IF NOT EXISTS idx_ps_token_hash ON public.portal_sessions USING btree (session_token_hash);
CREATE INDEX IF NOT EXISTS idx_pj_batch ON public.processing_jobs USING btree (batch_id) WHERE (batch_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_pj_case_id ON public.processing_jobs USING btree (case_id);
CREATE INDEX IF NOT EXISTS idx_pj_failed ON public.processing_jobs USING btree (case_id) WHERE (status = 'failed'::text);
CREATE INDEX IF NOT EXISTS idx_pj_processing ON public.processing_jobs USING btree (started_at) WHERE (status = 'processing'::text);
CREATE INDEX IF NOT EXISTS idx_pj_queued ON public.processing_jobs USING btree (priority, created_at) WHERE (status = 'queued'::text);
CREATE INDEX IF NOT EXISTS idx_pj_retry ON public.processing_jobs USING btree (next_retry_at) WHERE (status = 'retrying'::text);
CREATE INDEX IF NOT EXISTS idx_pj_status ON public.processing_jobs USING btree (status);
CREATE INDEX IF NOT EXISTS idx_pj_type ON public.processing_jobs USING btree (job_type);
CREATE INDEX IF NOT EXISTS idx_rate_limits_window_start ON public.rate_limits USING btree (window_start);
CREATE INDEX IF NOT EXISTS idx_reddit_signals_charge_types ON public.reddit_signals USING gin (charge_type_slugs);
CREATE INDEX IF NOT EXISTS idx_reddit_signals_reddit_created ON public.reddit_signals USING btree (reddit_created_at);
CREATE INDEX IF NOT EXISTS idx_reddit_signals_subreddit ON public.reddit_signals USING btree (subreddit);
CREATE INDEX IF NOT EXISTS idx_reddit_signals_urgency ON public.reddit_signals USING btree (urgency_score) WHERE (urgency_score >= 7);
CREATE INDEX IF NOT EXISTS idx_te_case_date ON public.timeline_events USING btree (case_id, event_date);
CREATE INDEX IF NOT EXISTS idx_te_case_id ON public.timeline_events USING btree (case_id);
CREATE INDEX IF NOT EXISTS idx_te_conflicts ON public.timeline_events USING btree (case_id) WHERE (has_conflict = true);
CREATE INDEX IF NOT EXISTS idx_te_document ON public.timeline_events USING btree (document_id) WHERE (document_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_te_type ON public.timeline_events USING btree (event_type);
CREATE INDEX IF NOT EXISTS idx_tm_case_id ON public.trial_materials USING btree (case_id);
CREATE INDEX IF NOT EXISTS idx_tm_type ON public.trial_materials USING btree (material_type);
CREATE INDEX IF NOT EXISTS idx_tm_witness ON public.trial_materials USING btree (witness_id) WHERE (witness_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_wd_case_id ON public.witness_dossiers USING btree (case_id);
CREATE INDEX IF NOT EXISTS idx_wd_part ON public.witness_dossiers USING btree (part);
CREATE INDEX IF NOT EXISTS idx_wd_unreviewed ON public.witness_dossiers USING btree (case_id) WHERE ((reviewed = false) AND (content IS NOT NULL));
CREATE INDEX IF NOT EXISTS idx_wd_witness_id ON public.witness_dossiers USING btree (witness_id);
CREATE INDEX IF NOT EXISTS idx_wm_case_id ON public.witness_mentions USING btree (case_id);
CREATE INDEX IF NOT EXISTS idx_wm_document_id ON public.witness_mentions USING btree (document_id);
CREATE INDEX IF NOT EXISTS idx_wm_witness_id ON public.witness_mentions USING btree (witness_id);

-- =============================================================================
-- SEQUENCE OWNERSHIP (bind sequences to their table columns)
-- =============================================================================
ALTER SEQUENCE public.content_assets_id_seq OWNED BY public.content_assets.id;
ALTER SEQUENCE public.content_gaps_id_seq OWNED BY public.content_gaps.id;
ALTER SEQUENCE public.content_performance_id_seq OWNED BY public.content_performance.id;
ALTER SEQUENCE public.content_posts_id_seq OWNED BY public.content_posts.id;
ALTER SEQUENCE public.demand_scores_id_seq OWNED BY public.demand_scores.id;
ALTER SEQUENCE public.discovered_subreddits_id_seq OWNED BY public.discovered_subreddits.id;
ALTER SEQUENCE public.emerging_topics_id_seq OWNED BY public.emerging_topics.id;
ALTER SEQUENCE public.intake_questions_id_seq OWNED BY public.intake_questions.id;
ALTER SEQUENCE public.reddit_signals_id_seq OWNED BY public.reddit_signals.id;

-- =============================================================================
-- FUNCTIONS
-- =============================================================================

-- Function: acquire_cron_lock
CREATE OR REPLACE FUNCTION public.acquire_cron_lock(lock_key bigint)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN pg_try_advisory_lock(lock_key);
END;
$function$;

-- Function: append_file_url
CREATE OR REPLACE FUNCTION public.append_file_url(case_id uuid, new_url text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  UPDATE cases
  SET file_urls = array_append(COALESCE(file_urls, ARRAY[]::text[]), new_url)
  WHERE id = case_id;
END;
$function$;

-- Function: check_rate_limit
CREATE OR REPLACE FUNCTION public.check_rate_limit(p_key text, p_max_requests integer, p_window_seconds integer)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_count integer;
  v_window_start timestamptz;
BEGIN
  -- Try to get existing record
  SELECT request_count, window_start INTO v_count, v_window_start
  FROM rate_limits WHERE key = p_key FOR UPDATE;

  IF NOT FOUND THEN
    -- New key: insert and allow
    INSERT INTO rate_limits (key, window_start, request_count)
    VALUES (p_key, now(), 1)
    ON CONFLICT (key) DO UPDATE SET request_count = rate_limits.request_count + 1;
    RETURN true;
  END IF;

  -- Check if window has expired
  IF v_window_start + (p_window_seconds || ' seconds')::interval < now() THEN
    -- Reset window
    UPDATE rate_limits SET window_start = now(), request_count = 1 WHERE key = p_key;
    RETURN true;
  END IF;

  -- Check if under limit
  IF v_count < p_max_requests THEN
    UPDATE rate_limits SET request_count = request_count + 1 WHERE key = p_key;
    RETURN true;
  END IF;

  -- Rate limited
  RETURN false;
END;
$function$;

-- Function: claim_next_job
CREATE OR REPLACE FUNCTION public.claim_next_job(p_worker_id text, p_worker_token text)
 RETURNS SETOF processing_jobs
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
    DECLARE
      stored_token text;
    BEGIN
      SELECT value INTO stored_token FROM engine_config WHERE key = 'worker_auth_token';
      IF stored_token IS NULL OR p_worker_token != stored_token THEN
        RAISE EXCEPTION 'Invalid worker token';
      END IF;
      
      RETURN QUERY
      UPDATE processing_jobs
      SET status = 'processing',
          started_at = now(),
          worker_id = p_worker_id,
          updated_at = now()
      WHERE id = (
        SELECT id FROM processing_jobs
        WHERE status = 'queued'
          AND (depends_on IS NULL OR NOT EXISTS (
            SELECT 1 FROM processing_jobs dep
            WHERE dep.id = ANY(processing_jobs.depends_on)
              AND dep.status != 'completed'
          ))
        ORDER BY priority ASC, created_at ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      RETURNING *;
    END;
    $function$;

-- Function: cleanup_rate_limits
CREATE OR REPLACE FUNCTION public.cleanup_rate_limits(p_max_age_seconds integer DEFAULT 3600)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_deleted integer;
BEGIN
  DELETE FROM rate_limits
  WHERE window_start + (p_max_age_seconds || ' seconds')::interval < now();
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$function$;

-- Function: release_cron_lock
CREATE OR REPLACE FUNCTION public.release_cron_lock(lock_key bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  PERFORM pg_advisory_unlock(lock_key);
END;
$function$;

-- Function: rls_auto_enable
CREATE OR REPLACE FUNCTION public.rls_auto_enable()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$;

-- Function: update_case_document_count
CREATE OR REPLACE FUNCTION public.update_case_document_count()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  UPDATE cases
  SET document_count = (
    SELECT COUNT(*) FROM discovery_documents WHERE case_id = COALESCE(NEW.case_id, OLD.case_id)
  )
  WHERE id = COALESCE(NEW.case_id, OLD.case_id);
  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- Function: update_case_finding_count
CREATE OR REPLACE FUNCTION public.update_case_finding_count()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  UPDATE cases
  SET finding_count = (
    SELECT COUNT(*) FROM case_findings WHERE case_id = COALESCE(NEW.case_id, OLD.case_id)
  )
  WHERE id = COALESCE(NEW.case_id, OLD.case_id);
  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- Function: update_case_witness_count
CREATE OR REPLACE FUNCTION public.update_case_witness_count()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  UPDATE cases
  SET witness_count = (
    SELECT COUNT(*) FROM case_witnesses WHERE case_id = COALESCE(NEW.case_id, OLD.case_id)
  )
  WHERE id = COALESCE(NEW.case_id, OLD.case_id);
  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- Function: update_updated_at_column
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

-- =============================================================================
-- TRIGGERS
-- =============================================================================

CREATE OR REPLACE TRIGGER update_buyer_states_updated_at
  BEFORE UPDATE
  ON public.buyer_states
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime('updated_at');

CREATE OR REPLACE TRIGGER trigger_update_case_finding_count
  AFTER INSERT OR DELETE
  ON public.case_findings
  FOR EACH ROW
  EXECUTE FUNCTION update_case_finding_count();

CREATE OR REPLACE TRIGGER update_case_findings_updated_at
  BEFORE UPDATE
  ON public.case_findings
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime('updated_at');

CREATE OR REPLACE TRIGGER update_case_law_references_updated_at
  BEFORE UPDATE
  ON public.case_law_references
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime('updated_at');

CREATE OR REPLACE TRIGGER update_case_persons_updated_at
  BEFORE UPDATE
  ON public.case_persons
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime('updated_at');

CREATE OR REPLACE TRIGGER update_case_updates_updated_at
  BEFORE UPDATE
  ON public.case_updates
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime('updated_at');

CREATE OR REPLACE TRIGGER trigger_update_case_witness_count
  AFTER INSERT OR DELETE
  ON public.case_witnesses
  FOR EACH ROW
  EXECUTE FUNCTION update_case_witness_count();

CREATE OR REPLACE TRIGGER update_case_witnesses_updated_at
  BEFORE UPDATE
  ON public.case_witnesses
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime('updated_at');

CREATE OR REPLACE TRIGGER update_cases_updated_at
  BEFORE UPDATE
  ON public.cases
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER update_charge_types_updated_at
  BEFORE UPDATE
  ON public.charge_types
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime('updated_at');

CREATE OR REPLACE TRIGGER update_content_assets_updated_at
  BEFORE UPDATE
  ON public.content_assets
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime('updated_at');

CREATE OR REPLACE TRIGGER update_content_gaps_updated_at
  BEFORE UPDATE
  ON public.content_gaps
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime('updated_at');

CREATE OR REPLACE TRIGGER update_content_pain_points_updated_at
  BEFORE UPDATE
  ON public.content_pain_points
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime('updated_at');

CREATE OR REPLACE TRIGGER update_content_performance_updated_at
  BEFORE UPDATE
  ON public.content_performance
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime('updated_at');

CREATE OR REPLACE TRIGGER update_content_posts_updated_at
  BEFORE UPDATE
  ON public.content_posts
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime('updated_at');

CREATE OR REPLACE TRIGGER update_demand_scores_updated_at
  BEFORE UPDATE
  ON public.demand_scores
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime('updated_at');

CREATE OR REPLACE TRIGGER update_discovered_subreddits_updated_at
  BEFORE UPDATE
  ON public.discovered_subreddits
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime('updated_at');

CREATE OR REPLACE TRIGGER trigger_update_case_document_count
  AFTER DELETE OR INSERT
  ON public.discovery_documents
  FOR EACH ROW
  EXECUTE FUNCTION update_case_document_count();

CREATE OR REPLACE TRIGGER update_discovery_documents_updated_at
  BEFORE UPDATE
  ON public.discovery_documents
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime('updated_at');

CREATE OR REPLACE TRIGGER update_document_pages_updated_at
  BEFORE UPDATE
  ON public.document_pages
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime('updated_at');

CREATE OR REPLACE TRIGGER update_emerging_topics_updated_at
  BEFORE UPDATE
  ON public.emerging_topics
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime('updated_at');

CREATE OR REPLACE TRIGGER update_emotional_profiles_updated_at
  BEFORE UPDATE
  ON public.emotional_profiles
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime('updated_at');

CREATE OR REPLACE TRIGGER update_eval_criteria_updated_at
  BEFORE UPDATE
  ON public.eval_criteria
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime('updated_at');

CREATE OR REPLACE TRIGGER update_evidence_items_updated_at
  BEFORE UPDATE
  ON public.evidence_items
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime('updated_at');

CREATE OR REPLACE TRIGGER update_experts_updated_at
  BEFORE UPDATE
  ON public.experts
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime('updated_at');

CREATE OR REPLACE TRIGGER update_intake_questions_updated_at
  BEFORE UPDATE
  ON public.intake_questions
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime('updated_at');

CREATE OR REPLACE TRIGGER update_motion_recommendations_updated_at
  BEFORE UPDATE
  ON public.motion_recommendations
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime('updated_at');

CREATE OR REPLACE TRIGGER update_operator_tasks_updated_at
  BEFORE UPDATE
  ON public.operator_tasks
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime('updated_at');

CREATE OR REPLACE TRIGGER update_processing_jobs_updated_at
  BEFORE UPDATE
  ON public.processing_jobs
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime('updated_at');

CREATE OR REPLACE TRIGGER update_reddit_signals_updated_at
  BEFORE UPDATE
  ON public.reddit_signals
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime('updated_at');

CREATE OR REPLACE TRIGGER update_subreddits_updated_at
  BEFORE UPDATE
  ON public.subreddits
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime('updated_at');

CREATE OR REPLACE TRIGGER update_tiers_updated_at
  BEFORE UPDATE
  ON public.tiers
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime('updated_at');

CREATE OR REPLACE TRIGGER update_timeline_events_updated_at
  BEFORE UPDATE
  ON public.timeline_events
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime('updated_at');

CREATE OR REPLACE TRIGGER update_trial_materials_updated_at
  BEFORE UPDATE
  ON public.trial_materials
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime('updated_at');

CREATE OR REPLACE TRIGGER update_witness_dossiers_updated_at
  BEFORE UPDATE
  ON public.witness_dossiers
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime('updated_at');

-- =============================================================================
-- EVENT TRIGGERS
-- =============================================================================

-- Auto-enable RLS on new tables created in the public schema
CREATE EVENT TRIGGER ensure_rls ON ddl_command_end
  EXECUTE FUNCTION public.rls_auto_enable();

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================

ALTER TABLE public.audit_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.buyer_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_law_references ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_persons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_witnesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.charge_packs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.charge_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_gaps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_pain_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_performance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cron_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cv_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.data_purge_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.demand_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discovered_subreddits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discovery_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drip_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emerging_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emotional_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.engine_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eval_criteria ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evidence_custody ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evidence_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.experts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finding_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inbound_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intake_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intakes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_cost_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.motion_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operator_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pipeline_eval_weights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.processing_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reddit_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subreddits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscribers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timeline_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trial_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.witness_dossiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.witness_mentions ENABLE ROW LEVEL SECURITY;

-- RLS Policies

DROP POLICY IF EXISTS "anon_no_access_case_findings" ON public.case_findings;
CREATE POLICY "anon_no_access_case_findings" ON public.case_findings
  AS PERMISSIVE
  FOR ALL
  TO anon
  USING (false);

DROP POLICY IF EXISTS "anon_no_access_case_law_references" ON public.case_law_references;
CREATE POLICY "anon_no_access_case_law_references" ON public.case_law_references
  AS PERMISSIVE
  FOR ALL
  TO anon
  USING (false);

DROP POLICY IF EXISTS "anon_no_access_case_persons" ON public.case_persons;
CREATE POLICY "anon_no_access_case_persons" ON public.case_persons
  AS PERMISSIVE
  FOR ALL
  TO anon
  USING (false);

DROP POLICY IF EXISTS "anon_no_access_case_updates" ON public.case_updates;
CREATE POLICY "anon_no_access_case_updates" ON public.case_updates
  AS PERMISSIVE
  FOR ALL
  TO anon
  USING (false);

DROP POLICY IF EXISTS "anon_no_access_case_witnesses" ON public.case_witnesses;
CREATE POLICY "anon_no_access_case_witnesses" ON public.case_witnesses
  AS PERMISSIVE
  FOR ALL
  TO anon
  USING (false);

DROP POLICY IF EXISTS "service_role_full_access" ON public.cv_runs;
CREATE POLICY "service_role_full_access" ON public.cv_runs
  AS PERMISSIVE
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "anon_no_access_data_purge_log" ON public.data_purge_log;
CREATE POLICY "anon_no_access_data_purge_log" ON public.data_purge_log
  AS PERMISSIVE
  FOR ALL
  TO anon
  USING (false);

DROP POLICY IF EXISTS "anon_no_access_discovery_documents" ON public.discovery_documents;
CREATE POLICY "anon_no_access_discovery_documents" ON public.discovery_documents
  AS PERMISSIVE
  FOR ALL
  TO anon
  USING (false);

DROP POLICY IF EXISTS "anon_no_access_document_entities" ON public.document_entities;
CREATE POLICY "anon_no_access_document_entities" ON public.document_entities
  AS PERMISSIVE
  FOR ALL
  TO anon
  USING (false);

DROP POLICY IF EXISTS "anon_no_access_document_pages" ON public.document_pages;
CREATE POLICY "anon_no_access_document_pages" ON public.document_pages
  AS PERMISSIVE
  FOR ALL
  TO anon
  USING (false);

DROP POLICY IF EXISTS "Service role full access" ON public.drip_emails;
CREATE POLICY "Service role full access" ON public.drip_emails
  AS PERMISSIVE
  FOR ALL
  TO public
  USING ((auth.role() = 'service_role'::text));

DROP POLICY IF EXISTS "anon_no_access_engine_config" ON public.engine_config;
CREATE POLICY "anon_no_access_engine_config" ON public.engine_config
  AS PERMISSIVE
  FOR ALL
  TO anon
  USING (false);

DROP POLICY IF EXISTS "anon_no_access_evidence_custody" ON public.evidence_custody;
CREATE POLICY "anon_no_access_evidence_custody" ON public.evidence_custody
  AS PERMISSIVE
  FOR ALL
  TO anon
  USING (false);

DROP POLICY IF EXISTS "anon_no_access_evidence_items" ON public.evidence_items;
CREATE POLICY "anon_no_access_evidence_items" ON public.evidence_items
  AS PERMISSIVE
  FOR ALL
  TO anon
  USING (false);

DROP POLICY IF EXISTS "anon_no_access_finding_sources" ON public.finding_sources;
CREATE POLICY "anon_no_access_finding_sources" ON public.finding_sources
  AS PERMISSIVE
  FOR ALL
  TO anon
  USING (false);

DROP POLICY IF EXISTS "Anon can submit intake" ON public.intakes;
CREATE POLICY "Anon can submit intake" ON public.intakes
  AS PERMISSIVE
  FOR INSERT
  TO anon
  WITH CHECK (true);

DROP POLICY IF EXISTS "anon_no_access_job_cost_tracking" ON public.job_cost_tracking;
CREATE POLICY "anon_no_access_job_cost_tracking" ON public.job_cost_tracking
  AS PERMISSIVE
  FOR ALL
  TO anon
  USING (false);

DROP POLICY IF EXISTS "anon_no_access_motion_recommendations" ON public.motion_recommendations;
CREATE POLICY "anon_no_access_motion_recommendations" ON public.motion_recommendations
  AS PERMISSIVE
  FOR ALL
  TO anon
  USING (false);

DROP POLICY IF EXISTS "anon_no_access_operator_tasks" ON public.operator_tasks;
CREATE POLICY "anon_no_access_operator_tasks" ON public.operator_tasks
  AS PERMISSIVE
  FOR ALL
  TO anon
  USING (false);

DROP POLICY IF EXISTS "anon_no_access_portal_sessions" ON public.portal_sessions;
CREATE POLICY "anon_no_access_portal_sessions" ON public.portal_sessions
  AS PERMISSIVE
  FOR ALL
  TO anon
  USING (false);

DROP POLICY IF EXISTS "anon_no_access_processing_jobs" ON public.processing_jobs;
CREATE POLICY "anon_no_access_processing_jobs" ON public.processing_jobs
  AS PERMISSIVE
  FOR ALL
  TO anon
  USING (false);

DROP POLICY IF EXISTS "Anon can subscribe" ON public.subscribers;
CREATE POLICY "Anon can subscribe" ON public.subscribers
  AS PERMISSIVE
  FOR INSERT
  TO anon
  WITH CHECK (true);

DROP POLICY IF EXISTS "anon_no_access_timeline_events" ON public.timeline_events;
CREATE POLICY "anon_no_access_timeline_events" ON public.timeline_events
  AS PERMISSIVE
  FOR ALL
  TO anon
  USING (false);

DROP POLICY IF EXISTS "anon_no_access_trial_materials" ON public.trial_materials;
CREATE POLICY "anon_no_access_trial_materials" ON public.trial_materials
  AS PERMISSIVE
  FOR ALL
  TO anon
  USING (false);

DROP POLICY IF EXISTS "anon_no_access_witness_dossiers" ON public.witness_dossiers;
CREATE POLICY "anon_no_access_witness_dossiers" ON public.witness_dossiers
  AS PERMISSIVE
  FOR ALL
  TO anon
  USING (false);

DROP POLICY IF EXISTS "anon_no_access_witness_mentions" ON public.witness_mentions;
CREATE POLICY "anon_no_access_witness_mentions" ON public.witness_mentions
  AS PERMISSIVE
  FOR ALL
  TO anon
  USING (false);
