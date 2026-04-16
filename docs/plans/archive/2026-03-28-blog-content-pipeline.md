# INAA Blog Content Pipeline, Automated Generation + Quality Gates

## Context
- **Repo:** `C:\Users\email\projects\ImNotAnAttorney-web`
- **Problem:** 41 blog posts exist, all manually written. Demand pipeline (Reddit signals -> scoring -> content_gaps) is fully operational and identifies high-value topics daily. But nothing bridges the gap between "identified opportunity" and "published blog post." The generation step is missing.
- **Key files:**
  - `src/lib/demand/score-demand.ts`, demand scoring + content gap computation
  - `src/app/api/cron/demand-score/route.ts`, daily cron that upserts content_gaps
  - `src/app/api/admin/demand/gaps/route.ts`, admin API to list/update gaps
  - `content/blog/*.mdx`, 41 existing blog posts
  - `src/lib/blog.ts`, blog utilities (getAllPosts, getPostBySlug, getRelatedPosts)
  - `src/app/blog/[slug]/page.tsx`, blog post renderer with SourceIntelligence + TLDRBox
  - `supabase/migrations/00001_initial_schema.sql`, content_gaps table (lines 302-321)
  - `C:\Users\email\projects\ImNotAnAttorney\scripts\audit-a1-slop.mjs`, A1 slop audit (18 checks)
  - `C:\Users\email\projects\ImNotAnAttorney\system\EVALUATION-TEAM.md`, UPL + Psych criteria
  - `C:\Users\email\.openclaw\workspace\skills\ai-humanizer\`, humanizer skill (24 detectors)
  - `.claude/rules/brand-voice.md`, INAA brand voice guide
- **Tech stack:** Next.js 16 + React 19 + Supabase + Vercel + cron-job.org + local claude -p (Max subscription)
- **Key decisions:**
  - content_gaps.status is the state machine (identified -> queued -> in-progress -> published / declined)
  - Quality gates: AI Humanizer (score < 45) -> A1 Slop Audit (PASS) -> UPL Compliance (PASS all U1-U15) -> Publish
  - Generation via local claude -p (Max subscription, Opus model), NOT Anthropic API
  - QA evaluation via Anthropic API (Sonnet, lightweight, still on Vercel)
  - All new routes follow existing cron pattern: requireCron(req) auth + acquireCronLock() idempotency
  - Blog posts are MDX files committed to git -> Vercel auto-deploys on push
  - Publishing via GitHub Contents API (serverless-compatible, no local git state)
- **Setup:** `npm install` in INAA-web. Env vars already configured in `.env.local`.

---

## Architecture Overview

```
content_gaps table (daily feed from demand pipeline)
        |
        | status: identified -> queued (by generate-queue route)
        v
 +---------------------------------+
 |  /api/cron/blog-generate-queue  |  (Task 2)
 |  Picks top gaps by score        |
 |  Caps at 3 per day              |
 |  Status: identified -> queued   |
 +---------, +---------------------+
             v
 +---------------------------------+
 |  LOCAL: blog-generate-local.js  |  (Task 3, moved to local scheduled task)
 |  Windows Scheduled Task daily   |
 |  Picks one queued gap           |
 |  Enriches with Reddit signals   |
 |  Generates MDX via claude -p    |
 |  Stores in blog_drafts table    |
 |  Status: queued -> in-progress  |
 |  (Vercel route = status-only)   |
 +---------, +---------------------+
             v
 +---------------------------------+
 |  /api/cron/blog-qa              |  (Task 4, quality gates)
 |  Gate 1: Humanizer score (<45)  |
 |  Gate 2: A1 Slop Audit (PASS)  |
 |  Gate 3: UPL Compliance (PASS)  |
 |  Auto-fix + retry (up to 3x)   |
 |  Status: draft -> qa-passed     |
 |       or draft -> qa-failed     |
 +---------, +---------------------+
             v
 +---------------------------------+
 |  /api/cron/blog-publish         |  (Task 5, commit + deploy)
 |  GitHub Contents API to create  |
 |  MDX file in content/blog/      |
 |  Vercel auto-deploys on push    |
 |  IndexNow for search engines    |
 |  Status: qa-passed -> published |
 +---------------------------------+
```

### State Machine (content_gaps.status)

```
identified ----> queued ----> in-progress ----> qa-passed ----> published
    |               |             |                 |
    +-> declined    +-> declined  +-> qa-failed ----+  (retry up to 3x)
                                       |
                                       +-> declined (after 3 failures)
