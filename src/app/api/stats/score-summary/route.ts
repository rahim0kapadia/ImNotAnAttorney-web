/**
 * Score Summary Stats — reads anonymous aggregates for DAI display.
 * No auth required (public data, no PII).
 * Cached for 5 minutes via Next.js ISR to reduce DB load.
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const revalidate = 300;

export async function GET() {
  const supabase = createAdminClient();

  try {
    const [counterResult, aggregateResult] = await Promise.all([
      supabase
        .from("counters")
        .select("value")
        .eq("id", "score_completions")
        .single(),
      supabase
        .from("score_aggregates")
        .select("charge_type, metric, count"),
    ]);

    const totalCompletions = counterResult.data?.value ?? 0;

    const byCharge: Record<string, Record<string, number>> = {};
    for (const row of aggregateResult.data ?? []) {
      if (!byCharge[row.charge_type]) byCharge[row.charge_type] = {};
      byCharge[row.charge_type][row.metric] = row.count;
    }

    let totalNoMotions = 0;
    let totalNeverDiscovery = 0;
    let totalNoComm = 0;
    let totalByCharge = 0;

    const bandTotals: Record<string, number> = {};

    for (const charge of Object.values(byCharge)) {
      totalByCharge += charge.total_by_charge ?? 0;
      totalNoMotions += charge.no_motions_filed ?? 0;
      totalNeverDiscovery += charge.never_seen_discovery ?? 0;
      totalNoComm += charge.communication_never ?? 0;

      for (const [metric, count] of Object.entries(charge)) {
        if (metric.startsWith("band_")) {
          const band = metric.slice(5);
          bandTotals[band] = (bandTotals[band] ?? 0) + count;
        }
      }
    }

    const pctNoMotions = totalByCharge > 0 ? Math.round((totalNoMotions / totalByCharge) * 100) : null;
    const pctNeverDiscovery = totalByCharge > 0 ? Math.round((totalNeverDiscovery / totalByCharge) * 100) : null;
    const pctNoComm = totalByCharge > 0 ? Math.round((totalNoComm / totalByCharge) * 100) : null;

    const bandDistribution: Record<string, number> | null = totalByCharge > 0
      ? Object.fromEntries(
          Object.entries(bandTotals).map(([band, n]) => [band, Math.round((n / totalByCharge) * 100)])
        )
      : null;

    return NextResponse.json({
      totalCompletions,
      insights: {
        pctNoMotions,
        pctNeverDiscovery,
        pctNoComm,
      },
      bandDistribution,
    });
  } catch (err) {
    console.error("[score-summary] Failed to fetch stats:", err);
    return NextResponse.json({ error: "Failed to fetch stats" }, { status: 500 });
  }
}
