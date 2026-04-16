# Scripts, scripts/

> 40+ utility scripts: cron setup, tier validation, report backup, legal research, charge taxonomy generation, enrichment pipelines, E2E tests, QA purchase flow, social scheduling.

## Script Inventory

### Infrastructure & Setup
| File | Purpose |
|------|---------|
| `setup-cronjob-org.js` | Registers cron-job.org jobs for Vercel routes (drip, batch-poller, reconcile). Saves IDs to `cronjob-org-ids.json` |
| `setup-blog-pipeline-crons.js` | Registers cron-job.org jobs for blog pipeline (generation, QA, publish, demand). Saves IDs to `blog-pipeline-cron-ids.json` |
| `setup-storage-and-seed.mjs` | Creates `charge-packs` storage bucket, uploads all 8 playbook PDFs, upserts `charge_packs` rows. Options: `, skip-upload`, `, skip-seed`, `, dry-run` |
| `apply-pending-sql.mjs` | Ad-hoc SQL applier via Supabase Management API. Takes filepath arg. Used for quick DB fixes outside migration flow |
| `apply-enrichment-batches.mjs` | Applies enrichment UPDATE statements in batches of 100 (avoids Management API 413 payload limit) |

### Validation & Linting
| File | Purpose |
|------|---------|
| `check-tiers.mjs` | Verifies tier names/prices in `src/lib/tiers.ts` match across docs (CLAUDE.md, PRD, SERVICES). Catches pricing drift |

### Report Generation
| File | Purpose |
|------|---------|
| `generate-worker.mjs` | Backup Case Decoder generator. Picks up cases stuck in `generating` > 3 min (Edge Function timeout). Calls Opus 4.6, renders HTML, evaluates UPL, emails operator |

### Legal Research Pipeline
| File | Purpose |
|------|---------|
| `load-jurisdiction-data.mjs` | Loads jurisdiction statute JSONs from `data/charge-taxonomy/` into Supabase `jurisdiction_statutes` table. Single state or all states |
| `legal-research-fl.mjs` | FL statute verification: validates on FL Online Sunshine, searches CourtListener for citing case law, updates `source_urls` + `confidence_score`. Rate-limited 2s/request |
| `legal-research-all.mjs` | All-state statute verification: FL via Online Sunshine, federal via Cornell LII, other states via Justia URL + CourtListener case law. Rate-limited 1.5s/request. Supports single jurisdiction, single statute, dry-run, summary modes |
| `classify-case-law.mjs` | Case law classifier: fetches CourtListener opinions, extracts outcome, classifies DEFENSE/PROSECUTION/NEUTRAL, determines binding authority. Rate-limited 750ms/request |
| `generate-case-law-enrichment.ts` | Enrichment generator: creates missing-state jurisdiction data (ID, SC) and prosecution/defense strategic analysis. NEVER generates case law (see `no-hallucinated-legal-data`). Commands: `, missing-states`, `, enrich,all`, `, full,all`, `, build-migration`, `, validate`, `, stats`, `, dry-run` |
| `scrub-enrichment-citations.mjs` | Safety scrubber: DELETES enrichment items containing case citations (`X v. Y`), inline pinpoint statute section refs, or `[verify with attorney]` placeholders. Leaves general legal concepts intact |
| `generate-charge-enrichment-de-hi-id-md-sc.mjs` | Scrub-safe enrichment JSON generator for DE/HI/ID/MD/SC, pre-filters known banned patterns (case names, `§` refs, state code prefixes, article cites) before writing |
| `validate-enrichment-de-hi-id-md-sc.mjs` | Validator for DE/HI/ID/MD/SC enrichment files, every source slug has an entry, 3-5 items per array, no scrub-triggering content |
| `run-full-pipeline.mjs` | Full charge taxonomy + case law pipeline runner (outside Claude Code). Steps: load jurisdiction data → verify statutes → classify cases. ZERO Claude tokens. Flags: `, skip-load`, `, skip-verify`, `, classify-limit N`. ~6-12 hours end-to-end |
| `pipeline-status.mjs` | Read-only progress monitor for the verification pipeline. `, watch` refreshes every 30s |
| `fix-orphan-slugs.mjs` | One-time remapper: remaps non-standard charge slugs to canonical COMMON_CHARGES slugs across all jurisdiction JSONs. Delete after use |
| `add-reference-urls.mjs` | Appends cross-reference URLs (Justia, Google Scholar, CourtListener search) to `statute_case_law.source_urls[]` from citation patterns. Does not fetch, stores for manual verification. `, limit`, `, dry-run` |
| `verify-statutes-openstates.mjs` | Verifies unverified statutes against OpenStates API (all 50 states). Appends OpenStates URL to `source_urls[]` and bumps `confidence_score`. Free tier 500 req/day. `, limit`, `, jurisdiction`, `, dry-run` |
| `verify-via-cap.mjs` | Verifies case law against Harvard CAP static archive (6.7M cases, 1658–2018). Appends CAP URL to `source_urls[]`; deletes unverifiable rows with no CourtListener cluster. `, limit`, `, dry-run` |
| `verify-via-cornell-scotus.mjs` | Verifies SCOTUS cases via Cornell LII HEAD checks. Appends URL to `source_urls[]`; deletes unverifiable rows. Rate-limited 1s/request. `, limit`, `, dry-run` |
| `verify-via-courtlistener-citation.mjs` | Verifies case law via CourtListener `/citation-lookup/` POST endpoint. Stores `cluster_id` + URL; deletes unverifiable rows. Rate-limited 1.5s/request. `, limit`, `, dry-run` |
| `bulk-dump-cases.mjs` | Exports all `statute_case_law` rows to local JSON via single Supabase Management API query. Writes to `data/bulk-verify/`. `, output` |
| `bulk-download-cap.mjs` | Downloads needed CAP CasesMetadata.json volumes from `static.case.law` to `.cap-cache/`. Parses citations from dump JSON, deduplicates. `, dry-run`, `, concurrency N` |
| `bulk-verify-cases.mjs` | Matches citations against local CAP cache, generates + batch-applies SQL updates. Marks unverifiable as `NOT_IN_DB` (safer than delete for bulk). Zero API calls during verify. `, dry-run` |

