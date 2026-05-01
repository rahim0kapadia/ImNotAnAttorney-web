# Bulk-Source Aggregator Hunt — US State Criminal Statutes

**Status:** RESEARCH-COMPLETE — inventory of 6+ aggregator sources triangulated across 5 angles. Capstoned 2026-05-01. Decisions feed Phase 3/4 ingest plans; no execution work owned by this doc.

Date: 2026-05-01
Triangulated angles: A (aggregator+library projects) / B (per-state official feeds) / C (open-knowledge / academic / Internet Archive) / D (Free Law Project / CourtListener) / E (commercial-clean alternatives)
Time-boxed: ~40 minutes WebSearch + WebFetch
Author handoff: prior session inventoried UniCourt 9, DC, NY, TX, CA, Cornell LII, Public.Resource RTF dumps. This pass extends.

---

## NEW sources found (not in original 50-state survey)

### Source 1: Pile of Law — `state_codes` subset (HIGH-VALUE)
- **URL:** https://huggingface.co/datasets/pile-of-law/pile-of-law (subset `state_codes`)
- **Source-of-source:** https://github.com/Breakend/PileOfLaw — `dataset_creation/state_codes/state_codes_from_scratch.py`
- **Coverage:** ALL 54 jurisdictions per the scraper script: AK, AL, AR, AZ, CA, CO, CT, DC, DE, FL, GA, GU (Guam), HI, IA, ID, IL, IN, KS, KY, LA, MA, MD, ME, MI, MN, MO, MS, MT, NC, ND, NE, NH, NJ, NM, NV, NY, OH, OK, OR, PA, PR, RI, SC, SD, TN, TX, UT, VA, VI (Virgin Islands), VT, WA, WI, WV, WY
- **Format:** JSONL (xz-compressed). Fields: `text`, `created_timestamp`, `downloaded_timestamp`, `url`. ~705 MiB compressed → ~5 GiB uncompressed.
- **License/ToS:** CC-BY-NC-SA 4.0 (NonCommercial). Source data underneath: scraped from `law.justia.com/codes/{state}/{year}` — Justia content is itself unofficial republication of public-domain state code text.
- **Quality:** Raw, not normalized. Per-section text + the source URL preserved. URL pattern lets us **reconstruct authoritative state-leg URLs** because each `text` row carries the Justia URL, which encodes `state/year/title/chapter/section`.
- **Source-URL story:** GOOD with caveats. Justia URLs are stable; we'd need a per-state Justia → official-leg URL mapping (one-time table). The Justia URL itself is what UniCourt PRO data and most open-data state-code projects ultimately rely on. We have to honor `no-hallucinated-legal-data.md`: Justia URLs are NOT primary-source authoritative — they're a republisher. For internal verification scoring, Justia is "tier-2 source"; for the ROW we still need to fetch the official state-leg page.
- **Verdict:** **EVALUATE — strong fallback, NOT primary.** License (NC) blocks commercial use of the dataset directly, but the underlying public-domain text is fine if we re-derive ourselves. Practical play: use as a coverage map / reconciliation source while we ingest from official state-leg sites.

### Source 2: Internet Archive `gov.XX.code` — Public.Resource.Org bulk drops (CONFIRMED 7+ states)
- **URL pattern:** `https://archive.org/details/gov.{XX}.code` and `https://law.resource.org/pub/us/code/`
- **Verified state pages found:**
  - GA: https://archive.org/details/gov.ga.ocga.2018 (OCGA bulk)
  - TN: https://archive.org/details/gov.tn.tca
  - ND: https://archive.org/details/gov.nd.code
  - VA: https://archive.org/details/gov.va.code
  - VT: https://archive.org/details/gov.vt.code
  - NC: https://archive.org/details/gov.nc.code
  - KY: https://archive.org/details/gov.ky.code
