-- =============================================================================
-- Court Case -> INAA Port: Rollback Script
-- =============================================================================
--
-- Phase 0 Item 7 deliverable. This is a MANUAL emergency rollback script — it is
-- NOT a Supabase migration and will NEVER run automatically. Keep it in the
-- `rollback/` sibling directory so the Supabase CLI ignores it.
--
-- Purpose: reverse the 10 Wave migrations (20260407a through 20260407j) in the
-- event a production deploy causes cascade damage, trigger loops, or RLS policies
-- that block legitimate reads. The script is WAVE-REVERSE ordered so dependencies
-- unwind in the correct order:
--
--   1. Wave 4 rollback (Tier 4 persona QA + Tier 8C page verification)
--   2. Wave 3 rollback (Tier 7 witness research + Tier 3 detectors + Tier 8B lab)
--   3. Wave 2 rollback (Tier 2 cross-exam + Tier 6 case law)
--   4. Wave 1 rollback (Tier 8A defendant + Tier 1 strategy + Tier 5 judge)
--
-- Each section drops NEW tables (safe — no production data at risk for new tables)
-- and removes NEW columns from existing tables. Existing table rows are NEVER
-- touched — the rollback only reverts schema changes.
--
-- SAFETY INVARIANTS (verified in Phase 0 dry-run):
-- - No new-table FK uses ON DELETE CASCADE pointing BACK at cases/orders/intakes.
--   All CASCADE relationships point FROM new tables TO existing tables (correct
--   direction: per-case data dies with the case). Dropping a new table never
--   cascades into a core table.
-- - Triggers on new tables drop with the tables (no orphaned triggers).
-- - Indexes drop with the tables (no explicit DROP INDEX needed).
-- - RLS policies drop with the tables.
--
-- HOW TO USE:
-- 1. Capture pre-rollback row counts: `SELECT count(*) FROM cases;` etc.
-- 2. Open a psql session linked to the target database (branch or production).
-- 3. Wrap the script in a transaction: `BEGIN;` ... `COMMIT;` (or ROLLBACK if anything looks wrong).
-- 4. Run the entire script or a wave-specific block.
-- 5. Verify core table row counts match pre-rollback values.
-- 6. Run the CASCADE-safety query at the bottom to confirm no FK damage.
--
-- CRITICAL TABLES TO MONITOR FOR ROW COUNT DELTAS (all should be zero delta):
--   cases, orders, intakes, case_findings, evidence_items, case_witnesses,
--   discovery_documents, document_pages, case_law, judge_profiles, case_motions,
--   case_trap_tracks, case_wave_plan, prosecution_counters, attorney_perspectives.
--
-- NON-NEGOTIABLE: run this inside a transaction. If anything looks wrong after
-- the DROP statements, ROLLBACK immediately. Do NOT COMMIT if row counts drift.
--
-- =============================================================================

BEGIN;

-- =============================================================================
-- WAVE 4 ROLLBACK — Tier 4 Persona QA Loop + Tier 8C Page Verification
-- =============================================================================

-- --- Tier 8C (20260407k): Page Verification — ALTER only, no new tables ---
ALTER TABLE document_pages DROP COLUMN IF EXISTS verified;
ALTER TABLE document_pages DROP COLUMN IF EXISTS last_verified;
ALTER TABLE document_pages DROP COLUMN IF EXISTS correction_notes;
ALTER TABLE document_pages DROP COLUMN IF EXISTS verified_by;

-- --- Tier 4 (20260407i): Persona QA Loop — 8 new tables + conditional Phase 5 ---
DROP TABLE IF EXISTS line_ownership CASCADE;     -- conditional Phase 5
DROP TABLE IF EXISTS section_ownership CASCADE;  -- conditional Phase 5
DROP TABLE IF EXISTS factum_log CASCADE;
DROP TABLE IF EXISTS veri_claim_alignments CASCADE;
DROP TABLE IF EXISTS veri_handoff_queue CASCADE;
DROP TABLE IF EXISTS pari_handoff_queue CASCADE;
DROP TABLE IF EXISTS persona_intel CASCADE;
DROP TABLE IF EXISTS qa_certifications CASCADE;
DROP TABLE IF EXISTS qa_loop_state CASCADE;
DROP TABLE IF EXISTS audit_log CASCADE;

-- =============================================================================
-- WAVE 3 ROLLBACK — Tier 8B Lab + Tier 3 Detectors + Tier 7 Witness Research
-- =============================================================================

