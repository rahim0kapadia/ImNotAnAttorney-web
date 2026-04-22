-- 20260422e_attorney_discipline.sql
--
-- Cross-state attorney directory + disciplinary history.
--
-- No bulk CSV / API from state bars; data is collected by public-record scrapers
-- per state (CA first via scripts/ingest/scrape-calbar-discipline.mjs). CA State
-- Bar "Recent Disciplinary Actions" is a paginated public disclosure page
-- (?page=0..N), confirmed 2026-04-22. TX / FL / NY planned.
--
-- Schema intentionally normalized so downstream consumers (attorney-vetting
-- $47 SKU, IB appendix "Opposing Counsel Red Flags") can filter by
-- jurisdiction + status without re-parsing free-text violation summaries.

-- ── attorneys ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.attorneys (
  id              BIGSERIAL PRIMARY KEY,
  jurisdiction    CHAR(2)     NOT NULL,           -- USPS state code ('CA','TX',...)
  bar_number      TEXT        NOT NULL,
  full_name       TEXT        NOT NULL,
  first_name      TEXT,
  last_name       TEXT,
  admission_date  DATE,
  current_status  TEXT,                           -- 'active','inactive','disbarred','suspended','resigned'
  firm            TEXT,
  city            TEXT,
  source_url      TEXT,
  last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (jurisdiction, bar_number)
);

CREATE INDEX IF NOT EXISTS attorneys_jur_name_idx
  ON public.attorneys (jurisdiction, last_name, first_name);

CREATE INDEX IF NOT EXISTS attorneys_nonstd_status_idx
  ON public.attorneys (current_status)
  WHERE current_status NOT IN ('active', 'inactive');

COMMENT ON TABLE public.attorneys IS
  'Cross-state attorney directory. Sources: state bar scrapers (CA first via scripts/ingest/scrape-calbar-discipline.mjs; TX/FL/NY planned). No bulk endpoints exist — public web scraping only.';

-- ── attorney_discipline_events ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.attorney_discipline_events (
  id                  BIGSERIAL PRIMARY KEY,
  attorney_id         BIGINT REFERENCES public.attorneys(id) ON DELETE CASCADE,
  jurisdiction        CHAR(2)     NOT NULL,
  bar_number          TEXT        NOT NULL,
  full_name           TEXT        NOT NULL,
  order_date          DATE,
  effective_date      DATE,
  discipline_type     TEXT        NOT NULL,       -- normalized: 'disbarment','suspension','probation','public_reproval','resignation_with_charges','interim_suspension'
  discipline_raw      TEXT,                       -- original label from source HTML
  violation_summary   TEXT,
  order_url           TEXT,
  source_url          TEXT        NOT NULL,
  scraped_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (jurisdiction, bar_number, order_date, discipline_type)
);

CREATE INDEX IF NOT EXISTS ade_jur_bar_idx
  ON public.attorney_discipline_events (jurisdiction, bar_number);

CREATE INDEX IF NOT EXISTS ade_order_date_idx
  ON public.attorney_discipline_events (order_date DESC);

COMMENT ON TABLE public.attorney_discipline_events IS
  'Normalized attorney disciplinary history. One row per discipline action. Source: state bar public disclosure pages. License check per state — CA public records, no ToS restriction on public data reuse.';
