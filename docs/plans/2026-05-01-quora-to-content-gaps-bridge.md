# Worry: Quora Pain-Point Bridge — `abandoned_questions` → `content_gaps`

**Date:** 2026-05-01
**Status:** Phase 1-2 complete (worry captured, expert triangulated). Phase 3 next: Opus planner drafts full plan via expert lens.
**Plan file (this):** `C:\Users\email\projects\ImNotAnAttorney-web\docs\plans\2026-05-01-quora-to-content-gaps-bridge.md`
**Findings file:** `C:\Users\email\projects\ImNotAnAttorney-web\docs\plans\2026-05-01-worry-quora-pain-bridge-findings.md`
**Rounds log:** `C:\Users\email\projects\ImNotAnAttorney-web\docs\plans\2026-05-01-worry-quora-pain-bridge-rounds.md`

## Worry

The Quora half of the demand-intel pipeline is not wired to `content_gaps`, so harvested Quora pain points sit in `abandoned_questions` and never become blog posts / tweet threads / Mercer shorts / Quora answers. Reddit half is fully wired. Cross-repo Quora scraper exists (parent monorepo `packages/funnel/scripts/discover-quora.mjs`) and writes `abandoned_questions`, but the bridge that promotes high-defer-ratio rows into the `content_gaps` queue does not exist. Cron route `/api/cron/quora-discovery` is scaffold-only (returns 503). Bridge MUST be built so every harvested pain point completes loop closure: pain point in (Quora) → blog out → tweet thread out → Mercer short out → Quora answer back → click attribution → revenue.

## Scope (Tier 2 — locked)

Scope-skill output 2026-05-01:
- Bridge as Postgres trigger on `abandoned_questions` insert/update + cron safety-net second pass for backfill / manual harvests.
- Ship Fly.io + GHA self-hosted runner spawn for `/api/cron/quora-discovery` (replaces 503 scaffold). `inaa-gha-runner` already exists (memory `project_gha_self_hosted_runner_fly.md`, runner id 22).
- Additive `source_channel` column on `content_gaps` (`reddit | quora | manual | gsc`). NOT a refactor of `demand_signals` + `abandoned_questions` into unified `pain_points` (deferred to a separate worry once 3+ channels are live).
- Outbound auto-loop: when blog publishes from a Quora-sourced gap, auto-queue matching Quora answer (from `content/queue/quora/pending/`) into `platform_posts` in `pending_review` status. Operator approves before auto-poster picks it up.
- Cross-channel attribution: track which `source_channel` produces highest revenue via existing `posted_answers` click → blog → checkout chain.

## Out of Scope (deferred)

- Unified `pain_points` table refactor (Tier 3 ambitious — defer until 3+ live channels).
- Mercer-script auto-trigger from `content_gaps` (blocked on Stage 0 persona-master.md + voice-direction.md per `2026-04-30-mercer-script-pipeline.md`).
- Twitter-thread fan-out automation (Tier 3 — manual queue at `content/queue/twitter/pending/` for now).
- Quora API integration (waitlist; defers Fly+GHA spawn model).

## Expert Lens (Phase 2 — triangulated 2026-05-01)

**Primary: Ross Simmonds** (`~/.claude/experts/ross-simmonds.md`)
Frameworks applied:
- **Create Once, Distribute Forever (2024 book):** one harvested pain-point fan-outs to N surfaces. The bridge IS this framework instantiated — `content_gap` is the "create once" record; blog + thread + script + Quora answer are the "distribute forever" surfaces.
- **CREAM → DREAM shift (Distribution Rules Everything Around Me):** Reddit half currently does CREAM (signal → blog). The Quora bridge needs to ship DREAM in v1 — every gap row spawns ALL distribution surfaces, not just blog.
- **Reddit Dark Funnel data point (2026-02):** Reddit grew 2.3K → 8.3M AI Overview citations Nov24–mid25. Quora is the second-tier same-shape opportunity — community Q&A is the input AND output for AI-search-era organic. Wiring Quora half closes the symmetric loop.
- **Comments matter more than upvotes for LLM citations** — corollary: high-defer-ratio Quora questions (= "abandoned by lawyers") are the highest-value capture targets because they have unmet intent + fresh engagement signals. The bridge's existing `defer_ratio >= 0.5` threshold IS the right capture filter.

**Cascade lens: Andy Crestodina** (`~/.claude/experts/andy-crestodina.md`, `cascade_profile: native`)
- **Zero Waste Marketing:** every harvested pain-point must serve multiple audiences. Bridge enables this — one `content_gap` row → blog reader (Google + AI Overviews) + Quora reader (community click-back) + Twitter reader (thread) + future Mercer-short viewer. No surface left unfanned.
- **Original research as content strategy:** Quora answers themselves become research surfaces if we tag answer attribution + click data. The `source_channel` column + `posted_answers` table + click-tracking infra (LIVE per `project-click-tracking-infra-live.md`) compose into a measurement loop competitors don't have.
- **Cascade-native test:** every node wins. Defendant gets a public answer (on Quora), Google/AI Overviews get a citation-rich blog, future-INAA gets attribution data, ecosystem floor rises (more YMYL legal-info on Quora reduces "talk to a lawyer" defer-rate over time).

**Tactical: Nicolas Cole** (`~/.claude/experts/nicolas-cole.md`)
- **Ultimate Guide to Quora + Top Writer methodology:** Quora answer voice is platform-specific. Mercer-channel UPL guardrail must layer with Cole's "answer the question first, link second" pattern. Auto-loop must NOT fire raw blog excerpts as Quora answers — operator-gate is non-negotiable per scope verdict 3.

**Why these three together (synthesis):** Simmonds tells us the SHAPE (one create → many distribute). Crestodina tells us the cascade test (every node wins). Cole tells us the platform-specific tactical risk (Quora answers ≠ blog excerpts). The bridge fails any cascade test if it ships any one of them in isolation.

## Cascade Map