#### Citation Verification, Offline vs Runtime

The web pipeline does **NOT** verify citations at runtime. All citation verification happens **offline** through the scripts above before anything ships to a customer:

1. `legal-research-all.mjs` searches CourtListener for real cases citing each statute and populates `statute_case_law` with verified rows (`case_name`, `citation`, `court`, `year`, `holding`, `courtlistener_cluster_id`, `source_urls`).
2. `classify-case-law.mjs` fetches actual opinion text from CourtListener, classifies each case as DEFENSE / PROSECUTION / NEUTRAL, then runs `checkNegativeTreatment()` against the CourtListener citing-opinions endpoint to set `is_good_law`, cases that have been overruled or negatively treated are flagged.

The `generate-report` Edge Function only **filters** on `statute_case_law.is_good_law=eq.true`, it does not verify Claude-generated citations against any live source. If a case is not in the table with `is_good_law=true`, it never appears in a report.

The full multi-source verification cascade (Harvard CAP, GovInfo, eCFR, Cornell LII statutes) lives in the engine repo at `ImNotAnAttorney-engine/integrations/legal-verifier.mjs`, not in this web repo. Web only consumes the already-verified rows.

**Why this split matters:** Per the project's `no-hallucinated-legal-data` rule, any case citation that ships to a defendant must have a stored `source_urls[]` pointing at the opinion we actually read. The offline scripts enforce that invariant at write time; runtime reads can trust the flag.

### Charge Taxonomy
| File | Purpose |
|------|---------|
| `generate-charge-taxonomy.ts` | Claude API calls for all 52 jurisdictions. Commands: `, all`, `, jurisdiction FL`, `, questions`, `, validate`, `, dry-run` |
| `build-seed-migration.ts` | Builds migration 029 SQL from COMMON_CHARGES + questions.json + jurisdiction JSONs |

