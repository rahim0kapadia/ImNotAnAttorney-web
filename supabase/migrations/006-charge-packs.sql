-- Migration 006: Charge Packs (Defense Playbooks)
-- Adds digital product support to the orders table and creates the charge_packs reference table.
-- Run via direct DB connection (pg), not Supabase dashboard.

-- 1. Add digital product columns to orders
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS product_type text NOT NULL DEFAULT 'service',
  ADD COLUMN IF NOT EXISTS download_token uuid,
  ADD COLUMN IF NOT EXISTS download_token_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS download_count int NOT NULL DEFAULT 0;

-- 2. Index for querying digital product orders (partial index — only digital-product rows)
CREATE INDEX IF NOT EXISTS idx_orders_product_type
  ON orders (product_type)
  WHERE product_type = 'digital-product';

-- 3. Index for download token lookups
CREATE INDEX IF NOT EXISTS idx_orders_download_token
  ON orders (download_token)
  WHERE download_token IS NOT NULL;

-- 4. Create charge_packs reference table
CREATE TABLE IF NOT EXISTS charge_packs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  display_name text NOT NULL,
  charge_type text NOT NULL,
  price_cents int NOT NULL,
  description text,
  contents jsonb NOT NULL DEFAULT '[]'::jsonb,
  pdf_storage_path text,
  is_active boolean NOT NULL DEFAULT true,
  upgrade_credit_window_days int NOT NULL DEFAULT 30,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 5. Seed DUI First Offense Playbook
INSERT INTO charge_packs (slug, display_name, charge_type, price_cents, description, contents, pdf_storage_path)
VALUES (
  'dui-first-offense',
  'DUI Defense Playbook',
  'dui',
  9700,
  'Instant DUI defense playbook with 26 questions, case stage roadmap, red flag checklist, and attorney accountability scorecard.',
  '[
    {"section": 1, "title": "Charge Reality Report", "description": "Plain-English DUI first offense breakdown — elements, dual-track (DMV + criminal), sentencing ranges", "anchor_value": 297},
    {"section": 2, "title": "26 Questions Your DUI Attorney Hopes You Never Ask", "description": "Elite defense attorney methodologies in 6-part format per question", "anchor_value": 197},
    {"section": 3, "title": "DUI Case Stage Roadmap", "description": "Arrest through resolution timeline with milestones and deadlines", "anchor_value": 97},
    {"section": 4, "title": "Red Flag Checklist", "description": "12 evidence and procedural red flags — breathalyzer calibration, FST protocol, 15-min observation", "anchor_value": 97},
    {"section": 5, "title": "Attorney Accountability Scorecard", "description": "10 behaviors to rate your attorney on before it is too late to switch", "anchor_value": 97}
  ]'::jsonb,
  'charge-packs/dui-first-offense/dui-defense-playbook.pdf'
)
ON CONFLICT (slug) DO NOTHING;

-- NOTE: Create the 'charge-packs' storage bucket manually in Supabase dashboard
-- (Storage > New bucket > name: "charge-packs" > Private)
-- The download endpoint generates signed URLs, so no public access needed.
