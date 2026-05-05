/**
 * GET /api/admin/extraction-coverage
 *
 * Returns per-column extraction coverage on classified_opinions,
 * provenance attribution rate on entities_officers, matview row counts
 * and last-refresh timestamps, and cron last-run status for
 * /api/cron/refresh-cross-corpus-matviews.
 *
 * Auth: ADMIN_PASSWORD via X-Admin-Password header.
 * Used by: /admin/data-quality operator dashboard.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ── Types ─────────────────────────────────────────────────────────────────

interface ColumnCoverage {
  populated: number;
  pct: number;
}

export interface ExtractionCoveragePayload {
  classified_opinions: {
    total: number;
    officer_names: ColumnCoverage;
    witness_names: ColumnCoverage;
    expert_witness_names: ColumnCoverage;
    prosecutor_names: ColumnCoverage;
    defense_attorney_names: ColumnCoverage;
    sentence_months_extracted: ColumnCoverage;
    fine_dollars_extracted: ColumnCoverage;
    restitution_dollars_extracted: ColumnCoverage;
    extracted_at_oldest: string | null;
    extracted_at_newest: string | null;
  };
  entities_officers: {
    total: number;
    with_provenance: number;
    pct: number;
    by_source: Record<string, number>;
  };
  matviews: Array<{ name: string; rows: number; last_refresh: string | null }>;
  cron: {
    last_run: string | null;
    last_status: "ok" | "error" | null;
    next_run: string | null;
  };
}

// Array columns: populated when not null AND not empty array.
const ARRAY_COLS = [
  "officer_names",
  "witness_names",
  "expert_witness_names",
  "prosecutor_names",
  "defense_attorney_names",
] as const;

// Scalar numeric columns: populated when not null.
const SCALAR_COLS = [
  "sentence_months_extracted",
  "fine_dollars_extracted",
  "restitution_dollars_extracted",
] as const;

// Materialized views to report on.
const MATVIEW_NAMES = [
  "mv_judge_officer_motion_rates",
  "mv_judge_bench_fingerprint",
  "mv_judge_docket_caseload",
] as const;

// ── Helpers ───────────────────────────────────────────────────────────────

function pct(populated: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((populated / total) * 10000) / 100;
}

// ── Route handler ─────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = requireAdmin(req);
  if (!auth.authorized) return auth.error;

  const supabase = createAdminClient();

  // ── 1. classified_opinions coverage via RPC (or manual fallback) ────────
  const opinionsCoverageResult = await supabase.rpc("admin_extraction_coverage");

  // ── 2. entities_officers: total count + grouped by provenance_source ────
  const [officersTotalResult, officersGroupedResult] = await Promise.all([
    supabase
      .from("entities_officers")
      .select("*", { count: "exact", head: true }),
    supabase
      .from("entities_officers")
      .select("provenance_source")
      .not("provenance_source", "is", null),
  ]);

  // ── 3. Matview row counts + last_refresh ────────────────────────────────
  const matviewsData = await Promise.all(
    MATVIEW_NAMES.map(async (name) => {
      const { count } = await supabase
        .from(name)
        .select("*", { count: "exact", head: true });

      // Try RPC for last_refresh; gracefully degrade to null if not deployed.
      const { data: stat } = await supabase.rpc("admin_matview_last_refresh", {
        mv_name: name,
      });

      return {
        name,
        rows: count ?? 0,
        last_refresh: (stat as string | null) ?? null,
      };
    })
  );

  // ── 4. Cron last run ────────────────────────────────────────────────────
  const cronResult = await supabase
    .from("cron_runs")
    .select("started_at, completed_at, errors")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // ── Build classified_opinions section ─────────────────────────────────
  let coSection: ExtractionCoveragePayload["classified_opinions"];

  if (!opinionsCoverageResult.error && opinionsCoverageResult.data) {
    const d = opinionsCoverageResult.data as Record<string, unknown>;
    const total = Number(d.total ?? 0);

    coSection = {
      total,
      officer_names: { populated: Number(d.officer_names ?? 0), pct: pct(Number(d.officer_names ?? 0), total) },
      witness_names: { populated: Number(d.witness_names ?? 0), pct: pct(Number(d.witness_names ?? 0), total) },
      expert_witness_names: { populated: Number(d.expert_witness_names ?? 0), pct: pct(Number(d.expert_witness_names ?? 0), total) },
      prosecutor_names: { populated: Number(d.prosecutor_names ?? 0), pct: pct(Number(d.prosecutor_names ?? 0), total) },
      defense_attorney_names: { populated: Number(d.defense_attorney_names ?? 0), pct: pct(Number(d.defense_attorney_names ?? 0), total) },
      sentence_months_extracted: { populated: Number(d.sentence_months_extracted ?? 0), pct: pct(Number(d.sentence_months_extracted ?? 0), total) },
      fine_dollars_extracted: { populated: Number(d.fine_dollars_extracted ?? 0), pct: pct(Number(d.fine_dollars_extracted ?? 0), total) },
      restitution_dollars_extracted: { populated: Number(d.restitution_dollars_extracted ?? 0), pct: pct(Number(d.restitution_dollars_extracted ?? 0), total) },
      extracted_at_oldest: (d.extracted_at_oldest as string | null) ?? null,
      extracted_at_newest: (d.extracted_at_newest as string | null) ?? null,
    };
  } else {
    // Fallback: parallel COUNT queries when admin_extraction_coverage RPC is not yet deployed.
    const allCols = [...ARRAY_COLS, ...SCALAR_COLS];

    const countResults = await Promise.all([
      supabase.from("classified_opinions").select("*", { count: "exact", head: true }),
      ...ARRAY_COLS.map((col) =>
        supabase
          .from("classified_opinions")
          .select("*", { count: "exact", head: true })
          .not(col, "is", null)
          .not(col, "eq", "{}")
      ),
      ...SCALAR_COLS.map((col) =>
        supabase
          .from("classified_opinions")
          .select("*", { count: "exact", head: true })
          .not(col, "is", null)
      ),
      supabase
        .from("classified_opinions")
        .select("extracted_at")
        .not("extracted_at", "is", null)
        .order("extracted_at", { ascending: true })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("classified_opinions")
        .select("extracted_at")
        .not("extracted_at", "is", null)
        .order("extracted_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const total = countResults[0].count ?? 0;

    const colMap: Record<string, ColumnCoverage> = {};
    allCols.forEach((col, i) => {
      const populated = countResults[i + 1]?.count ?? 0;
      colMap[col] = { populated, pct: pct(populated, total) };
    });

    const oldestRes = countResults[countResults.length - 2] as { data: { extracted_at: string } | null };
    const newestRes = countResults[countResults.length - 1] as { data: { extracted_at: string } | null };

    coSection = {
      total,
      officer_names: colMap["officer_names"] ?? { populated: 0, pct: 0 },
      witness_names: colMap["witness_names"] ?? { populated: 0, pct: 0 },
      expert_witness_names: colMap["expert_witness_names"] ?? { populated: 0, pct: 0 },
      prosecutor_names: colMap["prosecutor_names"] ?? { populated: 0, pct: 0 },
      defense_attorney_names: colMap["defense_attorney_names"] ?? { populated: 0, pct: 0 },
      sentence_months_extracted: colMap["sentence_months_extracted"] ?? { populated: 0, pct: 0 },
      fine_dollars_extracted: colMap["fine_dollars_extracted"] ?? { populated: 0, pct: 0 },
      restitution_dollars_extracted: colMap["restitution_dollars_extracted"] ?? { populated: 0, pct: 0 },
      extracted_at_oldest: oldestRes.data?.extracted_at ?? null,
      extracted_at_newest: newestRes.data?.extracted_at ?? null,
    };
  }

  // ── Build entities_officers section ──────────────────────────────────
  const officersTotal = officersTotalResult.count ?? 0;

  const bySource: Record<string, number> = {};
  for (const row of (officersGroupedResult.data ?? [])) {
    const src = (row as { provenance_source: string | null }).provenance_source;
    if (src) {
      bySource[src] = (bySource[src] ?? 0) + 1;
    }
  }
  const withProvenance = Object.values(bySource).reduce((s, n) => s + n, 0);

  const officersSection: ExtractionCoveragePayload["entities_officers"] = {
    total: officersTotal,
    with_provenance: withProvenance,
    pct: pct(withProvenance, officersTotal),
    by_source: bySource,
  };

  // ── Build cron section ────────────────────────────────────────────────
  const cronRow = cronResult.data;
  const cronSection: ExtractionCoveragePayload["cron"] = {
    last_run: cronRow?.started_at ?? null,
    last_status:
      cronRow == null
        ? null
        : Array.isArray(cronRow.errors) && (cronRow.errors as unknown[]).length > 0
          ? "error"
          : "ok",
    next_run: null,
  };

  const payload: ExtractionCoveragePayload = {
    classified_opinions: coSection,
    entities_officers: officersSection,
    matviews: matviewsData,
    cron: cronSection,
  };

  return NextResponse.json(payload);
}