- **Plus law.resource.org `/pub/us/code/` dirs:** AR, CA, CO, DE, GA, ID, MS, OR, TN
- **Coverage delta vs UniCourt's 14:** UniCourt covers AK, AR, CO, GA, ID, KY, MS, NC, ND, RI, TN, VA, VT, WY (14 states). Internet Archive `govlaw` collection adds **CA, DE, OR** that UniCourt doesn't have, and **adds ND, NC, VA bulk-dump format** even where UniCourt also exists (RTF/ODT vs UniCourt HTML).
- **Format:** OpenDocument Text (ODT), Rich Text Format (RTF), TXT, plus PNG state seal. Quarterly release cadence (e.g. `release88.2023.05`).
- **License:** Public domain — government edicts not subject to copyright (Banks v. Manchester / Georgia v. Public.Resource).
- **Quality:** Production-grade. Updated quarterly. Includes constitutions, court rules, AG opinions sometimes.
- **Source-URL story:** EXCELLENT. The IA item URL itself is a citable source-of-source; the underlying RTF originated from official state codifiers. For criminal code: VT Title 13, NC Chapter 14, VA Title 18.2, KY KRS Chapter 500-series, GA Title 16, ND Title 12.1, TN Title 39 — all in the bulk drops.
- **Verdict:** **USE — superior to UniCourt's HTML for canonical citation work.** UniCourt's HTML is human-readable; IA's RTF/ODT is machine-parseable in one shot via libreoffice or python-docx. Same underlying data, different layer in the pipeline. **Use IA as primary, UniCourt as backup HTML view.**

### Source 3: UniCourt cic-code-XX — confirmed 14 states (NOT 9)
- **URL pattern:** `https://github.com/UniCourt/cic-code-{xx}` and rendered at `https://unicourt.github.io/cic-code-{xx}/`
- **Full state list (verified via `github.com/orgs/UniCourt/repositories?q=cic-code`):**
  - cic-code-ak (Alaska) — Mar 17 2023
  - cic-code-ar (Arkansas) — Nov 28 2022
  - cic-code-co (Colorado) — Nov 28 2022
  - cic-code-ga (Georgia) — Mar 17 2023
  - cic-code-id (Idaho) — Jun 9 2022
  - cic-code-ky (Kentucky) — Nov 30 2022
  - cic-code-ms (Mississippi) — Nov 28 2022
  - cic-code-nc (North Carolina) — Nov 28 2022
  - cic-code-nd (North Dakota) — Nov 28 2022
  - cic-code-ri (Rhode Island) — Mar 17 2023
  - cic-code-tn (Tennessee) — Nov 28 2022
  - cic-code-va (Virginia) — Nov 28 2022
  - cic-code-vt (Vermont) — Nov 28 2022
  - cic-code-wy (Wyoming) — Nov 28 2022
- **Delta vs prior knowledge:** prior session said 9 (AK, AR, CO, GA, ID, KY, MS, ND, TN, VT). Actual = **14** — adds **NC, RI, VA, WY**. NC and VA are particularly meaningful (criminal code = NC §14, VA §18.2, both populous states).
- **Format:** Structured HTML (post-RTF beautify), public domain.
- **Quality:** STALE — most repos last touched late 2022 / early 2023. Three years out of date. For criminal-code purposes, slow-changing — but new amendments since 2022 will be missed.
- **Verdict:** **USE for fallback HTML rendering, layer ON TOP of Internet Archive RTF (which is fresher).** Same underlying material, different render layer.

### Source 4: DCCouncil/law-xml — DC bulk XML (HIGH-FRESHNESS)
- **URL:** https://github.com/DCCouncil/law-xml
- **Coverage:** District of Columbia (statutes + code), XML format. **580 releases**, latest April 29 2026 — actively maintained.
- **Format:** Native XML, semantic markup.
- **License:** Public domain.
- **Quality:** PRIMARY SOURCE — official DC Council publishes here directly. Includes DC criminal code (Title 22).
- **Verdict:** **USE — already known but worth re-emphasizing freshness.** Update cadence dwarfs everything else in this hunt.

