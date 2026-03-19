# ImNotAnAttorney — Architecture

## System Overview

ImNotAnAttorney is a content-driven legal empowerment business for criminal defendants. The tech stack delivers a fully automated pipeline from payment to report delivery for the Case Decoder tier ($197), with semi-automated Intelligence Brief ($997) and engine-powered processing for discovery tiers ($2,497+). Digital playbooks ($97) are instant-delivery.

### Three-Project Architecture

The system spans 3 repositories, connected through a shared Supabase database:

```
ImNotAnAttorney/                ← Business docs, strategy, templates, seed data
  system/                       ← Evaluation teams, expert reference, emotional intelligence,
                                  pipeline map, buyer states, content standards, attorney personas
  system/templates/             ← Prompt templates for X-Ray, War Room, Situation Room
  system/data/                  ← Anti-hallucination seed data (motion library, penalty ranges, etc.)

ImNotAnAttorney-web/            ← Next.js customer-facing site (LIVE at imnotanattorney.com)
  src/app/                      ← 28 pages, 35 API routes
  src/lib/                      ← Business logic, IB pipeline, email system
  supabase/functions/           ← Edge Functions (CD generation, evaluation)
  content/blog/                 ← 35 MDX blog posts

ImNotAnAttorney-engine/         ← Backend worker pipeline (Node.js, 27 workers, 6-phase job queue)
  src/workers/                  ← Per-job-type worker modules
  src/worker.mjs                ← Job dispatch + pipeline orchestration
  src/queue.mjs                 ← Job claiming (FOR UPDATE SKIP LOCKED), retry logic
  src/config.mjs                ← Model selection, env vars, template paths
```

```
Data Flow:

  [Web App]                      [Engine]                     [Business Docs]
  Stripe webhook ──► Supabase ◄── Job queue polling           Templates loaded
  Intake form ─────►   DB    ◄── Worker results               from system/
  Edge Functions ──►         ◄── Citation verification        Seed data loaded
  Cron (22 parts) ─►         ◄── Docket monitoring            from system/data/
  Operator UI ─────►         ◄── Cost tracking
```

**Shared Supabase:** All three projects read/write the same PostgreSQL database. The web app owns customer-facing tables (orders, cases, intakes, subscribers). The engine owns processing tables (processing_jobs, document_pages, entity_extractions). Business docs provide templates and seed data consumed by both.

```
Customer Journey:

  [Public Funnel]
  Landing Page → Blog → Score / DUI 72-Hour Checklist (free lead magnets) → Checkout → Stripe Payment

  [Digital Product Path — Playbooks $97]
  Payment → Webhook → download_token (72h) → PDF delivery email → Playbook drip (4 emails)

  [Service Path — Case Decoder $197]
  Payment → Webhook → Case created → Intake form → Auto-generation (Edge Function)
    → Evaluation (UPL + Psych) → Operator review → Delivery email
    → Post-purchase drip → Upgrade path

  [Service Path — Intelligence Brief $997]
  Payment → Webhook → Case created + included CD case
    → CD intake → CD auto-generates → CD delivered → Phase 2 intake email
    → IB Phase A (5 parallel sections) → IB Phase B (4 sequential sections)
    → Operator review → Delivery email

  [Service Path — Discovery Tiers $2,497+]
  Payment → Webhook → Case created (pending) + included CD + IB cases
    → Document upload → Finalize → OCR + classify + extract + analyze jobs
    → Pipeline completion → Operator review → Delivery email
    → Weekly progress emails (War Room + Situation Room)
```

## Tech Stack

| Layer | Technology | Details |
|-------|-----------|---------|
| **Frontend** | Next.js 16.1.6 (App Router) | SSR for SEO, React 19.2.3 for forms, `next-mdx-remote` v6 for blog |
| **Styling** | Tailwind CSS v4 | PostCSS integration (`@tailwindcss/postcss`), no config file |
| **Animation** | framer-motion 12.x | 4 motion components, all respect `prefers-reduced-motion` |
| **Hosting** | Vercel | Auto-deploys on push to master, Edge Functions, Vercel Analytics |
| **Database** | Supabase (PostgreSQL) | 52+ tables across 11 migrations, 2 private storage buckets, Edge Functions |
| **Payments** | Stripe (test mode) | Checkout sessions, webhooks, refunds, upgrade credits |
| **Email** | Resend API | Transactional + drip emails, inbound webhook, CAN-SPAM compliance |
| **AI** | Claude Opus 4.6 + Sonnet 4.6 | Opus (CD generation, extended thinking 16K budget) + Sonnet (IB sections, evaluation) |
| **CI/CD** | GitHub Actions | Backup worker cron for timed-out Edge Function runs |
| **DNS** | Cloudflare | CNAME to Vercel (DNS only, no proxy) |
| **Cron** | cron-job.org (external) | Free alternative to Vercel Pro native cron |
| **Sanitization** | sanitize-html | HTML sanitization for user-generated content |

## Deployment

- **Production:** https://imnotanattorney.com
- **Vercel project:** rahim-kapadias-projects/imnotanattorney
- **GitHub:** github.com/rahim0kapadia/ImNotAnAttorney-web
- **Supabase project:** jxjbjmgdukwkoclydqdr (Kapadia Labs org)

## Environment Variables

| Variable | Used By | Purpose |
|----------|---------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | All API routes | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | All API routes | Full DB access (bypasses RLS) |
| `STRIPE_SECRET_KEY` | checkout, webhook | Stripe API access |
| `STRIPE_WEBHOOK_SECRET` | webhook | Verify Stripe webhook signatures |
| `RESEND_API_KEY` | email.ts | Send transactional emails |
| `RESEND_FROM_EMAIL` | email.ts | Sender address |
| `OPERATOR_EMAIL` | All alert routes | Where operator notifications go |
| `OPERATOR_SECRET` | generate, deliver, evaluate | Auth token for operator-only endpoints + HMAC signing |
| `NEXT_PUBLIC_SITE_URL` | Email links, redirects | Canonical site URL |
| `ANTHROPIC_API_KEY` | Edge function only | Claude API for report generation |
| `CRON_SECRET` | cron/drip | Authenticate cron requests |
| `SUPABASE_ACCESS_TOKEN` | Supabase CLI | Edge function deployment |
| `CRONJOB_API_KEY` | setup script | cron-job.org management |

## Engine Architecture (ImNotAnAttorney-engine)

The engine is a distributed job queue worker that powers ALL discovery-tier processing ($2,497+). It polls the `processing_jobs` table, dispatches to worker modules, and writes results back to shared Supabase.

### Deployment

- **GitHub Actions cron** (`process-jobs.yml`): Runs every 5 minutes
- **Entry:** `node src/worker.mjs --once` (process up to 10 jobs per run, then exit)
- **Continuous mode:** `node src/worker.mjs` (poll loop with 10s interval, for local dev)
- **Node.js ≥20** required

### Job Queue Mechanics

1. **Claim:** `claim_next_job()` Postgres RPC — uses `FOR UPDATE SKIP LOCKED` to prevent double-processing across concurrent workers
2. **Process:** Dynamic import of worker module from registry → `workerModule.default(job)`
3. **Complete:** `completeJob(job.id, summary, itemsProduced)` → schedules downstream jobs
4. **Fail:** `failJob(job.id, errorMessage, metadata)` → marks for retry or creates operator task

### Retry Strategy

Exponential backoff: `4^retryCount × 5 minutes`

| Retry | Delay | Cumulative |
|-------|-------|-----------|
| 1st | 20 minutes | 20 min |
| 2nd | 80 minutes | 100 min |
| 3rd (max) | 320 minutes | 420 min |

Failed jobs with `retry_count < max_retries` (default 3) get `status = 'retrying'` with `next_retry_at` set. `requeueRetryableJobs()` runs at start of each poll cycle, promoting retryable jobs back to `queued`.

### Worker Registry (27 workers across 6 phases)

| Phase | Job Type | Model | Max Tokens | Purpose |
|-------|----------|-------|-----------|---------|
| **1: Document Ingestion** | `ocr` | Haiku | — | PDF/image text extraction (tesseract.js + pdf-parse) |
| | `document_classification` | Haiku | 2,048 | Categorize documents (police report, lab, warrant, etc.) |
| | `entity_extraction` | Haiku | 4,096 | Named entity recognition per document |
| **2: Cross-Document Analysis** | `finding_analysis` | Opus | 32,000 | Case-level findings from all extractions |
| | `red_flags` | Opus | 16,000 | Prosecution weaknesses + constitutional issues |
| | `question_generation` | Opus | 16,000 | Targeted attorney questions from findings |
| | `timeline_reconstruction` | Sonnet | 16,000 | Chronological event reconstruction |
| | `evidence_inventory` | Sonnet | 8,192 | Physical evidence catalog |
| | `chain_of_custody` | Sonnet | 8,192 | Custody chain analysis + gap detection |
| | `witness_identification` | Sonnet | 8,192 | Witness identification from documents |
| | `score_computation` | Sonnet | 4,096 | Defense Strength Score (0-100) |
| **3: Report Generation** | `report_generation` | Opus | 32,000 | Assemble final report (emotional intelligence required) |
| **4: Intelligence Gathering** | `judge_research` | Opus | 16,000 | Judge profiling (rulings, patterns, sentencing) |
| | `prosecutor_research` | Opus | 16,000 | Prosecutor profiling |
| | `witness_dossier_p1` | Opus | 16,000 | Witness intelligence dossiers (Part 1) |
| **5: Strategy** | `motion_analysis` | Opus | 32,000 | Motion landscape + wave strategy |
| | `case_law_research` | Opus | 16,000 | Case law search + Shepardize |
| | `strategy_synthesis` | Opus | 32,000 | Defense strategy + battle plan |
| **6: Trial Intelligence** | `witness_dossier_p2` | Opus | 16,000 | Full witness battle scripts |
| | `cross_exam_script` | Opus | 16,000 | Cross-examination scripts |
| | `trial_material` | Opus | 16,000 | Trial prep materials |
| | `attack_intelligence` | Opus | 16,000 | Attack vectors + impeachment |
| **Ongoing** | `update_generation` | Sonnet | 8,192 | War Room weekly updates |
| **Verification** | `citation_verification` | API-only | 4,096 | Citation verification cascade |
| **Data Fetch** | `docket_fetch` | API-only | — | Court docket retrieval |
| | `legal_research` | API-only | — | Pre-generation legal source search |
| | `jurisdiction_profile` | API-only | — | Jurisdiction context cache |
| | `docket_monitor` | API-only | — | Ongoing docket alerts (War Room+) |

**Model summary:** Haiku for Phase 1 (cheap classification), Sonnet for Phase 2 analysis, Opus for Phases 3-6 (deep reasoning + emotional intelligence). API-only workers have placeholder model entries.

### Pipeline Orchestration

```
Per-document:    ocr ──► document_classification
                    └──► entity_extraction

Convergence 1:   ALL entity_extractions done ──► finding_analysis
                                                  + docket_fetch
                                                  + legal_research
                                                  + jurisdiction_profile

Fan-out:         finding_analysis ──► red_flags ──► question_generation
                                  ├── timeline_reconstruction
                                  ├── evidence_inventory ──► chain_of_custody
                                  └── witness_identification

Convergence 2:   ALL of [question_generation, timeline, custody, witnesses] done
                 ──► score_computation ──► report_generation

Post-report:     report_generation ──► docket_monitor (War Room+ only)
```

**Phase 4-6 workers** (intelligence, strategy, trial) are scheduled by the operator or future automation, not auto-chained from Phase 3.

### Cost Tracking

Every Claude API call is tracked in `job_cost_tracking` table:
- Input tokens, output tokens, cache hits, latency
- Per-model pricing with 90% discount on cache hits
- Aggregation by job type, model, tier, case

### Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `@anthropic-ai/sdk` | ^0.39.0 | Claude API calls |
| `@supabase/supabase-js` | ^2.49.0 | Job queue, case data, results |
| `marked` | ^15.0.0 | Markdown parsing |
| `pdf-parse` | ^1.1.1 | PDF text extraction |
| `puppeteer-core` | ^24.39.1 | Headless browser (web scraping for docket fetch) |
| `sanitize-html` | ^2.14.0 | HTML sanitization |
| `tesseract.js` | ^5.1.0 | OCR (optical character recognition) |

### Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Full DB access |
| `ANTHROPIC_API_KEY` | Yes | Claude API |
| `WORKER_AUTH_TOKEN` | Yes | Auth for `claim_next_job()` RPC |
| `OPERATOR_SECRET` | No | HMAC signing for operator links |
| `OPERATOR_EMAIL` | No | Operator notifications |
| `RESEND_API_KEY` | No | Email sending |
| `COURTLISTENER_API_TOKEN` | No | CourtListener API (graceful degradation) |
| `PACER_LOGIN` / `PACER_PASSWORD` | No | PACER federal court access |
| `JUDYRECORDS_API_KEY` | No | JudyRecords state court access |
| `GOVINFO_API_KEY` | No | GovInfo API (US Code, CFR) |
| `SERPAPI_API_KEY` | No | Google Scholar legal search ($50/mo) |
| `SYSTEM_ROOT` | No | Path to business docs (defaults to `../ImNotAnAttorney/system`) |

All optional API tokens degrade gracefully — workers skip external verification when tokens are absent.

## External Legal Data Sources

The engine integrates with 7 external legal data APIs for citation verification, docket monitoring, and legal research.

| Source | Module(s) | Purpose | Auth | Rate Limit |
|--------|-----------|---------|------|-----------|
| **CourtListener** | `legal-verifier.mjs`, `docket-fetcher.mjs` | Dockets, opinions, judge profiles, financial disclosures, citation verification | Optional token | Per-domain |
| **PACER** | `pacer-fetcher.mjs` | Federal court records (NextGen CSO auth, 2hr TTL) | Login/password | $0.10/page |
| **JudyRecords** | `docket-fetcher.mjs` | State court records | Optional API key | Subscription |
| **GovInfo** | `govinfo-fetcher.mjs` | US Code, CFR, congressional reports, Statutes at Large | API key | Standard |
| **eCFR** | `legal-verifier.mjs` | Code of Federal Regulations (point-in-time snapshots) | Free | Standard |
| **SerpAPI** | `serpapi-legal.mjs` | Google Scholar legal search | API key ($50/mo) | Plan-based |
| **Wex** | `legal-verifier.mjs` | Legal term definitions (Cornell Law) | Free | Standard |

### Citation Verification Cascade

Citations are verified through a priority cascade:

1. **CourtListener** (primary) — search by case name + citation
2. **Harvard CAP** — fallback for historical cases
3. **GovInfo** — for statutory references
4. **eCFR** — for regulatory references

