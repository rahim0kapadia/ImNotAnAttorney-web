/**
 * @file Parts 7, 8, 13, 14, Cleanup / compliance tasks
 *
 * Part 7:  Abandoned intake cleanup (E5), delete intakes > 90 days with no case
 * Part 8:  Rate limit table cleanup (E7), remove expired entries
 * Part 13: Drip email send log cleanup (Privacy Policy S6), purge > 90 days
 * Part 14: Discovery document auto-deletion (Privacy Policy S4), delete files > 90 days
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
    .select("id")
    .lt("created_at", ninetyDaysAgo.toISOString())
    .limit(500);

  if (oldIntakes && oldIntakes.length > 0) {
    // Check which intakes have a case pointing at them via FK
    const intakeIds = oldIntakes.map((i) => i.id);
    const { data: casesWithIntakes } = await ctx.supabase
      .from("cases")
      .select("intake_id")
      .in("intake_id", intakeIds);

    const intakeIdsWithCases = new Set(
      (casesWithIntakes ?? []).map((c: { intake_id: string }) => c.intake_id)
    );

    // Delete intakes that no case references (FK-based, not email-based)
    const toDelete = oldIntakes.filter((i) => !intakeIdsWithCases.has(i.id));

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
    .not("unsubscribed_at", "is", null)
    .limit(500);

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
    .not("file_urls", "eq", "{}")
    .limit(50);

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

// ============================================================
// PART 15: CRON EXECUTIONS TABLE CLEANUP
// ============================================================
// Prevent unbounded growth of cron_executions (1 row per cron run).
// Keep 30 days for debugging, delete older rows.

export async function cleanupCronExecutions(ctx: CronContext): Promise<CronResult> {
  const result = emptyResult();

  const thirtyDaysAgo = new Date(ctx.now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const { count } = await ctx.supabase
    .from("cron_executions")
    .delete({ count: "exact" })
    .lt("started_at", thirtyDaysAgo.toISOString());

  if (count && count > 0) {
    console.log(`[Cron] Part 15: Purged ${count} old cron_executions records`);
    result.cleaned += count;
  }

  return result;
}
