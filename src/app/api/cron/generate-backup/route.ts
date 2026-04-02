/**
 * @file /api/cron/generate-backup — Trigger backup report generator via GitHub Actions
 *
 * Called by cron-job.org every 5 minutes. Dispatches the generate-report.yml
 * workflow which picks up Case Decoder reports stuck in "generating" status
 * (Edge Function timeout backup).
 *
 * Architecture:
 *   cron-job.org -> (HTTP GET) -> this Vercel route -> (GitHub API) -> workflow_dispatch
 *   -> GitHub Actions runner -> checks for stuck cases -> generates if found
 *
 * Env vars required:
 *   CRON_SECRET        — Bearer token for cron-job.org auth
 *   ENGINE_DISPATCH_PAT  — GitHub PAT with workflow dispatch permission
 */

import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";
import { acquireCronLock, releaseCronLock } from "@/lib/cron-idempotency";

export const runtime = "nodejs";
export const maxDuration = 10;

const GITHUB_REPO_OWNER = "rahim0kapadia";
const GITHUB_REPO_NAME = "ImNotAnAttorney-web";
const WORKFLOW_FILE = "generate-report.yml";

export async function GET(req: NextRequest) {
  const auth = requireCron(req);
  if (!auth.authorized) return auth.error;

  // Idempotency lock — 4min window prevents overlapping 5-min cron runs
  const lock = await acquireCronLock("generate-backup", 4 * 60 * 1000);
  if (!lock.shouldRun) {
    return NextResponse.json({ skipped: true, reason: lock.reason });
  }

  const githubPat = process.env.ENGINE_DISPATCH_PAT;
  if (!githubPat) {
    console.error("[Cron:GenerateBackup] ENGINE_DISPATCH_PAT not configured");
    await releaseCronLock(lock.executionId, "failed");
    return NextResponse.json(
      { error: "Server misconfigured: missing ENGINE_DISPATCH_PAT" },
      { status: 500 }
    );
  }

  try {
    const dispatchUrl = `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/actions/workflows/${WORKFLOW_FILE}/dispatches`;

    const response = await fetch(dispatchUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${githubPat}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ref: "master" }),
    });

    if (response.status === 204) {
      try {
        const supabase = createAdminClient();
        await supabase.from("cron_runs").insert({
          result: { job: "generate-backup", dispatched: true },
        });
      } catch (logErr) {
        console.warn("[Cron:GenerateBackup] Failed to log dispatch:", logErr);
      }

      await releaseCronLock(lock.executionId, "completed");
      return NextResponse.json({
        ok: true,
        message: "Generate-backup workflow dispatched",
        timestamp: new Date().toISOString(),
      });
    }

    const errorBody = await response.text();
    console.error(
      `[Cron:GenerateBackup] GitHub dispatch failed: ${response.status} ${errorBody}`
    );

    await releaseCronLock(lock.executionId, "failed");
    return NextResponse.json(
      { error: "GitHub dispatch failed", status: response.status, detail: errorBody },
      { status: 502 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[Cron:GenerateBackup] Dispatch error: ${message}`);
    await releaseCronLock(lock.executionId, "failed");
    return NextResponse.json(
      { error: "Failed to dispatch generate-backup workflow", detail: message },
      { status: 500 }
    );
  }
}
