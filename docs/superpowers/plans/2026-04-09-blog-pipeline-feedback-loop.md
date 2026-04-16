# Blog Pipeline Self-Improving Feedback Loop, Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the feedback loop so the blog pipeline learns from performance data, which posts drive traffic/conversions, what structural patterns win, and which topics to prioritize.

**Architecture:** Three phases. Phase 0 fixes the broken attribution chain (blog→score→subscribe→checkout). Phase 1 builds a traffic-based feedback loop that works immediately with existing 59 posts. Phase 2 adds attribution-powered adaptive QA and underperformer revision (activates after 30 days of Phase 0 data). Kevin Indig's SEO growth loop framework: content is a loop, not a funnel, performance feeds back into generation.

**Tech Stack:** Next.js 15, Supabase (PostgREST), TypeScript, cron-job.org, Vercel Analytics API, Engine repo (Node.js/ESM)

**Spec:** `C:\Users\email\projects\ImNotAnAttorney-web\docs\superpowers\specs\2026-04-09-blog-pipeline-feedback-loop-design.md`

---

## Phase 0: Fix Attribution Chain

### Task 1: Migration, Add referral_url + original_source to subscribers

**Files:**
- Create: `supabase/migrations/20260409f_subscriber_attribution.sql`

- [ ] **Step 1: Write the migration**

```sql
, Add attribution columns to subscribers table.
, referral_url: the blog slug or page that referred the subscriber (e.g. "blog-dui-first-72-hours")
, original_source: first source that created this subscriber, never overwritten on re-subscription

ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS referral_url text;
ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS original_source text;

, Backfill original_source from existing source values
UPDATE subscribers SET original_source = source WHERE original_source IS NULL;

COMMENT ON COLUMN subscribers.referral_url IS 'Blog slug or page that referred this subscriber (e.g. blog-dui-first-72-hours)';
COMMENT ON COLUMN subscribers.original_source IS 'First source that created this subscriber, never overwritten on re-subscription';
```

- [ ] **Step 2: Apply migration via Supabase Management API**

Run: `node -e "
const res = await fetch('https://jxjbjmgdukwkoclydqdr.supabase.co/rest/v1/rpc/exec_sql', { method: 'POST', headers: { 'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY, 'Authorization': 'Bearer ' + process.env.SUPABASE_SERVICE_ROLE_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: 'SELECT column_name FROM information_schema.columns WHERE table_name = $$subscribers$$ AND column_name IN ($$referral_url$$, $$original_source$$)' }) }); console.log(await res.json());
"`

If exec_sql RPC isn't available, apply via Supabase Dashboard SQL Editor. Verify both columns exist.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260409f_subscriber_attribution.sql
git commit -m "feat(attribution): add referral_url + original_source to subscribers"
```

---

### Task 2: Update /api/subscribe to accept referral_url and preserve original_source

**Files:**
- Modify: `src/app/api/subscribe/route.ts`

- [ ] **Step 1: Add referral_url to body parsing (after line 60)**

In `src/app/api/subscribe/route.ts`, after the `chargeType` validation (line 60), add:

```typescript
const referralUrl = typeof body.referralUrl === "string" && body.referralUrl.length <= 200 ? body.referralUrl : null;
```

- [ ] **Step 2: Update upsert to include referral_url and original_source**

Replace the upsert block (lines 88-98) with:

```typescript
    // Check if subscriber already exists (for original_source preservation)
    const { data: existing } = await supabase
      .from("subscribers")
      .select("id, original_source")
      .eq("email", normalizedEmail)
      .maybeSingle();

    const upsertData: Record<string, unknown> = {
      email: normalizedEmail,
      source,
      unsubscribed_at: null,
    };
    if (scoreBand) upsertData.score_band = scoreBand;
    if (scoreValue !== null) upsertData.score_value = scoreValue;
    if (chargeType) upsertData.charge_type = chargeType;
    if (referralUrl) upsertData.referral_url = referralUrl;

    // Preserve original_source: set on first subscription, never overwrite
    if (!existing) {
      upsertData.original_source = source;
    }

    const { error } = await supabase
      .from("subscribers")
      .upsert(upsertData, { onConflict: "email" });
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/subscribe/route.ts
git commit -m "feat(attribution): accept referral_url, preserve original_source in subscribe"
```

---

### Task 3: Update /api/checkout to preserve source and thread referral

**Files:**
- Modify: `src/app/api/checkout/route.ts`

- [ ] **Step 1: Read ref from body**

In the body destructuring area (around line 62), add `ref` to the extracted fields. After the existing body parsing:

```typescript
    const ref = typeof body.ref === "string" && body.ref.length <= 200 ? body.ref : null;
```

- [ ] **Step 2: Update subscriber upsert to not overwrite source blindly**

Replace lines 206-213 (the subscriber upsert block) with:

```typescript
    if (normalizedEmail) {
      // Check if subscriber already exists, don't overwrite original_source or referral_url
      const { data: existingSub } = await supabase
        .from("subscribers")
        .select("id, original_source")
        .eq("email", normalizedEmail)
        .maybeSingle();

      const subUpsert: Record<string, unknown> = {
        email: normalizedEmail,
        source: "checkout",
      };
      if (!existingSub) {
        subUpsert.original_source = "checkout";
      }
      if (ref) {
        subUpsert.referral_url = ref;
      }

      const { error: subError } = await supabase
        .from("subscribers")
        .upsert(subUpsert, { onConflict: "email" });
      if (subError) {
        console.error("[Checkout] Subscriber upsert error:", subError);
      }
    }
```

- [ ] **Step 3: Add ref to Stripe session metadata**

In the Stripe checkout session creation (find `metadata:` object), add `referral_url: ref || ""` alongside the existing metadata fields.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/checkout/route.ts
git commit -m "feat(attribution): preserve original_source + thread ref in checkout"
```

---

### Task 4: Thread slug from blog page to all CTA components

**Files:**
- Modify: `src/app/blog/[slug]/page.tsx:268-298`
- Modify: `src/components/BlogInlineCapture.tsx`
- Modify: `src/components/BlogCTA.tsx`
- Modify: `src/components/PlaybookCTA.tsx`
- Modify: `src/components/LeadCapture.tsx`

- [ ] **Step 1: Update BlogInlineCapture to accept slug**

In `src/components/BlogInlineCapture.tsx`, change the interface and component:

```typescript
interface BlogInlineCaptureProps {
  category?: string;
  slug?: string;
}

export function BlogInlineCapture({ category = "general-defense", slug }: BlogInlineCaptureProps) {
```

Change the Link href (line 43) from:
```tsx
href="/score"
```
To:
```tsx
href={slug ? `/score?ref=blog-${slug}` : "/score"}
```