### E2E Testing
| File | Purpose |
|------|---------|
| `qa-e2e-test.mjs` | **Main E2E purchase runner.** Playwright-driven full flow: `/api/qa-checkout` ($0) → Stripe checkout → success page → download both PDFs → verify delivery email. Usage: `node scripts/qa-e2e-test.mjs [tier\|all]` (default `dui-first-offense`) |
| `e2e-playbook-visual.mjs` | Read-only Playwright visual validation of playbook sales + checkout + services pages. No Stripe/DB writes, safe against prod. `, base-url` flag supported |
| `test-ib-pipeline.ts` | Intelligence Brief E2E: render, validate, push (create order+case), update section, cleanup |
| `test-batch-generation.mjs` | Case Decoder batch flow: Batch API submit → poll → render |
| `e2e-all-pipelines.mjs` | Full E2E: Case Decoder + Intelligence Brief + Playbook flows. Creates test data, verifies transitions, cleans up |
| `test-e2e-dashboard.mjs` | Operator dashboard + customer portal API tests. Creates test orders/cases/jobs, verifies response structure |
| `test-inclusion-flow.mjs` | Tier inclusion logic (parent_order_id, is_included_deliverable) |
| `verify-download-flow.mjs` | Download token flow for all 8 playbooks. Options: `, skip-cleanup`, `, skip-api` |

### Content & Marketing
| File | Purpose |
|------|---------|
| `geo-prompt-test.mjs` | GEO baseline test (Evan Bailyn method). Logs 10 prompts for manual testing across ChatGPT, Perplexity, Google AI |
| `schedule-tweets.mjs` | Schedules pending tweets via Postiz API, 2/day at 9 AM and 6 PM EST, reads `content/queue/twitter/pending` |
| `schedule-social.mjs` | Multi-platform Postiz scheduler (twitter, facebook, or `, all`). Skips image/video platforms. `, dry-run` supported |
| `schedule-social-slow.mjs` | Hourly-friendly single-post scheduler (one post per run) to stay under Postiz 30 req/hr limit. Designed for Task Scheduler |

### Asset Rendering
| File | Purpose |
|------|---------|
| `render-gbp-cover.js` | GBP cover image → 1024x576 PNG via Puppeteer |
| `render-gbp-photos.js` | GBP photo assets → PNG via Puppeteer |
| `render-gbp-profile.js` | GBP profile section → PNG via Puppeteer |
| `redact-discovery.py` | Redacts PII from real PCSO discovery PDFs and exports pages as 2x retina PNGs for the website. Uses PyMuPDF. Output: `public/discovery/` |

### Migration Helpers
| File | Purpose |
|------|---------|
| `migrate-009-tier-inclusion.mjs` | Adds is_included_deliverable, parent_order_id, court columns to cases. Runs via Management API |

## Key Constants

| Constant | Value | File:Line |
|----------|-------|---------, |
| Supabase project ref | `jxjbjmgdukwkoclydqdr` | `load-jurisdiction-data.mjs:17`, `apply-pending-sql.mjs:12`, `classify-case-law.mjs:32` |
| CourtListener fetch delay | 750ms | `classify-case-law.mjs:33` |
| FL statute fetch delay | 2000ms | `legal-research-fl.mjs:32` |
| All-state fetch delay | 1500ms | `legal-research-all.mjs:32` |
| Generate-worker max retries | 3 (on 529 overloaded) | `generate-worker.mjs` |
| GBP render dimensions | 1024x576 (2x DPI) | `render-gbp-cover.js:15` |
| Parent env file | `../ImNotAnAttorney/.env.local` | `load-jurisdiction-data.mjs:20`, `legal-research-fl.mjs:36` |

## Data Flow

```
Charge Taxonomy Pipeline:
  COMMON_CHARGES (static) → Claude API (52 jurisdiction calls)
  → data/charge-taxonomy/{AL,AK,...}.json (local files)
  → build-seed-migration.ts → migration 029 SQL → DB populated

Legal Research Pipeline:
  jurisdiction_statutes (DB) → FL Online Sunshine (verify statute)
  → CourtListener API (fetch citing cases)
  → UPDATE jurisdiction_statutes (source_urls, confidence_score)
  → classify-case-law.mjs → UPDATE statute_case_law (classification, holding)

All-State Legal Research Pipeline:
  jurisdiction_statutes (DB) → FL Online Sunshine (FL only)
  → Cornell LII (federal only) → Justia URL reference (other states)
  → CourtListener API (case law search, boosts confidence)
  → UPDATE jurisdiction_statutes (source_urls, confidence_score, verified_at)

Report Backup Pipeline:
  SELECT cases WHERE status='generating' AND updated_at < now() - 3min
  → Claude Opus API → UPDATE cases (report_html, status)
  → Resend API (operator email) → POST /api/evaluate (UPL gate)

Cron Setup:
  setup-cronjob-org.js → PUT cron-job.org API → cronjob-org-ids.json
```

