/**
 * @file Parts 17, 18, 19 — Monitoring and reporting
 *
 * Part 17: SLA breach detection (delivery_due_at passed)
 * Part 18: Weekly progress emails (War Room + Situation Room)
 * Part 19: Engine heartbeat (stale queued jobs -> operator alert)
 */

import { sendEmail, sendEmailWithRetry, escapeHtml } from "@/lib/email";
import { tierDisplayName } from "@/lib/tiers";
import { caseThreadId } from "@/lib/site";
import type { CronContext, CronResult } from "./types";
import { emptyResult } from "./types";

// ============================================================
// PART 17: SLA BREACH DETECTION (delivery_due_at passed)
// ============================================================

export async function detectSLABreaches(ctx: CronContext): Promise<CronResult> {
  const result = emptyResult();

  const { data: slaCases } = await ctx.supabase
    .from("cases")
    .select("id, email, tier, delivery_due_at")
    .lt("delivery_due_at", ctx.now.toISOString())
    .not("status", "in", '("delivered","refunded")');

  if (slaCases && slaCases.length > 0) {
    for (const slaCase of slaCases) {
      // Dedup: check if an open sla_breach task already exists for this case
      const { data: existingTask } = await ctx.supabase
        .from("operator_tasks")
        .select("id")
        .eq("case_id", slaCase.id)
        .eq("task_type", "sla_breach")
        .in("status", ["open", "in_progress"])
        .maybeSingle();

      if (existingTask) continue;

      const hoursOverdue = Math.round(
        (ctx.now.getTime() - new Date(slaCase.delivery_due_at!).getTime()) / (1000 * 60 * 60)
      );
      const tierLabel = tierDisplayName(slaCase.tier);

      await ctx.supabase.from("operator_tasks").insert({
        case_id: slaCase.id,
        task_type: "sla_breach",
        title: `SLA BREACH: ${tierLabel} overdue by ${hoursOverdue}h — ${slaCase.email}`,
        description: `Delivery was due ${new Date(slaCase.delivery_due_at!).toISOString()} (${hoursOverdue} hours ago). Customer: ${slaCase.email}`,
        priority: "URGENT",
        priority_rank: 1,
        sla_breach: true,
        due_at: ctx.now.toISOString(),
      });

      await sendEmail({
        to: ctx.operatorEmail,
        subject: `SLA BREACH: ${tierLabel} overdue by ${hoursOverdue} hours — ${escapeHtml(slaCase.email)}`,
        html: `<h1 style="color: #EF4444;">SLA Breach — Delivery Overdue</h1>
          <p>This case has exceeded its delivery deadline by <strong style="color: #EF4444;">${hoursOverdue} hours</strong>.</p>
          <div style="background: #1C1917; padding: 24px; border-radius: 12px; margin: 16px 0; border-left: 4px solid #EF4444;">
            <p style="margin: 0; color: #D4D4D8;"><strong style="color: white;">Customer:</strong> ${escapeHtml(slaCase.email)}</p>
            <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Tier:</strong> ${escapeHtml(tierLabel)}</p>
            <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Due:</strong> ${new Date(slaCase.delivery_due_at!).toISOString()}</p>
            <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Overdue:</strong> ${hoursOverdue} hours</p>
            <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Case ID:</strong> ${slaCase.id}</p>
          </div>
          <p><strong>Action:</strong> Prioritize this case immediately. Contact the customer if delivery will be further delayed.</p>`,
      }, { category: "operator-alert", case_id: slaCase.id, metadata: { reason: "sla-breach", hours_overdue: hoursOverdue } });

      result.errors++;
    }
    console.log(`[Drip Cron] Part 17: Detected ${slaCases.length} SLA breach(es)`);
  }

  return result;
}

// ============================================================
// PART 18: WEEKLY PROGRESS EMAIL (War Room + Situation Room)
// ============================================================

/** Compute ISO 8601 week number for dedup key. */
function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