- [ ] **Step 2: Update BlogCTA to accept slug and append ref**

In `src/components/BlogCTA.tsx`, change the component signature (line 57) from:
```tsx
export function BlogCTA({ category }: { category?: string }) {
```
To:
```tsx
export function BlogCTA({ category, slug }: { category?: string; slug?: string }) {
```

For every `href` that links to `/score`, `/start`, or `/checkout?...`, append the ref param. Use a helper at the top of the function:

```typescript
  const refParam = slug ? `ref=blog-${slug}` : "";
  const appendRef = (url: string) => {
    if (!refParam) return url;
    return url.includes("?") ? `${url}&${refParam}` : `${url}?${refParam}`;
  };
```

Then wrap each href: `href={appendRef("/score")}`, `href={appendRef("/start")}`, `href={appendRef(\`/checkout?tier=${playbookSlug}\`)}`, `href={appendRef(\`/checkout?standaloneProduct=${standalone.slug}\`)}`, etc.

Apply to all 6 Link hrefs in the component:
- Line 71: `/checkout?standaloneProduct=...`
- Line 77: `/score`
- Line 112: `/start`
- Line 117: `/checkout?tier=...`
- Line 137: `/score`
- Line 142: `/checkout?tier=dui-first-offense`

- [ ] **Step 3: Update PlaybookCTA to accept slug**

In `src/components/PlaybookCTA.tsx`, change (line 12):
```tsx
export function PlaybookCTA() {
```
To:
```tsx
export function PlaybookCTA({ slug }: { slug?: string }) {
  const refParam = slug ? `ref=blog-${slug}` : "";
  const appendRef = (url: string) => {
    if (!refParam) return url;
    return url.includes("?") ? `${url}&${refParam}` : `${url}?${refParam}`;
  };
```

Update line 28 href from `"/playbook/dui-first-offense"` to `{appendRef("/playbook/dui-first-offense")}`.
Update line 34 href from `"/checkout?tier=case-decoder"` to `{appendRef("/checkout?tier=case-decoder")}`.

- [ ] **Step 4: Update LeadCapture to accept referralUrl**

In `src/components/LeadCapture.tsx`, add to the interface (after line 52):
```typescript
  /** Blog slug for attribution tracking. */
  referralUrl?: string;
```

Add to the destructured props (line 68 area):
```typescript
  referralUrl,
```

Update the fetch body (line 79) from:
```typescript
        body: JSON.stringify({ email, source }),
```
To:
```typescript
        body: JSON.stringify({ email, source, ...(referralUrl ? { referralUrl } : {}) }),
```

Also update the ungated `/score` link (line 112) to include ref:
```tsx
href={referralUrl ? `/score?ref=${referralUrl}` : "/score"}
```

- [ ] **Step 5: Thread slug through blog/[slug]/page.tsx**

In `src/app/blog/[slug]/page.tsx`, update these lines:

Line 268, from:
```tsx
<BlogInlineCapture category={post.category || "general-defense"} />
```
To:
```tsx
<BlogInlineCapture category={post.category || "general-defense"} slug={slug} />
```

Line 276-277, from:
```tsx
<PlaybookCTA />
```
To:
```tsx
<PlaybookCTA slug={slug} />
```

Line 282, from:
```tsx
<BlogCTA category={post.category} />
```
To:
```tsx
<BlogCTA category={post.category} slug={slug} />
```

Line 293, from:
```tsx
href="/score"
```
To:
```tsx
href={`/score?ref=blog-${slug}`}
```

- [ ] **Step 6: Commit**

```bash
git add src/components/BlogInlineCapture.tsx src/components/BlogCTA.tsx src/components/PlaybookCTA.tsx src/components/LeadCapture.tsx src/app/blog/[slug]/page.tsx
git commit -m "feat(attribution): thread blog slug to all CTA components as ?ref param"
```

---

### Task 5: Thread ref through score tool to subscribe

**Files:**
- Modify: `src/app/score/ScoreClient.tsx`
- Modify: `src/app/score/page.tsx`

- [ ] **Step 1: Read ref from URL params in ScoreClient**

At the top of `src/app/score/ScoreClient.tsx`, add `useSearchParams` to the existing React imports:

```typescript
import { useSearchParams } from "next/navigation";
```

Inside the component function (near the other state declarations), add:

```typescript
const searchParams = useSearchParams();
const blogRef = searchParams.get("ref");
```

- [ ] **Step 2: Pass ref to subscribe call**

In the email form submit handler (around line 612), change:
```typescript
body: JSON.stringify({ email: emailInput, source: "score-page", scoreBand: result.band, scoreValue: result.score, chargeType: answers.chargeType }),
```
To:
```typescript
body: JSON.stringify({ email: emailInput, source: "score-page", scoreBand: result.band, scoreValue: result.score, chargeType: answers.chargeType, ...(blogRef ? { referralUrl: blogRef } : {}) }),
```

- [ ] **Step 3: Pass ref to downstream CTA links**

Find the CTA section (around line 646+) where checkout links are built. For any `href` pointing to `/checkout?...`, append `&ref=${blogRef}` when blogRef exists. Use the same appendRef helper pattern:

```typescript
const appendRef = (url: string) => {
  if (!blogRef) return url;
  return url.includes("?") ? `${url}&ref=${blogRef}` : `${url}?ref=${blogRef}`;
};
```

Apply to all checkout/playbook links in the CTA section.

- [ ] **Step 4: Wrap ScoreClient in Suspense in page.tsx**

`useSearchParams()` requires a Suspense boundary in Next.js 15. Update `src/app/score/page.tsx`, change:

```tsx
export default function ScorePage() {
  return <ScoreClient />;
}
```
To:
```tsx
import { Suspense } from "react";

export default function ScorePage() {
  return (
    <Suspense fallback={null}>
      <ScoreClient />
    </Suspense>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add src/app/score/ScoreClient.tsx src/app/score/page.tsx
git commit -m "feat(attribution): thread blog ref through score tool to subscribe + checkout"
```

---

## Phase 1: Traffic-Based Feedback Loop

### Task 6: Migration, demand_feedback table

**Files:**
- Create: `supabase/migrations/20260409g_demand_feedback.sql`

- [ ] **Step 1: Write the migration**

