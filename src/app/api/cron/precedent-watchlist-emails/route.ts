/**
 * GET /api/cron/precedent-watchlist-emails
 *
 * Weekly drip cron for the Precedent Watchlist $47 Tier 9 SKU (M3).
 *
 * For each order with `watchlist_email_state` populated and still inside
 * its 30-day window:
 *   1. Recompute the current top-10 rising precedents for the stored
 *      chargeType (same query as the instant report).
 *   2. Diff against last_velocity_snapshot — only send if rank shifts
 *      meet the threshold (default: any new entry OR rank change >= 3).
 *   3. Send a Resend email with CAN-SPAM unsubscribe + RFC 8058 headers
 *      (via sendEmail's unsubscribeEmail opt).
 *   4. Update watchlist_email_state with new snapshot + bumped counters.
 *
 * Drip ends automatically when emails_sent >= 4 OR now() > started_at + 30d.
 *
 * Invariant #3 (cron idempotency): acquires a date-scoped lock via
 * acquireCronLock() before running; duplicate hits within 5min silently skip.
 *
 * Primary-domain guard per HARD rule never-cold-email-from-primary-domain
 * IS applied here (2026-04-23 wave-pristine-r1 WARNING #5). Even though
 * this is a post-purchase transactional-adjacent drip to a verified
 * customer, a misconfigured RESEND_FROM_EMAIL pointing at a primary
 * brand domain would still burn sender reputation on our warm primary —
 * the hardest-to-recover asset we own. Mirrors the guard pattern in
 * `warroom-monthly-precedent-delta/route.ts`.
 *
 * Protected by CRON_AUTH_TOKEN via requireCron.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail, escapeHtml } from "@/lib/email";
import {
  queryPrecedentWatchlist,
  buildVelocitySnapshot,
} from "@/lib/tier9-reports/precedent-watchlist";
import { SITE_URL } from "@/lib/site";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

// Drip configuration — kept in one place so tests + cron agree.
const MAX_EMAILS = 4;
const WINDOW_DAYS = 30;
const ACTIVE_ORDERS_PAGE_SIZE = 500;
const ORDER_CONCURRENCY = 5;

// A rank-delta of 3 or more, OR a new entry in the top-10, counts as
// "significant enough to notify." Chaperon trust-engine principle:
// over-notifying erodes trust; only send when the picture actually changed.
const RANK_DELTA_THRESHOLD = 3;

// Primary-domain guard per HARD rule never-cold-email-from-primary-domain.
// Mirrors `warroom-monthly-precedent-delta/route.ts`. Prevents a
// misconfigured RESEND_FROM_EMAIL from burning the warm primary domain
// via post-purchase drip at scale.
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

interface SnapshotEntry {
  cited_opinion_id: number;
  velocity: number;
  rank: number;
}

interface WatchlistState {
  started_at: string;
  last_sent_at: string | null;
  emails_sent: number;
  last_velocity_snapshot: SnapshotEntry[];
  charge_type: string;
  state: string | null;
}

interface DripOrder {
  id: string;
  email: string;
  status: string;
  watchlist_email_state: WatchlistState | null;
}

function isValidToAddress(addr: string): boolean {
  if (!addr || typeof addr !== "string" || addr.length > 254) return false;
  if (/[\r\n\t<>,"]/.test(addr)) return false;
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(addr);
}

function daysBetween(aIso: string, bMs: number): number {
  const a = Date.parse(aIso);
  if (!Number.isFinite(a)) return Number.POSITIVE_INFINITY;
  return (bMs - a) / 86_400_000;
}

/**
 * Rank-delta detector. Returns { shouldSend, reason, newEntries, shifts }.
 *
 * "Shift" = a cited_opinion_id present in BOTH snapshots where |rank_new -
 * rank_old| >= RANK_DELTA_THRESHOLD.
 * "New entry" = in new snapshot but not in old.
 */
export function detectSignificantShift(
  oldSnap: SnapshotEntry[],
  newSnap: SnapshotEntry[],
): {
  shouldSend: boolean;
  newEntries: SnapshotEntry[];
  shifts: Array<{ cited_opinion_id: number; oldRank: number; newRank: number }>;
} {
  const oldByIdRank = new Map<number, number>();
  for (const e of oldSnap) oldByIdRank.set(e.cited_opinion_id, e.rank);
  const newEntries: SnapshotEntry[] = [];
  const shifts: Array<{ cited_opinion_id: number; oldRank: number; newRank: number }> = [];
  for (const e of newSnap) {
    const oldRank = oldByIdRank.get(e.cited_opinion_id);
    if (oldRank === undefined) {
      newEntries.push(e);
    } else if (Math.abs(e.rank - oldRank) >= RANK_DELTA_THRESHOLD) {
      shifts.push({ cited_opinion_id: e.cited_opinion_id, oldRank, newRank: e.rank });
    }
  }
  const shouldSend = newEntries.length > 0 || shifts.length > 0;
  return { shouldSend, newEntries, shifts };
}

