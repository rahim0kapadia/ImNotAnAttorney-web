-- Migration 001: Conversion Optimization
-- Run this in Supabase SQL Editor to update existing tables
-- Date: 2026-02-22
-- Context: Pre-launch conversion optimization (pricing overhaul, intake personalization,
--          refund tracking, priority delivery, consent checkbox, work-commenced trigger)

-- =============================================================================
-- 1. SUBSCRIBERS — Unsubscribe tracking (CAN-SPAM)
-- =============================================================================
ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS unsubscribed_at timestamptz;

-- =============================================================================
-- 2. INTAKES — New personalization fields (multi-step intake form)
-- =============================================================================
ALTER TABLE intakes ADD COLUMN IF NOT EXISTS time_since_arrest text;
ALTER TABLE intakes ADD COLUMN IF NOT EXISTS arrest_circumstances text[];
ALTER TABLE intakes ADD COLUMN IF NOT EXISTS incident_location text;
ALTER TABLE intakes ADD COLUMN IF NOT EXISTS co_defendants text;
ALTER TABLE intakes ADD COLUMN IF NOT EXISTS attorney_strategy text;
ALTER TABLE intakes ADD COLUMN IF NOT EXISTS specific_question text;
ALTER TABLE intakes ADD COLUMN IF NOT EXISTS case_number text;
ALTER TABLE intakes ADD COLUMN IF NOT EXISTS court_date date;

-- Note: If your database has a "next_attorney_meeting_date" column from a prior version,
-- rename it instead of adding court_date:
-- ALTER TABLE intakes RENAME COLUMN next_attorney_meeting_date TO court_date;

-- =============================================================================
-- 3. ORDERS — Refund tracking, priority delivery, consent, court date
-- =============================================================================
ALTER TABLE orders ADD COLUMN IF NOT EXISTS refunded_at timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS priority_delivery boolean DEFAULT false;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS court_date date;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS consent_timestamp timestamptz;

-- Composite index for refund-aware checkout (email + status lookups)
CREATE INDEX IF NOT EXISTS idx_orders_email_status ON orders(email, status);

-- =============================================================================
-- 4. CASES — Work-commenced trigger (refund policy for $1,497+ tiers)
-- =============================================================================
ALTER TABLE cases ADD COLUMN IF NOT EXISTS commenced_at timestamptz;

-- Note: cases.status is a text column. New valid statuses after this migration:
--   intake, commenced, in-progress, review, phase_1_delivered, phase_2_delivered, delivered, refunded
-- No enum change needed — just use the new values in application code.

-- =============================================================================
-- VERIFICATION
-- =============================================================================
-- After running, verify with:
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'intakes' ORDER BY ordinal_position;
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'orders' ORDER BY ordinal_position;
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'cases' ORDER BY ordinal_position;
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'subscribers' ORDER BY ordinal_position;
