/**
 * GET /api/cron/warroom-monthly-precedent-delta
 *
 * E3 — War Room $4,997 / Situation Room $9,997 per-case monthly precedent-
 * delta email cron.
 *
 * Monthly cadence (min 28 days between sends per order). For each active
 * War Room or Situation Room order:
 *   1. Resolve the case linked to this order (case created after paid_at
 *      for the order's email) and pull chargeType + state from its intake.
 *   2. Query citation_velocity_criminal narrowed to the case's chargeType
 *      (falls back to national top-N when the charge-authority cluster set
 *      is sparse, with a limitation note in the email).
 *   3. Diff the new rising top-10 against the stored snapshot on
 *      orders.warroom_precedent_delta_state.last_snapshot.
 *      - No prior snapshot → baseline email (current top-10 only, no deltas)
 *      - Significant shift (new top-N entry OR rank-delta >= 3) → delta email
 *      - Otherwise → skip, advance no state.
 *   4. Persist new state FIRST (write-then-send pattern per rising-precedent-
 *      alerts W9 finding); if Resend errors, the state still advances the
 *      cadence lock so we never double-send a cycle.
 *   5. Send via Resend with CAN-SPAM unsubscribe + RFC 8058 headers (via
 *      sendEmail's unsubscribeEmail opt).
 *
 * Idempotency: cadence check (28d) on the state blob itself prevents double
 * sends when the cron is hit twice in one day. Primary-domain FROM guard
 * applies here exactly as on rising-precedent-alerts.
 *
 * Tier monotonicity (HARD):
 *   - Per-case narrowing exceeds M3 $47 charge-level weekly drip.
 *   - Monthly steady-state cadence stays BELOW Situation Room $9,997 trial-
 *     phase priority (SR gets 72hr + trial intel; WR gets monthly pre-trial).
 *
 * Protected by CRON_AUTH_TOKEN via requireCron.
 *
 * Schema: supabase/migrations/20260424a_warroom_precedent_delta_state.sql
 * Module: src/lib/tier9-reports/warroom-precedent-delta.ts
 * Plan:   docs/plans/2026-04-23-data-to-product-autonomous-execution.md E3
 */

import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail, escapeHtml } from "@/lib/email";
import {
  queryPerCaseDelta,
  buildSnapshot,
  detectSignificantShift,
  cadenceAllowsSend,
  isSafeHttpsUrl,
  type SnapshotEntry,
  type DeltaRow,
  type ShiftReport,
} from "@/lib/tier9-reports/warroom-precedent-delta";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

// ============================================================
// Config
// ============================================================

// Active-order lookback. War Room / Situation Room orders stay active
// indefinitely while the case is live, but 365 days is a conservative cap
// that stops the cron crawling year-old orders forever.
const ACTIVE_ORDERS_LOOKBACK_DAYS = 365;
const ACTIVE_ORDERS_PAGE_SIZE = 500;
const ORDER_CONCURRENCY = 5;

// Primary-domain guard per HARD rule never-cold-email-from-primary-domain.
const FORBIDDEN_FROM_DOMAINS = [
  "imnotanattorney.com",
  "inaa.com",
  "tastedrop.com",
  "cloudculture.com",
  "myculture.cloud",
];

function isForbiddenFromAddress(from: string): boolean {
  const domain = from.split("@")[1]?.toLowerCase() || "";
  return FORBIDDEN_FROM_DOMAINS.some((d) => domain === d || domain.endsWith("." + d));
}

