/**
 * @file Feedback Score — computes performance multipliers per charge type
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
    const sorted = [...efficiencies].sort((a, b) => a.efficiency - b.efficiency);
    const median = sorted[Math.floor(sorted.length / 2)].efficiency || 1;

    const rows = efficiencies.map(({ slug, efficiency }) => {
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
    console.log("[feedback-score] No attribution data yet — multipliers unchanged");
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
    const phraseSlug = topic.topic_phrases[0]
      ?.toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "general-defense";

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
