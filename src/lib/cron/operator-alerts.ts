/**
 * @file Parts 3, 4, 5, 5b, 5c, 6, 6b — Operator alerts
 *
 * Part 3:  Review reminders (48-hour guarantee protection)
 * Part 4:  Stuck intake detection (generation trigger dropped)
 * Part 5:  Stuck generating detection (edge function crash/timeout)
 * Part 5b: Stuck IB generation detection (multi-phase)
 * Part 5c: IB Phase 2 intake reminder (customer + operator escalation)
 * Part 6:  Awaiting-intake reminder (paid but didn't fill form)
 * Part 6b: Intake escalation (72h + 7d operator alerts)
 */

import { sendEmail, sendEmailWithRetry, escapeHtml } from "@/lib/email";
import { signOperatorToken, signPhase2Token, caseThreadId } from "@/lib/site";
import { tierDisplayName } from "@/lib/tiers";
import type { CronContext, CronResult } from "./types";
import { emptyResult } from "./types";

// ============================================================
// PART 3: OPERATOR REVIEW REMINDERS
// ============================================================

export async function sendReviewReminders(ctx: CronContext): Promise<CronResult> {
  const result = emptyResult();

  const twelveHoursAgo = new Date(ctx.now);
  twelveHoursAgo.setHours(twelveHoursAgo.getHours() - 12);

  const { data: staleReviews } = await ctx.supabase
    .from("cases")
    .select("id, email, charge_type, generated_at, tier")
    .eq("status", "review")
    .eq("review_reminder_sent", false)
    .lt("generated_at", twelveHoursAgo.toISOString());

  if (staleReviews && staleReviews.length > 0) {
    for (const staleCase of staleReviews) {
      const hoursAgo = Math.round(
        (ctx.now.getTime() - new Date(staleCase.generated_at).getTime()) / (1000 * 60 * 60)
      );

      const sendResult = await sendEmail({
        to: ctx.operatorEmail,
        subject: `REMINDER: ${tierDisplayName(staleCase.tier)} awaiting review (${hoursAgo}+ hours)`,
        html: `<h1 style="color: #F59E0B;">Report Awaiting Review</h1>
          <p>A ${escapeHtml(tierDisplayName(staleCase.tier))} has been in review for <strong style="color: #EF4444;">${hoursAgo} hours</strong>. The delivery guarantee is at risk.</p>
          <div style="background: #1C1917; padding: 24px; border-radius: 12px; margin: 16px 0; border-left: 4px solid #F59E0B;">
            <p style="margin: 0; color: #D4D4D8;"><strong style="color: white;">Customer:</strong> ${escapeHtml(staleCase.email)}</p>
            <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Charge Type:</strong> ${escapeHtml(staleCase.charge_type || "Unknown")}</p>
            <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Generated:</strong> ${new Date(staleCase.generated_at).toLocaleString()}</p>
            <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Case ID:</strong> ${staleCase.id}</p>
          </div>
          <div style="margin: 24px 0;">
            <a href="${ctx.siteUrl}/api/deliver?token=${signOperatorToken(staleCase.id)}&case=${staleCase.id}" style="display: inline-block; padding: 14px 28px; background: #22C55E; color: white; font-weight: bold; text-decoration: none; border-radius: 8px;">Approve &amp; Deliver</a>
          </div>
          <p style="color: #71717A; font-size: 12px;">This link expires in 24 hours.</p>`,
      }, { category: "operator-review-reminder", case_id: staleCase.id });

      if (sendResult.success) {
        await ctx.supabase
          .from("cases")
          .update({ review_reminder_sent: true })
          .eq("id", staleCase.id);
        result.sent++;
      } else {
        result.errors++;
      }
    }
  }

  return result;
}

// ============================================================
// PART 4: STUCK INTAKE DETECTION
// ============================================================