**Confidence tiers:** STRONG (verified in primary source) → MODERATE (verified in secondary) → WEAK (partial match) → UNVERIFIED (no match found) → FABRICATED (contradicted by source). Claims below 90% confidence are marked `[VERIFY]` in output.

## Anti-Hallucination Architecture

Every Claude API call in the system includes anti-hallucination guardrails. Source: `ImNotAnAttorney/system/`.

### Seed Data (5 JSON files)

| File | Contents | Purpose |
|------|----------|---------|
| `motion-library.json` | 30+ motions with legal basis + attorney attribution | Prevents hallucinated motion names |
| `penalty-ranges.json` | Charge-specific sentencing ranges from actual statutes | Prevents fabricated statistics |
| `statute-references.json` | Statute citations with verification metadata | Prevents fake statute numbers |
| `diversion-programs.json` | State-by-state diversion eligibility | Prevents wrong eligibility claims |
| `speedy-trial-rules.json` | State-specific speedy trial timelines | Prevents wrong deadline claims |

### Anti-Hallucination Block (injected in every Claude call)

6 rules enforced in prompt templates:
1. Never cite a case, statute, or rule without verification against seed data
2. Never fabricate statistics, percentages, or specific numbers
3. Never attribute a legal strategy to an expert not in the verified roster
4. Mark any claim below 90% confidence with `[VERIFY]`
5. Use qualitative language ("many jurisdictions" not "73% of jurisdictions")
6. Convert specific claims to attorney questions when uncertain

### Expert Attribution

Every analytical insight must trace to a verified expert from the Expert Reference System. The `Victor Knapp` incident (March 2026) — a fabricated DUI attorney name that appeared in playbooks, blog posts, and checkout pages — led to the policy: **every expert cited in customer-facing content must exist in EXPERT-REFERENCE.md and be web-verified before first use.**

### Banned Terminology (16 entries)

| Banned | Replacement |
|--------|-------------|
| "red flag" | "what to listen for" |
| "warning sign" | "what to listen for" |
| "escalation ladder" | "Your Advocacy Steps" |
| "you need to" | "here's your next step" / "you can" |
| "you should" | "you can" / "consider" |
| "we recommend" | "consider" |
| "we advise" | "consider" |
| "your best option" | (reframe as question for attorney) |
| "you indicated" | "you told us" |
| "you reported" | "you mentioned" |
| "you selected" | "you shared" |

## Expert Reference System

63+ verified .01% experts across defense law, psychology, and marketing. Source: `ImNotAnAttorney/system/EXPERT-REFERENCE.md`.

### Expert Categories

| Category | Count | Key Names |
|----------|-------|-----------|
| DUI/DWI Defense | 4 | Lawrence Taylor, William "Bubba" Head, Justin McShane, Steven Oberman |
| Drug Defense | 4 | Jeffrey Lichtman, Ron Chapman II, Jose Baez, Dick DeGuerin |
| Sex Offense Defense | 3 | Specialists with 30-40 year track records |
| White Collar/Fraud | 3 | Martin Weinberg, David Smith, Cristina Arguedas |
| Self-Defense | 3 | Andrew Branca, Mark O'Mara, Don West |
| Federal Criminal | 5 | Alan Ellis, Carmen Hernandez, Mark Allenbaugh, David Oscar Markus, Andrew Birrell |
| Cross-Cutting Trial | 12+ | Benjamin Brafman, Tom Mesereau, Gerry Spence, Bryan Stevenson, Mark Geragos |
| Probation/Parole | 3 | Fiona Doherty, Vincent Schiraldi, Adam Foss |
| Legal Design | 3 | Margaret Hagan, Paul Bergman, Robin Steinberg |
| Intelligence Analysis | 2 | Richards Heuer (ACH methodology), Randolph Pherson |
| Psychology Tier 1 | 5 | Judith Herman, Albert Bandura, Martin Seligman, Kim Witte, BJ Fogg |
| Psychology Tier 2-3 | 10 | Chris Voss, George Lakoff, Daniel Kahneman, Richard Thaler, Raj Jayadev |
| Marketing | 9 | Alex Hormozi, Russell Brunson, Sabri Suby, Andre Chaperon, Eugene Schwartz |
| System Truth Critics | 7 | Amy Bach, Alexandra Natapoff, Mark Godsey, Norm Pattis |

### Tier-Based Expert Loading

| Tier | Expert Depth | Framework |
|------|-------------|-----------|
| Playbook ($97) | 2-3 expert frameworks visible | Charge-specific |
| Case Decoder ($197) | Charge-type routing to specific experts | Per-charge expert pair |
| Intelligence Brief ($997) | 5-7 frameworks | Spence, Mesereau, Younger, Pozner, MacCarthy + charge-specific |
| X-Ray ($2,497) | Forensic + evidence experts | Scheck, Garrett, ACH methodology (Heuer/Pherson) |
| War Room ($4,997) | Full routing table | Brafman (jury), Berke (strategy), Birrell (contradictions), Vishny (motions) |
| Situation Room ($9,997) | Trial legends | Dimitrius (voir dire), Markus (briefs), full Pozner-Dodd chapter method |

## Emotional Intelligence Architecture

8-dimension emotional profiling framework required for report generation. Source: `ImNotAnAttorney/system/EMOTIONAL-INTELLIGENCE.md`.

**Why Opus 4.6 with extended thinking is required:** Sonnet 4.6 produced "mechanical emotional calibration" — correct format but emotionally flat. Opus uses the 16K thinking budget to build the 8-dimension profile internally before writing, producing calibrated emotional tone.

### 8 Emotional Dimensions

| # | Dimension | What It Captures |
|---|-----------|-----------------|
| 1 | Primary Fear | What they're MOST afraid of losing (career, prison, family, financial, reputation) |
| 2 | Emotional Stance | Processing style: Minimizer / Catastrophizer / Intellectualizer / Dissociater |
| 3 | Attorney Relationship as Wound | Abandonment / Betrayal / Kept in Dark |
| 4 | Hope Signal | What they hope is true (mirror and build on it) |
| 5 | Isolation Level | Support network or carrying alone? |
| 6 | Charge-Specific Pattern | 7 charge types × emotional response calibration |
| 7 | Co-Defendant Dynamic | Betrayal fear, cooperation pressure |
| 8 | Reading Arc Awareness | 10-stage cumulative emotional journey through report |

### Stance Calibration

| Stance | Signals | Bridging After Hard Info |
|--------|---------|------------------------|
| **Minimizer** | "Not that big a deal" | Ground in what they CAN control |
| **Catastrophizer** | "Ruin my life" | "This is RANGE, not prediction" |
| **Intellectualizer** | Precise legal questions | "Question for attorney is your specific facts" |
| **Dissociater** | Flat affect, "whatever" | Direct fact → action (skip emotion) |

### Psychological Frameworks

| Framework | Author | Application |
|-----------|--------|------------|
| EPPM (Extended Parallel Process Model) | Kim Witte | 2:1 efficacy-to-threat ratio — always more "you can" than "you face" |
| B=MAP (Behavior = Motivation × Ability × Prompt) | BJ Fogg | Scared defendants = HIGH motivation + ZERO ability → increase ability |
| Participatory Defense | Raj Jayadev | Defendant = prepared partner, not passive recipient |
| Calibrated Questioning | Chris Voss | Questions sound like CLIENT asking for help, not lawyer playing lawyer |

### 10-Stage Reading Arc

The report is designed as a cumulative emotional journey, not isolated sections:

1. **Letter** → Relief ("Someone heard me")
2. **Where Things Stand** → Clarity
3. **Understanding Charges** → Knowledge (anxiety spike from penalty ranges)
4. **Communication Tools** → Empowerment (absorbs anxiety spike)
5. **Questions** → Agency ("I can DO something")
6. **Things Worth Asking** → Focus
7. **Something We Missed** → Trust ("They care")
8. **What Only Your Attorney Can Tell You** → Honest redirect
9. **Your Next 7 Days** → Determination (emotional climax)
10. **What Comes Next** → Natural next step

### Self-Verification (38-point checklist)

15 checks are critical for ALL tiers, including: all sections present, no banned terminology, warm language in diagnostic tables, no attorney blame, upgrade language restricted to postscript, 2:1 efficacy-to-threat ratio, stance-calibrated tone.

## Buyer States Framework

6 active states that drive report framing. Source: `ImNotAnAttorney/system/BUYER-STATES.md`. Evaluation criterion D11 checks buyer state alignment.

| State | Signal | Need | Anti-Pattern |
|-------|--------|------|-------------|
| **distrust** — "I Don't Trust My Attorney" | Trust/competence doubts in intake | Independent validation | "Your attorney knows best" (dismisses instinct) |
| **double-checking** — "I'm Double-Checking What He Said" | Substantive attorney_statements, uncertainty not anger | Context to evaluate | Undermining attorney when they're actually right |
| **information-vacuum** — "He's Not Telling Me Anything" | Communication gap >2 weeks, ghosting | Fill the information vacuum | "Just keep trying to reach them" without providing info |
| **no-attorney** — "No Attorney Yet" | attorney_type = "no attorney" | Understand case before hiring | Assuming attorney relationship exists |
| **just-arrested** — "I Just Got Arrested" | arrest_date < 2 weeks | Orientation + 3 immediate actions | 25 pages of analysis when they need 3 actions |
| **family-buyer** (future) | filled_out_by = "family" / "friend" | Actionable ways to help | Assuming reader IS defendant |

## Content Architecture Standard

11 principles every customer-facing deliverable must satisfy. Source: `ImNotAnAttorney/system/CONTENT-ARCHITECTURE-STANDARD.md`.

| # | Principle | Rule |
|---|-----------|------|
| 1 | Crisis Response First | First thing scared person sees must be actionable, not context |
| 2 | Origin Story Early | "Built by defendant who went through it" within first page |
| 3 | Triage Before Depth | 3-5 path decision tree before content (Golden Question, ADDRESS FIRST) |
| 4 | Dual Communication | Email template (copy-paste) + Phone script (read-aloud) + Follow-up |
| 5 | Mobile-First | Tables max 2 columns, no horizontal scroll at 375px |
| 6 | Table Pacing | Max 2 consecutive tables without 1-2 sentence bridges |
| 7 | Plain English Always | Define every legal term on first use, parenthetical inline |
| 8 | Tribe Signal | Reader finishes feeling FOUND: "Defendants who prepare instead of wait" |
| 9 | Family Buyer Acknowledgment | One sentence: "If you're reading for spouse/child/friend..." |
| 10 | No-Attorney Reframe | One sentence: "No attorney yet? Use Scorecard to evaluate" |
| 11 | Emotional Peak Upsells | CTAs at moments of resonance, honest factual limits |

**Audit protocol:** Score all 11, then 3-persona review: Hormozi (Value Equation), Suby (Readability + Conversion), Godin (Remarkability + Tribe).

## Client Journey

Per-tier customer experience timeline. Source: `ImNotAnAttorney/system/CLIENT-JOURNEY.md`.

### Journey Timeline

| Milestone | $197 CD | $997 IB | $2,497 X-Ray | $4,997 War Room | $9,997 Sit Room |
|-----------|---------|---------|--------------|-----------------|-----------------|
| Signup → first deliverable | 48 hrs | 48 hrs | 3-5 days | 3-5 days | 24-48 hrs |
| Full initial package | 48 hrs | 48 hrs | 10 biz days | 25-28 days | 14-21 days |
| Discovery required? | No | No | Yes | Yes | Yes |
| Ongoing updates | None | None | None | Weekly | Trial Ops |
| Human review time | 15-20 min | 2-3 hrs | 2-3 hrs | 12-16 hrs | 22-28 hrs |
| Communication | Email | Email | Email | Dashboard + email | Priority channel |

### 8 Key Emotional Moments

1. **"Someone finally explained my charges"** — Case Decoder delivery
2. **"Now I know my judge"** — Intelligence Brief delivery
3. **"Someone finally organized my case"** — Document index + timeline
4. **"I didn't know this was in MY OWN discovery"** — Discrepancies + red flags
5. **"Now I know what to ask"** — Targeted questions for attorney
6. **"My lawyer was impressed"** — Hand over attorney package
7. **"I understand what's happening in my case"** — Strategy framework clicks
8. **"I'm not going in blind"** — Trial prep materials arrive

### Dashboard Features by Tier

| Feature | $197 | $997 | $2,497 | $4,997 | $9,997 |
|---------|------|------|--------|--------|--------|
| Download reports | PDF | PDF | Yes | Yes | Yes |
| Interactive timeline | — | — | — | Yes | Yes |
| Witness map | — | — | — | Yes | Yes |
| Motion tracker | — | — | — | Yes | Yes |
| Trial Intelligence Ops | — | — | — | — | Yes |
| Priority support | — | — | — | — | Yes |

### Upgrade Credit Messaging

Each tier delivery includes upgrade pitch with credit pre-calculated:
- CD delivery → "Upgrade to Brief — your $197 is applied. Pay only $800."
- IB delivery → "Upgrade to X-Ray — your $997 is applied. Pay only $1,500."
- X-Ray delivery → "Upgrade to War Room — your $2,497 is applied. Pay only $2,500."
- War Room (trial approaching) → "Upgrade to Situation Room — pay only $5,000."

## Architecture Patterns

Six core patterns used throughout the codebase:

### 1. Fire-and-Forget Delegation

API routes validate + perform atomic state change, then POST to Edge Functions without await. Keeps response time <500ms. The Edge Function runs asynchronously; if it fails, cron Parts 5/5b detect stuck cases.

**Used by:** `generate/case-decoder`, `generate/intelligence-brief`, `evaluate/case-decoder`, webhook generation triggers.

### 2. Atomic Claim-Then-Email

Conditional UPDATE with WHERE clause as database-level mutex. The UPDATE happens BEFORE the email send. Losing request gets zero rows updated, returns early. Prevents duplicate emails from concurrent requests.

```sql
-- Example: deliver route claims the case atomically
UPDATE cases SET status = 'delivered', delivered_at = now()
WHERE id = $1 AND status = 'review'
RETURNING *;
-- If 0 rows returned → another request already delivered → return early
```

**Used by:** deliver route, generation triggers, cron parts.

### 3. Email Retry with Operator Fallback

First attempt (rich HTML) → 2s delay → retry (simplified HTML) → operator alert with report URL for manual forwarding. Case status already updated so report URL works even without email.

**Used by:** All email-sending routes via `sendEmailWithRetry()`.

### 4. Idempotency via Status Checks + Unique Constraints

Status-based check first (skip if already processing), then atomic guard (DB-level). Stripe webhook retries return 200 on duplicate `stripe_session_id` (PostgreSQL error code 23505 = unique violation).