-- --- Tier 8B (20260407h): Lab / Demands / Events ---
ALTER TABLE case_findings DROP COLUMN IF EXISTS event_id1;
ALTER TABLE case_findings DROP COLUMN IF EXISTS event_id2;
ALTER TABLE case_findings DROP COLUMN IF EXISTS event_scope;

DROP TABLE IF EXISTS case_events CASCADE;
DROP TABLE IF EXISTS discovery_demands CASCADE;
DROP TABLE IF EXISTS lab_report_items CASCADE;

-- --- Tier 3 (20260407g): Detector Engineering — 8 new tables + helper functions ---
DROP TABLE IF EXISTS detector_emissions CASCADE;
DROP TABLE IF EXISTS quality_issues CASCADE;
DROP TABLE IF EXISTS audit_gaps CASCADE;
DROP TABLE IF EXISTS pattern_expansion_log CASCADE;
DROP TABLE IF EXISTS detector_synthesis_candidates CASCADE;
DROP TABLE IF EXISTS detector_performance CASCADE;
DROP TABLE IF EXISTS detector_tuning CASCADE;
DROP TABLE IF EXISTS detectors CASCADE;

DROP FUNCTION IF EXISTS tuning_recommendation_trigger();
DROP FUNCTION IF EXISTS get_top_fp_detectors(integer);
DROP FUNCTION IF EXISTS recompute_detector_performance(text, integer);
DROP FUNCTION IF EXISTS compute_detector_recommendation(real);

-- --- Tier 7 (20260407f): Witness Research Pipeline ---
-- Drop the triggers before the tables that carry them (belt+braces; CASCADE would handle it).
DROP TRIGGER IF EXISTS trg_witness_research_extraction_score ON witness_research_prompts;
DROP TRIGGER IF EXISTS trg_witness_source_url_rollup ON witness_source_urls;
DROP TRIGGER IF EXISTS trg_witness_discovery_demands_rollup ON witness_discovery_demands;

ALTER TABLE case_witnesses DROP COLUMN IF EXISTS dossier_path;
ALTER TABLE case_witnesses DROP COLUMN IF EXISTS dossier_part2_path;
ALTER TABLE case_witnesses DROP COLUMN IF EXISTS discovery_demands_count;
ALTER TABLE case_witnesses DROP COLUMN IF EXISTS source_url_count;
ALTER TABLE case_witnesses DROP COLUMN IF EXISTS verified_source_url_count;
ALTER TABLE case_witnesses DROP COLUMN IF EXISTS research_extraction_score;

DROP TABLE IF EXISTS witness_discovery_demands CASCADE;
DROP TABLE IF EXISTS cross_witness_patterns CASCADE;
DROP TABLE IF EXISTS witness_template_performance CASCADE;
DROP TABLE IF EXISTS witness_source_urls CASCADE;
DROP TABLE IF EXISTS witness_research_results CASCADE;
DROP TABLE IF EXISTS witness_research_prompts CASCADE;

-- =============================================================================
-- WAVE 2 ROLLBACK — Tier 6 Case Law + Tier 2 Cross-Exam Library
-- =============================================================================

-- --- Tier 6 (20260407e): Case Law Enrichment ---
DROP TABLE IF EXISTS verified_case_law CASCADE;
DROP TABLE IF EXISTS case_law_witnesses CASCADE;
DROP TABLE IF EXISTS case_law_verification_log CASCADE;
DROP TABLE IF EXISTS case_law_applicability CASCADE;
DROP TABLE IF EXISTS case_law_urls CASCADE;

-- case_law itself: drop ONLY the NEW columns added by Tier 6. The table existed
-- before via Management API writes. If the Tier 6 migration used CREATE TABLE
-- IF NOT EXISTS, the pre-existing data in this table must be preserved.
-- If you need to fully drop case_law (extreme rollback), uncomment below. This
-- will DELETE all existing case law rows — do this only if you have a backup.
-- DROP TABLE IF EXISTS case_law CASCADE;

ALTER TABLE case_law DROP COLUMN IF EXISTS motion_types;
ALTER TABLE case_law DROP COLUMN IF EXISTS attack_vectors;
ALTER TABLE case_law DROP COLUMN IF EXISTS finding_types;
ALTER TABLE case_law DROP COLUMN IF EXISTS applicability_score;
ALTER TABLE case_law DROP COLUMN IF EXISTS applicability_label;
ALTER TABLE case_law DROP COLUMN IF EXISTS score_rationale;
ALTER TABLE case_law DROP COLUMN IF EXISTS relevant_arguments;
ALTER TABLE case_law DROP COLUMN IF EXISTS linked_finding_ids;
ALTER TABLE case_law DROP COLUMN IF EXISTS holding_keywords;
ALTER TABLE case_law DROP COLUMN IF EXISTS is_prosecution_citation;
ALTER TABLE case_law DROP COLUMN IF EXISTS prosecution_use;
ALTER TABLE case_law DROP COLUMN IF EXISTS our_distinction;
ALTER TABLE case_law DROP COLUMN IF EXISTS distinction_strength;
ALTER TABLE case_law DROP COLUMN IF EXISTS prosecution_counter_id;

