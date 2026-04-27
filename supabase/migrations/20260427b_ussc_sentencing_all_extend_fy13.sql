-- Extend ussc_sentencing_all union view to include FY13.
-- Pre-FY18 USSC tables lack 5 columns: offguide, sentrnge, mnthdept, pcntdept, senspcap.
-- These get NULL filler in the view (same pattern FY14-17 already use).
--
-- Source: docs/handoffs/2026-04-20-ussc-load-and-similar-cases.md (handoff
-- documents the union pattern; FY13 follows it identically).

CREATE OR REPLACE VIEW ussc_sentencing_all AS
SELECT 13::smallint AS fy,
    usscidn, district, circdist, moncirc, age, citizen, monrace, monsex, neweduc,
    NULL::text AS offguide,
    nocomp, weapsoc, xfolsor, xcrhissr, glmin, glmax,
    NULL::text AS sentrnge,
    rangept, disposit, newcnvtn, senttot, sensplt0, timservd, totprisn,
    NULL::text AS mnthdept,
    NULL::text AS pcntdept,
    reas1, reas2, reas3, reas4, reas5,
    NULL::text AS senspcap,
    amendyr, acctresp
   FROM ussc_fy13_individual
UNION ALL
SELECT 14::smallint AS fy,
    usscidn, district, circdist, moncirc, age, citizen, monrace, monsex, neweduc,
    NULL::text AS offguide,
    nocomp, weapsoc, xfolsor, xcrhissr, glmin, glmax,
    NULL::text AS sentrnge,
    rangept, disposit, newcnvtn, senttot, sensplt0, timservd, totprisn,
    NULL::text AS mnthdept,
    NULL::text AS pcntdept,
    reas1, reas2, reas3, reas4, reas5,
    NULL::text AS senspcap,
    amendyr, acctresp
   FROM ussc_fy14_individual
UNION ALL
SELECT 15, usscidn, district, circdist, moncirc, age, citizen, monrace, monsex, neweduc,
    NULL::text, nocomp, weapsoc, xfolsor, xcrhissr, glmin, glmax,
    NULL::text, rangept, disposit, newcnvtn, senttot, sensplt0, timservd, totprisn,
    NULL::text, NULL::text, reas1, reas2, reas3, reas4, reas5, NULL::text, amendyr, acctresp
   FROM ussc_fy15_individual
UNION ALL
SELECT 16, usscidn, district, circdist, moncirc, age, citizen, monrace, monsex, neweduc,
    NULL::text, nocomp, weapsoc, xfolsor, xcrhissr, glmin, glmax,
    NULL::text, rangept, disposit, newcnvtn, senttot, sensplt0, timservd, totprisn,
    NULL::text, NULL::text, reas1, reas2, reas3, reas4, reas5, NULL::text, amendyr, acctresp
   FROM ussc_fy16_individual
UNION ALL
SELECT 17, usscidn, district, circdist, moncirc, age, citizen, monrace, monsex, neweduc,
    NULL::text, nocomp, weapsoc, xfolsor, xcrhissr, glmin, glmax,
    NULL::text, rangept, disposit, newcnvtn, senttot, sensplt0, timservd, totprisn,
    NULL::text, NULL::text, reas1, reas2, reas3, reas4, reas5, NULL::text, amendyr, acctresp
   FROM ussc_fy17_individual
UNION ALL
SELECT 18, usscidn, district, circdist, moncirc, age, citizen, monrace, monsex, neweduc,
    offguide, nocomp, weapsoc, xfolsor, xcrhissr, glmin, glmax,
    sentrnge, rangept, disposit, newcnvtn, senttot, sensplt0, timservd, totprisn,
    mnthdept, pcntdept, reas1, reas2, reas3, reas4, reas5, senspcap, amendyr, acctresp
   FROM ussc_fy18_individual
UNION ALL
SELECT 19, usscidn, district, circdist, moncirc, age, citizen, monrace, monsex, neweduc,
    offguide, nocomp, weapsoc, xfolsor, xcrhissr, glmin, glmax,
    sentrnge, rangept, disposit, newcnvtn, senttot, sensplt0, timservd, totprisn,
    mnthdept, pcntdept, reas1, reas2, reas3, reas4, reas5, senspcap, amendyr, acctresp
   FROM ussc_fy19_individual
UNION ALL
SELECT 20, usscidn, district, circdist, moncirc, age, citizen, monrace, monsex, neweduc,
    offguide, nocomp, weapsoc, xfolsor, xcrhissr, glmin, glmax,
    sentrnge, rangept, disposit, newcnvtn, senttot, sensplt0, timservd, totprisn,
    mnthdept, pcntdept, reas1, reas2, reas3, reas4, reas5, senspcap, amendyr, acctresp
   FROM ussc_fy20_individual
UNION ALL
SELECT 21, usscidn, district, circdist, moncirc, age, citizen, monrace, monsex, neweduc,
    offguide, nocomp, weapsoc, xfolsor, xcrhissr, glmin, glmax,
    sentrnge, rangept, disposit, newcnvtn, senttot, sensplt0, timservd, totprisn,
    mnthdept, pcntdept, reas1, reas2, reas3, reas4, reas5, senspcap, amendyr, acctresp
   FROM ussc_fy21_individual
UNION ALL
SELECT 22, usscidn, district, circdist, moncirc, age, citizen, monrace, monsex, neweduc,
    offguide, nocomp, weapsoc, xfolsor, xcrhissr, glmin, glmax,
    sentrnge, rangept, disposit, newcnvtn, senttot, sensplt0, timservd, totprisn,
    mnthdept, pcntdept, reas1, reas2, reas3, reas4, reas5, senspcap, amendyr, acctresp
   FROM ussc_fy22_individual
UNION ALL
SELECT 23, usscidn, district, circdist, moncirc, age, citizen, monrace, monsex, neweduc,
    offguide, nocomp, weapsoc, xfolsor, xcrhissr, glmin, glmax,
    sentrnge, rangept, disposit, newcnvtn, senttot, sensplt0, timservd, totprisn,
    mnthdept, pcntdept, reas1, reas2, reas3, reas4, reas5, senspcap, amendyr, acctresp
   FROM ussc_fy23_individual
UNION ALL
SELECT 24, usscidn, district, circdist, moncirc, age, citizen, monrace, monsex, neweduc,
    offguide, nocomp, weapsoc, xfolsor, xcrhissr, glmin, glmax,
    sentrnge, rangept, disposit, newcnvtn, senttot, sensplt0, timservd, totprisn,
    mnthdept, pcntdept, reas1, reas2, reas3, reas4, reas5, senspcap, amendyr, acctresp
   FROM ussc_fy24_individual;
