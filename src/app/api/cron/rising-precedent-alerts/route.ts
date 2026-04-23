/**
 * GET /api/cron/rising-precedent-alerts
 *
 * Sprint 6c of the tier-ladder plan. Unified alert pipeline for War Room
 * (weekly) and Situation Room (72hr) buyers.
 *
 * Logic:
 *   1. Find active orders at tier=war-room or tier=situation-room.
 *   2. For each, look up the case created after that order's paid_at and
 *      pull its charge_type + state.
 *   3. Detect rising-flagged precedents whose cited_opinion_id is NOT
 *      present in the union of prior-alert cited_opinion_ids for this order.
 *      (Round-1 fix C3: citation_velocity_criminal.created_at resets on every
 *      REPLACE-mode refresh, so a time-based sinceTs would re-alert every run.)
 *   4. If any genuinely-new cases surface, insert the log row FIRST (serves as
 *      the "attempt made" record — cadence-locks the order even if Resend later
 *      errors, preventing re-send cascades). Then call Resend. Any send failure
 *      is logged + counted as an error; the inserted row stays so the order is
 *      not re-tried within the cadence window. Retry-on-failure is deferred to
 *      operator manual intervention (no pending/sent state machine by design).
 *   5. Cadence window prevents accidental over-send (WR 7d / SR 3d).
 *
 * Protected by CRON_AUTH_TOKEN via requireCron guard.
 *
 * Migration: supabase/migrations/20260422i_rising_precedent_alerts_log.sql
 */

import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";
import { escapeHtml } from "@/lib/email";
import { RISING_JURISDICTION_FILTER, CHARGE_FILTER_MIN_ROWS } from "@/lib/derivations/constants";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

interface ActiveOrder {
  id: string;
  email: string;
  tier: string;
  created_at: string;
  paid_at: string | null;
  status: string;
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

// S10 round-1 closure: bump page size + keep stable secondary order so >200
// active WR/SR orders in a 90-day window can't be silently skipped.
const ACTIVE_ORDERS_PAGE_SIZE = 500;

// R2-W4 closure: paginate prior-sends instead of capping at 50. Index
// idx_rpa_order_id keeps this cheap even with hundreds of rows per order.
// 5 pages × 1000 rows = 5000 prior sends covered (≈ 100 years of weekly alerts).
const PRIOR_SENDS_PAGE_SIZE = 1000;
const PRIOR_SENDS_MAX_PAGES = 5;

// R2-S8 closure: process orders concurrently (bounded). Each order fires its
// own per-tier queries + Resend call; a tiny pool keeps total run under the
// 300s maxDuration even when the active-order set grows past 50.
const ORDER_CONCURRENCY = 5;

// Primary-domain guard per never-cold-email-from-primary-domain.md HARD RULE.
// Worry-to-Pristine round 1 finding C6.
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

// Validates a URL is safe to include in email HTML. Blocks javascript:/data:/file: schemes.
// Worry-to-Pristine round 1 finding W14.
function isSafeHttpsUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== "string") return false;
  return /^https:\/\//i.test(url.trim());
}