export async function detectStuckIntakes(ctx: CronContext): Promise<CronResult> {
  const result = emptyResult();

  const twoHoursAgo = new Date(ctx.now);
  twoHoursAgo.setHours(twoHoursAgo.getHours() - 2);

  const { data: stuckIntakes } = await ctx.supabase
    .from("cases")
    .select("id, email, charge_type, tier, updated_at")
    .eq("status", "intake")
    .eq("tier", "case-decoder")
    .eq("is_included_deliverable", false)
    .lt("updated_at", twoHoursAgo.toISOString());

  if (stuckIntakes && stuckIntakes.length > 0) {
    for (const stuck of stuckIntakes) {
      const hoursStuck = Math.round(
        (ctx.now.getTime() - new Date(stuck.updated_at).getTime()) / (1000 * 60 * 60)
      );
      const sendResult = await sendEmail({
        to: ctx.operatorEmail,
        subject: `ALERT: Case stuck in intake for ${hoursStuck}+ hours — ${escapeHtml(stuck.email)}`,
        html: `<h1 style="color: #EF4444;">Case Stuck — Generation May Have Failed</h1>
          <p>Case has been in "intake" status for <strong>${hoursStuck} hours</strong>. Report generation may have been silently dropped.</p>
          <div style="background: #1C1917; padding: 24px; border-radius: 12px; margin: 16px 0; border-left: 4px solid #EF4444;">
            <p style="margin: 0; color: #D4D4D8;"><strong style="color: white;">Customer:</strong> ${escapeHtml(stuck.email)}</p>
            <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Tier:</strong> ${escapeHtml(stuck.tier)}</p>
            <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Case ID:</strong> ${stuck.id}</p>
          </div>
          <p><strong>Action:</strong> Manually trigger generation:</p>
          <code>POST ${ctx.siteUrl}/api/generate/case-decoder</code><br/>
          <code>Body: {"caseId": "${stuck.id}"}</code><br/>
          <code>Header: Authorization: Bearer [OPERATOR_SECRET]</code>`,
      }, { category: "operator-alert", case_id: stuck.id, metadata: { reason: "stuck-intake", hours: hoursStuck } });

      if (sendResult.success) {
        await ctx.supabase
          .from("cases")
          .update({ status: "intake-stalled", updated_at: ctx.now.toISOString() })
          .eq("id", stuck.id);
        result.sent++;
      } else {
        result.errors++;
      }
    }
  }

  return result;
}

// ============================================================
// PART 5: STUCK "GENERATING" DETECTION
// ============================================================

export async function detectStuckGenerating(ctx: CronContext): Promise<CronResult> {
  const result = emptyResult();

  const thirtyMinAgo = new Date(ctx.now);
  thirtyMinAgo.setMinutes(thirtyMinAgo.getMinutes() - 30);

  const { data: stuckGenerating } = await ctx.supabase
    .from("cases")
    .select("id, email, charge_type, tier, updated_at")
    .eq("status", "generating")
    .lt("updated_at", thirtyMinAgo.toISOString());

  if (stuckGenerating && stuckGenerating.length > 0) {
    for (const stuck of stuckGenerating) {
      const minutesStuck = Math.round(
        (ctx.now.getTime() - new Date(stuck.updated_at).getTime()) / (1000 * 60)
      );
      const sendResult = await sendEmail({
        to: ctx.operatorEmail,
        subject: `ALERT: Report generation stuck for ${minutesStuck}+ min — ${escapeHtml(stuck.email)}`,
        html: `<h1 style="color: #EF4444;">Report Generation Stuck</h1>
          <p>Case has been in "generating" status for <strong>${minutesStuck} minutes</strong>. The edge function likely crashed or timed out.</p>
          <div style="background: #1C1917; padding: 24px; border-radius: 12px; margin: 16px 0; border-left: 4px solid #EF4444;">
            <p style="margin: 0; color: #D4D4D8;"><strong style="color: white;">Customer:</strong> ${escapeHtml(stuck.email)}</p>
            <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Tier:</strong> ${escapeHtml(stuck.tier)}</p>
            <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Case ID:</strong> ${stuck.id}</p>
          </div>
          <p><strong>Retry command:</strong></p>
          <code style="display: block; background: #1C1917; padding: 12px; border-radius: 8px; margin: 8px 0; color: #F59E0B; word-break: break-all;">curl -X POST ${ctx.siteUrl}/api/generate/${stuck.tier === 'intelligence-brief' ? 'intelligence-brief' : 'case-decoder'} -H "Content-Type: application/json" -H "Authorization: Bearer $OPERATOR_SECRET" -d '{"caseId":"${stuck.id}","force":true}'</code>`,
      }, { category: "operator-alert", case_id: stuck.id, metadata: { reason: "stuck-generation", minutes: minutesStuck } });

      // Only transition status if alert was actually sent
      if (sendResult.success) {
        await ctx.supabase
          .from("cases")
          .update({
            status: "generation-failed",
            updated_at: ctx.now.toISOString(),
          })
          .eq("id", stuck.id);
        result.sent++;
      } else {
        result.errors++;
      }
    }
  }

  return result;
}

