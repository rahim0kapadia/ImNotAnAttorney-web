/**
 * @file /api/cron/source-health — Weekly uptime HEAD check on public data sources.
 *
 * Enforces the "no-hallucinated-legal-data.md" HARD RULE invariant: every
 * verified row has a source_url that MUST remain live. If a source dies, we
 * need to know before the next scraper run fails silently.
 *
 * For each registered source:
 *   1. HEAD request (30s timeout, polite UA)
 *   2. Classify status: 200/202/301/302/304 → healthy; everything else → unhealthy
 *   3. Compute consecutive_failures from prior rows
 *   4. Insert into data_source_health_checks
 *
 * After all checks:
 *   - If any source flipped healthy → unhealthy, fire a Telegram alert (new breakage)
 *   - If any source flipped unhealthy → healthy, fire a Telegram alert (recovery)
 *
 * Auth: requireCron (Bearer CRON_AUTH_TOKEN).
 * Schedule: weekly Mon 14:00 UTC via cron-job.org.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 120;

const USER_AGENT = "ImNotAnAttorney source-health bot (support@imnotanattorney.com)";

const HEALTHY_STATUSES = new Set([200, 202, 301, 302, 304]);

// Registered sources — add new rows here when we onboard a new data source.
// Keep URLs canonical (no query strings that change) so consecutive_failures is
// meaningful over time.
const SOURCES: Array<{ slug: string; url: string }> = [
  { slug: "calbar-recent-discipline", url: "https://www.calbar.ca.gov/public/concerns-about-attorney/recent-disciplinary-actions" },
  { slug: "flbar-news-discipline-index", url: "https://www.floridabar.org/news-release-category/disciplinary-action/" },
  { slug: "uh-tx-discipline-archive", url: "https://www.law.uh.edu/libraries/ethics/attydiscipline/" },
  { slug: "ppi-parole-rates", url: "https://www.prisonpolicy.org/data/parolerates_2019_2022.html" },
  { slug: "ao-stfj-caseload-index", url: "https://www.uscourts.gov/statistics-reports/caseload-statistics-data-tables" },
  { slug: "dpic-executions-csv", url: "http://deathpenaltyinfo.org/query/executions.csv" },
  { slug: "courtlistener-api-v4", url: "https://www.courtlistener.com/api/rest/v4/opinions/?limit=1" },
  { slug: "fec-bulk-index", url: "https://www.fec.gov/files/bulk-downloads/" },
  { slug: "cl-bulk-data-root", url: "https://storage.courtlistener.com/bulk-data/" },
];

async function sendTelegram(message: string): Promise<void> {
  const token = process.env.TELEGRAM_ATLAS_BOT_TOKEN;
  const chat = process.env.TELEGRAM_RAHIM_CHAT_ID;
  if (!token || !chat) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chat, text: message, parse_mode: "Markdown" }),
    });
  } catch {
    /* swallow — Telegram failure must not break the cron itself */
  }
}

interface CheckResult {
  slug: string;
  url: string;
  status: number | null;
  responseTimeMs: number;
  contentLength: number | null;
  errorMessage: string | null;
  isHealthy: boolean;
}

async function checkOne(source: { slug: string; url: string }): Promise<CheckResult> {
  const start = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const resp = await fetch(source.url, {
      method: "HEAD",
      headers: { "User-Agent": USER_AGENT },
      redirect: "follow",
      signal: controller.signal,
    });
    clearTimeout(timer);
    const lenHeader = resp.headers.get("content-length");
    return {
      slug: source.slug,
      url: source.url,
      status: resp.status,
      responseTimeMs: Date.now() - start,
      contentLength: lenHeader ? Number(lenHeader) : null,
      errorMessage: null,
      isHealthy: HEALTHY_STATUSES.has(resp.status),
    };
  } catch (e) {
    clearTimeout(timer);
    const msg = e instanceof Error ? e.message : String(e);
    return {
      slug: source.slug,
      url: source.url,
      status: null,
      responseTimeMs: Date.now() - start,
      contentLength: null,
      errorMessage: msg.slice(0, 500),
      isHealthy: false,
    };
  }
}

export async function GET(req: NextRequest) {
  const authed = requireCron(req);
  if (!authed.authorized) return authed.error;

  const started = Date.now();
  const supabase = createAdminClient();

  // 1) Run all checks in parallel (max 30s each, 9 sources → ~30s worst case).
  const results = await Promise.all(SOURCES.map((s) => checkOne(s)));

  // 2) For each result, fetch prior state to compute consecutive_failures
  //    + detect transitions.
  const rowsToInsert = [] as Array<Record<string, unknown>>;
  const transitions: string[] = [];

  for (const r of results) {
    const { data: priorRow } = await supabase
      .from("data_source_health_checks")
      .select("is_healthy, consecutive_failures")
      .eq("source_slug", r.slug)
      .order("checked_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const priorHealthy = priorRow?.is_healthy ?? true; // first run → assume was healthy
    const priorFailures = priorRow?.consecutive_failures ?? 0;
    const consecutiveFailures = r.isHealthy ? 0 : priorFailures + 1;

    rowsToInsert.push({
      source_slug: r.slug,
      source_url: r.url,
      http_status: r.status,
      response_time_ms: r.responseTimeMs,
      content_length: r.contentLength,
      error_message: r.errorMessage,
      is_healthy: r.isHealthy,
      consecutive_failures: consecutiveFailures,
    });

    if (priorHealthy && !r.isHealthy) {
      transitions.push(
        `❌ *${r.slug}* DOWN — status=${r.status ?? "no-response"}${r.errorMessage ? ` (${r.errorMessage})` : ""} — ${r.url}`,
      );
    } else if (!priorHealthy && r.isHealthy) {
      transitions.push(
        `✅ *${r.slug}* RECOVERED after ${priorFailures} consecutive failures — status=${r.status}`,
      );
    }
  }

  // 3) Bulk insert this run.
  if (rowsToInsert.length > 0) {
    const { error } = await supabase.from("data_source_health_checks").insert(rowsToInsert);
    if (error) {
      return NextResponse.json({ error: `insert failed: ${error.message}` }, { status: 500 });
    }
  }

  // 4) Telegram alert on any transition.
  if (transitions.length > 0) {
    const healthy = results.filter((r) => r.isHealthy).length;
    const msg = [
      `*Source-health transitions* (${transitions.length}):`,
      ...transitions,
      ``,
      `Overall: ${healthy}/${results.length} sources healthy`,
    ].join("\n");
    await sendTelegram(msg);
  }

  const healthyCount = results.filter((r) => r.isHealthy).length;

  return NextResponse.json({
    ok: true,
    checked_at: new Date().toISOString(),
    total_sources: results.length,
    healthy: healthyCount,
    unhealthy: results.length - healthyCount,
    transitions: transitions.length,
    elapsed_ms: Date.now() - started,
    results: results.map((r) => ({
      slug: r.slug,
      status: r.status,
      healthy: r.isHealthy,
      ms: r.responseTimeMs,
    })),
  });
}