-- --- Tier 2 (20260407d): Cross-Exam Library ---
DROP TABLE IF EXISTS case_voir_dire_questions CASCADE;
DROP TABLE IF EXISTS case_one_phrase_candidates CASCADE;
DROP TABLE IF EXISTS case_trial_narrative CASCADE;
DROP TABLE IF EXISTS case_trial_themes CASCADE;
DROP TABLE IF EXISTS finding_attack_patterns CASCADE;

DROP TABLE IF EXISTS voir_dire_library CASCADE;
DROP TABLE IF EXISTS weapon_evidence_links CASCADE;
DROP TABLE IF EXISTS weapon_witness_links CASCADE;
DROP TABLE IF EXISTS weapon_motion_links CASCADE;
DROP TABLE IF EXISTS weapon_finding_links CASCADE;
DROP TABLE IF EXISTS legal_weapons_library CASCADE;
DROP TABLE IF EXISTS attack_patterns_library CASCADE;

-- =============================================================================
-- WAVE 1 ROLLBACK — Tier 8A Defendant + Tier 1 Strategy + Tier 5 Judge
-- =============================================================================

-- --- Tier 8A (20260407c): Defendant Humanization ---
DROP TABLE IF EXISTS case_intelligence CASCADE;
DROP TABLE IF EXISTS defendant_profiles CASCADE;

-- --- Tier 1 (20260407b): Strategy / Motion Architecture ---
-- Per-case tables first (they FK to case_motions + cases).
DROP TABLE IF EXISTS case_motion_opportunities CASCADE;
DROP TABLE IF EXISTS case_finding_argument_impacts CASCADE;
DROP TABLE IF EXISTS case_finding_motion_links CASCADE;
DROP TABLE IF EXISTS case_motion_arguments CASCADE;

-- Formalized Management-API-only tables — if the migration used CREATE TABLE IF
-- NOT EXISTS, data is preserved in the pre-existing table. If you need to fully
-- drop them, uncomment below. Warning: drops pre-migration production rows.
-- DROP TABLE IF EXISTS attorney_perspectives CASCADE;
-- DROP TABLE IF EXISTS prosecution_counters CASCADE;
-- DROP TABLE IF EXISTS case_wave_plan CASCADE;
-- DROP TABLE IF EXISTS case_trap_tracks CASCADE;
-- DROP TABLE IF EXISTS case_motions CASCADE;

-- Remove NEW columns added to case_motions by Tier 1 (28 cols, from
-- 20260407b_tier1_strategy_motion_architecture.sql Section 3).
-- Drop is targeted — pre-existing SP2 columns stay intact.
ALTER TABLE case_motions DROP COLUMN IF EXISTS is_gateway;
ALTER TABLE case_motions DROP COLUMN IF EXISTS is_convergence_link;
ALTER TABLE case_motions DROP COLUMN IF EXISTS convergence_tracks;
ALTER TABLE case_motions DROP COLUMN IF EXISTS depends_on_motion_ids;
ALTER TABLE case_motions DROP COLUMN IF EXISTS kill_shot_score;
ALTER TABLE case_motions DROP COLUMN IF EXISTS convergence_score;
ALTER TABLE case_motions DROP COLUMN IF EXISTS dependency_position;
ALTER TABLE case_motions DROP COLUMN IF EXISTS pre_trial_value;
ALTER TABLE case_motions DROP COLUMN IF EXISTS trial_value;
ALTER TABLE case_motions DROP COLUMN IF EXISTS appeal_value;
ALTER TABLE case_motions DROP COLUMN IF EXISTS strategic_score;
ALTER TABLE case_motions DROP COLUMN IF EXISTS consolidated_into;
ALTER TABLE case_motions DROP COLUMN IF EXISTS is_master;
ALTER TABLE case_motions DROP COLUMN IF EXISTS is_wave_locked;
ALTER TABLE case_motions DROP COLUMN IF EXISTS wave_locked_by;
ALTER TABLE case_motions DROP COLUMN IF EXISTS wave_lock_reason;
ALTER TABLE case_motions DROP COLUMN IF EXISTS wave_source;
ALTER TABLE case_motions DROP COLUMN IF EXISTS verification_status;
ALTER TABLE case_motions DROP COLUMN IF EXISTS absence_type;
ALTER TABLE case_motions DROP COLUMN IF EXISTS absence_standard;
ALTER TABLE case_motions DROP COLUMN IF EXISTS three_way_grant_text;
ALTER TABLE case_motions DROP COLUMN IF EXISTS three_way_deny_text;
ALTER TABLE case_motions DROP COLUMN IF EXISTS three_way_partial_text;
ALTER TABLE case_motions DROP COLUMN IF EXISTS forcing_mechanism_scripts;
ALTER TABLE case_motions DROP COLUMN IF EXISTS cascade_effect;
ALTER TABLE case_motions DROP COLUMN IF EXISTS lock_in_language;
ALTER TABLE case_motions DROP COLUMN IF EXISTS one_liner;
-- updated_at is preserved — common timestamp column, may be used by other code

