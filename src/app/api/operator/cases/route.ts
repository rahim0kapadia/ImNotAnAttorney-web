/**
 * @file /api/operator/cases, Paginated case list with filters
 *
 * GET: List cases with optional filters for status, tier, charge_type, email search.
 *      Returns all tiers by default; supports pagination via page/limit params.
 *
 * Auth: ADMIN_PASSWORD via X-Admin-Password header (timing-safe comparison).
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/guards";
import type { CaseListItem } from "@/lib/types/operator";

const CASE_LIST_FIELDS =
  "id, email, tier, charge_type, status, phase, created_at, delivery_due_at, next_update_due_at, document_count, finding_count, witness_count, discovery_health_score, defense_opportunity_index, report_token";

export async function GET(req: NextRequest) {
  const auth = requireAdmin(req);
  if (!auth.authorized) return auth.error;

  const supabase = createAdminClient();
  const searchParams = req.nextUrl.searchParams;

  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "25", 10)));
  const offset = (page - 1) * limit;

  const status = searchParams.get("status");
  const tier = searchParams.get("tier");
  const chargeType = searchParams.get("charge_type");
  const search = searchParams.get("search");

  let query = supabase
    .from("cases")
    .select(CASE_LIST_FIELDS, { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (status) {
    query = query.eq("status", status);
  }
  if (tier) {
    query = query.eq("tier", tier);
  }
  if (chargeType) {
    query = query.eq("charge_type", chargeType);
  }
  if (search) {
    // Escape SQL LIKE wildcards to prevent injection via search param
    const escaped = search.replace(/[%_\\]/g, "\\$&");
    query = query.ilike("email", `%${escaped}%`);
  }

  const { data, error, count } = await query;

  if (error) {
    console.error("[Operator/Cases] List failed:", error.message);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  return NextResponse.json({
    cases: (data ?? []) as CaseListItem[],
    total: count ?? 0,
    page,
    limit,
  });
}