```sql
, demand_feedback: stores per-charge-type feedback signals that the generation
, pipeline consumes to improve topic selection, prompt guidance, and QA thresholds.

CREATE TABLE IF NOT EXISTS demand_feedback (
  charge_type_slug text PRIMARY KEY,
  performance_multiplier numeric(4,2) NOT NULL DEFAULT 1.0,
  winning_patterns jsonb NOT NULL DEFAULT '{}',
  qa_humanizer_threshold integer NOT NULL DEFAULT 45,
  updated_at timestamptz NOT NULL DEFAULT now()
);

, Trigger for updated_at
CREATE TRIGGER update_demand_feedback_updated_at
  BEFORE UPDATE ON demand_feedback
  FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);

ALTER TABLE demand_feedback ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE demand_feedback IS 'Per-charge-type feedback signals consumed by blog generation pipeline';
COMMENT ON COLUMN demand_feedback.performance_multiplier IS 'Multiplier (0.5-2.0) applied to gap_score in score-demand.ts. Higher = more content generated for this charge type.';
COMMENT ON COLUMN demand_feedback.winning_patterns IS 'Structural features extracted from top-performing posts (question density, opening pattern, etc.)';
COMMENT ON COLUMN demand_feedback.qa_humanizer_threshold IS 'Adaptive humanizer pass threshold (floor 25, ceiling 55, default 45)';
```

- [ ] **Step 2: Apply migration**

Same approach as Task 1 Step 2.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260409g_demand_feedback.sql
git commit -m "feat(feedback): create demand_feedback table"
```

---

### Task 7: feedback-score.ts, Performance multiplier + emerging auto-promote

**Files:**
- Create: `src/lib/demand/feedback-score.ts`

- [ ] **Step 1: Write the module**

```typescript
/**
 * @file Feedback Score, computes performance multipliers per charge type
 * and auto-promotes qualifying emerging topics.
 *
 * Called weekly by /api/cron/demand-feedback-score (Sundays, after demand-performance).
 * Kevin Indig SEO growth loop: performance feeds back into topic selection.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export interface FeedbackScoreResult {
  multipliersUpserted: number;
  emergingPromoted: number;
}

/**
 * Computes a performance multiplier (0.5–2.0) per charge type based on
 * content_performance data (30d window). Falls back to uniform 1.0 when
 * no attribution data exists yet.
 *
 * Also auto-promotes emerging topics that meet thresholds (post_count >= 5,
 * avg_urgency >= 6) into the content_gaps queue.
 */