-- Remove new columns added to case_trap_tracks by Tier 1
ALTER TABLE case_trap_tracks DROP COLUMN IF EXISTS gateway_motion_id;
ALTER TABLE case_trap_tracks DROP COLUMN IF EXISTS requires_track_ids;
ALTER TABLE case_trap_tracks DROP COLUMN IF EXISTS s1_default_wave;
ALTER TABLE case_trap_tracks DROP COLUMN IF EXISTS s2_default_wave;
ALTER TABLE case_trap_tracks DROP COLUMN IF EXISTS s3_default_wave;
ALTER TABLE case_trap_tracks DROP COLUMN IF EXISTS theme;
ALTER TABLE case_trap_tracks DROP COLUMN IF EXISTS kill_shot;
ALTER TABLE case_trap_tracks DROP COLUMN IF EXISTS convergence_link;

-- Remove new columns added to case_wave_plan by Tier 1
ALTER TABLE case_wave_plan DROP COLUMN IF EXISTS phase_label;
ALTER TABLE case_wave_plan DROP COLUMN IF EXISTS theme;
ALTER TABLE case_wave_plan DROP COLUMN IF EXISTS is_locked;
ALTER TABLE case_wave_plan DROP COLUMN IF EXISTS lock_reason;
ALTER TABLE case_wave_plan DROP COLUMN IF EXISTS capacity_used;
ALTER TABLE case_wave_plan DROP COLUMN IF EXISTS convergence_targets;
ALTER TABLE case_wave_plan DROP COLUMN IF EXISTS decision_point_ids;

ALTER TABLE cases DROP COLUMN IF EXISTS motion_consolidation_summary;

-- Library tables (static seed — safe to drop).
DROP TABLE IF EXISTS wave_calculation_rules CASCADE;
DROP TABLE IF EXISTS trap_architecture_library CASCADE;
DROP TABLE IF EXISTS track_definition_library CASCADE;
DROP TABLE IF EXISTS motion_argument_library CASCADE;
DROP TABLE IF EXISTS strategic_motion_library CASCADE;

-- --- Tier 5 (20260407a): Judge Intelligence ---
DROP TABLE IF EXISTS case_judge_audit_results CASCADE;
DROP TABLE IF EXISTS trap_escapes CASCADE;
DROP TABLE IF EXISTS prosecution_arguments CASCADE;

-- judge_profiles ALTER rollback: drops 10 NEW intelligence columns.
-- The table existed pre-port (via Management API writes) — do NOT drop the table.
ALTER TABLE judge_profiles DROP COLUMN IF EXISTS magic_words;
ALTER TABLE judge_profiles DROP COLUMN IF EXISTS forbidden_words;
ALTER TABLE judge_profiles DROP COLUMN IF EXISTS pet_peeves;
ALTER TABLE judge_profiles DROP COLUMN IF EXISTS persuasion_triggers;
ALTER TABLE judge_profiles DROP COLUMN IF EXISTS judicial_philosophy;
ALTER TABLE judge_profiles DROP COLUMN IF EXISTS ruling_style;
ALTER TABLE judge_profiles DROP COLUMN IF EXISTS suppression_grant_rate;
ALTER TABLE judge_profiles DROP COLUMN IF EXISTS reversal_rate;
ALTER TABLE judge_profiles DROP COLUMN IF EXISTS intelligence_extracted_at;
ALTER TABLE judge_profiles DROP COLUMN IF EXISTS intelligence_source;
-- Discrepancy noted in SCHEMA-INVENTORY: plan also mentions intelligence_status
-- and intelligence_updated_at as rollback targets. Drop them defensively in case
-- the executing agent used those names instead.
ALTER TABLE judge_profiles DROP COLUMN IF EXISTS intelligence_status;
ALTER TABLE judge_profiles DROP COLUMN IF EXISTS intelligence_updated_at;

