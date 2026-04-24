-- 20260424f_data_source_health.sql
--
-- Weekly uptime ledger for the public data sources we rely on (state bar pages,
-- PPI, AO STFJ, DPIC, UH Law archive, CourtListener, etc.). Powers
-- /api/cron/source-health, which HEAD-checks each URL once per week and alerts
-- via Telegram when a source flips from 200 → non-200 or back.
--
-- Enforcement of "no-hallucinated-legal-data.md" HARD RULE requires that the
-- source URLs we stored beside every verified row remain live. This table is
-- the observability ledger for that invariant.

CREATE TABLE IF NOT EXISTS public.data_source_health_checks (
  id                    BIGSERIAL   PRIMARY KEY,
  source_slug           TEXT        NOT NULL,     -- 'calbar-recent', 'flbar-news', 'uh-tx-archive', 'ppi-parole', 'ao-stfj-d3', 'dpic-csv', etc.
  source_url            TEXT        NOT NULL,
  checked_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  http_status           INT,                       -- NULL when the HEAD call threw pre-response (timeout, DNS, etc.)
  response_time_ms      INT,
  content_length        BIGINT,
  error_message         TEXT,
  is_healthy            BOOLEAN     NOT NULL,      -- computed client-side: 200/202/301/302/304 → healthy
  consecutive_failures  INT         NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS data_source_health_slug_checked_at_idx
  ON public.data_source_health_checks (source_slug, checked_at DESC);

CREATE INDEX IF NOT EXISTS data_source_health_unhealthy_idx
  ON public.data_source_health_checks (source_slug, checked_at DESC)
  WHERE is_healthy = false;

COMMENT ON TABLE public.data_source_health_checks
  IS 'Weekly uptime ledger for public data-source URLs INAA relies on (state bars, PPI, AO STFJ, DPIC, UH Law archive, CourtListener). Feeds source-health cron alerts. Retention: 1 year (older rows pruned by cleanup).';