### Source 5: Virginia Decoded — vacode.org (REDUNDANT WITH IA but cleaner format)
- **URL:** https://vacode.org/downloads/
- **Format:** `code.json.zip` (per-section JSON: section, catch line, text, history, structural ancestry) + `code.txt.zip` plain text + `dictionary.json.zip` defined terms. **No XML offered publicly** despite source pipeline ingesting Lexis Nexis XML.
- **Coverage:** Code of Virginia, all titles incl. Title 18.2 (criminal).
- **License:** Public domain — "do whatever you want with them."
- **Quality:** Clean, structured JSON. Built on State Decoded platform.
- **Verdict:** **USE for VA only — JSON is more ingest-friendly than IA's RTF for this state.** Skip if Phase 2 has already built a VA RTF→canonical extractor (project memory `project-va-statutes-seed.md` says PR #130 already shipped 595 VA rows).

### Source 6: Colorado General Assembly — official SGML bulk (REQUEST-BASED)
- **URL:** https://content.leg.colorado.gov/agencies/office-legislative-legal-services/colorado-revised-statutes-data
- **Coverage:** Colorado Revised Statutes (CRS) — all titles incl. Title 18 (criminal code).
- **Format:** SGML zip, free, request-form gated (no direct download URL — submit form, they send zip).
- **Update:** Annual after legislative session.
- **License:** Public domain.
- **Quality:** Primary-source authoritative. SGML is verbose but parseable (sgml→xml→json with `osx` or `pyOpenSP`).
- **Verdict:** **USE — official primary source for CO.** Friction = request form (1-2 day turnaround). After first request, file the zip in scripts/data-dumps/ and refresh annually. For CO criminal code (Title 18), this is the gold-standard source URL.

### Source 7: Washington WSL Web Services — RCW SOAP/XML API (LIVE)
- **URL:** https://wslwebservices.leg.wa.gov/
- **Coverage:** Revised Code of Washington (RCW) including Title 9/9A (criminal code). Also bills, sessions, members.
- **Format:** SOAP/XML web services, free, no auth, 24/7.
- **Quality:** Primary-source authoritative.
- **Source-URL story:** EXCELLENT — WSL is the official codifier; URLs are citation-anchored.
- **Verdict:** **USE — for WA, this is the canonical bulk path.** SOAP is vintage but parseable in Node via `easy-soap-request` or just raw fetch + xml2js.

### Source 8: CorUSSS — Corpus of US State Statutes (academic, gated)
- **URL:** https://papers.ssrn.com/sol3/papers.cfm?abstract_id=4232252 (paper); corpus access via Northern Arizona University, Egbert + Wood.
- **Coverage:** all 50 states, **1,785,742 statutory text rows**.
- **Format:** Linguistic corpus — likely TXT/CSV with universal-citation column. Source: scraped Justia (same upstream as Pile of Law).
- **Access:** Paper is gated behind ScienceDirect/SSRN. Corpus distribution unclear from public docs — likely access-on-request via NAU corpus interface.
- **Verdict:** **EVALUATE — academic gating + Justia underlying = strict subset of what Pile of Law `state_codes` already gives us.** Skip unless we need the linguistic-annotation layer (POS tags, lemmatization). For statute-text-only ingestion, Pile of Law dominates.

### Source 9: Public.Law sister sites (oregon.public.law, nevada.public.law)
- **URL:** https://oregon.public.law, https://nevada.public.law
- **Coverage:** Only OR + NV currently — NOT a 50-state aggregator. Repo at github.com/public-law/datasets has glossaries and Rome Statute, no other US state statute dumps yet.
- **License:** CC-BY 4.0.
- **Verdict:** **SKIP — overlaps Justia / Pile of Law, narrower coverage, no advantage.** Watch for expansion (Public.Law headquartered in Colorado now, claims plans to "bring Oregon recipe to rest of US"), but it's not there yet.

### Source 10: davidawad/statedb (LEGACY — abandon)
- **URL:** https://github.com/davidawad/statedb
- **Coverage:** Partial single-state samples (AL 2017, NJ 2015). Years 2015 + 2017 only. README explicitly says "not comprehensive."
- **Verdict:** **SKIP — stale + partial. Pile of Law strictly superior.**

