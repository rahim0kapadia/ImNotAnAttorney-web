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

  const [counterResult, aggregateResult] = await Promise.all([
    supabase
      .from("counters")
      .select("value")
      .eq("id", "score_completions")
      .single(),
    supabase
      .from("score_aggregates")
      .select("charge_type, metric, value"),
  ]);

  const totalCompletions = counterResult.data?.value ?? 0;

  const byCharge: Record<string, Record<string, number>> = {};
  for (const row of aggregateResult.data ?? []) {
    if (!byCharge[row.charge_type]) byCharge[row.charge_type] = {};
    byCharge[row.charge_type][row.metric] = row.value;
  }

  let totalNoMotions = 0;
  let totalNeverDiscovery = 0;
  let totalNoComm = 0;
  let totalByCharge = 0;

  for (const charge of Object.values(byCharge)) {
    totalByCharge += charge.total_by_charge ?? 0;
    totalNoMotions += charge.no_motions_filed ?? 0;
    totalNeverDiscovery += charge.never_seen_discovery ?? 0;
    totalNoComm += charge.communication_never ?? 0;
  }

  const pctNoMotions = totalByCharge > 0 ? Math.round((totalNoMotions / totalByCharge) * 100) : null;
  const pctNeverDiscovery = totalByCharge > 0 ? Math.round((totalNeverDiscovery / totalByCharge) * 100) : null;
  const pctNoComm = totalByCharge > 0 ? Math.round((totalNoComm / totalByCharge) * 100) : null;

  return NextResponse.json({
    totalCompletions,
    insights: {
      pctNoMotions,
      pctNeverDiscovery,
      pctNoComm,
    },
  });
}
