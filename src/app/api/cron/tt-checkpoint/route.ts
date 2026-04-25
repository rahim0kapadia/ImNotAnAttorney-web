/**
 * @file /api/cron/tt-checkpoint — Weekly TikTok 2026-07-23 gate check.
 *
 * Computes the three APEX-W2 hard gates and Telegram-alerts on
 * threshold crossings:
 *   Gate A: >=50 /score completions attributable to YT or X within last
 *           90d AND >=1 paid conversion within same window.
 *   Gate B: zero unresolved content-removal strikes on YT or X in 90d.
 *   Gate C: cached .01% expert for tt-legal triangulated within last 90d
 *           (refreshed by a separate quarterly cron — this route only
 *           reads gate_c_last_triangulated_at).
 *
 * Updates tt_checkpoint_state singleton + sends a single Gate-A alert
 * the first time the threshold is crossed (gate_a_alert_sent_at gates
 * repeat alerts).
 *
 * Auth: requireCron (Bearer CRON_AUTH_TOKEN).
 * Schedule: weekly Mon 17:00 UTC via cron-job.org (registered by
 * scripts/register-tt-checkpoint-cron.mjs).
 */
import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 60;

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;
const GATE_A_THRESHOLD = 50;
// Gate A YT/X attribution buckets — matches the score_completions
// CHECK constraint values. Keep "twitter_x" alongside "x" until the
// schema settles on one of them across the codebase.
const GATE_A_PLATFORMS = ["youtube", "x", "twitter_x"] as const;

async function sendTelegram(message: string): Promise<void> {
  const token = process.env.TELEGRAM_ATLAS_BOT_TOKEN;
  const chat = process.env.TELEGRAM_RAHIM_CHAT_ID;
  if (!token || !chat) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chat, text: message, parse_mode: "Markdown" }),
    });
  } catch {
    /* swallow — Telegram failure must not break the cron itself */
  }
}

interface GateState {
  gate_a_first_passed_at: string | null;
  gate_a_alert_sent_at: string | null;
  gate_b_last_strike_at: string | null;
  gate_c_last_triangulated_at: string | null;
  last_run_count_youtube: number;
  last_run_count_x: number;
  last_run_paid_conversions: number;
  last_run_strikes_unresolved: number;
}

