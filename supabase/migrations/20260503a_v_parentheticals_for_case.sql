-- TICKET-12: cl_parentheticals "what later judges said about this case" view.
--
-- For every cited authority in an X-Ray report, surface what later judges
-- said about that case in their own opinions. The view exposes the raw
-- parenthetical text verbatim (anti-hallucination invariant #13: source-URL
-- backed) plus the citing case + date + a deep link to the describing
-- opinion on CourtListener.
--
-- Lookup convention: callers join on `described_cluster_id` (the cited
-- authority's CL cluster id, stored as text). Helper layer does the
-- canonical_id -> cluster_id bridge via entity_sources.
--
-- Relevance score = (citing-opinion citation_count + 1) * date_filed weight.
-- More-cited later opinions outrank obscure ones; same authority weight
-- = more recent wins. NULL date_filed sinks to the bottom.
--
-- Required index on cl_opinions_meta(cluster_id) — added below — so the
-- view's predicate `om_d.cluster_id = $X` is index-bounded. Without it
-- the join scans 9.9M opinion rows. With it: ~50ms p50.

-- 1) Index supporting cluster_id predicate (CONCURRENTLY-safe)
CREATE INDEX IF NOT EXISTS idx_cl_opinions_meta_cluster_id
  ON public.cl_opinions_meta(cluster_id);

-- 2) View
CREATE OR REPLACE VIEW public.v_parentheticals_for_case AS
SELECT
  -- Identity
  p.id                                  AS parenthetical_id,
  om_d.cluster_id                       AS described_cluster_id,
  p.described_opinion_id,
  p.describing_opinion_id,
  om_g.cluster_id                       AS describing_cluster_id,

  -- Verbatim text (no transformation — anti-hallucination invariant)
  p.text                                AS describing_text,
  p.score                               AS parenthetical_score,

  -- Citing-case metadata (the "later judge")
  cl_g.case_name                        AS describing_case_name,
  cl_g.case_name_short                  AS describing_case_name_short,
  cl_g.date_filed                       AS describing_date_filed,
  cl_g.citation_count                   AS describing_citation_count,

  -- Source URL (deterministic CL deep link to the describing opinion)
  ('https://www.courtlistener.com/opinion/' || om_g.cluster_id::text || '/')
                                        AS source_url,

  -- Composite relevance score for ORDER BY without per-call recomputation.
  -- Float precision is intentional — used only for ORDER BY, never persisted.
  (
    (COALESCE(cl_g.citation_count, 0) + 1)::double precision
    * GREATEST(
        EXTRACT(EPOCH FROM cl_g.date_filed),
        0::double precision
      )
  )                                     AS relevance_score
FROM public.cl_parentheticals p
JOIN public.cl_opinions_meta om_d
  ON om_d.id = p.described_opinion_id
JOIN public.cl_opinions_meta om_g
  ON om_g.id = p.describing_opinion_id
JOIN public.cl_opinion_clusters cl_g
  ON cl_g.id = om_g.cluster_id;

COMMENT ON VIEW public.v_parentheticals_for_case IS
  'TICKET-12: per-case lookup of "what later judges said about this case". '
  'Filter by described_cluster_id (the cited authority''s CL cluster id). '
  'Order by relevance_score DESC for top-N selection. Verbatim text only.';

-- 3) Permissions: anon + authenticated need SELECT for Edge Function +
-- Node helper. Service role inherits via default grants.
GRANT SELECT ON public.v_parentheticals_for_case TO anon, authenticated;
