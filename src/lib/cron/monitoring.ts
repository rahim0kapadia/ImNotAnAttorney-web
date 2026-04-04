/**
 * @file Parts 17, 18, 19, 20 — Monitoring and reporting
 *
 * Part 17: SLA breach detection (delivery_due_at passed)
 * Part 18: Weekly progress emails (War Room + Situation Room)
 * Part 19: Engine heartbeat (stale queued jobs -> operator alert)
 * Part 20: Guarantee escalation (tier-specific thresholds + guarantee_invocations)
 */

import { sendEmail, sendEmailWithRetry, escapeHtml } from "@/lib/email";
import { tierDisplayName, tierPriceNum } from "@/lib/tiers";
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
    .not("status", "in", '("delivered","refunded","cancelled","generation-failed","intake-stalled")')
    .limit(200);

  if (slaCases && slaCases.length > 0) {
    // ── N+1 FIX: Batch-fetch existing SLA breach tasks for all cases ──
    const slaCaseIds = slaCases.map((c) => c.id);
    const { data: existingTasks } = await ctx.supabase
      .from("operator_tasks")
      .select("case_id")
      .in("case_id", slaCaseIds)
      .eq("task_type", "sla_breach")
      .in("status", ["open", "in_progress"]);
    const casesWithSlaTask = new Set(
      (existingTasks ?? []).map((t) => t.case_id)
    );

    for (const slaCase of slaCases) {
      if (casesWithSlaTask.has(slaCase.id)) continue;

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
        subject: `SLA BREACH: ${tierLabel} overdue by ${hoursOverdue} hours — ${slaCase.email}`,
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
    .in("status", weeklyStatuses)
    .limit(200);

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

// ============================================================
// PART 20: GUARANTEE ESCALATION (tier-specific thresholds)
// ============================================================

/**
 * Count business days (Mon–Fri) between two dates.
 * Returns a positive integer when `end` is after `start`.
 */
function businessDaysBetween(start: Date, end: Date): number {
  if (end <= start) return 0;
  let count = 0;
  const cursor = new Date(start);
  // Advance to start of the next calendar day so the due-date itself is not counted
  cursor.setDate(cursor.getDate() + 1);
  cursor.setHours(0, 0, 0, 0);
  const endDay = new Date(end);
  endDay.setHours(23, 59, 59, 999);
  while (cursor <= endDay) {
    const dow = cursor.getDay();
    if (dow !== 0 && dow !== 6) count++;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}

interface GuaranteeThreshold {
  businessDays: number;
  guaranteeType: string;       // written to guarantee_invocations.guarantee_type
  resolutionType: string | null; // null = warning-only, no invocation record inserted
  amountRefunded: number | null;
  taskType: string;            // stored in operator_tasks.task_type for dedup
  taskTitle: string;
  taskPriority: "CRITICAL" | "URGENT" | "HIGH" | "NORMAL";
  priorityRank: number;
  emailColor: "red" | "amber";
}

interface GuaranteeEscalationSpec {
  tier: string;
  tierLabel: string;
  thresholds: GuaranteeThreshold[];
}

/**
 * Guarantee thresholds. Each `businessDays` value means:
 * "business days PAST delivery_due_at before this guarantee triggers."
 *
 * delivery_due_at is set when processing begins:
 *   CD: intake linked, generation starts -> +2 calendar days (48hr promise)
 *   IB: auto-generation starts -> +3 calendar days (72hr promise)
 *   X-Ray: discovery uploaded -> +14 calendar days (~10 biz days)
 *   War Room: discovery uploaded -> +40 calendar days (~28 biz days)
 *   SR: discovery uploaded -> +2 calendar days (24-48hr priority)
 *
 * businessDays: 0 = fire immediately when deadline passes
 * businessDays: 5 = fire 5 business days after deadline
 */
const GUARANTEE_SPECS: GuaranteeEscalationSpec[] = [
  {
    tier: "case-decoder",
    tierLabel: "Case Decoder ($197)",
    thresholds: [{
      businessDays: 0,
      guaranteeType: "cd-delivery",
      resolutionType: "full_refund",
      amountRefunded: tierPriceNum("case-decoder"),
      taskType: "guarantee_cd_delivery",
      taskTitle: "GUARANTEE TRIGGERED: Case Decoder delivery overdue",
      taskPriority: "URGENT",
      priorityRank: 1,
      emailColor: "red",
    }],
  },
  {
    tier: "intelligence-brief",
    tierLabel: "Intelligence Brief ($997)",
    thresholds: [{
      businessDays: 0,
      guaranteeType: "ib-delivery",
      resolutionType: "full_refund",
      amountRefunded: tierPriceNum("intelligence-brief"),
      taskType: "guarantee_ib_delivery",
      taskTitle: "GUARANTEE TRIGGERED: Intelligence Brief delivery overdue",
      taskPriority: "URGENT",
      priorityRank: 1,
      emailColor: "red",
    }],
  },
  {
    tier: "x-ray",
    tierLabel: "X-Ray ($2,497)",
    thresholds: [
      {
        businessDays: 0,
        guaranteeType: "xray-delivery-20pct",
        resolutionType: "20pct_refund",
        amountRefunded: Math.round(tierPriceNum("x-ray") * 0.20 * 100) / 100,
        taskType: "guarantee_xray_20pct",
        taskTitle: "GUARANTEE TRIGGERED: X-Ray 20% delivery refund due",
        taskPriority: "URGENT",
        priorityRank: 1,
        emailColor: "amber",
      },
      {
        businessDays: 5,
        guaranteeType: "xray-delivery-full",
        resolutionType: "full_refund",
        amountRefunded: tierPriceNum("x-ray"),
        taskType: "guarantee_xray_full",
        taskTitle: "GUARANTEE TRIGGERED: X-Ray FULL refund due — 5 days past deadline",
        taskPriority: "CRITICAL",
        priorityRank: 0,
        emailColor: "red",
      },
    ],
  },
  {
    tier: "war-room",
    tierLabel: "War Room ($4,997)",
    thresholds: [
      {
        businessDays: 0,
        guaranteeType: "warroom-delivery-warning",
        resolutionType: null,
        amountRefunded: null,
        taskType: "guarantee_warroom_warning",
        taskTitle: "WARNING: War Room delivery deadline reached",
        taskPriority: "HIGH",
        priorityRank: 2,
        emailColor: "amber",
      },
      {
        businessDays: 3,
        guaranteeType: "warroom-delivery",
        resolutionType: "full_refund",
        amountRefunded: tierPriceNum("war-room"),
        taskType: "guarantee_warroom_full",
        taskTitle: "GUARANTEE TRIGGERED: War Room FULL refund due — 3 days past deadline",
        taskPriority: "CRITICAL",
        priorityRank: 0,
        emailColor: "red",
      },
    ],
  },
  {
    tier: "situation-room",
    tierLabel: "Situation Room ($9,997)",
    thresholds: [
      {
        businessDays: 0,
        guaranteeType: "sr-delivery-warning",
        resolutionType: null,
        amountRefunded: null,
        taskType: "guarantee_sr_warning",
        taskTitle: "WARNING: Situation Room delivery deadline reached",
        taskPriority: "CRITICAL",
        priorityRank: 0,
        emailColor: "amber",
      },
      {
        businessDays: 3,
        guaranteeType: "sr-delivery",
        resolutionType: "full_refund",
        amountRefunded: tierPriceNum("situation-room"),
        taskType: "guarantee_sr_full",
        taskTitle: "GUARANTEE TRIGGERED: Situation Room FULL refund due — 3 days past deadline",
        taskPriority: "CRITICAL",
        priorityRank: 0,
        emailColor: "red",
      },
    ],
  },
];

// Pre-computed static arrays from GUARANTEE_SPECS (avoids re-allocation on every cron run)
const ELIGIBLE_TIERS = GUARANTEE_SPECS.map((s) => s.tier);
const GUARANTEE_TASK_TYPES = GUARANTEE_SPECS.flatMap((s) => s.thresholds.map((t) => t.taskType));
const SPEC_BY_TIER = new Map(GUARANTEE_SPECS.map((s) => [s.tier, s]));

export async function escalateGuarantees(ctx: CronContext): Promise<CronResult> {
  const result = emptyResult();

  // ── Query 1: Fetch overdue cases for guarantee-eligible tiers ──
  const { data: cases } = await ctx.supabase
    .from("cases")
    .select("id, email, tier, delivery_due_at")
    .in("tier", ELIGIBLE_TIERS)
    .not("status", "in", '("delivered","refunded","cancelled","generation-failed","intake-stalled")')
    .not("delivery_due_at", "is", null)
    .lt("delivery_due_at", ctx.now.toISOString())
    .limit(200);

  if (!cases || cases.length === 0) return result;
  if (cases.length === 200) {
    console.warn("[Drip Cron] Part 20: hit 200-case limit — some guarantees may be deferred");
  }

  const caseIds = cases.map((c) => c.id);

  // ── Queries 2+3: Batch-fetch dedup data in parallel ──
  const [{ data: existingInvocations }, { data: existingTasks }] = await Promise.all([
    ctx.supabase
      .from("guarantee_invocations")
      .select("case_id, guarantee_type")
      .in("case_id", caseIds),
    ctx.supabase
      .from("operator_tasks")
      .select("case_id, task_type")
      .in("case_id", caseIds)
      .in("task_type", GUARANTEE_TASK_TYPES)
      .in("status", ["open", "in_progress"]),
  ]);

  const invocationSet = new Set(
    (existingInvocations ?? []).map(
      (r: { case_id: string; guarantee_type: string }) => `${r.case_id}:${r.guarantee_type}`
    )
  );
  const taskSet = new Set(
    (existingTasks ?? []).map(
      (t: { case_id: string; task_type: string }) => `${t.case_id}:${t.task_type}`
    )
  );

  // ── Collect rows for batch insert + emails for parallel send ──
  const invocationRows: Record<string, unknown>[] = [];
  const taskRows: Record<string, unknown>[] = [];
  const emailPromises: Promise<unknown>[] = [];

  for (const c of cases) {
    const spec = SPEC_BY_TIER.get(c.tier);
    if (!spec) continue;

    const businessDaysOver = businessDaysBetween(
      new Date(c.delivery_due_at!),
      ctx.now
    );

    for (const threshold of spec.thresholds) {
      if (businessDaysOver < threshold.businessDays) continue;

      const taskKey = `${c.id}:${threshold.taskType}`;
      const invocationKey = `${c.id}:${threshold.guaranteeType}`;
      const isRealTrigger = threshold.resolutionType !== null;

      if (taskSet.has(taskKey)) continue;
      if (isRealTrigger && invocationSet.has(invocationKey)) continue;

      if (isRealTrigger) {
        invocationRows.push({
          case_id: c.id,
          customer_email: c.email,
          tier: c.tier,
          guarantee_type: threshold.guaranteeType,
          triggered_at: ctx.now.toISOString(),
          resolution_type: threshold.resolutionType,
          amount_refunded: threshold.amountRefunded,
          escalated: false,
          notes: `Auto-triggered by cron after ${businessDaysOver} business days overdue (threshold: ${threshold.businessDays})`,
        });
        invocationSet.add(invocationKey);
      }

      taskRows.push({
        case_id: c.id,
        task_type: threshold.taskType,
        title: threshold.taskTitle,
        description: `Customer: ${c.email} | Tier: ${spec.tierLabel} | ${businessDaysOver} business days overdue (threshold: ${threshold.businessDays})${isRealTrigger ? ` | Refund due: $${threshold.amountRefunded!.toFixed(2)}` : ""}`,
        priority: threshold.taskPriority,
        priority_rank: threshold.priorityRank,
        sla_breach: true,
        due_at: ctx.now.toISOString(),
      });
      taskSet.add(taskKey);

      const accentColor = threshold.emailColor === "red" ? "#EF4444" : "#F59E0B";
      const headingText = threshold.emailColor === "red"
        ? "Guarantee Triggered — Refund Required"
        : "Guarantee Warning — Action Required";

      emailPromises.push(sendEmail({
        to: ctx.operatorEmail,
        subject: threshold.taskTitle,
        html: `<h1 style="color: ${accentColor};">${headingText}</h1>
          <p>${isRealTrigger
            ? `This case has breached the <strong>${escapeHtml(spec.tierLabel)}</strong> delivery guarantee and a refund must be issued.`
            : `This case is approaching the <strong>${escapeHtml(spec.tierLabel)}</strong> delivery guarantee deadline. Delivery must occur within ${threshold.businessDays} business days or a full refund is owed.`
          }</p>
          <div style="background: #1C1917; padding: 24px; border-radius: 12px; margin: 16px 0; border-left: 4px solid ${accentColor};">
            <p style="margin: 0; color: #D4D4D8;"><strong style="color: white;">Customer:</strong> ${escapeHtml(c.email)}</p>
            <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Tier:</strong> ${escapeHtml(spec.tierLabel)}</p>
            <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Business Days Overdue:</strong> ${businessDaysOver}</p>
            <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Threshold:</strong> ${threshold.businessDays} business days</p>
            ${isRealTrigger
              ? `<p style="margin: 8px 0 0; color: ${accentColor};"><strong style="color: ${accentColor};">Refund Due:</strong> $${threshold.amountRefunded!.toFixed(2)}</p>`
              : ""}
            <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Case ID:</strong> ${c.id}</p>
          </div>
          <p><strong>Action:</strong> ${isRealTrigger
            ? `Process the ${threshold.resolutionType === "full_refund" ? "full" : "partial"} refund immediately via the Stripe dashboard.`
            : "Prioritize delivery of this case before the guarantee deadline is reached."
          }</p>`,
      }, {
        category: "operator-alert",
        case_id: c.id,
        metadata: {
          reason: "guarantee-escalation",
          tier: c.tier,
          guarantee_type: threshold.guaranteeType,
          business_days_overdue: businessDaysOver,
          amount_refunded: threshold.amountRefunded,
        },
      }));

      result.errors++;
      console.log(
        `[Drip Cron] Part 20: ${threshold.taskType} triggered for case ${c.id} (${businessDaysOver} business days overdue)`
      );
    }
  }

  // ── Batch inserts + parallel emails ──
  const dbOps: PromiseLike<unknown>[] = [];
  if (invocationRows.length > 0) {
    dbOps.push(ctx.supabase.from("guarantee_invocations").insert(invocationRows));
  }
  if (taskRows.length > 0) {
    dbOps.push(ctx.supabase.from("operator_tasks").insert(taskRows));
  }
  await Promise.all([...dbOps, ...emailPromises]);

  return result;
}
