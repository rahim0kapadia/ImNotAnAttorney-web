/**
 * GET /api/cron/rising-precedent-alerts
 *
 * Sprint 6c of the tier-ladder plan. Unified alert pipeline for War Room
 * (weekly delta) and Situation Room (72hr) buyers.
 *
 * Logic:
 *   1. Find active orders at tier=war-room or tier=situation-room
 *      (active = purchased within last 90 days OR status != 'refunded'|'cancelled').
 *   2. For each, look up their charge_type + state from the associated intake.
 *   3. Detect rising-flagged precedents added since their last_alerted_at,
 *      filtered by charge_type match (ILIKE prefix) + appellate/supreme courts.
 *   4. If any, send a Resend email summarizing them.
 *   5. Record the alert in rising_precedent_alerts_log to avoid resends.
 *
 * Cadence:
 *   - War Room: weekly (every 7d).
 *   - Situation Room: every 3 days max (72hr window).
 *
 * Protected by CRON_AUTH_TOKEN via requireCron guard.
 *
 * cron-job.org registration (manual follow-up):
 *   schedule: every day 13:00 UTC; URL: https://imnotanattorney.com/api/cron/rising-precedent-alerts
 *
 * One migration required (runs idempotent):
 *   CREATE TABLE IF NOT EXISTS rising_precedent_alerts_log (
 *     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 *     order_id UUID NOT NULL,
 *     email TEXT NOT NULL,
 *     tier TEXT NOT NULL,
 *     charge_type TEXT,
 *     state TEXT,
 *     alerted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 *     cited_opinion_ids BIGINT[] NOT NULL
 *   );
 *   CREATE INDEX IF NOT EXISTS idx_rpa_order_id ON rising_precedent_alerts_log (order_id, alerted_at DESC);
 */

import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";
import { escapeHtml } from "@/lib/email";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

interface ActiveOrder {
  id: string;
  email: string;
  tier: string;
  created_at: string;
  status: string;
}

interface AlertLogRow {
  order_id: string;
  alerted_at: string;
}

interface RisingRow {
  cited_opinion_id: string | number;
  case_name: string | null;
  jurisdiction: string;
  date_filed: string | null;
  citation_count: number;
  velocity: number;
  source_url: string | null;
  cluster_id: string | number | null;
}

const WAR_ROOM_CADENCE_DAYS = 7;
const SITUATION_ROOM_CADENCE_DAYS = 3;