## Integration Points

**Reads from:**
- `.env.local`, ANTHROPIC_API_KEY, SUPABASE_SERVICE_ROLE_KEY, CRONJOB_API_KEY, CRON_AUTH_TOKEN, RESEND_API_KEY, COURTLISTENER_TOKEN
- `../ImNotAnAttorney/.env.local`, SUPABASE_ACCESS_TOKEN (Management API token, NOT service role key)
- `src/lib/tiers.ts`, check-tiers.mjs lints against this
- `data/charge-taxonomy/*.json`, load-jurisdiction-data.mjs reads these
- Supabase tables (test scripts read/write orders, cases, partners, etc.)
- CourtListener API, FL Online Sunshine (legal research scripts)

**Writes to:**
- Supabase tables via Management API (load-jurisdiction-data → jurisdiction_statutes)
- Supabase tables via PostgREST (classify-case-law → statute_case_law)
- Local files: `data/charge-taxonomy/*.json` (generate-charge-taxonomy.ts)
- Migration SQL: `supabase/migrations/029*.sql` (build-seed-migration.ts)
- cron-job.org API (setup scripts register jobs)
- Local files: `cronjob-org-ids.json`, `blog-pipeline-cron-ids.json`

## Gotchas

1. **SUPABASE_ACCESS_TOKEN vs SUPABASE_SERVICE_ROLE_KEY.** Scripts that use Management API need the Access Token (personal, from parent repo `.env.local`). Scripts that use PostgREST need the Service Role Key (from this project's `.env.local`). Never confuse them.

2. **Legal research scripts read from parent repo.** `legal-research-fl.mjs` and `classify-case-law.mjs` read `../ImNotAnAttorney/.env.local`. Fails silently if parent repo not checked out.

3. **Rate limiting is intentional.** FL Online Sunshine: 2s between fetches. CourtListener: 750ms. These are respectful scraping policies. Speed up only with permission from the source.

4. **Script ordering for charge taxonomy:** `generate-charge-taxonomy.ts` MUST complete before `build-seed-migration.ts` (reads generated questions.json). Migration 029 MUST run before web code expects charge data.

5. **Test scripts create real DB records.** If a test script crashes, test data persists. Cleanup: delete test orders by email prefix (`test-*`) or use `, skip-cleanup` on next run.

6. **TypeScript scripts require `tsx`.** Run with `npx tsx scripts/your-script.ts`, not `ts-node`.

7. **GBP render scripts hardcode Puppeteer path** to `C:/Users/email/projects/KDP-Publishing/node_modules/puppeteer`. Windows-specific and fragile.

## How To

- **Add a new script:** Create `scripts/your-script.mjs` (ESM). Parse env vars at top (copy from generate-worker.mjs). If scheduled, add to setup-cronjob-org.js.
- **Debug a failing script:** Run with `, dry-run` if supported. Check `.env.local` for required keys. Verify Supabase project ref matches (`jxjbjmgdukwkoclydqdr`).
- **Run legal research:** `node scripts/legal-research-fl.mjs` (FL statutes) → `node scripts/classify-case-law.mjs,limit 50` (classify 50 cases). Check COURTLISTENER_TOKEN is set.

## Maintenance Triggers

- **New cron route added** → Register in `setup-cronjob-org.js` or `setup-blog-pipeline-crons.js`
- **Tier pricing changed** → Run `node scripts/check-tiers.mjs` to catch drift
- **New jurisdiction added** → Run `npx tsx scripts/generate-charge-taxonomy.ts,jurisdiction XX`
- **Reports stuck in generating** → Run `node scripts/generate-worker.mjs` manually
- **Supabase project ref changed** → Update in all 3 scripts that hardcode it
