-- Tier-ladder Worry-to-Pristine deferred-item closure pass.
-- Closes R2-S6 (FK on order_id) + S11 (operator-feedback audit column).
--
-- Plan: docs/plans/2026-04-22-tier-ladder-data-differentiation.md
-- Findings log: docs/plans/2026-04-22-worry-tier-ladder-pristine-findings.md
--
-- R2-S6: rising_precedent_alerts_log.order_id had no FK to orders. Deferred
-- originally to preserve audit retention if an order row is hard-deleted.
-- Closure: drop NOT NULL on order_id, add FK with ON DELETE SET NULL. Audit
-- row survives order deletion; the NULL order_id signals "order purged".
--
-- S11: operator-feedback rated_at column so Critique Shadowing (Hamel's
-- Stage-2 LLM eval loop) can partition feedback by rating recency.

BEGIN;

-- R2-S6: make order_id nullable so ON DELETE SET NULL can fire.
ALTER TABLE public.rising_precedent_alerts_log
    ALTER COLUMN order_id DROP NOT NULL;

-- R2-S6: add FK with ON DELETE SET NULL. IF NOT EXISTS pattern via DO block
-- because ALTER TABLE ADD CONSTRAINT has no IF NOT EXISTS clause.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'rpal_order_id_fk'
          AND conrelid = 'public.rising_precedent_alerts_log'::regclass
    ) THEN
        ALTER TABLE public.rising_precedent_alerts_log
            ADD CONSTRAINT rpal_order_id_fk
            FOREIGN KEY (order_id)
            REFERENCES public.orders (id)
            ON DELETE SET NULL;
    END IF;
END $$;

-- S11: rated_at column + index for Stage-2 LLM eval partition.
ALTER TABLE public.llm_generations
    ADD COLUMN IF NOT EXISTS operator_rated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_llm_gen_rated_at
    ON public.llm_generations (operator_rated_at DESC NULLS LAST)
    WHERE operator_rated_at IS NOT NULL;

COMMENT ON COLUMN public.llm_generations.operator_rated_at IS
    'When the operator recorded rating via /api/admin/llm-feedback. NULL = not rated. Feeds Stage-2 Critique Shadowing.';

COMMIT;