export async function GET(req: NextRequest) {
  const guard = requireCron(req);
  if (!guard.authorized) return guard.error;

  const supabase = createAdminClient();
  const started = Date.now();
  const runLog: Array<Record<string, unknown>> = [];

  // Find active War Room + Situation Room orders from last 90 days.
  const ninetyDaysAgo = new Date(Date.now() - 90 * 86400 * 1000).toISOString();
  const { data: orders, error: ordersErr } = await supabase
    .from("orders")
    .select("id, email, tier, created_at, status")
    .in("tier", ["war-room", "situation-room"])
    .gte("created_at", ninetyDaysAgo)
    .not("status", "in", '(refunded,cancelled)')
    .limit(500);

  if (ordersErr) {
    return NextResponse.json({ ok: false, error: ordersErr.message }, { status: 500 });
  }

  const resendKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL || "noreply@imnotanattorney.com";

  let sent = 0, skipped = 0, errors = 0;

  for (const order of (orders || []) as ActiveOrder[]) {
    const cadenceDays = order.tier === "situation-room" ? SITUATION_ROOM_CADENCE_DAYS : WAR_ROOM_CADENCE_DAYS;
    const cadenceCutoff = new Date(Date.now() - cadenceDays * 86400 * 1000).toISOString();

    // Has this order been alerted within the cadence window?
    const { data: recentAlerts } = await supabase
      .from("rising_precedent_alerts_log")
      .select("order_id, alerted_at")
      .eq("order_id", order.id)
      .gte("alerted_at", cadenceCutoff)
      .limit(1);

    if (recentAlerts && recentAlerts.length > 0) {
      skipped++;
      runLog.push({ order: order.id, skipped: "within-cadence" });
      continue;
    }

    // Get last alert timestamp (any age) to use as the "new since" cutoff for content.
    const { data: lastAlert } = await supabase
      .from("rising_precedent_alerts_log")
      .select("alerted_at")
      .eq("order_id", order.id)
      .order("alerted_at", { ascending: false })
      .limit(1);
    const sinceTs = lastAlert && lastAlert[0]
      ? (lastAlert[0] as AlertLogRow).alerted_at
      : order.created_at;

    // Look up the order's case + intake for charge_type + state filter context.
    const { data: relatedCase } = await supabase
      .from("cases")
      .select("id, intake_id")
      .eq("email", order.email)
      .order("created_at", { ascending: false })
      .limit(1);

    let chargeType: string | null = null;
    let state: string | null = null;
    const caseRow = relatedCase && relatedCase[0];
    if (caseRow && caseRow.intake_id) {
      const { data: intake } = await supabase
        .from("intakes")
        .select("charge_type, state")
        .eq("id", caseRow.intake_id)
        .single();
      if (intake) {
        chargeType = intake.charge_type || null;
        state = intake.state || null;
      }
    }

    // Fetch rising precedents added since sinceTs. created_at on
    // citation_velocity_criminal reflects the most recent derivation run — so
    // this fires when Phase A refresh newly flags a case as rising. If the
    // order was purchased after the last derivation run, created_at > order
    // date would mean nothing to alert on — skip.
    const { data: rising } = await supabase
      .from("citation_velocity_criminal")
      .select("cited_opinion_id, case_name, jurisdiction, date_filed, citation_count, velocity, source_url, cluster_id")
      .eq("rising_flag", true)
      .in("jurisdiction", ["S", "SA", "F"])
      .gte("created_at", sinceTs)
      .order("velocity", { ascending: false })
      .limit(15);

    const risingRows = (rising || []) as RisingRow[];
    if (!risingRows.length) {
      skipped++;
      runLog.push({ order: order.id, skipped: "no-new-rising" });
      continue;
    }

    // Charge-type filter: if buyer has a charge_type, narrow to charge-matched
    // rising precedents via charge_type_top_authorities cross-ref.
    let chargeFiltered: RisingRow[] = [];
    if (chargeType) {
      const chargeSlug = String(chargeType).toLowerCase();
      const { data: topAuth } = await supabase
        .from("charge_type_top_authorities")
        .select("cluster_id")
        .ilike("charge_type", `${chargeSlug}%`)
        .limit(100);
      const topAuthSet = new Set((topAuth || []).map((r) => String(r.cluster_id)));
      chargeFiltered = risingRows.filter((r) => r.cluster_id != null && topAuthSet.has(String(r.cluster_id)));
    }
    const finalRows = chargeFiltered.length >= 3 ? chargeFiltered : risingRows.slice(0, 10);

    if (!resendKey) {
      runLog.push({ order: order.id, error: "RESEND_API_KEY missing" });
      errors++;
      continue;
    }

    // Build the email.
    const subject = order.tier === "situation-room"
      ? `[72hr] New rising precedents that could matter for your case`
      : `[Weekly] New rising precedents in your charge type`;
    const tierLabel = order.tier === "situation-room" ? "Situation Room" : "War Room";
    const filterNote = chargeFiltered.length >= 3
      ? `filtered to your charge type (${escapeHtml(chargeType || "")})`
      : `(no charge-specific matches this cycle — showing national top 10)`;

    const rowsHtml = finalRows.slice(0, 10).map((r) => {
      const year = r.date_filed ? new Date(r.date_filed).getUTCFullYear() : "—";
      const name = escapeHtml(r.case_name || "—");
      const link = r.source_url
        ? `<a href="${escapeHtml(r.source_url)}" style="color:#F59E0B;">${name}</a>`
        : name;
      return `<tr><td style="padding:6px 12px;border-bottom:1px solid #3f3f46;">${link}</td><td style="padding:6px 12px;border-bottom:1px solid #3f3f46;">${year}</td><td style="padding:6px 12px;border-bottom:1px solid #3f3f46;text-align:right;">${r.citation_count}</td><td style="padding:6px 12px;border-bottom:1px solid #3f3f46;text-align:right;">${r.velocity}</td></tr>`;
    }).join("");

    const html = `<!DOCTYPE html>
<html><body style="font-family:-apple-system,sans-serif;background:#0C0A09;color:#D4D4D8;margin:0;padding:24px;">
<div style="max-width:640px;margin:0 auto;">
  <h1 style="color:#F59E0B;font-size:22px;">New rising precedents, ${escapeHtml(tierLabel)}</h1>
  <p>Since your last update, the following criminal-defense precedents have been flagged as "rising" in citation velocity ${filterNote}:</p>
  <table style="width:100%;border-collapse:collapse;margin:16px 0;">
    <thead><tr><th style="padding:6px 12px;border-bottom:2px solid #F59E0B;text-align:left;">Case</th><th style="padding:6px 12px;border-bottom:2px solid #F59E0B;text-align:left;">Year</th><th style="padding:6px 12px;border-bottom:2px solid #F59E0B;text-align:right;">Cites</th><th style="padding:6px 12px;border-bottom:2px solid #F59E0B;text-align:right;">Cites/yr</th></tr></thead>
    <tbody>${rowsHtml}</tbody>
  </table>
  <p style="font-size:13px;color:#A1A1AA;">Questions to raise with your attorney: which of these opinions apply to your charge type, motion strategy, or sentencing posture?</p>
  <p style="font-size:12px;color:#71717A;margin-top:32px;border-top:1px solid #27272A;padding-top:16px;">Legal INFORMATION, not legal ADVICE. Source: CourtListener opinion corpus. This is citation-activity data, not a prediction about your case.</p>
</div>
</body></html>`;

    try {
      const resendRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: fromEmail, to: [order.email], subject, html }),
      });
      if (!resendRes.ok) {
        const errText = await resendRes.text();
        errors++;
        runLog.push({ order: order.id, error: `resend ${resendRes.status}: ${errText.slice(0, 200)}` });
        continue;
      }
      // Log the send.
      await supabase.from("rising_precedent_alerts_log").insert({
        order_id: order.id,
        email: order.email,
        tier: order.tier,
        charge_type: chargeType,
        state,
        cited_opinion_ids: finalRows.map((r) => Number(r.cited_opinion_id)).filter(Number.isFinite),
      });
      sent++;
      runLog.push({ order: order.id, sent: finalRows.length });
    } catch (e) {
      errors++;
      runLog.push({ order: order.id, error: String(e) });
    }
  }

  return NextResponse.json({
    ok: true,
    ms: Date.now() - started,
    orders_considered: orders?.length || 0,
    sent, skipped, errors,
    detail: runLog.slice(0, 20),
  });
}
