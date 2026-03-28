/**
 * @fileoverview Demand scorer — computes demand scores, quadrants, content gaps,
 * and emerging topics from reddit_signals data.
 *
 * Ported from scripts/demand/score-demand.mjs.
 * Called by /api/cron/demand-score on a daily cron schedule.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

// ── Constants ──────────────────────────────────────────────
const WINDOWS = [7, 30, 90];
const PRICE_WEIGHT = 1.5; // price-sensitive posts count 1.5x

// ── Stop words for n-gram extraction ───────────────────────
const STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for", "of", "with",
  "by", "from", "up", "about", "into", "over", "after", "my", "me", "i", "we", "he",
  "she", "it", "they", "them", "their", "his", "her", "its", "our", "your", "is",
  "am", "are", "was", "were", "be", "been", "being", "have", "has", "had", "do",
  "does", "did", "will", "would", "could", "should", "may", "might", "can", "this",
  "that", "these", "those", "what", "which", "who", "whom", "how", "when", "where",
  "why", "not", "no", "so", "if", "then", "than", "too", "very", "just", "also",
  "all", "any", "each", "every", "some", "many", "much", "more", "most", "other",
  "new", "old", "first", "last", "long", "little", "own", "same", "than", "only",
  "like", "got", "get", "go", "going", "went", "said", "one", "two", "know",
  "think", "need", "want", "see", "look", "make", "way", "thing", "still",
  // Legal boilerplate to ignore
  "my lawyer", "the judge", "lawyer", "attorney", "court", "charge",
  "case", "arrested", "police", "officer", "legal", "criminal",
]);

// ── Types ──────────────────────────────────────────────────

export type Quadrant = "GOLD_MINE" | "RED_OCEAN" | "RISKY_BET" | "DEAD_ZONE";
export type TrendDirection = "rising" | "falling" | "stable";

export interface DemandScoreRow {
  dimension_type: string;
  dimension_slug: string;
  dimension_label: string;
  window_start: string;
  window_end: string;
  window_label: string;
  post_count: number;
  question_count: number;
  total_score: number;
  total_comments: number;
  avg_score: number;
  avg_comments: number;
  avg_urgency: number;
  high_urgency_count: number;
  prev_period_post_count: number;
  trend_direction: TrendDirection;
  trend_pct: number;
  demand_score: number;
  competition_score: number;
  opportunity_score: number;
  quadrant: Quadrant;
  has_blog_coverage: boolean;
  blog_post_count: number;
  content_gap_score: number;
  scored_at: string;
}

export interface ContentGapRow {
  charge_type_slug: string;
  pain_point_slug: string | null;
  demand_quadrant: Quadrant;
  demand_score: number;
  has_blog_post: boolean;
  blog_slug: string | null;
  gap_score: number;
  suggested_title: string;
  suggested_keywords: string[];
  status: string;
}

export interface EmergingTopicRow {
  topic_phrases: string[];
  representative_title: string;
  post_count: number;
  first_seen_at: string;
  last_seen_at: string;
  avg_urgency: number;
  avg_engagement: number;
  status: string;
}

export interface ScoreResult {
  scoresUpserted: number;
  gapsUpserted: number;
  emergingProcessed: number;
}

// ── Reference data loaders ─────────────────────────────────

interface ChargeType {
  slug: string;
  label: string;
}

interface PainPoint {
  blog_slug: string | null;
  title: string;
  category: string;
}

interface ContentPost {
  blog_slug: string;
  pain_point_id: number | null;
  status: string;
}

interface PainPointCategory {
  id: number;
  category: string;
  blog_slug: string | null;
}

async function loadChargeTypes(supabase: SupabaseClient): Promise<ChargeType[]> {
  const { data } = await supabase
    .from("charge_types")
    .select("slug, label")
    .order("sort_order");
  return data || [];
}

async function loadPainPoints(supabase: SupabaseClient): Promise<PainPoint[]> {
  const { data } = await supabase
    .from("content_pain_points")
    .select("blog_slug, title, category");
  return data || [];
}

async function loadContentPosts(supabase: SupabaseClient): Promise<ContentPost[]> {
  const { data } = await supabase
    .from("content_posts")
    .select("blog_slug, pain_point_id, status");
  return data || [];
}

async function loadPainPointCategories(supabase: SupabaseClient): Promise<PainPointCategory[]> {
  const { data } = await supabase
    .from("content_pain_points")
    .select("id, category, blog_slug");
  return data || [];
}

// ── Signal query ───────────────────────────────────────────

interface SignalRow {
  score: number | null;
  num_comments: number | null;
  has_question: boolean | null;
  urgency_score: number | null;
  price_sensitivity: boolean | null;
}

async function querySignals(
  supabase: SupabaseClient,
  dimensionType: string,
  dimensionSlug: string,
  windowStart: Date,
  windowEnd: Date
): Promise<SignalRow[]> {
  let query = supabase
    .from("reddit_signals")
    .select("score, num_comments, has_question, urgency_score, price_sensitivity")
    .gte("reddit_created_at", windowStart.toISOString())
    .lte("reddit_created_at", windowEnd.toISOString());

  if (dimensionType === "charge_type") {
    query = query.contains("charge_type_slugs", [dimensionSlug]);
  } else {
    query = query.contains("pain_point_slugs", [dimensionSlug]);
  }

  const { data, error } = await query;
  if (error) {
    console.warn(`[score-demand] Error querying signals for ${dimensionSlug}:`, error.message);
    return [];
  }
  return data || [];
}

// ── Percentile rank ────────────────────────────────────────

function percentileRank(value: number, allValues: number[]): number {
  if (allValues.length === 0) return 0;
  const below = allValues.filter(v => v < value).length;
  return below / allValues.length;
}

// ── Score a single dimension across all windows ────────────

async function scoreDimension(
  supabase: SupabaseClient,
  dimType: string,
  dimSlug: string,
  dimLabel: string,
  allPostCounts: number[]
): Promise<DemandScoreRow[]> {
  const now = new Date();
  const results: DemandScoreRow[] = [];

  for (const days of WINDOWS) {
    const windowEnd = now;
    const windowStart = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    const prevStart = new Date(windowStart.getTime() - days * 24 * 60 * 60 * 1000);

    // Current window signals
    const signals = await querySignals(supabase, dimType, dimSlug, windowStart, windowEnd);
    // Previous window signals (for trend)
    const prevSignals = await querySignals(supabase, dimType, dimSlug, prevStart, windowStart);

    // Volume metrics (price-sensitive posts weighted 1.5x)
    let weightedCount = 0;
    let totalScore = 0;
    let totalComments = 0;
    let questionCount = 0;
    let urgencySum = 0;
    let highUrgency = 0;

    for (const s of signals) {
      const weight = s.price_sensitivity ? PRICE_WEIGHT : 1;
      weightedCount += weight;
      totalScore += (s.score || 0);
      totalComments += (s.num_comments || 0);
      if (s.has_question) questionCount++;
      urgencySum += (s.urgency_score || 0);
      if ((s.urgency_score || 0) >= 7) highUrgency++;
    }

    const postCount = signals.length;
    const avgScore = postCount > 0 ? totalScore / postCount : 0;
    const avgComments = postCount > 0 ? totalComments / postCount : 0;
    const avgUrgency = postCount > 0 ? urgencySum / postCount : 0;
    const questionPct = postCount > 0 ? questionCount / postCount : 0;

    // Trend
    const prevCount = prevSignals.length;
    const trendPct = prevCount === 0
      ? (postCount > 0 ? 100 : 0)
      : ((postCount - prevCount) / prevCount) * 100;
    const trendDirection: TrendDirection = trendPct > 10 ? "rising" : trendPct < -10 ? "falling" : "stable";

    // Demand score (1-10)
    const volumeRank = percentileRank(weightedCount, allPostCounts) * 10;
    const engagementRank = Math.min(10, (avgScore + avgComments) / 10);
    const urgencyRank = avgUrgency;
    const questionRank = questionPct * 10;
    const trendBonus = trendDirection === "rising" ? 1 : trendDirection === "falling" ? -0.5 : 0;

    const demandScore = Math.min(10, Math.max(0,
      volumeRank * 0.35 +
      engagementRank * 0.25 +
      questionRank * 0.15 +
      urgencyRank * 0.15 +
      trendBonus
    ));

    // Competition score (1-10, 10 = low competition = opportunity)
    const commentToPostRatio = postCount > 0 ? totalComments / postCount : 0;
    const competitionRaw = Math.min(10, commentToPostRatio / 5); // high ratio = competitive
    const competitionScore = Math.max(0, 10 - competitionRaw); // invert

    // Quadrant classification
    let quadrant: Quadrant;
    if (demandScore >= 6 && competitionScore >= 6) quadrant = "GOLD_MINE";
    else if (demandScore >= 6 && competitionScore < 6) quadrant = "RED_OCEAN";
    else if (demandScore < 6 && competitionScore >= 6) quadrant = "RISKY_BET";
    else quadrant = "DEAD_ZONE";

    const row: DemandScoreRow = {
      dimension_type: dimType,
      dimension_slug: dimSlug,
      dimension_label: dimLabel,
      window_start: windowStart.toISOString(),
      window_end: windowEnd.toISOString(),
      window_label: `${days}d`,
      post_count: postCount,
      question_count: questionCount,
      total_score: totalScore,
      total_comments: totalComments,
      avg_score: Math.round(avgScore * 100) / 100,
      avg_comments: Math.round(avgComments * 100) / 100,
      avg_urgency: Math.round(avgUrgency * 100) / 100,
      high_urgency_count: highUrgency,
      prev_period_post_count: prevCount,
      trend_direction: trendDirection,
      trend_pct: Math.round(trendPct * 100) / 100,
      demand_score: Math.round(demandScore * 100) / 100,
      competition_score: Math.round(competitionScore * 100) / 100,
      opportunity_score: Math.round((demandScore + competitionScore) / 2 * 100) / 100,
      quadrant,
      has_blog_coverage: false, // filled by computeContentGaps
      blog_post_count: 0,
      content_gap_score: 10,
      scored_at: now.toISOString(),
    };

    results.push(row);
  }

  return results;
}

// ── Content gap computation ────────────────────────────────

async function computeContentGaps(
  scores: DemandScoreRow[],
  contentPosts: ContentPost[],
  painPointCategories: PainPointCategory[]
): Promise<ContentGapRow[]> {
  // Map pain_point_id → category (charge type inference)
  const ppIdToCategory: Record<number, string> = {};
  for (const pp of painPointCategories) {
    ppIdToCategory[pp.id] = pp.category;
  }

  // Map blog_slug → charge type(s) via pain point category
  const slugToChargeTypes: Record<string, string[]> = {};
  for (const post of contentPosts) {
    if (post.pain_point_id && ppIdToCategory[post.pain_point_id]) {
      const cat = ppIdToCategory[post.pain_point_id].toLowerCase();
      if (!slugToChargeTypes[post.blog_slug]) slugToChargeTypes[post.blog_slug] = [];
      slugToChargeTypes[post.blog_slug].push(cat);
    }
  }

  // Count blog posts per charge type
  const blogCountByCharge: Record<string, number> = {};
  for (const [, types] of Object.entries(slugToChargeTypes)) {
    for (const t of types) {
      blogCountByCharge[t] = (blogCountByCharge[t] || 0) + 1;
    }
  }

  // Count blog posts per pain point slug
  const blogCountByPainPoint: Record<string, number> = {};
  for (const post of contentPosts) {
    if (post.pain_point_id) {
      const pp = painPointCategories.find(p => p.id === post.pain_point_id);
      if (pp && pp.blog_slug) {
        blogCountByPainPoint[pp.blog_slug] = (blogCountByPainPoint[pp.blog_slug] || 0) + 1;
      }
    }
  }

  // Update scores with blog coverage
  for (const score of scores) {
    let blogCount: number;
    if (score.dimension_type === "charge_type") {
      blogCount = blogCountByCharge[score.dimension_slug] || 0;
    } else {
      blogCount = blogCountByPainPoint[score.dimension_slug] || 0;
    }
    score.has_blog_coverage = blogCount > 0;
    score.blog_post_count = blogCount;
    score.content_gap_score = Math.max(1, 10 - blogCount * 2);
  }

  // Generate content_gaps for GOLD_MINE / RISKY_BET with high gap scores
  const gaps: ContentGapRow[] = [];
  const seen = new Set<string>();

  // Only use 7d scores for gap analysis
  const recentScores = scores.filter(s => s.window_label === "7d");

  for (const score of recentScores) {
    if (score.dimension_type !== "charge_type") continue;
    if (!["GOLD_MINE", "RISKY_BET"].includes(score.quadrant)) continue;
    if (score.content_gap_score < 7) continue;

    const key = `${score.dimension_slug}:`;
    if (seen.has(key)) continue;
    seen.add(key);

    gaps.push({
      charge_type_slug: score.dimension_slug,
      pain_point_slug: null,
      demand_quadrant: score.quadrant,
      demand_score: score.demand_score,
      has_blog_post: score.has_blog_coverage,
      blog_slug: null,
      gap_score: score.content_gap_score,
      suggested_title: `${score.dimension_label}: What Every Defendant Needs to Know`,
      suggested_keywords: [score.dimension_slug.split("-").join(" ")],
      status: "identified",
    });
  }

  return gaps;
}

// ── Emerging topic detection ───────────────────────────────

interface UnclassifiedSignal {
  title: string;
  body_snippet: string | null;
  urgency_score: number | null;
  score: number | null;
  num_comments: number | null;
  reddit_created_at: string;
}

async function detectEmergingTopics(supabase: SupabaseClient): Promise<EmergingTopicRow[]> {
  const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

  const { data: unclassified, error } = await supabase
    .from("reddit_signals")
    .select("title, body_snippet, urgency_score, score, num_comments, reddit_created_at")
    .or("charge_type_slugs.eq.{}")
    .gte("reddit_created_at", twoWeeksAgo)
    .order("reddit_created_at", { ascending: false })
    .limit(500);

  if (error || !unclassified?.length) {
    console.log("[score-demand] No unclassified signals for emerging topic detection");
    return [];
  }

  // Extract 2-gram and 3-gram phrases
  const ngramCounts: Record<string, number> = {};
  const ngramPosts: Record<string, UnclassifiedSignal[]> = {};

  for (const post of (unclassified as UnclassifiedSignal[])) {
    const text = `${post.title} ${post.body_snippet || ""}`.toLowerCase();
    // Extract words without regex on large strings:
    // split on whitespace (known-safe delimiters), then strip non-alphanumeric
    // chars from each token using charAt loop instead of .replace(/pattern/g)
    const rawTokens = text.split(" ");
    const words: string[] = [];
    for (const token of rawTokens) {
      // Keep only a-z, 0-9 characters — build clean token char by char
      let clean = "";
      for (let ci = 0; ci < token.length; ci++) {
        const ch = token.charCodeAt(ci);
        const isAlpha = ch >= 97 && ch <= 122; // a-z (already lowercased)
        const isDigit = ch >= 48 && ch <= 57;  // 0-9
        if (isAlpha || isDigit) clean += token[ci];
      }
      if (clean.length > 2 && !STOP_WORDS.has(clean)) words.push(clean);
    }

    const postNgrams = new Set<string>();

    // 2-grams
    for (let i = 0; i < words.length - 1; i++) {
      const gram = `${words[i]} ${words[i + 1]}`;
      if (STOP_WORDS.has(gram)) continue;
      postNgrams.add(gram);
    }

    // 3-grams
    for (let i = 0; i < words.length - 2; i++) {
      const gram = `${words[i]} ${words[i + 1]} ${words[i + 2]}`;
      postNgrams.add(gram);
    }

    for (const gram of postNgrams) {
      ngramCounts[gram] = (ngramCounts[gram] || 0) + 1;
      if (!ngramPosts[gram]) ngramPosts[gram] = [];
      ngramPosts[gram].push(post);
    }
  }

  // Filter: 3+ posts per phrase
  const emerging: EmergingTopicRow[] = [];
  const seenPhrases = new Set<string>();

  const sorted = Object.entries(ngramCounts)
    .filter(([, count]) => count >= 3)
    .sort((a, b) => b[1] - a[1]);

  for (const [phrase, count] of sorted.slice(0, 20)) {
    // Skip if overlapping with already-detected topic
    const phraseWords = phrase.split(" ");
    if (phraseWords.some(w => seenPhrases.has(w))) continue;
    phraseWords.forEach(w => seenPhrases.add(w));

    const posts = ngramPosts[phrase];
    const avgUrgency = posts.reduce((s, p) => s + (p.urgency_score || 0), 0) / posts.length;
    const avgEngagement = posts.reduce((s, p) => s + (p.score || 0) + (p.num_comments || 0), 0) / posts.length;
    const dates = posts.map(p => new Date(p.reddit_created_at).getTime());

    emerging.push({
      topic_phrases: [phrase],
      representative_title: posts[0].title,
      post_count: count,
      first_seen_at: new Date(Math.min(...dates)).toISOString(),
      last_seen_at: new Date(Math.max(...dates)).toISOString(),
      avg_urgency: Math.round(avgUrgency * 100) / 100,
      avg_engagement: Math.round(avgEngagement * 100) / 100,
      status: "detected",
    });
  }

  return emerging;
}

// ── Main export ────────────────────────────────────────────

/**
 * Runs the full demand scoring pipeline:
 *  1. Load charge types, pain points, content posts
 *  2. Two-pass scoring across 7d / 30d / 90d windows
 *  3. Compute content gaps
 *  4. Detect emerging topics
 *  5. Upsert all results to Supabase
 *
 * @param supabase - Admin client with service role key
 * @returns Summary counts of upserted rows
 * @throws On fatal DB errors
 */
