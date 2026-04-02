/**
 * @file Content Performance Tracker — correlates blog posts → subscribers → orders.
 *
 * Ported from scripts/demand/track-content-performance.mjs.
 * Called weekly (Sundays) by /api/cron/demand-performance.
 *
 * Performance note: all attribution is computed in memory from two bulk queries
 * (one for subscribers, one for paid orders). No per-post DB round-trips.
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
  current_demand_score: number | null; // Always 7d window (loadDemandScores filters window_label='7d')
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

// ── Constants ──────────────────────────────────────────────────

/**
 * Sentinel date used as window_start for the "all-time" window.
 * Predates any content post or subscriber row in the system.
 */
const ALL_TIME_START = new Date("2024-01-01");

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

interface SubscriberRow {
  email: string;
  source: string | null;
  referral_url: string | null;
  created_at: string;
}

interface OrderRow {
  email: string;
  amount: number | null;
  created_at: string;
}

async function loadContentPosts(supabase: SupabaseClient): Promise<ContentPost[]> {
  const { data, error } = await supabase
    .from("content_posts")
    .select("id, blog_slug, pain_point_id, status")
    .eq("status", "published");

  if (error) {
    throw new Error(`Failed to load content_posts: ${error.message}`);
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

/**
 * Bulk-loads all subscribers. Attribution filtering is done in memory per post.
 */
async function loadAllSubscribers(supabase: SupabaseClient): Promise<SubscriberRow[]> {
  const { data, error } = await supabase
    .from("subscribers")
    .select("email, source, referral_url, created_at");

  if (error) {
    console.error("[demand-performance] Error loading subscribers:", error.message);
    return [];
  }
  return data || [];
}

/**
 * Bulk-loads all paid orders. Attribution filtering is done in memory per post.
 */
async function loadAllPaidOrders(supabase: SupabaseClient): Promise<OrderRow[]> {
  const { data, error } = await supabase
    .from("orders")
    .select("email, amount, created_at")
    .eq("status", "paid");

  if (error) {
    console.error("[demand-performance] Error loading paid orders:", error.message);
    return [];
  }
  return data || [];
}

// ── In-memory attribution ──────────────────────────────────────

/**
 * Counts subscribers whose source or referral_url contains the blog slug,
 * optionally restricted to those created on or after windowStart.
 */
function countSubscribersInMemory(
  subscribers: SubscriberRow[],
  blogSlug: string,
  windowStart: Date | null
): number {
  let count = 0;
  for (const sub of subscribers) {
    if (windowStart && sub.created_at < windowStart.toISOString()) continue;
    const matchesSource = sub.source !== null && sub.source.includes(blogSlug);
    const matchesReferral = sub.referral_url !== null && sub.referral_url.includes(blogSlug);
    if (matchesSource || matchesReferral) count++;
  }
  return count;
}

/**
 * Sums orders and revenue for subscribers attributed to this blog slug,
 * optionally restricted to those created on or after windowStart.
 *
 * Attribution chain: subscriber source/referral_url → email → orders.
 */
function aggregateOrdersInMemory(
  subscribers: SubscriberRow[],
  orders: OrderRow[],
  blogSlug: string,
  windowStart: Date | null
): { orders: number; revenue: number } {
  // Collect emails of attributed subscribers within the window
  const attributedEmails = new Set<string>();
  for (const sub of subscribers) {
    if (windowStart && sub.created_at < windowStart.toISOString()) continue;
    const matchesSource = sub.source !== null && sub.source.includes(blogSlug);
    const matchesReferral = sub.referral_url !== null && sub.referral_url.includes(blogSlug);
    if (matchesSource || matchesReferral) attributedEmails.add(sub.email);
  }

  if (attributedEmails.size === 0) return { orders: 0, revenue: 0 };

  // Sum paid orders from those emails within the window
  let orderCount = 0;
  let revenueTotal = 0;
  for (const order of orders) {
    if (!attributedEmails.has(order.email)) continue;
    if (windowStart && order.created_at < windowStart.toISOString()) continue;
    orderCount++;
    revenueTotal += order.amount || 0;
  }

  return { orders: orderCount, revenue: revenueTotal / 100 }; // amount in cents
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
 * Uses two bulk DB queries (all subscribers, all paid orders) and resolves
 * attribution in memory — replacing the prior pattern of 9 queries per post.
 *
 * Upserts to content_performance table, keyed on (blog_slug, window_label, window_start).
 *
 * @throws {Error} If a fatal DB error occurs during upsert batching.
 */
export async function trackContentPerformance(
  supabase: SupabaseClient
): Promise<PerformanceResult> {
  const [posts, painPoints, demandScores, allSubscribers, allPaidOrders] = await Promise.all([
    loadContentPosts(supabase),
    loadPainPoints(supabase),
    loadDemandScores(supabase),
    loadAllSubscribers(supabase),
    loadAllPaidOrders(supabase),
  ]);

  console.log(
    `[demand-performance] Tracking ${posts.length} published blog posts` +
    ` (${allSubscribers.length} subscribers, ${allPaidOrders.length} paid orders loaded)`
  );

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

      const signups = countSubscribersInMemory(allSubscribers, post.blog_slug, windowStart);
      const { orders, revenue } = aggregateOrdersInMemory(
        allSubscribers,
        allPaidOrders,
        post.blog_slug,
        windowStart
      );

      results.push({
        content_post_id: post.id,
        blog_slug: post.blog_slug,
        subscriber_signups: signups,
        // TODO: track when score page adds referral_source; query score_results by referral_source
        score_submissions: 0,
        orders_attributed: orders,
        revenue_attributed: revenue,
        charge_type_slug: chargeType,
        pain_point_slug: pp?.blog_slug || null,
        demand_score_at_publish: null, // would need historical data
        current_demand_score: currentDemand,
        window_start: (windowStart || ALL_TIME_START).toISOString(),
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
