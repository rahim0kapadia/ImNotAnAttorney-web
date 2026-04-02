/**
 * @file /api/cron/blog-qa — Blog draft quality assurance pipeline
 *
 * Processes up to 2 blog drafts per run through 3 sequential quality gates:
 *   1. Humanizer check (pure TS, no API) — detects AI-generated writing patterns
 *   2. Slop / A1 audit (Anthropic Sonnet) — 14 editorial quality checks
 *   3. UPL compliance check (Anthropic Sonnet) — 15 unauthorized-practice-of-law criteria
 *
 * After all gates:
 *   - All pass  → status = 'qa-passed', content_gaps status = 'qa-passed'
 *   - Any fail  → status = 'qa-failed', qa_attempts incremented
 *   - 3 attempts exhausted → status = 'declined', content_gaps status = 'declined'
 *
 * Protected by CRON_SECRET bearer token.
 * Idempotency lock: "blog-qa", 23h window.
 */

import { NextRequest, NextResponse, after } from "next/server";
import { requireCron } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";
import { acquireCronLock, releaseCronLock } from "@/lib/cron-idempotency";
import { runHumanizerCheck } from "@/lib/blog-generation/qa-humanizer";
import { runSlopAudit } from "@/lib/blog-generation/qa-slop";
import { runUPLCheck } from "@/lib/blog-generation/qa-upl";
import type { BlogDraft } from "@/lib/types/blog-pipeline";

export const maxDuration = 120;
export const dynamic = "force-dynamic";

interface DraftQAResult {
  slug: string;
  passed: boolean;
  failures: string[];
}

export async function GET(req: NextRequest) {
  // ── Auth ──
  const auth = requireCron(req);
  if (!auth.authorized) return auth.error;

  // ── Idempotency guard (prevent duplicate runs within 23h window) ──
  const lock = await acquireCronLock("blog-qa", 23 * 60 * 60 * 1000);
  if (!lock.shouldRun) {
    return NextResponse.json({ skipped: true, reason: lock.reason });
  }

  // Return 200 immediately so cron-job.org (30s free-plan cap) doesn't
  // report a false timeout. The actual work runs post-response via after().
  after(async () => {
    const supabase = createAdminClient();

    try {
      // ── Fetch eligible drafts ──
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const { data: drafts, error: fetchError } = await supabase
        .from("blog_drafts")
        .select("*")
        .or(`status.eq.draft,and(status.eq.qa-failed,qa_attempts.lt.3),and(status.eq.qa-running,updated_at.lt.${tenMinutesAgo})`)
        .order("created_at", { ascending: true })
        .limit(2);

      if (fetchError) {
        console.error("[Cron/blog-qa] Failed to fetch drafts:", fetchError.message);
        await releaseCronLock(lock.executionId, "failed");
        return;
      }

      if (!drafts || drafts.length === 0) {
        await releaseCronLock(lock.executionId, "completed");
        return;
      }

      for (const draft of drafts as BlogDraft[]) {
        // Claim draft immediately to prevent concurrent runs from picking it up
        await supabase
          .from("blog_drafts")
          .update({ status: "qa-running", updated_at: new Date().toISOString() })
          .eq("id", draft.id);

        await processDraft(draft, supabase);
      }

      await releaseCronLock(lock.executionId, "completed");
    } catch (err) {
      console.error("[Cron/blog-qa] Fatal error:", err);
      await releaseCronLock(lock.executionId, "failed");
    }
  });

  return NextResponse.json({ status: "started", executionId: lock.executionId });
}

/**
 * Run all 3 QA gates on a single draft. Updates the DB based on outcome.
 */
