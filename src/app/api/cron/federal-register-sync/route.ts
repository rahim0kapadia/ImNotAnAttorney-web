/**
 * @file /api/cron/federal-register-sync, Daily Federal Register action ingest.
 *
 * Fetches Federal Register documents published by criminal-justice agencies
 * (BOP, DEA, FBI, USSC, DOJ) from the public federalregister.gov API and
 * upserts them into public.federal_register_actions.
 *
 * Plan: docs/plans/2026-04-23-free-data-sources-full-load.md — P1 #8.
 * Source: https://www.federalregister.gov/api/v1/documents.json
 * Product unlock: War Room $4,997 regulatory-change monitoring.
 *
 * Schedule: Daily at 06:00 UTC via cron-job.org hitting this endpoint.
 * Protected by CRON_SECRET bearer token (requireCron).
 * Idempotent via acquireCronLock (architectural invariant 3).
 */

import { NextRequest, NextResponse, after } from "next/server";
import { requireCron } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";
import { acquireCronLock, releaseCronLock } from "@/lib/cron-idempotency";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

// ── Config ────────────────────────────────────────────────────────────────

const AGENCIES = [
  "prisons-bureau",
  "drug-enforcement-administration",
  "federal-bureau-of-investigation",
  "united-states-sentencing-commission",
  "justice-department",
];

const USER_AGENT =
  "INAA-Crawler/1.0 (+https://imnotanattorney.com; contact: noreply-legal@inaa.com)";

const PER_PAGE = 200;

// Fetch a rolling window — daily cron only needs the last N days, but we
// overlap by 14 days so that late publications and corrections are caught.
const LOOKBACK_DAYS = 14;

const FIELDS = [
  "document_number",
  "title",
  "abstract",
  "agencies",
  "publication_date",
  "effective_on",
  "type",
  "action",
  "cfr_references",
  "significant",
  "html_url",
  "pdf_url",
];

// ── Helpers ───────────────────────────────────────────────────────────────

type FRDoc = {
  document_number: string;
  title?: string;
  abstract?: string | null;
  agencies?: Array<{ slug?: string; raw_name?: string; name?: string }>;
  publication_date: string;
  effective_on?: string | null;
  type?: string | null;
  action?: string | null;
  cfr_references?: unknown;
  significant?: boolean | null;
  html_url?: string | null;
  pdf_url?: string | null;
};

type FRResponse = {
  count?: number;
  results?: FRDoc[];
};

function sinceDate(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - LOOKBACK_DAYS);
  return d.toISOString().slice(0, 10);
}

function pickSlugs(arr: FRDoc["agencies"]): string[] {
  if (!Array.isArray(arr)) return [];
  return arr
    .map((a) => a?.slug || a?.raw_name || a?.name)
    .filter((s): s is string => typeof s === "string" && s.length > 0);
}

async function fetchPage(
  agency: string,
  page: number,
  since: string,
): Promise<FRResponse> {
  const url = new URL("https://www.federalregister.gov/api/v1/documents.json");
  url.searchParams.append("conditions[agencies][]", agency);
  url.searchParams.set("conditions[publication_date][gte]", since);
  url.searchParams.set("per_page", String(PER_PAGE));
  url.searchParams.set("page", String(page));
  url.searchParams.set("order", "newest");
  for (const f of FIELDS) {
    url.searchParams.append("fields[]", f);
  }
  const res = await fetch(url.toString(), {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Federal Register API ${res.status} on ${agency} p${page}: ${body.slice(0, 200)}`,
    );
  }
  return (await res.json()) as FRResponse;
}

async function runSync(): Promise<{
  agenciesScanned: number;
  uniqueDocs: number;
  upserted: number;
  sinceDate: string;
}> {
  const since = sinceDate();
  const byDoc = new Map<string, FRDoc>();

  for (const agency of AGENCIES) {
    let page = 1;
    // Cap pagination to protect the 5-minute route budget.
    for (; page <= 50; page++) {
      const body = await fetchPage(agency, page, since);
      const results = body.results ?? [];
      for (const r of results) {
        if (!r.document_number) continue;
        if (!byDoc.has(r.document_number)) byDoc.set(r.document_number, r);
      }
      const total = body.count ?? 0;
      if (page * PER_PAGE >= total) break;
      // polite rate limit — federalregister.gov allows 60 req/min
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  const supabase = createAdminClient();
  const rows = Array.from(byDoc.values()).map((r) => ({
    document_number: r.document_number,
    title: r.title?.slice(0, 2000) || "(untitled)",
    abstract: r.abstract ?? null,
    agencies: pickSlugs(r.agencies),
    publication_date: r.publication_date,
    effective_date: r.effective_on ?? null,
    document_type: r.type ?? null,
    action: r.action ?? null,
    cfr_references: r.cfr_references ?? null,
    significant: r.significant ?? null,
    html_url: r.html_url ?? null,
    pdf_url: r.pdf_url ?? null,
    public_inspection: false,
    raw_json: r,
  }));

  // Upsert in chunks to stay well under PostgREST payload limits.
  const CHUNK = 250;
  let upserted = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    const { error } = await supabase
      .from("federal_register_actions")
      .upsert(slice, { onConflict: "document_number" });
    if (error) {
      throw new Error(
        `Supabase upsert failed on chunk ${i / CHUNK}: ${error.message}`,
      );
    }
    upserted += slice.length;
  }

  return {
    agenciesScanned: AGENCIES.length,
    uniqueDocs: byDoc.size,
    upserted,
    sinceDate: since,
  };
}

// ── Handler ───────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = requireCron(req);
  if (!auth.authorized) return auth.error;

  // 23h window: the job fires daily and takes < 5 min; this prevents
  // accidental same-day re-runs while still allowing next-day retries
  // after transient API failures.
  // staleThresholdMs=360_000 (6min) guards against false-expiry of
  // in-flight runs — maxDuration=300s here.
  const lock = await acquireCronLock(
    "federal-register-sync",
    23 * 60 * 60 * 1000,
    { staleThresholdMs: 360_000 },
  );
  if (!lock.shouldRun) {
    return NextResponse.json({ skipped: true, reason: lock.reason });
  }

  // Return 200 immediately so cron-job.org (30s free-plan cap) doesn't
  // false-timeout. Actual work runs post-response via after().
  after(async () => {
    try {
      const result = await runSync();
      console.log(
        `[Cron/federal-register-sync] OK — since=${result.sinceDate} agencies=${result.agenciesScanned} uniqueDocs=${result.uniqueDocs} upserted=${result.upserted}`,
      );
      await releaseCronLock(lock.executionId, "completed");
    } catch (err) {
      console.error("[Cron/federal-register-sync] Failed:", err);
      await releaseCronLock(lock.executionId, "failed");
    }
  });

  return NextResponse.json({
    status: "started",
    executionId: lock.executionId,
  });
}