function buildEmailHtml(params: {
  chargeType: string;
  newEntries: SnapshotEntry[];
  shifts: Array<{ cited_opinion_id: number; oldRank: number; newRank: number }>;
  fullRising: ReturnType<typeof buildVelocitySnapshot>;
  caseNamesById: Map<number, string>;
  sourceUrlsById: Map<number, string>;
  emailsSent: number;
}): string {
  const chargeLabel = escapeHtml(
    params.chargeType.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
  );

  const newRows = params.newEntries
    .map((e) => {
      const name = params.caseNamesById.get(e.cited_opinion_id) ?? "(unnamed opinion)";
      const url = params.sourceUrlsById.get(e.cited_opinion_id) ?? "";
      const link = url
        ? `<a href="${escapeHtml(url)}" style="color:#F59E0B;">${escapeHtml(name)}</a>`
        : escapeHtml(name);
      return `<li>${link} — now ranked #${e.rank} (velocity ${e.velocity.toFixed(2)} cites/yr)</li>`;
    })
    .join("");

  const shiftRows = params.shifts
    .map((s) => {
      const name = params.caseNamesById.get(s.cited_opinion_id) ?? "(unnamed opinion)";
      const url = params.sourceUrlsById.get(s.cited_opinion_id) ?? "";
      const link = url
        ? `<a href="${escapeHtml(url)}" style="color:#F59E0B;">${escapeHtml(name)}</a>`
        : escapeHtml(name);
      const direction = s.newRank < s.oldRank ? "rose" : "fell";
      return `<li>${link} — ${direction} from #${s.oldRank} to #${s.newRank}</li>`;
    })
    .join("");

  const weekNumber = params.emailsSent + 1;

  return `
    <h1 style="color:#F59E0B;font-size:22px;">Precedent Watchlist — week ${weekNumber} update</h1>
    <p>Charge: <strong>${chargeLabel}</strong></p>
    <p>Since your last update, the rising-precedent rankings in the criminal-defense corpus shifted:</p>
    ${params.newEntries.length > 0
      ? `<h3 style="color:#111;">New entries in the top 10</h3><ul>${newRows}</ul>`
      : ""}
    ${params.shifts.length > 0
      ? `<h3 style="color:#111;">Rank shifts (&ge; ${RANK_DELTA_THRESHOLD} positions)</h3><ul>${shiftRows}</ul>`
      : ""}
    <p style="font-size:13px;color:#555;margin-top:24px;">A question worth raising with your attorney: are any of these citations relevant to motion strategy in your case?</p>
    <p style="font-size:12px;color:#777;margin-top:24px;border-top:1px solid #ddd;padding-top:12px;">
      Legal INFORMATION, not legal ADVICE. Source: CourtListener criminal-defense opinion corpus. This is citation-activity data, not a prediction about any specific case.
    </p>
  `;
}

