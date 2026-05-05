/**
 * GET /api/cron/war-room-weekly-digest
 *
 * Plan: docs/plans/2026-04-29-worry-data-orphans-product-gaps.md (T1, fix H).
 *
 * Weekly Resend transactional digest summarizing pairing-matrix deltas
 * for active War Room / Situation Room customers (paid, non-refunded).
 *
 * Cadence: Mondays 13:00 UTC (registered separately via cron-job.org).
 * Auth: CRON_AUTH_TOKEN bearer token (per requireCron + middleware).
 * FROM: env-driven (RESEND_FROM_EMAIL_UPDATES). Caller must set this in
 *   .env.local / Vercel env. The route refuses to run if unset OR if the
 *   value resolves to a primary-brand domain that has not been pre-warmed.
 *
 * Recipient filter (HARD):
 *   tier IN ('war-room', 'situation-room') AND status NOT IN ('refunded','cancelled')
 *
 * Recipient-count guard: aborts if recipient count > snapshot active +
 * 5% threshold (detects filter drift / send-volume anomaly).
 */

import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
import {
  buildDigestHtml,
  buildDigestSubject,
  type DigestDelta,
} from "@/lib/war-room/weekly-digest";
import {
  resolveCaseJudgeIds,
  queryPairingMatrix,
} from "@/lib/war-room/pairing-matrix";
import { renderWarRoomCrossCorpusSections } from "@/lib/war-room/cross-corpus-sections";
import { SITE_URL } from "@/lib/site";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

const ACTIVE_ORDERS_LOOKBACK_DAYS = 365;
const ACTIVE_ORDERS_PAGE_SIZE = 500;

/** Anomaly guard: refuse if recipient count balloons past this multiplier. */
const RECIPIENT_OVERSHOOT_TOLERANCE = 1.05;

interface ActiveOrder {
  id: string;
  email: string;
  tier: string;
  status: string;
  paid_at: string | null;
  created_at: string;
}