// ============================================================
// PART 5b: STUCK IB GENERATION DETECTION
// ============================================================

export async function detectStuckIBGeneration(ctx: CronContext): Promise<CronResult> {
  const result = emptyResult();

  const thirtyMinAgo = new Date(ctx.now);
  thirtyMinAgo.setMinutes(thirtyMinAgo.getMinutes() - 30);

  // Stuck auto-generating (Phase A timeout — >30 min)
  const { data: stuckAutoGen } = await ctx.supabase
    .from("cases")
    .select("id, email, charge_type, tier, updated_at")
    .eq("status", "auto-generating")
    .lt("updated_at", thirtyMinAgo.toISOString());

  if (stuckAutoGen && stuckAutoGen.length > 0) {
    for (const stuck of stuckAutoGen) {
      const minutesStuck = Math.round(
        (ctx.now.getTime() - new Date(stuck.updated_at).getTime()) / (1000 * 60)
      );
      const sendResult = await sendEmail({
        to: ctx.operatorEmail,
        subject: `ALERT: IB Phase A stuck for ${minutesStuck}+ min — ${escapeHtml(stuck.email)}`,
        html: `<h1 style="color: #EF4444;">Intelligence Brief Phase A Stuck</h1>
          <p>Case has been in "auto-generating" status for <strong>${minutesStuck} minutes</strong>. Phase A likely crashed or timed out.</p>
          <div style="background: #1C1917; padding: 24px; border-radius: 12px; margin: 16px 0; border-left: 4px solid #EF4444;">
            <p style="margin: 0; color: #D4D4D8;"><strong style="color: white;">Customer:</strong> ${escapeHtml(stuck.email)}</p>
            <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Tier:</strong> ${escapeHtml(stuck.tier)}</p>
            <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Case ID:</strong> ${stuck.id}</p>
          </div>
          <p><strong>Retry command:</strong></p>
          <code style="display: block; background: #1C1917; padding: 12px; border-radius: 8px; margin: 8px 0; color: #F59E0B; word-break: break-all;">curl -X POST ${ctx.siteUrl}/api/generate/intelligence-brief -H "Content-Type: application/json" -H "Authorization: Bearer $OPERATOR_SECRET" -d '{"caseId":"${stuck.id}","force":true}'</code>`,
      }, { category: "operator-alert", case_id: stuck.id, metadata: { reason: "stuck-auto-generating", minutes: minutesStuck } });

      if (sendResult.success) {
        await ctx.supabase
          .from("cases")
          .update({ status: "generation-failed", updated_at: ctx.now.toISOString() })
          .eq("id", stuck.id);
        result.sent++;
      } else {
        result.errors++;
      }
    }
  }

  // Stuck compiling (Phase B timeout — >30 min)
  const { data: stuckCompiling } = await ctx.supabase
    .from("cases")
    .select("id, email, charge_type, tier, updated_at")
    .eq("status", "compiling")
    .lt("updated_at", thirtyMinAgo.toISOString());

  if (stuckCompiling && stuckCompiling.length > 0) {
    for (const stuck of stuckCompiling) {
      const minutesStuck = Math.round(
        (ctx.now.getTime() - new Date(stuck.updated_at).getTime()) / (1000 * 60)
      );
      const compileResult = await sendEmail({
        to: ctx.operatorEmail,
        subject: `ALERT: IB Phase B stuck for ${minutesStuck}+ min — ${escapeHtml(stuck.email)}`,
        html: `<h1 style="color: #EF4444;">Intelligence Brief Phase B Stuck</h1>
          <p>Case has been in "compiling" status for <strong>${minutesStuck} minutes</strong>. Phase B likely crashed or timed out.</p>
          <div style="background: #1C1917; padding: 24px; border-radius: 12px; margin: 16px 0; border-left: 4px solid #EF4444;">
            <p style="margin: 0; color: #D4D4D8;"><strong style="color: white;">Customer:</strong> ${escapeHtml(stuck.email)}</p>
            <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Case ID:</strong> ${stuck.id}</p>
          </div>
          <p><strong>Action:</strong> Check Edge Function logs. Re-trigger Phase B (judge research data is preserved):</p>
          <code style="display: block; background: #1C1917; padding: 12px; border-radius: 8px; margin: 8px 0; color: #F59E0B; word-break: break-all;">curl -X POST ${ctx.siteUrl}/api/generate/intelligence-brief/judge-research -H "Content-Type: application/json" -H "Authorization: Bearer $OPERATOR_SECRET" -d '{"caseId":"${stuck.id}","judgeResearch":{},"force":true}'</code>`,
      }, { category: "operator-alert", case_id: stuck.id, metadata: { reason: "stuck-compiling", minutes: minutesStuck } });

      if (compileResult.success) {
        await ctx.supabase
          .from("cases")
          .update({ status: "generation-failed", updated_at: ctx.now.toISOString() })
          .eq("id", stuck.id);
        result.sent++;
      } else {
        result.errors++;
      }
    }
  }

  // Stuck researching (waiting for judge research — >24h operator nudge)
  const researchThreshold = new Date(ctx.now);
  researchThreshold.setHours(researchThreshold.getHours() - 24);
  const { data: stuckResearching } = await ctx.supabase
    .from("cases")
    .select("id, email, charge_type, tier, updated_at")
    .eq("status", "researching")
    .lt("updated_at", researchThreshold.toISOString());

  if (stuckResearching && stuckResearching.length > 0) {
    for (const stuck of stuckResearching) {
      const hoursStuck = Math.round(
        (ctx.now.getTime() - new Date(stuck.updated_at).getTime()) / (1000 * 60 * 60)
      );
      const { data: existingSub } = await ctx.supabase
        .from("subscribers")
        .select("id")
        .eq("email", stuck.email.toLowerCase())
        .maybeSingle();

      if (existingSub?.id) {
        const { data: alreadySent } = await ctx.supabase
          .from("drip_emails")
          .select("id")
          .eq("subscriber_id", existingSub.id)
          .eq("email_key", `researching_nudge_${stuck.id}`)
          .maybeSingle();
        if (alreadySent) continue;
      }

      await sendEmail({
        to: ctx.operatorEmail,
        subject: `REMINDER: IB judge research pending for ${hoursStuck}+ hours — ${escapeHtml(stuck.email)}`,
        html: `<h1 style="color: #F59E0B;">Intelligence Brief Awaiting Judge Research</h1>
          <p>Phase A completed ${hoursStuck} hours ago. Judge research data is needed to proceed with Phase B.</p>
          <div style="background: #1C1917; padding: 24px; border-radius: 12px; margin: 16px 0; border-left: 4px solid #F59E0B;">
            <p style="margin: 0; color: #D4D4D8;"><strong style="color: white;">Customer:</strong> ${escapeHtml(stuck.email)}</p>
            <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Case ID:</strong> ${stuck.id}</p>
          </div>
          <p><strong>Action:</strong> Enter judge research data via the judge-research endpoint to trigger Phase B.</p>`,
      }, { category: "operator-alert", case_id: stuck.id, metadata: { reason: "stuck-researching", hours: hoursStuck } });

      if (existingSub?.id) {
        await ctx.supabase.from("drip_emails").upsert(
          { subscriber_id: existingSub.id, email_key: `researching_nudge_${stuck.id}` },
          { onConflict: "subscriber_id,email_key" }
        );
      }
    }
  }

  // Researching escalation (72h — judge research still not submitted)
  const researchEscThreshold = new Date(ctx.now);
  researchEscThreshold.setHours(researchEscThreshold.getHours() - 72);
  const { data: stuckResearching72h } = await ctx.supabase
    .from("cases")
    .select("id, email, charge_type, tier, updated_at")
    .eq("status", "researching")
    .lt("updated_at", researchEscThreshold.toISOString());

  if (stuckResearching72h && stuckResearching72h.length > 0) {
    for (const stuck of stuckResearching72h) {
      const hoursStuck = Math.round(
        (ctx.now.getTime() - new Date(stuck.updated_at).getTime()) / (1000 * 60 * 60)
      );

      const { data: escSub } = await ctx.supabase
        .from("subscribers")
        .select("id")
        .eq("email", stuck.email.toLowerCase())
        .maybeSingle();

      if (escSub?.id) {
        const { data: alreadyEscalated } = await ctx.supabase
          .from("drip_emails")
          .select("id")
          .eq("subscriber_id", escSub.id)
          .eq("email_key", `researching_escalation_${stuck.id}`)
          .maybeSingle();
        if (alreadyEscalated) continue;
      }

      await sendEmail({
        to: ctx.operatorEmail,
        subject: `URGENT: Judge research pending ${hoursStuck}+ hours — customer waiting — ${escapeHtml(stuck.email)}`,
        html: `<h1 style="color: #EF4444;">Intelligence Brief Blocked — Judge Research Overdue</h1>
          <p>Phase A completed <strong>${hoursStuck} hours ago</strong> (${Math.round(hoursStuck / 24)} days). The customer is waiting for their Intelligence Brief but judge research hasn't been submitted.</p>
          <div style="background: #1C1917; padding: 24px; border-radius: 12px; margin: 16px 0; border-left: 4px solid #EF4444;">
            <p style="margin: 0; color: #D4D4D8;"><strong style="color: white;">Customer:</strong> ${escapeHtml(stuck.email)}</p>
            <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Case ID:</strong> ${stuck.id}</p>
            <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Charge:</strong> ${escapeHtml(stuck.charge_type || "unknown")}</p>
          </div>
          <p><strong>Action:</strong> Submit judge research immediately or contact the customer about the delay.</p>`,
      }, { category: "operator-alert", case_id: stuck.id, metadata: { reason: "researching-escalation", hours: hoursStuck } });

      if (escSub?.id) {
        await ctx.supabase.from("drip_emails").insert({
          subscriber_id: escSub.id,
          email_key: `researching_escalation_${stuck.id}`,
        });
      }
    }
  }

  return result;
}

