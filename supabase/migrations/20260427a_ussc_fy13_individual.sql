-- USSC FY13 Individual Offender Datafile (pre-FY14 expansion).
-- Adds ussc_fy13_individual to the per-fiscal-year USSC ladder
-- (ussc_fy14_individual through ussc_fy24_individual already loaded).
--
-- Source: https://www.ussc.gov/sites/default/files/zip/opafy13nid.zip
-- Loader: scripts/ussc-pre-fy14-stream-loader.py
-- Cadence: annual (USSC publishes once per fiscal year, no historical refresh)
-- Schema: 29 text columns, mirrors ussc_fy14_individual (live DB introspection
--         confirmed 29/29 SAS positions resolve from FY13 codebook).
-- License: public-domain US Sentencing Commission
--
-- Note: this migration is idempotent. The Python loader does
-- DROP TABLE IF EXISTS + CREATE UNLOGGED + COPY + SET LOGGED + RENAME on
-- every --apply run. This file documents the resulting shape so future
-- sessions can rebuild from .sql alone if the loader is unavailable.

CREATE TABLE IF NOT EXISTS ussc_fy13_individual (
  usscidn   text,
  district  text,
  circdist  text,
  moncirc   text,
  age       text,
  citizen   text,
  monrace   text,
  monsex    text,
  neweduc   text,
  nocomp    text,
  weapsoc   text,
  xfolsor   text,
  xcrhissr  text,
  glmin     text,
  glmax     text,
  rangept   text,
  disposit  text,
  newcnvtn  text,
  senttot   text,
  sensplt0  text,
  timservd  text,
  totprisn  text,
  reas1     text,
  reas2     text,
  reas3     text,
  reas4     text,
  reas5     text,
  amendyr   text,
  acctresp  text
);

COMMENT ON TABLE ussc_fy13_individual IS
  'Source: https://www.ussc.gov/sites/default/files/zip/opafy13nid.zip | Cadence: annual | Ingester: scripts/ussc-pre-fy14-stream-loader.py | License: public-domain US Sentencing Commission';
