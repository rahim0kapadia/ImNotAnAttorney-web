-- dyson_orchestration flag retired — the new config-driven dispatcher is now the only path.
-- Phase 12 of the Dyson Orchestration Layer plan deleted the legacy scheduleDownstream switch,
-- so this kill-switch no longer has anywhere to fall back to. Removing it prevents future
-- operator confusion about a flag that does nothing.
-- Spec: C:\Users\email\projects\ImNotAnAttorney\docs\plans\2026-04-09-dyson-orchestration-layer.md (Task 12.2)

DELETE FROM public.feature_flags WHERE flag_key = 'dyson_orchestration';
