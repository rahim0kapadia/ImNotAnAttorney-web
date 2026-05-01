# Handoff — Statute Phase 3: 7 → 25 jurisdictions in one session

Date: 2026-04-30 → 2026-05-01 (overnight)
Prior handoffs:
- `docs/handoffs/2026-04-30-statute-phase2-pristine.md`
- `docs/handoffs/2026-04-30-statute-phase2-production-seeds-handoff.md`

## What shipped

Started session at 7 jurisdictions (FL/VA/OH-limited/USC + Phase 2 NC/WA/OH-extended in flight). Ended at **25 jurisdictions live** in `entities_statutes`. Net +18 states added in one session via parallel Sonnet/Haiku sub-agent dispatch.

## Wave-by-wave breakdown

### Phase 2 production seeds (NC + WA + OH-extended)
- NC: 3,342 rows
- WA: 606 rows
- OH: 433 rows (extended from 247)
- Source: bespoke per-state-class scrapers (PR #27, #29 merged)

### Wave 1A — UniCourt cic-code repos
- 11 new states from cleaned HTML in `github.com/UniCourt/cic-code-{state}` repos
- States: AK, AR, CO, GA, ID, KY, MS, ND, TN, VT, WY
- Total: 7,071 rows
- All 11 audit-clean
- Per-state row counts in DB:
  - AR: 1,072
  - VT: 925
  - ID: 911
  - MS: 754
  - TN: 730
  - CO: 678
  - GA: 631
  - WY: 615
  - KY: 441
  - AK: 361
  - ND: 288

### Wave 1B — Authoritative bulk feeds
- DC: 530 rows (DCCouncil/law-xml github repo)
- CA: 159 rows (leginfo.legislature.ca.gov machine-readable)

### Wave 2 — Bucket B generic config-driven
- MN: 1,130 rows
- NE: 584 rows
- MO: 574 rows
- WV: 540 rows
- SC: 515 rows
- SD: 241 rows

### AZ — Engine local node ingest (in flight)
- 236 sections discovered via Fly+local
- Local Node ingest running detached at PID (laptop overnight)
- ETA: ~4-8h wall

## Live DB totals

- 25 jurisdictions
- ~19,402 rows
- ~49% of US jurisdictions covered (25 of 51 = 50 states + DC)
- All jurisdictions audit-clean (HTTPS source URLs, valid SHA256 hashes, section_text ≥50 chars)

## Architecture decisions made this session

1. **Per-state-class pattern → generic config-driven ingest module.** First 5 states wrote bespoke parsers (~250 lines each); shipped `lib/generic-statute-ingest.mjs` mid-session that takes a config tuple per state. New states added via 50-line config files instead of full ports.
2. **Bulk-data-first principle.** UniCourt cic-code + DC XML + CA leginfo + Public.Resource all delivered cleaned/structured data. Discovered after burning 60 min on Fly SSH bug — feedback memory written: `feedback-question-infra-need-before-debugging-infra.md`.
3. **AZ engine vs local Node.** Plan T2 specced engine-worker for 50h crawl. Reality: discovery is 25 min, ingest is ~4-8h — fits laptop session. Engine still right call for sustained refresh, not for first-time pull.
4. **Pile of Law / Multi_Legal_Pile killed.** Both fail on (a) license, (b) source URL non-authoritativeness, (c) one-row-per-entire-state granularity. Hugging Face datasets not usable for INAA.
5. **NY API key gate.** Identified as the only fast-unblock path for NY. Self-serve registration form, no captcha, instant key issuance.

## Refresh crons live

3 cron-job.org jobs registered for Phase 2 states (PR #29):
- NC Mon 17:00 UTC, jobId 7546206
- WA Wed 17:00 UTC, jobId 7546211
- OH Thu 17:00 UTC, jobId 7546207

22 newly-added jurisdictions DO NOT YET have weekly refresh crons. Phase 3 follow-up worry: register cron-job.org jobs for AK/AR/CO/GA/ID/KY/MS/ND/TN/VT/WY (UniCourt) + DC + CA + MN/NE/MO/WV/SC/SD (Bucket B) + AZ (engine, deferred to its own cadence).

## What's left for full 50-state coverage

26 jurisdictions remaining: AL, CT, HI, IA, IL, IN, KS, LA, MA, MD, ME, MI, MT, NH, NJ, NM, NV, NY, OK, OR, PA, RI, TX, UT, WI + maybe-deferred AZ if it doesn't finish overnight.

Of those, **Wave 3 currently in flight** targets 12 Bucket B states: CT, HI, IA, KS, LA, MA, MT, NV, NH, RI, UT, WI. Estimated +12 states / +5,000-8,000 rows.

After Wave 3 lands: 37 jurisdictions live. Remaining 14 states (AL, IL, IN, MD, MI, NJ, NM, OK, OR, PA, ME, NY, TX, AZ) = Phase 4 worry. Most are Bucket C "hostile" sources requiring bespoke handling.

## Files committed (PRs)

- PR #27 monorepo — Phase 2 NC/WA/OH ingest
- PR #29 monorepo — T5 refresh routes (NC/WA/OH)
- PR #225 -web — Phase 2 plan + coverage docs
- PR #9 engine — AZ ingest worker
- (Engine deps fix PR — pg/pg-copy-streams/zod added)

## Files NOT yet committed (in-DB but not in git)

The UniCourt + Wave 1B + Wave 2 ingest .mjs files were written by sub-agents in worktrees that got cleaned up after rate-limit drops. **Rows are in DB but ingest scripts are not in master.** Phase 3 closeout requires:
1. Reconstruct the missing .mjs scripts (mostly mechanical port from PR #27 templates)
2. Commit + PR
3. Test refresh-cadence scenario for the new ingest scripts

This is recoverable — DB state is the truth, scripts can be re-written.

## Recommended next session

1. Reconstruct missing ingest scripts (UniCourt-states, Wave 1B, Wave 2) → PR
2. Wait for Wave 3 to land → confirm DB row counts + audit
3. Get NY API key → ingest NY Penal Law
4. AZ ingest verify (overnight job should complete by then)
5. Phase 4 worry: remaining hostile states (AL/IL/IN/MD/MI/NJ/NM/OK/OR/PA/ME/TX)
6. Refresh-cron registration for 22 new states (after scripts in git)

## Status

Phase 3 substantively shipped. 25/51 = 49% of US jurisdictions LIVE serving real statute citations. From 7 → 25 in one overnight session.
