// Pattern: cross-project Phase 2 — adopted from sister analytical product's
//   src/app/api/data-status/route.ts (READ-ONLY reference). Plan path:
//   C:\Users\email\projects\bench-recon-web\docs\plans\2026-04-30-shared-ussc-data-layer-cross-project.md
//
// Public USSC freshness endpoint.
// Reads the latest public.ussc_matview_meta row (a SHARED table populated
// today by the sister project's matview refresh; INAA's own matview will
// also populate it once Phase 1 of the shared-USSC plan ships) and returns
// a stable JSON shape. 60s private cache so anonymous pollers don't hammer
// the meta table; service-role consumers (queryBucket's freshness gate)
// have their own freshness check on the same rows.

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 30-day stale floor — matches the sister project's published commitment
// and the queryBucket pre-flight gate in src/lib/ussc-similar-cases.ts.
const STALE_FLOOR_DAYS = 30;
const STALE_FLOOR_MS = STALE_FLOOR_DAYS * 24 * 60 * 60 * 1000;

interface UsscFreshness {
  refreshed_at: string | null;
  codebook_version: string | null;
  freshness_floor_fy: number | null;
  source_datafile_url: string | null;
  /**
   * Approximate row count — rounded to the nearest 1000 to avoid disclosing
   * the exact size of the upstream analytical filter stack to anonymous
   * pollers. Exact count remains available to service-role consumers via
   * direct ussc_matview_meta select.
   */
  row_count_approx: number | null;
  is_stale: boolean;
  /** Distance from now to refreshed_at, in days. null when refreshed_at is null. */
  days_since_refresh: number | null;
}

interface DataStatusResponse {
  ussc: UsscFreshness;
  fetched_at: string;
}

function roundToThousand(n: number | null | undefined): number | null {
  if (n == null || !Number.isFinite(n)) return null;
  return Math.round(n / 1000) * 1000;
}

const EMPTY_USSC: UsscFreshness = {
  refreshed_at: null,
  codebook_version: null,
  freshness_floor_fy: null,
  source_datafile_url: null,
  row_count_approx: null,
  is_stale: true,
  days_since_refresh: null,
};

function jsonStatus(ussc: UsscFreshness, cache: "cache" | "no-cache" = "cache") {
  const headers: Record<string, string> =
    cache === "cache"
      ? { "Cache-Control": "private, max-age=60, must-revalidate" }
      : { "Cache-Control": "no-store, no-cache, must-revalidate" };
  return NextResponse.json(
    {
      ussc,
      fetched_at: new Date().toISOString(),
    } satisfies DataStatusResponse,
    { status: 200, headers },
  );
}

export async function GET() {
  try {
    const supabase = createAdminClient();

    const { data: meta, error: metaErr } = await supabase
      .from("ussc_matview_meta")
      .select(
        "refreshed_at,codebook_version,freshness_floor_fy,source_datafile_url,row_count",
      )
      .order("refreshed_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (metaErr) {
      // Relation-missing is treated as "no data yet" — public endpoint stays
      // 200 so anonymous pollers don't see 5xx pre-Phase-1. is_stale stays
      // true so any operator-side surface still shows the warning.
      const benign =
        metaErr.code === "42P01" ||
        metaErr.code === "PGRST205" ||
        metaErr.code === "PGRST204" ||
        /not found|does not exist/i.test(metaErr.message ?? "");
      if (!benign) {
        console.warn("[data-status] ussc_matview_meta query failed", metaErr);
      }
      return jsonStatus(EMPTY_USSC);
    }

    if (!meta) {
      return jsonStatus(EMPTY_USSC);
    }

    const refreshedAt = new Date(meta.refreshed_at);
    const ageMs = Date.now() - refreshedAt.getTime();
    const isStale = ageMs > STALE_FLOOR_MS;
    const daysSince = Math.max(0, Math.floor(ageMs / (24 * 60 * 60 * 1000)));

    return jsonStatus({
      refreshed_at: meta.refreshed_at,
      codebook_version: meta.codebook_version ?? null,
      freshness_floor_fy: meta.freshness_floor_fy ?? null,
      source_datafile_url: meta.source_datafile_url ?? null,
      row_count_approx: roundToThousand(meta.row_count ?? null),
      is_stale: isStale,
      days_since_refresh: daysSince,
    });
  } catch (e) {
    console.error("[data-status] uncaught", e);
    return jsonStatus(EMPTY_USSC, "no-cache");
  }
}
