-- FTA Prevention Platform v2: check-ins table + indemnitor/last_name columns
-- Part of: docs/plans/2026-04-13-fta-prevention-platform-v2.md

-- 1. Client check-ins table
CREATE TABLE IF NOT EXISTS client_check_ins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  court_reminder_id uuid NOT NULL REFERENCES court_reminders(id),
  checked_in_at timestamptz NOT NULL DEFAULT now(),
  latitude double precision,
  longitude double precision,
  accuracy_meters double precision,
  method text NOT NULL DEFAULT 'web',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_check_ins_reminder
  ON client_check_ins(court_reminder_id);

-- 2. Indemnitor fields on court_reminders
ALTER TABLE court_reminders ADD COLUMN IF NOT EXISTS indemnitor_name text;
ALTER TABLE court_reminders ADD COLUMN IF NOT EXISTS indemnitor_email text;

-- 3. Last name (optional — for future re-arrest monitoring)
ALTER TABLE court_reminders ADD COLUMN IF NOT EXISTS last_name text;