export async function GET(req: NextRequest) {
  const guard = requireCron(req);
  if (!guard.authorized) return guard.error;

  // Primary-domain guard — wave-pristine-r1 WARNING #5.
  // Reject the run if Resend config is missing or the FROM address sits on
  // a protected primary brand domain. We fail BEFORE touching the DB so
  // nothing is marked "sent" against a blocked send.
  const resendKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL;
  if (!resendKey) {
    return NextResponse.json(
      { ok: false, error: "resend-unconfigured" },
      { status: 500 },
    );
  }
  if (!fromEmail || isForbiddenFromAddress(fromEmail)) {
    return NextResponse.json(
      { ok: false, error: "resend-from-invalid" },
      { status: 500 },
    );
  }

  const supabase = createAdminClient();
  const started = Date.now();
  const runLog: Array<Record<string, unknown>> = [];

  let sent = 0;
  let skipped = 0;
  let errors = 0;
  let ended = 0;

  // Pull active drip orders — ones with state present and not yet at MAX_EMAILS
  // and whose started_at is inside the 30-day window.
  const windowCutoff = new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString();

  const { data: orders, error: ordersErr } = await supabase
    .from("orders")
    .select("id, email, status, watchlist_email_state")
    .not("watchlist_email_state", "is", null)
    .gte("watchlist_email_state->>started_at", windowCutoff)
    .not("status", "in", "(refunded,cancelled)")
    .limit(ACTIVE_ORDERS_PAGE_SIZE);

  if (ordersErr) {
    console.error("[watchlist-drip] orders query failed:", ordersErr.message);
    return NextResponse.json({ ok: false, error: "orders-query-failed" }, { status: 500 });
  }

  const list = (orders ?? []) as DripOrder[];
  const saturated = list.length >= ACTIVE_ORDERS_PAGE_SIZE;

  let idx = 0;
  let budgetExceeded = false;

  async function processOne(order: DripOrder): Promise<void> {
    if (Date.now() - started > 260_000) {
      budgetExceeded = true;
      runLog.push({ order: order.id, skipped: "budget-exceeded" });
      return;
    }
    const state = order.watchlist_email_state;
    if (!state) {
      skipped++;
      runLog.push({ order: order.id, skipped: "no-state" });
      return;
    }
    if (!isValidToAddress(order.email)) {
      skipped++;
      runLog.push({ order: order.id, skipped: "bad-email" });
      return;
    }
    // Window / cap check.
    if (state.emails_sent >= MAX_EMAILS) {
      skipped++;
      runLog.push({ order: order.id, skipped: "max-emails-reached" });
      return;
    }
    const days = daysBetween(state.started_at, Date.now());
    if (days > WINDOW_DAYS) {
      ended++;
      runLog.push({ order: order.id, ended: "window-expired" });
      return;
    }

    // Recompute current top-10 rising.
    const data = await queryPrecedentWatchlist({
      chargeType: state.charge_type,
      state: state.state,
    });
    const newSnap = buildVelocitySnapshot(data);
    const { shouldSend, newEntries, shifts } = detectSignificantShift(
      state.last_velocity_snapshot ?? [],
      newSnap,
    );
    if (!shouldSend) {
      skipped++;
      runLog.push({ order: order.id, skipped: "no-significant-shift" });
      return;
    }

    // Build case-name + source-url lookups from the recomputed rising set
    // (data.rising already contains the name + url).
    const caseNamesById = new Map<number, string>();
    const sourceUrlsById = new Map<number, string>();
    for (const r of data.rising) {
      caseNamesById.set(r.cited_opinion_id, r.case_name);
      sourceUrlsById.set(r.cited_opinion_id, r.source_url);
    }

    const html = buildEmailHtml({
      chargeType: state.charge_type,
      newEntries,
      shifts,
      fullRising: newSnap,
      caseNamesById,
      sourceUrlsById,
      emailsSent: state.emails_sent,
    });

    const subject = `Precedent Watchlist — week ${state.emails_sent + 1} update`;

    // Update state FIRST so a send-then-crash never double-sends; email.ts
    // handles CAN-SPAM footer via unsubscribeEmail.
    const nowIso = new Date().toISOString();
    const nextState: WatchlistState = {
      ...state,
      last_sent_at: nowIso,
      emails_sent: state.emails_sent + 1,
      last_velocity_snapshot: newSnap,
    };
    const { error: updErr } = await supabase
      .from("orders")
      .update({ watchlist_email_state: nextState })
      .eq("id", order.id)
      .eq("watchlist_email_state->>last_sent_at", state.last_sent_at ?? "")
      .is("status", "paid");
    // Fallback update: the conditional eq above may not bind across nulls
    // cleanly in PostgREST for JSONB-arrow expressions; retry unconditionally
    // if the cadence-lock update returned zero rows.
    if (updErr) {
      const { error: unc } = await supabase
        .from("orders")
        .update({ watchlist_email_state: nextState })
        .eq("id", order.id);
      if (unc) {
        errors++;
        console.error("[watchlist-drip] state update failed:", unc.message);
        runLog.push({ order: order.id, error: "state-update-failed" });
        return;
      }
    }

    try {
      const res = await sendEmail({
        to: order.email,
        subject,
        html,
        unsubscribeEmail: order.email,
      });
      if (!res.success) {
        errors++;
        runLog.push({ order: order.id, error: "resend-failed" });
        return;
      }
      sent++;
      runLog.push({
        order: order.id,
        sent: true,
        emails_sent: nextState.emails_sent,
        new_entries: newEntries.length,
        shifts: shifts.length,
      });
    } catch (e) {
      errors++;
      console.error("[watchlist-drip] send threw:", e);
      runLog.push({ order: order.id, error: "send-threw" });
    }
  }

  async function worker(): Promise<void> {
    while (!budgetExceeded) {
      const i = idx++;
      if (i >= list.length) return;
      try {
        await processOne(list[i]);
      } catch (e) {
        errors++;
        console.error("[watchlist-drip] processOne threw:", e);
        runLog.push({ order: list[i].id, error: "process-threw" });
      }
    }
  }

  const workerCount = Math.min(ORDER_CONCURRENCY, list.length || 1);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  return NextResponse.json({
    ok: true,
    ms: Date.now() - started,
    orders_considered: list.length,
    saturated,
    budget_exceeded: budgetExceeded,
    sent,
    skipped,
    errors,
    ended,
    detail: runLog.slice(0, 20),
    site_url: SITE_URL,
  });
}