### Source 11: openlawlibrary stack (DC + 1 city + 1 tribe — narrow)
- **URL:** https://github.com/openlawlibrary, openlawlib.org
- **Coverage:** Production deployments at DC (already covered by DCCouncil/law-xml), San Mateo CA municipal, Pueblo de San Ildefonso tribal. Platform/tooling, not a multi-state corpus.
- **Verdict:** **SKIP for state criminal code purposes — OL is a CMS, not a state-corpus aggregator.**

### Source 12: OpenLaws.us (commercial API — not free)
- **URL:** https://openlaws.us, https://docs.openlaws.us
- **Coverage:** Self-claims "53 jurisdictions, 4.3M sections" — all 50 states + DC + PR + FED, statutes / regulations / constitutions / case law / court rules.
- **Format:** Commercial API, "Commercially Licensable, Low Latency."
- **License/cost:** **Not free. Pricing on request.** Bulk available "for tailored solutions."
- **Verdict:** **SKIP per Bootstrap Mode rule.** This is the only true "all 50 states" packaged offering, but it's gated behind paid API. Note its existence — if our compute/time cost ever exceeds the API's cost, re-evaluate. For now, building from Justia + IA + official state-leg sites costs $0.

### Source 13: Free Law Project — case law only, not statutes
- **URL:** https://free.law/datasets/, CourtListener bulk
- **Coverage:** federal + state CASE LAW (opinions, dockets, judges). **NOT state statutes.**
- **Verdict:** **SKIP for this hunt — different data class.** (We already use CourtListener for case law per existing pipelines.)

### Source 14: OpenStates / Plural Policy (BILLS only, not codified statutes)
- **URL:** https://docs.openstates.org, https://open.pluralpolicy.com/data/
- **Coverage:** Legislative bills + members, all 50 + DC + PR. **NOT codified statutes** — that's the codifier's job, downstream of bills.
- **Verdict:** **SKIP for this hunt.** Useful for bill-tracking (separate problem).

### Source 15: LegiScan (BILLS only)
- **URL:** https://legiscan.com/datasets
- Same shape as OpenStates: bills/sessions, not codes. **SKIP.**

### Source 16: NCSL (50-state surveys, not bulk text)
- **URL:** https://www.ncsl.org
- **Coverage:** 50-state policy comparisons + bill-tracking. Some written summaries reference state statutes but no bulk-text export.
- **Verdict:** **SKIP — not machine-readable bulk text.**

---

## Per-state delta vs original survey

