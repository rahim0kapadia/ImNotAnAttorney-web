-- 20260424d_ppi_parole_rates.sql
--
-- Prison Policy Initiative (PPI) discretionary parole grant rates by state.
--
-- Source: https://www.prisonpolicy.org/data/parolerates_2019_2022.html
-- Coverage: 43 states + DC, annual 2019-2022.
-- Methodology: PPI collected via public records + open-records requests. Rate =
--   granted_count / decisions_count on hearings where parole was possible but
--   not mandated.
--
-- Powers IB $997 appendix: "parole-board grant rates where your case lands",
-- state-specific parole-hearing context for playbooks.

CREATE TABLE IF NOT EXISTS public.ppi_parole_rates (
  id                          BIGSERIAL   PRIMARY KEY,
  state_code                  CHAR(2)     NOT NULL,
  year                        SMALLINT    NOT NULL,
  decisions_count             INT,
  granted_count               INT,
  grant_rate_pct              NUMERIC(5,2),
  pct_change_approval_19_22   NUMERIC(6,2),
  pct_change_released_19_22   NUMERIC(6,2),
  source_pdf_url              TEXT,
  notes                       TEXT,
  source_url                  TEXT        NOT NULL DEFAULT 'https://www.prisonpolicy.org/data/parolerates_2019_2022.html',
  ingested_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (state_code, year)
);

CREATE INDEX IF NOT EXISTS ppi_parole_rates_state_idx
  ON public.ppi_parole_rates (state_code);

COMMENT ON TABLE public.ppi_parole_rates
  IS 'Prison Policy Initiative parole grant rates, 43 states + DC, 2019-2022. Source: prisonpolicy.org/data/parolerates_2019_2022.html.';
COMMENT ON COLUMN public.ppi_parole_rates.source_pdf_url
  IS 'Direct URL to the state parole board PDF/report PPI cited for this state (may be null if PPI did not link one — open-records request sources).';
COMMENT ON COLUMN public.ppi_parole_rates.pct_change_approval_19_22
  IS 'State-level 2019→2022 change in approval rate (same value duplicated across that state''s 4 yearly rows for denormalized query convenience).';
