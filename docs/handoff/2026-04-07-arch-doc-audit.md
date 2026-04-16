# docs/ARCHITECTURE.md Audit, 2026-04-07

**Purpose:** Classify every section of the 2357-line stale doc before Phase 2 extraction.

**Source of truth:** Root `ARCHITECTURE.md` (188 lines) + 6 CONTEXT.md files
(`src/app/CONTEXT.md`, `src/lib/CONTEXT.md`, `supabase/CONTEXT.md`, `src/components/CONTEXT.md`, `content/CONTEXT.md`, `scripts/CONTEXT.md`)

**Stale doc header note:** The stale doc already flags itself as "DEEPLY STALE, DO NOT TRUST" at the top (lines 1-15). Any value extracted must be verified against current code.

## Summary
- Total sections classified: **40**
- **DUPLICATE:** 18 sections (safe to delete, fully covered by lean docs)
- **STALE:** 9 sections (wrong/outdated, safe to delete, not worth preserving)
- **UNIQUE_VALID:** 11 sections (MUST EXTRACT in Phase 2)
- **UNIQUE_STALE:** 2 sections (flag for Rahim decision)

## Classification table

| Lines | Section title | Classification | Notes | Extract to (Phase 2 target) |
|-------|---------------|----------------|-------|------------------------------|
| 1-15 | Header / STALE warning | N/A | Meta-warning about staleness, already loud. Delete with file. |, |
| 17-83 | System Overview + Three-Project Architecture + Data Flow + Customer Journey | STALE | Counts wrong (28 pages vs 55, 35 routes vs 70, 27 workers vs 41). Customer Journey ASCII overlaps with root ARCHITECTURE.md Data Flow block (which is more concise). |, |
| 85-101 | Tech Stack table | STALE | "Stripe (test mode)" wrong (LIVE since March 2026). "52+ tables across 11 migrations" wrong (50+ tables, 41 migrations). Root ARCHITECTURE.md has current Component Map instead. |, |
| 102-122 | Deployment + Deploy Rules (7 numbered rules) | UNIQUE_VALID (partial) | Vercel project info is STALE (wrong project ID, duplicate unlinked Apr 4). BUT the 7 numbered Deploy Rules (lines 113-121) are unique historical guardrails not in any lean doc. Root has the current project ID gotcha. | Root `ARCHITECTURE.md` Deployment section, append "Deploy Rules" subsection with rules 1, 3, 4, 5 only (rules 2, 6, 7 already covered; rule 2 about `vercel deploy` is in Forbidden; rule 7 `vercel env add` is in Deployment). Recommend extracting: NEVER deploy to `tastedrops-projects`, NEVER run `vercel env pull`, NEVER delete `.vercel/`, NEVER touch domain settings. |
| 123-140 | Environment Variables (web) table | UNIQUE_VALID | This is the full inventory the plan specifically flagged. No env var inventory exists in any lean doc. Verified against `src/` grep: all 13 listed vars are real. BUT `CRON_SECRET` row is STALE, the real var name is `CRON_AUTH_TOKEN` (verified in middleware.ts:80, guards.ts:74). Updated list below. | New file: `docs/env-vars.md` OR root `ARCHITECTURE.md` new section "## Environment Variables". Use corrected list in UNIQUE_VALID section below. |
| 141-204 | Engine Architecture (entire section, deployment, queue, retry, worker registry, pipeline, cost) | STALE | Entire engine section is stale and belongs to the ENGINE repo, not web. Counts wrong (27 workers claimed; actual per MEMORY is 41). Engine has its own docs at `ImNotAnAttorney-engine/OPERATOR-QUICKSTART.md`. Root ARCHITECTURE.md already references engine as an external dependency, deeper detail belongs in the engine repo. |, (do NOT extract to web repo; recommend pointer to engine repo) |
| 206-228 | Pipeline Orchestration ASCII diagram | STALE | Belongs to engine repo. |, |
| 230-247 | Cost Tracking + Dependencies table | STALE | Engine repo concerns. |, |
| 249-267 | Engine Environment Variables table | STALE | Engine repo concerns, `WORKER_AUTH_TOKEN`, `COURTLISTENER_API_TOKEN`, `PACER_LOGIN`, `GOVINFO_API_KEY`, `SERPAPI_API_KEY`, `SYSTEM_ROOT` are NOT used in the web repo (verified: grep in src/ returns zero matches). |, |
| 269-294 | External Legal Data Sources + Citation Verification Cascade | UNIQUE_VALID (partial) | Most of this describes engine-side verification. BUT the "STATUS (2026-04-07)" block at lines 285-294 is a valuable historical note: "web pipeline does NOT verify citations at runtime. Citation verification happens OFFLINE via scripts/legal-research-all.mjs + classify-case-law.mjs. Edge Function only filters via is_good_law=eq.true." Verified: both scripts exist (confirmed in scripts/CONTEXT.md + files exist). No lean doc explains the split between offline and runtime verification. | `scripts/CONTEXT.md` under Legal Research Pipeline, append the clarifying note about offline-vs-runtime. |
| 296-338 | Anti-Hallucination Architecture (seed data, 6 rules, expert attribution, banned terminology) | UNIQUE_VALID | Not in any lean doc at this level of detail. 5 seed data files (motion-library.json, penalty-ranges.json, statute-references.json, diversion-programs.json, speedy-trial-rules.json) live in the `ImNotAnAttorney/` sibling repo. 6 anti-hallucination rules + 16-entry banned terminology table are process/content standards that belong in CLAUDE.md or content-rules, not in web architecture. Victor Knapp incident is already in MEMORY. | Business-docs repo, `ImNotAnAttorney/system/ANTI-HALLUCINATION.md` (likely already exists); OR `.claude/rules/content-rules.md`. The 16-entry banned terminology table is the most valuable unique artifact and should be captured somewhere authoritative if not already in EVALUATION-TEAM.md. |
| 340-372 | Expert Reference System (63+ experts by category + tier loading) | DUPLICATE | Source of truth is `ImNotAnAttorney/system/EXPERT-REFERENCE.md` per MEMORY. This table is a summary snapshot. Do not extract, defer to EXPERT-REFERENCE.md. |, |
| 374-429 | Emotional Intelligence Architecture (8 dimensions, stance calibration, frameworks, 10-stage reading arc, 38-point checklist) | DUPLICATE | Source of truth is `ImNotAnAttorney/system/EMOTIONAL-INTELLIGENCE.md`. |, |
| 431-442 | Buyer States Framework (6 states) | DUPLICATE | Source of truth is `ImNotAnAttorney/system/BUYER-STATES.md`. Stale doc even cites it. |, |
| 443-461 | Content Architecture Standard (11 principles) | DUPLICATE | Source of truth is `ImNotAnAttorney/system/CONTENT-ARCHITECTURE-STANDARD.md`. |, |
| 463-506 | Client Journey (timeline, emotional moments, dashboard features, upgrade credit messaging) | DUPLICATE | Source of truth is `ImNotAnAttorney/system/CLIENT-JOURNEY.md`. Some tier timing numbers may be stale vs tiers.ts. Upgrade credit messaging is covered in root ARCHITECTURE.md Key Decisions + `src/lib/CONTEXT.md` (pricing). |, |
| 508-555 | Architecture Patterns (6 patterns: fire-and-forget, atomic claim, email retry, idempotency, HMAC, score-band routing) | UNIQUE_VALID | Six reusable code patterns are NOT documented in any lean doc. Root ARCHITECTURE.md mentions "Fire-and-forget logging" briefly in Cross-Cutting Concerns but omits the other 5 patterns. `src/app/CONTEXT.md` and `src/lib/CONTEXT.md` describe individual modules, not the cross-cutting patterns. This is the single most valuable UNIQUE_VALID section in the doc. | Root `ARCHITECTURE.md`, new section "## Architecture Patterns" or expand "Cross-Cutting Concerns" to include all 6 patterns. See full content in UNIQUE_VALID section below. |
| 556-604 | Middleware & Security (CSP policy, route protection, rate limiting, security headers) | UNIQUE_VALID (partial) | CSP policy block (lines 562-574) is unique and valuable, no lean doc documents the full CSP directive list. Route protection table and rate limiting are in `src/app/CONTEXT.md` (auth matrix) and `src/lib/CONTEXT.md`, but the STALE doc has endpoint-specific rate limits (checkout 10/300s, score 10/60s, intake 5/300s) that are also in the stale doc's API reference table. Security headers list (lines 599-604) is unique. | `src/app/CONTEXT.md` under middleware section: extract CSP policy block + Security Headers list. Rate limiting endpoint table is already documented. |
| 605-619 | Storage Buckets + Upload Security | DUPLICATE | Covered in `supabase/CONTEXT.md` Storage Buckets section (now lists 3 buckets: discovery-files, charge-packs, standalone-reports). Stale doc only lists 2 (missing standalone-reports). Upload security details (MIME validation, 50MB limit, path sanitization) are in `src/components/CONTEXT.md` (FileUpload) and `src/app/CONTEXT.md`. |, |
| 620-891 | Database Schema, Full column-level table definitions (orders, cases, intakes, subscribers, drip_emails, 12 reference tables, email_log, audit_runs, cron_runs, rate_limits, counters, score_aggregates, docket_entries, charge_packs, discovery_documents, timeline_events, case_analysis_results) | UNIQUE_VALID | This is the biggest UNIQUE_VALID block by volume (~270 lines). `supabase/CONTEXT.md` only names tables and their purpose, it does NOT include column definitions. Verified against current migrations (00001 through 20260408): the schema is largely accurate for the core tables, though the stale doc predates some additions (standalone products, partner portal tables, guarantee_invocations, etc.). Full column lists are EXTREMELY valuable for Claude sessions debugging DB issues. | New file: `supabase/SCHEMA.md` OR append to `supabase/CONTEXT.md` as "## Full Schema Reference". Extract verbatim, then add a note that new tables from migrations 20250101000012 onward (referral-system, partner-portal, feature-flags, customer-portal, batch-id, charge-taxonomy, cron-executions, research-columns, blog-drafts, score-results, acquire-cron-lock-rpc, report-token-hash, guarantee_invocations, standalone_products, calculator_email_rpc, case-law-verification, phase0_feature_flags, enrichment-and-case-law-data) need to be audited separately before being added. |
| 892-972 | More Tables (case_witnesses, case_findings, evidence_items + custody, case_law_references, motion_recommendations, trial_materials, processing_jobs, operator_tasks) | UNIQUE_VALID | Same rationale as rows 620-891, column-level detail not in lean docs. | Same target as above (`supabase/SCHEMA.md`). |
| 973-1091 | Admin/Demand Tables + Engine-Specific Tables + RPCs + Indexes + Triggers | UNIQUE_VALID | Same rationale, column-level detail for demand intelligence, docket, and engine tables. Engine tables section is an authoritative list of which tables the engine owns (document_pages, entity_extractions, finding_sources, evidence_inventory, chain_of_custody_records, case_persons, case_analysis_scores, case_monitoring, job_cost_tracking, legal_citations, jurisdiction_profiles, verified_case_law). The RPC list (7 RPCs) is unique. The Index list (24 indexes) is unique. The Triggers list is unique. | `supabase/SCHEMA.md`, append RPCs, Indexes, Triggers subsections. Engine tables list should be cross-referenced from `supabase/CONTEXT.md` engine-tables subsection. |
| 1140-1203 | Case Status State Machine + Status Definitions table | UNIQUE_VALID (partial) | The plan specifically flagged this. The ASCII diagram (lines 1140-1182) is unique. The Status Definitions table (lines 1184-1203) lists 13 statuses. **Verification against current code (`src/lib/types/operator.ts:270-299`):** The stale doc is INCOMPLETE, actual DiscoveryStatus includes `intelligence`, `strategy`, `packaging`, `monitoring` states that the stale doc does not document. The IB-specific statuses (auto-generating, compiling, researching) match current code. CD statuses match. Discovery path expanded in current code. | `supabase/CONTEXT.md` under "## Case Status State Machine", extract the diagram and definitions, THEN update with 4 new states (intelligence, strategy, packaging, monitoring) from current operator.ts. Do not extract verbatim without updating. |
| 1204-1217 | Operator Status Transitions (ALLOWED_TRANSITIONS) | STALE | The TypeScript block shown (lines 1206-1214) is stale, actual current code in `src/lib/types/operator.ts:280-299` has 4 additional engine pipeline states (intelligence, strategy, packaging, monitoring) not in the stale doc. Delete stale code and reference live file. |, (or extract current version from operator.ts directly) |
| 1218-1251 | Multi-Case Order Model (Tier Inclusion), inclusion map, how-it-works, two-phase intake, customer identity | UNIQUE_VALID | The inclusion map (purchased tier → cases created) is not documented in any lean doc. The 5-step how-it-works list is unique. The two-phase intake flow and customer identity notes (court_case_number matching) are unique. Root ARCHITECTURE.md "Life of a Case" is simpler and doesn't cover included deliverables. | Root `ARCHITECTURE.md`, append to "Life of a Case" or new section "## Tier Inclusion Model". Verify inclusion map against `src/lib/tiers.ts` `includesTiers` before extracting. |
| 1252-1328 | Tier System (playbooks, service tiers, deliverables detail, numbered folders, add-ons, upgrade credit policy) | DUPLICATE | Source of truth is `src/lib/tiers.ts`. Deliverables detail (v4 March 2026) overlaps heavily with MEMORY and `system/DELIVERABLES-BY-TIER.md`. Delivery structure ASCII tree is ops context that already exists in `ImNotAnAttorney` docs. Upgrade credit policy is in Key Decisions in root ARCHITECTURE.md. |, |
| 1329-1449 | API Route Reference + Pages Reference | STALE | "35 API routes" wrong (actual is 70 per root ARCHITECTURE.md). "28 pages" wrong (actual is 55). These tables are duplicated by `src/app/CONTEXT.md` which has accurate, updated route groups and page maps. |, |
| 1450-1516 | Intelligence Brief Pipeline (Phase A, Phase B, judge research, prompts, variables, render, status flow) | UNIQUE_VALID (partial) | The Phase A section table (5 sections with keys + emotion + output) and Phase B section table (4 sections with dependencies + output) ARE in `src/lib/CONTEXT.md` at a summary level but NOT with this level of detail (section keys, emotional target, gap extraction logic). The Case Progress Score sub-section (6 weighted dimensions) is unique. Variables table (65 fields in 9 categories) is unique. Verified keys (case-roadmap, whats-working, legal-options, case-intelligence, 48hr-priorities) exist in prompts.ts. | `src/lib/CONTEXT.md` under "### Intelligence Brief Pipeline", append: Phase A section table with keys/emotions/output, Phase B dependency table, Case Progress Score 6-dimension breakdown, 65-field IBVariables category breakdown. |
| 1517-1535 | X-Ray Discovery Pipeline (upload flow, SLA deadlines, processing pipeline) | UNIQUE_VALID (partial) | SLA Deadlines table (X-Ray 14d, War Room 28d, Situation Room 2d) is unique and valuable. The upload flow 3-step description is covered in src/app/CONTEXT.md (upload routes) but the SLA deadlines specifically are not. | `supabase/CONTEXT.md` or `src/app/CONTEXT.md`, extract SLA Deadlines table. Verify values against `src/lib/tiers.ts` before extracting. |
| 1537-1566 | Full Pipeline Map (16 Stages) + Stage Coverage by Tier | DUPLICATE | Source of truth is `ImNotAnAttorney/system/PIPELINE-MAP.md`. The stage diagram and tier coverage table are business-docs concerns. |, |
| 1568-1591 | Playbook / Digital Products (download flow, refund handling, drip sequence) | DUPLICATE | Download flow is covered in `src/app/CONTEXT.md` (checkout + webhooks). Drip sequence (4 emails) overlaps with `src/lib/drip-emails.ts`. Playbook catalog is in `src/lib/playbook-configs.ts`. |, |
| 1593-1622 | Webhook Handler (checkout.session.completed + charge.refunded) | UNIQUE_VALID | The 5-step webhook handler breakdown (extract metadata → create order → digital product path → service tier path → charge.refunded flow) is a useful runbook not at this level of detail in any lean doc. `src/app/CONTEXT.md` names the route but doesn't describe the flow. | `src/app/CONTEXT.md` under webhooks section, append webhook handler flow description. Verify against current `src/app/api/webhooks/stripe/route.ts` before extracting. |
| 1624-1648 | Checkout Flow (10-step process) + Checkout Success OTO System | UNIQUE_VALID | The 10-step checkout process table is unique runbook content not in any lean doc. `src/app/CONTEXT.md` only names the route. The OTO system description is unique. | `src/app/CONTEXT.md` under checkout/payments section, append 10-step checkout flow table + OTO system. Verify against current `src/app/api/checkout/route.ts` before extracting. |
| 1649-1689 | Drip Email System (crisis buyer psychology, sequence categories, timing models, design decisions) | UNIQUE_VALID (partial) | Crisis buyer psychology is in MEMORY + CLAUDE.md. Sequence categories table (9 categories with email counts + triggers) is unique and valuable. Timing models table (standard/relativeToDelivery/relativeToSubmission) is unique. Design decisions list (day-0 sync, dedup, placeholder resolution, threading, CAN-SPAM, styling) is unique. **Verification:** Drip-emails.ts uses `delayDays` (not `dayOffset` as one section mentions), confirmed in file. | `src/lib/CONTEXT.md` under drip email section, append sequence categories table, timing models table, design decisions. Use `delayDays` terminology from code. |
| 1690-1700 | Trial Operations Emails (Situation Room 3 daily cycle templates) | UNIQUE_STALE | Describes a file `src/lib/trial-ops-emails.ts` with 3 templates (`trialInputSolicitation`, `eveningDebriefDelivery`, `morningBriefDelivery`). **Verification:** Grep in `src/lib/` returns ZERO matches for these names. The file does NOT exist in current code. Either planned but never built, or was removed. **Recommendation:** Delete unless Rahim confirms trial ops emails are a planned feature, in which case keep as a design spec. | **Rahim decision needed.** |
| 1701-1733 | Cron Jobs, `/api/cron/drip` 22 parts breakdown | UNIQUE_VALID | Part-by-part breakdown (1-19 plus sub-parts 5b, 5c, 6b) with threshold + action for each. This is the canonical operational reference for what each cron part does. `src/lib/CONTEXT.md` mentions 22 tasks but does NOT enumerate them. The individual cron modules in `src/lib/cron/` (drip-nurture, drip-post-purchase, customer-lifecycle, etc.) implement the logic but don't aggregate the full 19-part list anywhere. Verify part count against current `/api/cron/drip/route.ts` before extracting, may have drifted. | `src/lib/CONTEXT.md` under "### Orchestrated Cron", append the 19-part table with thresholds and actions. Verify against `/api/cron/drip/route.ts` orchestrator array first. |
| 1734-1761 | Evaluation Pipeline (7 teams, 90 criteria, weight levels, tier-aware filtering, CLI) | UNIQUE_VALID (partial) | Source of truth for the 7-team framework is `ImNotAnAttorney/system/EVALUATION-TEAM.md`, DUPLICATE at the framework level. BUT the stale doc's note about "Production Edge Function implements 2 teams (UPL + Psych); full 7-team framework available in CLI tool" + the CLI invocation examples (`node evaluate-report.mjs,file ...,teams upl,legal,model sonnet`) are unique operational details not in lean docs. | `supabase/CONTEXT.md` under Edge Functions section, add a note that `evaluate-report` Edge Function runs 2 teams (UPL + Psych) while the full 7-team framework lives in the CLI tool. CLI details belong in the `ImNotAnAttorney` business docs repo. |
| 1763-1808 | Score System (algorithm, 10 categories with weights, compound penalty, time index, bands, aggregate tracking) | UNIQUE_VALID (partial) | `src/lib/CONTEXT.md` lists score weights in Key Constants (motions 20%, discovery 15%, etc.) and bands (Critical 0-30, etc.), so the raw numbers are covered. BUT the per-category scoring logic ("Private +5, Public Defender 0, No Attorney -15"; "Yes +15; No: -20 if timeIndex≥2, -5 if <2") is NOT in any lean doc. The compound penalty rule (timeIndex ≥3 AND no motions AND no discovery → -10) and Time Index breakdown (<1mo=0, 1-3mo=1, 3-6mo=2, 6-12mo=3, 12+mo=4) are also not documented. | `src/lib/CONTEXT.md` under scoring section, append detailed scoring logic table + compound penalty rule + Time Index breakdown. Verify against current `src/lib/score.ts` before extracting. |
| 1809-1894 | Operator Dashboard + Admin Dashboard + My-Case Portal | UNIQUE_VALID (partial) | `src/app/CONTEXT.md` lists operator pages but NOT the 8-tab case detail breakdown (Overview/Documents/Findings/Witnesses/Jobs/Tasks/Timeline/Legal) or the My-Case tier-gated dashboard features (X-Ray discovery strength rating, War Room witnesses/citations/motions, Situation Room attack intel + trial prep). These feature lists are unique. | `src/app/CONTEXT.md` under operator / customer portal sections, append 8-tab case detail breakdown + My-Case tier-gated features list. |
| 1895-1994 | Component Library + Frontend Infrastructure (fonts, theme, MDX, OG images, error pages, health check, analytics, org schema) | DUPLICATE | Component library is fully covered in `src/components/CONTEXT.md`. Frontend infrastructure (Geist/Playfair fonts, dark theme, MDX engine, OG images, error pages, /api/health) overlaps with root ARCHITECTURE.md + `src/app/CONTEXT.md`. Stale component list is incomplete vs lean doc (44 components vs stale's 25). |, |
| 1995-2026 | Structured Data / Schema.org + GEO Features | UNIQUE_VALID | Schema.org JSON-LD emission (6 schema types + .01% enhancements like `speakable`, `@id` entity binding, `citation`, `isBasedOn`, `educationalLevel`, `audience`, `about`) is NOT documented in any lean doc. `src/lib/CONTEXT.md` mentions `schema.ts` exists but doesn't list the schema types or GEO enhancements. Content GEO features (TLDRBoxes in 20/35 posts, internal linking, DefinedTerm blocks, numbered Q+A) are also unique. | New content in `content/CONTEXT.md` or `src/lib/CONTEXT.md` (schema.ts subsection), extract schema type table + .01% GEO enhancement table + content GEO features summary. Verify TLDRBox coverage number against current blog posts. |
| 2027-2047 | Shared Constants + Error Handling Strategy | DUPLICATE | Site constants in `src/lib/CONTEXT.md` Key Constants. Error handling overlaps with root ARCHITECTURE.md Cross-Cutting Concerns + individual CONTEXT.md files. |, |
| 2049-2070 | Backup Worker (GitHub Actions) + GitHub Actions Secrets | UNIQUE_STALE | Describes `.github/workflows/generate-report.yml` GitHub Actions cron. **Status uncertain:** MEMORY + CLAUDE.md say "NEVER use GitHub Actions schedule/cron triggers. Use cron-job.org instead." The stale doc contradicts this rule. Either the workflow was removed (stale doc forgot), or it's still there in violation of the rule, or it was kept as a legacy backup. **Recommendation:** Check `.github/workflows/` dir, if the file still exists, flag for removal; if gone, delete this section as stale. | **Rahim decision needed.** Verify `.github/workflows/generate-report.yml` exists, then decide: remove (per cron rule), or document as legacy exception. |
| 2072-2076 | Known Code Duplications (Intentional) | UNIQUE_VALID | The `escapeHtml()` + `sendEmail()` + `PHYSICAL_ADDRESS` duplication in Supabase Edge Functions (Deno can't import Next.js) is mentioned in root ARCHITECTURE.md Gotchas #5 and `src/lib/CONTEXT.md` Gotcha #4, so PARTIALLY duplicate. BUT the explicit framing of "Known Code Duplications (Intentional)" as a pattern is useful and the tier pricing duplication note (tiers.ts → PricingTable.tsx → services/page.tsx) is not in the lean docs. | Root `ARCHITECTURE.md` Gotchas, the PHYSICAL_ADDRESS one is already there. Add the tier pricing display-copy caveat as a second bullet if considered durable. |
| 2078-2237 | File Organization ASCII tree (src/, content/, scripts/, supabase/, .github/) | STALE | Directory listing is out of date (lists only ~12 migrations, missing 30+; omits src/app/tools, src/app/guides, src/app/services, src/app/intake/standalone, src/app/report/standalone, src/app/partner, src/app/admin/partners, src/app/my-cases, src/components/DiscoveryGate, etc.). Current repo structure is implicit in `src/app/CONTEXT.md` + `src/components/CONTEXT.md`. |, |
| 2239-2254 | Scripts Reference table | STALE | Duplicated and outdated vs `scripts/CONTEXT.md` (12 scripts listed here, 35+ in actual + documented in scripts/CONTEXT.md). |, |
| 2256-2303 | Engine Project Structure ASCII tree | STALE | Engine repo concern. 27 workers listed but actual is 41. Belongs in `ImNotAnAttorney-engine/` repo docs. |, |
| 2305-2330 | Business Docs Structure ASCII tree | DUPLICATE | Mirrors actual structure of `ImNotAnAttorney/system/`, sibling repo. Not a web concern. |, |
| 2331-2339 | Attorney Personas summary | DUPLICATE | Sibling repo concern (`ImNotAnAttorney/system/Attorney-Personas/`). |, |
| 2341-2357 | Cross-Reference: Business Documentation (table of 11 external docs) | DUPLICATE | Useful pointer table but duplicates what `.claude/rules/atti-persona.md` already establishes as the business docs ecosystem. |, |

## UNIQUE_VALID sections, full content to extract

### 1. Environment Variables Inventory (stale doc lines 123-140), CORRECTED

**Target:** Root `ARCHITECTURE.md`, new section "## Environment Variables" OR new file `docs/env-vars.md`

**Verification:** Grepped `process.env\.` across `src/`. All 12 vars below verified present. The stale doc's `CRON_SECRET` row is wrong, actual var is `CRON_AUTH_TOKEN` (middleware.ts:80, guards.ts:74, all cron route files). Additional vars not in the stale doc but found in code: `ADMIN_PASSWORD`, `STRIPE_SECRET_KEY_LIVE`, `STRIPE_WEBHOOK_SECRET_LIVE`, `NEXT_PUBLIC_GA_ID`, `NEXT_PUBLIC_META_PIXEL_ID`, `NEXT_PUBLIC_GOOGLE_ADS_ID`, `RESEND_INBOUND_WEBHOOK_SECRET`, `RESEND_WEBHOOK_SECRET`, `INDEXNOW_KEY`, `GITHUB_TOKEN` (blog publish), `TWILIO_ACCOUNT_SID/AUTH_TOKEN/PHONE_NUMBER`, `INTERNAL_QA_EMAIL`, `INTERNAL_QA_COUPON_ID`, `ENGINE_DISPATCH_PAT`, `VERCEL_TOKEN`.

Content to extract (update with verified + missing vars):

| Variable | Used By | Purpose |
|----------|---------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | All API routes | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | All API routes | Full DB access (bypasses RLS) |
| `STRIPE_SECRET_KEY` | checkout, webhook (test mode) | Stripe API access (test) |
| `STRIPE_SECRET_KEY_LIVE` | checkout, webhook (live mode) | Stripe API access (live), required when any tier has `live: true` |
| `STRIPE_WEBHOOK_SECRET` | webhook | Verify Stripe webhook signatures (test) |
| `STRIPE_WEBHOOK_SECRET_LIVE` | webhook | Verify Stripe webhook signatures (live) |
| `RESEND_API_KEY` | email.ts, admin/reply, resend-inbound | Send transactional emails |
| `RESEND_FROM_EMAIL` | email.ts | Sender address (default `noreply@imnotanattorney.com`) |
| `RESEND_INBOUND_WEBHOOK_SECRET` | resend-inbound webhook | Verify inbound email webhook |
| `RESEND_WEBHOOK_SECRET` | resend webhook | Verify delivery/bounce webhook |
| `OPERATOR_EMAIL` | All alert routes | Where operator notifications go (default `rahim0kapadia@gmail.com`) |
| `OPERATOR_SECRET` | generate, deliver, evaluate, qa-checkout | Bearer auth for operator-only endpoints + HMAC signing |
| `ADMIN_PASSWORD` | middleware, auth/guards | Admin password for `/api/admin/*` + `/api/operator/*` (timing-safe compare) |
| `NEXT_PUBLIC_SITE_URL` | Email links, redirects | Canonical site URL (default `https://imnotanattorney.com`) |
| `ANTHROPIC_API_KEY` | Edge Function, blog-generation, demand/classify-llm, batch-api | Claude API for report/content generation |
| `CRON_AUTH_TOKEN` | middleware, auth/guards, all cron routes | Bearer auth for cron requests (NOT `CRON_SECRET`, common confusion) |
| `SUPABASE_ACCESS_TOKEN` | Supabase CLI, scripts | Edge function + migration deployment (from `../ImNotAnAttorney/.env.local`) |
| `CRONJOB_API_KEY` | scripts/setup-cronjob-org.js | cron-job.org job registration |
| `INDEXNOW_KEY` | blog-generation/publish, /api/indexnow | IndexNow search engine ping |
| `GITHUB_TOKEN` | blog-generation/publish | Git commit of generated blog posts |
| `TWILIO_ACCOUNT_SID` | twilio.ts | Twilio auth for operator SMS alerts |
| `TWILIO_AUTH_TOKEN` | twilio.ts | Twilio auth |
| `TWILIO_PHONE_NUMBER` | twilio.ts | Twilio sender number |
| `NEXT_PUBLIC_GA_ID` | CookieConsent | Google Analytics ID |
| `NEXT_PUBLIC_META_PIXEL_ID` | CookieConsent | Meta (FB) pixel ID |
| `NEXT_PUBLIC_GOOGLE_ADS_ID` | CookieConsent | Google Ads ID |
| `INTERNAL_QA_EMAIL` | checkout, qa-checkout, stripe webhook | Email allowlist for free QA checkout |
| `INTERNAL_QA_COUPON_ID` | checkout | 100%-off Stripe coupon ID for QA |
| `ENGINE_DISPATCH_PAT` | cron/generate-backup | GitHub PAT to dispatch engine workflow |
| `VERCEL_TOKEN` | scripts, CLI | Vercel API/CLI auth |

---

### 2. 7 Deploy Rules (stale doc lines 113-121)

**Target:** Root `ARCHITECTURE.md`, append to Deployment or Forbidden sections

**Verification:** Rules are historical guardrails. Rule 2 (NEVER `vercel deploy`) is already in root Forbidden. Rules 1, 3, 4, 5 are unique guardrails worth preserving.

Content to extract:

1. **NEVER deploy to `tastedrops-projects`**, that is TasteDrop's account, completely separate business
2. **NEVER run `vercel env pull`**, it overwrites `.env.local` with only the vars in Vercel (missing local-only vars)
3. **NEVER delete `.vercel/` directory**, it links the CLI to the correct project
4. **NEVER touch domain settings**, `imnotanattorney.com` is routed via Cloudflare A records, already configured
5. **Verify account before any Vercel CLI operation:** `npx vercel whoami` must show `rahim0kapadia-1967`

---

### 3. Citation Verification Cascade, Offline vs Runtime note (stale doc lines 285-294)

**Target:** `scripts/CONTEXT.md` Legal Research Pipeline subsection

**Verification:** Both `scripts/legal-research-all.mjs` and `scripts/classify-case-law.mjs` exist and are already documented in scripts/CONTEXT.md. The unique insight is WHERE verification happens.

Content to extract (paraphrased):

> **Status note:** The web pipeline does NOT verify citations at runtime. Citation verification happens OFFLINE via:
> 1. `scripts/legal-research-all.mjs`, searches CourtListener for cases citing each statute, populates `statute_case_law` with REAL cases (case_name, citation, court, year, holding, courtlistener_cluster_id)
> 2. `scripts/classify-case-law.mjs`, fetches actual opinion text from CourtListener, classifies DEFENSE/PROSECUTION, runs `checkNegativeTreatment()` to verify good law via citing-opinions endpoint
>
> The `generate-report` Edge Function only filters cases via `is_good_law=eq.true`, it does NOT verify Claude-generated citations against any database.
>
> The full multi-source verification cascade (Harvard CAP, GovInfo, eCFR) lives in the engine repo (`ImNotAnAttorney-engine/integrations/legal-verifier.mjs`), not in this web repo.

---

### 4. Architecture Patterns (stale doc lines 508-555), **HIGHEST VALUE**

**Target:** Root `ARCHITECTURE.md`, expand Cross-Cutting Concerns OR new section "## Architecture Patterns"

**Verification:** All 6 patterns reference real code that still exists. This is the single most valuable UNIQUE_VALID section and should be extracted near-verbatim.

Content to extract:

**1. Fire-and-Forget Delegation**
API routes validate + perform atomic state change, then POST to Edge Functions without await. Keeps response time <500ms. The Edge Function runs asynchronously; if it fails, cron Parts 5/5b detect stuck cases. Used by: `generate/case-decoder`, `generate/intelligence-brief`, `evaluate/case-decoder`, webhook generation triggers.

**2. Atomic Claim-Then-Email**
Conditional UPDATE with WHERE clause as database-level mutex. The UPDATE happens BEFORE the email send. Losing request gets zero rows updated, returns early. Prevents duplicate emails from concurrent requests.
```sql
UPDATE cases SET status = 'delivered', delivered_at = now()
WHERE id = $1 AND status = 'review'
RETURNING *;
, If 0 rows returned → another request already delivered → return early
```
Used by: deliver route, generation triggers, cron parts.

**3. Email Retry with Operator Fallback**
First attempt (rich HTML) → 2s delay → retry (simplified HTML) → operator alert with report URL for manual forwarding. Case status already updated so report URL works even without email. Used by: all email-sending routes via `sendEmailWithRetry()`.

**4. Idempotency via Status Checks + Unique Constraints**
Status-based check first (skip if already processing), then atomic guard (DB-level). Stripe webhook retries return 200 on duplicate `stripe_session_id` (PostgreSQL error code 23505 = unique violation). Used by: webhook handler, cron parts, generation dispatchers.

**5. HMAC Token Signing**
Operator delivery links use `signOperatorToken(caseId)` with 24h TTL. Phase 2 intake links use `signPhase2Token(caseId)` with 30-day TTL. Token format: `"timestamp.hmac_hex"` where payload = `"${caseId}:${timestamp}"`, signed with HMAC-SHA256 using `OPERATOR_SECRET`. Verification uses constant-time comparison. Source: `src/lib/site.ts`.

**6. Score-Band Routing**
Subscribers who complete the Defense Milestone Score get `score_band` stored on their subscriber record. Cron Part 1 routes them to band-specific drip sequences FIRST, then falls through to standard nurture with a day offset. Crisis/Concerning get urgency sequences; Adequate/Excellent get validation.

---

### 5. CSP Policy + Security Headers (stale doc lines 562-574, 599-604)

**Target:** `src/app/CONTEXT.md` under middleware section, OR new "Security" subsection

**Verification:** CSP is set in `src/middleware.ts` (confirmed earlier, the file reads `process.env.NEXT_PUBLIC_SUPABASE_URL` for the connect-src). Content likely accurate; re-verify before extracting.

Content to extract:
```
Content-Security-Policy:
  default-src 'self'
  script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://js.stripe.com https://vercel.live
  style-src 'self' 'unsafe-inline'
  img-src 'self' data: https:
  font-src 'self'
  connect-src 'self' https://api.stripe.com https://vercel.live ${supabaseUrl}
  frame-src https://js.stripe.com https://hooks.stripe.com
  frame-ancestors 'none'
  base-uri 'self'
  form-action 'self' https://checkout.stripe.com
```

Security headers (from `next.config.ts`):
- `Strict-Transport-Security`, HSTS with preload
- `X-Content-Type-Options: nosniff`, Prevent MIME sniffing
- `X-Frame-Options: DENY`, Prevent clickjacking
- `Referrer-Policy: strict-origin-when-cross-origin`, Limit referrer leakage

---

### 6. Full DB Schema, Column-Level Reference (stale doc lines 620-1091, ~270 lines)

**Target:** New file `supabase/SCHEMA.md` OR append to `supabase/CONTEXT.md` as "## Full Schema Reference"

**Verification:** Spot-checked against migrations list (41 migrations confirmed). The stale doc schema covers migrations 001-012 roughly; migrations 13-41 introduced many new tables/columns (referral-system, partner-portal, feature-flags, customer-portal, batch-id, charge-taxonomy, cron-executions, research-columns, blog-drafts, score-results, acquire-cron-lock-rpc, report-token-hash, guarantee_invocations, standalone_products, calculator_email_rpc, case-law-verification, phase0_feature_flags, enrichment-and-case-law-data).

**CONTENT TO EXTRACT:** All table definitions in stale doc lines 620-1091. Too large to inline here, Phase 2 should copy the entire block verbatim with this header:

> **Schema snapshot as of ~migration 012.** Tables added after migration 012 (partner_portal, feature_flags, customer_portal, batch_id, charge_taxonomy, cron_executions, research_columns, blog_drafts, score_results, acquire_cron_lock_rpc, report_token_hash, guarantee_invocations, standalone_products, calculator_email_rpc, case_law_verification_columns, phase0_feature_flags, enrichment_and_case_law_data) are NOT documented here, audit migrations 20250101000012.sql onward to complete.

**Specific tables to extract:** orders, cases, intakes, subscribers, drip_emails, 12 reference data tables (experts, eval_criteria, pipeline_eval_weights, buyer_states, content_pain_points, content_assets, intake_questions, tiers, charge_types, content_posts, subreddits, emotional_profiles), email_log, audit_runs, cron_runs, rate_limits, counters, score_aggregates, docket_entries, charge_packs, discovery_documents, timeline_events, case_analysis_results, case_witnesses, case_findings, evidence_items + evidence_custody, case_law_references, motion_recommendations, trial_materials, processing_jobs, operator_tasks, inbound_emails, emerging_topics, content_gaps, demand_scores, content_performance, discovered_subreddits, and the engine-owned tables list.

**Also extract:** Database RPCs table (7 RPCs), Database Indexes table (24 indexes), Database Triggers list.

---

### 7. Case Status State Machine (stale doc lines 1140-1203) + Operator Transitions

**Target:** `supabase/CONTEXT.md` under new "## Case Status State Machine" section

**Verification against `src/lib/types/operator.ts:270-299`:**
- Stale doc DiscoveryStatus list matches core statuses
- Stale doc MISSING 4 new states: `intelligence`, `strategy`, `packaging`, `monitoring` (engine pipeline phases + War Room post-delivery)
- Current ALLOWED_TRANSITIONS code:
```typescript
export const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  "awaiting-intake": ["intake"],
  intake: ["generating", "pending"],
  generating: ["review"],
  pending: ["uploaded"],
  uploaded: ["submitted"],
  submitted: ["processing"],
  processing: ["intelligence", "review", "submitted"],
  intelligence: ["strategy", "processing"],
  strategy: ["packaging", "intelligence"],
  packaging: ["review", "strategy"],
  review: ["delivered", "processing"],
  delivered: ["monitoring"],
};
```

**Extract:** The ASCII state machine diagram (verbatim) + Status Definitions table, THEN update both to include: intelligence, strategy, packaging, monitoring (4 new states). The lines 1206-1214 TypeScript block in the stale doc is STALE, replace with the current version above.

---

### 8. Multi-Case Order Model / Tier Inclusion (stale doc lines 1218-1251)

**Target:** Root `ARCHITECTURE.md` append to "Life of a Case" OR new section "## Tier Inclusion Model"

**Verification:** Verify inclusion map against `src/lib/tiers.ts` `includesTiers` field before extracting.

Content to extract:

**Inclusion Map:**
| Purchased Tier | Cases Created | Included Deliverables |
|---|---|---|
| Case Decoder ($197) | 1 case | None |
| Intelligence Brief ($997) | 2 cases | Case Decoder (`is_included_deliverable=true`) |
| X-Ray ($2,497) | 3 cases | Case Decoder + Intelligence Brief |
| War Room ($4,997) | 4 cases | CD + IB + X-Ray |
| Situation Room ($9,997) | 5 cases | CD + IB + X-Ray + War Room |

**How It Works (5 steps):**
1. Webhook creates the primary case AND loops through `tierConfig.includesTiers` to create additional cases with `is_included_deliverable=true` and `parent_order_id` set.
2. Upgrade dedup: Before creating an included case, checks if the customer already has a delivered case for that tier (by email OR court case number match). If so, skips creation.
3. Included CD auto-generates immediately if intake exists (same fire-and-forget pattern as standalone CD).
4. CD delivery triggers Phase 2 email: When an included CD is delivered, the deliver route finds sibling cases still awaiting intake and sends the Phase 2 intake email.
5. Refund cascade: `cases.eq("order_id")` catches all cases on the order.

**Two-Phase Intake Flow:**
- Phase 1 (standard intake): Collected post-purchase. Used to generate the included Case Decoder.
- Phase 2 (IB-specific intake): After CD delivery, customer receives email with HMAC-signed link to `/intake/intelligence-brief`. Collects judge, attorney, hearing details.

**Customer Identity:**
- `court_case_number` + `court_state` on the `cases` table (required intake field)
- Checkout page "Returning customer?" section for IB+ tiers

---

### 9. Intelligence Brief Pipeline, Phase A/B Detail (stale doc lines 1454-1506)

**Target:** `src/lib/CONTEXT.md` under existing IB pipeline section

**Verification:** Keys `case-roadmap`, `whats-working`, `legal-options`, `case-intelligence`, `48hr-priorities` confirmed present in `src/lib/intelligence-brief/prompts.ts`.

**Phase A (5 parallel sections):**
| Section | Key | Emotion | Output |
|---------|---, |---------|------, |
| Case Roadmap | `case-roadmap` | Orientation | Timeline table + stages + two paths (plea/trial) |
| What's Working | `whats-working` | Grounding | Good news + attorney decoded + gaps as CLARIFY + Case Progress Score |
| Legal Options | `legal-options` | Empowerment | Motion landscape + deadline calendar + plea framework |
| Protection | `protection` | Security | Collateral consequences + life impact map |
| Court Prep | `court-prep` | Readiness | Static appendix template |

**Case Progress Score (internal to Section 2):** 0-100, 6 weighted dimensions: Communication 25%, Case Review 15%, Discovery 20%, Motion Activity 15%, Strategy 15%, Court Prep 10%.

**Phase B (4 sequential sections):**
| Section | Key | Depends On | Output |
|---------|---, |---------, |------, |
| Case Intelligence | `case-intelligence` | Sections 1-2 gaps | Outcome map + defense theories + judge profile + prosecution preview |
| Your Plan | `your-plan` | Sections 1-2 + motions | Email template + phone script + 14-day plan with daily actions |
| Questions | `questions` | All Phase A | 10-15 targeted questions based on gaps |
| 48hr Priorities | `48hr-priorities` | All sections | Top 3 actions ranked by urgency |

**IB Variables** (`IBVariables` interface, 65 fields in 9 categories):
| Category | Examples |
|----------|---------|
| Core Identity | first_name, charges, state, county, jurisdiction_level, case_number |
| Timeline | case_stage, arrest_date, months_since_arrest, next_court_date, motion_deadlines |
| Attorney Context | attorney_type (derived), attorney_name, attorney_firm, last_communication |
| Case Details | discovery_status, plea_status, plea_terms, charge_specific_data |
| Personal Context | frustration, biggest_concern, employment, family_situation, has_children, immigration_status |
| Computed (Phase A→B) | gaps_from_section_2, progress_score, applicable_motions, urgent_deadlines |
| Section Outputs | case_roadmap_output, whats_working_output, case_intelligence_output (for 48hr-priorities) |

---

### 10. Webhook Handler Flow (stale doc lines 1593-1622) + Checkout 10-Step Flow (1624-1648)

**Target:** `src/app/CONTEXT.md` under webhooks and checkout subsections

**Verification:** Verify against current `src/app/api/webhooks/stripe/route.ts` and `src/app/api/checkout/route.ts` before extracting, both files are known to have been modified extensively through March/April 2026 (standalone products, refund cascade, guarantee invocations).

**Webhook Handler: `checkout.session.completed`**
1. Extract metadata: tier, email (normalized), amount, product_type, priority_delivery, court_date, consent_timestamp, upgrade_credit_applied, existing_case_number/state.
2. Create order: Insert with unique constraint on `stripe_session_id`. Duplicate (code 23505) returns 200 (idempotent).
3. Digital Product Path (early return): Generate download_token (UUID) + 72h expiry → send playbook delivery email → show upgrade credit toward CD → operator notification → RETURN.
4. Service Tier Path: Create case → link intake if found → included deliverable creation loop → generation trigger via `after()` → status-appropriate emails.

**Webhook Handler: `charge.refunded`**
1. Update order: `status = "refunded"`, `refunded_at = now()`
2. Update case: `status = "refunded"`
3. Void all future upgrade credits for that email
4. Revoke download access (403 on token lookup)
5. Operator notification with refund amount + reason

**Checkout Flow (10 steps):**
| Step | Action | Details |
|------|------, |---------|
| 1 | Rate limit | `checkRateLimit(ip, "checkout:{ip}", 10, 300)`, 429 if exceeded |
| 2 | Tier validation | Reject unknown tier slugs against TIERS config, 400 |
| 3 | Email validation | Regex + normalize (lowercase + trim), 400 |
| 4 | Email capture | Upsert to subscribers (source="checkout"), powers abandonment recovery |
| 5 | Charge type auto-detect | Lookup most recent intake if not provided |
| 6 | Refund check | Block if prior refunded order exists (fraud prevention) |
| 7 | Prerequisite gate | Situation Room requires prior War Room (soft gate) |
| 8 | Consent validation | Non-digital tiers require consent=true; $2,497+ strict check |
| 9 | Case number lookup | Cross-email identity matching for returning customers |
| 10 | Upgrade credit | 100% from lower tiers (12mo), playbooks (30d). Create Stripe coupon |

Checkout Success OTO: 24-hour countdown timer (localStorage + server session), per-tier upgrade offers with credit pre-calculated, tier-specific next steps (`TIER_NEXT_STEPS` config).

---

### 11. Drip Email Sequence Categories + Timing Models + Design Decisions (stale doc lines 1659-1689)

**Target:** `src/lib/CONTEXT.md` under existing drip-emails section

**Verification:** Drip-emails.ts uses `delayDays` (not `dayOffset`), confirmed. Sequence categories and triggers should be verified against current `src/lib/drip-emails.ts` before extracting.

**Sequence Categories:**
| Category | Emails | Trigger |
|----------|------, |---------|
| Nurture | 6+ emails | Days since subscribe (1, 3, 5, 7, 10, 14) |
| DUI 72-hour crisis | 3 emails | Days 2, 4, 7, tighter cadence for DUI defendants in crisis (source: `dui-72-hours`). Falls to standard nurture at Day 10+ |
| Score-band nurture | Band-specific | Crisis/Concerning urgency or Adequate/Excellent validation |
| Post-purchase (CD) | ~6 emails | intake_reminder → delivery → meeting_prep → story_harvest → upsell → referral |
| Post-purchase (IB) | ~6 emails | phase2_reminder → delivery → meeting_prep → story_harvest → upsell → referral |
| Post-purchase (X-Ray) | ~8 emails | intake → delivery → upload → meeting_prep → story_harvest → upsell → referral → status_update |
| Post-purchase (War Room/SR) | ~6 emails | intake → delivery → meeting_prep → story_harvest → status_update → referral |
| Playbook | 4 emails | Charge-specific action → story harvest → upsell to CD → referral |
| Abandoned checkout | 1 email | 24-48h after email captured at checkout with no purchase |

**Timing Models:**
| Model | Measured From | Used By |
|-------|------------, |---------|
| Standard (default) | `orders.paid_at` | Most post-purchase emails |
| `relativeToDelivery` | `cases.delivered_at` | Post-delivery follow-ups |
| `relativeToSubmission` | Case status → "submitted" | Active-wait discovery emails |

**Design Decisions:**
- Day-0 emails (`delayDays=0`) sent synchronously by webhook/delivery endpoint, NOT cron (cron skips day-0 to prevent duplicates)
- Dedup via `drip_emails` table (subscriber_id + email_key unique constraint)
- Placeholder resolution: `{{CASE_ID}}`, `{{EMAIL}}`, `{{REPORT_URL}}`, `{{DOCUMENT_COUNT}}`
- Personalization via intake data (family_buyer, stage_aware, career_aware blocks)
- Email threading: `caseThreadId(caseId)` generates RFC 2822 Message-ID
- CAN-SPAM: Physical address + unsubscribe link + List-Unsubscribe headers (RFC 8058)
- Email styling: dark bg (#0C0A09), zinc text (#D4D4D8), amber accent (#F59E0B)

---

### 12. Cron Jobs, 19-Part Breakdown (stale doc lines 1701-1733)

**Target:** `src/lib/CONTEXT.md` under "### Orchestrated Cron"

**Verification:** Verify part count + thresholds against current `/api/cron/drip/route.ts` orchestrator, may have drifted. Root ARCHITECTURE.md says "22 tasks"; stale doc says "19 numbered + 3 sub-parts = 22 parts". This matches.

| Part | What | Threshold / Target | Action |
|------|------|-------------------|------, |
| 1 | Nurture emails | Days since subscribe | Send next unsent email (DUI-72h routing → band-routing → standard nurture) |
| 2 | Post-purchase emails | Days since purchase/delivery/submission | Tier-specific follow-ups (3 timing models, guards for status) |
| 3 | Review reminders | 12h in "review" | Alert operator (48h guarantee at risk) |
| 4 | Stuck intake detection | 2h in "intake" (CD, non-included) | Mark intake-stalled, alert operator |
| 5 | Stuck generation (CD) | 30min in "generating" | Mark generation-failed, alert operator |
| 5b | Stuck IB generation | auto-generating >30min, compiling >30min, researching >24h | Re-trigger Phase A/B, 72h escalation |
| 5c | IB Phase 2 intake reminder | 48h in "intake" (IB, phase2_data NULL) | Customer reminder, 7-day operator escalation |
| 6 | Awaiting-intake reminder | 24h in "awaiting-intake" | Customer reminder email |
| 6b | Intake escalation | 72h / 7 days no intake | Operator alert, consider refund |
| 7 | Abandoned intake cleanup | >90 days, no case | Purge orphaned intakes |
| 8 | Rate limit cleanup | >1 hour old | Remove expired rate_limit rows |
| 9a | Stripe reconciliation | Paid sessions, no order | Auto-create missing order + case, alert operator |
| 9b | Orphan order detection | Order exists, no case | Auto-create case, alert operator |
| 10 | Report expiry warning | 30-31 days before 12-month expiry | Warn customer |
| 11 | Abandoned checkout recovery | 24-48h, source="checkout", no purchase | Recovery email |
| 12 | Missed evaluation safety net | 15min in "review", eval_results NULL | Re-trigger evaluation (limit 5/run) |
| 13 | Drip email log cleanup | >90 days | Delete stale send records (Privacy Policy §6) |
| 14 | Discovery document auto-deletion | 90 days post-delivery | Delete from Storage + clear file_urls (Privacy Policy §4) |
| 15 | Stuck job detection | processing_jobs >30min in "processing" | Mark failed, create HIGH priority operator task |
| 16 | Pipeline completion check | All jobs done for a case | Transition case to "review", email operator with scores |
| 17 | SLA breach detection | delivery_due_at passed, not delivered/refunded | Create URGENT operator task (deduped) |
| 18 | Weekly progress email | War Room + Situation Room active cases | Weekly customer update (week-number dedup) |
| 19 | Engine heartbeat | processing_jobs "queued" >1 hour | URGENT operator task, engine may be down (daily dedup) |

---

### 13. Score System, Per-Category Scoring Logic (stale doc lines 1767-1797)

**Target:** `src/lib/CONTEXT.md` under existing scoring section

**Verification:** Verify against current `src/lib/score.ts`, weights may have been updated during v3/v4 audit.

**Algorithm (starts at 50 baseline, 10 weighted categories):**
| Category | Weight | Scoring Logic |
|----------|------, |------------, |
| Time Since Arrest | 30% | Drives timeIndex (0-4) used by other categories as severity multiplier |
| Attorney Type | 10% | Private +5, Public Defender 0, No Attorney -15, Not Sure -10 |
| Motions Filed | 20% | Yes +15; No: -20 if timeIndex≥2, -5 if <2; Don't Know -10 |
| Discovery Received | 15% | Yes +10; No: -15 if timeIndex≥2, -3 if <2; Don't Know -10 |
| Communication Frequency | 15% | Weekly +10, Monthly 0, Rarely -10, Never -20 |
| Strategy Discussion | 10% | Yes in Detail +10, Briefly +2, No -12 |
| Criminal History |, | -2 to -5 (misdemeanor vs felony/multiple) |
| Case Stage |, | Contextual observations + stage-specific penalties |
| Licensed Profession |, | Collateral consequence warnings (no score impact) |
| Charge Type |, | Mandatory charge-specific observation (always included) |

**Compound penalty:** If timeIndex ≥ 3 AND no motions AND no discovery → additional -10.

**Time Index:** <1mo=0, 1-3mo=1, 3-6mo=2, 6-12mo=3, 12+mo=4.

---

### 14. Schema.org / .01% GEO Enhancements (stale doc lines 1995-2026)

**Target:** `content/CONTEXT.md` OR `src/lib/CONTEXT.md` under `schema.ts`

**Schema Types Emitted:**
| Schema Type | Where | Purpose |
|-------------|-------|---------|
| `Article` | All blog posts | Core article entity with `@id` binding |
| `FAQPage` | Posts with `faqs` frontmatter | FAQ rich results, linked to Article via `isPartOf` |
| `HowTo` | Posts with `howToSteps` frontmatter | Step-by-step rich results |
| `BreadcrumbList` | All blog posts + score page | Navigation hierarchy |
| `Organization` | Site-wide | Publisher entity |
| `Service` / `LegalService` | Services page | Product listings with OfferCatalog |

**.01% Enhancements:**
| Property | Applied To | Signal |
|----------|---------, |------, |
| `speakable` | All posts (`.tldr-box` CSS selector) | AI-extractable TLDRBox content |
| `@id` entity binding | Article ↔ FAQPage | Closes disconnected entity graph |
| `citation` | Posts with .gov/.edu links | "Reference material" classification |
| `isBasedOn` | Research-type posts | "Research article" classification |
| `educationalLevel` | All posts (`beginner`) | Content classifier |
| `audience` | All posts (`criminal defendant`) | Audience targeting for AI retrieval |
| `about` | All posts (from category + tags) | Topic entity mapping |

**Content GEO Features:**
- TLDRBoxes: ~57% coverage (verify current blog post count)
- Internal linking: cross-linked posts with semantic anchor text variation
- DefinedTerm-ready blocks (e.g., constructive possession, proffer session)
- Numbered Q+A format for direct-answer paragraphs

---

## UNIQUE_STALE sections, flag for Rahim decision

### Trial Operations Emails (stale doc lines 1690-1700)

**Why stale:** The stale doc describes a file `src/lib/trial-ops-emails.ts` with 3 templates: `trialInputSolicitation` (evening), `eveningDebriefDelivery`, `morningBriefDelivery`. Grep across `src/lib/` returns ZERO matches for these function names. The file does not exist in current code. Either this was planned and never built, or built and removed, or moved to a different location.

**Recommendation:** DELETE, unless Rahim confirms trial ops emails are an active planned feature for Situation Room, in which case extract as a design spec to `docs/specs/trial-ops-emails.md`.

**Rahim decision needed:** YES, is the Situation Room trial ops email cycle (morning brief + evening debrief + input solicitation) still a planned deliverable or scrapped?

---

### Backup Worker GitHub Actions (stale doc lines 2049-2070)

**Why stale:** Describes `.github/workflows/generate-report.yml` running a cron every 5 minutes to catch Edge Function timeouts. This directly contradicts the global rule "NEVER use GitHub Actions schedule/cron triggers. Use cron-job.org hitting API routes instead" (from `~/.claude/CLAUDE.md`) AND the INAA memory entry "[No GitHub Actions cron](feedback_no_github_cron.md)".

Either:
(a) The workflow file still exists in violation of the rule (worth fixing),
(b) The workflow was deleted and replaced with `/api/cron/generate-backup` (which exists, confirmed in grep earlier), which would make this section pure archival,
(c) Both exist (duplication).

**Verification needed:** Check if `.github/workflows/generate-report.yml` actually exists. The cron-job.org route `/api/cron/generate-backup/route.ts` DOES exist in current code (confirmed in grep).

**Recommendation:**
- If GitHub Actions workflow exists: DELETE the workflow file, delete this section.
- If GitHub Actions workflow does NOT exist: delete this section as pure stale.
- Either way, do NOT extract, replaced by `/api/cron/generate-backup` registered on cron-job.org.

**Rahim decision needed:** NO, this can be auto-resolved in Phase 2 by checking the `.github/workflows/` directory. Flagged here because of the rule contradiction.

---

## Extract targets summary

- **Root `ARCHITECTURE.md`:** 4 sections to append
  - Environment Variables (new section with corrected/expanded list)
  - Deploy Rules (append to Deployment or Forbidden)
  - Architecture Patterns (6 patterns, expand Cross-Cutting Concerns)
  - Tier Inclusion Model (append to Life of a Case)

- **`supabase/CONTEXT.md`:** 3 items to append
  - Case Status State Machine (ASCII diagram + definitions, UPDATED with 4 new states)
  - Updated `evaluate-report` Edge Function note (runs 2 teams in prod, 7 in CLI)
  - Pointer to new `supabase/SCHEMA.md` (if created)

- **New file `supabase/SCHEMA.md`:** 1 section
  - Full column-level schema reference (stale doc lines 620-1091) + RPCs + Indexes + Triggers

- **`src/lib/CONTEXT.md`:** 5 items to append
  - Detailed scoring logic per category + compound penalty + Time Index
  - Drip sequence categories + timing models + design decisions
  - 19-part cron orchestrator breakdown
  - IB Phase A/B section tables + Case Progress Score 6-dimension breakdown
  - IB Variables 65-field 9-category breakdown
  - Schema.org / GEO enhancements table (alternative: `content/CONTEXT.md`)

- **`src/app/CONTEXT.md`:** 3 items to append
  - CSP policy block + Security headers list
  - Stripe webhook handler flow (checkout.session.completed + charge.refunded)
  - Checkout 10-step flow + OTO system
  - 8-tab operator case detail breakdown + My-Case tier-gated features

- **`scripts/CONTEXT.md`:** 1 item to append
  - Citation verification offline-vs-runtime status note

- **`content/CONTEXT.md`:** 0-1 items (schema.org content could go here OR in src/lib/CONTEXT.md)

- **`docs/archive/2026-04-07-legacy-architecture.md`:** 0 sections
  (Recommendation: do NOT create an archive file. All UNIQUE_VALID content should be moved into the lean docs where it belongs. The stale doc can be deleted entirely after extraction, git history is the archive.)

## Recovery

If Phase 2/3 goes wrong:

```bash
git show HEAD:docs/ARCHITECTURE.md > docs/ARCHITECTURE.md.recovered
```

## Extraction priority for Phase 2

**HIGH (extract first, highest information density, lowest duplication):**
1. Architecture Patterns (6 patterns), root ARCHITECTURE.md
2. Full DB Schema Reference (~270 lines), new supabase/SCHEMA.md
3. 19-part Cron Orchestrator breakdown, src/lib/CONTEXT.md
4. Environment Variables inventory (corrected + expanded), root ARCHITECTURE.md

**MEDIUM (extract second, valuable operational detail):**
5. Case Status State Machine diagram + updated transitions, supabase/CONTEXT.md
6. Tier Inclusion Model, root ARCHITECTURE.md
7. IB Phase A/B Detail, src/lib/CONTEXT.md
8. Score System per-category logic, src/lib/CONTEXT.md
9. Checkout 10-step flow + webhook handler flow, src/app/CONTEXT.md

**LOW (extract third, nice-to-have):**
10. Drip sequence categories + design decisions, src/lib/CONTEXT.md
11. CSP policy + security headers, src/app/CONTEXT.md
12. Schema.org / GEO enhancements, content/CONTEXT.md or src/lib/CONTEXT.md
13. Deploy Rules (4 remaining, after dedup vs root), root ARCHITECTURE.md
14. Citation verification offline/runtime note, scripts/CONTEXT.md

**Before extracting:** Verify each section's live content against the current code pointed to by the stale doc. The doc is ~3 months stale; assume field names, weights, and counts may have drifted.