export async function sendWeeklyProgressEmails(ctx: CronContext): Promise<CronResult> {
  const result = emptyResult();

  const weeklyTiers = ["war-room", "situation-room"];
  const weeklyStatuses = ["submitted", "processing", "review"];
  const { data: weeklyCases } = await ctx.supabase
    .from("cases")
    .select("id, email, tier, report_token, document_count, finding_count, witness_count, discovery_health_score")
    .in("tier", weeklyTiers)
    .in("status", weeklyStatuses);

  if (weeklyCases && weeklyCases.length > 0) {
    const weekNumber = getISOWeek(ctx.now);

    // Batch-fetch subscribers and dedup records to avoid N+1 queries
    const weeklyEmails = weeklyCases.map((c: { email: string }) => c.email.toLowerCase());
    const { data: weeklySubs } = await ctx.supabase
      .from("subscribers")
      .select("id, email, unsubscribed_at")
      .in("email", weeklyEmails);
    const subByEmail = new Map(
      (weeklySubs ?? []).map((s: { id: string; email: string; unsubscribed_at: string | null }) => [s.email.toLowerCase(), s])
    );

    // Batch-fetch dedup records for all weekly cases
    const weeklySubIds = (weeklySubs ?? []).map((s: { id: string }) => s.id);
    const weeklyDedupKeys = weeklyCases.map(
      (c: { id: string }) => `weekly-progress-${c.id}-${ctx.now.getFullYear()}-w${weekNumber}`
    );
    const { data: weeklyDedups } = weeklySubIds.length > 0
      ? await ctx.supabase
          .from("drip_emails")
          .select("subscriber_id, email_key")
          .in("subscriber_id", weeklySubIds)
          .in("email_key", weeklyDedupKeys)
      : { data: [] };
    const weeklyDedupSet = new Set(
      (weeklyDedups ?? []).map((r: { subscriber_id: string; email_key: string }) => `${r.subscriber_id}:${r.email_key}`)
    );

    for (const wCase of weeklyCases) {
      const emailKey = `weekly-progress-${wCase.id}-${ctx.now.getFullYear()}-w${weekNumber}`;
      const wSub = subByEmail.get(wCase.email.toLowerCase());

      // Check unsubscribe status
      if (wSub?.unsubscribed_at) {
        result.skipped++;
        continue;
      }

      // Check dedup
      if (wSub?.id && weeklyDedupSet.has(`${wSub.id}:${emailKey}`)) continue;

      const tierLabel = tierDisplayName(wCase.tier);
      const portalUrl = wCase.report_token
        ? `${ctx.siteUrl}/my-case/${wCase.report_token}`
        : null;

      const sendResult = await sendEmailWithRetry({
        to: wCase.email,
        subject: `Weekly Update: Your ${tierLabel} Analysis`,
        unsubscribeEmail: wCase.email,
        html: `
          <h1 style="color: #F59E0B;">Your Weekly Case Update</h1>
          <p>Here's a summary of progress on your ${escapeHtml(tierLabel)} analysis this week:</p>
          <div style="background: #1C1917; padding: 24px; border-radius: 12px; margin: 16px 0; border-left: 4px solid #F59E0B;">
            <p style="margin: 0; color: #D4D4D8;"><strong style="color: white;">Documents Analyzed:</strong> ${wCase.document_count}</p>
            <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Findings Identified:</strong> ${wCase.finding_count}</p>
            <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Witnesses Identified:</strong> ${wCase.witness_count}</p>
            ${wCase.discovery_health_score !== null ? `<p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Discovery Strength Rating:</strong> ${wCase.discovery_health_score}/100</p>` : ""}
          </div>
          ${portalUrl ? `<a href="${portalUrl}" style="display: inline-block; margin: 24px 0; padding: 14px 28px; background: #F59E0B; color: black; font-weight: bold; text-decoration: none; border-radius: 8px; font-size: 16px;">View Full Progress</a>` : ""}
          <p style="color: #A1A1AA; font-size: 13px;">Our team is actively working on your case. You'll receive another update next week.</p>
        `,
        threadingHeaders: {
          references: caseThreadId(wCase.id),
        },
      }, { category: "weekly-progress", case_id: wCase.id, metadata: { tier: wCase.tier, week: weekNumber } });

      if (sendResult.success) {
        if (wSub?.id) {
          await ctx.supabase.from("drip_emails").insert({
            subscriber_id: wSub.id,
            email_key: emailKey,
          });
        } else {
          // Create subscriber for tracking
          const { data: newSub } = await ctx.supabase
            .from("subscribers")
            .upsert(
              { email: wCase.email.toLowerCase(), source: `purchase-${wCase.tier}` },
              { onConflict: "email" }
            )
            .select("id")
            .single();

          if (newSub?.id) {
            await ctx.supabase.from("drip_emails").insert({
              subscriber_id: newSub.id,
              email_key: emailKey,
            });
          }
        }
        result.sent++;
      } else {
        result.errors++;
      }
    }
    console.log(`[Drip Cron] Part 18: Processed ${weeklyCases.length} weekly progress emails`);
  }

  return result;
}