// ============================================================
// PART 5c: IB PHASE 2 INTAKE REMINDER
// ============================================================

export async function sendPhase2IntakeReminders(ctx: CronContext): Promise<CronResult> {
  const result = emptyResult();

  const fortyEightHoursAgo = new Date(ctx.now);
  fortyEightHoursAgo.setHours(fortyEightHoursAgo.getHours() - 48);

  const { data: ibWaitingPhase2 } = await ctx.supabase
    .from("cases")
    .select("id, email, intake_id, updated_at")
    .eq("status", "intake")
    .eq("tier", "intelligence-brief")
    .lt("updated_at", fortyEightHoursAgo.toISOString());

  if (ibWaitingPhase2 && ibWaitingPhase2.length > 0) {
    for (const ibCase of ibWaitingPhase2) {
      // Verify Phase 2 hasn't been submitted yet
      if (ibCase.intake_id) {
        const { data: intake } = await ctx.supabase
          .from("intakes")
          .select("phase2_data")
          .eq("id", ibCase.intake_id)
          .maybeSingle();

        if (intake?.phase2_data) continue;
      }

      const caseAge = ctx.now.getTime() - new Date(ibCase.updated_at).getTime();
      const isSevenDayEscalation = caseAge > 7 * 24 * 60 * 60 * 1000;

      const { data: p2Sub } = await ctx.supabase
        .from("subscribers")
        .select("id")
        .eq("email", ibCase.email.toLowerCase())
        .maybeSingle();

      if (isSevenDayEscalation) {
        // 7-day operator escalation
        const escalationKey = `phase2_escalation_7d_${ibCase.id}`;
        if (p2Sub?.id) {
          const { data: alreadyEscalated } = await ctx.supabase
            .from("drip_emails")
            .select("id")
            .eq("subscriber_id", p2Sub.id)
            .eq("email_key", escalationKey)
            .maybeSingle();
          if (alreadyEscalated) continue;
        }

        const daysSinceUpdate = Math.round(caseAge / (1000 * 60 * 60 * 24));
        await sendEmail({
          to: ctx.operatorEmail,
          subject: `URGENT: IB Phase 2 pending ${daysSinceUpdate}+ days — ${escapeHtml(ibCase.email)}`,
          html: `<h1 style="color: #EF4444;">Intelligence Brief Waiting for Phase 2</h1>
            <p>Customer received their Case Decoder <strong>${daysSinceUpdate} days ago</strong> but has not submitted their Intelligence Brief details.</p>
            <div style="background: #1C1917; padding: 24px; border-radius: 12px; margin: 16px 0; border-left: 4px solid #EF4444;">
              <p style="margin: 0; color: #D4D4D8;"><strong style="color: white;">Customer:</strong> ${escapeHtml(ibCase.email)}</p>
              <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Case ID:</strong> ${ibCase.id}</p>
            </div>
            <p><strong>Action:</strong> Reach out directly or consider whether to initiate a partial refund for the IB portion.</p>`,
        }, { category: "operator-alert", case_id: ibCase.id, metadata: { reason: "phase2-escalation", days: daysSinceUpdate } });

        if (p2Sub?.id) {
          await ctx.supabase.from("drip_emails").insert({
            subscriber_id: p2Sub.id,
            email_key: escalationKey,
          });
        }
      } else {
        // 48-hour customer reminder
        const reminderKey = `phase2_reminder_${ibCase.id}`;
        if (p2Sub?.id) {
          const { data: alreadySent } = await ctx.supabase
            .from("drip_emails")
            .select("id")
            .eq("subscriber_id", p2Sub.id)
            .eq("email_key", reminderKey)
            .maybeSingle();
          if (alreadySent) continue;
        }

        const phase2Token = signPhase2Token(ibCase.id);
        const sendResult = await sendEmailWithRetry({
          to: ibCase.email,
          subject: "Reminder: Complete your Intelligence Brief details",
          unsubscribeEmail: ibCase.email,
          threadingHeaders: {
            inReplyTo: caseThreadId(ibCase.id),
            references: caseThreadId(ibCase.id),
          },
          html: `
            <h1 style="color: #F59E0B;">Your Intelligence Brief is Waiting on You</h1>
            <p>Your Case Decoder report was delivered — now we need a few more details to build your full Intelligence Brief.</p>
            <p>This short form takes about 5 minutes and helps us tailor the analysis to your specific situation:</p>
            <a href="${ctx.siteUrl}/intake/intelligence-brief?case=${ibCase.id}&token=${phase2Token}" style="display: inline-block; margin: 24px 0; padding: 14px 28px; background: #F59E0B; color: black; font-weight: bold; text-decoration: none; border-radius: 8px; font-size: 16px;">Complete Intelligence Brief Details</a>
            <p style="color: #A1A1AA;">Once you submit, your Intelligence Brief will be generated within 72 hours.</p>
          `,
        }, { category: "phase2-reminder", case_id: ibCase.id, metadata: { tier: "intelligence-brief" } });

        if (sendResult.success && p2Sub?.id) {
          await ctx.supabase.from("drip_emails").insert({
            subscriber_id: p2Sub.id,
            email_key: reminderKey,
          });
          result.sent++;
        }
      }
    }
  }

  return result;
}

