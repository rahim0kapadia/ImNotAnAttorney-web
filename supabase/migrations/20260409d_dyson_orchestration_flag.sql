-- Dyson orchestration feature flag — gates the new config-driven dispatcher.
-- OFF by default. Flipped ON only after parity tests pass end-to-end (Phase 11).
-- Spec: C:\Users\email\projects\ImNotAnAttorney\docs\plans\2026-04-09-dyson-orchestration-layer.md (Task 0.5)
-- Pattern: worker.mjs reads this flag via isFeatureEnabled() before scheduling downstream.
-- When OFF, legacy scheduleDownstream runs. When ON, new pipeline-dispatcher runs.

INSERT INTO feature_flags (flag_key, description, is_enabled, tier_scope) VALUES
  ('dyson_orchestration',
   'Config-driven orchestration: WORKER_PIPELINE + TIER_WORKER_CAPS + WORKER_FLAGS. Replaces hardcoded scheduleDownstream.',
   false, '{}')
ON CONFLICT (flag_key) DO NOTHING;
