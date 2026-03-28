/**
 * @file Content Performance Tracker — correlates blog posts → subscribers → orders.
 *
 * Ported from scripts/demand/track-content-performance.mjs.
 * Called weekly (Sundays) by /api/cron/demand-performance.
 */

import { SupabaseClient } from "@supabase/supabase-js";

// ── Types ──────────────────────────────────────────────────────

export interface PerformanceRecord {
  content_post_id: string;
  blog_slug: string;
  subscriber_signups: number;
  score_submissions: number;
  orders_attributed: number;
  revenue_attributed: number;
  charge_type_slug: string | null;
  pain_point_slug: string | null;
  demand_score_at_publish: null;
  current_demand_score: number | null;
  window_start: string;
  window_end: string;
  window_label: string;
  computed_at: string;
}

export interface PerformanceResult {
  postsTracked: number;
  recordsUpserted: number;
  errors: number;
}

// ── Time windows ───────────────────────────────────────────────

const WINDOWS: { label: string; days: number | null }[] = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "all-time", days: null },
];

// ── Data loaders ───────────────────────────────────────────────

interface ContentPost {
  id: string;
  blog_slug: string;
  pain_point_id: string | null;
  status: string;
}

interface PainPoint {
  id: string;
  blog_slug: string;
  category: string | null;
}

interface DemandScore {
  dimension_type: string;
  dimension_slug: string;
  demand_score: number;
  window_label: string;
}

async function loadContentPosts(supabase: SupabaseClient): Promise<ContentPost[]> {
  const { data, error } = await supabase
    .from("content_posts")
    .select("id, blog_slug, pain_point_id, status")
    .eq("status", "published");

  if (error) {
    console.error("Error loading content_posts:", error.message);
    return [];
  }
  return data || [];
}

async function loadPainPoints(supabase: SupabaseClient): Promise<PainPoint[]> {
  const { data } = await supabase
    .from("content_pain_points")
    .select("id, blog_slug, category");
  return data || [];
}

async function loadDemandScores(supabase: SupabaseClient): Promise<DemandScore[]> {
  const { data } = await supabase
    .from("demand_scores")
    .select("dimension_type, dimension_slug, demand_score, window_label")
    .eq("window_label", "7d")
    .eq("dimension_type", "charge_type");
  return data || [];
}

// ── Attribution queries ────────────────────────────────────────

async function countSubscriberSignups(
  supabase: SupabaseClient,
  blogSlug: string,
  windowStart: Date | null
): Promise<number> {
  let query = supabase
    .from("subscribers")
    .select("id", { count: "exact", head: true })
    .or(`source.ilike.%${blogSlug}%,referral_url.ilike.%${blogSlug}%`);

  if (windowStart) {
    query = query.gte("created_at", windowStart.toISOString());
  }

  const { count, error } = await query;
  if (error) return 0;
  return count || 0;
}

async function countOrdersAndRevenue(
  supabase: SupabaseClient,
  blogSlug: string,
  windowStart: Date | null
): Promise<{ orders: number; revenue: number }> {
  // Get subscriber emails who came from this blog post
  let subQuery = supabase
    .from("subscribers")
    .select("email")
    .or(`source.ilike.%${blogSlug}%,referral_url.ilike.%${blogSlug}%`);

  if (windowStart) {
    subQuery = subQuery.gte("created_at", windowStart.toISOString());
  }

  const { data: subscribers } = await subQuery;
  if (!subscribers?.length) return { orders: 0, revenue: 0 };

  const emails = subscribers.map((s: { email: string }) => s.email);

  // Match orders by email
  let orderQuery = supabase
    .from("orders")
    .select("amount")
    .in("email", emails)
    .eq("status", "paid");

  if (windowStart) {
    orderQuery = orderQuery.gte("created_at", windowStart.toISOString());
  }

  const { data: orders } = await orderQuery;
  if (!orders?.length) return { orders: 0, revenue: 0 };

  const revenue = orders.reduce(
    (sum: number, o: { amount: number | null }) => sum + (o.amount || 0),
    0
  );
  return { orders: orders.length, revenue: revenue / 100 }; // amount in cents
}

// ── Main export ────────────────────────────────────────────────

/**
 * Computes and upserts content performance records for all published blog posts.
 *
 * For each post × time window (7d, 30d, all-time), attributes:
 *   - subscriber signups via source/referral_url containing the blog slug
 *   - orders + revenue from those subscribers
 *   - current demand score for the post's charge type
 *
 * Upserts to content_performance table, keyed on (blog_slug, window_label, window_start).
 *
 * @throws {Error} If a fatal DB error occurs during upsert batching.
 */
export async function trackContentPerformance(
  supabase: SupabaseClient
): Promise<PerformanceResult> {
  const posts = await loadContentPosts(supabase);
  const painPoints = await loadPainPoints(supabase);
  const demandScores = await loadDemandScores(supabase);

  console.log(`[demand-performance] Tracking ${posts.length} published blog posts`);

  // Build lookups
  const ppById: Record<string, PainPoint> = {};
  for (const pp of painPoints) ppById[pp.id] = pp;

  const demandByCharge: Record<string, number> = {};
  for (const ds of demandScores) {
    demandByCharge[ds.dimension_slug] = ds.demand_score;
  }

  const now = new Date();
  const results: PerformanceRecord[] = [];

  for (const post of posts) {
    const pp = post.pain_point_id ? ppById[post.pain_point_id] : null;
    const chargeType = pp?.category?.toLowerCase()?.replace(/\s+/g, "-") || null;
    const currentDemand = chargeType ? (demandByCharge[chargeType] || null) : null;

    for (const window of WINDOWS) {
      const windowEnd = now;
      const windowStart = window.days
        ? new Date(now.getTime() - window.days * 24 * 60 * 60 * 1000)
        : null;

      const signups = await countSubscriberSignups(supabase, post.blog_slug, windowStart);
      const { orders, revenue } = await countOrdersAndRevenue(supabase, post.blog_slug, windowStart);

      results.push({
        content_post_id: post.id,
        blog_slug: post.blog_slug,
        subscriber_signups: signups,
        score_submissions: 0, // TODO: track when score page adds referral_source
        orders_attributed: orders,
        revenue_attributed: revenue,
        charge_type_slug: chargeType,
        pain_point_slug: pp?.blog_slug || null,
        demand_score_at_publish: null, // would need historical data
        current_demand_score: currentDemand,
        window_start: (windowStart || new Date("2024-01-01")).toISOString(),
        window_end: windowEnd.toISOString(),
        window_label: window.label,
        computed_at: now.toISOString(),
      });
    }
  }

  console.log(`[demand-performance] Computed ${results.length} performance records`);

  // Upsert to DB in batches of 50
  let errorCount = 0;
  for (let i = 0; i < results.length; i += 50) {
    const batch = results.slice(i, i + 50);
    const { error } = await supabase
      .from("content_performance")
      .upsert(batch, { onConflict: "blog_slug,window_label,window_start" });

    if (error) {
      console.error(`[demand-performance] Error upserting batch ${i / 50 + 1}:`, error.message);
      errorCount++;
    }
  }

  console.log(`[demand-performance] Upserted ${results.length} performance records`);

  return {
    postsTracked: posts.length,
    recordsUpserted: results.length,
    errors: errorCount,
  };
}