async function processDraft(
  draft: BlogDraft,
  supabase: ReturnType<typeof createAdminClient>
): Promise<DraftQAResult> {
  const failures: string[] = [];

  console.log(`[Cron/blog-qa] Processing draft: ${draft.slug} (attempt ${draft.qa_attempts + 1})`);

  // ── Gate 1: Humanizer check ──────────────────────────────────────────────────
  let humanizerScore: number | null = null;
  let humanizerDetails = null;

  try {
    const humanizerResult = runHumanizerCheck(draft.mdx_content);
    humanizerScore = humanizerResult.score;
    humanizerDetails = humanizerResult.details;

    if (!humanizerResult.passed) {
      failures.push(
        `humanizer: composite score ${humanizerResult.score} >= 45 (pattern=${humanizerResult.details.pattern_score}, uniformity=${humanizerResult.details.uniformity_score})`
      );
      console.log(`[Cron/blog-qa] ${draft.slug}: humanizer FAILED (score=${humanizerResult.score})`);
    } else {
      console.log(`[Cron/blog-qa] ${draft.slug}: humanizer PASSED (score=${humanizerResult.score})`);
    }
  } catch (err) {
    failures.push(`humanizer: check threw an error — ${err}`);
    console.error(`[Cron/blog-qa] ${draft.slug}: humanizer error:`, err);
  }

  // ── Gate 2: Slop / A1 audit ──────────────────────────────────────────────────
  let a1Result = null;
  let a1Details = null;

  try {
    const slopResult = await runSlopAudit(draft.mdx_content, supabase);
    a1Result = slopResult.result;
    a1Details = slopResult.details;

    if (!slopResult.passed) {
      const hardFails = slopResult.details.hard_gate_failures;
      const summary =
        hardFails.length > 0
          ? `hard gate failures: ${hardFails.join(", ")}`
          : `only ${slopResult.details.checks_passed}/${slopResult.details.checks_total} checks passed`;
      failures.push(`slop: ${summary}`);
      console.log(`[Cron/blog-qa] ${draft.slug}: slop audit FAILED (${summary})`);
    } else {
      console.log(
        `[Cron/blog-qa] ${draft.slug}: slop audit PASSED (${a1Details.checks_passed}/${a1Details.checks_total})`
      );
    }
  } catch (err) {
    failures.push(`slop: audit threw an error — ${err}`);
    console.error(`[Cron/blog-qa] ${draft.slug}: slop audit error:`, err);
  }

  // ── Gate 3: UPL compliance check ─────────────────────────────────────────────
  let uplResult = null;
  let uplDetails = null;

  try {
    const upl = await runUPLCheck(draft.mdx_content);
    uplResult = upl.result;
    uplDetails = upl.details;

    if (!upl.passed) {
      const failCount = uplDetails.criteria_total - uplDetails.criteria_passed;
      failures.push(`upl: ${failCount} criteria failed`);
      console.log(
        `[Cron/blog-qa] ${draft.slug}: UPL FAILED (${uplDetails.criteria_passed}/${uplDetails.criteria_total} passed)`
      );
    } else {
      console.log(
        `[Cron/blog-qa] ${draft.slug}: UPL PASSED (${uplDetails.criteria_passed}/${uplDetails.criteria_total})`
      );
    }
  } catch (err) {
    failures.push(`upl: check threw an error — ${err}`);
    console.error(`[Cron/blog-qa] ${draft.slug}: UPL error:`, err);
  }

  // ── Persist QA data and update status ────────────────────────────────────────
  const allPassed = failures.length === 0;
  const newAttempts = draft.qa_attempts + 1;
  const attemptsExhausted = !allPassed && newAttempts >= 3;

  if (allPassed) {
    // All 3 gates passed — promote to qa-passed
    const { error: draftErr } = await supabase
      .from("blog_drafts")
      .update({
        status: "qa-passed",
        qa_passed_at: new Date().toISOString(),
        humanizer_score: humanizerScore,
        humanizer_details: humanizerDetails,
        a1_result: a1Result,
        a1_details: a1Details,
        upl_result: uplResult,
        upl_details: uplDetails,
        updated_at: new Date().toISOString(),
      })
      .eq("id", draft.id);

    if (draftErr) {
      console.error(`[Cron/blog-qa] ${draft.slug}: failed to update draft status:`, draftErr.message);
    }

    const { error: gapErr } = await supabase
      .from("content_gaps")
      .update({ status: "qa-passed" })
      .eq("id", draft.content_gap_id);

    if (gapErr) {
      console.error(`[Cron/blog-qa] ${draft.slug}: failed to update content_gap status:`, gapErr.message);
    }
  } else if (attemptsExhausted) {
    // 3 attempts used — decline
    const { error: draftErr } = await supabase
      .from("blog_drafts")
      .update({
        status: "declined",
        qa_attempts: newAttempts,
        humanizer_score: humanizerScore ?? draft.humanizer_score,
        humanizer_details: humanizerDetails ?? draft.humanizer_details,
        a1_result: a1Result ?? draft.a1_result,
        a1_details: a1Details ?? draft.a1_details,
        upl_result: uplResult ?? draft.upl_result,
        upl_details: uplDetails ?? draft.upl_details,
        updated_at: new Date().toISOString(),
      })
      .eq("id", draft.id);

    if (draftErr) {
      console.error(`[Cron/blog-qa] ${draft.slug}: failed to decline draft:`, draftErr.message);
    }

    const { error: gapErr } = await supabase
      .from("content_gaps")
      .update({ status: "declined" })
      .eq("id", draft.content_gap_id);

    if (gapErr) {
      console.error(`[Cron/blog-qa] ${draft.slug}: failed to decline content_gap:`, gapErr.message);
    }

    console.log(`[Cron/blog-qa] ${draft.slug}: DECLINED after ${newAttempts} attempts`);
  } else {
    // One or more gates failed but attempts remain — mark qa-failed
    const { error: draftErr } = await supabase
      .from("blog_drafts")
      .update({
        status: "qa-failed",
        qa_attempts: newAttempts,
        humanizer_score: humanizerScore ?? draft.humanizer_score,
        humanizer_details: humanizerDetails ?? draft.humanizer_details,
        a1_result: a1Result ?? draft.a1_result,
        a1_details: a1Details ?? draft.a1_details,
        upl_result: uplResult ?? draft.upl_result,
        upl_details: uplDetails ?? draft.upl_details,
        updated_at: new Date().toISOString(),
      })
      .eq("id", draft.id);

    if (draftErr) {
      console.error(`[Cron/blog-qa] ${draft.slug}: failed to update qa-failed status:`, draftErr.message);
    }

    console.log(
      `[Cron/blog-qa] ${draft.slug}: qa-failed (attempt ${newAttempts}/3), failures: ${failures.join("; ")}`
    );
  }

  return { slug: draft.slug, passed: allPassed, failures };
}
