# Scripts — scripts/

> 24 utility scripts: cron setup, tier validation, report backup, legal research, charge taxonomy generation, E2E tests, GBP asset rendering.

## Script Inventory

### Infrastructure & Setup
| File | Purpose |
|------|---------|
| `setup-cronjob-org.js` | Registers cron-job.org jobs for Vercel routes (drip, batch-poller, reconcile). Saves IDs to `cronjob-org-ids.json` |
| `setup-blog-pipeline-crons.js` | Registers cron-job.org jobs for blog pipeline (generation, QA, publish, demand). Saves IDs to `blog-pipeline-cron-ids.json` |
| `apply-pending-sql.mjs` | Ad-hoc SQL applier via Supabase Management API. Takes filepath arg. Used for quick DB fixes outside migration flow |

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
| `classify-case-law.mjs` | Case law classifier: fetches CourtListener opinions, extracts outcome, classifies DEFENSE/PROSECUTION/NEUTRAL, determines binding authority. Rate-limited 750ms/request |

### Charge Taxonomy
| File | Purpose |
|------|---------|
| `generate-charge-taxonomy.ts` | Claude API calls for all 52 jurisdictions. Commands: `--all`, `--jurisdiction FL`, `--questions`, `--validate`, `--dry-run` |
| `build-seed-migration.ts` | Builds migration 029 SQL from COMMON_CHARGES + questions.json + jurisdiction JSONs |

### E2E Testing
| File | Purpose |
|------|---------|
| `test-ib-pipeline.ts` | Intelligence Brief E2E: render, validate, push (create order+case), update section, cleanup |
| `test-batch-generation.mjs` | Case Decoder batch flow: Batch API submit → poll → render |
| `e2e-all-pipelines.mjs` | Full E2E: Case Decoder + Intelligence Brief + Playbook flows. Creates test data, verifies transitions, cleans up |
| `test-e2e-dashboard.mjs` | Operator dashboard + customer portal API tests. Creates test orders/cases/jobs, verifies response structure |
| `test-inclusion-flow.mjs` | Tier inclusion logic (parent_order_id, is_included_deliverable) |
| `verify-download-flow.mjs` | Download token flow for all 8 playbooks. Options: `--skip-cleanup`, `--skip-api` |

### Content & Marketing
| File | Purpose |
|------|---------|
| `geo-prompt-test.mjs` | GEO baseline test (Evan Bailyn method). Logs 10 prompts for manual testing across ChatGPT, Perplexity, Google AI |
| `demand-feed-query.mjs` | Reddit/Google Trends demand signal queries |

### Asset Rendering
| File | Purpose |
|------|---------|
| `render-gbp-cover.js` | GBP cover image → 1024x576 PNG via Puppeteer |
| `render-gbp-photos.js` | GBP photo assets → PNG via Puppeteer |
| `render-gbp-profile.js` | GBP profile section → PNG via Puppeteer |

### Migration Helpers
| File | Purpose |
|------|---------|
| `migrate-009-tier-inclusion.mjs` | Adds is_included_deliverable, parent_order_id, court columns to cases. Runs via Management API |

## Key Constants

| Constant | Value | File:Line |
|----------|-------|-----------|
| Supabase project ref | `jxjbjmgdukwkoclydqdr` | `load-jurisdiction-data.mjs:17`, `apply-pending-sql.mjs:12`, `classify-case-law.mjs:32` |
| CourtListener fetch delay | 750ms | `classify-case-law.mjs:33` |
| FL statute fetch delay | 2000ms | `legal-research-fl.mjs:32` |
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

Report Backup Pipeline:
  SELECT cases WHERE status='generating' AND updated_at < now() - 3min
  → Claude Opus API → UPDATE cases (report_html, status)
  → Resend API (operator email) → POST /api/evaluate (UPL gate)

Cron Setup:
  setup-cronjob-org.js → PUT cron-job.org API → cronjob-org-ids.json
```

## Integration Points

**Reads from:**
- `.env.local` — ANTHROPIC_API_KEY, SUPABASE_SERVICE_ROLE_KEY, CRONJOB_API_KEY, CRON_AUTH_TOKEN, RESEND_API_KEY, COURTLISTENER_TOKEN
- `../ImNotAnAttorney/.env.local` — SUPABASE_ACCESS_TOKEN (Management API token, NOT service role key)
- `src/lib/tiers.ts` — check-tiers.mjs lints against this
- `data/charge-taxonomy/*.json` — load-jurisdiction-data.mjs reads these
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

5. **Test scripts create real DB records.** If a test script crashes, test data persists. Cleanup: delete test orders by email prefix (`test-*`) or use `--skip-cleanup` on next run.

6. **TypeScript scripts require `tsx`.** Run with `npx tsx scripts/your-script.ts`, not `ts-node`.

7. **GBP render scripts hardcode Puppeteer path** to `C:/Users/email/projects/KDP-Publishing/node_modules/puppeteer`. Windows-specific and fragile.

## How To

- **Add a new script:** Create `scripts/your-script.mjs` (ESM). Parse env vars at top (copy from generate-worker.mjs). If scheduled, add to setup-cronjob-org.js.
- **Debug a failing script:** Run with `--dry-run` if supported. Check `.env.local` for required keys. Verify Supabase project ref matches (`jxjbjmgdukwkoclydqdr`).
- **Run legal research:** `node scripts/legal-research-fl.mjs` (FL statutes) → `node scripts/classify-case-law.mjs --limit 50` (classify 50 cases). Check COURTLISTENER_TOKEN is set.

## Maintenance Triggers

- **New cron route added** → Register in `setup-cronjob-org.js` or `setup-blog-pipeline-crons.js`
- **Tier pricing changed** → Run `node scripts/check-tiers.mjs` to catch drift
- **New jurisdiction added** → Run `npx tsx scripts/generate-charge-taxonomy.ts --jurisdiction XX`
- **Reports stuck in generating** → Run `node scripts/generate-worker.mjs` manually
- **Supabase project ref changed** → Update in all 3 scripts that hardcode it
