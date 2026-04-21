-- RPC: ranked SCOTUS case search with year-range filter + HTML-stripped snippets.
-- Consumed by /api/tools/scotus-case-search.
--
-- Plan: ImNotAnAttorney/docs/plans/2026-04-21-walkerdb-scotus-ingest.md

CREATE OR REPLACE FUNCTION public.scotus_case_search(
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
AS $$
  WITH query_vec AS (
    SELECT CASE
      WHEN q IS NULL OR btrim(q) = '' THEN NULL
      ELSE websearch_to_tsquery('english', q)
    END AS tsq
  )
  SELECT
    c.case_id,
    c.name,
    c.term,
    c.citation_year,
    c.citation_volume,
    c.citation_page,
    c.first_party,
    c.second_party,
    LEFT(regexp_replace(COALESCE(c.facts_of_the_case, ''), '<[^>]+>', '', 'g'), 500) AS facts_snippet,
    LEFT(regexp_replace(COALESCE(c.question, ''),          '<[^>]+>', '', 'g'), 500) AS question_snippet,
    LEFT(regexp_replace(COALESCE(c.conclusion, ''),        '<[^>]+>', '', 'g'), 500) AS conclusion_snippet,
    c.justia_url,
    c.oyez_href,
    c.decided_date,
    CASE
      WHEN qv.tsq IS NULL THEN 0.0::real
      ELSE ts_rank(
        to_tsvector('english',
          COALESCE(c.name, '')               || ' ' ||
          COALESCE(c.first_party, '')        || ' ' ||
          COALESCE(c.second_party, '')       || ' ' ||
          COALESCE(c.question, '')           || ' ' ||
          COALESCE(c.facts_of_the_case, '')  || ' ' ||
          COALESCE(c.conclusion, '')         || ' ' ||
          COALESCE(c.description, '')
        ),
        qv.tsq
      )
    END AS rank
  FROM public.scotus_cases c
  CROSS JOIN query_vec qv
  WHERE
    (qv.tsq IS NULL
     OR to_tsvector('english',
          COALESCE(c.name, '')              || ' ' ||
          COALESCE(c.first_party, '')       || ' ' ||
          COALESCE(c.second_party, '')      || ' ' ||
          COALESCE(c.question, '')          || ' ' ||
          COALESCE(c.facts_of_the_case, '') || ' ' ||
          COALESCE(c.conclusion, '')        || ' ' ||
          COALESCE(c.description, '')
        ) @@ qv.tsq)
    AND (year_from IS NULL OR c.citation_year >= year_from)
    AND (year_to   IS NULL OR c.citation_year <= year_to)
  ORDER BY rank DESC, c.citation_year DESC NULLS LAST, c.name ASC
  LIMIT LEAST(GREATEST(result_limit, 1), 100);
$$;

COMMENT ON FUNCTION public.scotus_case_search(TEXT, TEXT, TEXT, INT) IS
  'Free-text ranked search over SCOTUS cases with year-range filter and HTML-stripped snippets.';