**Used by:** webhook handler, cron parts, generation dispatchers.

### 5. HMAC Token Signing

Operator delivery links use `signOperatorToken(caseId)` with 24h TTL. Phase 2 intake links use `signPhase2Token(caseId)` with 30-day TTL. Prevents secrets in browser history, server logs, or email preview services.

**Token format:** `"timestamp.hmac_hex"` where payload = `"${caseId}:${timestamp}"`, signed with HMAC-SHA256 using `OPERATOR_SECRET`. Verification uses constant-time comparison (XOR loop).

**Source:** `src/lib/site.ts` (signOperatorToken, signPhase2Token, verifyOperatorToken, verifyPhase2Token).

### 6. Score-Band Routing

Subscribers who complete the Defense Milestone Score get `score_band` stored on their subscriber record. Cron Part 1 routes them to band-specific drip sequences FIRST, then falls through to standard nurture with a day offset. Crisis/Concerning get urgency sequences; Adequate/Excellent get validation.

## Middleware & Security

### CSP Nonce Generation

`src/middleware.ts` generates a per-request nonce via `Buffer.from(crypto.randomUUID()).toString("base64")` and injects it into the CSP header. The nonce is passed to Next.js via `x-nonce` request header.

**CSP Policy:**
```
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

### Route Protection

| Pattern | Auth Method | Header |
|---------|-----------|--------|
| `/api/admin/*` | Password + timing-safe comparison | `x-admin-password` |
| `/api/operator/*` | Password + timing-safe comparison | `x-admin-password` |
| `/api/generate/*` | Bearer token (OPERATOR_SECRET) | `Authorization: Bearer ...` |
| `/api/evaluate/*` | Bearer token (OPERATOR_SECRET) | `Authorization: Bearer ...` |
| `/api/deliver` | Bearer token (OPERATOR_SECRET) | `Authorization: Bearer ...` |
| `/api/cron/*` | Bearer token (CRON_SECRET) | `Authorization: Bearer ...` |

### Rate Limiting

PostgreSQL-based via `check_rate_limit()` RPC with `rate_limits` table. TypeScript wrapper in `src/lib/rate-limit.ts` with in-memory fallback if RPC fails (fail closed: 10 req/min).

| Endpoint | Limit | Window |
|----------|-------|--------|
| `/api/checkout` | 10 requests | 300s per IP |
| `/api/score` | 10 requests | 60s per IP |
| `/api/intake` | 5 requests | 300s per IP |

### Security Headers

Configured in `next.config.ts`:
- `Strict-Transport-Security` — HSTS with preload
- `X-Content-Type-Options: nosniff` — Prevent MIME sniffing
- `X-Frame-Options: DENY` — Prevent clickjacking
- `Referrer-Policy: strict-origin-when-cross-origin` — Limit referrer leakage

### Storage Buckets

| Bucket | Access | Contents |
|--------|--------|----------|
| `charge-packs` | Private | Playbook PDFs (8 tiers), served via signed URLs |
| `discovery-files` | Private | Customer uploads (X-Ray+), auto-deleted 90 days post-delivery |

### Upload Security (Discovery Files)

- Email ownership verification (request email must match case.email)
- Server-side MIME validation + magic byte validation (prevents content-type spoofing)
- File size limit: 50 MB per file
- Storage path sanitization (prevents path traversal)
- MIME allowlist: PDF, images, text, Word, audio, video

## Database Schema

### Core Tables

#### `orders`

| Column | Type | Purpose |
|--------|------|---------|
| id | uuid (PK) | Auto-generated |
| email | text | Customer email (lowercased) |
| tier | text | Product tier slug |
| amount | integer | Amount in cents |
| status | text | `paid` / `refunded` |
| stripe_session_id | text (unique) | Prevents duplicate webhook processing |
| stripe_payment_intent_id | text (indexed) | For refund matching |
| upgrade_credit_applied | integer | Credits from prior purchases (cents) |
| paid_at | timestamptz | Payment timestamp |
| refunded_at | timestamptz | Refund timestamp (null if not refunded) |
| priority_delivery | boolean | Priority add-on purchased |
| court_date | text | Customer's next court date |
| consent_timestamp | text | Consent for $2,497+ tiers |
| product_type | text | `service` or `digital-product` |
| download_token | uuid | Playbook download token |
| download_token_expires_at | timestamptz | 72h download window |
| download_count | integer | Number of downloads |

#### `cases`

| Column | Type | Purpose |
|--------|------|---------|
| id | uuid (PK) | Set by webhook (crypto.randomUUID) |
| order_id | uuid (FK) | Links to orders table |
| email | text | Customer email |
| tier | text | Product tier |
| status | text | See state machine below |
| intake_id | uuid (FK) | Links to intakes table |
| charge_type | text | From intake |
| report_html | text | Generated HTML report |
| report_token | uuid | URL-safe token for report access |
| generated_at | timestamptz | When report was generated |
| delivered_at | timestamptz | When report was delivered |
| reviewed_by | text | Who approved delivery |
| reviewed_at | timestamptz | When approved |
| deliverable_url | text | Full report URL |
| file_urls | text[] | Discovery file storage paths |
| eval_results | jsonb | Evaluation scorecard (UPL + Psych teams) |
| buyer_states | jsonb | Detected buyer states from intake |
| review_reminder_sent | boolean | Prevents duplicate review reminders |
| report_token_expires_at | timestamptz | 12-month report access expiry |
| is_included_deliverable | boolean | `true` for auto-created lower-tier cases |
| parent_order_id | uuid (FK) | Links included case back to source order |
| court_case_number | text | Court-assigned case number |
| court_state | text | Jurisdiction state |
| court_county | text | County within state |
| docket_fetched_at | timestamptz | When docket data was last fetched |
| docket_source | text | `courtlistener`, `judyrecords`, `clerk_portal`, `none` |
| docket_entry_count | integer | Number of docket entries fetched |
| section_outputs | jsonb | IB Phase A/B section outputs for cross-referencing |
| judge_research_data | jsonb | Judge research data (optional, v4) |
| prior_case_id | uuid | Links to customer's prior Case Decoder |
| phase_a_completed_at | timestamptz | IB Phase A completion timestamp |
| phase_b_completed_at | timestamptz | IB Phase B completion timestamp |
| delivery_due_at | timestamptz | SLA deadline for delivery |
| next_update_due_at | timestamptz | War Room/Situation Room next update |
| phase | text | Current processing phase |
| phase_started_at | timestamptz | When current phase started |
| document_count | integer | Number of uploaded discovery documents |
| finding_count | integer | Number of findings extracted |
| witness_count | integer | Number of witnesses identified |
| discovery_health_score | integer | 0-100 discovery health rating |
| defense_opportunity_index | jsonb | Multi-dimensional opportunity scoring |
| upgrade_order_ids | uuid[] | Orders that used upgrade credits from this case |
| data_retention_until | timestamptz | Data retention deadline |
| data_purged_at | timestamptz | When data was purged |
| purge_reason | text | Why data was purged |
| operator_notes | text | Free-text operator notes |
| updated_at | timestamptz | Auto-updated via trigger |

#### `intakes`

| Column | Type | Purpose |
|--------|------|---------|
| id | uuid (PK) | Auto-generated |
| email | text | Customer email (lowercased, trimmed) |
| first_name | text | Customer's first name |
| last_name | text | Optional |
| charge_type | text | Primary charge |
| state | text | Jurisdiction state |
| phase2_data | jsonb | IB-specific fields (judge, attorney, hearing details) |
| ... | ... | 15+ additional charge-specific fields (see intake/route.ts) |

#### `subscribers`

| Column | Type | Purpose |
|--------|------|---------|
| id | uuid (PK) | Auto-generated |
| email | text (unique) | Subscriber email |
| source | text | How they subscribed (`blog`, `checkout`, `score`, `lead-capture`, `dui-72-hours`, `score-page`, `resources`) |
| score_band | text | `Critical` / `Concerning` / `Average` / `Adequate` / `Excellent` |
| score_value | integer | Raw score (0-100) from Defense Milestone Score |
| charge_type | text | Charge type from score quiz |
| unsubscribed_at | timestamptz | CAN-SPAM: null = active |
| created_at | timestamptz | Subscription date |

#### `drip_emails`

| Column | Type | Purpose |
|--------|------|---------|
| subscriber_id | uuid (FK) | Links to subscribers |
| email_key | text | Unique key per email template |
| created_at | timestamptz | When sent |
| **Unique constraint** | `(subscriber_id, email_key)` | Prevents duplicate sends |

### Reference Data Tables (12 tables — Migration 004)

Source of truth for structured data previously scattered across 10+ markdown files. Seeded via `scripts/seed/run-all-seeds.mjs`.

| Table | Rows | Purpose |
|-------|------|---------|
| `experts` | 63 | .01% expert roster (attorneys, psychology, marketing) |
| `eval_criteria` | 58 | 5-team evaluation criteria with `applicable_tiers` and `charge_types` |
| `pipeline_eval_weights` | 40 | Per-pipeline team weights (GATE/HIGH/MEDIUM/LOW) |
| `buyer_states` | 6 | Why defendants buy (distrust, double-checking, information-vacuum) |
| `content_pain_points` | 20 | Reddit/Avvo defendant pain points with SEO data |
| `content_assets` | 15 | Ready-to-post content (email teasers, Reddit, Twitter) |
| `intake_questions` | 40 | Charge-specific intake questions (10 types x 4 questions) |
| `tiers` | 15 | Product tiers with pricing, delivery, features |
| `charge_types` | 21 | Charge type catalog with expert mappings |
| `content_posts` | 23 | Blog post catalog with subreddit targeting |
| `subreddits` | 5 | Subreddit profiles (rules, best post times) |
| `emotional_profiles` | 33 | Emotional calibration (fears, stances, attorney wounds, banned terms) |

All reference tables have `created_at`, `updated_at` (auto-trigger), and `active` boolean for soft-delete.

### Operational Tables

#### `email_log` (Migration 005)

Tracks all email send calls. Fire-and-forget logging — insert failures never crash the calling route.

| Column | Type | Purpose |
|--------|------|---------|
| id | uuid (PK) | Auto-generated |
| email_type | text | Category (`payment-confirmation`, `drip-nurture`, `operator-alert`) |
| recipient | text | Email address |
| case_id | uuid | Associated case (nullable) |
| order_id | uuid | Associated order (nullable) |
| tier | text | Product tier (nullable) |
| subject | text | Email subject line |
| status | text | `sent` / `failed` |
| error | text | Error message if failed |
| metadata | jsonb | Extra context (template key, retry count) |
| route_source | text | Which API route sent it |
| sent_at | timestamptz | Timestamp |

#### `audit_runs` (Migration 004)

| Column | Type | Purpose |
|--------|------|---------|
| id | uuid (PK) | Auto-generated |
| report_source | text | Source identifier (file path or persona name) |
| charge_type | text | Charge type evaluated |
| tier | text | Product tier |
| model_used | text | Claude model used |
| team_results | jsonb | Per-team pass/fail/needs_work breakdown |
| total_pass / total_fail / total_needs_work | integer | Aggregate counts |
| gate_passed | boolean | Whether UPL gate passed |
| created_at | timestamptz | When run completed |

#### `cron_runs`

| Column | Type | Purpose |
|--------|------|---------|
| id | uuid (PK) | Auto-generated |
| started_at | timestamptz | When cron started |
| completed_at | timestamptz | When cron finished |
| parts_run | integer | How many parts executed |
| errors | text[] | Any errors encountered |

#### `rate_limits` (Migration 004)

| Column | Type | Purpose |
|--------|------|---------|
| key | text (PK) | Rate limit identifier (e.g., `checkout:192.168.1.1`) |
| window_start | timestamptz | Current window start |
| request_count | integer | Requests in current window |

#### `counters` (Migration 012)

Generic atomic counter infrastructure for the Defense Accountability Index.

| Column | Type | Purpose |
|--------|------|---------|
| id | text (PK) | Counter identifier (e.g., `score_completions`) |
| value | bigint | Current count |
| updated_at | timestamptz | Last increment time |

#### `score_aggregates` (Migration 012)

Anonymous aggregate tracking from Defense Milestone Score. NO individual answers stored.

| Column | Type | Purpose |
|--------|------|---------|
| charge_type | text (PK part) | Charge category |
| metric | text (PK part) | What's being counted |
| count | bigint | Aggregate count |

**Tracked metrics:** `total_by_charge`, `no_motions_filed`, `never_seen_discovery`, `communication_never`, `no_strategy_discussion`.

#### `docket_entries` (Migration 011)

Court docket data from external sources (CourtListener, JudyRecords, clerk portals).

| Column | Type | Purpose |
|--------|------|---------|
| id | uuid (PK) | Auto-generated |
| case_id | uuid (FK) | Links to cases table |
| entry_date | date | When filed |
| entry_text | text | Description |
| entry_type | text | `order`, `motion`, `hearing`, `filing`, `notice`, `other` |
| filed_by | text | `court`, `defense`, `prosecution`, `clerk`, `unknown` |
| sequence_number | integer | Order within the docket |
| source | text | `courtlistener`, `judyrecords`, `clerk_portal`, `manual` |
| source_url | text | URL to source record |
| raw_data | jsonb | Raw API response |
| is_hearing | boolean | Whether this is a hearing |
| hearing_type | text | `trial`, `motion`, `status`, `pretrial`, `sentencing` |
| hearing_result | text | `continued`, `denied`, `granted`, `held` |
| created_at / updated_at | timestamptz | Timestamps |

#### `charge_packs` (Migration 006)

| Column | Type | Purpose |
|--------|------|---------|
| id | uuid (PK) | Auto-generated |
| tier_slug | text | Links to tier (e.g., `dui-first-offense`) |
| file_path | text | Storage path in `charge-packs` bucket |
| file_name | text | Display name |
| file_size | integer | Size in bytes |
| version | integer | Version number |
| active | boolean | Current version flag |

### Discovery & Analysis Tables (Migration 007-008, 010)

#### `discovery_documents`

| Column | Type | Purpose |
|--------|------|---------|
| id | uuid (PK) | Auto-generated |
| case_id | uuid (FK) | Links to cases |
| file_name | text | Original filename |
| file_type | text | MIME type |
| file_size | integer | Size in bytes |
| storage_path | text | Path in discovery-files bucket |
| category | text | Document classification |
| ocr_status | text | `pending`, `processing`, `completed`, `failed` |
| page_count | integer | Number of pages |
| uploaded_at | timestamptz | Upload timestamp |

#### `timeline_events`

Extracted timeline from discovery documents.

| Column | Type | Purpose |
|--------|------|---------|
| case_id | uuid (FK) | Links to cases |
| event_date | date | When the event occurred |
| event_text | text | Description |
| involved_parties | text[] | People involved |
| date_confidence | text | `exact`, `approximate`, `inferred` |
| source_document_id | uuid (FK) | Which document this came from |

#### `case_analysis_results`

X-Ray analysis output.

| Column | Type | Purpose |
|--------|------|---------|
| case_id | uuid (FK) | Links to cases |
| discrepancies | jsonb | Contradictions found |
| red_flags | jsonb | Prosecution weaknesses |
| opportunities | jsonb | Defense opportunities |
| scores | jsonb | Discovery Strength Rating + DOI |

#### `case_witnesses`

| Column | Type | Purpose |
|--------|------|---------|
| case_id | uuid (FK) | Links to cases |
| name | text | Witness name |
| type | text | Witness type |
| agency | text | Associated agency |
| credibility_score | integer | 0-100 credibility rating |
| threat_level | text | Threat assessment |
| dossier_status | text | Research status |
| cross_exam_ready | boolean | Whether cross-exam prep is complete |

#### `case_findings`

Categorized findings: 4 types x 5 categories x 4 severity levels.

| Column | Type | Purpose |
|--------|------|---------|
| case_id | uuid (FK) | Links to cases |
| title | text | Finding title |
| type | text | Finding type |
| category | text | Finding category |
| severity | text | `critical`, `major`, `minor`, `info` |
| verification_status | text | Verification state |

#### `evidence_items` + `evidence_custody`

Chain of custody tracking with gap detection.

| Table | Key Columns | Purpose |
|-------|-------------|---------|
| `evidence_items` | case_id, item_id, description | Physical evidence catalog |
| `evidence_custody` | evidence_item_id, transfer_date, from_party, to_party, verified | Transfer chain + gap detection |

#### `case_law_references`

| Column | Type | Purpose |
|--------|------|---------|
| case_id | uuid (FK) | Links to cases |
| case_name | text | Case citation name |
| citation | text | Legal citation |
| court | text | Court that decided |
| year | integer | Year decided |
| is_binding | boolean | Binding in this jurisdiction |
| is_good_law | boolean | Still good law (not overturned) |

#### `motion_recommendations`

| Column | Type | Purpose |
|--------|------|---------|
| case_id | uuid (FK) | Links to cases |
| motion_type | text | Type of motion |
| motion_name | text | Display name |
| severity | text | Priority level |
| status | text | Recommendation status |
| strategic_score | integer | Strategic importance score |

#### `trial_materials`

Situation Room trial prep documents.

| Column | Type | Purpose |
|--------|------|---------|
| case_id | uuid (FK) | Links to cases |
| material_type | text | Type of material |
| content | text | Material content |

#### `processing_jobs` (Migration 007)

Background job queue for discovery pipeline.

| Column | Type | Purpose |
|--------|------|---------|
| id | uuid (PK) | Auto-generated |
| case_id | uuid (FK) | Links to cases |
| job_type | text | `ocr`, `classify`, `extract`, `analyze`, `timeline`, `witness`, `citation`, `motion`, `report` |
| status | text | `queued`, `processing`, `completed`, `failed` |
| progress | integer | 0-100 percentage |
| items_produced | integer | Output count |
| retries | integer | Retry count |
| priority | integer | 1 = highest |
| started_at | timestamptz | Processing start |
| completed_at | timestamptz | Processing end |
| error | text | Error if failed |

#### `operator_tasks` (Migration 007)

| Column | Type | Purpose |
|--------|------|---------|
| id | uuid (PK) | Auto-generated |
| case_id | uuid (FK) | Links to cases |
| title | text | Task description |
| type | text | `pipeline_monitoring`, `sla_breach`, `engine_down`, etc. |
| priority | text | `LOW`, `MEDIUM`, `HIGH`, `URGENT` |
| priority_rank | integer | Sort order (1 = first) |
| status | text | `open`, `in_progress`, `completed`, `dismissed` |
| due_at | timestamptz | SLA deadline |
| assigned_to | text | Operator assignment |

### Admin/Demand Tables (Migration 010)

#### `inbound_emails`

Resend inbound webhook storage.

| Column | Type | Purpose |
|--------|------|---------|
| id | uuid (PK) | Auto-generated |
| from_email | text | Sender |
| subject | text | Subject line |
| body_text | text | Plain text body |
| body_html | text | HTML body |
| message_id | text | RFC 2822 Message-ID |
| read | boolean | Read status |

#### `emerging_topics`

| Column | Type | Purpose |
|--------|------|---------|
| id | uuid (PK) | Auto-generated |
| topic | text | Topic phrase |
| post_count | integer | Number of posts detected |
| status | text | `detected`, `promoted`, `dismissed` |
| urgency | text | Urgency level |
| engagement | integer | Engagement score |
| first_seen_at | timestamptz | When first detected |

#### `content_gaps`

| Column | Type | Purpose |
|--------|------|---------|
| id | uuid (PK) | Auto-generated |
| slug | text | Suggested URL slug |
| suggested_title | text | Article title |
| gap_score | integer | Priority score |
| demand_score | integer | Demand level |
| quadrant | text | Gold Mine / Red Ocean / Risky Bet / Dead Zone |
| status | text | `identified` → `queued` → `in-progress` → `published` / `declined` |

#### `demand_scores`

| Column | Type | Purpose |
|--------|------|---------|
| charge_type | text | Charge or pain point |
| dimension | text | `charge_type` or `pain_point` |
| window | text | `7d`, `30d`, `90d` |
| demand_score | integer | Demand level |
| competition_score | integer | Competition level |

#### `content_performance`

| Column | Type | Purpose |
|--------|------|---------|
| blog_slug | text | Blog post identifier |
| subscriber_signups | integer | Attributed signups |
| orders_attributed | integer | Attributed orders |
| revenue_attributed | integer | Attributed revenue (cents) |

#### `discovered_subreddits`

| Column | Type | Purpose |
|--------|------|---------|
| subreddit | text | Subreddit name |
| subscriber_count | integer | Subreddit subscribers |
| relevance_score | integer | Relevance to business |
| description | text | Subreddit description |
| status | text | `pending`, `approved`, `rejected` |

### Engine-Specific Tables

Tables used by the ImNotAnAttorney-engine worker pipeline (not in web app code):

| Table | Purpose |
|-------|---------|
| `document_pages` | OCR page-level output (text per page) |
| `entity_extractions` | Named entity recognition results per document |
| `finding_sources` | Source document linkage for each finding |
| `evidence_inventory` | Evidence catalog (engine's detailed version) |
| `chain_of_custody_records` | Custody chain analysis with gap detection |
| `case_persons` | Role-based person registry (witness/judge/prosecutor) |
| `case_analysis_scores` | Defense Strength Score (0-100) computation |
| `case_monitoring` | CourtListener docket alerts (War Room+ ongoing monitoring) |
| `job_cost_tracking` | Claude API cost per job (input/output tokens, cache hits, latency) |
| `legal_citations` | Citation verification results (confidence tier, source, verified date) |
| `jurisdiction_profiles` | Jurisdiction context cache (local rules, court procedures) |
| `verified_case_law` | Verified case law with Shepardize status |

### Database RPCs

| RPC | Purpose |
|-----|---------|
| `increment_counter(p_id TEXT)` | Atomic counter increment with upsert, returns new value |
| `increment_score_aggregate(p_charge_type TEXT, p_metric TEXT)` | Atomic aggregate increment with upsert |
| `check_rate_limit(p_key TEXT, p_max_requests INT, p_window_seconds INT)` | Sliding window rate limiter, returns boolean (true = allowed) |
| `cleanup_rate_limits()` | Removes expired rate limit entries |
| `acquire_cron_lock(p_lock_id INT)` | PostgreSQL advisory lock for cron dedup |
| `release_cron_lock(p_lock_id INT)` | Release advisory lock |
| `append_file_url(p_case_id UUID, p_url TEXT)` | Atomic array append to cases.file_urls |

### Database Indexes

| Index | Table(Column) | Purpose |
|-------|--------------|---------|
| `idx_orders_stripe_payment_intent` | orders(stripe_payment_intent_id) | Refund webhook matching |
| `idx_cases_court_lookup` | cases(court_case_number, court_state) | Cross-email identity matching |
| `idx_email_log_type` | email_log(email_type) | Email audit queries |
| `idx_email_log_recipient` | email_log(recipient) | Per-recipient lookups |
| `idx_email_log_case` | email_log(case_id) | Per-case email history |
| `idx_email_log_sent` | email_log(sent_at) | Time-range queries |
| `idx_docket_case` | docket_entries(case_id) | Case docket lookups |
| `idx_docket_date` | docket_entries(case_id, entry_date DESC) | Chronological docket |
| `idx_docket_hearings` | docket_entries(case_id) WHERE is_hearing = true | Hearing-only queries |
| `idx_discovery_docs_case` | discovery_documents(case_id) | Per-case document list |
| `idx_findings_case` | case_findings(case_id) | Per-case findings |
| `idx_evidence_case` | evidence_items(case_id) | Per-case evidence |
| `idx_custody_item` | evidence_custody(evidence_item_id) | Chain of custody |
| `idx_witnesses_case` | case_witnesses(case_id) | Per-case witnesses |
| `idx_citations_case` | case_law_references(case_id) | Per-case citations |
| `idx_motions_case` | motion_recommendations(case_id) | Per-case motions |
| `idx_jobs_case` | processing_jobs(case_id) | Per-case job queue |
| `idx_jobs_status` | processing_jobs(status) | Queue processing |
| `idx_tasks_case` | operator_tasks(case_id) | Per-case tasks |
| `idx_tasks_status` | operator_tasks(status) | Open task queries |
| `idx_cases_status` | cases(status) | Status-based queries |
| `idx_cases_email` | cases(email) | Per-email case lookup |
| `idx_cases_order` | cases(order_id) | Order→case join |
| `idx_subscribers_email` | subscribers(email) UNIQUE | Dedup lookups |
| `idx_drip_dedup` | drip_emails(subscriber_id, email_key) UNIQUE | Prevent duplicate sends |

### Database Triggers

- `update_cases_updated_at` — Auto-sets `updated_at = now()` on every cases row update
- `update_docket_entries_updated_at` — Same for docket_entries
- `update_<table>_updated_at` — All 12 reference tables have `moddatetime` triggers

## Case Status State Machine

```
                                    ┌──────────────┐
                                    │ awaiting-     │ ← webhook: no intake found
                                    │ intake        │
                                    └──────┬───────┘
                                           │ intake submitted
                                           ▼
    webhook (has intake) ──────────► ┌─────────────┐
                                     │   intake     │ ← ready for generation
                                     └──────┬──────┘
                                            │ dispatcher (atomic guard)
                                            ▼
                                     ┌─────────────────┐
                                     │  generating      │ ← CD: edge function
                                     │  auto-generating │ ← IB: Phase A running
                                     └──────┬──────────┘
                                      ╱            ╲
                                success            failure / timeout
                                  ╱                    ╲
                      ┌──────────┐              ┌────────────────┐
                      │  review  │              │ generation-    │
                      │          │              │ failed         │
                      └────┬─────┘              └────────────────┘
                           │ operator approves
                           ▼
                      ┌──────────┐
                      │ delivered │
                      └──────────┘

    IB-specific statuses:
      intake → auto-generating (Phase A) → compiling (Phase B) → review
      intake → auto-generating → researching (judge research pending) → compiling → review

    Discovery-tier statuses:
      pending → uploaded → submitted → processing ⇄ review → delivered

    From any status:
      (refund webhook) → refunded
      (cron Part 4, 2h) → intake-stalled (from intake, CD only)
      (cron Part 5, 30m) → generation-failed (from generating)
```

### Status Definitions

| Status | Meaning | Tier(s) | Next Step |
|--------|---------|---------|-----------|
| `awaiting-intake` | Paid but no intake form yet | All services | Customer fills intake |
| `intake` | Intake linked, ready for processing | CD, IB | Auto-generates report |
| `generating` | Edge function running (CD) | case-decoder | Wait (30min max) |
| `auto-generating` | IB Phase A running | intelligence-brief | Wait (30min max) |
| `compiling` | IB Phase B running | intelligence-brief | Wait (30min max) |
| `researching` | Judge research pending | intelligence-brief | Optional, Phase B can proceed |
| `generation-failed` | Generation crashed/timed out | CD, IB | Operator retries |
| `review` | Report generated, awaiting operator approval | CD, IB, discovery | Operator reviews + delivers |
| `delivered` | Report sent to customer | All | Drip sequence begins |
| `intake-stalled` | Stuck in "intake" for 2+ hours | case-decoder | Operator investigates |
| `pending` | Discovery tier, waiting for upload | x-ray+ | Customer uploads files |
| `uploaded` | Files uploaded, not yet finalized | x-ray+ | Customer finalizes |
| `submitted` | Files finalized, ready for processing | x-ray+ | Pipeline processes |
| `processing` | Discovery pipeline running | x-ray+ | Jobs complete → review |
| `refunded` | Full refund processed | All | Report access revoked |

### Operator Status Transitions (ALLOWED_TRANSITIONS)

```typescript
{
  pending:    ["uploaded"],
  uploaded:   ["submitted"],
  submitted:  ["processing"],
  processing: ["review", "submitted"],    // can revert to submitted
  review:     ["delivered", "processing"], // can revert to processing
}
```

All transitions enforced via atomic UPDATE with `WHERE status = current_status`. Returns 409 Conflict on race condition. Source: `src/lib/types/operator.ts`.

## Multi-Case Order Model (Tier Inclusion)

Higher tiers include lower-tier deliverables. Each deliverable gets its own `case` record.

### Inclusion Map

| Purchased Tier | Cases Created | Included Deliverables |
|---|---|---|
| Case Decoder ($197) | 1 case | None |
| Intelligence Brief ($997) | 2 cases | Case Decoder (`is_included_deliverable=true`) |
| X-Ray ($2,497) | 3 cases | Case Decoder + Intelligence Brief |
| War Room ($4,997) | 4 cases | Case Decoder + IB + X-Ray |
| Situation Room ($9,997) | 5 cases | Case Decoder + IB + X-Ray + War Room |

### How It Works

1. **Webhook** creates the primary case AND loops through `tierConfig.includesTiers` to create additional cases with `is_included_deliverable=true` and `parent_order_id` set.
2. **Upgrade dedup**: Before creating an included case, checks if the customer already has a delivered case for that tier (by email OR court case number match). If so, skips creation.
3. **Included CD auto-generates** immediately if intake exists (same fire-and-forget pattern as standalone CD).
4. **CD delivery triggers Phase 2 email**: When an included CD is delivered, the deliver route finds sibling cases still awaiting intake and sends the Phase 2 intake email.
5. **Refund cascade**: `cases.eq("order_id")` catches all cases on the order.

### Two-Phase Intake Flow

- **Phase 1 (standard intake)**: Collected post-purchase. Used to generate the included Case Decoder.
- **Phase 2 (IB-specific intake)**: After CD delivery, customer receives email with HMAC-signed link to `/intake/intelligence-brief`. Collects judge, attorney, hearing details.

### Customer Identity

Email-only matching is fragile. Court case numbers provide cross-email identity:
- `court_case_number` + `court_state` on the `cases` table
- Collected in intake form (required field)
- Checkout page "Returning customer?" section for IB+ tiers

## Tier System

15 tiers across 3 categories. Source of truth: `src/lib/tiers.ts`.

### Playbook Tiers (8 tiers — $97, instant digital delivery)

| Slug | Name |
|------|------|
| `dui-first-offense` | DUI Defense Playbook |
| `drug-possession` | Drug Possession Defense Playbook |
| `drug-trafficking` | Drug Trafficking Defense Playbook |
| `probation-violation` | Probation Violation Defense Playbook |
| `white-collar` | White Collar Defense Playbook |
| `sex-offense` | Sex Offense Defense Playbook |
| `federal-criminal` | Federal Criminal Defense Playbook |
| `self-defense` | Self-Defense / Justifiable Force Defense Playbook |

All playbooks: `product_type: "digital-product"`, delivered via download token (72h expiry), stored in `charge-packs` storage bucket.

### Service Tiers (5 tiers — $197-$9,997, case-based)

| Slug | Price | Delivery | Discovery | Pipeline | Deliverables | Includes |
|------|-------|----------|-----------|----------|-------------|----------|
| `case-decoder` | $197 | 48 hours | No | Skills only | 7 | — |
| `intelligence-brief` | $997 | 72 hours | No | Skills + research | 24 (v4) | Case Decoder |
| `x-ray` | $2,497 | 10 business days | Yes | Stages 01-05 | 26 | CD + IB |
| `war-room` | $4,997 | 25-28 days + weekly | Yes | Stages 01-11 | 38 | CD + IB + X-Ray |
| `situation-room` | $9,997 | 24-48h priority | Yes | Stages 01-14 | 52 | CD + IB + X-Ray + War Room |

**Situation Room prerequisite:** Requires prior paid War Room order.

### Deliverables Detail (v4 — March 2026)

**Case Decoder ($197):** Plain-English Charge Breakdown, Case Stage Benchmark, Defense Milestone Checklist, 15 Targeted Questions, Red Flags for Stage, Motion Overview, Case Progress Score (0-100).

**Intelligence Brief ($997) — v4 restructure:** 6 sections + 5 appendices. Guarantee: "The Clarity or It's Free." v4 changes: Judge Intelligence Card generalized to Jurisdiction Intelligence Summary (specific judge profiling moved to X-Ray). New deliverables: 8-Domain Life Impact Map, Prosecution Pressure Tactics Decoder, Realistic Outcome Map, Defense Theory Landscape.

**X-Ray ($2,497) — v4 additions:** Judge Intelligence Profile + Prosecutor Research Profile (data-focused stats/patterns/outcomes, NOT strategy). 35-50 questions (vs 10-15 in IB). Discovery Strength Rating (0-100).

**War Room ($4,997):** Up to 8 witnesses included. Additional witnesses: $149 each. Witness Reliability Rankings: 7-dimension scoring rubric. Dual delivery: CLIENT versions (accessible) + ATTORNEY versions (technical, citation-heavy, filing-ready).

**Situation Room ($9,997):** Full witness coverage (every witness). Trial Intelligence Operations: morning briefings, evening debriefs, daily updated scripts from testimony. Priority response: 2hr prep time, 4hr during trial.

### Delivery Structure (Numbered Folders)

```
Client-Package/
├── 00-DELIVERY-GUIDE.pdf         ← All tiers
├── 1-Charge-Analysis/             ← $197+
├── 2-Judge-Intel/                 ← $997+
├── 3-Discovery-Analysis/          ← $2,497+
├── 4-Judge-Dossiers/              ← $4,997+
├── 5-Prosecution-Dossiers/        ← $4,997+
├── 6-Witness-Intel/               ← $4,997 (8) / $9,997 (all)
├── 7-Wave-Strategy/               ← $4,997+
├── 8-Motion-Awareness/            ← $4,997+
├── 9-Battle-Scripts/              ← $9,997 only
├── 10-Trial-Prep/                 ← $9,997 only
├── Reports/                       ← All tiers
└── Updates/                       ← $4,997+ (weekly) / $9,997 (Trial Ops)
```

### Add-on Tiers (2 tiers)

| Slug | Price | Delivery | Requires Discovery |
|------|-------|----------|-------------------|
| `extra-witness` | $149 | Next update cycle | No |
| `witness-pack` | $297 | 3-5 business days | Yes |

### Upgrade Credit Policy

- 100% credit from lower-tier purchases within 12 months
- Also credits playbook purchases within 30 days
- Voided if prior refund exists (fraud prevention)
- Capped at total session price (never negative)
- Creates Stripe coupon (`amount_off`, `duration: "once"`)

## API Route Reference

35 API routes grouped by subsystem.

### Public Routes

| Route | Method | Rate Limit | Purpose |
|-------|--------|-----------|---------|
| `/api/checkout` | POST | 10/300s/IP | Create Stripe checkout session |
| `/api/checkout/verify` | POST | — | Verify checkout session status |
| `/api/intake` | POST | 5/300s/IP | Submit intake form |
| `/api/intake/intelligence-brief` | POST | 5/300s/IP | Submit Phase 2 IB intake |
| `/api/subscribe` | POST | — | Email subscription |
| `/api/unsubscribe` | GET | — | CAN-SPAM unsubscribe |
| `/api/score` | POST | 10/60s/IP | Defense Milestone Score calculator |
| `/api/score/count` | GET | — | Score completion counter (60s cache) |
| `/api/upload` | POST | — | Upload discovery document |
| `/api/upload/finalize` | POST | — | Finalize uploaded documents |
| `/api/download/[token]` | GET | — | Download playbook PDF |
| `/api/health` | GET | — | Health check (Supabase + 9 env vars) |

### Webhook Routes

| Route | Method | Auth | Purpose |
|-------|--------|------|---------|
| `/api/webhooks/stripe` | POST | Stripe signature | Payment + refund handling |
| `/api/webhooks/resend` | POST | — | Resend delivery events |
| `/api/webhooks/resend-inbound` | POST | — | Inbound email storage |

### Operator Routes (auth: x-admin-password)

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/operator/cases` | GET | List cases (filters, pagination) |
| `/api/operator/cases/[id]` | GET | Case detail (13 parallel queries) |
| `/api/operator/cases/[id]/status` | PATCH | Status transition (atomic guard) |
| `/api/operator/jobs` | GET | Job queue list |
| `/api/operator/jobs/[id]/retry` | POST | Retry failed job |
| `/api/operator/tasks` | GET/PATCH | Task management |
| `/api/operator/metrics` | GET | Revenue, delivery time, SLA compliance |

### Generation Routes (auth: Bearer OPERATOR_SECRET)

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/generate/case-decoder` | POST | Dispatch CD generation to Edge Function |
| `/api/generate/intelligence-brief` | POST | Dispatch IB Phase A+B generation |
| `/api/generate/intelligence-brief/judge-research` | POST | Optional judge research + Phase B trigger |
| `/api/evaluate/case-decoder` | POST | Dispatch evaluation to Edge Function |
| `/api/deliver` | POST | Operator report delivery (HMAC-signed) |

### Cron Routes (auth: Bearer CRON_SECRET)

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/cron/drip` | GET | Daily cron — 19 parts (see Cron section) |

### Admin Routes (auth: x-admin-password)

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/admin/emails` | GET | Inbound email list |
| `/api/admin/reply` | POST | Reply to inbound email (threaded) |
| `/api/admin/demand/emerging` | GET/PATCH | Emerging topics management |
| `/api/admin/demand/gaps` | GET/PATCH | Content gaps management |
| `/api/admin/demand/performance` | GET | Content performance metrics |
| `/api/admin/demand/scores` | GET | Demand scores by window/dimension |
| `/api/admin/demand/subreddits` | GET/PATCH | Subreddit targeting approval |

## Pages Reference

28 pages grouped by audience.

### Public Pages

| Path | Purpose |
|------|---------|
| `/` | Landing page — pain points, how it works, pricing, testimonials, CTA |
| `/about` | Origin story, what we do / what we're NOT |
| `/services` | Pricing tiers by case type |
| `/resources` | Free guides, checklists, rights by charge type |
| `/blog` | Blog index with category filtering (35 posts) |
| `/blog/[slug]` | Individual post — sharing, CTA, related posts |
| `/score` | Defense Milestone Score (free lead magnet) |
| `/sample` | Sample Case Decoder report preview |
| `/sample-xray` | Sample X-Ray discovery analysis preview |
| `/contact` | Contact form |
| `/terms` | Terms of service |
| `/privacy` | Privacy policy |
| `/playbook/[slug]` | Playbook product sales page |

### Customer Pages

| Path | Purpose |
|------|---------|
| `/intake` | Multi-step case intake form |
| `/intake/intelligence-brief` | Phase 2 IB-specific intake (HMAC-gated) |
| `/upload` | Discovery document upload (drag-and-drop) |
| `/checkout` | Checkout page with upgrade credits |
| `/checkout/success` | Post-checkout confirmation + OTO system |
| `/my-case/[token]` | Customer case portal (tier-gated dashboard) |
| `/report/[token]` | Token-gated report viewer |
| `/unsubscribe` | CAN-SPAM unsubscribe page |

### Operator Pages (auth: sessionStorage password)

| Path | Purpose |
|------|---------|
| `/operator` | Dashboard — action queue, SLA breaches, quick stats |
| `/operator/cases` | Case list — status/tier/charge filters, email search, pagination |
| `/operator/cases/[id]` | Case detail — 8 tabs, 13 parallel queries, status transitions |
| `/operator/jobs` | Job queue — status/type filters, retry, progress bars |
| `/operator/metrics` | Metrics — revenue, delivery time, SLA compliance, pipeline health |

### Admin Pages (auth: sessionStorage password)

| Path | Purpose |
|------|---------|
| `/admin/demand` | Demand intelligence — quadrant map, gaps, emerging topics, performance |
| `/admin/inbox` | Inbound email management — threaded replies, address restriction |

## Intelligence Brief Pipeline

Major subsystem generating comprehensive case intelligence reports. Source: `src/lib/intelligence-brief/`.

### Phase A (5 parallel sections)

Generated simultaneously for speed. Each section is a separate Claude Sonnet 4.6 call (temp 0.3, maxTokens 2000-5000).

| Section | Key | Emotion | Output |
|---------|-----|---------|--------|
| Case Roadmap | `case-roadmap` | Orientation ("I can see the road ahead") | Timeline table + stages + two paths (plea/trial) |
| What's Working | `whats-working` | Grounding ("Some things are on track") | Good news + attorney decoded + gaps as CLARIFY + Case Progress Score |
| Legal Options | `legal-options` | Empowerment | Motion landscape + deadline calendar + plea framework |
| Protection | `protection` | Security | Collateral consequences + life impact map |
| Court Prep | `court-prep` | Readiness | Static appendix template |

**Case Progress Score** (internal to Section 2): 0-100, 6 weighted dimensions — Communication 25%, Case Review 15%, Discovery 20%, Motion Activity 15%, Strategy 15%, Court Prep 10%.

### Phase B (4 sequential sections)

Uses Phase A outputs via regex scanning to extract gaps, scores, deadlines, and applicable motions.

| Section | Key | Depends On | Output |
|---------|-----|-----------|--------|
| Case Intelligence | `case-intelligence` | Sections 1-2 gaps | Outcome map + defense theories + judge profile + prosecution preview |
| Your Plan | `your-plan` | Sections 1-2 + motions | Email template + phone script + 14-day plan with daily actions |
| Questions | `questions` | All Phase A | 10-15 targeted questions based on gaps |
| 48hr Priorities | `48hr-priorities` | All sections | Top 3 actions ranked by urgency |

### Judge Research (Optional, v4)

Phase A auto-triggers Phase B without waiting for judge data. Judge research can be submitted later via `/api/generate/intelligence-brief/judge-research` to enrich. If Phase B already ran, `force: true` re-triggers.

### Prompt Architecture

- **File:** `src/lib/intelligence-brief/prompts.ts` (59.7KB)
- **Model:** Claude Sonnet 4.6 for IB sections (Opus 4.6 with extended thinking for Case Decoder)
- **Temperature:** 0.3 (factual), up to 0.5 for creative sections
- **Max tokens:** 1500-4000 per section depending on complexity
- **Banned phrases:** UPL gate — "you should", "we recommend", "we advise", "your best option", "red flag", "warning sign" (with approved replacements)
- **Legal accuracy rules:** Texas DWI (not DUI), deferred adjudication exclusions, qualification requirements
- **Anti-hallucination:** No specific percentages, convert to attorney questions, qualitative language only

### Variables

65 fields in `IBVariables` interface across 9 categories. Source: `src/lib/intelligence-brief/variables.ts`.

| Category | Examples |
|----------|---------|
| Core Identity | first_name, charges, state, county, jurisdiction_level, case_number |
| Timeline | case_stage, arrest_date, months_since_arrest, next_court_date, motion_deadlines |
| Attorney Context | attorney_type (derived), attorney_name, attorney_firm, last_communication |
| Case Details | discovery_status, plea_status, plea_terms, charge_specific_data |
| Personal Context | frustration, biggest_concern, employment, family_situation, has_children, immigration_status |
| Computed (Phase A→B) | gaps_from_section_2, progress_score, applicable_motions, urgent_deadlines |
| Section Outputs | case_roadmap_output, whats_working_output, case_intelligence_output (for 48hr-priorities) |

### Render

Dependency-free Markdown→HTML conversion in `src/lib/intelligence-brief/render.ts` (no npm imports — Deno Edge Function compatible). Dark theme CSS. 11 content sections + 4 static appendices (Brady/Giglio checklist, court prep, state-specific rights, attorney questions).

### Status Flow

`intake` → `auto-generating` (Phase A) → `compiling` (Phase B) → `review` → `delivered`

Optional: `researching` (judge data pending, between auto-generating and compiling)

## X-Ray Discovery Pipeline

### Upload Flow

1. **Per-file upload** (`POST /api/upload`): Validates email ownership against case record, checks MIME allowlist + magic bytes, enforces 50MB limit, sanitizes storage path, uploads to `discovery-files` bucket
2. **Atomic array append** (`append_file_url` RPC): Adds storage path to `cases.file_urls`
3. **Finalize** (`POST /api/upload/finalize`): Creates `discovery_documents` rows, OCR `processing_jobs` (priority 1, batch grouped), `operator_tasks`, SLA deadlines

### SLA Deadlines (set at finalize)

| Tier | Delivery SLA |
|------|-------------|
| X-Ray | 14 days |
| War Room | 28 days |
| Situation Room | 2 days (priority) |

### Processing Pipeline

Job queue with batch grouping: `ocr` → `classify` → `extract` → `analyze` → `timeline` → `witness` → `citation` → `motion` → `report`. Each job type processes in sequence. Failed jobs create operator tasks. Cron Part 16 detects pipeline completion and transitions case to "review".

## Full Pipeline Map (16 Stages)

Source: `ImNotAnAttorney/system/PIPELINE-MAP.md`. Stages 00-15, not all tiers use all stages.

```
00-Database ──► 01-Raw ──► 02-OCR ──► 03-Extracted ──► 04-Database ──► 05-Reports
                                                           │
    ┌───────────────────────────────────────────────────────┘
    ├──► 06-Dossiers (Judge/Prosecution/Witnesses/Defense/Intel)
    ├──► 07-Motions (Wave 1-9 + Emergency)
    ├──► 08-Research (deep targeted)
    ├──► 09-Case-Law (citations, Shepardize)
    ├──► 10-Strategy (battle plans, charge maps, appellate preservation)
    ├──► 11-For-Attorney (PDFs, briefs, battle scripts — dual CLIENT+ATTORNEY versions)
    ├──► 12-Reply-Briefs (responses to state opposition)
    ├──► 13-Attack-Intel (contradictions, gaps, evidence vectors)
    └──► 14-Trial (voir dire, opening, closing, narrative, JOA, witness scripts)

15-Archive ──► Superseded work, sessions, replaced motions
```

### Stage Coverage by Tier

| Tier | Stages | Notes |
|------|--------|-------|
| Case Decoder ($197) | None | Skills-based generation only (Edge Function) |
| Intelligence Brief ($997) | None | Skills + optional judge research (Edge Function) |
| X-Ray ($2,497) | 01-05 | Document pipeline through report generation |
| War Room ($4,997) | 01-11 | Full analysis + strategy + attorney package |
| Situation Room ($9,997) | 01-14 | All stages including trial prep |

## Playbook / Digital Products

### 8 Playbooks

Each has a charge_packs table entry with file_path to PDF in the `charge-packs` storage bucket. Sales pages at `/playbook/[slug]` with `PlaybookSalesPage` component.

### Download Flow

1. Webhook receives `product_type: "digital-product"`
2. Generates `download_token` (UUID) + 72h expiry on `orders` table
3. Sends playbook delivery email with `/api/download/{token}` link
4. Download route validates token, checks expiry, generates signed URL from Supabase Storage
5. Increments `download_count`

### Refund Handling

Refund webhook revokes access — download route returns 403 for refunded orders.

### Drip Sequence (4 emails)

1. Charge-specific action step (e.g., DMV 10-day deadline for DUI)
2. Story harvest (encourage sharing experience)
3. Upsell to Case Decoder (with playbook credit)
4. Referral ask

## Webhook Handler

`POST /api/webhooks/stripe` handles two Stripe events.

### checkout.session.completed

**Extract metadata:** tier, email (normalized), amount, product_type, priority_delivery, court_date, consent_timestamp, upgrade_credit_applied, existing_case_number/state.

**Create order:** Insert with unique constraint on `stripe_session_id`. Duplicate (code 23505) returns 200 (idempotent).

**Digital Product Path (early return):**
1. Generate download_token (UUID) + 72h expiry
2. Send playbook delivery email with download link + charge-specific step 2
3. Show upgrade credit toward Case Decoder
4. Operator notification → RETURN (no case creation)

**Service Tier Path:**
1. Create case with status based on tier + intake existence
2. Link intake if found by email
3. Included deliverable creation loop (e.g., IB order creates CD case too)
4. Generation trigger via `after()` (post-response, fire-and-forget)
5. Status-appropriate emails (intake reminder, upload reminder, generation started)

### charge.refunded

1. Update order: `status = "refunded"`, `refunded_at = now()`
2. Update case: `status = "refunded"`
3. Void all future upgrade credits for that email
4. Revoke download access (403 on token lookup)
5. Operator notification with refund amount + reason

## Checkout Flow

`POST /api/checkout` — 10-step process. Source: `src/app/api/checkout/route.ts`.

| Step | Action | Details |
|------|--------|---------|
| 1 | Rate limit | `checkRateLimit(ip, "checkout:{ip}", 10, 300)` — 429 if exceeded |
| 2 | Tier validation | Reject unknown tier slugs against TIERS config — 400 |
| 3 | Email validation | Regex + normalize (lowercase + trim) — 400 |
| 4 | Email capture | Upsert to subscribers (source="checkout") — powers abandonment recovery |
| 5 | Charge type auto-detect | Lookup most recent intake if not provided |
| 6 | Refund check | Block if prior refunded order exists (fraud prevention) |
| 7 | Prerequisite gate | Situation Room requires prior War Room (soft gate) |
| 8 | Consent validation | Non-digital tiers require consent=true; $2,497+ strict check |
| 9 | Case number lookup | Cross-email identity matching for returning customers |
| 10 | Upgrade credit | 100% from lower tiers (12mo), playbooks (30d). Create Stripe coupon |

**Stripe Session:** Metadata carries all downstream context (NO re-querying in webhook). Success/cancel URLs use env var origin.

### Checkout Success — OTO System

- 24-hour countdown timer (localStorage client, server-side session as source of truth)
- Per-tier upgrade offers with credit pre-calculated
- Tier-specific next steps (`TIER_NEXT_STEPS` config): playbooks → email delivery, CD/IB → intake form, discovery → upload page

## Drip Email System

Source: `src/lib/drip-emails.ts` + cron Parts 1-2.

### Crisis Buyer Psychology

Defendants are **crisis buyers** with a 7-day decision window, NOT newsletter subscribers. By day 14, they've bought or moved on. Email capture is for follow-up during the decision window (2-3 touches), not list-building. Pre-purchase drip must convert fast (Day 2/4/7). Post-purchase drip works longer (active case, 30-90 day window). This is not a recurring revenue business — each defendant is a one-time buyer on a short clock.

### Sequence Categories

| Category | Emails | Trigger |
|----------|--------|---------|
| Nurture | 6+ emails | Days since subscribe (1, 3, 5, 7, 10, 14) |
| DUI 72-hour crisis | 3 emails | Days 2, 4, 7 — tighter cadence for DUI defendants in crisis (source: `dui-72-hours`). Falls to standard nurture at Day 10+ |
| Score-band nurture | Band-specific | Crisis/Concerning urgency or Adequate/Excellent validation |
| Post-purchase (CD) | ~6 emails | intake_reminder → delivery → meeting_prep → story_harvest → upsell → referral |
| Post-purchase (IB) | ~6 emails | phase2_reminder → delivery → meeting_prep → story_harvest → upsell → referral |
| Post-purchase (X-Ray) | ~8 emails | intake → delivery → upload → meeting_prep → story_harvest → upsell → referral → status_update |
| Post-purchase (War Room/SR) | ~6 emails | intake → delivery → meeting_prep → story_harvest → status_update → referral |
| Playbook | 4 emails | Charge-specific action → story harvest → upsell to CD → referral |
| Abandoned checkout | 1 email | 24-48h after email captured at checkout with no purchase |

### Timing Models

| Model | Measured From | Used By |
|-------|--------------|---------|
| Standard (default) | `orders.paid_at` | Most post-purchase emails |
| `relativeToDelivery` | `cases.delivered_at` | Post-delivery follow-ups |
| `relativeToSubmission` | Case status → "submitted" | Active-wait discovery emails |

### Design Decisions

- **Day-0 emails** (delayDays=0) sent synchronously by webhook/delivery endpoint, NOT cron
- Cron skips day-0 to prevent duplicates
- Dedup via `drip_emails` table (subscriber_id + email_key unique constraint)
- Placeholder resolution: `{{CASE_ID}}`, `{{EMAIL}}`, `{{REPORT_URL}}`, `{{DOCUMENT_COUNT}}`
- Personalization via intake data (family_buyer, stage_aware, career_aware blocks)
- Email threading: `caseThreadId(caseId)` generates RFC 2822 Message-ID
- CAN-SPAM: Physical address + unsubscribe link + List-Unsubscribe headers (RFC 8058)
- Email styling: dark bg (#0C0A09), zinc text (#D4D4D8), amber accent (#F59E0B)

## Trial Operations Emails

3 daily cycle templates for Situation Room ($9,997) trial engagement. Source: `src/lib/trial-ops-emails.ts`. Operator-triggered (not automated drip).

| Template | Timing | Purpose |
|----------|--------|---------|
| `trialInputSolicitation` | Evening (after court adjourns) | Asks defendant to report what happened today (7 structured prompts) |
| `eveningDebriefDelivery` | Evening (within 3 hours of input) | Delivers evening debrief analysis + next day's expected witnesses |
| `morningBriefDelivery` | Morning (by 7 AM) | Morning brief + printable cheat sheet + questions for attorney |

Each template takes `firstName`, `dayNumber`, `todayDate`, plus template-specific content (debrief HTML, cheat sheet HTML, expected witnesses). Uses same branded HTML as all INAA emails (dark theme, amber accent).

## Cron Jobs

### `/api/cron/drip` — Daily at 14:00 UTC (9:00 AM EST)

22 parts (19 numbered + 3 sub-parts: 5b, 5c, 6b). Heartbeat inserts into `cron_runs` table. Concurrent execution prevented via `acquire_cron_lock(1)` advisory lock.

| Part | What | Threshold / Target | Action |
|------|------|-------------------|--------|
| **1** | Nurture emails | Days since subscribe | Send next unsent email (DUI-72h routing → band-routing → standard nurture) |
| **2** | Post-purchase emails | Days since purchase/delivery/submission | Tier-specific follow-ups (3 timing models, guards for status) |
| **3** | Review reminders | 12h in "review" | Alert operator (48h guarantee at risk) |
| **4** | Stuck intake detection | 2h in "intake" (CD, non-included) | Mark intake-stalled, alert operator |
| **5** | Stuck generation (CD) | 30min in "generating" | Mark generation-failed, alert operator |
| **5b** | Stuck IB generation | auto-generating >30min, compiling >30min, researching >24h | Re-trigger Phase A/B, 72h escalation |
| **5c** | IB Phase 2 intake reminder | 48h in "intake" (IB, phase2_data NULL) | Customer reminder, 7-day operator escalation |
| **6** | Awaiting-intake reminder | 24h in "awaiting-intake" | Customer reminder email |
| **6b** | Intake escalation | 72h / 7 days no intake | Operator alert, consider refund |
| **7** | Abandoned intake cleanup | >90 days, no case | Purge orphaned intakes |
| **8** | Rate limit cleanup | >1 hour old | Remove expired rate_limit rows |
| **9a** | Stripe reconciliation | Paid sessions, no order | Auto-create missing order + case, alert operator |
| **9b** | Orphan order detection | Order exists, no case | Auto-create case, alert operator |
| **10** | Report expiry warning | 30-31 days before 12-month expiry | Warn customer |
| **11** | Abandoned checkout recovery | 24-48h, source="checkout", no purchase | Recovery email |
| **12** | Missed evaluation safety net | 15min in "review", eval_results NULL | Re-trigger evaluation (limit 5/run) |
| **13** | Drip email log cleanup | >90 days | Delete stale send records (Privacy Policy §6) |
| **14** | Discovery document auto-deletion | 90 days post-delivery | Delete from Storage + clear file_urls (Privacy Policy §4) |
| **15** | Stuck job detection | processing_jobs >30min in "processing" | Mark failed, create HIGH priority operator task |
| **16** | Pipeline completion check | All jobs done for a case | Transition case to "review", email operator with scores |
| **17** | SLA breach detection | delivery_due_at passed, not delivered/refunded | Create URGENT operator task (deduped) |
| **18** | Weekly progress email | War Room + Situation Room active cases | Weekly customer update (week-number dedup) |
| **19** | Engine heartbeat | processing_jobs "queued" >1 hour | URGENT operator task — engine may be down (daily dedup) |

## Evaluation Pipeline

7-team expert evaluation framework for report quality assurance. DB-driven via `eval_criteria` and `pipeline_eval_weights` tables. **Production Edge Function implements 2 teams (UPL + Psych); full 7-team framework available in CLI tool.**

| Team | Code | Criteria | Weight | Focus | Status |
|------|------|----------|--------|-------|--------|
| UPL Compliance | U1-U7 | 7 | GATE | No legal advice, banned phrases — must pass | **Production** (Edge Function) |
| Psychological Architecture | P1-P10 | 10 | HIGH | Emotional calibration, buyer state awareness | **Production** (Edge Function) |
| Legal Substance | L1-L10 | 10 | HIGH | Accuracy, specificity, actionability | CLI tool |
| Defendant Experience | D1-D26 | 26 | HIGH (15/20+) | Readability, empowerment, trust, buyer state alignment | CLI tool |
| Conversion & Value | C1-C10 | 10 | Varies | CTA placement, pricing, brand consistency | CLI tool |
| Rendering & Delivery | R1-R11 | 11 | Varies | HTML rendering, mobile, accessibility | CLI tool |
| System Truth | ST1-ST16 | 16 | Varies | Anti-hallucination, expert attribution, citation verification | Designed only |

**Total: 90 criteria across 7 teams.**

**Weight levels:**
- **GATE** — Must pass ALL criteria. Any FAIL blocks delivery.
- **HIGH** — Must pass 8/10+ (or 15/20+ for Team 4). 1-2 NEEDS WORK acceptable with justification.
- **MEDIUM** — Must pass 6/10+. Failures noted but don't block.
- **LOW** — Advisory only.

**Tier-aware filtering:** Case Decoder runs ~46 applicable criteria; Intelligence Brief+ runs all. Teams 1 & 3 always run (UPL + Legal are existential).

**CLI:** `node evaluate-report.mjs --file <report> --charge-type "<type>" --tier <tier>`
- `--model sonnet` for budget runs (~$0.25 vs ~$1.25 for Opus)
- `--teams upl,legal` for specific teams only
- `--no-db` for offline mode

## Score System

Defense Milestone Score — stateless 0-100 scoring engine at `/api/score`. Source: `src/app/api/score/route.ts`.

### Algorithm

Starts at 50 (neutral baseline). 10 weighted categories:

| Category | Weight | Scoring Logic |
|----------|--------|--------------|
| Time Since Arrest | 30% | Drives timeIndex (0-4) used by other categories as severity multiplier |
| Attorney Type | 10% | Private +5, Public Defender 0, No Attorney -15, Not Sure -10 |
| Motions Filed | 20% | Yes +15; No: -20 if timeIndex≥2, -5 if <2; Don't Know -10 |
| Discovery Received | 15% | Yes +10; No: -15 if timeIndex≥2, -3 if <2; Don't Know -10 |
| Communication Frequency | 15% | Weekly +10, Monthly 0, Rarely -10, Never -20 |
| Strategy Discussion | 10% | Yes in Detail +10, Briefly +2, No -12 |
| Criminal History | — | -2 to -5 (misdemeanor vs felony/multiple) |
| Case Stage | — | Contextual observations + stage-specific penalties |
| Licensed Profession | — | Collateral consequence warnings (no score impact) |
| Charge Type | — | Mandatory charge-specific observation (always included) |

**Compound penalty:** If timeIndex ≥ 3 AND no motions AND no discovery → additional -10.

**Time Index:** <1mo=0, 1-3mo=1, 3-6mo=2, 6-12mo=3, 12+mo=4.

### Score Bands

| Band | Range | Drip Routing |
|------|-------|-------------|
| Critical | 0-30 | Urgency sequences |
| Concerning | 31-50 | Urgency sequences |
| Average | 51-70 | Standard nurture |
| Adequate | 71-85 | Validation sequences |
| Excellent | 86-100 | Validation sequences |

### Privacy

- **No data storage** — computed and returned only
- Fire-and-forget: increment counters + anonymous aggregates (no individual data)
- Rate limited: 10/60s/IP
- Score persistence via `sessionStorage` on client (survives page refresh)

### Aggregate Tracking

`score_aggregates` table tracks charge-type-level counts. After 100+ completions, feeds the Defense Accountability Index (proprietary data moat).

## Operator Dashboard

5 pages behind `OperatorShell` authentication. Source: `src/app/operator/`.

### Auth Model

- `OperatorShell` component wraps all operator pages
- Password stored in `sessionStorage` (key: `admin-password`)
- Verified via `X-Admin-Password` header to API routes
- Timing-safe comparison via `isOperatorAuthorized()` in `src/lib/operator-auth.ts`
- Sidebar navigation with keyboard shortcuts: H (Dashboard), C (Cases), J (Jobs), M (Metrics)

### Pages

**Dashboard** (`/operator`): Action queue — SLA breaches alert, cases awaiting review, failed jobs with retry, open tasks, quick stats.

**Cases** (`/operator/cases`): Status/tier/charge filters, email search, paginated table.

**Case Detail** (`/operator/cases/[id]`): 13 parallel Supabase queries. 8 tabs:

| Tab | Contents |
|-----|----------|
| Overview | MetricCards (discovery health, documents, findings, witnesses, evidence, custody, timeline, citations) |
| Documents | Table: name, type, category, size, pages, status, upload date |
| Findings | Grouped by severity (critical/major/minor/info) with verification status |
| Witnesses | Table: name, type, agency, credibility score, threat level, dossier status, cross-exam ready |
| Jobs | Table: job type, status, progress bar, items produced, retries, retry button |
| Tasks | Table: priority badge, title, type, status, due date, SLA breach indicator |
| Timeline | Reconstructed events summary |
| Legal | Citations table (binding/good_law) + Motions table (strategic scores) |

Header: email, tier, status, phase, dates, order info, intake summary, operator notes, report link.

**Jobs** (`/operator/jobs`): Status/type filters, auto-refresh, progress bars, retry actions.

**Metrics** (`/operator/metrics`): Revenue, delivery time, SLA compliance, pipeline health, cases by status/tier charts.

## Admin Dashboard

2 pages + 7 API routes. Source: `src/app/admin/`.

### Demand Intelligence (`/admin/demand`)

- **Demand Quadrant Map**: 2x2 grid (Gold Mine / Red Ocean / Risky Bet / Dead Zone)
- **Demand Leaderboard**: Posts, questions, trend, demand score, competition score, quadrant, gap score (filterable by 7d/30d/90d window and charge_type/pain_point dimension)
- **Content Gaps**: Suggested titles with gap_score ranking, queue action
- **Emerging Topics**: Topic phrases, post count, urgency, engagement, dismiss action
- **Content Performance**: Blog slugs with subscriber signups, orders, revenue attribution
- **Discovered Subreddits**: Subscriber count, relevance score, approve/reject workflow

### Inbox (`/admin/inbox`)

- Inbound email management (Resend inbound webhook → `inbound_emails` table)
- Reply composition with email threading (In-Reply-To, References headers via `caseThreadId`)
- Restricted to known addresses (security)

## My-Case Portal

Token-based customer portal at `/my-case/[token]`. No login required — unguessable UUID with 12-month expiry.

### Tier-Gated Architecture

**Non-Discovery Tiers (CD, IB):** Simple progress stepper (Purchased → Generating → Under Review → Delivered) + report link when delivered.

**X-Ray ($2,497):** Full dashboard:
- Discovery Strength Rating (0-100)
- Defense Opportunity Index (overall score from JSONB)
- Document tracker (Uploaded / Processed / Analyzing)
- Findings severity breakdown (critical/high/major/minor)
- Evidence chain status (items, verified transfers, gaps)
- Timeline event count
- Processing progress bar

**War Room ($4,997):** X-Ray dashboard +:
- Witnesses (dossier status, credibility, cross-exam readiness)
- Case law citations (binding, good law verification)
- Motion recommendations (strategic scores)

**Situation Room ($9,997):** War Room dashboard +:
- Attack intelligence (cross-exam/impeachment vectors)
- Trial preparation materials

### Implementation

10+ parallel Supabase queries: discovery_documents, case_findings, evidence_items, evidence_custody, timeline_events, case_witnesses, case_law_references, motion_recommendations, trial_materials, processing_jobs.

## Component Library

25 components in `src/components/`.

### UI Components

| Component | Purpose |
|-----------|---------|
| `Header` | Navigation with Get Started CTA |
| `Footer` | Navigation, CTAs, sitemap link |
| `PricingTable` | 3-tier pricing display |
| `FAQAccordion` | Collapsible FAQ sections |
| `TestimonialSection` | Social proof section |
| `TrustBadges` | Trust/credibility badges |
| `StickyMobileCTA` | Fixed mobile call-to-action bar |
| `RecentPurchaseNotification` | Social proof purchase notifications |
| `ShareButtons` | Reusable sharing (SMS, WhatsApp, Email, Twitter, Facebook, Copy Link) |
| `TLDRBox` | Summary/TLDR display (`.tldr-box` class for `speakable` schema) |
| `SourceIntelligence` | Source attribution display |

### Blog Components

| Component | Purpose |
|-----------|---------|
| `BlogCard` | Post preview card |
| `BlogCategoryFilter` | Blog index category filter |
| `BlogCTA` | Upsell to Question Pack on blog posts |
| `BlogInlineCapture` | Inline email capture within posts |
| `MDXErrorBoundary` | Error boundary for MDX rendering |

### Form Components

| Component | Purpose |
|-----------|---------|
| `LeadCapture` | Email capture with PDF download (accepts props for source, title, description, download link) |
| `FileUpload` | Discovery document upload (drag-and-drop) |

### Product Components

| Component | Purpose |
|-----------|---------|
| `PlaybookSalesPage` | Playbook product sales page |
| `PlaybookCTA` | Playbook upsell CTA |
| `OperatorShell` | Operator dashboard shell + auth + nav |

### Motion Components (framer-motion)

All respect `prefers-reduced-motion` media query.

| Component | Purpose |
|-----------|---------|
| `FadeInUp` | Fade-in with upward slide |
| `StaggerContainer` | Staggered children animation |
| `AnimatedCounter` | Counting number animation |
| `AnimatedScoreArc` | Score gauge arc animation |

## Frontend Infrastructure

### Fonts

- **Geist Sans** — Primary body font (Next.js built-in)
- **Playfair Display** — Heading/accent font

### Theme

Dark mode hardcoded (no toggle). Background: stone-950, text: zinc-200, accent: amber-500.

### MDX Blog

- **Engine:** `next-mdx-remote` v6
- **Source:** `content/blog/*.mdx` (35 posts)
- **Frontmatter:** title, date, description, category, tags, faqs, howToSteps, tldr
- **Custom components:** TLDRBox (maps to `speakable` schema)
- **Reading time:** Computed via `reading-time` package
- **Utilities:** `src/lib/blog.ts` (post listing, slug resolution, howToSteps extraction)

### OG Images

3 dynamic generators:
- Root OG image (site-wide)
- Per-blog-post OG image
- Per-playbook OG image

### Error Pages

- `error.tsx` — Client error boundary with reset/home CTAs
- `not-found.tsx` — Branded humor: "kind of like the motion your attorney said they'd file last month"

### Health Check

`/api/health` verifies Supabase connectivity + 9 required env vars. Returns 200/503. Env var names NOT exposed in response.

### Analytics

Vercel Analytics (`@vercel/analytics`) integrated in root layout.

### Organization Schema

JSON-LD `Organization` entity in root layout.

## Structured Data / Schema.org (.01% GEO Tactics)

Every blog post emits multiple JSON-LD blocks. Schema utilities in `src/lib/schema.ts`.

| Schema Type | Where | Purpose |
|-------------|-------|---------|
| `Article` | All blog posts | Core article entity with `@id` binding |
| `FAQPage` | Posts with `faqs` frontmatter | FAQ rich results, linked to Article via `isPartOf` |
| `HowTo` | Posts with `howToSteps` frontmatter | Step-by-step rich results (2 posts) |
| `BreadcrumbList` | All blog posts + score page | Navigation hierarchy |
| `Organization` | Site-wide | Publisher entity |
| `Service` / `LegalService` | Services page | Product listings with OfferCatalog |

### .01% Enhancements

| Property | Applied To | Signal |
|----------|-----------|--------|
| `speakable` | All posts (`.tldr-box` CSS selector) | AI-extractable TLDRBox content |
| `@id` entity binding | Article ↔ FAQPage | Closes disconnected entity graph |
| `citation` | 4 posts (.gov/.edu links) | "Reference material" classification |
| `isBasedOn` | `what-500-pages` post | "Research article" classification |
| `educationalLevel` | All posts (`beginner`) | Content classifier |
| `audience` | All posts (`criminal defendant`) | Audience targeting for AI retrieval |
| `about` | All posts (from category + tags) | Topic entity mapping |

### Content GEO Features

- **TLDRBoxes:** 20/35 posts (57% coverage) — AI-extractable direct answers
- **Internal linking:** 10 posts cross-linked with semantic anchor text variation
- **DefinedTerm-ready blocks:** 2 posts (constructive possession, proffer session)
- **Numbered Q+A format:** `questions-to-ask-before-hiring` has direct-answer paragraphs

## Shared Constants

Centralized in `src/lib/site.ts`:
- `SITE_URL` — All email links, redirects, canonical URLs
- `CONTACT_EMAIL` — help@imnotanattorney.com
- `PHYSICAL_ADDRESS` — CAN-SPAM required address
- `OPERATOR_EMAIL_FALLBACK` — Fallback when env var missing
- `normalizeEmail()` — Lowercase + trim
- `isValidEmail()` — Regex validation
- `signOperatorToken()` / `verifyOperatorToken()` — HMAC token operations
- `signPhase2Token()` / `verifyPhase2Token()` — 30-day Phase 2 tokens
- `caseThreadId()` — RFC 2822 Message-ID for email threading

## Error Handling Strategy

1. **Email failures:** Retry once after 2s (simplified HTML). If both fail, notify operator with report URL. Never crash.
2. **Supabase errors:** Log + return 500 with generic message. Operator notifications for critical failures.
3. **Stripe webhook duplicates:** Detect via unique constraint violation (code 23505), return 200.
4. **Missing env vars:** Explicit checks with descriptive throw messages.
5. **Stuck processing:** Cron detects stuck cases (Parts 4, 5, 5b, 15, 17, 19) and alerts operator.
6. **Rate limit RPC failure:** Falls back to in-memory rate limiter (fail closed: 10 req/min).

## Backup Worker (GitHub Actions)

The Supabase Edge Function Free tier has a 150-second hard timeout. Claude Opus 4.6 with extended thinking can exceed this on complex charges. A GitHub Actions cron workflow runs every 5 minutes to catch timed-out cases.

**Files:** `scripts/generate-worker.mjs` + `.github/workflows/generate-report.yml`

**Flow:** Checks for cases stuck in "generating" status for >3 minutes → generates report with no timeout constraint → saves to Supabase → emails operator for review.

**Minutes budget:** ~1,649/2,000 free monthly minutes (most runs are no-ops that exit in ~10 seconds).

### GitHub Actions Secrets

| Secret | Purpose |
|--------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Full DB access |
| `ANTHROPIC_API_KEY` | Claude API |
| `RESEND_API_KEY` | Send operator review emails |
| `RESEND_FROM_EMAIL` | Sender address |
| `OPERATOR_EMAIL` | Operator notification recipient |
| `OPERATOR_SECRET` | HMAC signing for approve links |
| `NEXT_PUBLIC_SITE_URL` | Base URL for email links |

## Known Code Duplications (Intentional)

1. **`escapeHtml()` + `sendEmail()` + `PHYSICAL_ADDRESS`** — Duplicated in Supabase Edge Functions (`generate-report/index.ts` and `evaluate-report/index.ts`). Intentional: Edge Functions run in Deno and cannot import from Next.js.

2. **Tier pricing data** — Canonical source of truth is `src/lib/tiers.ts`. Code-level copies exist in `PricingTable.tsx` and `services/page.tsx` (display). The tiers config must be kept in sync.

## File Organization

```
src/
  app/
    api/
      checkout/                  ← Stripe session creation + verify
      cron/drip/                 ← Daily cron (19 parts)
      deliver/                   ← Operator report delivery
      download/[token]/          ← Playbook PDF download
      evaluate/case-decoder/     ← Evaluation dispatcher
      generate/
        case-decoder/            ← CD generation dispatcher
        intelligence-brief/      ← IB Phase A+B dispatcher
          judge-research/        ← Optional judge research trigger
      health/                    ← Health check endpoint
      intake/                    ← Standard intake submission
        intelligence-brief/      ← Phase 2 IB intake
      score/                     ← Score calculator
        count/                   ← Score completion counter
      subscribe/                 ← Email subscription
      unsubscribe/               ← CAN-SPAM unsubscribe
      upload/                    ← Discovery document upload
        finalize/                ← Finalize uploaded documents
      webhooks/
        stripe/                  ← Payment + refund handling
        resend/                  ← Delivery event tracking
        resend-inbound/          ← Inbound email storage
      operator/
        cases/                   ← Case list
          [id]/                  ← Case detail
            status/              ← Status transition
        jobs/                    ← Job queue
          [id]/retry/            ← Job retry
        tasks/                   ← Task management
        metrics/                 ← Dashboard metrics
      admin/
        emails/                  ← Inbound email list
        reply/                   ← Threaded email reply
        demand/
          emerging/              ← Emerging topics
          gaps/                  ← Content gaps
          performance/           ← Content performance
          scores/                ← Demand scores
          subreddits/            ← Subreddit targeting
    page.tsx                     ← Landing page (14 sections)
    about/                       ← Origin story
    services/                    ← Pricing tiers
    resources/                   ← Free guides
    blog/                        ← Blog index (35 posts)
      [slug]/                    ← Individual blog post
    score/                       ← Defense Milestone Score
    sample/                      ← Sample CD report
    sample-xray/                 ← Sample X-Ray report
    contact/                     ← Contact form
    terms/                       ← Terms of service
    privacy/                     ← Privacy policy
    playbook/[slug]/             ← Playbook sales page
    intake/                      ← Standard intake form
      intelligence-brief/        ← Phase 2 IB intake
    upload/                      ← Discovery document upload
    checkout/                    ← Checkout page
      success/                   ← Post-checkout + OTO
    my-case/[token]/             ← Customer case portal (tier-gated)
    report/[token]/              ← Token-gated report viewer
    unsubscribe/                 ← Unsubscribe page
    operator/                    ← Operator dashboard
      cases/                     ← Case list
        [id]/                    ← Case detail (8 tabs)
      jobs/                      ← Job queue
      metrics/                   ← Metrics view
    admin/
      inbox/                     ← Inbound emails
      demand/                    ← Demand intelligence
    error.tsx                    ← Error boundary
    not-found.tsx                ← 404 page
    layout.tsx                   ← Root layout (fonts, analytics, org schema)
  lib/
    email.ts                     ← Resend API wrapper + sendEmailWithRetry
    stripe.ts                    ← Stripe client
    tiers.ts                     ← Full tier config (15 tiers)
    drip-emails.ts               ← Email templates + sequences + timing
    trial-ops-emails.ts          ← War Room / Situation Room email templates
    blog.ts                      ← MDX blog utilities
    schema.ts                    ← Schema.org utilities
    site.ts                      ← Constants + HMAC tokens + email threading
    rate-limit.ts                ← Rate limit wrapper + in-memory fallback
    operator-auth.ts             ← Timing-safe auth + isOperatorAuthorized
    playbook-configs.ts          ← Playbook sales page configs
    intelligence-brief/
      prompts.ts                 ← IB prompt configs (59.7KB, 65 variables)
      variables.ts               ← IBVariables interface + extractVariables()
      render.ts                  ← Dependency-free Markdown→HTML + dark theme
    types/
      operator.ts                ← Operator types + ALLOWED_TRANSITIONS
    supabase/
      admin.ts                   ← Supabase admin client
  components/
    Header.tsx                   ← Site header + nav
    Footer.tsx                   ← Site footer
    PricingTable.tsx             ← Pricing display
    FAQAccordion.tsx             ← Collapsible FAQ
    TestimonialSection.tsx       ← Testimonials
    TrustBadges.tsx              ← Trust badges
    StickyMobileCTA.tsx          ← Mobile CTA bar
    RecentPurchaseNotification.tsx ← Purchase social proof
    ShareButtons.tsx             ← Share buttons (SMS-first)
    TLDRBox.tsx                  ← TLDR box (speakable schema)
    SourceIntelligence.tsx       ← Source attribution
    BlogCard.tsx                 ← Blog preview card
    BlogCategoryFilter.tsx       ← Category filter
    BlogCTA.tsx                  ← Blog upsell CTA
    BlogInlineCapture.tsx        ← Inline email capture
    MDXErrorBoundary.tsx         ← MDX error boundary
    LeadCapture.tsx              ← Email capture + PDF
    FileUpload.tsx               ← Drag-and-drop upload
    PlaybookSalesPage.tsx        ← Playbook sales page
    PlaybookCTA.tsx              ← Playbook upsell
    OperatorShell.tsx            ← Operator auth + shell
    motion/
      FadeInUp.tsx               ← Fade-in-up animation
      StaggerContainer.tsx       ← Staggered children
      AnimatedCounter.tsx        ← Counting animation
      AnimatedScoreArc.tsx       ← Score gauge arc
  middleware.ts                  ← CSP nonce + route auth
content/
  blog/                          ← 35 MDX blog posts
scripts/
  generate-worker.mjs            ← GitHub Actions backup worker
  check-tiers.mjs               ← Tier config validation
  setup-storage-and-seed.mjs    ← Storage bucket + seed data setup
  setup-cronjob-org.js          ← cron-job.org setup
  migrate-009-tier-inclusion.mjs ← Tier inclusion migration
  test-inclusion-flow.mjs       ← Inclusion flow E2E test
  verify-download-flow.mjs      ← Download flow verification
  geo-prompt-test.mjs           ← GEO prompt testing
  test-ib-pipeline.ts           ← IB pipeline E2E test
  e2e-all-pipelines.mjs         ← All pipelines E2E test
  test-e2e-dashboard.mjs        ← Dashboard E2E test
  e2e-playbook-visual.mjs       ← Playbook visual E2E test
supabase/
  functions/
    generate-report/             ← Report generation Edge Function (Opus 4.6 for CD, Sonnet 4.6 for IB, Deno)
    evaluate-report/             ← Report evaluation Edge Function (Sonnet 4.6)
  migrations/
    00001_initial_schema.sql     ← Core tables (orders, cases, intakes, subscribers, drip_emails)
    003-payment-intent-index-and-updated-at-trigger.sql ← Indexes + updated_at trigger
    004-launch-readiness.sql     ← Reference data (12 tables) + rate_limits + email_log + audit_runs + RPCs
    005-intelligence-brief-pipeline.sql ← IB columns + phase2_data
    006-charge-packs.sql         ← charge_packs + download columns on orders
    007-phase1-xray-tracking.sql ← Discovery tables + processing_jobs + operator_tasks
    008-fix-phase1-integrity.sql ← Schema integrity fixes
    009-subscriber-score-columns.sql ← score_band, score_value, charge_type on subscribers
    010-reconcile-discovery-schema.sql ← Admin tables (inbound_emails, emerging_topics, etc.)
    011-docket-entries.sql       ← docket_entries table
    012-score-counters.sql       ← counters + score_aggregates
.github/
  workflows/
    generate-report.yml          ← Cron: backup worker every 5 min
```

## Scripts Reference

| Script | Purpose |
|--------|---------|
| `generate-worker.mjs` | Backup worker for timed-out Edge Function CD generation |
| `check-tiers.mjs` | Validates tier config consistency across code and DB |
| `setup-storage-and-seed.mjs` | Creates storage buckets + seeds reference data |
| `setup-cronjob-org.js` | Configures cron-job.org external cron |
| `migrate-009-tier-inclusion.mjs` | Data migration for tier inclusion feature |
| `test-inclusion-flow.mjs` | E2E test: tier inclusion (webhook → cases → generation) |
| `verify-download-flow.mjs` | E2E test: playbook download (token → signed URL → PDF) |
| `geo-prompt-test.mjs` | Tests GEO prompt generation |
| `test-ib-pipeline.ts` | E2E test: IB pipeline (Phase A → Phase B → render) |
| `e2e-all-pipelines.mjs` | E2E test: all pipelines (CD + IB + X-Ray) |
| `test-e2e-dashboard.mjs` | E2E test: operator dashboard API routes |
| `e2e-playbook-visual.mjs` | E2E test: playbook visual rendering |

## Engine Project Structure

```
ImNotAnAttorney-engine/
  src/
    config.mjs              ← Env vars, MODEL_MAP (27 entries), MAX_TOKENS_MAP, template paths
    worker.mjs              ← Entry point: poll loop, job dispatch, pipeline orchestration
    queue.mjs               ← claim_next_job (RPC), completeJob, failJob, retry logic
    supabase.mjs            ← Supabase client wrapper
    workers/
      ocr.mjs               ← Phase 1: PDF/image text extraction (pdf-parse + tesseract.js)
      classify.mjs           ← Phase 1: Document classification
      extract-entities.mjs   ← Phase 1: Named entity extraction
      finding-analysis.mjs   ← Phase 2: Case-level findings
      red-flags.mjs          ← Phase 2: Prosecution weaknesses
      questions.mjs          ← Phase 2: Attorney question generation
      timeline.mjs           ← Phase 2: Chronological reconstruction
      evidence.mjs           ← Phase 2: Evidence catalog
      chain-of-custody.mjs   ← Phase 2: Custody chain + gap detection
      witness-id.mjs         ← Phase 2: Witness identification
      score.mjs              ← Phase 2: Defense Strength Score
      report.mjs             ← Phase 3: Final report assembly
      judge-research.mjs     ← Phase 4: Judge profiling
      prosecutor-research.mjs ← Phase 4: Prosecutor profiling
      witness-dossier.mjs    ← Phase 4/6: Witness dossiers (Part 1 + Part 2)
      motion-analysis.mjs    ← Phase 5: Motion landscape
      case-law.mjs           ← Phase 5: Case law research
      strategy.mjs           ← Phase 5: Defense strategy synthesis
      cross-exam.mjs         ← Phase 6: Cross-examination scripts
      trial-material.mjs     ← Phase 6: Trial prep materials
      attack-intel.mjs       ← Phase 6: Attack intelligence
      update.mjs             ← Ongoing: War Room weekly updates
      citation-verify.mjs    ← Verification: Citation verification cascade
      docket-fetch.mjs       ← Data Fetch: Court docket retrieval
      legal-research.mjs     ← Data Fetch: Pre-generation legal research
      jurisdiction-profile.mjs ← Data Fetch: Jurisdiction context
      docket-monitor.mjs     ← Data Fetch: Ongoing docket alerts
    integrations/
      legal-verifier.mjs     ← CourtListener + eCFR + Wex verification
      docket-fetcher.mjs     ← CourtListener + JudyRecords docket fetch
      pacer-fetcher.mjs      ← PACER federal court records
      govinfo-fetcher.mjs    ← GovInfo API (US Code, CFR)
      serpapi-legal.mjs      ← SerpAPI Google Scholar search
  .github/
    workflows/
      process-jobs.yml       ← Cron: every 5 min, node src/worker.mjs --once
  package.json               ← 7 dependencies, Node.js ≥20
```

## Business Docs Structure

```
ImNotAnAttorney/
  system/
    EVALUATION-TEAM.md       ← 7 teams, 90 criteria, weight matrix
    EXPERT-REFERENCE.md      ← 63+ verified experts across 14 categories
    EMOTIONAL-INTELLIGENCE.md ← 8-dimension profiling, 4 psychological frameworks
    PIPELINE-MAP.md          ← 16 stages (00-15), tier coverage matrix
    DELIVERABLES-BY-TIER.md  ← v4 March 2026, 52 deliverables across 5 tiers
    BUYER-STATES.md          ← 6 states with intake signals + anti-patterns
    CONTENT-ARCHITECTURE-STANDARD.md ← 11 principles + 3-persona audit protocol
    CLIENT-JOURNEY.md        ← Per-tier timeline, 8 emotional moments, touchpoints
    Attorney-Personas/       ← 10 specialized personas + 11 masterclass transcripts
    templates/
      x-ray/                 ← X-Ray prompt templates (Stage 05)
      war-room/              ← War Room prompt templates (Stages 06-11)
      situation-room/        ← Situation Room prompt templates (Stages 12-14)
    data/
      motion-library.json    ← 30+ motions with legal basis (anti-hallucination)
      penalty-ranges.json    ← Charge-specific sentencing ranges
      statute-references.json ← Statute citations with verification metadata
      diversion-programs.json ← State-by-state diversion eligibility
      speedy-trial-rules.json ← State-specific speedy trial timelines
```

## Attorney Personas

10 specialized attorney personas in `ImNotAnAttorney/system/Attorney-Personas/` + 11 masterclass transcripts. Each persona is a subject matter expert profile used in prompt templates for charge-specific expertise:

- Charge-specific personas (DUI, Drug, Sex Offense, White Collar, Federal, Self-Defense, Domestic, Weapons)
- Cross-cutting personas (Trial Strategy, Motion Strategy)
- Each persona loads charge-specific expert pairs from the Expert Reference System

The masterclass transcripts provide additional grounding for complex analytical sections (motion analysis, cross-examination strategy, trial preparation).

## Cross-Reference: Business Documentation

For complete specifications beyond this architecture doc, see:

| Document | Path | Contents |
|----------|------|----------|
| Evaluation Framework | `ImNotAnAttorney/system/EVALUATION-TEAM.md` | 7 teams, 90 criteria, weight matrix, pass thresholds |
| Expert Reference | `ImNotAnAttorney/system/EXPERT-REFERENCE.md` | 63+ experts, categories, tier loading, Victor Knapp policy |
| Emotional Intelligence | `ImNotAnAttorney/system/EMOTIONAL-INTELLIGENCE.md` | 8 dimensions, 4 frameworks, stance calibration, 38-point checklist |
| Pipeline Map | `ImNotAnAttorney/system/PIPELINE-MAP.md` | 16 stages, tier coverage, convergence points |
| Deliverables by Tier | `ImNotAnAttorney/system/DELIVERABLES-BY-TIER.md` | v4 spec, 52 deliverables, pricing, guarantees |
| Buyer States | `ImNotAnAttorney/system/BUYER-STATES.md` | 6 states, signals, addressing strategies |
| Content Standard | `ImNotAnAttorney/system/CONTENT-ARCHITECTURE-STANDARD.md` | 11 principles, audit protocol |
| Client Journey | `ImNotAnAttorney/system/CLIENT-JOURNEY.md` | Per-tier timelines, touchpoints, emotional moments |
| Engine Config | `ImNotAnAttorney-engine/src/config.mjs` | MODEL_MAP, MAX_TOKENS_MAP, env vars |
| Engine Worker | `ImNotAnAttorney-engine/src/worker.mjs` | Pipeline orchestration, downstream scheduling |
| Engine Queue | `ImNotAnAttorney-engine/src/queue.mjs` | Job claim, retry strategy, requeue logic |