// ============================================================
// PART 6: AWAITING-INTAKE REMINDER
// ============================================================

export async function sendAwaitingIntakeReminders(ctx: CronContext): Promise<CronResult> {
  const result = emptyResult();

  const twentyFourHoursAgo = new Date(ctx.now);
  twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

  const { data: awaitingIntakes } = await ctx.supabase
    .from("cases")
    .select("id, email, tier, created_at")
    .eq("status", "awaiting-intake")
    .lt("created_at", twentyFourHoursAgo.toISOString());

  if (awaitingIntakes && awaitingIntakes.length > 0) {
    for (const awCase of awaitingIntakes) {
      const { data: existingSub } = await ctx.supabase
        .from("subscribers")
        .select("id")
        .eq("email", awCase.email.toLowerCase())
        .maybeSingle();

      if (existingSub?.id) {
        const { data: alreadySent } = await ctx.supabase
          .from("drip_emails")
          .select("id")
          .eq("subscriber_id", existingSub.id)
          .eq("email_key", `intake_reminder_${awCase.id}`)
          .maybeSingle();

        if (alreadySent) continue;
      }

      const sendResult = await sendEmailWithRetry({
        to: awCase.email,
        subject: "Reminder: Complete your case details to start your report",
        unsubscribeEmail: awCase.email,
        html: `
          <h1 style="color: #F59E0B;">We're Waiting on You</h1>
          <p>You purchased your report — but we still need your case details before we can generate it.</p>
          <p>It only takes 3 minutes:</p>
          <a href="${ctx.siteUrl}/intake?email=${encodeURIComponent(awCase.email)}&tier=${escapeHtml(awCase.tier)}" style="display: inline-block; margin: 24px 0; padding: 14px 28px; background: #F59E0B; color: black; font-weight: bold; text-decoration: none; border-radius: 8px; font-size: 16px;">Complete Your Case Details</a>
          <p style="color: #A1A1AA;">${awCase.tier === "intelligence-brief" ? "Your Case Decoder will be delivered within 48 hours. After that, we&#39;ll send a short follow-up form for your full Intelligence Brief." : "Once you submit, your report will be generated within 48 hours."}</p>
        `,
      }, { category: "intake-reminder", case_id: awCase.id, metadata: { tier: awCase.tier } });

      if (sendResult.success) {
        let subId = existingSub?.id;
        if (!subId) {
          const { data: newSub } = await ctx.supabase
            .from("subscribers")
            .upsert({ email: awCase.email.toLowerCase(), source: "checkout" }, { onConflict: "email" })
            .select("id")
            .single();
          subId = newSub?.id;
        }
        if (subId) {
          await ctx.supabase.from("drip_emails").insert({
            subscriber_id: subId,
            email_key: `intake_reminder_${awCase.id}`,
          });
        }
        result.sent++;
      }
    }
  }

  return result;
}