export async function scoreDemand(supabase: SupabaseClient): Promise<ScoreResult> {
  const chargeTypes = await loadChargeTypes(supabase);
  const painPoints = await loadPainPoints(supabase);
  const contentPosts = await loadContentPosts(supabase);
  const ppCategories = await loadPainPointCategories(supabase);

  console.log(
    `[score-demand] Loaded: ${chargeTypes.length} charge types, ` +
    `${painPoints.length} pain points, ${contentPosts.length} content posts`
  );

  // Build the list of dimensions to score
  const dimensionsToScore: { type: string; slug: string; label: string }[] = [];

  for (const ct of chargeTypes) {
    dimensionsToScore.push({ type: "charge_type", slug: ct.slug, label: ct.label });
  }
  for (const pp of painPoints) {
    if (!pp.blog_slug) continue; // skip pain points without a slug
    dimensionsToScore.push({ type: "pain_point", slug: pp.blog_slug, label: pp.title });
  }

  // Pass 1: Quick count of posts per dimension for 7d window (percentile baseline)
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const preCountList: number[] = [];

  console.log("[score-demand] Pass 1: counting posts for percentile baseline...");
  for (const dim of dimensionsToScore) {
    const signals = await querySignals(supabase, dim.type, dim.slug, weekAgo, now);
    preCountList.push(signals.length);
  }
  const maxCount = preCountList.length > 0 ? Math.max(...preCountList) : 0;
  console.log(`[score-demand] Baseline: ${preCountList.length} dimensions, max=${maxCount} posts`);

  // Pass 2: Full scoring with complete distribution
  const allScores: DemandScoreRow[] = [];

  console.log("[score-demand] Pass 2: scoring charge types...");
  for (const ct of chargeTypes) {
    const scores = await scoreDimension(supabase, "charge_type", ct.slug, ct.label, preCountList);
    allScores.push(...scores);
  }

  console.log("[score-demand] Pass 2: scoring pain points...");
  for (const pp of painPoints) {
    if (!pp.blog_slug) continue;
    const scores = await scoreDimension(supabase, "pain_point", pp.blog_slug, pp.title, preCountList);
    allScores.push(...scores);
  }

  // Compute content gaps (mutates allScores to fill blog coverage fields)
  const gaps = await computeContentGaps(allScores, contentPosts, ppCategories);
  console.log(`[score-demand] Content gaps identified: ${gaps.length}`);

  // Detect emerging topics
  const emerging = await detectEmergingTopics(supabase);
  console.log(`[score-demand] Emerging topics detected: ${emerging.length}`);

  // ── Upsert demand scores in batches of 50 ──
  let scoresUpserted = 0;
  if (allScores.length) {
    for (let i = 0; i < allScores.length; i += 50) {
      const batch = allScores.slice(i, i + 50);
      const { error } = await supabase
        .from("demand_scores")
        .upsert(batch, { onConflict: "dimension_type,dimension_slug,window_label,window_start" });
      if (error) {
        throw new Error(`[score-demand] Error upserting demand scores batch at ${i}: ${error.message}`);
      }
    }
    scoresUpserted = allScores.length;
    console.log(`[score-demand] Upserted ${scoresUpserted} demand scores`);
  }

  // ── Upsert content gaps ──
  let gapsUpserted = 0;
  if (gaps.length) {
    const { error } = await supabase
      .from("content_gaps")
      .upsert(gaps, { onConflict: "charge_type_slug,pain_point_slug" });
    if (error) {
      throw new Error(`[score-demand] Error upserting content gaps: ${error.message}`);
    }
    gapsUpserted = gaps.length;
    console.log(`[score-demand] Upserted ${gapsUpserted} content gaps`);
  }

  // ── Upsert emerging topics (upsert-by-phrases: check then insert/update) ──
  let emergingProcessed = 0;
  if (emerging.length) {
    for (const topic of emerging) {
      const { data: existing } = await supabase
        .from("emerging_topics")
        .select("id, post_count")
        .contains("topic_phrases", topic.topic_phrases)
        .limit(1);

      if (existing?.length) {
        await supabase
          .from("emerging_topics")
          .update({
            post_count: topic.post_count,
            last_seen_at: topic.last_seen_at,
            avg_urgency: topic.avg_urgency,
            avg_engagement: topic.avg_engagement,
          })
          .eq("id", existing[0].id);
      } else {
        await supabase
          .from("emerging_topics")
          .insert(topic);
      }
    }
    emergingProcessed = emerging.length;
    console.log(`[score-demand] Processed ${emergingProcessed} emerging topics`);
  }

  return { scoresUpserted, gapsUpserted, emergingProcessed };
}