-- =============================================================================
-- PHASE 0 FEATURE FLAGS (rollback) — 20260407_phase0_feature_flags.sql
-- =============================================================================
-- The 8 port feature flags are metadata, not schema. They can stay in place
-- even after a full rollback. If you want to fully clean them up, uncomment:
-- DELETE FROM feature_flags WHERE flag_key IN (
--   'judge_intelligence_profile',
--   'motion_wave_strategy',
--   'defendant_humanization',
--   'cross_exam_templates',
--   'enriched_case_law',
--   'witness_structured_research',
--   'detector_registry',
--   'persona_qa_loop'
-- );

-- =============================================================================
-- POST-ROLLBACK VERIFICATION QUERIES (run these manually, NOT inside the BEGIN)
-- =============================================================================
--
-- 1. Core table row counts — should match pre-rollback snapshot exactly:
--    SELECT 'cases' AS t, count(*) FROM cases
--    UNION ALL SELECT 'orders', count(*) FROM orders
--    UNION ALL SELECT 'intakes', count(*) FROM intakes
--    UNION ALL SELECT 'case_findings', count(*) FROM case_findings
--    UNION ALL SELECT 'evidence_items', count(*) FROM evidence_items
--    UNION ALL SELECT 'case_witnesses', count(*) FROM case_witnesses
--    UNION ALL SELECT 'discovery_documents', count(*) FROM discovery_documents
--    UNION ALL SELECT 'document_pages', count(*) FROM document_pages
--    UNION ALL SELECT 'judge_profiles', count(*) FROM judge_profiles;
--
-- 2. CASCADE safety audit — should return ZERO rows with core tables as targets:
--    SELECT tc.table_name, ccu.table_name AS referenced, rc.delete_rule
--    FROM information_schema.table_constraints tc
--    JOIN information_schema.referential_constraints rc
--      ON tc.constraint_name = rc.constraint_name
--    JOIN information_schema.constraint_column_usage ccu
--      ON rc.unique_constraint_name = ccu.constraint_name
--    WHERE tc.constraint_type = 'FOREIGN KEY'
--      AND ccu.table_name IN ('cases','orders','intakes','case_findings','evidence_items','case_witnesses')
--      AND rc.delete_rule = 'CASCADE'
--      AND tc.table_name LIKE '%_library';
--    -- Any row here means a library table is wired to cascade-delete core data — STOP.
--
-- 3. Confirm new tables are gone (should return zero rows):
--    SELECT tablename FROM pg_tables
--    WHERE schemaname = 'public'
--      AND tablename IN (
--        'prosecution_arguments','trap_escapes','case_judge_audit_results',
--        'strategic_motion_library','motion_argument_library','track_definition_library',
--        'trap_architecture_library','wave_calculation_rules',
--        'case_motion_arguments','case_finding_motion_links','case_finding_argument_impacts',
--        'case_motion_opportunities','defendant_profiles','case_intelligence',
--        'attack_patterns_library','legal_weapons_library','weapon_finding_links',
--        'weapon_motion_links','weapon_witness_links','weapon_evidence_links',
--        'voir_dire_library','finding_attack_patterns','case_trial_themes',
--        'case_trial_narrative','case_one_phrase_candidates','case_voir_dire_questions',
--        'case_law_urls','case_law_applicability','case_law_verification_log',
--        'case_law_witnesses','verified_case_law',
--        'witness_research_prompts','witness_research_results','witness_source_urls',
--        'witness_template_performance','cross_witness_patterns','witness_discovery_demands',
--        'detectors','detector_tuning','detector_performance','detector_synthesis_candidates',
--        'pattern_expansion_log','audit_gaps','quality_issues','detector_emissions',
--        'lab_report_items','discovery_demands','case_events',
--        'audit_log','qa_loop_state','qa_certifications','persona_intel',
--        'pari_handoff_queue','veri_handoff_queue','veri_claim_alignments','factum_log'
--      );
--
-- 4. If all 3 verifications pass, COMMIT. If ANY verification is wrong, ROLLBACK.

COMMIT;
-- or: ROLLBACK;  -- if verifications failed above