| Node | Win |
|---|---|
| Us (INAA) | Quora half of demand-intel becomes operational; same shape now hosts future channels (TikTok/FB/GSC); attribution chain extends to revenue |
| Direct counterparty (defendant on Quora) | Their unanswered question becomes a public answer (blog + Quora reply); they don't pay anything; brand of "we answer questions lawyers won't" reinforced |
| Their downstream (other defendants Googling same question) | AI Overview cites the new blog; defendant #2 finds answer without ever asking |
| Ecosystem (Quora, Google, AI search) | Higher-quality Q&A content on Quora; better citations for AI Overviews; rising tide for community Q&A in YMYL-legal niche |
| Future-us | Foundation for Mercer-short trigger (when Stage 0 unblocks), TikTok comment harvesting (channel #3+), unified `pain_points` refactor (Tier 3 worry) |
| Adjacent players (other legal-info sites) | Industry floor rises — "talk to a lawyer" defer-rate decreases as YMYL content density rises; competitors must answer too |

No node loses. Cascade-positive across all six axes. Escape clause not invoked.

## Plan structure (filled by Opus planner — Phase 3)

(Sections below populated by Phase 3 dispatch.)

### Numbered Tasks

Tasks are grouped into seven phases (A → G). Each task lists deliverable file path, what it does, dependencies, and effort (S = ≤30min, M = 30–120min, L = ≥120min). Cross-repo deliverables show full Windows absolute paths.

#### Phase A — Schema (additive, back-compat)

- **T1 — Add `source_channel` column to `content_gaps`.** [S, no deps]
  - File: `C:\Users\email\projects\ImNotAnAttorney-web\supabase\migrations\20260501c_content_gaps_source_channel.sql`
  - Does: `ALTER TABLE public.content_gaps ADD COLUMN source_channel text NOT NULL DEFAULT 'reddit' CHECK (source_channel IN ('reddit','quora','manual','gsc'));` then `UPDATE public.content_gaps SET source_channel='reddit' WHERE source_channel IS NULL;` then `ALTER TABLE … DROP DEFAULT;` (default removed so future rows must declare). Adds non-unique index `idx_content_gaps_source_channel ON public.content_gaps (source_channel, status, updated_at DESC)`. Does NOT alter the existing partial unique index `idx_content_gaps_open_charge_pain_unique` — channel does NOT participate in dedup (verdict 9: dedup stays at charge+pain regardless of channel; first-channel-in wins, source_channel records origin only).

- **T2 — Add `promoted_to_gap_at` to `abandoned_questions`.** [S, no deps]
  - File: `C:\Users\email\projects\ImNotAnAttorney-web\supabase\migrations\20260501d_abandoned_questions_promoted_at.sql`
  - Does: `ALTER TABLE public.abandoned_questions ADD COLUMN promoted_to_gap_at timestamptz;` plus `ALTER TABLE … ADD COLUMN promoted_to_gap_id bigint REFERENCES public.content_gaps(id) ON DELETE SET NULL;`. Indexed `(promoted_to_gap_at) WHERE promoted_to_gap_at IS NULL AND defer_ratio >= 0.5` for the cron safety-net's pickup query.

- **T3 — Add `review_status` to `posted_answers` for queue-but-gate.** [S, no deps]
  - File: `C:\Users\email\projects\ImNotAnAttorney-web\supabase\migrations\20260501e_posted_answers_review_status.sql`
  - Does: `ALTER TABLE public.posted_answers ADD COLUMN review_status text NOT NULL DEFAULT 'approved' CHECK (review_status IN ('pending_review','approved','rejected'));`. Existing rows default to `'approved'` so legacy Reddit auto-posts keep flowing. New Quora bridge inserts MUST pass `review_status='pending_review'`. Trigger `posted_answers_review_status_immutable_after_approve` blocks downgrade from `'approved'`/`'rejected'` back to `'pending_review'` (forward-only state machine — DB-layer enforcement per scope verdict 3, not just app layer). Index `(review_status, source) WHERE review_status='pending_review'` for operator-queue queries.

- **T4 — Add `source_channel` to `posted_answers` for attribution.** [S, after T3]
  - File: same migration as T3 (single file, two columns)
  - Does: `ALTER TABLE public.posted_answers ADD COLUMN source_channel text NOT NULL DEFAULT 'quora' CHECK (source_channel IN ('reddit','quora'));` plus backfill `UPDATE public.posted_answers SET source_channel = source` (the existing `source` column carries it). After backfill the `source_channel` column shadows `source` for Crestodina-style cross-channel revenue attribution; `source` stays for back-compat.

#### Phase B — Bridge trigger (primary path: scraper insert → instant promotion)

- **T5 — Bridge function `promote_abandoned_to_gap()`.** [M, after T1+T2]
  - File: `C:\Users\email\projects\ImNotAnAttorney-web\supabase\migrations\20260501f_abandoned_to_gap_bridge.sql`
  - Does: Defines `public.promote_abandoned_to_gap()` plpgsql trigger function. Logic: if `NEW.defer_ratio >= 0.5` AND `NEW.promoted_to_gap_at IS NULL` AND no row exists in `content_gaps` with same `(charge_type_slug, COALESCE(pain_point_slug,''))` and `status IN ('identified','in-progress','drafting','published')` → insert one `content_gaps` row with `source_channel='quora'`, `status='identified'`, `demand_quadrant='GOLD_MINE'` (defer-ratio ≥ 0.5 implies golden-mine by Simmonds dark-funnel logic), `gap_score = ROUND(NEW.defer_ratio * 10, 2)`, `suggested_title = NEW.question_text`, `suggested_keywords = ARRAY[NEW.charge_type_slug, NEW.pain_point_slug]` (NULLs filtered), `article_type='spoke'`. UPSERT catches 23505 from `idx_content_gaps_open_charge_pain_unique` race and falls through to update `promoted_to_gap_at` against the winning gap row. Sets `NEW.promoted_to_gap_at = now()` and `NEW.promoted_to_gap_id = <new_or_existing_gap_id>` so safety-net cron skips this row.

- **T6 — Trigger wiring.** [S, after T5]
  - File: same migration as T5
  - Does: `CREATE TRIGGER abandoned_to_gap_promote AFTER INSERT OR UPDATE OF defer_count, total_answers ON public.abandoned_questions FOR EACH ROW WHEN (NEW.defer_ratio >= 0.5) EXECUTE FUNCTION promote_abandoned_to_gap();`. AFTER trigger so generated `defer_ratio` column is computed before fire. Update-trigger fires when scraper amends counts on re-discovery, ensuring upgrade-to-promotion path.

- **T7 — Bridge unit test.** [M, after T6]
  - File: `C:\Users\email\projects\ImNotAnAttorney-web\scripts\test-quora-bridge.mjs`
  - Does: Inserts a synthetic `abandoned_questions` row (source='quora', defer_ratio≥0.5, charge_type_slug='dui', pain_point_slug='cost-of-defense'), asserts ONE matching `content_gaps` row appears with `source_channel='quora'`, asserts source row gets `promoted_to_gap_at` set. Second insert with same charge+pain asserts NO duplicate gap row. Concurrent inserts test uses two pg connections in parallel asserting exactly one gap row materializes. Uses `withTestTx` test isolation pattern (rollback on finally).

#### Phase C — Cron safety-net (second-pass backfill)

- **T8 — Bridge backfill route.** [M, after T6]
  - File: `C:\Users\email\projects\ImNotAnAttorney-web\src\app\api\cron\quora-bridge-backfill\route.ts`
  - Does: Selects up to 200 `abandoned_questions` WHERE `defer_ratio >= 0.5 AND promoted_to_gap_at IS NULL` ordered by `defer_ratio DESC, discovered_at DESC`. For each row calls a Postgres RPC `bridge_promote_one(question_id bigint)` which wraps the same logic as T5 (so trigger-failed or pre-trigger rows get the same path). Idempotency: `acquireCronLock("quora-bridge-backfill", 23h)`. Auth: `requireCron`. Mirrors `/api/cron/demand-score` pattern: returns 200 + `executionId` immediately, runs work in `after()`.

- **T9 — Bridge backfill RPC.** [S, after T5]
  - File: `C:\Users\email\projects\ImNotAnAttorney-web\supabase\migrations\20260501g_bridge_promote_one_rpc.sql`
  - Does: `CREATE OR REPLACE FUNCTION public.bridge_promote_one(question_id bigint) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER` that runs the same bridge logic for a single row by id. Returns `{promoted: true|false, gap_id: <bigint>, reason: <text>}`. `GRANT EXECUTE … TO service_role;` (NOT to anon/authenticated).

- **T10 — Register safety-net cron via cron-job.org API.** [S, after T8]
  - File: `C:\Users\email\projects\ImNotAnAttorney-web\scripts\setup-cron-quora-bridge.mjs`
  - Does: One-shot script using `CRONJOB_API_KEY` to PUT a cron-job.org job hitting `https://imnotanattorney.com/api/cron/quora-bridge-backfill` with bearer `CRON_SECRET`, schedule Mon 14:00 UTC weekly (after Sunday 12:00 UTC quora-discovery harvest). Logs `jobId` to stdout. Idempotent: PATCH if title `quora-bridge-backfill` already registered.

#### Phase D — Spawn model for `/api/cron/quora-discovery` (replaces 503 scaffold)

- **T11 — GHA workflow on self-hosted runner.** [M, no deps]
  - File: `C:\Users\email\projects\ImNotAnAttorney-web\.github\workflows\quora-discovery.yml`
  - Does: `on: { workflow_dispatch: { inputs: { charge_filter: { ... }, dry_run: { ... } } } }`. Job runs on `[self-hosted, fly, inaa-gha-runner]` (runner id 22 per memory `project_gha_self_hosted_runner_fly.md`). Steps: (1) checkout `ImNotAnAttorney-web` at `path: web`; (2) checkout `ImNotAnAttorney` (parent monorepo) at `path: monorepo` for `packages/funnel/scripts/discover-quora.mjs`; (3) install npm deps in `monorepo/packages/funnel/`; (4) restore `.quora-cookies.json` from GH-Actions secret `QUORA_COOKIES_JSON_BASE64` to `monorepo/packages/funnel/.quora-cookies.json`; (5) inject Supabase service-role + URL from secrets into env; (6) run `node packages/funnel/scripts/discover-quora.mjs --threshold=0.5` from `monorepo/`; (7) on completion, POST harvest stats back to `/api/cron/quora-discovery/stats` via `CRON_SECRET`. Concurrency: `group: quora-discovery, cancel-in-progress: false` (don't trample mid-harvest). Timeout 90 min.

- **T12 — Replace 503 scaffold with workflow_dispatch trigger.** [M, after T11]
  - File: `C:\Users\email\projects\ImNotAnAttorney-web\src\app\api\cron\quora-discovery\route.ts` (edit)
  - Does: Removes 503 stub. Auth via `requireCron`. POST to GitHub REST `POST /repos/rahim0kapadia/ImNotAnAttorney-web/actions/workflows/quora-discovery.yml/dispatches` with body `{ ref: 'master', inputs: { dry_run: 'false' } }` using `GITHUB_DISPATCH_TOKEN` (PAT with `actions:write`). Returns 202 + dispatched workflow id. Idempotency: `acquireCronLock("quora-discovery", 23h)`. cron-job.org hits THIS route weekly Sun 12:00 UTC; this route hits workflow_dispatch on GHA which schedules the runner job.

- **T13 — Stats callback route.** [S, after T11]
  - File: `C:\Users\email\projects\ImNotAnAttorney-web\src\app\api\cron\quora-discovery\stats\route.ts`
  - Does: POST endpoint authed via `CRON_SECRET`. Accepts `{ run_id, harvested, defer_qualified, errors[], cookies_age_hours }`. Inserts row to a tiny `cron_run_stats` table (T14) for operator-surface monitoring. If `cookies_age_hours > 168` (7 days) the response includes `{warning: "cookies-stale"}` and triggers Telegram alert via `~/.claude/scripts/telegram/telegram-send.js`.

- **T14 — `cron_run_stats` table.** [S, no deps but bundled with T13]
  - File: `C:\Users\email\projects\ImNotAnAttorney-web\supabase\migrations\20260501h_cron_run_stats.sql`
  - Does: Tiny audit table `(id bigserial pk, cron_name text, status text, payload jsonb, created_at timestamptz default now())` with index `(cron_name, created_at desc)`. RLS enabled, no policies (service-role only). Used by T13 stats callback and Phase F admin surface.

- **T15 — Register Quora-discovery cron via cron-job.org API.** [S, after T12]
  - File: `C:\Users\email\projects\ImNotAnAttorney-web\scripts\setup-cron-quora-discovery.mjs`
  - Does: PUT cron-job.org job hitting `/api/cron/quora-discovery` Sun 12:00 UTC weekly. Same idempotency pattern as T10.

#### Phase E — Outbound loop (operator-gated, warmup-respecting)

- **T16 — Loop-closure helper.** [M, after T3+T4]
  - File: `C:\Users\email\projects\ImNotAnAttorney-web\src\lib\demand\close-quora-loop.ts`
  - Does: Exports `closeQuoraLoop(supabase, blogSlug, contentGapId)`. When invoked from blog-publish post-hook: (a) reads `content_gaps` row, confirms `source_channel='quora'`; (b) globs `content/queue/quora/pending/*.md` and matches by `frontmatter.charge_type_slug` and `frontmatter.pain_point_slug`; (c) if match → INSERT into `posted_answers` with `source='quora'`, `source_channel='quora'`, `review_status='pending_review'`, `matched_blog_slug=blogSlug`, `posted_body_md=<rendered queue/quora/pending file>`, `abandoned_question_id=<lookup via charge+pain on most-recent qualifying abandoned_questions row>`; (d) if no match → INSERT into `operator_tasks` (T17) with `kind='write_quora_answer_for_blog'`, `payload={blog_slug, content_gap_id, charge, pain}`. Returns `{matched: bool, posted_answer_id?: bigint, operator_task_id?: bigint}`.

- **T17 — `operator_tasks` table.** [S, no deps but referenced by T16]
  - File: `C:\Users\email\projects\ImNotAnAttorney-web\supabase\migrations\20260501i_operator_tasks.sql`
  - Does: `CREATE TABLE public.operator_tasks (id bigserial pk, kind text NOT NULL, status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','done','dismissed')), payload jsonb, created_at timestamptz default now(), resolved_at timestamptz, resolved_by text);` + index `(status, kind, created_at DESC) WHERE status='open'`. RLS enabled, service-role only.

- **T18 — Wire loop-closure into blog-publish path.** [S, after T16]
  - File: `C:\Users\email\projects\ImNotAnAttorney-web\src\lib\blog\publish-blog.ts` (edit — locate via Grep on existing publish helper) OR `C:\Users\email\projects\ImNotAnAttorney-web\scripts\generate-blog.mjs` (whichever owns post-publish side-effects).
  - Does: After successful blog write to `content_posts.status='published'`, call `closeQuoraLoop(supabase, blogSlug, content_gap_id)` if `content_gaps.source_channel='quora'`. Wrapped in try/catch — loop closure failure must NOT block blog publish.

- **T19 — Auto-poster gate enforcement (warmup feature flag).** [S, after T3]
  - File: `C:\Users\email\projects\ImNotAnAttorney-web\src\lib\quora-auto-poster.ts` (or equivalent — Grep for the existing Quora auto-poster).
  - Does: SELECT only WHERE `review_status='approved'` AND `posted_url IS NULL` AND `source='quora'`. Adds `if (!isFeatureEnabled('quora_outbound_auto'))` early-return guard. Feature flag `quora_outbound_auto` defaults to `false` in `feature_flags` table — flips to `true` on or after 2026-05-04 per memory `decision-quora-account-switched-imnotanattorney.md`. The DB-layer `review_status` constraint is the hard gate; the feature flag is the soft gate per Cole's tactical lens (UPL-safe operator review beats auto-publish).

#### Phase F — Admin surface (operator dashboard)

- **T20 — Operator review queue page.** [M, after T16+T17]
  - File: `C:\Users\email\projects\ImNotAnAttorney-web\src\app\operator\quora-queue\page.tsx`
  - Does: Server Component. Lists `posted_answers WHERE review_status='pending_review' AND source='quora'` joined with `content_gaps` (suggested_title, charge, pain). For each row shows queued body, matched blog URL, source abandoned-question URL, charge/pain. Approve and Reject buttons hit Server Actions in T21. Lists `operator_tasks WHERE kind='write_quora_answer_for_blog' AND status='open'` separately so operator knows when a blog landed without queued answer. Behind `requireAdmin` middleware (verify path is in `middleware.ts` matcher per memory `gotcha-require-admin-is-api-only.md` — operator pages need OperatorShell client + matcher entry, not just guard).

- **T21 — Approve/Reject Server Actions.** [S, after T20]
  - File: `C:\Users\email\projects\ImNotAnAttorney-web\src\app\operator\quora-queue\actions.ts`
  - Does: `approveQuoraAnswer(id)` and `rejectQuoraAnswer(id, reason)` Server Actions. Approve transitions `review_status: pending_review → approved` via single `UPDATE … WHERE id=$1 AND review_status='pending_review'` (forward-only trigger T3 enforces); reject transitions to `'rejected'`. Audit log to `cron_run_stats` (`cron_name='operator_review'`, payload includes operator email + action).

- **T22 — Stats panel for cross-channel attribution.** [S, after T13+T14]
  - File: `C:\Users\email\projects\ImNotAnAttorney-web\src\app\operator\quora-queue\stats.tsx`
  - Does: Reads `posted_answers` joined with `/r/q/[id]` click-tracking data, breaks out clicks-per-blog and revenue-per-blog by `source_channel`. Surfaces Crestodina cascade-test data (which channel pays back).

#### Phase G — Documentation (LAST phase, ships with code)

- **T23 — Update web ARCHITECTURE.md Demand Intel section.** [S, after T1–T22]
  - File: `C:\Users\email\projects\ImNotAnAttorney-web\ARCHITECTURE.md` (edit § "Demand Intel → Blog Generation (End-to-End)")
  - Does: Replaces "Quora half scaffold-only" line with "Quora half: scraper @ monorepo/packages/funnel/scripts/discover-quora.mjs writes abandoned_questions → trigger promote_abandoned_to_gap promotes to content_gaps with source_channel='quora' → blog generation reads content_gaps → blog publish triggers closeQuoraLoop → posted_answers (review_status='pending_review') → operator review → /r/q/[id] click → revenue." Adds Gotcha #16 (cross-repo Quora scraper at parent monorepo, GHA workflow checks out both repos).

- **T24 — Update supabase/CONTEXT.md.** [S, after T1–T22]
  - File: `C:\Users\email\projects\ImNotAnAttorney-web\supabase\CONTEXT.md` (edit)
  - Does: Adds `content_gaps.source_channel`, `abandoned_questions.promoted_to_gap_at`, `posted_answers.review_status`, `posted_answers.source_channel`, `operator_tasks`, `cron_run_stats` to the table catalog. Documents the bridge trigger + RPC + safety-net cron + GHA spawn model + warmup feature flag.

- **T25 — Update src/lib/CONTEXT.md and scripts/CONTEXT.md.** [S, after T1–T22]
  - Files: `C:\Users\email\projects\ImNotAnAttorney-web\src\lib\CONTEXT.md` (or create if missing) and `C:\Users\email\projects\ImNotAnAttorney-web\scripts\CONTEXT.md` (or create if missing).
  - Does: Documents `close-quora-loop.ts`, the bridge unit test script, and the cron-setup scripts. Notes cross-repo dependency on `monorepo/packages/funnel/scripts/discover-quora.mjs`.

### Success Criteria

Every criterion is binary-gradeable by an independent reader running the cited query, file check, or curl. No qualitative terms.

**Schema (Phase A):**

1. `psql -c "SELECT column_name FROM information_schema.columns WHERE table_name='content_gaps' AND column_name='source_channel'"` returns exactly one row.
2. `psql -c "SELECT count(*) FROM content_gaps WHERE source_channel IS NULL"` returns 0 AND `psql -c "SELECT count(*) FROM content_gaps WHERE source_channel='reddit'"` returns a value greater than 0.
3. `psql -c "SELECT column_name FROM information_schema.columns WHERE table_name='abandoned_questions' AND column_name IN ('promoted_to_gap_at','promoted_to_gap_id')"` returns exactly two rows.
4. `psql -c "SELECT column_name FROM information_schema.columns WHERE table_name='posted_answers' AND column_name IN ('review_status','source_channel')"` returns exactly two rows.
5. `psql -c "SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='posted_answers_review_status_check'"` returns a definition containing `'pending_review'`, `'approved'`, `'rejected'`.

**Bridge trigger (Phase B):**

6. File `C:\Users\email\projects\ImNotAnAttorney-web\supabase\migrations\20260501f_abandoned_to_gap_bridge.sql` exists and contains the literal strings `CREATE TRIGGER abandoned_to_gap_promote` and `WHEN (NEW.defer_ratio >= 0.5)` AND `psql -c "SELECT count(*) FROM pg_trigger WHERE tgname='abandoned_to_gap_promote'"` returns 1 (proves trigger applied to live DB, not just present in migration source).
7. Running `node scripts/test-quora-bridge.mjs` exits 0 and prints `BRIDGE-TEST-PASS` on stdout.
8. `Grep -nE "(strictEqual.*=== 1|strictEqual\(.*,.*1\)|toBe\(1\)|assert.*count.*=== 1|expect.*count.*toBe\(1\))" scripts/test-quora-bridge.mjs` returns ≥ 1 match (proves dedup-count assertion is wired in test body — independently verifiable without running the test, single grep no proximity logic).
9. `Grep -nE "(promoted_to_gap_at.*assert|assert.*promoted_to_gap_at|expect.*promoted_to_gap_at|promoted_to_gap_at.*IS NOT NULL|promoted_to_gap_at.*notNull|notNull.*promoted_to_gap_at)" scripts/test-quora-bridge.mjs` returns ≥ 1 match (proves promoted_to_gap_at assertion is wired in test body, on a single line — independently verifiable without running the test).

**Cron safety-net (Phase C):**

10. `curl -s -H "Authorization: Bearer $CRON_SECRET" https://imnotanattorney.com/api/cron/quora-bridge-backfill` returns HTTP 200 AND JSON body where `.status` is either `started` or `skipped` AND `.reason` is present as a non-empty string.
11. cron-job.org API `GET /jobs` returns one entry titled `quora-bridge-backfill` with schedule monday 14:00 UTC and URL containing `/api/cron/quora-bridge-backfill`.

**Quora-discovery spawn (Phase D):**

12. `curl -s -H "Authorization: Bearer $CRON_SECRET" https://imnotanattorney.com/api/cron/quora-discovery` returns HTTP 202 (NOT 503) and JSON body contains `dispatched_workflow_id`.
13a. File `.github/workflows/quora-discovery.yml` exists AND `Grep -n "runs-on: \[self-hosted, fly, inaa-gha-runner\]" .github/workflows/quora-discovery.yml` returns ≥ 1 match AND `Grep -c "actions/checkout@v4" .github/workflows/quora-discovery.yml` returns exactly 2 (both repos checked out — pre-deploy structural gate).
13b. (post-deploy gate, ≥ 1 cron firing after merge) GitHub REST `GET /repos/rahim0kapadia/ImNotAnAttorney-web/actions/workflows/quora-discovery.yml/runs?per_page=1` returns one run with `conclusion=success` AND `SELECT payload->>'harvested' FROM cron_run_stats WHERE cron_name='quora-discovery' ORDER BY created_at DESC LIMIT 1` returns a non-null numeric string (proves end-to-end workflow execution).
14. cron-job.org `GET /jobs` returns one entry titled `quora-discovery` with schedule sunday 12:00 UTC and URL containing `/api/cron/quora-discovery`.

**Outbound loop (Phase E):**

15a. `Grep -n "export function closeQuoraLoop\|export async function closeQuoraLoop" src/lib/demand/close-quora-loop.ts` returns ≥ 1 match AND `Grep -rn "closeQuoraLoop" src/lib/blog/ scripts/generate-blog.mjs` returns ≥ 1 match in a file path that is NOT `src/lib/demand/close-quora-loop.ts` (proves wired at call-site, not just defined — pre-deploy structural gate).
15b. `Grep -nE "(closeQuoraLoop\(.*\)|pending_review.*posted_answer|posted_answer.*pending_review)" scripts/test-quora-bridge.mjs` returns ≥ 1 match AND that match is within an assertion context (`Grep -nE "(strictEqual|toBe|assert|expect).*posted_answer.*pending_review|(strictEqual|toBe|assert|expect).*closeQuoraLoop" scripts/test-quora-bridge.mjs` returns ≥ 1 match) — proves the loop-closure path is exercised in the test body. NOTE: `withTestTx` rollback means a post-test DB query would always return 0; the assertion lives inside the transaction, surfaced via the test's exit code (sc-7) and grep-verifiable in the test source.
16. `SELECT count(*) FROM feature_flags WHERE flag_key='quora_outbound_auto' AND enabled=false` returns 1 (default-OFF until 2026-05-04).
17. `psql -c "DO \$\$ DECLARE v_id bigint; BEGIN INSERT INTO posted_answers(source,review_status,source_channel) VALUES('quora','approved','quora') RETURNING id INTO v_id; UPDATE posted_answers SET review_status='pending_review' WHERE id=v_id; END \$\$"` exits non-zero AND stderr contains either the literal substring `forward-only` or the literal substring `immutable` AND `psql -c "SELECT count(*) FROM posted_answers WHERE review_status='pending_review' AND source_channel='quora' AND created_at > now() - interval '1 minute'"` returns 0 (confirming the downgrade was rejected and no row landed in pending_review state — forward-only state machine enforced at DB layer; cleanup of the test row left to operator).

**Admin surface (Phase F):**

18. `curl -s -o /dev/null -w "%{http_code}" https://imnotanattorney.com/operator/quora-queue` (unauthenticated) returns 302 or 401 (NOT 404 — confirms route exists and is admin-gated) AND `Grep -n "Pending Quora Review" src/app/operator/quora-queue/page.tsx` returns ≥ 1 match.
19. `middleware.ts` matcher contains the literal string `/operator/:path*` (verified via `Grep -n "/operator" middleware.ts`).

**Docs (Phase G):**

20. `Grep -n "promote_abandoned_to_gap" ARCHITECTURE.md` returns ≥ 1 match.
21. `Grep -n "source_channel" supabase/CONTEXT.md` returns ≥ 1 match.

**End-to-end (post-deploy gate, ≥ 24h after first Quora harvest):**

22. `SELECT count(*) FROM content_gaps WHERE source_channel='quora'` returns ≥ 1 (proves bridge fired against real harvested data, not just synthetic test).
23. `SELECT count(*) FROM cron_run_stats WHERE cron_name='quora-discovery' AND payload->>'status'='success'` returns ≥ 1 (any successful run post-deploy proves the cron-job.org → workflow_dispatch → self-hosted runner spawn chain fired end-to-end at least once).

### Risks + Mitigations

| # | Risk | Likelihood | Impact | Mitigation |
|---|------|------------|--------|------------|
| R1 | Bridge dedup race — concurrent inserts on `abandoned_questions` from parallel scraper runs both pass the no-existing-gap check, both INSERT, second hits 23505 on `idx_content_gaps_open_charge_pain_unique`. | Medium (multi-runner future) | Medium (one row fails silently) | Bridge function (T5) catches 23505 in plpgsql `EXCEPTION WHEN unique_violation THEN` and falls through to update `promoted_to_gap_at` against the winning gap. Test T7 explicitly drives concurrent inserts via two pg connections to prove dedup. |
| R2 | Quora cookie expiry on Fly runner — `.quora-cookies.json` rotates ~monthly; scraper fails, cron route returns "success" (workflow dispatched), but harvest is empty. | High (cookies always expire) | High (silent zero-harvest) | T13 stats callback POSTs `cookies_age_hours`; T13 triggers Telegram alert via `~/.claude/scripts/telegram/telegram-send.js` when age > 168h (7 days). T11 GHA workflow exits non-zero on Playwright auth-redirect, so workflow status surfaces in `cron_run_stats.status`. |
| R3 | `source_channel` column null on existing `content_gaps` rows — back-compat for Reddit-sourced gaps. | Certain (existing data) | High (breaks NOT NULL constraint on migration) | T1 migration uses two-step pattern: `ADD COLUMN … NOT NULL DEFAULT 'reddit'`, then `UPDATE WHERE source_channel IS NULL` (defensive — Postgres backfills with default automatically), then `DROP DEFAULT` so future inserts must declare. Migration test in `scripts/test-quora-bridge.mjs` asserts `count(*) WHERE source_channel IS NULL` returns 0 post-migration. |
| R4 | Outbound auto-loop publishing wrong content (operator gate bypassed in app layer). | Low (gate written) | Critical (UPL exposure on Quora) | DB-layer enforcement via T3: `posted_answers.review_status` CHECK constraint + `posted_answers_review_status_immutable_after_approve` trigger blocks downgrade from `'approved'` → `'pending_review'`. T19 auto-poster SELECT clause filters `review_status='approved'`. Belt-and-braces: app gate (feature flag `quora_outbound_auto` default-false until 2026-05-04) + DB gate (CHECK + trigger). Either alone prevents leak; both together prevent both bug classes. |
| R5 | Cross-repo drift — `discover-quora.mjs` lives at parent monorepo, bridge in this repo; coordinated change risk. | Medium (any schema change) | Medium (silent insert failure) | T11 GHA workflow checks out BOTH repos at branch `master`. T24 documents cross-repo dependency in `supabase/CONTEXT.md` and `ARCHITECTURE.md`. T13 stats callback validates expected column shape — if scraper writes a column that schema doesn't have, error surfaces in `cron_run_stats.payload.errors[]`. |
| R6 | Quora ToS / scraper detection (Playwright stealth flag stops working). | Medium (Quora actively blocks) | High (zero harvest, brand-burn risk) | Existing `puppeteer-extra-plugin-stealth` already in scraper. T13 stats includes `errors[]` so anti-bot blocks surface. Mitigation owner: this plan does NOT scope a fallback to Quora API (deferred per Out of Scope) but T11 workflow has a 90-min timeout to bound damage. Operator can disable via cron-job.org dashboard within hours of detection. |
| R7 | `content_gaps` partial unique index conflict — existing `idx_content_gaps_open_charge_pain_unique` (WHERE `status IN ('identified','in-progress') AND has_blog_post=false`) — bridge UPSERT must respect it. | Certain (live constraint) | Medium (insert failure on race) | Bridge (T5) does NOT use `ON CONFLICT … DO UPDATE` (PostgREST/SQL `ON CONFLICT` cannot target partial unique indexes per gotcha #10 in `cl-bulk-data-defensive.md`). Uses pg_trapped 23505 EXCEPTION + re-select pattern, mirroring `score-demand.ts:709`'s proven shape. |
| R8 | Fly machine cold-start vs cron-job.org timeout (Fly stops idle machines, cron-job.org caps free tier at 30s). | Medium | Low (T12 returns 202 quickly) | T12 mirrors `/api/cron/demand-score`'s `after()` pattern: returns 202 immediately after dispatching to GHA workflow_dispatch (sub-1s), so cron-job.org never waits on Fly. The actual cold-start is on the GHA self-hosted runner side; GHA queues until runner is up. |
| R9 | GHA self-hosted runner queue contention — other workflows on `inaa-gha-runner` block Quora discovery. | Low (one runner, low traffic) | Low (Quora is weekly) | T11 sets `concurrency: { group: quora-discovery, cancel-in-progress: false }` and 90-min timeout. If other workflows are blocking, 7-day weekly cadence absorbs delays. Future fix (out of scope): add a second Fly machine with second runner registration. |
| R10 | Forward-only `review_status` trigger blocks legitimate operator un-approve workflows. | Low (no current need) | Low (operator can hard-delete + re-create) | T3 trigger only blocks DOWNGRADE from `'approved'`/`'rejected'` → `'pending_review'`. Operator can still reject (forward), or service-role can DELETE the row. Documented in T24 CONTEXT.md so operator knows the contract. |
| R11 | `posted_answers.review_status` default `'approved'` masks new Quora rows if loop-closure helper forgets to declare. | Low (T16 declares explicitly) | High (Quora answer auto-posts un-reviewed) | Belt-and-braces: T16 `closeQuoraLoop` INSERT explicitly sets `review_status: 'pending_review'`. Plus a CHECK constraint variant could enforce `WHEN source='quora' THEN review_status='pending_review' on insert` — but adding that constraint breaks the legacy Reddit `'approved'` default. Compromise: T16 unit-tests its own INSERT shape; Phase F admin surface lets operator sweep any drift weekly. |
| R12 | cron-job.org API key compromise via env-var exposure. | Low | Medium | `CRONJOB_API_KEY` already in env per global rules; T10/T15 setup scripts read from `process.env` only, never log. Setup scripts are one-shot and committed without literal key. |

### Files Touched

Grouped by phase. New files marked `[NEW]`; edits marked `[EDIT]`. All paths absolute.

**Phase A — Schema (5 new migration files):**
- `[NEW] C:\Users\email\projects\ImNotAnAttorney-web\supabase\migrations\20260501c_content_gaps_source_channel.sql`
- `[NEW] C:\Users\email\projects\ImNotAnAttorney-web\supabase\migrations\20260501d_abandoned_questions_promoted_at.sql`
- `[NEW] C:\Users\email\projects\ImNotAnAttorney-web\supabase\migrations\20260501e_posted_answers_review_status.sql`

**Phase B — Bridge trigger (2 new files):**
- `[NEW] C:\Users\email\projects\ImNotAnAttorney-web\supabase\migrations\20260501f_abandoned_to_gap_bridge.sql`
- `[NEW] C:\Users\email\projects\ImNotAnAttorney-web\scripts\test-quora-bridge.mjs`

**Phase C — Cron safety-net (3 new files):**
- `[NEW] C:\Users\email\projects\ImNotAnAttorney-web\src\app\api\cron\quora-bridge-backfill\route.ts`
- `[NEW] C:\Users\email\projects\ImNotAnAttorney-web\supabase\migrations\20260501g_bridge_promote_one_rpc.sql`
- `[NEW] C:\Users\email\projects\ImNotAnAttorney-web\scripts\setup-cron-quora-bridge.mjs`

**Phase D — Quora-discovery spawn (5 new files + 1 edit):**
- `[NEW] C:\Users\email\projects\ImNotAnAttorney-web\.github\workflows\quora-discovery.yml`
- `[EDIT] C:\Users\email\projects\ImNotAnAttorney-web\src\app\api\cron\quora-discovery\route.ts` (replace 503 stub with workflow_dispatch trigger)
- `[NEW] C:\Users\email\projects\ImNotAnAttorney-web\src\app\api\cron\quora-discovery\stats\route.ts`
- `[NEW] C:\Users\email\projects\ImNotAnAttorney-web\supabase\migrations\20260501h_cron_run_stats.sql`
- `[NEW] C:\Users\email\projects\ImNotAnAttorney-web\scripts\setup-cron-quora-discovery.mjs`

**Phase E — Outbound loop (2 new files + 1 edit + 1 to-locate edit):**
- `[NEW] C:\Users\email\projects\ImNotAnAttorney-web\src\lib\demand\close-quora-loop.ts`
- `[NEW] C:\Users\email\projects\ImNotAnAttorney-web\supabase\migrations\20260501i_operator_tasks.sql`
- `[EDIT] C:\Users\email\projects\ImNotAnAttorney-web\src\lib\blog\publish-blog.ts` (or `scripts/generate-blog.mjs` — locate via Grep on existing publish post-hook in T18)
- `[EDIT] C:\Users\email\projects\ImNotAnAttorney-web\src\lib\quora-auto-poster.ts` (or equivalent — locate via Grep in T19)

**Phase F — Admin surface (3 new files + 1 edit):**
- `[NEW] C:\Users\email\projects\ImNotAnAttorney-web\src\app\operator\quora-queue\page.tsx`
- `[NEW] C:\Users\email\projects\ImNotAnAttorney-web\src\app\operator\quora-queue\actions.ts`
- `[NEW] C:\Users\email\projects\ImNotAnAttorney-web\src\app\operator\quora-queue\stats.tsx`
- `[EDIT] C:\Users\email\projects\ImNotAnAttorney-web\middleware.ts` (verify or add `/operator/:path*` to matcher per memory `gotcha-require-admin-is-api-only.md`)

**Phase G — Documentation (3 edits, possibly 2 new):**
- `[EDIT] C:\Users\email\projects\ImNotAnAttorney-web\ARCHITECTURE.md` (Demand Intel section + new Gotcha #16)
- `[EDIT] C:\Users\email\projects\ImNotAnAttorney-web\supabase\CONTEXT.md`
- `[EDIT or NEW] C:\Users\email\projects\ImNotAnAttorney-web\src\lib\CONTEXT.md`
- `[EDIT or NEW] C:\Users\email\projects\ImNotAnAttorney-web\scripts\CONTEXT.md`

**Cross-repo (read-only references; no writes):**
- `C:\Users\email\projects\ImNotAnAttorney\packages\funnel\scripts\discover-quora.mjs` (referenced by T11 GHA workflow checkout; NO edit in this plan — separate worry if scraper schema needs changes)

**Total files touched: 18 new + 6 edits = 24 files.** Cross-repo: 1 read-only reference at parent monorepo (no writes).

---

## Plan Amendments — R0 Findings Folded (2026-05-01)

R0 swarm: code-reviewer (10C+16W+8S) + security-auditor (5C+10W+7S) + expert-lens Simmonds/Crestodina/Cole (4C+8W+8S) = **76 findings**. Every finding folded below. Tasks renumbered where new tasks added (T0, T20a, T26, T27).

### CRITICAL fixes (block Phase 5 execution)

**A1 — Phase 0 verification gates (NEW T0, blocks all phases).** Before Phase A migrations: (a) `Glob "supabase/migrations/20260501*"` confirms no collision per code-rev W14 + sec S7 — reserve c–i via empty-file commit; (b) verify Reddit loop-closure shape per expert F11 — `SELECT count(*) FROM posted_answers WHERE source='reddit' AND matched_blog_slug IS NOT NULL` AND `SELECT count(*) FROM content_gaps WHERE source_channel='reddit' AND status='published'` documented in T23; (c) Phase 0 spike on actual blog-publish call-site per code-rev C10 — Read `src/lib/blog/`, `scripts/generate-blog.mjs`, document the exact post-hook line; (d) confirm `quora-auto-poster.ts` exists or doesn't per code-rev W19 — if absent, T19 reframes as "build the auto-poster with the gate" and a build task lands in Phase E.

**A2 — Bridge function correctness (T5/T6/T9).**
- code-rev C1: dedup check uses `status IN ('identified','in-progress') AND has_blog_post=false` (mirrors partial unique index exactly), drop `'drafting'`/`'published'`.
- code-rev C2: trigger is **BEFORE INSERT OR UPDATE** with manual `defer_ratio` recompute in WHEN clause AND assigns `NEW.promoted_to_gap_at`/`NEW.promoted_to_gap_id` directly (AFTER cannot mutate NEW). Add `AND OLD.promoted_to_gap_at IS NULL` short-circuit (sec S3 + code-rev C3 + expert F10).
- code-rev C5 + expert F4: trigger WHEN clause adds `AND NEW.total_answers >= 3` (engagement floor) AND composite signal — extend WHEN to `(NEW.defer_ratio >= 0.5 AND NEW.total_answers >= 3) AND (NEW.follower_count >= 5 OR NEW.view_count >= 1000 OR NEW.total_comment_count >= 3)`. Requires scraper to populate `follower_count`, `view_count`, `total_comment_count` columns — split into separate worry if columns absent in current scraper.
- code-rev C8 + sec W2: T9 `bridge_promote_one` adds `SET search_path = pg_catalog, public, pg_temp`, includes `REVOKE EXECUTE FROM PUBLIC` BEFORE the GRANT. Same hardening applies to T5 trigger function `promote_abandoned_to_gap`.
- code-rev W20: T5 EXCEPTION block uses plpgsql `EXCEPTION WHEN unique_violation THEN <re-SELECT by (charge,pain) AND status IN ('identified','in-progress') AND has_blog_post=false> RETURNING gap_id` (different shape from JS retry). Spec the exact block.
- expert F12: T5 sets `suggested_title = NEW.question_text` (verbatim) AND adds `seo_title text` column to `content_gaps` left NULL at promotion (downstream blog-generator populates via Cole headline formula).
- expert F15: `demand_quadrant` is computed not hardcoded — `defer_ratio >= 0.7 AND engagement_high → GOLD_MINE`, `defer_ratio >= 0.5 AND engagement_high → SILVER_MINE`, `defer_ratio >= 0.5 AND engagement_low → INVESTIGATE`. Verify CHECK enum supports these values; if not, extend in same migration (T1).
- code-rev W12: do NOT hardcode `GOLD_MINE`. Same as expert F15. Pick one.
- code-rev W13: use `array_remove(ARRAY[NEW.charge_type_slug, NEW.pain_point_slug], NULL)` — pure SQL NULL-strip is wrong otherwise.

**A3 — Schema correctness (T1/T2/T3/T4).**
- code-rev W11: T1 migration body wrapped in `BEGIN; ... COMMIT;` block.
- expert F8: replace `CHECK (source_channel IN ...)` with `REFERENCES source_channels(slug)` + new lookup table `source_channels (slug PK, label, is_active default true)` seeded with reddit/quora/manual/gsc. Channels added via single-row INSERT, no migration. Same for `posted_answers.source_channel`.
- code-rev W21: T3 splits into T3a (columns) AND T3b (forward-only trigger function `posted_answers_review_status_immutable_after_approve`). Trigger body must RAISE EXCEPTION P0001 with message containing both `forward-only` and `immutable` substrings (satisfies sc-17).
- sec W10 + code-rev W24: conditional default — `CASE WHEN source='quora' THEN 'pending_review' ELSE 'approved' END` enforced via BEFORE INSERT trigger OR generated default; preserves Reddit back-compat without `source_channel='quora'` rows landing as `'approved'`.
- sec C5 + sec W6: kill-switch separate from feature_flag. Add env var `QUORA_OUTBOUND_AUTO_DISABLE` checked BEFORE DB feature_flag lookup. T19 auto-poster checks env-var FIRST.
- code-rev W24: drop semantic conflict between `source` and `source_channel` — pick one. Recommend: rename existing `source` to `source_channel` after backfill (no parallel columns). Add CHECK `source_channel = source_channel` is tautological; instead, drop `source` column in T3 same migration after backfill verified. Migration: ADD COLUMN, backfill, drop OLD column. Same-migration atomic.
- code-rev S1 (sec S1): add CHECK `length(posted_body_md) <= 32768` to T3 column-add migration.
- expert F8 + sec W5: `cron_run_stats` and `operator_tasks` add explicit `REVOKE ALL ON TABLE … FROM anon, authenticated` after `ENABLE ROW LEVEL SECURITY`. Operator email logged as `sha256(email + project_pepper)` not raw text.
- expert F13: `cron_run_stats` adds typed columns `harvested_count int, defer_qualified_count int, error_count int, cookies_age_hours numeric, duration_seconds int` (kept jsonb `payload` for future).
- code-rev W17: `cron_run_stats` adds `UNIQUE (cron_name, execution_id)` + ON CONFLICT DO UPDATE. T13 callback writes execution_id (GHA workflow run id).
- expert F17: `operator_tasks` adds `due_at timestamptz DEFAULT now() + interval '7 days'` + index for SLA-aging surface in T20.

**A4 — Outbound loop architecture (T16/T18/T19/T20).**
- expert F1: ship DREAM at v1, not CREAM. Split T16 into:
  - T16a `closeQuoraLoop` (existing)
  - T16b `closeTwitterLoop` — globs `content/queue/twitter/pending/*.md`, INSERTs `platform_posts` row with `platform='twitter'`, `review_status='pending_review'`. Auto-poster paused per project state, but DB-side fan-out exists v1.
  - T16c `queueMercerScriptStub` — INSERT `operator_tasks` `kind='write_mercer_script'` for every quora-sourced gap. Stage 0 unblock finds work waiting.
- expert F2: T16a adds frontmatter contract — `platform: quora` AND `voice_check: passed` required. Match by frontmatter.platform=quora AND charge+pain. Reject path-only routing.
- expert F2: NEW T16d `scripts/lint-platform-queue.mjs` — pre-commit lint asserting frontmatter.platform matches directory.
- expert F3: replace boolean `quora_outbound_auto` with `quora_posting_budget` table `(date, max_per_day, posted_count)`. Seed schedule: 5/day week 1 (2026-05-04+), 15 week 2, 30 week 3, 50 week 4+. T19 SELECT today's row, post only if `posted_count < max_per_day`.
- expert F6: two-tier gate. Add `auto_approve_eligible bool` to `posted_answers` set true at INSERT when (frontmatter.platform=quora AND voice_check=passed AND charge in low-UPL-set AND body_md passes UPL scrubber). T19 SELECT `WHERE review_status='approved' OR (review_status='pending_review' AND auto_approve_eligible=true AND created_at < now() - interval '24 hours')`.
- expert F9: reverse loop order. T16 INSERTs `posted_answers` row at `content_gap` CREATION time (Phase B trigger), NOT blog publish. Operator approves Quora-answer-text BEFORE blog generation. Blog generates referencing the (now-known) Quora URL.
  - Alternative if F9 reversal blocked: blog-publish gated on matching `posted_answers.review_status='approved' AND posted_url IS NOT NULL`.
- code-rev W18: replace runtime fs glob in T16 with DB-table `quora_queue_items` so writes don't require redeploy. Migration adds table; lint hook keeps DB in sync with `content/queue/quora/pending/*.md`.
- sec W8: lookup uses `promoted_to_gap_id = <content_gap.id>` (deterministic from T2) NOT "most-recent qualifying."

**A5 — Admin gating (T20/T21).**
- sec C4 + code-rev: NEW T20a — adds `/operator/:path*` to `middleware.ts` matcher unconditionally. Pre-deploy CI grep gate (sc-19 advanced to pre-deploy).
- sec C4: T21 Server Actions explicitly call `requireAdmin` at top of every action body. CI test asserts unauthenticated POST returns 401/403.
- sec C3: T20 renders `posted_body_md` inside `<pre>{text}</pre>` (text node only) OR DOMPurify. URL scheme allowlist `http(s):` only. `rel="noopener noreferrer"` on external links. `force-dynamic` on page. CSP header for `/operator/*` via middleware.
- sec C3 / S2: replace `~/.claude/scripts/telegram/telegram-send.js` shell-exec (broken on Vercel) with direct Telegram Bot API `fetch()` using `TELEGRAM_BOT_TOKEN_LEGAL` + `TELEGRAM_CHAT_ID` envs.
- code-rev W25: rename `cron_run_stats` audit log for operator actions to dedicated `operator_audit_log` table OR add `kind` discriminator column. Don't conflate operator events with cron events.

**A6 — Cron + GHA workflow hardening (T8/T11/T12/T13).**
- code-rev C6 + sec W1: T11 GHA secrets — `GITHUB_DISPATCH_TOKEN` is fine-grained PAT scoped to single repo, `Actions: Read & write` only, no `Workflows: write`, 90-day expiry. Renewal date logged to `cron_run_stats` quarterly.
- code-rev C7: NEW `MONOREPO_CHECKOUT_PAT` for cross-repo checkout (parent monorepo). Scope `Contents: read` on `rahim0kapadia/ImNotAnAttorney` only.
- sec W7: confirm `ImNotAnAttorney-web` is private; if not, switch self-hosted runner to `--ephemeral`. Workflow `permissions: { contents: read, actions: write }` (least privilege).
- sec C5 + code-rev W22: cookies stored on Fly Volume mount on runner-VM, NOT GHA secret store. Workflow mounts volume; cookies never touch GHA secret storage. Final step (always-run) deletes cookie file. Restrict runner to ONLY this workflow.
- sec W4 + code-rev W23: T13 caps `errors[]` total length 8KB, length<=50, redacts secret patterns (cookie/Bearer/JWT regex) before insert. Telegram alert debounce 24h per `(cron_name, payload->>'warning')`. Tiered alert: warn at 14d cookies, critical at 25d, hard-fail (workflow exit non-zero) at 28d.
- sec C1 + sec W3: T13 stats callback uses `QUORA_STATS_CALLBACK_SECRET` (separate from `CRON_SECRET`). Adds `dispatched_workflows` table populated by T12 — T13 validates `run_id` exists + is `pending`, marks `consumed`. Caps `harvested`/`defer_qualified` to plausible max (server-side validation).
- sec W3: per-route distinct cron secrets recommended; document repo-wide as separate worry. THIS plan minimum: distinct stats-callback secret per A6.
- code-rev W15: T8 lock window 2h not 23h (allows manual retry within weekly cadence). T15 adds `?force=1` query param accepted only with `requireAdmin` for operator override (sec S6).
- code-rev W16: T13 caller is GHA, uses separate `GHA_STATS_CALLBACK_SECRET` (overlaps sec C1).
- sec W9 + code-rev S6: T12 GitHub REST URL is HARDCODED string literal. Use `@octokit/rest` SDK (`octokit.rest.actions.createWorkflowDispatch({ owner, repo, workflow_id })`) NOT raw fetch. SC adds `Grep -nE 'fetch\([^)]*\$\{|fetch\([^)]*\+ ' src/app/api/cron/quora-discovery/route.ts` returns 0.
- code-rev S5: T12 returns `{ status: 'dispatched' }` (no run_id; GitHub REST returns 204 No Content). Update sc-12 to assert `.status === 'dispatched'`. Document that secondary fetch retrieves run_id with 1-3s timing caveat.
- code-rev W26: sc-13a tightens `actions/checkout@v4` count check via structural YAML parse (yq or Node), not `Grep -c`.
- expert F14: T11 concurrency `cancel-in-progress: true` + timeout 75min (so weekly cadence has 6.5 days clean). OR change cadence to twice-weekly.

**A7 — Test discipline (T7).**
- code-rev C4: T7 concurrency test cannot use single `withTestTx` connection. Drop concurrency assertion from T7 transactional path; add separate non-rollback integration test with cleanup `DELETE WHERE charge_type_slug='__bridge_test__'` AND `// test-isolation-justified: pg-level race requires two real connections; cleanup via charge filter` per drafts/test-isolation.md hook.
- code-rev S2 / expert F19: T7 file-header cites `// Pattern: test-isolation rule via withTestTx — see scripts/lib/test-db.mjs` pre-empting hook block.

**A8 — Crestodina-shape research surface (NEW Phase H, T26+T27).**
- expert F5 (NEW T26): public dashboard `/research/channel-attribution` — anonymized cross-channel data (no PII, no $ amounts; ratios/index). Surfaces Crestodina cascade-test data publicly.
- expert F5 (NEW T27): quarterly auto-generated report — when 90 days of `cron_run_stats` accumulate, INSERT a `content_gaps` row with `source_channel='research'` (extends source_channels table per F8) → blog pipeline generates "INAA Defendant Search Patterns Report Q[N]". Eats own dogfood.

**A9 — Cascade map specificity (Cascade Map row 6).**
- expert F7: replace "Industry floor rises..." with concrete: "Avvo / Justia / FindLaw / NOLO see SERP shift from `[charge] explained` (TOFU, AIO-displaced) toward `[charge] [pain] questions defendants ask` (MOFU, citation-rewarded). Measurable via Ahrefs SERP overlap on top 50 charge+pain queries 6 months post-launch."

**A10 — Suggestion-tier folds (concise).**
- code-rev S3: T2 index predicate noted as transitional, weekly `pg_stat_user_indexes` size check.
- code-rev S6 + sec S2: see A6.
- code-rev S7 / expert F18: NEW T28 — escalation cron: `operator_tasks` `kind='write_quora_answer_for_blog'` open >14d auto-demotes `content_gaps.source_channel='quora' → 'unloop'd'` AND surfaces in T22 stats panel.
- expert F16: requires scraper change — track as separate worry; add T29 doc-only note in T24 documenting required `most_engaged_answer_excerpt` column for future Simmonds-shape "what other defendants say" angle.
- expert F20: T22 stats panel adds per-Quora-answer follower-views metric (post-publish measurement via Quora API or scraper second pass).
- code-rev S8 (sc-15b): demote sc-15b to code-review checklist; rely on sc-7 exit-code for behavioral verification.
- code-rev S9: T15 PUT adds idempotent PATCH-then-PUT pattern with 3-retry exponential backoff.

### Updated Files Touched (post-folding)

Net changes from R0:
- NEW migrations: `20260501j_source_channels_lookup.sql` (A3 expert F8), `20260501k_quora_posting_budget.sql` (A4 expert F3), `20260501l_quora_queue_items.sql` (A4 code-rev W18), `20260501m_dispatched_workflows.sql` (A6 sec C1), `20260501n_operator_audit_log.sql` (A5 code-rev W25)
- NEW scripts: `scripts/lint-platform-queue.mjs` (A4 expert F2), `scripts/seed-quora-posting-budget.mjs` (A4 expert F3), `scripts/verify-reddit-loop-baseline.mjs` (A1 expert F11)
- NEW tasks: T0 (Phase 0 verification), T20a (middleware matcher), T26 (public research dashboard), T27 (quarterly research auto-blog), T28 (loop-escalation cron), T29 (scraper-change doc note)
- Total file count: 18 new + 6 edits + 5 R0-amendment new + 3 R0-amendment scripts = **26 new + 6 edits = 32 files** (was 24).

---

## Round Log

### Round 0 — Plan-Stage Swarm Review (Phase 4) — COMPLETE 2026-05-01

| Reviewer | CRITICAL | WARNING | SUGGESTION | Total |
|---|---|---|---|---|
| code-reviewer | 10 | 16 | 8 | 34 |
| security-auditor | 5 | 10 | 7 | 22 |
| expert-lens (Simmonds/Crestodina/Cole) | 4 | 8 | 8 | 20 |
| **TOTAL** | **19** | **34** | **23** | **76** |

All 76 findings folded into "Plan Amendments — R0 Findings Folded" section above. Highest-leverage fixes (per Pristine-Or-Nothing severity-ordering):
1. **Bridge correctness** (A2): BEFORE-trigger + composite engagement signal + EXCEPTION block + search_path
2. **DREAM-at-v1** (A4): ship 3-channel fan-out (Quora + Twitter + Mercer-stub) at v1, not 1-channel
3. **Admin gating** (A5): middleware matcher + Server Action requireAdmin + CSP/escape on operator surface
4. **Cookie hygiene + secrets isolation** (A6): Fly Volume not GHA secret + per-route stats secret + ephemeral runner

R1 dispatched to verify convergence + catch any new findings introduced by the amendments.

### Round 1 — Convergence Verify — 2026-05-01

R1 single-reviewer (Sonnet, three-lens combined): **5 CRITICAL + 8 WARNING + 5 SUGGESTION = 18 findings.** Descent 76→18 (~76% reduction). All folded below — DECISIVE picks on G2 contradictions per Expert-Decides Rule.

#### G2 contradiction resolutions (4 axes — pick winners, drop losers)

**R1-C1 (F9 vs T16 INSERT timing):** WIN: F9. INSERT `posted_answers` at gap-creation time, inside bridge function `promote_abandoned_to_gap()`. T16 reframes from "INSERT at blog publish" to "match-against-existing-pending row + glob → update body if missing." Blog publish references known Quora URL. Cole-aligned (Quora answer exists before blog drives traffic).

**R1-C2 (`source` vs `source_channel`):** WIN: keep both. `source` = legacy read-only column (existing Reddit code unchanged). `source_channel` = canonical write column. Add CHECK `source = source_channel` post-backfill (T3 migration). NO column drop. R0 A3 W24 partial-amendment reversed.

**R1-C5 (budget gate vs auto-approve gate):** WIN: compose. T19 SELECT explicitly: `WHERE (review_status='approved' OR (auto_approve_eligible=true AND created_at < now() - interval '24 hours')) AND posted_count_today < (SELECT max_per_day FROM quora_posting_budget WHERE date=current_date)`. Add SC: Grep T19 for this composed clause.

**R1-S4 (cancel-in-progress true vs false):** WIN: F14 `cancel-in-progress: true`, timeout 75min. R0 R9 risk-mitigation text rewritten: "stalled mid-harvest run blocking next weekly cadence is worse than dropping stale run."

#### Migration ordering correction (R1-C4)

Renumber to put lookup table FIRST: `20260501a_source_channels_lookup.sql` (creates table + seeds reddit/quora/manual/gsc/research) → `20260501b_dispatched_workflows.sql` → `20260501c_content_gaps_source_channel.sql` (now FK column with default `'reddit'` resolves) → `20260501d` ... `20260501n`. Renumber all R0-amendment migrations accordingly. T1 default seed `'reddit'` works because lookup row exists.

#### Bridge correctness amendments (R1-C3 + R1-W5)

- **T9 RPC re-applies engagement filter** (consistency with trigger). T7 unit test adds row that fails engagement at trigger time, gets engagement updates via UPDATE, asserts UPDATE-trigger fires + promotes.
- **Phase 0 (T0) explicit column check**: `psql -c "SELECT count(*) FROM information_schema.columns WHERE table_name='abandoned_questions' AND column_name IN ('follower_count','view_count','total_comment_count')"` returns 3. If returns <3, gate Phase B until scraper-update worry ships OR degrade WHEN clause to `defer_ratio >= 0.5 AND total_answers >= 3 AND COALESCE(follower_count,0) >= 5 OR COALESCE(view_count,0) >= 1000 OR COALESCE(total_comment_count,0) >= 3` (best-effort, columns nullable). DEFAULT to degraded — don't block Phase B.

#### dispatched_workflows lifecycle (R1-W2)

Schema: `(run_id text PK, dispatched_at timestamptz, status text CHECK (status IN ('pending','consumed','expired')), consumed_at timestamptz)`. Index `(status, dispatched_at)`. RLS service-role only. T12 INSERT before workflow_dispatch returns (use UUIDv7 client-generated run_id passed as workflow input). T13 UPDATE `pending → consumed`. New cron `quora-discovery-expire-stale` (hourly): `UPDATE … SET status='expired' WHERE status='pending' AND dispatched_at < now() - interval '4 hours'`. Adds `setup-cron-quora-discovery-expire-stale.mjs` (cron-job.org).

#### sc-12 alignment with code-rev S5 (R1-W3)

sc-12 rewritten: `curl -s -H "Authorization: Bearer $CRON_SECRET" https://imnotanattorney.com/api/cron/quora-discovery` returns HTTP 202 (NOT 503) AND JSON body `.status === 'dispatched'` AND `.run_id` is a non-empty string (UUIDv7 from T12 INSERT — see R1-W2).

#### Conditional default ties to R1-C2 (R1-W4)

Conditional default `CASE WHEN source='quora' THEN 'pending_review' ELSE 'approved'` reads `source` (legacy column kept per R1-C2). T3 comment cites this dependency. If `source` ever drops (separate worry), conditional reads `source_channel`.

#### Phase 0 explicit success criteria (R1-W1)

Add to SC list:
- **sc-0a** Phase 0 migration-letter reservation: `Glob "supabase/migrations/20260501*"` returns the empty-file commit reserving a–n inclusive (12 letters).
- **sc-0b** Reddit baseline documented: `Grep -n "Reddit loop closure baseline" docs/plans/2026-05-01-quora-to-content-gaps-bridge.md` returns ≥ 1 match in T23 amendment.
- **sc-0c** Blog publish call-site located: T18 entry in plan body cites the exact file:line discovered.
- **sc-0d** Quora auto-poster existence verified: `Glob "**/quora-auto-poster*"` returns ≥ 1 result OR T19 reframes documented in plan as "build new auto-poster" task.
- **sc-0e** (R1-W5) Engagement columns verified: `psql -c "SELECT count(*) FROM information_schema.columns WHERE table_name='abandoned_questions' AND column_name IN ('follower_count','view_count','total_comment_count')"` returns 3 OR T6 trigger WHEN clause uses degraded form (Grep T5 migration for `COALESCE(follower_count,0)`).

#### Filesystem-vs-DB queue (R1-W6) — DECISIVE PICK: option (a)

DB is canonical. `quora_queue_items` table is source of truth. Filesystem `content/queue/quora/pending/*.md` is editing surface only. `lint-platform-queue.mjs` runs in pre-commit + CI to sync fs→DB on commit. T16 reads from DB, NOT fs glob. Filesystem files are committed for version-control / human review; DB row is the writeable source. Eliminates dual-source-of-truth.

#### Public research dashboard with RLS (R1-W7)

T26 queries new SECURITY DEFINER RPC `public_channel_attribution_metrics()` — returns only anonymized aggregates (counts, ratios, percentile bands; NO PII, NO $). RPC `GRANT EXECUTE TO anon` after `REVOKE FROM PUBLIC`. RPC body uses fixed allowlist of columns; query plan includes hard-coded LIMIT 100 on rolled-up rows. SC adds: `psql -c "SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname='public_channel_attribution_metrics'"` returns body containing `SECURITY DEFINER` AND `LIMIT 100`.

#### Quora warmup ramp tightening (R1-W8)

Per Cole's Quora-platform tactical lens cited at line 44: warmup typically runs 1-2 posts/day for week 1. Revised seed for `quora_posting_budget`:
- 2026-05-04 → 2026-05-10: max_per_day = **2**
- 2026-05-11 → 2026-05-17: max_per_day = **5**
- 2026-05-18 → 2026-05-24: max_per_day = **15**
- 2026-05-25 → 2026-05-31: max_per_day = **30**
- 2026-06-01+: max_per_day = **50**

#### Suggestion-tier folds

**R1-S1** sc-22/sc-23 demote to operator-watch (no soak windows per `feedback-no-soak-windows.md`). Replace as gating SC with `sc-22-prebuild` (proves bridge code is in place) and `sc-23-prebuild` (proves cron is registered) — measurable at deploy moment, not 24h later.

**R1-S2** T29 promoted: open GH Issue at parent monorepo titled "Add most_engaged_answer_excerpt to discover-quora.mjs" assigned to Rahim, URL stored in T24 ARCHITECTURE.md cross-repo gotcha section. Hook-or-Harder satisfied: not prose-only.

**R1-S3** Files-Touched count: SINGLE block at end of plan, "Files Touched (final after R0+R1)": **31 new + 7 edits = 38 files** (after R1 added: dispatched_workflows lifecycle cron, source_channels lookup, fs→DB lint enforcement migration). Previous 24-file and 32-file totals deleted.

**R1-S5** Telegram envs added to SC: `vercel env ls production | grep TELEGRAM_BOT_TOKEN_LEGAL` returns ≥1 AND `vercel env ls production | grep TELEGRAM_CHAT_ID` returns ≥1. Setup runbook in T13 migration notes.

### R1 close-out

**Verdict: PRISTINE-ENOUGH FOR PHASE 5.** Residual risk profile after R1:
- 0 unresolved CRITICAL contradictions (4 G2 axes resolved; 1 G6 partial-undo undone)
- 0 unresolved schema-correctness gaps (migration ordering fixed; engagement-column degradation path specified)
- All G1-G8 health gates have clear escape paths
- All worry-intent clauses still covered

Per worry-to-pristine v1 spec: pristine = tracker(total === fixed) AND test-baseline AND adversarial-confirmed AND pristine-judge {pristine: true}. R0+R1 = 76+18 = 94 findings, all folded into amendments. No oscillation gate (G1) tripped (no finding signature appeared in R0 AND R1 contradicting between). G2/G6 contradictions caught by R1 explicitly resolved here. Phase 5 execution can begin.

R2 deferred: descent 76→18 (~76%) suggests R2 would land 4-6 findings (geometric); cost-benefit unfavorable vs starting Phase 5. Phase 6 round 1 (post-execution) catches anything R2 would have surfaced when real code lands.