// ============================================================
// PART 19: ENGINE HEARTBEAT (stale queued jobs -> operator alert)
// ============================================================

export async function checkEngineHeartbeat(ctx: CronContext): Promise<CronResult> {
  const result = emptyResult();

  const oneHourAgo = new Date(ctx.now);
  oneHourAgo.setHours(oneHourAgo.getHours() - 1);

  const { data: staleQueued } = await ctx.supabase
    .from("processing_jobs")
    .select("id, case_id, job_type, created_at")
    .eq("status", "queued")
    .lt("created_at", oneHourAgo.toISOString())
    .order("created_at", { ascending: true })
    .limit(50);

  if (staleQueued && staleQueued.length > 0) {
    // Dedup: check if we already created an engine_down task today
    const todayStart = new Date(ctx.now);
    todayStart.setHours(0, 0, 0, 0);

    const { data: existingEngineTask } = await ctx.supabase
      .from("operator_tasks")
      .select("id")
      .eq("task_type", "engine_down")
      .gte("created_at", todayStart.toISOString())
      .maybeSingle();

    if (!existingEngineTask) {
      const firstJob = staleQueued[0];
      const oldestMinutes = Math.round(
        (ctx.now.getTime() - new Date(firstJob.created_at).getTime()) / (1000 * 60)
      );

      await ctx.supabase.from("operator_tasks").insert({
        case_id: firstJob.case_id,
        task_type: "engine_down",
        title: `ENGINE DOWN: ${staleQueued.length} jobs queued for ${oldestMinutes}+ minutes`,
        description: `${staleQueued.length} processing jobs have been queued for over an hour. Oldest: ${firstJob.job_type} (${firstJob.id}). The engine worker may be stopped or crashed.`,
        priority: "URGENT",
        priority_rank: 1,
      });

      await sendEmail({
        to: ctx.operatorEmail,
        subject: `ENGINE DOWN: ${staleQueued.length} queued jobs waiting ${oldestMinutes}+ minutes`,
        html: `<h1 style="color: #EF4444;">Engine May Be Down</h1>
          <p><strong style="color: #EF4444;">${staleQueued.length} processing jobs</strong> have been queued for over an hour without being picked up.</p>
          <div style="background: #1C1917; padding: 24px; border-radius: 12px; margin: 16px 0; border-left: 4px solid #EF4444;">
            <p style="margin: 0; color: #D4D4D8;"><strong style="color: white;">Stale Jobs:</strong> ${staleQueued.length}</p>
            <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Oldest Job:</strong> ${firstJob.job_type} — queued ${oldestMinutes} minutes ago</p>
            <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Job ID:</strong> ${firstJob.id}</p>
            <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Case ID:</strong> ${firstJob.case_id}</p>
          </div>
          <p><strong>Action:</strong> Check the engine worker process. If it crashed, restart it.</p>`,
      }, { category: "operator-alert", case_id: firstJob.case_id, metadata: { reason: "engine-down", stale_count: staleQueued.length, oldest_minutes: oldestMinutes } });

      result.errors++;
    }
    console.log(`[Drip Cron] Part 19: ${staleQueued.length} stale queued jobs detected`);
  }

  return result;
}