// Strict RFC5321-ish check for `to:` addresses. Rejects control chars +
// CRLF header-injection. Matches rising-precedent-alerts pattern.
function isValidToAddress(addr: string): boolean {
  if (!addr || typeof addr !== "string" || addr.length > 254) return false;
  if (/[\r\n\t<>,"]/.test(addr)) return false;
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(addr);
}

// ============================================================
// Types
// ============================================================

interface ActiveOrder {
  id: string;
  email: string;
  tier: string;
  created_at: string;
  paid_at: string | null;
  status: string;
  warroom_precedent_delta_state: DeltaState | null;
}

interface DeltaState {
  first_run_at: string;
  last_sent_at: string | null;
  runs_sent: number;
  last_snapshot: SnapshotEntry[];
  charge_type: string | null;
  state: string | null;
  case_id: string | null;
}

// ============================================================
// Email HTML
// ============================================================

function buildSubject(isBaseline: boolean, tierLabel: string, monthLabel: string): string {
  if (isBaseline) {
    return `[${tierLabel}] Your first monthly precedent snapshot — ${monthLabel}`;
  }
  return `[${tierLabel}] Monthly precedent delta — ${monthLabel}`;
}

function renderRow(r: DeltaRow): string {
  const year = r.date_filed ? escapeHtml(String(r.date_filed).slice(0, 4)) : "—";
  const nameEsc = escapeHtml(r.case_name || "(unnamed opinion)");
  const link = isSafeHttpsUrl(r.source_url)
    ? `<a href="${escapeHtml(r.source_url)}" style="color:#F59E0B;">${nameEsc}</a>`
    : nameEsc;
  return `<tr>
    <td style="padding:6px 12px;border-bottom:1px solid #3f3f46;">#${r.rank}</td>
    <td style="padding:6px 12px;border-bottom:1px solid #3f3f46;">${link}</td>
    <td style="padding:6px 12px;border-bottom:1px solid #3f3f46;">${year}</td>
    <td style="padding:6px 12px;border-bottom:1px solid #3f3f46;text-align:right;">${r.citation_count}</td>
    <td style="padding:6px 12px;border-bottom:1px solid #3f3f46;text-align:right;">${r.velocity.toFixed(2)}</td>
  </tr>`;
}

function buildEmailHtml(params: {
  tierLabel: string;
  chargeLabel: string;
  chargeFilterApplied: boolean;
  rising: DeltaRow[];
  falling: DeltaRow[];
  shiftReport: ShiftReport;
  nameById: Map<number, string>;
  urlById: Map<number, string>;
  limitations: string[];
  runNumber: number;
}): string {
  const { tierLabel, chargeLabel, chargeFilterApplied, rising, falling, shiftReport, nameById, urlById, limitations, runNumber } = params;

  const filterNote = chargeFilterApplied
    ? `filtered to your charge type (${escapeHtml(chargeLabel)})`
    : `national criminal-defense corpus (no charge-specific authority cluster cached for ${escapeHtml(chargeLabel)})`;

  const baselineBlock = shiftReport.isBaseline
    ? `<p>This is your first monthly snapshot. Future emails show citation-velocity shifts since the previous month's snapshot. There's nothing to compare yet — below is the current baseline.</p>`
    : "";

  const newEntriesBlock = !shiftReport.isBaseline && shiftReport.newEntries.length > 0
    ? `<h3 style="color:#111;">New entries in your top ${rising.length}</h3>
       <ul>${shiftReport.newEntries.map((e) => {
         const name = nameById.get(e.cited_opinion_id) ?? "(unnamed opinion)";
         const url = urlById.get(e.cited_opinion_id) ?? "";
         const link = isSafeHttpsUrl(url)
           ? `<a href="${escapeHtml(url)}" style="color:#F59E0B;">${escapeHtml(name)}</a>`
           : escapeHtml(name);
         return `<li>${link} — entered at rank #${e.rank} (velocity ${e.velocity.toFixed(2)} cites/yr)</li>`;
       }).join("")}</ul>`
    : "";

  const shiftsBlock = !shiftReport.isBaseline && shiftReport.shifts.length > 0
    ? `<h3 style="color:#111;">Rank shifts (&ge; 3 positions since last month)</h3>
       <ul>${shiftReport.shifts.map((s) => {
         const name = nameById.get(s.cited_opinion_id) ?? "(unnamed opinion)";
         const url = urlById.get(s.cited_opinion_id) ?? "";
         const link = isSafeHttpsUrl(url)
           ? `<a href="${escapeHtml(url)}" style="color:#F59E0B;">${escapeHtml(name)}</a>`
           : escapeHtml(name);
         const direction = s.newRank < s.oldRank ? "rose" : "fell";
         return `<li>${link} — ${direction} from #${s.oldRank} to #${s.newRank}</li>`;
       }).join("")}</ul>`
    : "";

  const exitsBlock = !shiftReport.isBaseline && shiftReport.exits.length > 0
    ? `<h3 style="color:#111;">Dropped out of top ${rising.length}</h3>
       <ul>${shiftReport.exits.map((e) => `<li>Opinion #${e.cited_opinion_id} (prior rank #${e.rank}) is no longer in the top ${rising.length} for ${escapeHtml(chargeLabel)}.</li>`).join("")}</ul>`
    : "";

  const risingTable = rising.length > 0 ? `
    <h3 style="color:#111;">Current top ${rising.length} rising precedents</h3>
    <table style="width:100%;border-collapse:collapse;margin:12px 0;font-size:14px;">
      <thead><tr>
        <th style="padding:6px 12px;border-bottom:2px solid #F59E0B;text-align:left;">#</th>
        <th style="padding:6px 12px;border-bottom:2px solid #F59E0B;text-align:left;">Case</th>
        <th style="padding:6px 12px;border-bottom:2px solid #F59E0B;text-align:left;">Year</th>
        <th style="padding:6px 12px;border-bottom:2px solid #F59E0B;text-align:right;">Cites</th>
        <th style="padding:6px 12px;border-bottom:2px solid #F59E0B;text-align:right;">Cites/yr</th>
      </tr></thead>
      <tbody>${rising.map(renderRow).join("")}</tbody>
    </table>` : "";

  const fallingTable = falling.length > 0 ? `
    <h3 style="color:#111;">Fading precedents for ${escapeHtml(chargeLabel)}</h3>
    <table style="width:100%;border-collapse:collapse;margin:12px 0;font-size:14px;">
      <thead><tr>
        <th style="padding:6px 12px;border-bottom:2px solid #dc2626;text-align:left;">#</th>
        <th style="padding:6px 12px;border-bottom:2px solid #dc2626;text-align:left;">Case</th>
        <th style="padding:6px 12px;border-bottom:2px solid #dc2626;text-align:left;">Year</th>
        <th style="padding:6px 12px;border-bottom:2px solid #dc2626;text-align:right;">Cites</th>
        <th style="padding:6px 12px;border-bottom:2px solid #dc2626;text-align:right;">Cites/yr</th>
      </tr></thead>
      <tbody>${falling.map(renderRow).join("")}</tbody>
    </table>
    <p style="font-size:13px;color:#555;">A question worth raising with your attorney: are any authorities currently relied on in your case on this fading list?</p>
    ` : "";

  const limitationsBlock = limitations.length > 0
    ? `<p style="font-size:12px;color:#777;border-left:3px solid #4a6fa5;padding:6px 10px;background:#f0f4f8;">
         <strong>Known limitations this cycle:</strong><br>${limitations.map(escapeHtml).join("<br>")}
       </p>`
    : "";

  return `<!DOCTYPE html>
