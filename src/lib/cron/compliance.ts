/**
 * @file Parts 7, 8, 13, 14 — Cleanup / compliance tasks
 *
 * Part 7:  Abandoned intake cleanup (E5) — delete intakes > 90 days with no case
 * Part 8:  Rate limit table cleanup (E7) — remove expired entries
 * Part 13: Drip email send log cleanup (Privacy Policy S6) — purge > 90 days
 * Part 14: Discovery document auto-deletion (Privacy Policy S4) — delete files > 90 days
 */

import type { CronContext, CronResult } from "./types";
import { emptyResult } from "./types";

// ============================================================
// PART 7: ABANDONED INTAKE CLEANUP (E5)
// ============================================================
// N+1 FIX: Batch-fetch all cases for intake emails instead of
// per-intake lookups.

export async function cleanupAbandonedIntakes(ctx: CronContext): Promise<CronResult> {
  const result = emptyResult();

  const ninetyDaysAgo = new Date(ctx.now);
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const { data: oldIntakes } = await ctx.supabase
    .from("intakes")
    .select("id, email")
    .lt("created_at", ninetyDaysAgo.toISOString());

  if (oldIntakes && oldIntakes.length > 0) {
    // N+1 FIX: Batch-fetch all cases for these intake emails
    const intakeEmails = [...new Set(oldIntakes.map((i) => i.email.toLowerCase()))];
    const { data: casesWithEmails } = await ctx.supabase
      .from("cases")
      .select("email")
      .in("email", intakeEmails);

    const emailsWithCases = new Set(
      (casesWithEmails ?? []).map((c: { email: string }) => c.email.toLowerCase())
    );

    // Filter to intakes that have no corresponding case
    const toDelete = oldIntakes.filter((i) => !emailsWithCases.has(i.email.toLowerCase()));

    if (toDelete.length > 0) {
      const deleteIds = toDelete.map((i) => i.id);
      const { count } = await ctx.supabase
        .from("intakes")
        .delete({ count: "exact" })
        .in("id", deleteIds);

      result.cleaned += count ?? 0;
    }
  }

  return result;
}

// ============================================================
// PART 8: RATE LIMIT TABLE CLEANUP (E7)
// ============================================================

export async function cleanupRateLimits(ctx: CronContext): Promise<CronResult> {
  const result = emptyResult();

  await ctx.supabase.rpc("cleanup_rate_limits", { p_max_age_seconds: 3600 });

  return result;
}

// ============================================================
// PART 13: DRIP EMAIL SEND LOG CLEANUP (Privacy Policy S6)
// ============================================================

export async function cleanupDripEmailLogs(ctx: CronContext): Promise<CronResult> {
  const result = emptyResult();

  const dripCutoff = new Date(ctx.now);
  dripCutoff.setDate(dripCutoff.getDate() - 90);

  // Only purge dedup records for unsubscribed subscribers to preserve
  // idempotency for active ones. Without this guard, active subscribers
  // would get day-1 emails re-sent after 90 days.
  const { data: unsubscribedSubs } = await ctx.supabase
    .from("subscribers")
    .select("id")
    .not("unsubscribed_at", "is", null);

  if (unsubscribedSubs && unsubscribedSubs.length > 0) {
    const unsubIds = unsubscribedSubs.map((s: { id: string }) => s.id);
    const { count: dripPurged } = await ctx.supabase
      .from("drip_emails")
      .delete({ count: "exact" })
      .lt("created_at", dripCutoff.toISOString())
      .in("subscriber_id", unsubIds);

    if (dripPurged && dripPurged > 0) {
      console.log(`[Drip Cron] Part 13: Purged ${dripPurged} old drip_emails records (unsubscribed only)`);
      result.cleaned += dripPurged;
    }
  }

  return result;
}

// ============================================================
// PART 14: DISCOVERY DOCUMENT AUTO-DELETION (Privacy Policy S4)
// ============================================================

export async function cleanupDiscoveryDocuments(ctx: CronContext): Promise<CronResult> {
  const result = emptyResult();

  const ninetyDaysAgo = new Date(ctx.now);
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const { data: expiredDiscovery } = await ctx.supabase
    .from("cases")
    .select("id, file_urls")
    .eq("status", "delivered")
    .lt("delivered_at", ninetyDaysAgo.toISOString())
    .not("file_urls", "eq", "{}");

  if (expiredDiscovery && expiredDiscovery.length > 0) {
    for (const c of expiredDiscovery) {
      if (!c.file_urls || c.file_urls.length === 0) continue;

      const { error: removeError } = await ctx.supabase.storage
        .from("discovery-files")
        .remove(c.file_urls);

      if (removeError) {
        console.error(`[Drip Cron] Part 14: Failed to delete files for case ${c.id}:`, removeError);
        result.errors++;
        continue;
      }

      await ctx.supabase
        .from("cases")
        .update({ file_urls: [] })
        .eq("id", c.id);

      result.cleaned += c.file_urls.length;
      console.log(`[Drip Cron] Part 14: Deleted ${c.file_urls.length} discovery files for case ${c.id}`);
    }
  }

  return result;
}
