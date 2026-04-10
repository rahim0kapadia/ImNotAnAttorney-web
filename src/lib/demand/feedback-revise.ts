/**
 * @file Feedback Revise — flags underperforming posts for regeneration and
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

  const zeroPerformers = (perfRows || []).filter(
    (r) => (r.subscriber_signups || 0) === 0 && (r.orders_attributed || 0) === 0
  );

  const { data: existingRevisions } = await supabase
    .from("content_revisions")
    .select("blog_slug")
    .in("status", ["flagged", "queued", "regenerated"]);

  const alreadyFlagged = new Set((existingRevisions || []).map((r) => r.blog_slug));

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

  const { data: drafts } = await supabase
    .from("blog_drafts")
    .select("slug, humanizer_score")
    .not("humanizer_score", "is", null)
    .eq("status", "published");

  if ((drafts || []).length >= MIN_POSTS_FOR_ADAPTIVE_QA) {
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
      const lowBucket = withBoth.filter((d) => d.score < 35);
      const midBucket = withBoth.filter((d) => d.score >= 35 && d.score < 45);
      const highBucket = withBoth.filter((d) => d.score >= 45);

      const avgPerf = (arr: typeof withBoth) =>
        arr.length > 0 ? arr.reduce((s, d) => s + d.performance, 0) / arr.length : 0;

      const lowAvg = avgPerf(lowBucket);
      const midAvg = avgPerf(midBucket);
      const highAvg = avgPerf(highBucket);

      const { data: currentFeedback } = await supabase
        .from("demand_feedback")
        .select("qa_humanizer_threshold")
        .eq("charge_type_slug", "_global")
        .maybeSingle();

      const currentThreshold = currentFeedback?.qa_humanizer_threshold ?? 45;

      let adjustment = 0;
      if (lowAvg > midAvg && lowAvg > highAvg && lowBucket.length >= 3) {
        adjustment = -MAX_ADJUSTMENT;
      } else if (highAvg > midAvg && highAvg > lowAvg && highBucket.length >= 3) {
        adjustment = MAX_ADJUSTMENT;
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
