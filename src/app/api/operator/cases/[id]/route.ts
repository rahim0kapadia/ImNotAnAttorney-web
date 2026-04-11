/**
 * @file /api/operator/cases/[id] — Full case detail with all related data
 *
 * GET:   Fetches the case and all related entities (order, intake, documents,
 *        findings, witnesses, jobs, tasks, timeline count, evidence stats,
 *        citations, motions) in parallel via Promise.all.
 *
 * PATCH: Updates the case notes field.
 *
 * Auth: ADMIN_PASSWORD via X-Admin-Password header (timing-safe comparison).
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/guards";
import type { CaseDetail } from "@/lib/types/operator";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: RouteContext) {
  const auth = requireAdmin(req);
  if (!auth.authorized) return auth.error;

  const { id } = await params;
  if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ error: "Invalid case id" }, { status: 400 });
  }

  const supabase = createAdminClient();

  const [
    caseResult,
    orderResult,
    intakeResult,
    docsResult,
    findingsResult,
    witnessesResult,
    jobsResult,
    tasksResult,
    timelineResult,
    evidenceCountResult,
    custodyTotalResult,
    custodyVerifiedResult,
    citationsResult,
    motionsResult,
  ] = await Promise.all([
    // 1. Case itself
    supabase
      .from("cases")
      .select("*")
      .eq("id", id)
      .single(),

    // 2. Most recent order
    supabase
      .from("orders")
      .select("id, stripe_payment_intent, amount, status, paid_at")
      .eq("case_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single(),

    // 3. Intake
    supabase
      .from("intakes")
      .select(
        "id, charge_type, charge_description, court_case_number, court_state, court_county, judge_name, attorney_name, next_hearing_date, next_hearing_type, total_charges, created_at"
      )
      .eq("case_id", id)
      .limit(1)
      .single(),

    // 4. Documents
    supabase
      .from("discovery_documents")
      .select(
        "id, original_name, file_type, file_size_bytes, doc_type, doc_subtype, status, page_count, ocr_method, error_message, uploaded_at, processed_at"
      )
      .eq("case_id", id)
      .order("uploaded_at", { ascending: false }),

    // 5. Findings
    supabase
      .from("case_findings")
      .select(
        "id, finding_type, category, severity, severity_rank, title, verification_status, created_at"
      )
      .eq("case_id", id)
      .order("severity_rank")
      .order("created_at", { ascending: false }),

    // 6. Witnesses
    supabase
      .from("case_witnesses")
      .select(
        "id, name, witness_type, subtype, agency, credibility_score, threat_level, dossier_status, cross_exam_ready"
      )
      .eq("case_id", id),

    // 7. Jobs
    supabase
      .from("processing_jobs")
      .select("id, case_id, job_type, job_subtype, status, priority, worker_id, started_at, completed_at, error_message, progress, retry_count, max_retries, items_produced, created_at")
      .eq("case_id", id)
      .order("created_at", { ascending: false }),

    // 8. Tasks
    supabase
      .from("operator_tasks")
      .select("id, case_id, task_type, title, description, status, priority, priority_rank, notes, due_at, sla_breach, started_at, completed_at, created_at")
      .eq("case_id", id)
      .order("priority_rank")
      .order("created_at", { ascending: false }),

    // 9. Timeline count
    supabase
      .from("timeline_events")
      .select("id", { count: "exact", head: true })
      .eq("case_id", id),

    // 10a. Evidence count
    supabase
      .from("evidence_items")
      .select("id", { count: "exact", head: true })
      .eq("case_id", id),

    // 10b. Evidence custody total
    supabase
      .from("evidence_custody")
      .select("id", { count: "exact", head: true })
      .eq("case_id", id),

    // 10c. Evidence custody verified (no gap)
    supabase
      .from("evidence_custody")
      .select("id", { count: "exact", head: true })
      .eq("case_id", id)
      .eq("is_gap", false),

    // 11. Citations
    supabase
      .from("case_law_references")
      .select("id, case_name, citation, court, year, is_binding, is_good_law")
      .eq("case_id", id)
      .order("year", { ascending: false }),

    // 12. Motions
    supabase
      .from("motion_recommendations")
      .select(
        "id, motion_type, motion_name, severity, status, strategic_score, description"
      )
      .eq("case_id", id)
      .order("strategic_score", { ascending: false }),
  ]);

  // Case is the only required entity
  if (caseResult.error) {
    console.error("[Operator/Case] Fetch failed:", caseResult.error.message);
    return NextResponse.json(
      { error: caseResult.error.code === "PGRST116" ? "Case not found" : "Internal server error" },
      { status: caseResult.error.code === "PGRST116" ? 404 : 500 }
    );
  }

  const caseData = caseResult.data;

  const detail: CaseDetail = {
    id: caseData.id,
    email: caseData.email,
    tier: caseData.tier,
    charge_type: caseData.charge_type,
    status: caseData.status,
    phase: caseData.phase,
    created_at: caseData.created_at,
    delivery_due_at: caseData.delivery_due_at,
    next_update_due_at: caseData.next_update_due_at,
    document_count: caseData.document_count ?? 0,
    finding_count: caseData.finding_count ?? 0,
    witness_count: caseData.witness_count ?? 0,
    discovery_health_score: caseData.discovery_health_score,
    defense_opportunity_index: caseData.defense_opportunity_index,
    report_token: caseData.report_token,
    phase_started_at: caseData.phase_started_at,
    has_report: !!caseData.report_html,
    operator_notes: caseData.notes ?? null,
    data_retention_until: caseData.data_retention_until,
    upgrade_order_ids: caseData.upgrade_order_ids,
    // Joined data — gracefully handle missing sub-queries
    order: orderResult.error ? null : orderResult.data,
    intake: intakeResult.error ? null : intakeResult.data,
    documents: docsResult.data ?? [],
    findings: findingsResult.data ?? [],
    witnesses: witnessesResult.data ?? [],
    jobs: jobsResult.data ?? [],
    tasks: tasksResult.data ?? [],
    timeline_count: timelineResult.count ?? 0,
    evidence_count: evidenceCountResult.count ?? 0,
    evidence_custody_total: custodyTotalResult.count ?? 0,
    evidence_custody_verified: custodyVerifiedResult.count ?? 0,
    citations: citationsResult.data ?? [],
    motions: motionsResult.data ?? [],
  };

  return NextResponse.json(detail);
}

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const auth = requireAdmin(req);
  if (!auth.authorized) return auth.error;

  const { id } = await params;
  if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ error: "Invalid case id" }, { status: 400 });
  }

  let body: { notes?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof body.notes !== "string") {
    return NextResponse.json(
      { error: "notes (string) is required" },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();

  // DB column is "notes" — the type alias "operator_notes" is a display-layer concern
  const { error } = await supabase
    .from("cases")
    .update({ notes: body.notes })
    .eq("id", id);

  if (error) {
    console.error("[Operator/Case] Notes update failed:", error.message);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
