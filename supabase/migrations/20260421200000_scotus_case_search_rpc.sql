-- RPC: ranked SCOTUS case search with year-range filter + HTML-stripped snippets.
-- Consumed by /api/tools/scotus-case-search and the /tools/scotus-case-search page.
--
-- Plan: ImNotAnAttorney/docs/plans/2026-04-21-walkerdb-scotus-ingest.md
--
-- Security hardening (PR #21 code-review response):
--   * DROP FUNCTION IF EXISTS so CREATE can change arg types without overload hazard
--   * SET search_path so a malicious schema can't shadow to_tsvector / ts_rank / etc
--   * REVOKE EXECUTE from anon+authenticated — Supabase auto-grants on public.* functions,
--     we gate access through API-layer rate limiting + service-role-only admin client.
--   * Year filter uses ~ '^\d{4}$' guard + numeric cast — citation_year is TEXT and
--     lexicographic comparison silently misclassifies 3-digit or non-digit Oyez values.
--   * tsvector + numeric year materialized once in a CTE (reused by WHERE / SELECT /
--     ORDER BY) so the row isn't traversed three times.

BEGIN;

DROP FUNCTION IF EXISTS public.scotus_case_search(TEXT, TEXT, TEXT, INT);

CREATE FUNCTION public.scotus_case_search(
  q TEXT,
  year_from TEXT DEFAULT NULL,
  year_to TEXT DEFAULT NULL,
  result_limit INT DEFAULT 20
)
RETURNS TABLE(
  case_id            BIGINT,
  name               TEXT,
  term               TEXT,
  citation_year      TEXT,
  citation_volume    TEXT,
  citation_page      TEXT,
  first_party        TEXT,
  second_party       TEXT,
  facts_snippet      TEXT,
  question_snippet   TEXT,
  conclusion_snippet TEXT,
  justia_url         TEXT,
  oyez_href          TEXT,
  decided_date       DATE,
  rank               REAL
)
LANGUAGE SQL
STABLE
SET search_path = pg_catalog, public
AS $$
  -- The tsvector expression below MUST match the GIN index predicate exactly
  -- (scotus_cases_fts_idx in the schema migration) or the WHERE clause won't
  -- hit the index. Keep these in lockstep.
  WITH query_vec AS (
    SELECT
      CASE
        WHEN q IS NULL OR btrim(q) = '' THEN NULL
        ELSE websearch_to_tsquery('english', q)
      END AS tsq,
      CASE WHEN year_from ~ '^\d{4}$' THEN year_from::int END AS yfrom_int,
      CASE WHEN year_to   ~ '^\d{4}$' THEN year_to::int   END AS yto_int
  ),
  ranked AS (
    SELECT
      c.case_id,
      c.name,
      c.term,
      c.citation_year,
      c.citation_volume,
      c.citation_page,
      c.first_party,
      c.second_party,
      c.facts_of_the_case,
      c.question,
      c.conclusion,
      c.justia_url,
      c.oyez_href,
      c.decided_date,
      to_tsvector(
        'english',
        COALESCE(c.name, '')               || ' ' ||
        COALESCE(c.first_party, '')        || ' ' ||
        COALESCE(c.second_party, '')       || ' ' ||
        COALESCE(c.question, '')           || ' ' ||
        COALESCE(c.facts_of_the_case, '')  || ' ' ||
        COALESCE(c.conclusion, '')         || ' ' ||
        COALESCE(c.description, '')
      ) AS tsv,
      CASE WHEN c.citation_year ~ '^\d{4}$' THEN c.citation_year::int END AS year_int
    FROM public.scotus_cases c
  )
  SELECT
    r.case_id,
    r.name,
    r.term,
    r.citation_year,
    r.citation_volume,
    r.citation_page,
    r.first_party,
    r.second_party,
    -- HTML tags stripped for visual cleanliness only (React text-node escaping
    -- is the XSS boundary). The strip handles well-formed <p>, <em> etc.
    LEFT(regexp_replace(COALESCE(r.facts_of_the_case, ''), '<[^>]+>', '', 'g'), 500) AS facts_snippet,
    LEFT(regexp_replace(COALESCE(r.question, ''),          '<[^>]+>', '', 'g'), 500) AS question_snippet,
    LEFT(regexp_replace(COALESCE(r.conclusion, ''),        '<[^>]+>', '', 'g'), 500) AS conclusion_snippet,
    r.justia_url,
    r.oyez_href,
    r.decided_date,
    CASE
      WHEN qv.tsq IS NULL THEN 0.0::real
      ELSE ts_rank(r.tsv, qv.tsq)
    END AS rank
  FROM ranked r
  CROSS JOIN query_vec qv
  WHERE
    (qv.tsq IS NULL OR r.tsv @@ qv.tsq)
    AND (qv.yfrom_int IS NULL OR (r.year_int IS NOT NULL AND r.year_int >= qv.yfrom_int))
    AND (qv.yto_int   IS NULL OR (r.year_int IS NOT NULL AND r.year_int <= qv.yto_int))
  ORDER BY
    rank DESC,
    r.year_int DESC NULLS LAST,
    r.name ASC
  LIMIT LEAST(GREATEST(result_limit, 1), 100);
$$;

COMMENT ON FUNCTION public.scotus_case_search(TEXT, TEXT, TEXT, INT) IS
  'Free-text ranked search over public.scotus_cases with year-range filter (guarded numeric cast) and HTML-stripped snippets. anon/authenticated roles revoked — access through API.';

REVOKE EXECUTE ON FUNCTION public.scotus_case_search(TEXT, TEXT, TEXT, INT)
  FROM anon, authenticated, PUBLIC;

COMMIT;