```

New states added beyond the existing 5: `qa-passed`, `qa-failed`

---

## New Database Table: blog_drafts

```sql
CREATE TABLE IF NOT EXISTS public.blog_drafts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  content_gap_id integer NOT NULL REFERENCES content_gaps(id),
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  mdx_content text NOT NULL,
  frontmatter jsonb NOT NULL,
  generation_model text NOT NULL DEFAULT 'claude-opus-4-6',
  generation_prompt_hash text,

 , Quality gate results
  humanizer_score numeric(5,2),
  humanizer_details jsonb,
  a1_result text CHECK (a1_result IN ('PASS', 'FAIL', 'NEEDS_WORK')),
  a1_details jsonb,
  upl_result text CHECK (upl_result IN ('PASS', 'FAIL', 'NEEDS_WORK')),
  upl_details jsonb,

 , Lifecycle
  qa_attempts integer DEFAULT 0,
  qa_passed_at timestamptz,
  published_at timestamptz,
  version integer DEFAULT 1,
  status text DEFAULT 'draft' CHECK (status IN ('draft', 'qa-running', 'qa-passed', 'qa-failed', 'published', 'declined')),

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_blog_drafts_status ON blog_drafts(status);
CREATE INDEX idx_blog_drafts_gap ON blog_drafts(content_gap_id);
```

---

## Tasks

### Task 1: Database Migration, blog_drafts table + content_gaps status extension
**Files:** `supabase/migrations/030-blog-drafts.sql`

**Full migration SQL:**
```sql
, 1. blog_drafts table
CREATE TABLE IF NOT EXISTS public.blog_drafts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  content_gap_id integer NOT NULL REFERENCES content_gaps(id),
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  mdx_content text NOT NULL,
  frontmatter jsonb NOT NULL,
  generation_model text NOT NULL DEFAULT 'claude-opus-4-6',
  generation_prompt_hash text,
  humanizer_score numeric(5,2),
  humanizer_details jsonb,
  a1_result text CHECK (a1_result IN ('PASS', 'FAIL', 'NEEDS_WORK')),
  a1_details jsonb,
  upl_result text CHECK (upl_result IN ('PASS', 'FAIL', 'NEEDS_WORK')),
  upl_details jsonb,
  qa_attempts integer DEFAULT 0,
  qa_passed_at timestamptz,
  published_at timestamptz,
  version integer DEFAULT 1,
  status text DEFAULT 'draft' CHECK (status IN ('draft', 'qa-running', 'qa-passed', 'qa-failed', 'published', 'declined')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_blog_drafts_status ON blog_drafts(status);
CREATE INDEX idx_blog_drafts_gap ON blog_drafts(content_gap_id);

, 2. Auto-update updated_at trigger
CREATE TRIGGER update_blog_drafts_updated_at
  BEFORE UPDATE ON blog_drafts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

, 3. Extend content_gaps.status to include new states
ALTER TABLE content_gaps DROP CONSTRAINT IF EXISTS content_gaps_status_check;
ALTER TABLE content_gaps ADD CONSTRAINT content_gaps_status_check
  CHECK (status IN ('identified', 'queued', 'in-progress', 'qa-passed', 'qa-failed', 'published', 'declined'));

, 4. Link content_gaps to blog_drafts
ALTER TABLE content_gaps ADD COLUMN IF NOT EXISTS blog_draft_id uuid REFERENCES blog_drafts(id);

, 5. Composite index for queue queries
CREATE INDEX IF NOT EXISTS idx_content_gaps_queue ON content_gaps(status, gap_score DESC);
```

**Verification:** Run `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'blog_drafts';` and confirm all columns exist.

---

### Task 2: Generation Queue Route, `/api/cron/blog-generate-queue`
**Files:** `src/app/api/cron/blog-generate-queue/route.ts`

**Purpose:** Selects highest-priority content gaps and transitions them to `queued` status. Runs daily at 6:00 AM ET (after demand pipeline completes at 5:30 AM).

**Complete logic:**
1. Call `requireCron(req)`, returns 401 if Authorization header missing or invalid
2. Call `acquireCronLock("blog-generate-queue", 23 * 60 * 60 * 1000)`, prevents duplicate runs within 23 hours
3. Create Supabase admin client via `createAdminClient()`
4. Query content_gaps:
   ```sql
   SELECT id, charge_type_slug, pain_point_slug, gap_score, demand_quadrant, suggested_title, suggested_keywords
   FROM content_gaps
   WHERE status = 'identified'
     AND gap_score >= 7
     AND demand_quadrant IN ('GOLD_MINE', 'RISKY_BET')
   ORDER BY gap_score DESC
   LIMIT 3
   ```
5. For each gap returned:
   a. Check if a blog_drafts row already exists for this content_gap_id (skip if yes)
   b. Check if an existing blog post covers this charge_type_slug + pain_point_slug combination (query blog_drafts where content_gap_id matches, or check has_blog_post flag)
   c. If no existing draft and no existing post: update content_gaps SET status = 'queued', decided_at = now()
6. Return JSON response: `{ queued: 2, skipped: 1, gaps: [{ id: 15, charge_type_slug: "dui", gap_score: 9.2 }, { id: 22, charge_type_slug: "drug-possession", gap_score: 8.5 }] }`

**Max 3 per day**, prevents flooding. At ~$2-4 per post for generation + QA, this caps daily cost at $6-12.

**cron-job.org schedule:** Daily 10:00 UTC (6:00 AM ET)

---

### Task 3: Blog Generation, LOCAL scheduled task (migrated 2026-03-29)
**Files:**
- `C:\Users\email\.claude\scripts\blog-generate-local.js`, local generation script (NEW)
- `C:\Users\email\.claude\scripts\telegram\prompts\blog-generate.txt`, prompt template (NEW)
- `src/app/api/cron/blog-generate/route.ts`, Vercel route (NOW status-only, no LLM call)
- `src/lib/blog-generation/generate-post.ts`, original generation logic (KEPT for reference, unused by local script)
- `src/lib/blog-generation/prompts.ts`, original prompt templates (ported to blog-generate.txt)
- `src/lib/blog-generation/topic-research.ts`, original enrichment (ported to blog-generate-local.js)

**Migration note (2026-03-29):** Generation moved from Vercel/Anthropic API to local `claude -p` via Max subscription. Saves API credits. Same prompt, same validation, same DB schema. The Vercel route now returns pipeline status counts only. cron-job.org job #7425842 deleted. Windows Scheduled Task "BlogGenerate" runs daily at 6:30 AM ET (10:30 UTC).

**Local script logic:**
1. Acquire file-based lock (`~/.claude/atlas-engine/data/locks/blog-generate.lock`)
2. Load Supabase creds from `.env.local`
3. Pick ONE gap: `GET content_gaps?status=eq.queued&order=gap_score.desc&limit=1`
4. If no queued gap: release lock, exit
5. Mark gap `in-progress`
6. Enrich topic (Reddit signals, demand scores, related blog posts from `content/blog/`)
7. Build prompt from template + gap data
8. Pipe prompt to `claude -p` (Opus, 10-min timeout)
9. Parse MDX output with gray-matter, validate (frontmatter, word count, TLDRBox)
10. Insert into `blog_drafts`, update `content_gaps.blog_draft_id`
11. On failure: roll back gap to `queued`, send Telegram notification
12. On success: send Telegram notification

**Vercel status route (gutted):**
```typescript
export const dynamic = 'force-dynamic';
// Returns: { pipeline, note, content_gaps: {queued, in-progress, complete}, blog_drafts: {draft, qa-running, qa-passed, ...} }
```

**topic-research.ts, `enrichTopic(gap)` function:**
1. Query reddit_signals for top 10 highest-urgency posts matching this charge_type_slug from last 30 days:
   ```sql
   SELECT title, selftext, urgency_score, has_question, emotional_tone, pain_point_slugs
   FROM reddit_signals
   WHERE charge_type_slugs @> ARRAY[gap.charge_type_slug]
   ORDER BY urgency_score DESC
   LIMIT 10
   ```
2. Extract from those posts:
   - `topQuestions`: titles where has_question = true (up to 5)
   - `emotionalPatterns`: aggregate emotional_tone values
   - `painPoints`: aggregate pain_point_slugs
3. Query demand_scores for trend data on this charge_type_slug:
   ```sql
   SELECT demand_score, trend_pct, window
   FROM demand_scores
   WHERE dimension = 'charge_type' AND slug = gap.charge_type_slug
   ORDER BY scored_at DESC
   LIMIT 3
   ```
4. Query existing blog posts for internal linking opportunities (same category):
   ```sql
   SELECT slug, title FROM content_posts
   WHERE category = gap.charge_type_slug
   LIMIT 5
   ```
   (Or call `getAllPosts()` from blog.ts and filter by category, depends on whether content_posts table is populated)
5. Return enriched topic object with all fields needed for prompt template

**prompts.ts, charge-type skill mapping:**
```typescript
const CHARGE_TYPE_SKILLS: Record<string, string> = {
  'dui': 'Apply god-mode-trial DUI defense frameworks: field sobriety test challenges (Gerry Spence cross-exam method), breathalyzer calibration science (Barry Scheck forensic protocol), rising blood alcohol defense, DUI checkpoint constitutional requirements.',
  'drug-possession': 'Apply elite-drug-defense frameworks: Chapman challenge (gross vs net weight argument), SOP attack protocol (Barry Scheck methodology for forensic lab procedure violations), constructive possession defenses, chain of custody challenges.',
  'drug-trafficking': 'Apply elite-drug-defense frameworks: Weitzman entrapment framework, CI credibility cross-examination (5-phase: Comfort, Commitment, Contradiction, Destruction, Escape Prevention), conspiracy withdrawal defense, sentencing disparity challenges.',
  'white-collar': 'Apply god-mode-trial frameworks: document defense strategies (Alan Dershowitz methodology), forensic accounting challenges, wire fraud vs mail fraud distinctions, cooperation agreement negotiation tactics.',
  'federal': 'Apply god-mode-trial federal frameworks: sentencing guidelines navigation, cooperation agreements (proffer sessions, substantial assistance), mandatory minimum challenges, federal discovery rules vs state differences.',
  'probation-violation': 'Apply god-mode-trial frameworks: violation hearing tactics (lower burden of proof awareness), alternative sanction proposals, technical vs substantive violation distinction, graduated sanctions argument.',
  'self-defense': 'Apply god-mode-trial frameworks: castle doctrine application, stand-your-ground vs duty-to-retreat analysis, proportional force doctrine, imperfect self-defense for charge reduction.',
  'sex-offense': 'Apply god-mode-trial frameworks: forensic interview protocol challenges (NICHD Protocol analysis), registry collateral consequence navigation, expert witness cross-examination on memory science, Romeo and Juliet defense applicability.',
  'general-defense': 'Apply god-mode-persuasion frameworks: Kahneman System 1 targeting for jury selection, Voss tactical empathy for plea negotiation, Luntz linguistic framing for courtroom narrative, Taleb asymmetric leverage for settlement positioning.',
};
```

**prompts.ts, full generation prompt template:**
The prompt is constructed by filling these sections with enrichment data:

```typescript
function buildGenerationPrompt(gap: ContentGap, enrichment: TopicEnrichment): string {
  const skills = CHARGE_TYPE_SKILLS[gap.charge_type_slug] || CHARGE_TYPE_SKILLS['general-defense'];
  const existingLinks = enrichment.relatedPosts.map(p => `- [${p.title}](/blog/${p.slug})`).join('\n');
  const questions = enrichment.topQuestions.map((q, i) => `${i + 1}. "${q}"`).join('\n');
  const emotions = enrichment.emotionalPatterns.join(', ');
  const trend = enrichment.trendData;

  return `You are writing a blog post for ImNotAnAttorney.com, a legal empowerment brand for criminal defendants.

## VOICE AND STYLE (mandatory)
- Second person ("you," "your") throughout
- Bold, irreverent, slightly provocative, like a defendant who has been through the system
- Conversational with contractions ("you're," "don't," "isn't")
- Short, varied sentences. Mix 5-word punches with 20-word explanations. Burstiness > 0.5.
- Specific data over generics: "25% of cases" not "many cases"
- Expert-framed opinions: "According to [Expert Name]'s research at [Institution]"
- NO: "delve," "tapestry," "vibrant," "crucial," "seamless," "comprehensive," "landscape"
- NO: "In today's," "It's worth noting," "Let's explore," "The future looks bright"
- NO: filler openings, corporate slop, em dash overuse (max 3 per 1000 words)

## LEGAL BOUNDARY (UPL, non-negotiable, zero tolerance)
- Frame everything as INFORMATION, never ADVICE
- NEVER use "you should," "you need to," "we recommend," "our recommendation"
- Every strategy mention must redirect: "Ask your attorney whether this applies to your case"
- Source collateral consequences to statute or database (NICCC, state code)
- NEVER evaluate attorney competence directly ("your attorney is failing")
- NEVER present motions as recommendations ("you should file this")
- Products are RESEARCH TOOLS, not legal services
- Use "according to," "based on," and "research shows", not "you must" or "we advise"

## PSYCHOLOGICAL ARCHITECTURE (Witte EPPM, mandatory)
- Establish safety before threats. Always.
- Every threat or consequence MUST be followed by a specific action within 2 sentences.
- BAD: "Your case could take 2-3 years. This creates financial hardship and stress."
  (Ends in fear with no action. Reader freezes. FAIL.)
- GOOD: "Your case could take 2-3 years. Here is what you can do to manage the timeline:
  1. Ask your attorney for a realistic case schedule.
  2. Review our case timeline checklist.
  3. Join our email community for monthly case management tips."
  (Threat paired with 3 specific actions. Reader empowered. PASS.)

## STRUCTURE REQUIREMENTS
- Title: SEO-optimized, includes year [2026], under 60 characters
- Open with a TLDRBox component immediately after frontmatter:
  <TLDRBox>
  [4-line summary containing: one key statistic, one expert insight with attribution, the source, and one concrete next step]
  </TLDRBox>
- 6-10 sections with descriptive H2 headings
- Total word count: 1,500-3,000 words
- 2-4 questions the reader should ask their attorney, embedded naturally in the text (not a separate section)
- Internal links to existing INAA blog posts (use markdown links):
${existingLinks || '  (No existing posts in this category yet)'}
- CTA: Link to relevant INAA product, Case Decoder ($197) for case analysis, Intelligence Brief ($997) for deep research
- FAQ section at end: 3-5 anticipated questions with 2-3 sentence answers each
- End with a specific empowering action and a product CTA, NOT a generic conclusion

## EXPERT FRAMEWORKS TO APPLY
${skills}

## TOPIC DETAILS
Charge type: ${gap.charge_type_slug}
Pain point: ${gap.pain_point_slug || 'general coverage gap'}
Demand quadrant: ${gap.demand_quadrant} (${gap.demand_quadrant === 'GOLD_MINE' ? 'high demand, low competition' : 'low demand, low competition, emerging opportunity'})
Demand score: ${gap.demand_score}/10
Suggested title: ${gap.suggested_title || 'Generate an SEO-optimized title'}

## REAL QUESTIONS FROM DEFENDANTS (Reddit data, last 30 days)
${questions || 'No specific questions found, use general pain points for this charge type'}

## EMOTIONAL PATTERNS OBSERVED IN TARGET AUDIENCE
${emotions || 'Fear, confusion, urgency, price sensitivity'}

## TREND DATA
${trend ? `7-day demand score: ${trend.demand_score}, trend: ${trend.trend_pct > 0 ? '+' : ''}${trend.trend_pct}%` : 'No trend data available, treat as evergreen topic'}

## OUTPUT FORMAT
Return a complete, valid MDX file. Start with YAML frontmatter delimited by --- lines. Include all required frontmatter fields. The mdx_content after frontmatter should be ready to save directly as a .mdx file.

Required frontmatter fields:
- title: string (the post title, under 60 chars)
- date: "${new Date().toISOString().split('T')[0]}"
- tags: array of 4-6 relevant tags
- category: "${gap.charge_type_slug}"
- excerpt: string (one-sentence summary, under 160 chars for SEO)
- author: "ImNotAnAttorney Team"
- question_count: number (must match actual count of attorney-directed questions in the body)
- faqs: array of objects with q and a fields (3-5 items)

Do NOT include a SourceIntelligence component, that is injected automatically by the page renderer.
Do NOT include import statements, TLDRBox is globally available in MDX.`;
}
```

**generate-post.ts, `generatePost(gap)` function:**
1. Call `enrichTopic(gap)` to gather Reddit signals, trend data, related posts
2. Call `buildGenerationPrompt(gap, enrichment)` to construct the full prompt
3. Call Anthropic API:
   ```typescript
   import Anthropic from '@anthropic-ai/sdk';
   const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
   const response = await client.messages.create({
     model: 'claude-opus-4-6',
     max_tokens: 8192,
     messages: [{ role: 'user', content: prompt }],
   });
   const mdxContent = response.content[0].type === 'text' ? response.content[0].text : '';
   ```
4. Parse the MDX response:
   - Extract YAML frontmatter using gray-matter library (already in project dependencies)
   - Validate required frontmatter fields: title, date, tags, category, excerpt, author, question_count, faqs
   - If any required field missing: throw error (generation failed)
5. Generate slug from title: lowercase, replace spaces with hyphens, strip non-alphanumeric, enforce pattern /^[a-z0-9][a-z0-9-]*[a-z0-9]$/
6. Verify word count is 1,500-3,000 (count words in body, excluding frontmatter)
7. Verify TLDRBox component is present in body
8. Insert into blog_drafts:
   ```sql
   INSERT INTO blog_drafts (content_gap_id, slug, title, mdx_content, frontmatter, generation_model, generation_prompt_hash)
   VALUES (gap.id, slug, frontmatter.title, fullMdxContent, frontmatterJson, 'claude-opus-4-6', md5(prompt))
   RETURNING id
   ```
9. Update content_gaps: SET blog_draft_id = newDraftId

**Cost per generation:** ~$1-2 (Opus, approximately 4K input tokens + 4K output tokens)

**cron-job.org schedule:** Daily 10:30 UTC (6:30 AM ET)

---

### Task 4: Quality Assurance Route, `/api/cron/blog-qa`
**Files:**
- `src/app/api/cron/blog-qa/route.ts`, API route handler
- `src/lib/blog-generation/qa-humanizer.ts`, humanizer check (in-process, no CLI)
- `src/lib/blog-generation/qa-slop.ts`, A1 slop audit adapted for blog posts
- `src/lib/blog-generation/qa-upl.ts`, UPL compliance check via LLM

**Purpose:** Runs 3 quality gates on draft blog posts sequentially. Posts that pass all 3 gates move to qa-passed. Posts that fail get qa-failed and retry up to 3 times with targeted auto-fixes between attempts.

**Route handler logic:**
1. `requireCron(req)` + `acquireCronLock("blog-qa", 23 * 60 * 60 * 1000)`
2. Query drafts ready for QA:
   ```sql
   SELECT * FROM blog_drafts
   WHERE status = 'draft' AND qa_attempts < 3
   ORDER BY created_at ASC
   LIMIT 2
   ```
3. For each draft: call `runQualityGates(draft)` (described below)
4. Return: `{ processed: 2, results: [{ slug: "motion-suppress-fst", passed: true }, { slug: "plea-bargain-guide", passed: false, failures: ["upl"] }] }`

**Vercel function config:**
```typescript
export const maxDuration = 120; // 2 minutes for 3 LLM eval calls
export const dynamic = 'force-dynamic';
```

**Gate 1: AI Humanizer Score** (`qa-humanizer.ts`)

Implementation: in-process pattern detection (no external CLI dependency). The humanizer runs as pure TypeScript functions analyzing the text.

Detectors to implement:
1. **Tier 1 vocabulary scan**, check for dead-giveaway AI words. List: delve, tapestry, vibrant, crucial, meticulous, seamless, groundbreaking, landscape, paradigm, synergy, robust, leverage, utilize, streamline, innovative, cutting-edge, game-changer, holistic, impactful, actionable. If ANY Tier 1 word found: add 15 points per occurrence (max 60).
2. **Tier 2 density check**, check for suspicious-in-density words. List: furthermore, moreover, additionally, consequently, nevertheless, comprehensive, facilitate, implement, optimize, enhance, significantly. Count per 1000 words. If density > 3 per 1000: add 10 points.
3. **Sentence length variance**, compute standard deviation of sentence lengths (in words). If std_dev < 5: add 15 points (too uniform = AI).
4. **Em dash density**, count em dashes (both, and,) per 1000 words. If > 3: add 10 points.
5. **Copula avoidance**, ratio of "serves as / acts as / functions as" vs simple "is / are". If avoidance ratio > 0.3: add 10 points.
6. **Generic conclusions**, check last 200 words for: "the future looks bright," "in conclusion," "time will tell," "only time will tell," "remains to be seen." If any found: add 10 points.
7. **Hedging density**, percentage of sentences containing "could," "might," "possibly," "potentially," "perhaps," "arguably." If > 15%: add 10 points.
8. **Filler phrase scan**, count occurrences of: "it's worth noting that," "in order to," "at the end of the day," "when it comes to," "in today's." Each occurrence: add 5 points.
9. **Sycophancy markers**, check for: "great question," "absolutely," "I hope this helps," "feel free to ask." Each found: add 10 points.
10. **Rule of three**, detect 3+ consecutive list items of similar word length (within 3 words of each other). If > 2 instances: add 5 points.

**Scoring formula:**
```typescript
const patternScore = Math.min(100, totalPatternPoints);
const uniformityScore = computeUniformityScore(text); // burstiness + type-token ratio
const compositeScore = patternScore * 0.7 + uniformityScore * 0.3;
```

**Threshold: compositeScore < 45** (blog threshold, more lenient than skill's <25 because legal informational content naturally uses some formal language)

If score >= 45: request auto-fix via Anthropic API (Sonnet for cost efficiency):
```typescript
const fixPrompt = `Rewrite the following blog post to sound more human and less AI-generated.
Current humanizer score: ${score}/100 (target: below 45).

Specific issues detected:
${flaggedPatterns.map(p => `- ${p.detector}: ${p.matches.join(', ')}`).join('\n')}

Rules for rewriting:
- Keep ALL facts, statistics, citations, links, CTAs, and structure unchanged
- Only change phrasing and word choice
- Replace "delve" with "dig into" or "examine" or "look at"
- Replace "crucial" with "important" or "key" or "matters because"
- Replace "comprehensive" with "complete" or "full" or "thorough"
- Remove filler phrases: "It's worth noting that" -> just state the thing
- Remove "In today's" openings entirely, start with the actual point
- Vary sentence lengths: add short 3-5 word punchy sentences between longer explanations
- Use contractions: "you are" -> "you're", "do not" -> "don't"
- Replace passive voice with active: "was charged" -> "the DA charged"

Return the complete rewritten MDX (with frontmatter preserved exactly as-is).`;
```

After auto-fix: re-score the rewritten version. Store whichever version scores lower. Update blog_drafts.mdx_content if the fix improved the score.

Store results: UPDATE blog_drafts SET humanizer_score = compositeScore, humanizer_details = jsonb with per-detector breakdown.

**Gate 2: A1 Slop Audit** (`qa-slop.ts`)

Adapted from audit-a1-slop.mjs. 14 checks relevant to blog posts (removed 4 book-specific checks: em dash count thresholds, bottom line callout count, callout type diversity, page count claims).

Implementation: LLM-based evaluation via Anthropic API (Sonnet). Send the full blog post text with a structured evaluation prompt.

```typescript
const a1Prompt = `You are a content quality auditor for ImNotAnAttorney.com, a legal empowerment blog.

Evaluate this blog post against exactly 14 quality checks. For each check, return a JSON object with exactly these fields: check (string name), result ("PASS" or "FAIL" or "NEEDS_WORK"), reason (one sentence explanation).

THE 14 CHECKS:

1. QUESTION_COUNT: The frontmatter field question_count must match the actual count of questions in the body that are directed at the reader's attorney. Count only questions that tell the reader what to ask their attorney. Tolerance: plus or minus 1. FAIL if off by more than 1.

2. CITATION_SOURCING: Every factual claim (statistics, legal rules, procedural requirements) must have an inline source, a statute number, case name, study citation, or named expert. FAIL if more than 2 unsourced factual claims.

3. READABILITY: Action items and direct instructions must be readable at 10th grade level or below. Explanatory sections can be up to 12th grade. FAIL if action items use complex legal jargon without immediate definition.

4. CLICHE_DENSITY: Flag overused phrases from this list: "at the end of the day," "tip of the iceberg," "slippery slope," "double-edged sword," "game changer," "wake-up call." FAIL if more than 2% of sentences contain cliches.

5. VOICE_CONSISTENCY: The post must use second person ("you," "your") consistently throughout. FAIL if it switches to "the defendant," "one should," "a person," or third person for more than 2 consecutive sentences.

6. PASSIVE_VOICE_RATIO: Count passive voice sentences ("was charged," "is required," "were filed"). FAIL if more than 30% of sentences are passive.

7. JARGON_DEFINITION: Every legal term (motion, arraignment, plea, continuance, discovery, subpoena, etc.) must be defined on first use or be a common word. NEEDS_WORK if 1-2 terms undefined. FAIL if 3 or more.

8. STRUCTURAL_INTEGRITY: Sections must be logically ordered (problem -> context -> solution -> action). No orphaned paragraphs that don't connect to adjacent sections. FAIL if section order is illogical or paragraphs are disconnected.

9. CTA_CLARITY: The post must have at least one clear next step for the reader, a product link (Case Decoder, Intelligence Brief), an attorney question to ask, or a checklist to follow. FAIL if no actionable CTA exists.

10. HEDGING_DENSITY: Count action statements that are hedged with "could," "might," "possibly," "potentially." FAIL if more than 15% of action statements are hedged. Information statements can hedge freely.

11. PARAGRAPH_LENGTH: No paragraph should exceed 300 words. Action-oriented paragraphs (those telling the reader what to do) should not exceed 100 words. NEEDS_WORK if 1 paragraph too long. FAIL if 2 or more.

12. SECTION_BALANCE: No single section should contain more than 50% of the total word count. FAIL if any section dominates.

13. FEAR_ACTION_PAIRING: Every paragraph that mentions a threat, consequence, or scary outcome (jail time, fines, license suspension, registration) MUST be followed by a specific action within the next 2 sentences. This is the Witte EPPM framework. FAIL if any threat is left without a paired action.

14. ENGAGEMENT_ARC: The opening must hook the reader (question, statistic, or scenario). The middle must build the case with evidence. The closing must empower the reader with specific actions. NEEDS_WORK if one section is weak. FAIL if the post is flat throughout.

BLOG POST TO EVALUATE:
---
${draft.mdx_content}
---

Return a JSON array of exactly 14 objects. No other text. Example format:
[{"check":"QUESTION_COUNT","result":"PASS","reason":"Frontmatter says 3, body has 3 attorney questions"},{"check":"CITATION_SOURCING","result":"NEEDS_WORK","reason":"2 claims about sentencing ranges lack statute citations"}]`;
```

**Threshold:**
- Must PASS at least 12 of 14 checks
- Checks 1 (QUESTION_COUNT), 2 (CITATION_SOURCING), 7 (JARGON_DEFINITION), and 13 (FEAR_ACTION_PAIRING) are HARD GATES, must be PASS or NEEDS_WORK, never FAIL
- Maximum 2 NEEDS_WORK on non-hard-gate checks
- Any FAIL on a hard gate check = entire A1 audit FAIL

Store results: UPDATE blog_drafts SET a1_result = 'PASS' or 'FAIL' or 'NEEDS_WORK', a1_details = jsonb with per-check results.

**Gate 3: UPL Compliance** (`qa-upl.ts`)

Run all 15 UPL criteria against blog content via Anthropic API (Sonnet). This is the zero-tolerance gate.

```typescript
const uplPrompt = `You are a UPL (Unauthorized Practice of Law) compliance auditor for ImNotAnAttorney.com.

This website provides legal INFORMATION to criminal defendants. It does NOT provide legal ADVICE. This distinction is legally critical. Evaluate the following blog post against all 15 UPL criteria. For each criterion, return PASS or FAIL with specific evidence.

THE 15 UPL CRITERIA:

U1. NO DIRECTIVES: The post must never use "you should," "you need to," "you must," "we advise," or any language that directs the reader to take a specific legal action. Information framing is required: "This is what X does" not "You need X."
U2. ATTORNEY REDIRECT: Within 3 paragraphs of any mention of a legal strategy, motion, or defense approach, there must be a redirect to the reader's attorney: "Ask your attorney whether this applies to your case" or similar.
U3. NO ATTORNEY EVALUATION: The post must never evaluate an attorney's competence, judgment, or performance. "Your attorney is failing you" is FAIL. "Here are questions to understand your attorney's approach" is PASS.
U4. NO MOTION RECOMMENDATIONS: The post must never recommend filing a specific motion. "A motion to suppress can challenge this evidence" (information) is PASS. "You should file a motion to suppress" (advice) is FAIL.
U5. IMMIGRATION REDIRECT: Any mention of immigration consequences must include "consult an immigration attorney" redirect. Criminal defense blog posts that mention deportation, visa issues, or immigration holds without this redirect FAIL.
U6. SOURCED COLLATERAL CONSEQUENCES: Collateral consequences (job loss, housing, licensing) must be sourced to specific statute, database (NICCC), or state code. Unsourced claims about consequences FAIL.
U7. NO COMPANY NAMES IN LEGAL CONTEXT: The post must not name specific law firms, bail bond companies, or legal service providers in a way that constitutes a referral or recommendation.
U8. NO "WE RECOMMEND": The phrases "we recommend," "our recommendation," "we suggest," or "our advice" must never appear.
U9. SCENARIO HEADERS: When presenting hypothetical legal scenarios, use quoted dialogue format ("What the prosecutor might say") rather than directive format ("What you should do in court").
U10. SELF-EFFICACY FRAMING: Language must build the reader's agency. "You can ask your attorney about" is PASS. "You should demand" is FAIL.
U11. INFORMATION FRAMING: Legal concepts must be framed as information: "This is what a motion to suppress does" is PASS. "You need a motion to suppress" is FAIL.
U12. NO OUTCOME GUARANTEES: The post must never guarantee or strongly imply a specific case outcome. "Cases have been dismissed when" (historical fact) is PASS. "Your case will be dismissed if" (guarantee) is FAIL.
U13. EXPERT ATTRIBUTION: Expert opinions must use "according to [Name]'s framework" or "based on [Name]'s research", not "experts say" or "studies show" without specific attribution.
U14. NO CONTRADICTING CLAIMS: The post must not contain claims that contradict the site-wide disclaimer (that this is information, not legal advice).
U15. PRODUCTS AS RESEARCH TOOLS: Any mention of INAA products (Case Decoder, Intelligence Brief, etc.) must frame them as research and information tools, not as legal services or attorney substitutes.

BLOG POST TO EVALUATE:
---
${draft.mdx_content}
---

Return a JSON array of exactly 15 objects. Each object must have: criterion (string like "U1"), result ("PASS" or "FAIL"), evidence (the specific text that passes or fails, quoted directly from the post, or "No violations found" for PASS).
Example: [{"criterion":"U1","result":"FAIL","evidence":"Found directive: 'You should file a motion to suppress' in paragraph 4"},{"criterion":"U2","result":"PASS","evidence":"Attorney redirect found within 2 paragraphs of every strategy mention"}]`;
```

**Threshold:** ALL 15 criteria must PASS. Zero tolerance. One FAIL on any criterion = entire UPL check FAIL.

If UPL fails: auto-fix attempt via targeted prompt:
```typescript
const uplFixPrompt = `The following blog post FAILED UPL compliance on these criteria:
${failures.map(f => `${f.criterion}: ${f.evidence}`).join('\n')}

Rewrite the post to fix ONLY the UPL violations. Rules:
- Replace "you should" with "you can ask your attorney about"
- Replace "you need to" with "one approach involves"
- Add attorney redirect within 2 paragraphs of any strategy mention
- Replace any attorney evaluation with neutral questions
- Replace "we recommend" with "research shows" or "according to [Expert]"
- Keep ALL other content, structure, links, and CTAs unchanged

Return the complete rewritten MDX with frontmatter preserved.`;
```

**After all 3 gates complete for a draft:**

If all 3 pass (humanizer < 45, A1 PASS, UPL PASS):
```sql
UPDATE blog_drafts SET status = 'qa-passed', qa_passed_at = now() WHERE id = draft.id;
UPDATE content_gaps SET status = 'qa-passed' WHERE id = draft.content_gap_id;
```

If any gate fails:
```sql
UPDATE blog_drafts SET status = 'qa-failed', qa_attempts = qa_attempts + 1 WHERE id = draft.id;
```
If qa_attempts reaches 3:
```sql
UPDATE blog_drafts SET status = 'declined' WHERE id = draft.id;
UPDATE content_gaps SET status = 'declined', notes = 'Failed QA 3 times. Last failures: humanizer=42, a1=FAIL(citation_sourcing, fear_action_pairing), upl=PASS' WHERE id = draft.content_gap_id;
```
If qa_attempts < 3: the draft stays at status='qa-failed'. On the next cron run, the route will pick it up again (status='draft' OR status='qa-failed' with qa_attempts < 3), attempt auto-fixes on the failed gates, and re-evaluate.

**Cost per QA run:** ~$0.50-1.00 (2 Sonnet calls for A1 + UPL at ~2K tokens each, humanizer is free in-process)

**cron-job.org schedule:** Daily 11:00 UTC (7:00 AM ET)

---

### Task 5: Blog Publish Route, `/api/cron/blog-publish`
**Files:**
- `src/app/api/cron/blog-publish/route.ts`, API route handler
- `src/lib/blog-generation/publish.ts`, GitHub API publish logic

**Purpose:** Takes qa-passed drafts, creates MDX files in the GitHub repo via Contents API, which triggers Vercel auto-deploy. Also submits to IndexNow for search engine indexing.

**Route handler logic:**
1. `requireCron(req)` + `acquireCronLock("blog-publish", 23 * 60 * 60 * 1000)`
2. Query qa-passed drafts:
   ```sql
   SELECT bd.*, cg.charge_type_slug
   FROM blog_drafts bd
   JOIN content_gaps cg ON bd.content_gap_id = cg.id
   WHERE bd.status = 'qa-passed'
   ORDER BY bd.qa_passed_at ASC
   LIMIT 3
   ```
3. For each draft:
   a. Verify slug does not conflict with existing blog files, call GitHub Contents API to check if `content/blog/${slug}.mdx` already exists
   b. If file exists: append a suffix (-2, -3) to slug and update blog_drafts
   c. Create file via GitHub Contents API:
      ```typescript
      const response = await fetch(
        `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/content/blog/${draft.slug}.mdx`,
        {
          method: 'PUT',
          headers: {
            'Authorization': `token ${process.env.GITHUB_TOKEN}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: `blog: add ${draft.title}`,
            content: Buffer.from(draft.mdx_content).toString('base64'),
            committer: {
              name: 'Atlas Blog Pipeline',
              email: 'noreply@imnotanattorney.com',
            },
          }),
        }
      );
      ```
   d. If GitHub API returns 201: success
   e. Update blog_drafts:
      ```sql
      UPDATE blog_drafts SET status = 'published', published_at = now() WHERE id = draft.id;
      ```
   f. Update content_gaps:
      ```sql
      UPDATE content_gaps SET status = 'published', has_blog_post = true, blog_slug = draft.slug WHERE id = draft.content_gap_id;
      ```
   g. Submit to IndexNow for fast search engine indexing, call existing `/api/indexnow` route or directly:
      ```typescript
      await fetch(`https://api.indexnow.org/indexnow?url=https://imnotanattorney.com/blog/${draft.slug}&key=${process.env.INDEXNOW_KEY}`);
      ```

**New env var needed:** `GITHUB_TOKEN`, personal access token (fine-grained) with `contents:write` scope on the INAA-web repo. Also need `GITHUB_OWNER` and `GITHUB_REPO` constants (or derive from git remote).

**Why GitHub API instead of git commands:** This route runs on Vercel (serverless). Vercel functions have a read-only filesystem and no git binary. The GitHub Contents API is the standard pattern for serverless file creation.

**cron-job.org schedule:** Daily 11:30 UTC (7:30 AM ET)

---

### Task 6: Admin Dashboard API, Blog Pipeline Status
**Files:**
- `src/app/api/admin/blog-pipeline/route.ts`, list drafts + pipeline stats
- `src/app/api/admin/blog-pipeline/[id]/route.ts`, manage individual drafts

**GET /api/admin/blog-pipeline**, returns all drafts with their QA results and linked content gap data:
```typescript
// Query:
const { data: drafts } = await supabase
  .from('blog_drafts')
  .select('*, content_gaps!inner(charge_type_slug, pain_point_slug, gap_score, demand_quadrant)')
  .order('created_at', { ascending: false })
  .limit(50);

// Also compute stats:
const stats = {
  total_drafts: drafts.length,
  by_status: {
    draft: drafts.filter(d => d.status === 'draft').length,
    'qa-running': drafts.filter(d => d.status === 'qa-running').length,
    'qa-passed': drafts.filter(d => d.status === 'qa-passed').length,
    'qa-failed': drafts.filter(d => d.status === 'qa-failed').length,
    published: drafts.filter(d => d.status === 'published').length,
    declined: drafts.filter(d => d.status === 'declined').length,
  },
};

return NextResponse.json({ drafts, stats });
```

**PATCH /api/admin/blog-pipeline/[id]**, management actions:
- `{ "action": "retry-qa" }`, reset draft status to 'draft', reset qa_attempts to 0, clear all QA result fields (humanizer_score, a1_result, upl_result, and their details). This allows re-running QA from scratch after manual edits.
- `{ "action": "decline" }`, set draft status to 'declined', also update the linked content_gaps row to status = 'declined'
- `{ "action": "approve-override" }`, force draft to 'qa-passed' status with qa_passed_at = now(). For manual override when a human reviews and approves despite QA flags.
- `{ "action": "edit", "mdx_content": "updated MDX string here" }`, update the draft's mdx_content, increment version number, reset all QA result fields so QA must re-run on the new content.

Auth: Use existing admin auth pattern from `/api/admin/demand/gaps/route.ts` (check for admin session or service role key).

---

### Task 7: cron-job.org Registration Script
**Files:** `scripts/setup-blog-pipeline-crons.js`

**Purpose:** Register the 4 new cron jobs via cron-job.org API. Run once after deployment.

**Full script:**
```javascript
const https = require('https');

const API_KEY = process.env.CRONJOB_API_KEY || 'qmy3F+k6DrUgKCz/Jp8fEnpViJrE3pgaUfOoO8yAQn4=';
const CRON_SECRET = process.env.CRON_SECRET;
const BASE_URL = 'https://imnotanattorney.com';

if (!CRON_SECRET) {
  console.error('CRON_SECRET env var required');
  process.exit(1);
}

const jobs = [
  {
    title: 'INAA: blog-generate-queue',
    url: `${BASE_URL}/api/cron/blog-generate-queue`,
    schedule: { minutes: [0], hours: [10], mdays: [-1], months: [-1], wdays: [-1] },
  },
  // REMOVED (2026-03-29): blog-generate moved to local Windows Scheduled Task "BlogGenerate"
  // Was: { title: 'INAA: blog-generate', url: '/api/cron/blog-generate', schedule: 10:30 UTC }
  // Now: node C:\Users\email\.claude\scripts\blog-generate-local.js (daily 6:30 AM ET)
  // The Vercel route is now status-only (no LLM call)
  {
    title: 'INAA: blog-qa',
    url: `${BASE_URL}/api/cron/blog-qa`,
    schedule: { minutes: [0], hours: [11], mdays: [-1], months: [-1], wdays: [-1] },
  },
  {
    title: 'INAA: blog-publish',
    url: `${BASE_URL}/api/cron/blog-publish`,
    schedule: { minutes: [30], hours: [11], mdays: [-1], months: [-1], wdays: [-1] },
  },
];

async function createJob(job) {
  const body = JSON.stringify({
    job: {
      title: job.title,
      url: job.url,
      enabled: true,
      saveResponses: true,
      schedule: job.schedule,
      requestTimeout: 300,
      requestMethod: 1, // GET
      extendedData: {
        headers: { 'Authorization': `Bearer ${CRON_SECRET}` },
      },
    },
  });

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.cron-job.org',
      path: '/jobs',
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        const parsed = JSON.parse(data);
        console.log(`Created: ${job.title} -> ID ${parsed.jobId}`);
        resolve(parsed);
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

(async () => {
  for (const job of jobs) {
    await createJob(job);
  }
  console.log('All 4 blog pipeline cron jobs registered.');
})();
```

---

### Task 8: TypeScript Types + Shared Utilities
**Files:**
- `src/types/blog-pipeline.ts`, all TypeScript interfaces for the blog pipeline
- `src/lib/blog-generation/index.ts`, barrel export file

**src/types/blog-pipeline.ts:**
```typescript
export interface BlogDraft {
  id: string;
  content_gap_id: number;
  slug: string;
  title: string;
  mdx_content: string;
  frontmatter: BlogFrontmatter;
  generation_model: string;
  generation_prompt_hash: string | null;
  humanizer_score: number | null;
  humanizer_details: HumanizerDetails | null;
  a1_result: QAResult | null;
  a1_details: A1Details | null;
  upl_result: QAResult | null;
  upl_details: UPLDetails | null;
  qa_attempts: number;
  qa_passed_at: string | null;
  published_at: string | null;
  version: number;
  status: BlogDraftStatus;
  created_at: string;
  updated_at: string;
}

export type BlogDraftStatus = 'draft' | 'qa-running' | 'qa-passed' | 'qa-failed' | 'published' | 'declined';
export type QAResult = 'PASS' | 'FAIL' | 'NEEDS_WORK';

export interface BlogFrontmatter {
  title: string;
  date: string;
  lastModified: string | undefined;
  tags: string[];
  category: string;
  excerpt: string;
  author: string;
  question_count: number;
  faqs: Array<{ q: string; a: string }>;
  howToSteps: Array<{ name: string; text: string }> | undefined;
}

export interface HumanizerDetails {
  composite_score: number;
  pattern_score: number;
  uniformity_score: number;
  flagged_patterns: Array<HumanizerFlag>;
}

export interface HumanizerFlag {
  detector: string;
  severity: 'tier1' | 'tier2' | 'style' | 'filler' | 'sycophancy';
  count: number;
  matches: string[];
  points_added: number;
}

export interface A1Details {
  checks_passed: number;
  checks_total: number;
  hard_gate_failures: string[];
  results: Array<A1CheckResult>;
}

export interface A1CheckResult {
  check: string;
  result: QAResult;
  reason: string;
}

export interface UPLDetails {
  criteria_passed: number;
  criteria_total: number;
  results: Array<UPLCriterionResult>;
}

export interface UPLCriterionResult {
  criterion: string;
  result: 'PASS' | 'FAIL';
  evidence: string;
}

export interface TopicEnrichment {
  topQuestions: string[];
  emotionalPatterns: string[];
  painPoints: string[];
  trendData: { demand_score: number; trend_pct: number; window: string } | null;
  relatedPosts: Array<{ slug: string; title: string }>;
}

export interface ContentGapForGeneration {
  id: number;
  charge_type_slug: string;
  pain_point_slug: string | null;
  demand_quadrant: string;
  demand_score: number;
  gap_score: number;
  suggested_title: string | null;
  suggested_keywords: string[] | null;
}
```

**src/lib/blog-generation/index.ts:**
```typescript
export { generatePost } from './generate-post';
export { buildGenerationPrompt, CHARGE_TYPE_SKILLS } from './prompts';
export { enrichTopic } from './topic-research';
export { runHumanizerCheck } from './qa-humanizer';
export { runSlopAudit } from './qa-slop';
export { runUPLCheck } from './qa-upl';
export { publishDraft } from './publish';
```

---

## Execution Order

```
Batch 1 (parallel, no dependencies):
  Task 1: Database migration
  Task 8: TypeScript types + shared utilities

Batch 2 (parallel, all depend on Batch 1):
  Task 2: Queue route
  Task 3: Generate route
  Task 4: QA route
  Task 5: Publish route
  Task 6: Admin API

Batch 3 (after Batch 2 deployed and verified):
  Task 7: cron-job.org registration
```

---

## Cost Model

| Component | Per Post | Daily (3 max) | Monthly (90 max) |
|---------, |----------|---------------|------------------|
| Generation (Opus) | $1.00-2.00 | $3.00-6.00 | $90-180 |
| QA - Humanizer | $0 (in-process) | $0 | $0 |
| QA - A1 Slop (Sonnet) | $0.15-0.30 | $0.45-0.90 | $13.50-27.00 |
| QA - UPL (Sonnet) | $0.15-0.30 | $0.45-0.90 | $13.50-27.00 |
| Auto-fix retries (avg 0.5x) | $0.10 | $0.30 | $9.00 |
| **Total** | **$1.40-2.60** | **$4.20-7.80** | **$126-234** |

Breakeven: Manual blog post takes 2-3 hours of effort (valued at $50-75). Pipeline pays for itself after 5 posts.

---

## Env Vars Required

| Var | Purpose | Status |
|---, |---------|------, |
| CRON_SECRET | Auth for cron routes | Already in .env.local |
| ANTHROPIC_API_KEY | Claude API for generation + QA | Already in .env.local |
| SUPABASE_SERVICE_ROLE_KEY | DB access | Already in .env.local |
| NEXT_PUBLIC_SUPABASE_URL | DB endpoint | Already in .env.local |
| CRONJOB_API_KEY | cron-job.org registration | Already in .env.local |
| GITHUB_TOKEN | GitHub Contents API for publishing | NEW, needs creation |
| GITHUB_OWNER | GitHub repo owner | Hardcode or derive from git remote |
| GITHUB_REPO | GitHub repo name | Hardcode or derive from git remote |

---

## Verification Checklist

After each batch deployment:

**Batch 1 verification:**
- Run migration via git push (Supabase GitHub integration auto-applies)
- Verify: `SELECT column_name FROM information_schema.columns WHERE table_name = 'blog_drafts';` returns all expected columns
- Verify: `INSERT INTO content_gaps (charge_type_slug, status) VALUES ('test', 'qa-passed');` does not violate constraint (new status value accepted)

**Batch 2 verification:**
- Queue route: `curl -H "Authorization: Bearer CRON_SECRET" https://imnotanattorney.com/api/cron/blog-generate-queue` returns JSON with queued count (or 0 if no identified gaps)
- Generate (local): `node C:\Users\email\.claude\scripts\blog-generate-local.js`, picks top gap, generates draft, inserts into blog_drafts
- Generate route (status only): `curl -H "Authorization: Bearer CRON_SECRET" https://imnotanattorney.com/api/cron/blog-generate` returns JSON with content_gaps + blog_drafts counts
- QA route: `curl -H "Authorization: Bearer CRON_SECRET" https://imnotanattorney.com/api/cron/blog-qa` returns JSON with processed count
- Publish route: `curl -H "Authorization: Bearer CRON_SECRET" https://imnotanattorney.com/api/cron/blog-publish` returns JSON with published count
- Admin: `curl https://imnotanattorney.com/api/admin/blog-pipeline` returns drafts list and stats
- All routes return 401 without auth header

**End-to-end test:**
1. Manually insert a content_gap: `INSERT INTO content_gaps (charge_type_slug, gap_score, demand_quadrant, status, suggested_title) VALUES ('dui', 10.00, 'GOLD_MINE', 'identified', 'Field Sobriety Tests: What Your Attorney Needs to Know [2026]');`
2. Trigger queue route manually -> gap transitions to queued
3. Run `node C:\Users\email\.claude\scripts\blog-generate-local.js` manually -> draft appears in blog_drafts with status='draft'
4. Trigger QA route manually -> draft evaluated, status becomes qa-passed or qa-failed
5. If qa-passed: trigger publish route manually -> MDX file appears in GitHub repo, Vercel deploys, blog post visible at /blog/slug

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|------, |---------, |
| Opus generates UPL-violating content | Legal liability | UPL gate is zero-tolerance with 15 criteria; 3-retry limit with auto-decline prevents any UPL-violating content from publishing |
| Humanizer false positives on legal terminology | Posts rejected unnecessarily | Blog threshold set at 45 (not 25); legal terms like "arraignment" and "continuance" are domain-specific, not AI slop; Tier 1 list excludes legal vocabulary |
| GitHub API rate limits | Publishing blocked | Max 3 posts/day = 3 API calls; well within GitHub's 5000 requests/hour limit for authenticated requests |
| Local generation timeout | Generation fails | 10-minute timeout on claude -p; file-based lock (30-min stale threshold) prevents duplicate runs; gap rolls back to queued on failure; Telegram notification sent |
| ~~Vercel function timeout on Opus generation~~ | ~~RESOLVED~~ | Migrated to local claude -p (2026-03-29), no Vercel timeout constraint |
| Content gap score changes between queue and generate | Stale topic generated | Re-check gap_score at generation time; skip gap if score dropped below 5 since queueing |
| Duplicate slugs | File overwrite | UNIQUE constraint on blog_drafts.slug; GitHub API returns 422 if file exists; slug suffixing (-2, -3) as fallback |
| Git merge conflicts on content/blog/ | Deploy blocked | GitHub API creates individual commits with no local state; each publish is an atomic API call, no merge conflicts possible |
| Anthropic API outage | Pipeline stalls | acquireCronLock prevents duplicate runs; failed generation stays at queued status; next day's cron picks it up again |

---

## What This Does NOT Do (Explicit Out of Scope)

1. Social amplification, publishing to Reddit, Twitter, email is a separate pipeline (Mary's domain in marketing-hq)
2. Performance tracking, existing `/api/cron/demand-performance` already handles this and feeds back into demand scores
3. Existing post audit, running QA gates on the 41 existing manually-written posts is a separate task
4. Blog UI changes, the rendering pipeline (components, layout, schema markup) already works and does not need modification
5. SEO optimization beyond IndexNow, existing blog structure handles meta tags, OG images, and structured data
6. Content calendar, this pipeline is demand-driven, not calendar-driven; the demand pipeline IS the calendar
7. Manual editing UI, the admin API supports editing via PATCH, but no frontend for it; use curl or build later
8. Image generation, blog posts are text-only MDX; hero images and thumbnails are handled by the existing OG image generation
