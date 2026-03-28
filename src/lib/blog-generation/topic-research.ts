/**
 * @fileoverview Topic enrichment — fetches Reddit signals, demand trends, and
 * related published posts for a given content gap before generation.
 *
 * Used by generate-post.ts to build context-rich generation prompts.
 */

import { SupabaseClient } from "@supabase/supabase-js";
import { getAllPosts } from "@/lib/blog";
import type { ContentGapForGeneration, TopicEnrichment } from "@/lib/types/blog-pipeline";

/**
 * Enriches a content gap with real signal data from Reddit, demand scoring,
 * and existing published posts. Returns a TopicEnrichment object ready for
 * prompt construction.
 *
 * @param gap  - The content gap row selected for generation.
 * @param supabase - Admin Supabase client for DB access.
 */
export async function enrichTopic(
  gap: ContentGapForGeneration,
  supabase: SupabaseClient
): Promise<TopicEnrichment> {
  // ── 1. Reddit signals ──────────────────────────────────────────────────────
  const { data: signals, error: signalsError } = await supabase
    .from("reddit_signals")
    .select("title, selftext, urgency_score, has_question, emotional_tone, pain_point_slugs")
    .contains("charge_type_slugs", [gap.charge_type_slug])
    .order("urgency_score", { ascending: false })
    .limit(10);

  if (signalsError) {
    console.warn("[enrichTopic] reddit_signals query failed:", signalsError.message);
  }

  const rows = signals ?? [];

  // Top questions: titles from posts marked as containing a question
  const topQuestions = rows
    .filter((r) => r.has_question && r.title)
    .map((r) => r.title as string)
    .slice(0, 5);

  // Emotional patterns: deduplicated tones from all signals
  const emotionalPatterns = Array.from(
    new Set(
      rows
        .map((r) => r.emotional_tone as string | null)
        .filter((t): t is string => Boolean(t))
    )
  );

  // Pain points: flatten and deduplicate pain_point_slugs arrays
  const painPoints = Array.from(
    new Set(
      rows.flatMap((r) => {
        const slugs = r.pain_point_slugs;
        if (!slugs) return [];
        if (Array.isArray(slugs)) return slugs as string[];
        return [];
      })
    )
  );

  // ── 2. Demand trend data ───────────────────────────────────────────────────
  const { data: demandRows, error: demandError } = await supabase
    .from("demand_scores")
    .select("demand_score, trend_pct, window")
    .eq("dimension", "charge_type")
    .eq("slug", gap.charge_type_slug)
    .order("scored_at", { ascending: false })
    .limit(1);

  if (demandError) {
    console.warn("[enrichTopic] demand_scores query failed:", demandError.message);
  }

  const trendData =
    demandRows && demandRows.length > 0
      ? {
          demand_score: demandRows[0].demand_score as number,
          trend_pct: demandRows[0].trend_pct as number,
          window: demandRows[0].window as string,
        }
      : null;

  // ── 3. Related published posts ─────────────────────────────────────────────
  const allPosts = getAllPosts();
  const relatedPosts = allPosts
    .filter((p) => p.category === gap.charge_type_slug)
    .slice(0, 5)
    .map((p) => ({ slug: p.slug, title: p.title }));

  return {
    topQuestions,
    emotionalPatterns,
    painPoints,
    trendData,
    relatedPosts,
  };
}
