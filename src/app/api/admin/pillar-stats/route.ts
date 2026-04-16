/**
 * GET /api/admin/pillar-stats
 *
 * Returns per-pillar coverage and revenue stats for the Content Pillar Engine
 * dashboard. Combines the pillar registry (24 pillars) with Supabase data
 * from content_gaps, blog_drafts, and orders.
 *
 * Auth: ADMIN_PASSWORD via X-Admin-Password header (middleware-enforced).
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import pillarRegistryData from "@/data/pillar-registry.json";

// ── Pillar registry ──────────────────────────────────────────
interface PillarEntry {
  slug: string;
  pillarTitle: string;
  articleCountGoal: number;
}

const pillars: PillarEntry[] = (pillarRegistryData.pillars ?? []).map(
  (p: Record<string, unknown>) => ({
    slug: p.slug as string,
    pillarTitle: p.pillarTitle as string,
    articleCountGoal: (p.articleCountGoal as number) || 0,
  })
);

// ── Route handler (auth handled by middleware for /api/admin/*) ─
export async function GET() {
  const supabase = createAdminClient();

  // Run all three queries in parallel.
  const [gapsResult, draftsResult, ordersResult] = await Promise.all([
    // content_gaps: total per pillar + count where blog_draft_id is set
    supabase.rpc("pillar_gap_stats"),

    // blog_drafts: published count per pillar
    supabase.rpc("pillar_draft_stats"),

    // orders: count + revenue per pillar_ref
    supabase.rpc("pillar_order_stats"),
  ]);

  // If RPCs don't exist yet, fall back to manual queries.
  // This is the expected path until the RPCs are created, use
  // client-side grouping over three simple selects.
  const useRpc =
    !gapsResult.error && !draftsResult.error && !ordersResult.error;

  let gapsByPillar: Record<string, { total: number; with_draft: number }> = {};
  let draftsByPillar: Record<string, number> = {};
  let ordersByPillar: Record<string, { count: number; revenue_cents: number }> =
    {};

  if (useRpc) {
    // RPC path, each returns [{pillar_slug, ...}]
    for (const row of gapsResult.data ?? []) {
      gapsByPillar[row.pillar_slug] = {
        total: Number(row.total),
        with_draft: Number(row.with_draft),
      };
    }
    for (const row of draftsResult.data ?? []) {
      draftsByPillar[row.pillar_slug] = Number(row.published_count);
    }
    for (const row of ordersResult.data ?? []) {
      ordersByPillar[row.pillar_ref] = {
        count: Number(row.order_count),
        revenue_cents: Number(row.revenue_cents),
      };
    }
  } else {
    // Fallback: three simple selects + client-side aggregation.
    const [gapsFb, draftsFb, ordersFb] = await Promise.all([
      supabase
        .from("content_gaps")
        .select("pillar_slug, blog_draft_id")
        .not("pillar_slug", "is", null),

      supabase
        .from("blog_drafts")
        .select("pillar_slug")
        .eq("status", "published")
        .not("pillar_slug", "is", null),

      supabase
        .from("orders")
        .select("pillar_ref, amount")
        .not("pillar_ref", "is", null),
    ]);

    for (const row of gapsFb.data ?? []) {
      const slug = row.pillar_slug as string;
      if (!gapsByPillar[slug]) gapsByPillar[slug] = { total: 0, with_draft: 0 };
      gapsByPillar[slug].total++;
      if (row.blog_draft_id) gapsByPillar[slug].with_draft++;
    }

    for (const row of draftsFb.data ?? []) {
      const slug = row.pillar_slug as string;
      draftsByPillar[slug] = (draftsByPillar[slug] || 0) + 1;
    }

    for (const row of ordersFb.data ?? []) {
      const ref = row.pillar_ref as string;
      if (!ordersByPillar[ref])
        ordersByPillar[ref] = { count: 0, revenue_cents: 0 };
      ordersByPillar[ref].count++;
      ordersByPillar[ref].revenue_cents += Number(row.amount) || 0;
    }
  }

  // ── Aggregate per pillar ──────────────────────────────────
  const results = pillars.map((p) => {
    const gaps = gapsByPillar[p.slug] || { total: 0, with_draft: 0 };
    const published = draftsByPillar[p.slug] || 0;
    const orders = ordersByPillar[p.slug] || { count: 0, revenue_cents: 0 };
    const goal = p.articleCountGoal || 1; // avoid division by zero
    const coveragePercent = Math.round((published / goal) * 100);

    return {
      pillar_slug: p.slug,
      pillar_title: p.pillarTitle,
      article_count_goal: p.articleCountGoal,
      gaps_total: gaps.total,
      drafts_published: published,
      coverage_percent: coveragePercent,
      order_count: orders.count,
      revenue_cents: orders.revenue_cents,
    };
  });

  // Lowest coverage first = where to invest next.
  results.sort((a, b) => a.coverage_percent - b.coverage_percent);

  return NextResponse.json(results);
}
