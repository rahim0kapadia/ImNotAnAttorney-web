-- 20260419a: Partial unique on OPEN content_gaps to serialize auto-seeding races.
--
-- Phase 0.5 of the 2026-04-19 abandoned-question engine hardening plan.
--
-- Problem: blog-ops/scripts/match-blog.mjs's ensureContentGap() performs a
-- read-modify-write without transactional guarantees. Two concurrent
-- `match-blog.mjs --no-match` calls for the same (charge_type_slug,
-- pain_point_slug) both observed "no existing open gap" and both issued
-- INSERTs, producing duplicate "open" gaps.
--
-- The original constraint from 00001_initial_schema.sql was a FULL-TABLE
-- UNIQUE (charge_type_slug, pain_point_slug), which was overly restrictive:
-- once a gap progressed to 'published', the same charge+pain pair could
-- never be re-seeded as a new 'identified' gap even though that's a valid
-- lifecycle.
--
-- Fix: drop the full constraint, replace with a PARTIAL unique index
-- scoped to OPEN gaps (status IN ('identified','in-progress') AND
-- has_blog_post = false). NULLS NOT DISTINCT so that (charge, NULL pain)
-- also serializes properly (default NULLS DISTINCT would treat NULL as
-- always different and defeat the race guard).
--
-- Corresponding JS change: ensureContentGap() now catches 23505 on INSERT
-- and falls back to re-select + update on the winning row.

BEGIN;

ALTER TABLE public.content_gaps
  DROP CONSTRAINT IF EXISTS content_gaps_charge_type_slug_pain_point_slug_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_content_gaps_open_charge_pain_unique
  ON public.content_gaps (charge_type_slug, pain_point_slug)
  NULLS NOT DISTINCT
  WHERE status IN ('identified', 'in-progress') AND has_blog_post = false;

COMMIT;
