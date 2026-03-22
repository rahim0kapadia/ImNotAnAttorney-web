import { SupabaseClient } from "@supabase/supabase-js";

/** Shared context passed to every cron task. */
export interface CronContext {
  supabase: SupabaseClient;
  operatorEmail: string;
  siteUrl: string;
  operatorSecret: string;
  now: Date;
}

/** Result from a single cron task. */
export interface CronResult {
  sent: number;
  skipped: number;
  errors: number;
  cleaned: number;
}

/** Creates a zero-initialized result. */
export function emptyResult(): CronResult {
  return { sent: 0, skipped: 0, errors: 0, cleaned: 0 };
}

/** Merges multiple results into one. */
export function mergeResults(...results: CronResult[]): CronResult {
  return results.reduce(
    (acc, r) => ({
      sent: acc.sent + r.sent,
      skipped: acc.skipped + r.skipped,
      errors: acc.errors + r.errors,
      cleaned: acc.cleaned + r.cleaned,
    }),
    emptyResult()
  );
}
