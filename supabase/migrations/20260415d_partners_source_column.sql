-- Add source column to partners table so the checklist (and future features)
-- can branch on partner type (bondsman vs generic vs attorney etc.).
-- Backfill from partner_applications audit trail.

ALTER TABLE partners ADD COLUMN IF NOT EXISTS source text;

-- Backfill: grab the most recent application source for each partner by email.
UPDATE partners p
SET source = sub.source
FROM (
  SELECT DISTINCT ON (email) email, source
  FROM partner_applications
  WHERE source IS NOT NULL
  ORDER BY email, created_at DESC
) sub
WHERE sub.email = p.email
  AND p.source IS NULL;
