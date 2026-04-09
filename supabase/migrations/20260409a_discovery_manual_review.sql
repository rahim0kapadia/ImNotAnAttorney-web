-- Add needs_manual_review flag to discovery_documents
-- Used by MediaProcessor when a file type is unsupported or tier-gated
ALTER TABLE discovery_documents
  ADD COLUMN IF NOT EXISTS needs_manual_review boolean DEFAULT false;