// Strict RFC5321-ish check for `to:` addresses. Rejects control chars + CRLF header-injection.
// Worry-to-Pristine round 1 finding CRITICAL#4 (header injection defense).
function isValidToAddress(addr: string): boolean {
  if (!addr || typeof addr !== "string" || addr.length > 254) return false;
  if (/[\r\n\t<>,"]/.test(addr)) return false;
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(addr);
}

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
    // Fatal — HARD RULE never-cold-email-from-primary-domain.
    return NextResponse.json(
      { ok: false, error: "resend-from-invalid" },
      { status: 500 },
    );
  }

  // Find active War Room + Situation Room orders from last 90 days.
  // S10 closure: secondary `id` sort makes ordering deterministic when many
  // orders share a created_at second; page size bumped to 500 (was 200) to
  // absorb growth before we need true cursor pagination.
  const ninetyDaysAgo = new Date(Date.now() - 90 * 86400 * 1000).toISOString();
  const { data: orders, error: ordersErr } = await supabase
    .from("orders")
    .select("id, email, tier, created_at, paid_at, status")
    .in("tier", ["war-room", "situation-room"])
    .gte("created_at", ninetyDaysAgo)
    .not("status", "in", "(refunded,cancelled)")
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(ACTIVE_ORDERS_PAGE_SIZE);

  if (ordersErr) {
    console.error("[rising-alerts] orders query failed:", ordersErr.message);
    return NextResponse.json({ ok: false, error: "orders-query-failed" }, { status: 500 });
  }

  const ordersList = (orders || []) as ActiveOrder[];
  const saturated = ordersList.length >= ACTIVE_ORDERS_PAGE_SIZE;

  let sent = 0, skipped = 0, errors = 0;
  const runStartIso = new Date(started).toISOString();

  // R2-S8 closure: bounded-concurrency worker pool over the active-order set.
  // Each worker loops: take next order index, process, repeat until index
  // exhausted or budget guard trips. Budget check is per-order so one slow
  // Resend call can't freeze the whole batch past 300s.
  let nextIdx = 0;
  let budgetExceeded = false;
  async function processOne(order: ActiveOrder): Promise<void> {
    if (Date.now() - started > 260_000) {
      // Budget guard — leave 40s headroom on the 300s maxDuration cap.
      runLog.push({ order: order.id, skipped: "budget-exceeded" });
      budgetExceeded = true;
      return;
    }
    if (!isValidToAddress(order.email)) {
      skipped++;
      runLog.push({ order: order.id, skipped: "bad-email-address" });
      return;
    }
    const cadenceDays = order.tier === "situation-room" ? SITUATION_ROOM_CADENCE_DAYS : WAR_ROOM_CADENCE_DAYS;
    const cadenceCutoff = new Date(Date.now() - cadenceDays * 86400 * 1000).toISOString();

    // Cadence check — have we sent to this order within the tier's window?
    const { data: recentAlerts } = await supabase
      .from("rising_precedent_alerts_log")
      .select("order_id")
      .eq("order_id", order.id)
      .gte("alerted_at", cadenceCutoff)
      .limit(1);

    if (recentAlerts && recentAlerts.length > 0) {
      skipped++;
      runLog.push({ order: order.id, skipped: "within-cadence" });
      return;
    }

    // Accumulate the union of cited_opinion_ids we have already alerted about.
    // C3 fix: time-based sinceTs would re-alert because REPLACE-mode derivation
    // resets created_at every quarter. Diff against what we have literally sent.
    // R2-W4 closure: paginate in 1000-row chunks (was .limit(50)) so we never
    // lose visibility into earlier-alerted cited_opinion_ids once an order
    // crosses the old 50-row horizon.
    const priorIds = new Set<string>();
    let priorTruncated = false;
    for (let page = 0; page < PRIOR_SENDS_MAX_PAGES; page++) {
      const from = page * PRIOR_SENDS_PAGE_SIZE;
      const to = from + PRIOR_SENDS_PAGE_SIZE - 1;
      const { data: priorSendsPage } = await supabase
        .from("rising_precedent_alerts_log")
        .select("cited_opinion_ids")
        .eq("order_id", order.id)
        .order("alerted_at", { ascending: false })
        .range(from, to);
      const rowsArr = (priorSendsPage as Array<{ cited_opinion_ids: (string | number)[] }> | null) || [];
      for (const row of rowsArr) {
        for (const id of row.cited_opinion_ids || []) priorIds.add(String(id));
      }
      if (rowsArr.length < PRIOR_SENDS_PAGE_SIZE) break;
      if (page === PRIOR_SENDS_MAX_PAGES - 1) priorTruncated = true;
    }
    if (priorTruncated) {
      console.warn(`[rising-alerts] prior-sends cap hit for order ${order.id} — set grew past ${PRIOR_SENDS_MAX_PAGES * PRIOR_SENDS_PAGE_SIZE}`);
    }

    // C5 fix: resolve the case linked to THIS order (case created after the
    // order's paid_at for this email) — not "the most recent case for this email."
    let chargeType: string | null = null;
    let state: string | null = null;
    const caseSinceCutoff = order.paid_at || order.created_at;
    const { data: relatedCase } = await supabase
      .from("cases")
      .select("id, intake_id, created_at")
      .eq("email", order.email)
      .gte("created_at", caseSinceCutoff)
      .order("created_at", { ascending: true })
      .limit(1);
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

    const { data: rising } = await supabase
      .from("citation_velocity_criminal")
      .select("cited_opinion_id, case_name, jurisdiction, date_filed, citation_count, velocity, source_url, cluster_id")
      .eq("rising_flag", true)
      .in("jurisdiction", [...RISING_JURISDICTION_FILTER])
      .order("velocity", { ascending: false })
      .limit(25);

    const risingAll = (rising || []) as RisingRow[];
    // Diff against already-alerted cited_opinion_ids.
    const risingNew = risingAll.filter((r) => r.cited_opinion_id != null && !priorIds.has(String(r.cited_opinion_id)));
    if (risingNew.length < 3) {
      // Not enough genuinely new content — skip this cycle.
      skipped++;
      runLog.push({ order: order.id, skipped: "not-enough-new-rising", new_count: risingNew.length });
      return;
    }

    // Charge-type filter via cross-ref.
    let finalRows: RisingRow[] = risingNew.slice(0, 10);
    // R2 fix: explicit boolean (reference-compare on slice() was always true).
    let didChargeFilter = false;
    if (chargeType) {
      const chargeSlug = String(chargeType).toLowerCase().replace(/[%_\\]/g, (ch) => `\\${ch}`);
      const { data: topAuth } = await supabase
        .from("charge_type_top_authorities")
        .select("cluster_id")
        .ilike("charge_type", `${chargeSlug}%`)
        .limit(100);
      const topAuthSet = new Set((topAuth || []).map((r) => String(r.cluster_id)));
      const chargeFiltered = risingNew.filter((r) => r.cluster_id != null && topAuthSet.has(String(r.cluster_id)));
      if (chargeFiltered.length >= CHARGE_FILTER_MIN_ROWS) {
        finalRows = chargeFiltered.slice(0, 10);
        didChargeFilter = true;
      }
    }

    const chargeLabel = chargeType || "your charge type";

    // W9 fix: insert a log row BEFORE sending. If the insert fails we never send;
    // if the send fails after insert, cadence guard prevents re-send cascade.
    const citedOpinionIds = finalRows
      .map((r) => (r.cited_opinion_id != null ? String(r.cited_opinion_id) : null))
      .filter((id): id is string => id != null);

    const { error: insertErr } = await supabase
      .from("rising_precedent_alerts_log")
      .insert({
        order_id: order.id,
        email: order.email,
        tier: order.tier,
        charge_type: chargeType,
        state,
        cited_opinion_ids: citedOpinionIds,
      });
    if (insertErr) {
      errors++;
      // W13 fix: do not leak DB error to caller.
      console.error(`[rising-alerts] insert failed for order ${order.id}:`, insertErr.message);
      runLog.push({ order: order.id, error: "insert-failed" });
      return;
    }

    // Build email HTML.
    const subject = order.tier === "situation-room"
      ? `[72hr] New rising precedents that could matter for your case`
      : `[Weekly] New rising precedents in your charge type`;
    const tierLabel = order.tier === "situation-room" ? "Situation Room" : "War Room";
    const filterNote = didChargeFilter
      ? `filtered to your charge type (${escapeHtml(chargeLabel)})`
      : `(national top ${finalRows.length} this cycle)`;

    const rowsHtml = finalRows.map((r) => {
      const year = r.date_filed ? new Date(r.date_filed).getUTCFullYear() : "—";
      const name = escapeHtml(r.case_name || "—");
      const link = isSafeHttpsUrl(r.source_url)
        ? `<a href="${escapeHtml(r.source_url as string)}" style="color:#F59E0B;">${name}</a>`
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
        errors++;
        const errText = await resendRes.text();
        console.error(`[rising-alerts] resend ${resendRes.status} for order ${order.id}:`, errText);
        runLog.push({ order: order.id, error: "resend-failed", status: resendRes.status });
        return;
      }
      sent++;
      runLog.push({ order: order.id, sent: finalRows.length, run_started_at: runStartIso });
    } catch (e) {
      errors++;
      console.error(`[rising-alerts] resend threw for order ${order.id}:`, e);
      runLog.push({ order: order.id, error: "resend-threw" });
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
        console.error(`[rising-alerts] processOne threw for order ${order.id}:`, e);
        runLog.push({ order: order.id, error: "process-threw" });
      }
    }
  }

  const workerCount = Math.min(ORDER_CONCURRENCY, ordersList.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  if (saturated) {
    console.warn(`[rising-alerts] active-order fetch saturated at ${ACTIVE_ORDERS_PAGE_SIZE} rows — scale alert`);
  }

  return NextResponse.json({
    ok: true,
    ms: Date.now() - started,
    orders_considered: ordersList.length,
    saturated,
    budget_exceeded: budgetExceeded,
    concurrency: workerCount,
    sent, skipped, errors,
    detail: runLog.slice(0, 20),
  });
}
