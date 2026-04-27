-- Migration: security_scan_history
-- Phase 3 of auto-security layered rollout (plan: ~/.claude/docs/plans/2026-04-20-auto-security-layered.md)
-- Stores daily pattern-scan results from /api/cron/security-scan.
-- Delta detection: each run compares findings vs most recent row per project.

CREATE TABLE IF NOT EXISTS public.security_scan_history (
  id bigserial PRIMARY KEY,
  project text NOT NULL,
  scan_date timestamptz NOT NULL DEFAULT now(),
  files_scanned integer NOT NULL DEFAULT 0,
  findings_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  critical_count integer NOT NULL DEFAULT 0,
  high_count integer NOT NULL DEFAULT 0,
  medium_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_security_scan_history_project_date
  ON public.security_scan_history (project, scan_date DESC);

ALTER TABLE public.security_scan_history ENABLE ROW LEVEL SECURITY;

-- Service role only. No public/authenticated reads.
DROP POLICY IF EXISTS "security_scan_history_service_role_all" ON public.security_scan_history;
CREATE POLICY "security_scan_history_service_role_all" ON public.security_scan_history
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE public.security_scan_history IS
  'Daily security pattern-scan results per project. Written by /api/cron/security-scan. Delta calc: new CRITICAL findings vs previous row.';
