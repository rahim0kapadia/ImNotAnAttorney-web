-- Migration 015: Emergency Playbook Split
-- Adds emergency_pdf_path column to charge_packs for the two-document delivery model.
-- Each $97 playbook purchase now delivers TWO PDFs: Emergency Playbook + Full Defense Playbook.
-- The build-playbook.mjs script writes emergency_pdf_path when building emergency slugs.

ALTER TABLE charge_packs
  ADD COLUMN IF NOT EXISTS emergency_pdf_path text;

-- Add a comment for documentation
COMMENT ON COLUMN charge_packs.emergency_pdf_path IS
  'Supabase Storage path for the emergency playbook PDF (e.g., charge-packs/dui-first-offense/dui-emergency-playbook.pdf). NULL if no emergency split exists for this charge type.';