export async function computeFeedbackScores(
  supabase: SupabaseClient
): Promise<FeedbackScoreResult> {
  // ── Load performance data (30d window) ──
  const { data: perfRows } = await supabase
    .from("content_performance")
    .select("charge_type_slug, subscriber_signups, orders_attributed, revenue_attributed")
    .eq("window_label", "30d");

  // ── Aggregate by charge type ──
  const byCharge: Record<string, { signups: number; orders: number; posts: number }> = {};
  for (const row of perfRows || []) {
    if (!row.charge_type_slug) continue;
    if (!byCharge[row.charge_type_slug]) {
      byCharge[row.charge_type_slug] = { signups: 0, orders: 0, posts: 0 };
    }
    byCharge[row.charge_type_slug].signups += row.subscriber_signups || 0;
    byCharge[row.charge_type_slug].orders += row.orders_attributed || 0;
    byCharge[row.charge_type_slug].posts += 1;
  }

  // ── Compute efficiency scores ──
  const efficiencies: { slug: string; efficiency: number }[] = [];
  let hasRealData = false;

  for (const [slug, data] of Object.entries(byCharge)) {
    if (data.posts === 0) continue;
    const efficiency = (data.orders + data.signups * 0.3) / data.posts;
    if (efficiency > 0) hasRealData = true;
    efficiencies.push({ slug, efficiency });
  }

  // ── Normalize to 0.5–2.0 multiplier range ──
  let multipliersUpserted = 0;

  if (hasRealData && efficiencies.length > 0) {
    // Sort by efficiency, compute median
    const sorted = [...efficiencies].sort((a, b) => a.efficiency - b.efficiency);
    const median = sorted[Math.floor(sorted.length / 2)].efficiency || 1;

    const rows = efficiencies.map(({ slug, efficiency }) => {
      // Ratio to median, clamped to 0.5–2.0
      const raw = median > 0 ? efficiency / median : 1.0;
      const multiplier = Math.round(Math.max(0.5, Math.min(2.0, raw)) * 100) / 100;
      return { charge_type_slug: slug, performance_multiplier: multiplier };
    });

    for (const row of rows) {
      await supabase
        .from("demand_feedback")
        .upsert(row, { onConflict: "charge_type_slug" });
    }
    multipliersUpserted = rows.length;
  } else {
    // No real attribution data yet, all multipliers stay at 1.0 (default)
    console.log("[feedback-score] No attribution data yet, multipliers unchanged");
  }

  // ── Auto-promote emerging topics ──
  const { data: emerging } = await supabase
    .from("emerging_topics")
    .select("id, topic_phrases, representative_title, avg_urgency, post_count")
    .eq("status", "detected")
    .gte("post_count", 5)
    .gte("avg_urgency", 6)
    .order("post_count", { ascending: false })
    .limit(5);

  let emergingPromoted = 0;

  for (const topic of emerging || []) {
    // Derive a charge_type_slug from topic phrases (best effort)
    const phraseSlug = topic.topic_phrases[0]
      ?.toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "general-defense";

    // Check if a content_gap already exists for this slug
    const { data: existingGap } = await supabase
      .from("content_gaps")
      .select("id")
      .eq("charge_type_slug", phraseSlug)
      .is("pain_point_slug", null)
      .limit(1)
      .maybeSingle();

    if (!existingGap) {
      await supabase.from("content_gaps").insert({
        charge_type_slug: phraseSlug,
        pain_point_slug: null,
        demand_quadrant: "GOLD_MINE",
        demand_score: topic.avg_urgency,
        gap_score: 9,
        suggested_title: topic.representative_title || `${phraseSlug}: What Every Defendant Needs to Know`,
        suggested_keywords: topic.topic_phrases,
        status: "identified",
      });
    }

    await supabase
      .from("emerging_topics")
      .update({ status: "auto-promoted" })
      .eq("id", topic.id);

    emergingPromoted++;
  }

  console.log(`[feedback-score] Multipliers: ${multipliersUpserted}, Emerging promoted: ${emergingPromoted}`);
  return { multipliersUpserted, emergingPromoted };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/demand/feedback-score.ts
git commit -m "feat(feedback): feedback-score, performance multiplier + emerging auto-promote"
```

---

### Task 8: feedback-patterns.ts, Structural pattern extraction

**Files:**
- Create: `src/lib/demand/feedback-patterns.ts`

- [ ] **Step 1: Write the module**

```typescript
/**
 * @file Feedback Patterns, extracts structural features from published blog
 * posts and identifies winning patterns by comparing top vs bottom performers.
 *
 * Pure TypeScript analysis, no LLM calls. Reads MDX files from content/blog/.
 * Called weekly by /api/cron/demand-feedback-patterns.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import matter from "gray-matter";

export interface PatternResult {
  postsAnalyzed: number;
  patternsStored: number;
}

interface PostFeatures {
  slug: string;
  category: string;
  wordCount: number;
  paragraphCount: number;
  avgParagraphLength: number;
  questionDensityPer1000: number;
  h2Count: number;
  headingToBodyRatio: number;
  hasBulletList: boolean;
  hasNumberedList: boolean;
  boldPhraseDensity: number;
  firstPersonRatio: number;
  secondPersonRatio: number;
  faqCount: number;
  openingPattern: "question" | "statistic" | "scenario" | "direct-address" | "unknown";
}

function classifyOpening(firstParagraph: string): PostFeatures["openingPattern"] {
  const trimmed = firstParagraph.trim();
  if (trimmed.endsWith("?")) return "question";
  if (/\d+%|\d+ out of|\d+\.\d/.test(trimmed)) return "statistic";
  if (/imagine|picture this|you're sitting|it's 2|it's 3|at 2am|at 3am/i.test(trimmed)) return "scenario";
  if (/^you /i.test(trimmed)) return "direct-address";
  return "unknown";
}

function extractFeatures(slug: string, mdxContent: string): PostFeatures | null {
  let parsed;
  try {
    parsed = matter(mdxContent);
  } catch {
    return null;
  }

  const body = parsed.content;
  const category = (parsed.data.category as string) || "general-defense";

  // Word count (split on whitespace)
  const words = body.split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  if (wordCount < 100) return null; // skip stubs

  // Paragraphs (double newline separated)
  const paragraphs = body.split(/\n\n+/).filter((p) => p.trim().length > 20);
  const paragraphCount = paragraphs.length;
  const avgParagraphLength = paragraphCount > 0 ? wordCount / paragraphCount : 0;

  // Questions
  const questionMarks = (body.match(/\?/g) || []).length;
  const questionDensityPer1000 = wordCount > 0 ? (questionMarks / wordCount) * 1000 : 0;

  // Headings
  const h2Matches = body.match(/^## /gm) || [];
  const h2Count = h2Matches.length;
  const headingToBodyRatio = wordCount > 0 ? h2Count / (wordCount / 1000) : 0;

  // Lists
  const hasBulletList = /^[-*] /m.test(body);
  const hasNumberedList = /^\d+\. /m.test(body);

  // Bold phrases
  const boldMatches = body.match(/\*\*[^*]+\*\*/g) || [];
  const boldPhraseDensity = wordCount > 0 ? (boldMatches.length / wordCount) * 1000 : 0;

  // Pronoun ratios
  const bodyLower = body.toLowerCase();
  const firstPersonCount = (bodyLower.match(/\b(i|we|our|us|my)\b/g) || []).length;
  const secondPersonCount = (bodyLower.match(/\b(you|your|you're|yourself)\b/g) || []).length;
  const totalPronouns = firstPersonCount + secondPersonCount || 1;
  const firstPersonRatio = firstPersonCount / totalPronouns;
  const secondPersonRatio = secondPersonCount / totalPronouns;

  // FAQ count (from frontmatter)
  const faqs = parsed.data.faqs;
  const faqCount = Array.isArray(faqs) ? faqs.length : 0;

  // Opening pattern
  const firstParagraph = paragraphs[0] || "";
  const openingPattern = classifyOpening(firstParagraph);

  return {
    slug,
    category,
    wordCount,
    paragraphCount,
    avgParagraphLength: Math.round(avgParagraphLength),
    questionDensityPer1000: Math.round(questionDensityPer1000 * 10) / 10,
    h2Count,
    headingToBodyRatio: Math.round(headingToBodyRatio * 10) / 10,
    hasBulletList,
    hasNumberedList,
    boldPhraseDensity: Math.round(boldPhraseDensity * 10) / 10,
    firstPersonRatio: Math.round(firstPersonRatio * 100) / 100,
    secondPersonRatio: Math.round(secondPersonRatio * 100) / 100,
    faqCount,
    openingPattern,
  };
}

function avg(arr: number[]): number {
  if (arr.length === 0) return 0;
  return Math.round((arr.reduce((s, v) => s + v, 0) / arr.length) * 10) / 10;
}

function summarizeGroup(features: PostFeatures[]) {
  return {
    count: features.length,
    avgWordCount: avg(features.map((f) => f.wordCount)),
    avgQuestionDensity: avg(features.map((f) => f.questionDensityPer1000)),
    avgH2Count: avg(features.map((f) => f.h2Count)),
    avgParagraphLength: avg(features.map((f) => f.avgParagraphLength)),
    avgBoldDensity: avg(features.map((f) => f.boldPhraseDensity)),
    avgFirstPersonRatio: avg(features.map((f) => f.firstPersonRatio)),
    avgSecondPersonRatio: avg(features.map((f) => f.secondPersonRatio)),
    avgFaqCount: avg(features.map((f) => f.faqCount)),
    openingPatterns: Object.fromEntries(
      ["question", "statistic", "scenario", "direct-address", "unknown"].map((p) => [
        p,
        features.filter((f) => f.openingPattern === p).length,
      ])
    ),
    pctWithBulletList: Math.round((features.filter((f) => f.hasBulletList).length / features.length) * 100),
    pctWithNumberedList: Math.round((features.filter((f) => f.hasNumberedList).length / features.length) * 100),
  };
}

export async function extractWinningPatterns(
  supabase: SupabaseClient
): Promise<PatternResult> {
  // ── Read all published MDX files ──
  const blogDir = join(process.cwd(), "content", "blog");
  let files: string[];
  try {
    files = readdirSync(blogDir).filter((f) => f.endsWith(".mdx"));
  } catch {
    console.error("[feedback-patterns] Cannot read content/blog/ directory");
    return { postsAnalyzed: 0, patternsStored: 0 };
  }

  const allFeatures: PostFeatures[] = [];
  for (const file of files) {
    const slug = file.replace(/\.mdx$/, "");
    const content = readFileSync(join(blogDir, file), "utf-8");
    const features = extractFeatures(slug, content);
    if (features) allFeatures.push(features);
  }

  console.log(`[feedback-patterns] Analyzed ${allFeatures.length} posts`);

  if (allFeatures.length < 5) {
    console.log("[feedback-patterns] Too few posts for pattern extraction");
    return { postsAnalyzed: allFeatures.length, patternsStored: 0 };
  }

  // ── Try to rank by performance data ──
  const { data: perfRows } = await supabase
    .from("content_performance")
    .select("blog_slug, subscriber_signups, orders_attributed")
    .eq("window_label", "all-time");

  const perfBySlug: Record<string, number> = {};
  let hasRealPerf = false;
  for (const row of perfRows || []) {
    const score = (row.orders_attributed || 0) * 3 + (row.subscriber_signups || 0);
    if (score > 0) hasRealPerf = true;
    perfBySlug[row.blog_slug] = score;
  }

  // Sort features by performance (or alphabetically if no perf data)
  const ranked = [...allFeatures].sort((a, b) => {
    const aScore = perfBySlug[a.slug] ?? 0;
    const bScore = perfBySlug[b.slug] ?? 0;
    return bScore - aScore;
  });

  // Top 10 vs bottom 10 (or top/bottom third if fewer posts)
  const splitAt = Math.max(5, Math.floor(ranked.length / 3));
  const topPosts = ranked.slice(0, splitAt);
  const bottomPosts = ranked.slice(-splitAt);

  const topSummary = summarizeGroup(topPosts);
  const bottomSummary = summarizeGroup(bottomPosts);

  // ── Build winning patterns object ──
  const patterns = {
    dataSource: hasRealPerf ? "attribution" : "structural-analysis",
    analyzedAt: new Date().toISOString(),
    postCount: allFeatures.length,
    topPerformers: topSummary,
    bottomPerformers: bottomSummary,
    insights: [] as string[],
  };

  // Generate natural-language insights from deltas
  const qDelta = topSummary.avgQuestionDensity - bottomSummary.avgQuestionDensity;
  if (Math.abs(qDelta) > 1) {
    patterns.insights.push(
      `Top performers average ${topSummary.avgQuestionDensity} questions/1000 words vs ${bottomSummary.avgQuestionDensity} for bottom. ${qDelta > 0 ? "More questions correlate with better performance." : "Fewer questions correlate with better performance."}`
    );
  }

  const wcDelta = topSummary.avgWordCount - bottomSummary.avgWordCount;
  if (Math.abs(wcDelta) > 200) {
    patterns.insights.push(
      `Top performers average ${topSummary.avgWordCount} words vs ${bottomSummary.avgWordCount}. ${wcDelta > 0 ? "Longer posts perform better." : "Shorter posts perform better."}`
    );
  }

  if (topSummary.pctWithNumberedList > bottomSummary.pctWithNumberedList + 20) {
    patterns.insights.push(
      `${topSummary.pctWithNumberedList}% of top performers use numbered lists vs ${bottomSummary.pctWithNumberedList}% of bottom. Include numbered steps.`
    );
  }

  const p2Delta = topSummary.avgSecondPersonRatio - bottomSummary.avgSecondPersonRatio;
  if (Math.abs(p2Delta) > 0.05) {
    patterns.insights.push(
      `Top performers use ${Math.round(topSummary.avgSecondPersonRatio * 100)}% second-person pronouns vs ${Math.round(bottomSummary.avgSecondPersonRatio * 100)}%. ${p2Delta > 0 ? "More 'you/your' correlates with performance." : "Less direct address correlates with performance."}`
    );
  }

  // ── Store patterns per charge type ──
  const byCategory: Record<string, PostFeatures[]> = {};
  for (const f of allFeatures) {
    if (!byCategory[f.category]) byCategory[f.category] = [];
    byCategory[f.category].push(f);
  }

  let patternsStored = 0;
  // Store global patterns under a "global" key
  await supabase.from("demand_feedback").upsert(
    { charge_type_slug: "_global", winning_patterns: patterns },
    { onConflict: "charge_type_slug" }
  );
  patternsStored++;

  // Store per-category patterns where we have 3+ posts
  for (const [category, features] of Object.entries(byCategory)) {
    if (features.length < 3) continue;
    const catSummary = summarizeGroup(features);
    await supabase.from("demand_feedback").upsert(
      {
        charge_type_slug: category,
        winning_patterns: { ...patterns, categoryOverride: catSummary },
      },
      { onConflict: "charge_type_slug" }
    );
    patternsStored++;
  }

  console.log(`[feedback-patterns] Stored patterns for ${patternsStored} categories`);
  return { postsAnalyzed: allFeatures.length, patternsStored };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/demand/feedback-patterns.ts
git commit -m "feat(feedback): feedback-patterns, structural feature extraction + winning pattern analysis"
```

---

### Task 9: Cron routes for feedback-score and feedback-patterns

**Files:**
- Create: `src/app/api/cron/demand-feedback-score/route.ts`
- Create: `src/app/api/cron/demand-feedback-patterns/route.ts`

- [ ] **Step 1: Write demand-feedback-score cron route**

```typescript
/**
 * @file /api/cron/demand-feedback-score, Weekly performance feedback scorer
 *
 * Schedule: Sundays 7:00 AM ET via cron-job.org (after demand-performance at 6:00 AM).
 * Computes performance multipliers and auto-promotes emerging topics.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";
import { acquireCronLock, releaseCronLock } from "@/lib/cron-idempotency";
import { computeFeedbackScores } from "@/lib/demand/feedback-score";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = requireCron(req);
  if (!auth.authorized) return auth.error;

  const lock = await acquireCronLock("demand-feedback-score", 7 * 24 * 60 * 60 * 1000);
  if (!lock.shouldRun) {
    return NextResponse.json({ skipped: true, reason: lock.reason });
  }

  const supabase = createAdminClient();

  try {
    const result = await computeFeedbackScores(supabase);
    await releaseCronLock(lock.executionId, "completed");
    return NextResponse.json(result);
  } catch (err) {
    console.error("[demand-feedback-score] Error:", err);
    await releaseCronLock(lock.executionId, "failed");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Write demand-feedback-patterns cron route**

```typescript
/**
 * @file /api/cron/demand-feedback-patterns, Weekly structural pattern extraction
 *
 * Schedule: Sundays 8:00 AM ET via cron-job.org (after demand-feedback-score at 7:00 AM).
 * Extracts winning patterns from published blog posts.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";
import { acquireCronLock, releaseCronLock } from "@/lib/cron-idempotency";
import { extractWinningPatterns } from "@/lib/demand/feedback-patterns";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = requireCron(req);
  if (!auth.authorized) return auth.error;

  const lock = await acquireCronLock("demand-feedback-patterns", 7 * 24 * 60 * 60 * 1000);
  if (!lock.shouldRun) {
    return NextResponse.json({ skipped: true, reason: lock.reason });
  }

  const supabase = createAdminClient();

  try {
    const result = await extractWinningPatterns(supabase);
    await releaseCronLock(lock.executionId, "completed");
    return NextResponse.json(result);
  } catch (err) {
    console.error("[demand-feedback-patterns] Error:", err);
    await releaseCronLock(lock.executionId, "failed");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/cron/demand-feedback-score/route.ts src/app/api/cron/demand-feedback-patterns/route.ts
git commit -m "feat(feedback): cron routes for feedback-score and feedback-patterns"
```

---

### Task 10: Wire performance multiplier into score-demand.ts

**Files:**
- Modify: `src/lib/demand/score-demand.ts`

- [ ] **Step 1: Load demand_feedback at function start**

In `src/lib/demand/score-demand.ts`, inside `scoreDemand()` (after `loadPainPointCategories` call around line 530), add:

```typescript
  // Load feedback multipliers for performance-weighted gap scoring
  const { data: feedbackRows } = await supabase
    .from("demand_feedback")
    .select("charge_type_slug, performance_multiplier");
  const feedbackByCharge: Record<string, number> = {};
  for (const row of feedbackRows || []) {
    feedbackByCharge[row.charge_type_slug] = row.performance_multiplier;
  }
```

- [ ] **Step 2: Apply multiplier to gap_score**

Replace line 370:
```typescript
    score.content_gap_score = Math.max(1, 10 - blogCount * 2);
```
With:
```typescript
    const multiplier = feedbackByCharge[score.dimension_slug]?.valueOf() ?? 1.0;
    score.content_gap_score = Math.max(1, Math.round((10 - blogCount * 2) * multiplier * 100) / 100);
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/demand/score-demand.ts
git commit -m "feat(feedback): apply performance multiplier to gap_score in score-demand"
```

---

### Task 11: Inject winning patterns into engine prompts

**Files:**
- Modify: `C:\Users\email\projects\ImNotAnAttorney-engine\src\lib\blog-gen\prompts.mjs`
- Modify: `C:\Users\email\projects\ImNotAnAttorney-engine\src\workers\blog-generate.mjs`

- [ ] **Step 1: Add winningPatterns to prompt template**

In `C:\Users\email\projects\ImNotAnAttorney-engine\src\lib\blog-gen\prompts.mjs`, after line 257 (`${VIRALITY_CONVERGENCE_BLOCK}`), before line 259 (`## CATEGORY VOICE PROFILE`), insert:

```javascript
${enrichment.winningPatterns ? `
## WHAT'S WORKING (data from top-performing posts)

Apply these structural patterns extracted from our highest-performing published posts:

${typeof enrichment.winningPatterns === 'string' ? enrichment.winningPatterns : enrichment.winningPatterns.insights?.join('\\n') || 'No specific patterns identified yet.'}
` : ''}
```

- [ ] **Step 2: Load winning patterns in blog-generate worker**

In `C:\Users\email\projects\ImNotAnAttorney-engine\src\workers\blog-generate.mjs`, in the enrichment section where `enrichTopic` is called, after the enrichment object is built, add:

```javascript
  // Load winning patterns from demand_feedback for this charge type
  const { data: feedbackRow } = await supabase
    .from("demand_feedback")
    .select("winning_patterns")
    .eq("charge_type_slug", gap.charge_type_slug)
    .maybeSingle();

  const globalFeedback = await supabase
    .from("demand_feedback")
    .select("winning_patterns")
    .eq("charge_type_slug", "_global")
    .maybeSingle();

  enrichment.winningPatterns = feedbackRow?.data?.winning_patterns
    || globalFeedback?.data?.winning_patterns
    || null;
```

- [ ] **Step 3: Commit (in engine repo)**

```bash
cd C:/Users/email/projects/ImNotAnAttorney-engine
git add src/lib/blog-gen/prompts.mjs src/workers/blog-generate.mjs
git commit -m "feat(feedback): inject winning patterns into blog generation prompts"
cd C:/Users/email/projects/ImNotAnAttorney-web
```

---

### Task 12: Register cron jobs with cron-job.org

**Files:**
- Create: `scripts/setup-demand-feedback-crons.js`

- [ ] **Step 1: Write setup script**

```javascript
/**
 * Register demand feedback cron jobs with cron-job.org.
 * Run once: node scripts/setup-demand-feedback-crons.js
 */
const CRONJOB_API_KEY = "qmy3F+k6DrUgKCz/Jp8fEnpViJrE3pgaUfOoO8yAQn4=";
const SITE_URL = "https://imnotanattorney.com";
const CRON_AUTH_TOKEN = process.env.CRON_AUTH_TOKEN;

if (!CRON_AUTH_TOKEN) {
  console.error("CRON_AUTH_TOKEN env var required");
  process.exit(1);
}

const JOBS = [
  {
    title: "INAA demand-feedback-score",
    url: `${SITE_URL}/api/cron/demand-feedback-score`,
    schedule: { minutes: [0], hours: [11], mdays: [-1], months: [-1], wdays: [0] }, // Sun 11:00 UTC = 7:00 AM ET
  },
  {
    title: "INAA demand-feedback-patterns",
    url: `${SITE_URL}/api/cron/demand-feedback-patterns`,
    schedule: { minutes: [0], hours: [12], mdays: [-1], months: [-1], wdays: [0] }, // Sun 12:00 UTC = 8:00 AM ET
  },
  {
    title: "INAA demand-feedback-revise",
    url: `${SITE_URL}/api/cron/demand-feedback-revise`,
    schedule: { minutes: [0], hours: [13], mdays: [-1], months: [-1], wdays: [0] }, // Sun 13:00 UTC = 9:00 AM ET
  },
];

async function register() {
  for (const job of JOBS) {
    // Check if already exists
    const listRes = await fetch("https://api.cron-job.org/jobs", {
      headers: { Authorization: `Bearer ${CRONJOB_API_KEY}` },
    });
    const { jobs } = await listRes.json();
    const existing = jobs?.find((j) => j.title === job.title);
    if (existing) {
      console.log(`[skip] ${job.title} already exists (ID: ${existing.jobId})`);
      continue;
    }

    const res = await fetch("https://api.cron-job.org/jobs", {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${CRONJOB_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        job: {
          title: job.title,
          url: job.url,
          enabled: true,
          saveResponses: true,
          schedule: job.schedule,
          requestTimeout: 300,
          requestMethod: 0, // GET
          extendedData: {
            headers: { Authorization: `Bearer ${CRON_AUTH_TOKEN}` },
          },
        },
      }),
    });

    const data = await res.json();
    console.log(`[registered] ${job.title} -> ID: ${data.jobId}`);
  }
}

register().catch(console.error);
```

- [ ] **Step 2: Run setup script**

Run: `node scripts/setup-demand-feedback-crons.js`

- [ ] **Step 3: Commit**

```bash
git add scripts/setup-demand-feedback-crons.js
git commit -m "feat(feedback): register 3 feedback cron jobs with cron-job.org"
```

---

## Phase 2: Attribution-Powered Closed Loop

### Task 13: Migration, content_revisions table

**Files:**
- Create: `supabase/migrations/20260409h_content_revisions.sql`

- [ ] **Step 1: Write the migration**

```sql
CREATE TABLE IF NOT EXISTS content_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blog_slug text NOT NULL,
  content_post_id integer REFERENCES content_posts(id),
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'flagged'
    CHECK (status IN ('flagged', 'queued', 'regenerated', 'published', 'skipped')),
  original_performance jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_content_revisions_status ON content_revisions(status);
CREATE INDEX idx_content_revisions_slug ON content_revisions(blog_slug);

CREATE TRIGGER update_content_revisions_updated_at
  BEFORE UPDATE ON content_revisions
  FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);

ALTER TABLE content_revisions ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE content_revisions IS 'Tracks underperforming posts flagged for regeneration by the feedback loop';
```

- [ ] **Step 2: Apply migration and commit**

```bash
git add supabase/migrations/20260409h_content_revisions.sql
git commit -m "feat(feedback): create content_revisions table for underperformer tracking"
```

---

### Task 14: feedback-revise.ts, Underperformer flagging + adaptive QA

**Files:**
- Create: `src/lib/demand/feedback-revise.ts`

- [ ] **Step 1: Write the module**

```typescript
/**
 * @file Feedback Revise, flags underperforming posts for regeneration and
 * computes adaptive QA thresholds based on performance correlations.
 *
 * Called weekly by /api/cron/demand-feedback-revise (Sundays, after feedback-patterns).
 *
 * Safety gates:
 * - Underperformer flagging: only activates when >= 5 posts have non-zero attribution
 * - Adaptive QA: only adjusts when >= 10 posts have humanizer scores + attribution data
 * - Max 2 revisions flagged per week
 * - Threshold floor 25, ceiling 55, max +/- 5 per adjustment
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export interface ReviseResult {
  underperformersFlagged: number;
  adaptiveThreshold: number | null;
  skippedReason: string | null;
}

const MIN_POSTS_FOR_FLAGGING = 5;
const MIN_POSTS_FOR_ADAPTIVE_QA = 10;
const MAX_FLAGS_PER_WEEK = 2;
const THRESHOLD_FLOOR = 25;
const THRESHOLD_CEILING = 55;
const MAX_ADJUSTMENT = 5;
const MIN_POST_AGE_DAYS = 30;

export async function computeFeedbackRevisions(
  supabase: SupabaseClient
): Promise<ReviseResult> {
  // ── Check if enough attribution data exists ──
  const { data: perfRows } = await supabase
    .from("content_performance")
    .select("blog_slug, subscriber_signups, orders_attributed")
    .eq("window_label", "all-time");

  const postsWithAttribution = (perfRows || []).filter(
    (r) => (r.subscriber_signups || 0) > 0 || (r.orders_attributed || 0) > 0
  );

  if (postsWithAttribution.length < MIN_POSTS_FOR_FLAGGING) {
    console.log(
      `[feedback-revise] Only ${postsWithAttribution.length} posts with attribution (need ${MIN_POSTS_FOR_FLAGGING}). Skipping.`
    );
    return {
      underperformersFlagged: 0,
      adaptiveThreshold: null,
      skippedReason: `insufficient_attribution_data (${postsWithAttribution.length}/${MIN_POSTS_FOR_FLAGGING})`,
    };
  }

  // ── Flag underperformers ──
  const cutoffDate = new Date(Date.now() - MIN_POST_AGE_DAYS * 24 * 60 * 60 * 1000).toISOString();

  // Find posts with 30+ days of data and zero performance
  const zeroPerformers = (perfRows || []).filter(
    (r) => (r.subscriber_signups || 0) === 0 && (r.orders_attributed || 0) === 0
  );

  // Check which ones are old enough and not already flagged
  const { data: existingRevisions } = await supabase
    .from("content_revisions")
    .select("blog_slug")
    .in("status", ["flagged", "queued", "regenerated"]);

  const alreadyFlagged = new Set((existingRevisions || []).map((r) => r.blog_slug));

  // Get post creation dates from content_posts
  const { data: postDates } = await supabase
    .from("content_posts")
    .select("blog_slug, created_at")
    .eq("status", "published");

  const dateBySlug: Record<string, string> = {};
  for (const p of postDates || []) {
    dateBySlug[p.blog_slug] = p.created_at;
  }

  const candidates = zeroPerformers.filter((r) => {
    if (alreadyFlagged.has(r.blog_slug)) return false;
    const createdAt = dateBySlug[r.blog_slug];
    if (!createdAt || createdAt > cutoffDate) return false;
    return true;
  });

  let flagged = 0;
  for (const candidate of candidates.slice(0, MAX_FLAGS_PER_WEEK)) {
    await supabase.from("content_revisions").insert({
      blog_slug: candidate.blog_slug,
      reason: "underperformer_30d",
      status: "flagged",
      original_performance: {
        subscriber_signups: candidate.subscriber_signups,
        orders_attributed: candidate.orders_attributed,
      },
    });
    flagged++;
  }

  console.log(`[feedback-revise] Flagged ${flagged} underperformers`);

  // ── Adaptive QA threshold ──
  let adaptiveThreshold: number | null = null;

  // Load humanizer scores from blog_drafts
  const { data: drafts } = await supabase
    .from("blog_drafts")
    .select("slug, humanizer_score")
    .not("humanizer_score", "is", null)
    .eq("status", "published");

  if ((drafts || []).length >= MIN_POSTS_FOR_ADAPTIVE_QA) {
    // Join with performance data
    const perfBySlug: Record<string, number> = {};
    for (const r of perfRows || []) {
      perfBySlug[r.blog_slug] = (r.orders_attributed || 0) * 3 + (r.subscriber_signups || 0);
    }

    const withBoth = (drafts || [])
      .filter((d) => perfBySlug[d.slug] !== undefined)
      .map((d) => ({
        score: d.humanizer_score as number,
        performance: perfBySlug[d.slug] || 0,
      }));

    if (withBoth.length >= MIN_POSTS_FOR_ADAPTIVE_QA) {
      // Split into score buckets and compare performance
      const lowBucket = withBoth.filter((d) => d.score < 35);
      const midBucket = withBoth.filter((d) => d.score >= 35 && d.score < 45);
      const highBucket = withBoth.filter((d) => d.score >= 45);

      const avgPerf = (arr: typeof withBoth) =>
        arr.length > 0 ? arr.reduce((s, d) => s + d.performance, 0) / arr.length : 0;

      const lowAvg = avgPerf(lowBucket);
      const midAvg = avgPerf(midBucket);
      const highAvg = avgPerf(highBucket);

      // Get current threshold
      const { data: currentFeedback } = await supabase
        .from("demand_feedback")
        .select("qa_humanizer_threshold")
        .eq("charge_type_slug", "_global")
        .maybeSingle();

      const currentThreshold = currentFeedback?.qa_humanizer_threshold ?? 45;

      // If lower scores correlate with better performance, adjust down
      let adjustment = 0;
      if (lowAvg > midAvg && lowAvg > highAvg && lowBucket.length >= 3) {
        adjustment = -MAX_ADJUSTMENT; // More human-sounding posts perform better
      } else if (highAvg > midAvg && highAvg > lowAvg && highBucket.length >= 3) {
        adjustment = MAX_ADJUSTMENT; // Higher threshold needed
      }

      adaptiveThreshold = Math.max(
        THRESHOLD_FLOOR,
        Math.min(THRESHOLD_CEILING, currentThreshold + adjustment)
      );

      await supabase.from("demand_feedback").upsert(
        { charge_type_slug: "_global", qa_humanizer_threshold: adaptiveThreshold },
        { onConflict: "charge_type_slug" }
      );

      console.log(
        `[feedback-revise] Adaptive QA: ${currentThreshold} -> ${adaptiveThreshold} (low=${lowAvg.toFixed(1)}, mid=${midAvg.toFixed(1)}, high=${highAvg.toFixed(1)})`
      );
    }
  } else {
    console.log(
      `[feedback-revise] Not enough drafts with humanizer scores for adaptive QA (${(drafts || []).length}/${MIN_POSTS_FOR_ADAPTIVE_QA})`
    );
  }

  return {
    underperformersFlagged: flagged,
    adaptiveThreshold,
    skippedReason: null,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/demand/feedback-revise.ts
git commit -m "feat(feedback): feedback-revise, underperformer flagging + adaptive QA threshold"
```

---

### Task 15: Cron route for feedback-revise

**Files:**
- Create: `src/app/api/cron/demand-feedback-revise/route.ts`

- [ ] **Step 1: Write the cron route**

```typescript
/**
 * @file /api/cron/demand-feedback-revise, Weekly underperformer flagging + adaptive QA
 *
 * Schedule: Sundays 9:00 AM ET via cron-job.org (after demand-feedback-patterns at 8:00 AM).
 * Self-gates: only activates when sufficient attribution data exists.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";
import { acquireCronLock, releaseCronLock } from "@/lib/cron-idempotency";
import { computeFeedbackRevisions } from "@/lib/demand/feedback-revise";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = requireCron(req);
  if (!auth.authorized) return auth.error;

  const lock = await acquireCronLock("demand-feedback-revise", 7 * 24 * 60 * 60 * 1000);
  if (!lock.shouldRun) {
    return NextResponse.json({ skipped: true, reason: lock.reason });
  }

  const supabase = createAdminClient();

  try {
    const result = await computeFeedbackRevisions(supabase);
    await releaseCronLock(lock.executionId, "completed");
    return NextResponse.json(result);
  } catch (err) {
    console.error("[demand-feedback-revise] Error:", err);
    await releaseCronLock(lock.executionId, "failed");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/cron/demand-feedback-revise/route.ts
git commit -m "feat(feedback): cron route for demand-feedback-revise"
```

---

### Task 16: Make humanizer accept adaptive threshold

**Files:**
- Modify: `scripts/lib/blog-gen/humanizer.mjs:287,717`
- Modify: `C:\Users\email\projects\ImNotAnAttorney-engine\src\lib\blog-gen\humanizer.mjs` (same change)

- [ ] **Step 1: Update function signature**

In both copies of `humanizer.mjs`, change line 287 from:
```javascript
export function runHumanizerCheck(mdxContent) {
```
To:
```javascript
export function runHumanizerCheck(mdxContent, options = {}) {
```

- [ ] **Step 2: Use threshold from options**

Change line 717 from:
```javascript
    passed: compositeScore < 45,
```
To:
```javascript
    passed: compositeScore < (options.threshold ?? 45),
```

- [ ] **Step 3: Commit both repos**

```bash
git add scripts/lib/blog-gen/humanizer.mjs
git commit -m "feat(feedback): humanizer accepts adaptive threshold option"
```

```bash
cd C:/Users/email/projects/ImNotAnAttorney-engine
git add src/lib/blog-gen/humanizer.mjs
git commit -m "feat(feedback): humanizer accepts adaptive threshold option"
cd C:/Users/email/projects/ImNotAnAttorney-web
```

---

### Task 17: Load adaptive threshold in qa-existing-post.mjs

**Files:**
- Modify: `scripts/qa-existing-post.mjs`

- [ ] **Step 1: Add Supabase client for threshold loading**

At the top of `scripts/qa-existing-post.mjs`, after existing imports, add:

```javascript
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

async function loadAdaptiveThreshold() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return 45; // fallback to default

  const supabase = createClient(url, key);
  const { data } = await supabase
    .from("demand_feedback")
    .select("qa_humanizer_threshold")
    .eq("charge_type_slug", "_global")
    .maybeSingle();

  return data?.qa_humanizer_threshold ?? 45;
}
```

- [ ] **Step 2: Pass threshold to humanizer**

In the `runAllGates` function, where humanizer is called (around line 94-106), load and pass the threshold:

Before the gate loop, add:
```javascript
  const adaptiveThreshold = await loadAdaptiveThreshold();
```

Where humanizer is invoked, change from:
```javascript
runHumanizerCheck(mdxContent)
```
To:
```javascript
runHumanizerCheck(mdxContent, { threshold: adaptiveThreshold })
```

- [ ] **Step 3: Commit**

```bash
git add scripts/qa-existing-post.mjs
git commit -m "feat(feedback): qa runner loads adaptive humanizer threshold from demand_feedback"
```

---

### Task 18: Final verification + deploy

- [ ] **Step 1: Build check**

Run: `npm run build`

Expected: Clean build, no TypeScript errors.

- [ ] **Step 2: Verify attribution chain locally**

Open `http://localhost:3000/blog/dui-first-72-hours-what-to-do` and verify:
- BlogInlineCapture `/score` link includes `?ref=blog-dui-first-72-hours-what-to-do`
- BlogCTA links include `?ref=blog-...`
- PlaybookCTA links include `?ref=blog-...`
- Bottom Score CTA includes `?ref=blog-...`

- [ ] **Step 3: Verify score page threads ref**

Navigate to `/score?ref=blog-test-slug`, complete the quiz, enter email, and check that the `/api/subscribe` call includes `referralUrl: "blog-test-slug"`.

- [ ] **Step 4: Run cron setup script**

```bash
node scripts/setup-demand-feedback-crons.js
```

Expected: 3 cron jobs registered (or skipped if already exist).

- [ ] **Step 5: Push to deploy**

```bash
git push origin master
```

Vercel auto-deploys from master. Verify at https://imnotanattorney.com that build succeeds.
