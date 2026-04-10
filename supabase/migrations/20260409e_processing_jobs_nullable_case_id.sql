-- Migration: Make processing_jobs.case_id nullable for case-less jobs
-- Date: 2026-04-09
-- Applied: 2026-04-09 via Supabase Management API (verified is_nullable=YES)
-- Context: Blog content pipeline + demand classifier port from web to engine
--          needs to enqueue jobs that are not scoped to any case (blog_qa,
--          blog_generate, demand_classify). The original schema required
--          case_id NOT NULL with FK to cases(id).
--
-- Pattern: nullable FK for "optional relationship" (Andrew Atkinson, High
--          Performance PostgreSQL for Rails, Pragmatic Bookshelf 2024).
--          PostgreSQL foreign key constraints allow NULL by default, so the
--          existing FK constraint continues to work unchanged — only the NOT
--          NULL constraint is dropped.
--
-- Impact:
--   - Existing rows: no change (all have case_id set)
--   - New rows: may now have case_id = NULL
--   - job_cost_tracking.case_id: not modified here. claude-headless.mjs guards
--     cost-tracking inserts with `if (jobId && caseId)` so null case_id means
--     tracking is silently skipped. No migration needed for that table yet.
--   - scheduleDownstream() in worker.mjs keys on case_id for inheritance; it is
--     never called for blog/demand workers (they are terminal in WORKER_PIPELINE).
--
-- Rollback: ALTER TABLE processing_jobs ALTER COLUMN case_id SET NOT NULL;
--           (will fail if any null rows exist; delete blog/demand jobs first)

ALTER TABLE processing_jobs
  ALTER COLUMN case_id DROP NOT NULL;
