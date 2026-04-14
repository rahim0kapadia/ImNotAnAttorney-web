-- Add source_urls text[] to judge_quotes for consistency with classified_opinions.
-- Migrate existing source_url (singular) into source_urls array.
-- The defense-intelligence/query.ts wrapper reads source_urls[] and falls back to source_url.

ALTER TABLE judge_quotes ADD COLUMN IF NOT EXISTS source_urls text[] DEFAULT '{}';

-- Migrate existing data
UPDATE judge_quotes SET source_urls = ARRAY[source_url]
WHERE source_url IS NOT NULL AND (source_urls IS NULL OR source_urls = '{}');

-- Add opinion_context column for Phase 1 quote-to-pattern linking
ALTER TABLE judge_quotes ADD COLUMN IF NOT EXISTS opinion_context jsonb;
