-- Two-layer blog funnel: hub (charge-type overview) + spoke (question-specific SEO)
-- Hub articles are the Epiphany Bridge to the $127 Playbook.
-- Spoke articles are SEO capture nets for specific 3AM Google searches.
-- Existing rows default to 'hub' (all current articles are charge-type level).

ALTER TABLE content_gaps
  ADD COLUMN article_type text NOT NULL DEFAULT 'hub';

ALTER TABLE content_gaps
  ADD CONSTRAINT content_gaps_article_type_check
  CHECK (article_type IN ('hub', 'spoke'));

ALTER TABLE blog_drafts
  ADD COLUMN article_type text NOT NULL DEFAULT 'hub';

ALTER TABLE blog_drafts
  ADD CONSTRAINT blog_drafts_article_type_check
  CHECK (article_type IN ('hub', 'spoke'));
