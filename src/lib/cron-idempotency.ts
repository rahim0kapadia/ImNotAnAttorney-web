/**
 * @fileoverview Cron idempotency guard — prevents duplicate execution across serverless instances.
 *
 * Uses a `cron_executions` table in Supabase as a distributed lock.
 * This replaces the pg_try_advisory_lock() RPC which is unreliable with
 * Supabase's connection pooler (locks are session-scoped but pooled connections
 * are shared, so the lock may be acquired and released on different connections).
 *
 * ## Usage
 *
 * ```typescript
 * import { acquireCronLock, releaseCronLock } from '@/lib/cron-idempotency';
 *
 * export async function GET(req: NextRequest) {
 *   const auth = requireCron(req);
 *   if (!auth.authorized) return auth.error;
 *
 *   const lock = await acquireCronLock('my-job', 23 * 60 * 60 * 1000);
 *   if (!lock.shouldRun) {
 *     return NextResponse.json({ skipped: true, reason: lock.reason });
 *   }
 *   try {
 *     // ... job logic ...
 *     await releaseCronLock(lock.executionId!, 'completed');
 *   } catch (e) {
 *     await releaseCronLock(lock.executionId!, 'failed');
 *     throw e;
 *   }
 * }
 * ```
 *
 * ## Fail-open design
 *
 * If the idempotency check itself fails (DB error), the job runs anyway.
 * It is better to double-run a job than to never run it. Double-runs are
 * detectable in logs; silent skips are invisible.
 *
 * ## Stale lock recovery
 *
 * If a previous run crashed mid-execution, its lock row will be stuck in
 * `status = 'running'`. Locks older than the staleThresholdMs (default 5 minutes)
 * are treated as stale and marked `failed`, allowing the new run to proceed.
 */

import { createAdminClient } from "@/lib/supabase/admin";

export interface IdempotencyResult {
  shouldRun: boolean;
  executionId?: string;
  reason?: string;
}

/**
 * Attempts to acquire a distributed execution lock for the given cron job.
 *
 * @param jobName - Unique identifier for the cron job (e.g. 'drip', 'reconcile')
 * @param intervalMs - Minimum interval between runs in milliseconds.
 *   Use 23h (23 * 60 * 60 * 1000) for daily jobs to give a 1h buffer against
 *   clock drift and scheduler jitter.
 * @param options.staleThresholdMs - How long a 'running' lock is considered active
 *   before being treated as stale (crashed run). Default: 5 minutes. Override for
 *   long-running jobs — e.g. demand-fetch has maxDuration=300s so use 360_000.
 * @returns IdempotencyResult — if shouldRun is false, the caller must return
 *   immediately without executing job logic.
 */
export async function acquireCronLock(
  jobName: string,
  intervalMs: number,
  options?: { staleThresholdMs?: number }
): Promise<IdempotencyResult> {
  try {
    const supabase = createAdminClient();
    const cutoff = new Date(Date.now() - intervalMs).toISOString();

    // Check for a recent completed or still-running execution within the window
    const { data: recent, error: fetchError } = await supabase
      .from("cron_executions")
      .select("id, status, started_at")
      .eq("job_name", jobName)
      .gte("started_at", cutoff)
      .in("status", ["running", "completed"])
      .order("started_at", { ascending: false })
      .limit(1);

    if (fetchError) {
      // Fail-open: if we can't check, let the job run
      console.warn(`[cron-idempotency] DB fetch error for "${jobName}", failing open:`, fetchError.message);
      return { shouldRun: true };
    }

    if (recent && recent.length > 0) {
      const entry = recent[0];

      if (entry.status === "running") {
        const ageMs = Date.now() - new Date(entry.started_at).getTime();
        const staleThresholdMs = options?.staleThresholdMs ?? 5 * 60 * 1000; // default 5 minutes

        if (ageMs < staleThresholdMs) {
          // Another instance is actively running — skip
          return {
            shouldRun: false,
            reason: `Already running (started ${entry.started_at}, ${Math.round(ageMs / 1000)}s ago)`,
          };
        }

        // Stale lock — previous run crashed. Mark it failed so we can proceed.
        console.warn(`[cron-idempotency] Stale lock for "${jobName}" (${Math.round(ageMs / 1000)}s old), marking failed`);
        await supabase
          .from("cron_executions")
          .update({ status: "failed", completed_at: new Date().toISOString() })
          .eq("id", entry.id);
      } else {
        // status === 'completed' — already ran within the window
        return {
          shouldRun: false,
          reason: `Already completed at ${entry.started_at}`,
        };
      }
    }

    // Insert a running lock row to claim this execution slot
    const { data: lock, error: insertError } = await supabase
      .from("cron_executions")
      .insert({
        job_name: jobName,
        status: "running",
        started_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (insertError || !lock) {
      // Could be a race condition where another instance inserted first.
      // Fail-open: let this instance try to run (both may run, which is acceptable).
      console.warn(`[cron-idempotency] Lock insert failed for "${jobName}", failing open:`, insertError?.message);
      return { shouldRun: true };
    }

    return { shouldRun: true, executionId: lock.id };
  } catch (err) {
    // Catch-all: any unexpected error fails open
    console.warn(`[cron-idempotency] Unexpected error for "${jobName}", failing open:`, err);
    return { shouldRun: true };
  }
}

/**
 * Releases the execution lock by updating the row status.
 *
 * Call with 'completed' on success, 'failed' on error. If executionId is
 * undefined (lock was acquired in fail-open mode), this is a no-op.
 *
 * @param executionId - The UUID returned by acquireCronLock, or undefined if
 *   the lock was acquired in fail-open mode (no row was inserted).
 * @param status - Final execution status.
 */
export async function releaseCronLock(
  executionId: string | undefined,
  status: "completed" | "failed"
): Promise<void> {
  if (!executionId) return; // Fail-open mode — no row to update

  try {
    const supabase = createAdminClient();
    await supabase
      .from("cron_executions")
      .update({ status, completed_at: new Date().toISOString() })
      .eq("id", executionId);
  } catch (err) {
    // Non-fatal — worst case the row stays 'running' and will be treated as
    // stale after 5 minutes on the next invocation
    console.warn(`[cron-idempotency] Failed to release lock ${executionId}:`, err);
  }
}