<html><body style="font-family:-apple-system,sans-serif;color:#111;background:#fff;margin:0;padding:24px;">
<div style="max-width:680px;margin:0 auto;">
  <h1 style="color:#F59E0B;font-size:22px;margin:0 0 4px;">${escapeHtml(tierLabel)} — monthly precedent delta (run ${runNumber})</h1>
  <p style="color:#555;font-style:italic;margin:0 0 16px;">Scope: ${filterNote}</p>
  ${baselineBlock}
  ${newEntriesBlock}
  ${shiftsBlock}
  ${exitsBlock}
  ${risingTable}
  ${fallingTable}
  ${limitationsBlock}
  <p style="font-size:13px;color:#555;margin-top:16px;">Questions worth raising with your attorney: which of these opinions apply to your charge type, motion strategy, or sentencing posture?</p>
  <p style="font-size:12px;color:#777;margin-top:24px;border-top:1px solid #ddd;padding-top:12px;">
    This report provides legal INFORMATION — not legal ADVICE. The analysis draws on methods developed by elite defense attorneys, applied specifically to your case details. Your attorney remains the final authority on strategy decisions.
    <br><br>Source: CourtListener criminal-defense opinion corpus. This is citation-activity data, not a prediction about any specific case.
  </p>
</div>
</body></html>`;
}

// 2026-04-29: removed `export { buildEmailHtml }` — Next.js App Router
// route files only allow HTTP handler exports + the known config set
// (runtime, dynamic, maxDuration, etc.). Non-route exports trigger tsc
// errors via the auto-generated .next/types/app/...route.ts shape
// constraint. No test currently imports this; if a future test needs it,
// extract to src/lib/cron/warroom-monthly-precedent-delta-email.ts and
// import the lib function from both the route and the test.

// ============================================================
// Handler
// ============================================================

export async function GET(req: NextRequest) {
  const guard = requireCron(req);
  if (!guard.authorized) return guard.error;

  const supabase = createAdminClient();
  const started = Date.now();
  const runLog: Array<Record<string, unknown>> = [];

  const resendKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL;
  if (!resendKey) {
    return NextResponse.json({ ok: false, error: "resend-unconfigured" }, { status: 500 });
  }
  if (!fromEmail || isForbiddenFromAddress(fromEmail)) {
    return NextResponse.json(
      { ok: false, error: "resend-from-invalid" },
      { status: 500 },
    );
  }

  // Load active War Room / Situation Room orders within lookback window.
  const lookbackIso = new Date(
    Date.now() - ACTIVE_ORDERS_LOOKBACK_DAYS * 86_400_000,
  ).toISOString();

  const { data: orders, error: ordersErr } = await supabase
    .from("orders")
    .select("id, email, tier, created_at, paid_at, status, warroom_precedent_delta_state")
    .in("tier", ["war-room", "situation-room"])
    .gte("created_at", lookbackIso)
    .not("status", "in", "(refunded,cancelled)")
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(ACTIVE_ORDERS_PAGE_SIZE);

  if (ordersErr) {
    console.error("[warroom-monthly-delta] orders query failed:", ordersErr.message);
    return NextResponse.json({ ok: false, error: "orders-query-failed" }, { status: 500 });
  }

  const ordersList = (orders ?? []) as ActiveOrder[];
  const saturated = ordersList.length >= ACTIVE_ORDERS_PAGE_SIZE;

  let sent = 0;
  let skipped = 0;
  let errors = 0;
  let baselined = 0;

  let nextIdx = 0;
  let budgetExceeded = false;

  async function processOne(order: ActiveOrder): Promise<void> {
    if (Date.now() - started > 260_000) {
      budgetExceeded = true;
      runLog.push({ order: order.id, skipped: "budget-exceeded" });
      return;
    }
    if (!isValidToAddress(order.email)) {
      skipped++;
      runLog.push({ order: order.id, skipped: "bad-email-address" });
      return;
    }

    const state = order.warroom_precedent_delta_state;

    // Cadence check — 28 days min between sends on this order.
    if (!cadenceAllowsSend(state?.last_sent_at ?? null)) {
      skipped++;
      runLog.push({ order: order.id, skipped: "within-cadence" });
      return;
    }

    // Resolve the case linked to this order (case created after paid_at for
    // this email) — matches rising-precedent-alerts C5 fix.
    const caseSinceCutoff = order.paid_at || order.created_at;
    let chargeType: string | null = state?.charge_type ?? null;
    let caseState: string | null = state?.state ?? null;
    let caseId: string | null = state?.case_id ?? null;

    if (!caseId) {
      const { data: relatedCase } = await supabase
        .from("cases")
        .select("id, intake_id, created_at")
        .eq("email", order.email)
        .gte("created_at", caseSinceCutoff)
        .order("created_at", { ascending: true })
        .limit(1);
      const caseRow = relatedCase && relatedCase[0];
      if (caseRow) {
        caseId = String(caseRow.id);
        if (caseRow.intake_id) {
          const { data: intake } = await supabase
            .from("intakes")
            .select("charge_type, state")
            .eq("id", caseRow.intake_id)
            .single();
          if (intake) {
            chargeType = intake.charge_type || null;
            caseState = intake.state || null;
          }
        }
      }
    }

    if (!caseId) {
      // No case linked yet — skip this cycle (customer may be mid-intake).
      skipped++;
      runLog.push({ order: order.id, skipped: "no-case-linked" });
      return;
    }

    // Build the per-case delta set.
    const delta = await queryPerCaseDelta({ chargeType, state: caseState });
    if (delta.rising.length === 0 && delta.falling.length === 0) {
      skipped++;
      runLog.push({ order: order.id, skipped: "empty-delta-set" });
      return;
    }

    // Diff against stored snapshot.
    const newSnap = buildSnapshot(delta.rising);
    const shiftReport = detectSignificantShift(state?.last_snapshot, newSnap);

    if (!shiftReport.shouldSend) {
      skipped++;
      runLog.push({ order: order.id, skipped: "no-significant-shift" });
      return;
    }

    // Lookups for rendering deltas.
    const nameById = new Map<number, string>();
    const urlById = new Map<number, string>();
    for (const r of delta.rising) {
      nameById.set(r.cited_opinion_id, r.case_name);
      urlById.set(r.cited_opinion_id, r.source_url);
    }

    const tierLabel = order.tier === "situation-room" ? "Situation Room" : "War Room";
    const chargeLabel = chargeType
      ? chargeType.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
      : "your charge type";
    const monthLabel = new Date().toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

    const html = buildEmailHtml({
      tierLabel,
      chargeLabel,
      chargeFilterApplied: delta.chargeFilterApplied,
      rising: delta.rising,
      falling: delta.falling,
      shiftReport,
      nameById,
      urlById,
      limitations: delta.limitations,
      runNumber: (state?.runs_sent ?? 0) + 1,
    });
    const subject = buildSubject(shiftReport.isBaseline, tierLabel, monthLabel);

    // Write-then-send: advance state BEFORE Resend call so a send failure
    // never cascades into a re-send on the next cron tick.
    const nowIso = new Date().toISOString();
    const nextState: DeltaState = {
      first_run_at: state?.first_run_at ?? nowIso,
      last_sent_at: nowIso,
      runs_sent: (state?.runs_sent ?? 0) + 1,
      last_snapshot: newSnap,
      charge_type: chargeType,
      state: caseState,
      case_id: caseId,
    };

    const { error: updErr } = await supabase
      .from("orders")
      .update({ warroom_precedent_delta_state: nextState })
      .eq("id", order.id);
    if (updErr) {
      errors++;
      console.error("[warroom-monthly-delta] state update failed:", updErr.message);
      runLog.push({ order: order.id, error: "state-update-failed" });
      return;
    }

    try {
      const res = await sendEmail(
        {
          to: order.email,
          subject,
          html,
          unsubscribeEmail: order.email,
        },
        {
          category: "warroom-monthly-precedent-delta",
          order_id: order.id,
          case_id: caseId ?? undefined,
          metadata: {
            tier: order.tier,
            charge_type: chargeType,
            state: caseState,
            is_baseline: shiftReport.isBaseline,
            new_entries: shiftReport.newEntries.length,
            shifts: shiftReport.shifts.length,
            run_number: nextState.runs_sent,
          },
        },
      );
      if (!res.success) {
        errors++;
        runLog.push({ order: order.id, error: "resend-failed", message: res.error });
        return;
      }
      if (shiftReport.isBaseline) baselined++;
      else sent++;
      runLog.push({
        order: order.id,
        sent: true,
        is_baseline: shiftReport.isBaseline,
        new_entries: shiftReport.newEntries.length,
        shifts: shiftReport.shifts.length,
        run_number: nextState.runs_sent,
      });
    } catch (e) {
      errors++;
      console.error("[warroom-monthly-delta] send threw:", e);
      runLog.push({ order: order.id, error: "send-threw" });
    }
  }

  async function worker(): Promise<void> {
    while (!budgetExceeded) {
      const i = nextIdx++;
      if (i >= ordersList.length) return;
      const order = ordersList[i];
      try {
        await processOne(order);
      } catch (e) {
        errors++;
        console.error("[warroom-monthly-delta] processOne threw:", e);
        runLog.push({ order: order.id, error: "process-threw" });
      }
    }
  }

  const workerCount = Math.min(ORDER_CONCURRENCY, ordersList.length || 1);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  if (saturated) {
    console.warn(
      `[warroom-monthly-delta] active-order fetch saturated at ${ACTIVE_ORDERS_PAGE_SIZE} rows — scale alert`,
    );
  }

  return NextResponse.json({
    ok: true,
    ms: Date.now() - started,
    orders_considered: ordersList.length,
    saturated,
    budget_exceeded: budgetExceeded,
    concurrency: workerCount,
    sent,
    baselined,
    skipped,
    errors,
    detail: runLog.slice(0, 20),
  });
}