| State | Survey bucket (old) | New source found? | Better? | New verdict |
|-------|---------------------|-------------------|---------|-------------|
| AK | UniCourt | Pile-of-Law + IA RTF (lookup) | YES — multiple paths | A (UniCourt primary, PoL fallback) |
| CA | bespoke / leginfo | **Public.Resource RTF at law.resource.org/pub/us/code/ca/** | YES | A (existing leginfo + IA backup) |
| CO | bespoke | **Official SGML zip via leg.colorado.gov request form** + UniCourt + IA | YES — primary source now identified | A (SGML primary, UniCourt fallback) |
| DE | bespoke / delcode.delaware.gov | **Public.Resource RTF at law.resource.org/pub/us/code/de/** | YES | A (PR RTF primary if delcode.gov bulk missing) |
| OR | bespoke / oregonlegislature.gov | **public.law/datasets + Public.Resource RTF + Pile of Law** | YES — three paths | A (multiple) |
| NC | C (no plan) | UniCourt + IA `gov.nc.code` RTF + Pile of Law | YES — moves from C → A | A (IA RTF primary, UniCourt + PoL fallback) |
| RI | C (no plan) | UniCourt cic-code-ri + Pile of Law | YES — C → A | A (UniCourt primary) |
| VA | C (PR #130 already shipped) | Already covered — vacode.org JSON + UniCourt + IA RTF | Reinforces existing | A (already shipped) |
| WY | C (no plan) | UniCourt cic-code-wy + Pile of Law | YES — C → A | A (UniCourt primary) |
| ND | B (low-priority) | UniCourt + IA `gov.nd.code` + Pile of Law | YES — B → A | A (IA RTF primary) |
| ID | C/D | UniCourt cic-code-id + IA RTF + Pile of Law | YES | A |
| KY | C/D | UniCourt + IA `gov.ky.code` + Pile of Law | YES | A |
| MS | C/D | UniCourt + IA RTF + Pile of Law | YES | A |
| TN | C/D | UniCourt + IA `gov.tn.tca` + Pile of Law | YES | A |
| VT | C/D | UniCourt + IA `gov.vt.code` + Pile of Law | YES | A |
| GA | C/D | UniCourt + IA `gov.ga.ocga.2018` + Pile of Law | YES | A |
| AR | C/D | UniCourt + IA RTF + Pile of Law | YES | A |
| WA | bespoke | **WSL SOAP/XML web services (official, free, live)** | YES — primary | A (WSL primary) |
| All other 30+ states | mixed B/C/D | **Pile of Law (Justia source) covers all of them** | YES — at minimum a coverage backstop | B+ (Pile-of-Law fallback floor) |

**States genuinely still gated:** Even Pile of Law / Justia covers IL, IN, MD, MI, MN, NJ, OK, PA, SC, WI, etc. — but Justia is republisher, not authoritative. For **authoritative source URLs** we still need bespoke per-state scrapers against the official codifier site. **No one source on the open Internet ships authoritative all-50-state criminal code bulk-data with stable canonical URLs.** OpenLaws.us is the only one that claims to, and it's paid.

---

## Aggregated coverage

After this hunt, total states with a bulk-data path:
- **Original survey:** ~18 (UniCourt 9 + DC + 8 bespoke per memory)
- **After hunt:** **all 50 + DC + PR + GU + VI** have at least Pile of Law as a coverage floor; **22+ states** have authoritative or semi-authoritative bulk paths (UniCourt 14 + IA 7-overlap + DC + CO official + WA WSL + VA decoded + a few others).

**States STILL needing bespoke scraping for authoritative source URLs (criminal code = primary):**
- IL (ILCS Chapter 720) — official ilga.gov, no bulk feed
- IN (Indiana Code Title 35) — iga.in.gov
- MD (Criminal Law Article) — mgaleg.maryland.gov
- MI (Penal Code Chapter 750) — legislature.mi.gov
- MN (Statutes Chapter 609) — revisor.mn.gov
- NJ (Title 2C) — njleg.state.nj.us
- OK (Title 21) — oksenate.gov / oklegislature.gov
- PA (Title 18) — pacodeandbulletin.gov
- SC (Title 16) — scstatehouse.gov
- WI (Chapter 939–948) — docs.legis.wisconsin.gov
- AL, AZ, FL (Phase 1 done), HI, KS, LA, ME, MO, MT, NE, NH, NM, NY (some XML available), OH (Phase 2 done), SD, TX (some XML), UT, WV — **mostly direct-from-state-codifier work**

For these: **Pile of Law `state_codes` is the fastest coverage backstop** (republisher tier), with the official state-leg URL still required as the source URL stored alongside per `no-hallucinated-legal-data.md`. Use Pile of Law to MAP the section structure, then fetch the official URL once per section to populate `source_urls[]`.

---

## Recommendation

**Top 3 sources by coverage breadth (free / public-domain):**

1. **Pile of Law `state_codes` subset (Hugging Face)** — covers all 54 jurisdictions in one ~705 MB compressed JSONL. License = CC-BY-NC-SA (NC blocks redistributing the dataset itself, but the underlying public-domain text we re-derive from per-row Justia URLs is unencumbered). Best as a coverage map + section-structure scaffold.
2. **Internet Archive `gov.{XX}.code` Public.Resource collection** — public-domain RTF/ODT for ~10 states with quarterly updates. **Authoritative tier**, citable IA permalinks. Better for strict UPL compliance than Justia-republisher path.
3. **UniCourt cic-code-XX (14 states)** — public-domain HTML, stale (2022-2023) but structured. Layer on top of IA RTF for human-readable display when needed.

**Fourth honorable mention:** DCCouncil/law-xml — DC only but FRESHEST in the entire ecosystem (April 2026 release), native XML.

**Strategic call:** No single new aggregator covers 30+ states with authoritative URLs. The next-best move is **two-tier ingestion**:
- **Tier A (authoritative):** for the ~15 states that have official bulk feeds (CO SGML, WA SOAP, DC XML, IA RTF for 7-10 states, VA-decoded JSON), ingest from official source. URLs stored = official codifier URLs.
- **Tier B (republisher floor):** for the ~35 remaining states, use Pile of Law to bootstrap section-structure, then fetch the official state-leg page once per section to populate `source_urls[]`. This is the same pattern Phase 2 already used for FL/OH/VA.

**Do NOT pursue:**
- OpenLaws.us — paid, violates Bootstrap Mode rule.
- Public.Law sister sites — only 2 states, redundant with Justia.
- statedb / openstates / LegiScan — wrong data class (legacy / bills, not codified statutes).
- CorUSSS — Justia-derived subset of what Pile of Law already gives us, gated behind academic paywall.

**Cascade check:** Pile-of-Law-as-floor + per-state authoritative-URL-fetch = $0 budget, all 50 states covered, every row gets a real source URL stored. Legal defendants get verified-source statute references; researchers/civic-tech projects we cite (Pile of Law authors, UniCourt CIC, Public.Resource) get attribution; Justia/state codifiers get traffic + indirect link-equity. No node loses.

---

## Wave 1B Phase 3 — Ingest Results (2026-05-01)

Script: `C:\Users\email\projects\ImNotAnAttorney\apps\web\scripts\ingest\ingest-bulk-states.mjs`

| State | Source | Accessible | Rows ingested | Audit |
|-------|--------|-----------|--------------|-------|
| DC | DCCouncil/law-xml (Title 22, local clone, 582 XML files) | YES | 530 | CLEAN |
| CA | leginfo.legislature.ca.gov JSF per-section (PEN ~200 probed) | YES | 159 | CLEAN |
| NY | legislation.nysenate.gov/api/3/laws (401 auth gate, no public key) | NO — SKIP | — | — |
| TX | statutes.capitol.texas.gov (Angular SPA, all URLs return 250KB shell) | NO — SKIP | — | — |

**Wave 1B Phase 3 new rows:** 689 (DC 530 + CA 159)

## Wave 1B Phase 4 — NY + TX Alternate Path Investigation (2026-04-30)

**TX URL accessibility check (all paths exhausted):**

| TX URL tested | Result |
|---|---|
| `download.statutes.legis.state.tx.us/Penal Code/htm/PE.toc.htm` (instruction alt path) | DNS FAIL — subdomain does not resolve |
| `statutes.capitol.texas.gov/Docs/PE/htm/PE.1.htm` | 200 but Angular SPA — 250,881 bytes identical shell |
| `statutes.capitol.texas.gov/Docs/PE/htm/PE.19.htm` | 200 but Angular SPA — 250,881 bytes identical shell |
| `statutes.capitol.texas.gov/docs/pe/pdf/pe.19.pdf` | 200 but `Content-Type: text/html` + Angular SPA shell |
| `law.justia.com/codes/texas/penal-code/title-5/chapter-19/` | Cloudflare challenge (requires JS execution) |
| `archive.org/metadata/gov.tx.code` | `{}` — no Public.Resource.Org TX bulk item exists |
| `laws.lrl.texas.gov` | DNS FAIL |
| `codes.findlaw.com/tx/penal-code/...` | 403 Forbidden |

**TX verdict:** NO viable server-rendered path exists. Every URL at `statutes.capitol.texas.gov` returns the same 250,881-byte Angular SPA shell regardless of path or file extension. The `download.statutes.legis.state.tx.us` subdomain referenced in the task instruction does not resolve. No Public.Resource.Org TX bulk drop exists on archive.org. Justia and FindLaw are Cloudflare/403-gated. TX requires a headless browser — blocked per task instruction ("If TX bulk download is also broken, STOP and report — don't fall back to scraping the SPA again").

**NY URL accessibility check:**

| NY URL tested | Result |
|---|---|
| `www.nysenate.gov/legislation/laws/PEN/120.00` | Cloudflare challenge — requires JS execution |
| `legislation.nysenate.gov/api/3/laws/PEN?full=true` | HTTP 401 — API key required |
| `legislation.nysenate.gov/api/3/laws/PEN/120.00` | HTTP 401 — API key required |
| `.env.local` check for `NY_SENATE_API_KEY` | Not present |

**NY verdict:** The Open Legislation API is public and free, but requires a key obtained via form submission at `nysenate.gov/openleg-developer/key/issue`. No key is present in the project environment. The HTML path (`www.nysenate.gov`) is Cloudflare-challenged. **Path forward: register a free API key, add `NY_SENATE_API_KEY` to `.env.local`, then implement `ingestNy` using the full-tree JSON endpoint `legislation.nysenate.gov/api/3/laws/PEN?full=true&key=KEY`.** The JSON response contains all Penal Law sections in one call — cleanest API shape of any state.

**New rows from Phase 4:** 0 (both states blocked)

**Total entities_statutes:** 15,483 rows across 19 jurisdictions (unchanged from Phase 3)

**Total entities_statutes after Phase 3:**

| Jurisdiction | Rows |
|---|---|
| AK | 361 |
| AR | 1,072 |
| CA | 159 |
| CO | 678 |
| DC | 530 |
| FL | 470 |
| GA | 631 |
| ID | 911 |
| KY | 441 |
| MS | 754 |
| NC | 3,342 |
| ND | 288 |
| OH | 433 |
| TN | 730 |
| US | 2,277 |
| VA | 595 |
| VT | 925 |
| WA | 606 |
| WY | 280 |
| **Total** | **15,483** |

**Distinct jurisdictions:** 19

---

## Sources cited

- [Pile of Law dataset (Hugging Face)](https://huggingface.co/datasets/pile-of-law/pile-of-law)
- [PileOfLaw GitHub — dataset_creation/state_codes](https://github.com/Breakend/PileOfLaw/tree/main/dataset_creation/state_codes)
- [UniCourt cic-beautify-state-codes README](https://github.com/UniCourt/cic-beautify-state-codes/blob/master/Readme.md)
- [UniCourt cic-code repos](https://github.com/orgs/UniCourt/repositories?type=all&q=cic-code)
- [Internet Archive — Vermont Statutes (gov.vt.code)](https://archive.org/details/gov.vt.code)
- [Internet Archive — North Carolina General Statutes (gov.nc.code)](https://archive.org/details/gov.nc.code)
- [Internet Archive — Kentucky Revised Statutes (gov.ky.code)](https://archive.org/details/gov.ky.code)
- [Internet Archive — Code of Virginia (gov.va.code)](https://archive.org/details/gov.va.code)
- [Internet Archive — Tennessee Code Annotated (gov.tn.tca)](https://archive.org/details/gov.tn.tca)
- [Internet Archive — North Dakota Code (gov.nd.code)](https://archive.org/details/gov.nd.code)
- [Internet Archive — Georgia OCGA (gov.ga.ocga.2018)](https://archive.org/details/gov.ga.ocga.2018)
- [Law.Resource.Org — /pub/us/code/](https://law.resource.org/pub/us/code/)
- [DCCouncil/law-xml](https://github.com/DCCouncil/law-xml)
- [Virginia Decoded — vacode.org/downloads/](https://vacode.org/downloads/)
- [Colorado Revised Statutes Data — leg.colorado.gov](https://content.leg.colorado.gov/agencies/office-legislative-legal-services/colorado-revised-statutes-data)
- [Washington WSL Web Services](https://wslwebservices.leg.wa.gov/)
- [Public.Law main](https://www.public.law/)
- [public-law/datasets](https://github.com/public-law/datasets)
- [OpenLaws.us](https://openlaws.us/)
- [Open Law Library (openlawlib.org)](https://openlawlib.org/)
- [openlegaldata/awesome-legal-data](https://github.com/openlegaldata/awesome-legal-data)
- [State Decoded](https://statedecoded.com/)
- [CorUSSS — SSRN paper](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=4232252)
- [davidawad/statedb](https://github.com/davidawad/statedb)
- [Cornell LII state collection](https://www.law.cornell.edu/states)
- [Justia codes index](https://law.justia.com/codes/states.html)
