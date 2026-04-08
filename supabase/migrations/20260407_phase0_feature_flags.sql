-- Phase 0: Feature flags for Court Case -> INAA port
-- Spec: C:\Users\email\projects\ImNotAnAttorney\docs\plans\2026-04-06-court-case-port\HARDENING-PHASE0.md (Item 4)
-- All 8 flags disabled by default. Enable per-flag after UPL eval passes for the corresponding wave.
-- Pattern: Engine workers check the flag before writing output. When OFF, workers run but skip
-- their LLM calls and table writes -- the scheduleDownstream chain stays intact.

INSERT INTO feature_flags (flag_key, description, is_enabled, tier_scope) VALUES
  ('judge_intelligence_profile',
   'Judge Intelligence Profile deliverable section (Wave 1, Tier 5)',
   false, '{}'),
  ('motion_wave_strategy',
   'Motion Wave Strategy Overview + gateway DAG deliverable section (Wave 1, Tier 1)',
   false, '{}'),
  ('defendant_humanization',
   'Defendant profile + case intelligence deliverable sections (Wave 1, Tier 8A)',
   false, '{}'),
  ('cross_exam_templates',
   'Cross-examination templates + legal weapons in deliverables (Wave 2, Tier 2)',
   false, '{}'),
  ('enriched_case_law',
   'Enriched case law with strategic classification + URL ranking (Wave 2, Tier 6)',
   false, '{}'),
  ('witness_structured_research',
   'Structured witness research with provenance + extraction (Wave 3, Tier 7)',
   false, '{}'),
  ('detector_registry',
   'Detector engineering registry + FP tracking in deliverables (Wave 3, Tier 3)',
   false, '{}'),
  ('persona_qa_loop',
   'Multi-persona QA convergence loop on strategic content (Wave 4, Tier 4)',
   false, '{}')
ON CONFLICT (flag_key) DO NOTHING;
