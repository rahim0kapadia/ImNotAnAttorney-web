-- 20260428b_inbox_features
-- Adds Star, Snooze, Labels to inbound_emails for the admin inbox redesign.
-- Hard delete remains the destruction path; no soft-delete column.
-- All adds are nullable/defaulted; reversible via DROP COLUMN.
-- Indexes are partial to keep them tiny — most rows are not starred/snoozed.

ALTER TABLE public.inbound_emails
  ADD COLUMN IF NOT EXISTS starred boolean DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS snoozed_until timestamptz NULL,
  ADD COLUMN IF NOT EXISTS labels text[] DEFAULT '{}'::text[] NOT NULL;

CREATE INDEX IF NOT EXISTS idx_inbound_emails_starred
  ON public.inbound_emails (created_at DESC)
  WHERE starred = true;

CREATE INDEX IF NOT EXISTS idx_inbound_emails_snoozed
  ON public.inbound_emails (snoozed_until)
  WHERE snoozed_until IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_inbound_emails_labels
  ON public.inbound_emails USING gin (labels)
  WHERE array_length(labels, 1) > 0;
