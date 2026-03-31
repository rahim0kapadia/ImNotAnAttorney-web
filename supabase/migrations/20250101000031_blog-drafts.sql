-- Blog content pipeline: drafts table + content_gaps status extension

-- 1. blog_drafts table
CREATE TABLE IF NOT EXISTS public.blog_drafts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  content_gap_id integer NOT NULL REFERENCES content_gaps(id),
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  mdx_content text NOT NULL,
  frontmatter jsonb NOT NULL,
  generation_model text NOT NULL DEFAULT 'claude-opus-4-6',
  generation_prompt_hash text,
  humanizer_score numeric(5,2),
  humanizer_details jsonb,
  a1_result text CHECK (a1_result IN ('PASS', 'FAIL', 'NEEDS_WORK')),
  a1_details jsonb,
  upl_result text CHECK (upl_result IN ('PASS', 'FAIL', 'NEEDS_WORK')),
  upl_details jsonb,
  qa_attempts integer DEFAULT 0,
  qa_passed_at timestamptz,
  published_at timestamptz,
  version integer DEFAULT 1,
  status text DEFAULT 'draft' CHECK (status IN ('draft', 'qa-running', 'qa-passed', 'qa-failed', 'published', 'declined')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_blog_drafts_status ON blog_drafts(status);
CREATE INDEX idx_blog_drafts_gap ON blog_drafts(content_gap_id);

-- 2. Auto-update updated_at trigger
CREATE TRIGGER update_blog_drafts_updated_at
  BEFORE UPDATE ON blog_drafts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 3. Extend content_gaps.status to include new states
ALTER TABLE content_gaps DROP CONSTRAINT IF EXISTS content_gaps_status_check;
ALTER TABLE content_gaps ADD CONSTRAINT content_gaps_status_check
  CHECK (status IN ('identified', 'queued', 'in-progress', 'qa-passed', 'qa-failed', 'published', 'declined'));

-- 4. Link content_gaps to blog_drafts
ALTER TABLE content_gaps ADD COLUMN IF NOT EXISTS blog_draft_id uuid REFERENCES blog_drafts(id);

-- 5. Composite index for queue queries
CREATE INDEX IF NOT EXISTS idx_content_gaps_queue ON content_gaps(status, gap_score DESC);
