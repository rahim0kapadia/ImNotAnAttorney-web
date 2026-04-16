/**
 * @file Parts 12, 15, 16, Pipeline operations
 *
 * Part 12: Missed evaluation safety net (re-trigger eval for cases stuck in review)
 * Part 15: Stuck job detection (processing_jobs > 30 min)
 * Part 16: Pipeline completion check (all jobs done -> review)
 */

import { sendEmail, escapeHtml } from "@/lib/email";
import { tierDisplayName } from "@/lib/tiers";
import type { CronContext, CronResult } from "./types";
import { emptyResult } from "./types";

// ============================================================
// PART 12: MISSED EVALUATION SAFETY NET
// ============================================================
// FIX: The fire-and-forget fetch() is now properly awaited with
// error handling instead of silently dropping failures.

export async function retriggerMissedEvaluations(ctx: CronContext): Promise<CronResult> {
  const result = emptyResult();

  const fifteenMinAgo = new Date(ctx.now.getTime() - 15 * 60 * 1000).toISOString();
  const { data: missingEvals } = await ctx.supabase
    .from("cases")
    .select("id, tier")
    .eq("status", "review")
    .is("eval_results", null)
    .lt("generated_at", fifteenMinAgo)
    .limit(5);

  if (missingEvals && missingEvals.length > 0) {
    for (const c of missingEvals) {
      try {
        const res = await fetch(`${ctx.siteUrl}/api/evaluate/${c.tier}`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${ctx.operatorSecret}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ caseId: c.id }),
        });
        if (!res.ok) {
          console.error(`[Cron] Eval re-trigger failed: ${res.status}`);
          result.errors++;
        }
      } catch (err) {
        console.error(`[Cron] Eval re-trigger error:`, err);
        result.errors++;
      }
    }
    console.log(`[Drip Cron] Part 12: Re-triggered evaluation for ${missingEvals.length} cases`);
  }

  return result;
}

// ============================================================
// PART 15: STUCK JOB DETECTION (processing_jobs > 30 min)
// ============================================================

export async function detectStuckJobs(ctx: CronContext): Promise<CronResult> {
  const result = emptyResult();

  const thirtyMinutesAgo = new Date(ctx.now);
  thirtyMinutesAgo.setMinutes(thirtyMinutesAgo.getMinutes() - 30);

  const { data: stuckJobs } = await ctx.supabase
    .from("processing_jobs")
    .select("id, case_id, job_type, job_subtype, started_at, worker_id")
    .eq("status", "processing")
    .lt("started_at", thirtyMinutesAgo.toISOString())
    .limit(100);

  if (stuckJobs && stuckJobs.length > 0) {
    for (const job of stuckJobs) {
      const minutesStuck = Math.round(
        (ctx.now.getTime() - new Date(job.started_at!).getTime()) / (1000 * 60)
      );

      // Mark job as failed
      await ctx.supabase
        .from("processing_jobs")
        .update({
          status: "failed",
          error_message: `Auto-detected: stuck in processing for ${minutesStuck} minutes`,
        })
        .eq("id", job.id);

      // Create operator task
      await ctx.supabase.from("operator_tasks").insert({
        case_id: job.case_id,
        task_type: "stuck_job",
        title: `Stuck job: ${job.job_type}${job.job_subtype ? ` (${job.job_subtype})` : ""}, ${minutesStuck}min`,
        description: `Processing job ${job.id} has been stuck for ${minutesStuck} minutes. Worker: ${job.worker_id || "unknown"}. Automatically marked as failed.`,
        priority: "HIGH",
        priority_rank: 2,
      });

      result.errors++;
    }
    console.log(`[Drip Cron] Part 15: Marked ${stuckJobs.length} stuck jobs as failed`);
  }

  return result;
}

// ============================================================
// PART 16: PIPELINE COMPLETION CHECK (all jobs done -> review)
// ============================================================