// ============================================================
// PART 6b: INTAKE ESCALATION — 72h + 7d operator alerts
// ============================================================

export async function escalateStuckIntakes(ctx: CronContext): Promise<CronResult> {
  const result = emptyResult();

  const seventyTwoHoursAgo = new Date(ctx.now);
  seventyTwoHoursAgo.setHours(seventyTwoHoursAgo.getHours() - 72);

  const { data: escalationCases } = await ctx.supabase
    .from("cases")
    .select("id, email, tier, created_at")
    .eq("status", "awaiting-intake")
    .lt("created_at", seventyTwoHoursAgo.toISOString());

  if (escalationCases && escalationCases.length > 0) {
    for (const escCase of escalationCases) {
      const caseAge = ctx.now.getTime() - new Date(escCase.created_at).getTime();
      const daysSincePaid = Math.round(caseAge / (1000 * 60 * 60 * 24));
      const isSevenDay = caseAge > 7 * 24 * 60 * 60 * 1000;
      const escalationKey = isSevenDay
        ? `intake_escalation_7d_${escCase.id}`
        : `intake_escalation_72h_${escCase.id}`;

      const { data: escSub } = await ctx.supabase
        .from("subscribers")
        .select("id")
        .eq("email", escCase.email.toLowerCase())
        .maybeSingle();

      if (escSub?.id) {
        const { data: alreadyEscalated } = await ctx.supabase
          .from("drip_emails")
          .select("id")
          .eq("subscriber_id", escSub.id)
          .eq("email_key", escalationKey)
          .maybeSingle();

        if (alreadyEscalated) continue;
      }

      await sendEmail({
        to: ctx.operatorEmail,
        subject: isSevenDay
          ? `URGENT: Customer paid ${daysSincePaid} days ago — no intake (consider refund)`
          : `ALERT: Customer paid ${daysSincePaid} days ago — still no intake`,
        html: `<h1 style="color: ${isSevenDay ? "#EF4444" : "#F59E0B"};">${isSevenDay ? "Customer May Need Refund" : "Intake Still Missing"}</h1>
          <p>Customer paid <strong>${daysSincePaid} days ago</strong> and has not submitted their intake form.</p>
          <div style="background: #1C1917; padding: 24px; border-radius: 12px; margin: 16px 0; border-left: 4px solid ${isSevenDay ? "#EF4444" : "#F59E0B"};">
            <p style="margin: 0; color: #D4D4D8;"><strong style="color: white;">Customer:</strong> ${escapeHtml(escCase.email)}</p>
            <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Tier:</strong> ${escapeHtml(escCase.tier)}</p>
            <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Case ID:</strong> ${escCase.id}</p>
            <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Paid:</strong> ${new Date(escCase.created_at).toISOString()}</p>
          </div>
          <p><strong>Action:</strong> ${isSevenDay ? "Consider reaching out directly or initiating a refund." : "Send a personal follow-up email."}</p>`,
      }, { category: "operator-alert", case_id: escCase.id, metadata: { reason: "intake-escalation", days: daysSincePaid } });

      {
        let subId = escSub?.id;
        if (!subId) {
          const { data: newSub } = await ctx.supabase
            .from("subscribers")
            .upsert({ email: escCase.email.toLowerCase(), source: "checkout" }, { onConflict: "email" })
            .select("id")
            .single();
          subId = newSub?.id;
        }
        if (subId) {
          await ctx.supabase.from("drip_emails").insert({
            subscriber_id: subId,
            email_key: escalationKey,
          });
        }
      }
    }
  }

  return result;
}