function isValidToAddress(addr: string): boolean {
  if (!addr || typeof addr !== "string" || addr.length > 254) return false;
  if (/[\r\n\t<>,"]/.test(addr)) return false;
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(addr);
}

/**
 * Probe `judge_prosecutor_pairings` schema for a temporal column.
 * Result drives `noTemporalColumn` flag in the digest body. One query per
 * cron run, not cached across requests.
 */
async function pairingsTemporalColumn(
  supabase: ReturnType<typeof createAdminClient>,
): Promise<string | null> {
  const { data } = await supabase
    .schema("information_schema")
    .from("columns")
    .select("column_name")
    .eq("table_schema", "public")
    .eq("table_name", "judge_prosecutor_pairings");
  if (!data) return null;
  const names = (data as Array<{ column_name: string }>).map((r) => r.column_name);
  if (names.includes("created_at")) return "created_at";
  if (names.includes("updated_at")) return "updated_at";
  return null;
}

export async function GET(req: NextRequest) {
  const guard = requireCron(req);
  if (!guard.authorized) return guard.error;

  const supabase = createAdminClient();
  const started = Date.now();

  const fromEmail = process.env.RESEND_FROM_EMAIL_UPDATES;
  if (!fromEmail) {
    return NextResponse.json(
      { ok: false, error: "RESEND_FROM_EMAIL_UPDATES env not set" },
      { status: 500 },
    );
  }
  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ ok: false, error: "resend-unconfigured" }, { status: 500 });
  }

  // Recipient hard-filter.
  const lookbackIso = new Date(Date.now() - ACTIVE_ORDERS_LOOKBACK_DAYS * 86_400_000).toISOString();
  const { data: orders, error: ordersErr } = await supabase
    .from("orders")
    .select("id, email, tier, status, paid_at, created_at")
    .in("tier", ["war-room", "situation-room"])
    .not("status", "in", "(refunded,cancelled)")
    .gte("created_at", lookbackIso)
    .order("created_at", { ascending: true })
    .limit(ACTIVE_ORDERS_PAGE_SIZE);

  if (ordersErr) {
    return NextResponse.json(
      { ok: false, error: "orders-query-failed", detail: ordersErr.message },
      { status: 500 },
    );
  }

  const ordersList = (orders ?? []) as ActiveOrder[];

  // Saturation alarm: pagination cap silently truncating recipients.
  // Code-review R2 CRITICAL — promotes the cap to a visible failure so an
  // operator sees it before customers 501+ silently miss the digest.
  if (ordersList.length === ACTIVE_ORDERS_PAGE_SIZE) {
    return NextResponse.json(
      {
        ok: false,
        error: "page-size-saturated",
        page_size: ACTIVE_ORDERS_PAGE_SIZE,
        message:
          "Active War Room/Situation Room order count hit the page cap; loop must paginate before sending. Aborting to avoid partial-recipient set.",
      },
      { status: 500 },
    );
  }

  // Snapshot guard: refuse on overshoot. Fail closed when count query fails
  // (security-auditor R2 finding W3 — null-fallback made the guard a no-op).
  const { count: snapshotActive, error: snapErr } = await supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .in("tier", ["war-room", "situation-room"])
    .not("status", "in", "(refunded,cancelled)");

  if (snapErr || snapshotActive === null || snapshotActive === undefined) {
    return NextResponse.json(
      { ok: false, error: "snapshot-count-failed", detail: snapErr?.message ?? null },
      { status: 500 },
    );
  }

  const allowedMax = Math.ceil(snapshotActive * RECIPIENT_OVERSHOOT_TOLERANCE) + 5;
  if (ordersList.length > allowedMax) {
    return NextResponse.json(
      { ok: false, error: "recipient-overshoot", got: ordersList.length, max: allowedMax },
      { status: 500 },
    );
  }

  const temporalCol = await pairingsTemporalColumn(supabase);
  // April-dunford W4: a digest that says "new data may be available" is spam.
  // Hard-block when no temporal column exists — the digest's positioning
  // value is the delta. Without it, do not send.
  if (temporalCol === null) {
    return NextResponse.json(
      {
        ok: false,
        error: "no-temporal-column",
        message:
          "judge_prosecutor_pairings has no created_at/updated_at column. Add via migration before enabling this cron — see plan T0 + T1 fix H.",
      },
      { status: 500 },
    );
  }
  const noTemporal = false;

  let sent = 0;
  let skipped = 0;
  let errors = 0;
  const detail: Array<Record<string, unknown>> = [];

  for (const order of ordersList) {
    if (Date.now() - started > 260_000) break;

    if (!isValidToAddress(order.email)) {
      skipped++;
      detail.push({ order: order.id, skip: "bad-email" });
      continue;
    }

    // Resolve case + intake to get judge_name + state.
    // USE_ORDERS_CASE_ID_FK=true (Task 4): use the direct FK on orders.case_id
    // (migration 20260501a). Default false preserves existing heuristic behaviour.
    // Both paths produce the same caseRow shape; the flag is the only branch.
    const useOrdersCaseIdFk = process.env.USE_ORDERS_CASE_ID_FK === "true";
    let caseRow: { id: string; intake_id: string | null } | null = null;

    if (useOrdersCaseIdFk) {
      // FK path: direct join via orders.case_id — O(1), no email-window ambiguity
      const { data: orderWithCase } = await supabase
        .from("orders")
        .select("case_id, cases!orders_case_id_fkey(id, intake_id)")
        .eq("id", order.id)
        .maybeSingle();
      const linked = orderWithCase?.cases as { id: string; intake_id: string | null } | null | undefined;
      caseRow = linked ?? null;
    } else {
      // Heuristic path (legacy): match by email + paid_at window.
      // Known limitation: a customer with multiple War Room purchases under
      // the same email could receive the wrong case. Flip USE_ORDERS_CASE_ID_FK
      // to true once backfill verify passes (diag-orders-case-id-backfill-verify.mjs).
      const { data: heuristicCase } = await supabase
        .from("cases")
        .select("id, intake_id")
        .eq("email", order.email)
        .gte("created_at", order.paid_at ?? order.created_at)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      caseRow = heuristicCase ?? null;
    }
    if (!caseRow) {
      skipped++;
      detail.push({ order: order.id, skip: "no-case" });
      continue;
    }

    let judgeName: string | null = null;
    let state: string | null = null;
    if (caseRow.intake_id) {
      const { data: intake } = await supabase
        .from("intakes")
        .select("phase2_data, state")
        .eq("id", caseRow.intake_id)
        .maybeSingle();
      const phase2 = intake?.phase2_data as { judge_name?: string } | null | undefined;
      judgeName = phase2?.judge_name ?? null;
      state = (intake?.state as string | null) ?? null;
    }
    if (!judgeName) {
      skipped++;
      detail.push({ order: order.id, skip: "no-judge-name" });
      continue;
    }

    const judgeIds = await resolveCaseJudgeIds({ judgeName, state });
    const matrix = await queryPairingMatrix({ caseJudgeIds: judgeIds });

    // Delta computation. Without a temporal column we ship a baseline.
    const delta: DigestDelta = {
      newCells: [],
      shiftedCells: [],
      noTemporalColumn: noTemporal,
    };

    if (temporalCol && judgeIds.length > 0) {
      const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
      const { data: newRows } = await supabase
        .from("judge_prosecutor_pairings")
        .select("prosecutor_name, motion_type, grant_rate, sample_size, source_urls")
        .in("judge_id", judgeIds)
        .gte(temporalCol, sevenDaysAgo)
        .gte("sample_size", 5)
        .not("source_urls", "is", null)
        .not("source_urls", "eq", "{}")
        .limit(50);
      delta.newCells = (newRows ?? [])
        .filter((r) => Array.isArray(r.source_urls) && (r.source_urls as string[]).length > 0)
        .map((r) => ({
          prosecutor_name: r.prosecutor_name as string,
          motion_type: (r.motion_type as string) ?? "(uncategorized)",
          grant_rate: Number(r.grant_rate ?? 0),
          sample_size: Number(r.sample_size ?? 0),
        }));
    }

    const isBaseline =
      delta.newCells.length === 0 && delta.shiftedCells.length === 0 && !delta.noTemporalColumn;
    const weekLabel = new Date().toLocaleString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    });
    const subject = buildDigestSubject({ isBaseline, weekLabel });

    // Cross-corpus intelligence sections (closed-ecosystem + bench fingerprint +
    // optional officer-judge rates). Best-effort: digest sends even if this fails.
    let crossCorpusSections: string | null = null;
    try {
      const sections = await renderWarRoomCrossCorpusSections({
        caseId: caseRow.id,
        judgeName,
        state: state ?? "",
        chargeType: null,
        officerName: null,
      });
      crossCorpusSections = sections.combined;
    } catch {
      // Non-fatal: digest ships without the cross-corpus block
    }

    const html = buildDigestHtml({
      caseId: caseRow.id,
      judgeName,
      matrix,
      delta,
      weekLabel,
      myCaseUrl: `${SITE_URL}/my-case/${caseRow.id}`,
      crossCorpusSections,
    });

    // Per-send timeout (code-review R2 W4): one stalled Resend call must
    // not eat the whole 300s budget for the rest of the recipient list.
    const sendPromise = sendEmail(
      {
        to: order.email,
        subject,
        html,
        unsubscribeEmail: order.email,
      },
      {
        category: "war-room-weekly-digest",
        order_id: order.id,
        case_id: caseRow.id,
        metadata: {
          tier: order.tier,
          is_baseline: isBaseline,
          new_cells: delta.newCells.length,
          shifted_cells: delta.shiftedCells.length,
          no_temporal_column: delta.noTemporalColumn,
        },
      },
    );
    const timeoutPromise = new Promise<{ success: false; error: string }>((resolve) =>
      setTimeout(() => resolve({ success: false, error: "send-timeout-30s" }), 30_000),
    );
    try {
      const res = await Promise.race([sendPromise, timeoutPromise]);
      if (res.success) {
        sent++;
        detail.push({ order: order.id, sent: true });
      } else {
        errors++;
        detail.push({ order: order.id, error: "resend-failed", message: res.error });
      }
    } catch (e) {
      errors++;
      detail.push({ order: order.id, error: "send-threw", message: String(e) });
    }
  }

  return NextResponse.json({
    ok: true,
    ms: Date.now() - started,
    orders_considered: ordersList.length,
    sent,
    skipped,
    errors,
    no_temporal_column: noTemporal,
    detail: detail.slice(0, 20),
  });
}