export async function checkPipelineCompletion(ctx: CronContext): Promise<CronResult> {
  const result = emptyResult();

  const discoveryTiers = ["x-ray", "war-room", "situation-room"];
  const { data: processingCases } = await ctx.supabase
    .from("cases")
    .select("id, email, tier, charge_type, document_count, finding_count, witness_count, discovery_health_score, defense_opportunity_index")
    .eq("status", "processing")
    .in("tier", discoveryTiers)
    .limit(100);

  if (processingCases && processingCases.length > 0) {
    // ── N+1 FIX: Batch-fetch all processing jobs for all cases ──
    const caseIds = processingCases.map((pc) => pc.id);
    const { data: batchJobs } = await ctx.supabase
      .from("processing_jobs")
      .select("case_id, status")
      .in("case_id", caseIds)
      .limit(5000);

    const jobsByCaseId = new Map<string, { case_id: string; status: string }[]>();
    for (const job of batchJobs ?? []) {
      if (!jobsByCaseId.has(job.case_id)) jobsByCaseId.set(job.case_id, []);
      jobsByCaseId.get(job.case_id)!.push(job);
    }

    for (const pc of processingCases) {
      const caseJobs = jobsByCaseId.get(pc.id);

      if (!caseJobs || caseJobs.length === 0) continue;

      const totalJobs = caseJobs.length;
      const completedJobs = caseJobs.filter((j) => j.status === "completed").length;
      const failedJobs = caseJobs.filter((j) => j.status === "failed").length;
      const doneJobs = completedJobs + failedJobs;

      if (doneJobs >= totalJobs) {
        // All jobs are done, transition to review
        await ctx.supabase
          .from("cases")
          .update({ status: "review", updated_at: ctx.now.toISOString() })
          .eq("id", pc.id)
          .eq("status", "processing"); // Atomic guard

        const tierLabel = tierDisplayName(pc.tier);
        const doiScore = pc.defense_opportunity_index &&
          typeof pc.defense_opportunity_index === "object" &&
          "overall" in pc.defense_opportunity_index
            ? (pc.defense_opportunity_index as Record<string, number>).overall
            : null;
        const healthScore = typeof pc.discovery_health_score === "number" ? pc.discovery_health_score : null;

        // Priority assessment
        let priorityLine = "";
        if (healthScore !== null && healthScore < 40) {
          priorityLine = `<p style="color: #EF4444; margin: 16px 0 0;"><strong>Low discovery health, potential gaps. Prioritize review.</strong></p>`;
        } else if (doiScore !== null && doiScore > 70) {
          priorityLine = `<p style="color: #F59E0B; margin: 16px 0 0;"><strong>High defense opportunity, strong defense angles identified.</strong></p>`;
        } else if (healthScore === null && doiScore === null) {
          priorityLine = `<p style="color: #A1A1AA; margin: 16px 0 0;">Scores not yet calculated.</p>`;
        }

        await sendEmail({
          to: ctx.operatorEmail,
          subject: `${tierLabel} ready for review, ${pc.finding_count || 0} findings, ${completedJobs}/${totalJobs} jobs${failedJobs > 0 ? ` (${failedJobs} failed)` : ""}`,
          html: `<h1 style="color: #22C55E;">Pipeline Complete, Ready for Review</h1>
            <p>All processing jobs for this ${escapeHtml(tierLabel)} case have finished.</p>
            <div style="background: #1C1917; padding: 24px; border-radius: 12px; margin: 16px 0; border-left: 4px solid #22C55E;">
              <p style="margin: 0; color: #D4D4D8;"><strong style="color: white;">Customer:</strong> ${escapeHtml(pc.email)}</p>
              <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Tier:</strong> ${escapeHtml(tierLabel)}</p>
              <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Charge Type:</strong> ${escapeHtml(pc.charge_type || "Unknown")}</p>
              <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Jobs:</strong> ${completedJobs} completed, ${failedJobs} failed, ${totalJobs} total</p>
              <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Case ID:</strong> ${pc.id}</p>
            </div>
            <div style="background: #1C1917; padding: 24px; border-radius: 12px; margin: 16px 0; border-left: 4px solid #F59E0B;">
              <p style="margin: 0; color: #D4D4D8; font-weight: bold; color: white;">Pipeline Results</p>
              <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Documents Analyzed:</strong> ${pc.document_count || 0}</p>
              <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Findings Identified:</strong> ${pc.finding_count || 0}</p>
              <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Witnesses Identified:</strong> ${pc.witness_count || 0}</p>
              ${healthScore !== null ? `<p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Discovery Strength Rating:</strong> ${healthScore}/100</p>` : ""}
              ${doiScore !== null ? `<p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Prosecution Case Weakness Analysis:</strong> ${doiScore}</p>` : ""}
            </div>
            ${priorityLine}
            ${failedJobs > 0 ? `<p style="color: #F59E0B;"><strong>Warning:</strong> ${failedJobs} job(s) failed. Review failed jobs before delivering the report.</p>` : ""}
            <p><strong>Action:</strong> Review the case and approve delivery when ready.</p>`,
        }, { category: "operator-alert", case_id: pc.id, metadata: { reason: "pipeline-complete", completed: completedJobs, failed: failedJobs, total: totalJobs } });

        console.log(`[Drip Cron] Part 16: Case ${pc.id} transitioned to review (${completedJobs}/${totalJobs} jobs, ${failedJobs} failed)`);
      }
    }
  }

  return result;
}
