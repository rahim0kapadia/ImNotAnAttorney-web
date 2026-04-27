/**
 * POST /api/cron/scrub-plaintext-tokens
 *
 * Hourly cron route that NULLs expired plaintext intake / report tokens on the
 * orders table. Registered in cron-job.org at minute 30 of every hour.
 *
 * Plan: docs/plans/2026-04-27-immediate-download-v2.md §3.1 row 2, Task 6
 *
 * Threat model (IDv2-2026-04-27):
 *   Plaintext tokens are written to `standalone_intake_token` and
 *   `standalone_report_token_plaintext` for up to 30 minutes after purchase to
 *   support the in-page CTA on the success page. After that window, they are
 *   scrubbed here so the DB returns to hash-only state for >99% of order rows.
 *
 *   Defensive WHERE clause: ONLY rows where plaintext_tokens_expires_at IS NOT
 *   NULL AND < NOW() are touched. Future-expiry rows are never nulled early.
 *
 * Lock: 50-minute idempotency window (vs 60-minute cron cadence) prevents
 * overlapping runs on slow serverless cold-starts.
 *
 * Emergency response: scripts/scrub-plaintext-tokens.mjs runs the same SQL
 * on demand without requiring the HTTP route.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";
import { acquireCronLock, releaseCronLock } from "@/lib/cron-idempotency";

const LOCK_ID = "scrub-plaintext-tokens";
const LOCK_TTL_MS = 50 * 60 * 1000; // 50 min lock vs 60 min cadence

export async function POST(req: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const auth = requireCron(req);
  if (!auth.authorized) return auth.error;

  // ── Idempotency lock ──────────────────────────────────────────────────────
  const lock = await acquireCronLock(LOCK_ID, LOCK_TTL_MS);
  if (!lock.shouldRun) {
    return NextResponse.json({ skipped: true, reason: lock.reason }, { status: 200 });
  }

  const supabase = createAdminClient();

  try {
    // Defensive UPDATE: only NULL plaintext fields when expires_at is in the
    // past AND is not already NULL. This prevents accidentally nulling rows
    // that were written mid-request with a future expires_at.
    const { data, error } = await supabase
      .from("orders")
      .update({
        standalone_intake_token: null,
        standalone_report_token_plaintext: null,
        plaintext_tokens_expires_at: null,
      })
      .lt("plaintext_tokens_expires_at", new Date().toISOString())
      .not("plaintext_tokens_expires_at", "is", null)
      .select("id"); // returns the scrubbed rows so we can count them

    if (error) {
      console.error("[scrub-plaintext-tokens] DB update error:", error);
      await releaseCronLock(lock.executionId, "failed");
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const scrubbed = data?.length ?? 0;
    console.log(`[scrub-plaintext-tokens] scrubbed ${scrubbed} order rows`);

    await releaseCronLock(lock.executionId, "completed");
    return NextResponse.json({ scrubbed });
  } catch (err) {
    console.error("[scrub-plaintext-tokens] Unexpected error:", err);
    await releaseCronLock(lock.executionId, "failed");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// Some cron-job.org configs send GET; mirror POST behavior.
export const GET = POST;
