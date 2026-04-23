-- T7: pji_instruction_citations join table.
-- Links pattern_jury_instructions rows to cl_opinion_bodies where the
-- instruction is cited in judicial opinions. Populated by
-- scripts/ingest/pji-scan-citations.mjs.
-- Unblocks T22 (invalidation detection) + T56 (public-render filter).
-- See docs/plans/2026-04-21-worry-pji-gaps.md for context.

CREATE TABLE IF NOT EXISTS public.pji_instruction_citations (
  pji_id bigint NOT NULL REFERENCES public.pattern_jury_instructions(id) ON DELETE CASCADE,
  cl_opinion_id bigint NOT NULL,
  citation_context text,
  match_type text NOT NULL CHECK (match_type IN ('direct', 'numeric_ref', 'phrase', 'overruled')),
  confidence real NOT NULL CHECK (confidence >= 0.0 AND confidence <= 1.0),
  extracted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (pji_id, cl_opinion_id)
);

CREATE INDEX IF NOT EXISTS idx_pji_citations_cl_opinion_id
  ON public.pji_instruction_citations (cl_opinion_id);

CREATE INDEX IF NOT EXISTS idx_pji_citations_pji_id
  ON public.pji_instruction_citations (pji_id);

CREATE INDEX IF NOT EXISTS idx_pji_citations_match_type
  ON public.pji_instruction_citations (match_type);

COMMENT ON TABLE public.pji_instruction_citations IS
  'Links PJI rows to cl_opinion_bodies where the instruction is cited. Source: scripts/ingest/pji-scan-citations.mjs (T7 in docs/plans/2026-04-21-worry-pji-gaps.md).';

COMMENT ON COLUMN public.pji_instruction_citations.match_type IS
  'direct = explicit "Nth Circuit Pattern Instruction X.Y"; numeric_ref = instruction number in pattern-instruction context; phrase = body-text phrase match; overruled = invalidation signal.';

COMMENT ON COLUMN public.pji_instruction_citations.confidence IS
  '0.0 to 1.0. Set by extractor based on specificity of the match context.';

COMMENT ON COLUMN public.pji_instruction_citations.cl_opinion_id IS
  'References cl_opinion_bodies.opinion_id. No FK — cl_opinion_bodies is bulk-reloaded periodically.';