export async function GET(req: NextRequest) {
  const authed = requireCron(req);
  if (!authed.authorized) return authed.error;

  const started = Date.now();
  const supabase = createAdminClient();
  const since = new Date(Date.now() - NINETY_DAYS_MS).toISOString();

  // --- Gate A counts -----------------------------------------------------
  const countAttribution = async (sources: string[]): Promise<number> => {
    const { count, error } = await supabase
      .from("score_completions")
      .select("id", { count: "exact", head: true })
      .in("attribution_source", sources)
      .gte("created_at", since);
    if (error) throw new Error(`score_completions count failed: ${error.message}`);
    return count ?? 0;
  };

  let countYoutube = 0;
  let countX = 0;
  let strikesUnresolved = 0;
  try {
    countYoutube = await countAttribution(["youtube"]);
    countX = await countAttribution(["x", "twitter_x"]);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
  const totalAttributed = countYoutube + countX;

  // --- Paid conversions (v1: 0 placeholder until orders.attribution_source
  // is wired in a follow-up). Documented in the handoff. ------------------
  const paidConversions = 0;

  // --- Gate B: unresolved strikes on YT or X in window -------------------
  try {
    const { count, error } = await supabase
      .from("content_removal_incidents")
      .select("id", { count: "exact", head: true })
      .in("platform", ["youtube", "x", "twitter_x"])
      .gte("occurred_at", since)
      .is("resolved_at", null);
    if (error) throw new Error(`content_removal_incidents count failed: ${error.message}`);
    strikesUnresolved = count ?? 0;
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }

  // --- Read prior state to detect transitions ----------------------------
  const { data: priorRaw, error: priorErr } = await supabase
    .from("tt_checkpoint_state")
    .select(
      "gate_a_first_passed_at, gate_a_alert_sent_at, gate_b_last_strike_at, gate_c_last_triangulated_at, last_run_count_youtube, last_run_count_x, last_run_paid_conversions, last_run_strikes_unresolved",
    )
    .eq("id", 1)
    .maybeSingle();
  if (priorErr) {
    return NextResponse.json({ error: `tt_checkpoint_state read: ${priorErr.message}` }, { status: 500 });
  }
  const prior: GateState = priorRaw ?? {
    gate_a_first_passed_at: null,
    gate_a_alert_sent_at: null,
    gate_b_last_strike_at: null,
    gate_c_last_triangulated_at: null,
    last_run_count_youtube: 0,
    last_run_count_x: 0,
    last_run_paid_conversions: 0,
    last_run_strikes_unresolved: 0,
  };

  const now = new Date().toISOString();
  const gateAThresholdMet = totalAttributed >= GATE_A_THRESHOLD;
  const gateAFullyPassed = gateAThresholdMet && paidConversions >= 1;
  const newGateAFirstPass = gateAFullyPassed && prior.gate_a_first_passed_at == null;
  const shouldAlertGateA = gateAThresholdMet && prior.gate_a_alert_sent_at == null;
  const gateBNewStrike = strikesUnresolved > prior.last_run_strikes_unresolved;

  // --- Telegram on threshold cross ---------------------------------------
  const alerts: string[] = [];
  if (shouldAlertGateA) {
    alerts.push(
      [
        `*TT-checkpoint Gate A:* threshold crossed`,
        `90-day completions: youtube=${countYoutube}, x=${countX} (total=${totalAttributed} >= ${GATE_A_THRESHOLD})`,
        `Paid conversions in window: ${paidConversions} (need >=1 for full pass)`,
        `2026-07-23 deadline: ${Math.max(0, Math.ceil((Date.parse("2026-07-23") - Date.now()) / 86400000))} days`,
      ].join("\n"),
    );
  }
  if (gateBNewStrike) {
    alerts.push(
      [
        `*TT-checkpoint Gate B:* new strike(s)`,
        `Unresolved strikes (YT/X, 90d): ${strikesUnresolved} (was ${prior.last_run_strikes_unresolved})`,
        `Run: SELECT * FROM content_removal_incidents WHERE platform IN ('youtube','x','twitter_x') AND occurred_at >= now() - interval '90 days' AND resolved_at IS NULL ORDER BY occurred_at DESC;`,
      ].join("\n"),
    );
  }
  if (alerts.length > 0) {
    await sendTelegram(alerts.join("\n\n"));
  }

  // --- Persist new state -------------------------------------------------
  const update: Record<string, unknown> = {
    last_run_at: now,
    last_run_count_youtube: countYoutube,
    last_run_count_x: countX,
    last_run_paid_conversions: paidConversions,
    last_run_strikes_unresolved: strikesUnresolved,
  };
  if (newGateAFirstPass) update.gate_a_first_passed_at = now;
  if (shouldAlertGateA) update.gate_a_alert_sent_at = now;
  if (gateBNewStrike) update.gate_b_last_strike_at = now;

  const { error: updErr } = await supabase
    .from("tt_checkpoint_state")
    .update(update)
    .eq("id", 1);
  if (updErr) {
    return NextResponse.json({ error: `tt_checkpoint_state update: ${updErr.message}` }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    checked_at: now,
    window_start: since,
    gate_a: {
      threshold: GATE_A_THRESHOLD,
      youtube_completions_90d: countYoutube,
      x_completions_90d: countX,
      total_attributed: totalAttributed,
      paid_conversions_90d: paidConversions,
      threshold_met: gateAThresholdMet,
      fully_passed: gateAFullyPassed,
      first_passed_at: newGateAFirstPass ? now : prior.gate_a_first_passed_at,
      alerted: shouldAlertGateA,
    },
    gate_b: {
      strikes_unresolved_90d: strikesUnresolved,
      new_strike_since_last_run: gateBNewStrike,
      last_strike_at: gateBNewStrike ? now : prior.gate_b_last_strike_at,
    },
    gate_c: {
      last_triangulated_at: prior.gate_c_last_triangulated_at,
      stale: prior.gate_c_last_triangulated_at == null
        || Date.parse(prior.gate_c_last_triangulated_at) < Date.now() - NINETY_DAYS_MS,
    },
    deadline: "2026-07-23",
    elapsed_ms: Date.now() - started,
  });
}
