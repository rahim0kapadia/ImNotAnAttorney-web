-- Phase 2: report format versioning. The cite-tag badge transformer runs
-- only on v2+ reports. v1 reports (pre-2026-04-22) render unchanged.

SET statement_timeout = '30min';
SET idle_in_transaction_session_timeout = '5min';

ALTER TABLE cases
  ADD COLUMN IF NOT EXISTS report_format_version SMALLINT NOT NULL DEFAULT 1;

COMMENT ON COLUMN cases.report_format_version IS
  'Report generator format version. 1 = pre-2026-04-22 plain HTML. 2 = cite-tagged HTML with entity IDs for badge and pull-quote transforms.';
