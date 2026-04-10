-- Add attribution columns to subscribers table.
-- referral_url: the blog slug or page that referred the subscriber (e.g. "blog-dui-first-72-hours")
-- original_source: first source that created this subscriber, never overwritten on re-subscription

ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS referral_url text;
ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS original_source text;

-- Backfill original_source from existing source values
UPDATE subscribers SET original_source = source WHERE original_source IS NULL;

COMMENT ON COLUMN subscribers.referral_url IS 'Blog slug or page that referred this subscriber (e.g. blog-dui-first-72-hours)';
COMMENT ON COLUMN subscribers.original_source IS 'First source that created this subscriber — never overwritten on re-subscription';
