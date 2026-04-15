/**
 * GET /api/cron/sms-health-check — Daily SMS gateway health probe.
 *
 * Schedule: Daily at 10:00 America/New_York via cron-job.org (jobId 7485383).
 * Protected by CRON_AUTH_TOKEN bearer token.
 *
 * Sends a test SMS to Rahim's number via text.email gateway,
 * logs to sms_log, and alerts via Telegram on failure.
 * Also checks recent sms_log success rate — alerts if below 80%.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/auth/guards";
import { acquireCronLock, releaseCronLock } from "@/lib/cron-idempotency";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendSMS } from "@/lib/sms";

const TEST_PHONE = "+16504846374";
const SUCCESS_RATE_THRESHOLD = 0.8;
const LOOKBACK_DAYS = 7;

export async function GET(req: NextRequest) {
  const auth = requireCron(req);
  if (!auth.authorized) return auth.error;

  const lock = await acquireCronLock("sms-health-check", 23 * 60 * 60 * 1000); // 23-hour lockout
  if (!lock.shouldRun) {
    return NextResponse.json({ skipped: true, reason: lock.reason });
  }

  const supabase = createAdminClient();
  const alerts: string[] = [];

  try {
    // Layer 1: Send test SMS
    const testResult = await sendSMS(
      TEST_PHONE,
      `INAA SMS health check — ${new Date().toISOString().slice(0, 10)}`,
      { category: "health_check" }
    );

    if (!testResult.success) {
      alerts.push(`Test SMS FAILED: ${testResult.error}`);
    }

    // Layer 2: Check recent success rate from sms_log
    const cutoff = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const { data: recentLogs } = await supabase
      .from("sms_log")
      .select("success")
      .gte("created_at", cutoff)
      .neq("category", "health_check");

    if (recentLogs && recentLogs.length > 0) {
      const successCount = recentLogs.filter((r) => r.success).length;
      const rate = successCount / recentLogs.length;

      if (rate < SUCCESS_RATE_THRESHOLD) {
        alerts.push(
          `SMS success rate ${(rate * 100).toFixed(1)}% (${successCount}/${recentLogs.length}) — below ${SUCCESS_RATE_THRESHOLD * 100}% threshold`
        );
      }
    }

    // Layer 3: Check for @text.email bounces in Resend (via email_log)
    const { data: bounces } = await supabase
      .from("email_log")
      .select("recipient, error_message")
      .ilike("recipient", "%@text.email")
      .eq("success", false)
      .gte("created_at", cutoff)
      .limit(10);

    if (bounces && bounces.length > 0) {
      alerts.push(`${bounces.length} text.email bounce(s) in past ${LOOKBACK_DAYS}d`);
    }

    // Send Telegram alert if any issues
    if (alerts.length > 0) {
      await sendTelegramAlert(alerts);
    }

    await releaseCronLock(lock.executionId!, "completed");

    return NextResponse.json({
      ok: alerts.length === 0,
      testSms: testResult.success ? "sent" : testResult.error,
      recentLogs: recentLogs?.length ?? 0,
      bounces: bounces?.length ?? 0,
      alerts,
    });
  } catch (err) {
    await releaseCronLock(lock.executionId!, "failed");
    const msg = err instanceof Error ? err.message : "Unknown error";
    await sendTelegramAlert([`SMS health check CRASHED: ${msg}`]);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

async function sendTelegramAlert(alerts: string[]): Promise<void> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN_LEGAL;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!botToken || !chatId) {
    console.error("[SMS Health] Telegram not configured — alerts:", alerts);
    return;
  }

  const text = `SMS Health Alert\n\n${alerts.map((a) => `- ${a}`).join("\n")}`;

  try {
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
  } catch (err) {
    console.error("[SMS Health] Telegram send failed:", err);
  }
}
