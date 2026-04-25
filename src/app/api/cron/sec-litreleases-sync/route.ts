/**
 * @file /api/cron/sec-litreleases-sync, Daily SEC Litigation Releases sync.
 *
 * Scrapes the SEC Enforcement Litigation Releases index page
 * (https://www.sec.gov/enforcement-litigation/litigation-releases)
 * with incremental semantics — stops as soon as it reaches an LR number
 * already in the database. Upserts new rows into
 * public.sec_litigation_releases.
 *
 * Plan: docs/plans/2026-04-23-free-data-sources-full-load.md — P1 #11.
 * Source: https://www.sec.gov/enforcement-litigation/litigation-releases
 * Product unlock: War Room $4,997 (white-collar defendants) + IB $997
 * federal charging-pattern context.
 *
 * Schedule: Daily at 07:00 UTC via cron-job.org.
 * Protected by CRON_AUTH_TOKEN (requireCron).
 * Idempotent via acquireCronLock.
 *
 * SEC HARD requirement: every request carries an identifying User-Agent
 * of the form "<Company Name> <contact-email>". Default UAs return 403.
 */

import { NextRequest, NextResponse, after } from "next/server";
import { requireCron } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";
import { acquireCronLock, releaseCronLock } from "@/lib/cron-idempotency";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

// ── Config ────────────────────────────────────────────────────────────────

const BASE =
  "https://www.sec.gov/enforcement-litigation/litigation-releases";

const USER_AGENT =
  "ImNotAnAttorney legalinfo@imnotanattorney.com";

const REQ_DELAY_MS = 200; // 5 req/sec; SEC allows up to 10/sec.
const MAX_PAGES = 20; // Cron only reaches back ~2,000 releases worst case — ample for daily catch-up.

// ── Types ─────────────────────────────────────────────────────────────────

type Row = {
  lr_number: number;
  title: string;
  release_date: string;
  release_ts: string;
  url: string;
  see_also: Array<{ url: string; label: string }> | null;
};

// ── Fetch ─────────────────────────────────────────────────────────────────

async function fetchPage(page: number): Promise<string> {
  const url = page === 0 ? BASE : `${BASE}?page=${page}`;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": USER_AGENT,
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9",
          "Accept-Language": "en-US,en;q=0.9",
        },
        signal: AbortSignal.timeout(60_000),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(
          `SEC ${res.status} on page=${page}: ${body.slice(0, 200)}`,
        );
      }
      return await res.text();
    } catch (e) {
      lastErr = e;
      if (attempt < 3) {
        await new Promise((r) => setTimeout(r, 1000 * attempt));
      }
    }
  }
  throw lastErr;
}

// ── Parse ─────────────────────────────────────────────────────────────────
// See scripts/ingest/scrape-sec-litreleases.mjs for parser provenance.
// Markup is SEC's Drupal theme; both parsers share the same extraction
// shape and are locked by the same snapshot (2026-04-24). If SEC renames
// the theme class, both break together and both need the same one-line fix.

function cleanText(s: string | null | undefined): string | null {
  if (s == null) return null;
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseRows(html: string): Row[] {
  const parts = html.split(/<tr\s+class="pr-list-page-row"\s*>/i);
  const rows: Row[] = [];
  for (let i = 1; i < parts.length; i++) {
    const end = parts[i].indexOf("</tr>");
    if (end < 0) continue;
    const frag = parts[i].slice(0, end);

    const mTime = /<time[^>]*datetime="([^"]+)"/i.exec(frag);
    const mLink =
      /href=['"]?(\/enforcement-litigation\/litigation-releases\/lr-\d+)['"]?[^>]*>([\s\S]*?)<\/a>/i.exec(
        frag,
      );
    const mLR =
      /<span\s+class="view-table_subfield_value"\s*>\s*LR-(\d+)\s*<\/span>/i.exec(
        frag,
      );
    if (!mTime || !mLink || !mLR) continue;

    const iso = mTime[1];
    const ts = new Date(iso);
    if (!Number.isFinite(ts.getTime())) continue;

    const lrNum = parseInt(mLR[1], 10);
    const path = mLink[1].replace(/'/g, "");
    const title = cleanText(mLink[2]);
    if (!title || !Number.isFinite(lrNum)) continue;

    const pdfs: Array<{ url: string; label: string }> = [];
    const pdfRe =
      /<a[^>]*href="(\/files\/litigation\/litreleases\/[^"]+\.pdf)"[^>]*>([\s\S]*?)<\/a>/gi;
    let m;
    while ((m = pdfRe.exec(frag))) {
      pdfs.push({
        url: `https://www.sec.gov${m[1]}`,
        label: cleanText(m[2]) || "PDF",
      });
    }

    rows.push({
      lr_number: lrNum,
      title,
      release_date: ts.toISOString().slice(0, 10),
      release_ts: ts.toISOString(),
      url: `https://www.sec.gov${path}`,
      see_also: pdfs.length > 0 ? pdfs : null,
    });
  }
  return rows;
}

// ── Sync ──────────────────────────────────────────────────────────────────

async function runSync(): Promise<{
  pagesScanned: number;
  newRows: number;
  stoppedAt: string;
}> {
  const supabase = createAdminClient();

  // Existing maximum — incremental stop-marker.
  const { data: maxRow, error: maxErr } = await supabase
    .from("sec_litigation_releases")
    .select("lr_number")
    .order("lr_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (maxErr) throw new Error(`supabase max query: ${maxErr.message}`);
  const existingMax = maxRow?.lr_number ?? 0;

  const newRows: Row[] = [];
  let pagesScanned = 0;
  let stoppedAt: string = "completed all pages";

  for (let page = 0; page < MAX_PAGES; page++) {
    const html = await fetchPage(page);
    const rows = parseRows(html);
    pagesScanned++;
    if (rows.length === 0) {
      stoppedAt = `empty page at ${page}`;
      break;
    }
    let hitExisting = false;
    for (const r of rows) {
      if (r.lr_number <= existingMax) {
        hitExisting = true;
        break;
      }
      newRows.push(r);
    }
    if (hitExisting) {
      stoppedAt = `reached existing max LR-${existingMax} at page ${page}`;
      break;
    }
    await new Promise((r) => setTimeout(r, REQ_DELAY_MS));
  }

  if (newRows.length === 0) {
    return { pagesScanned, newRows: 0, stoppedAt };
  }

  // Upsert via Supabase client — new rows only, small batch, no chunking needed.
  const payload = newRows.map((r) => ({
    lr_number: r.lr_number,
    title: r.title,
    release_date: r.release_date,
    release_ts: r.release_ts,
    url: r.url,
    see_also: r.see_also,
  }));
  const { error: upsertErr } = await supabase
    .from("sec_litigation_releases")
    .upsert(payload, { onConflict: "lr_number" });
  if (upsertErr) {
    throw new Error(`supabase upsert: ${upsertErr.message}`);
  }

  return { pagesScanned, newRows: newRows.length, stoppedAt };
}

// ── Handler ───────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = requireCron(req);
  if (!auth.authorized) return auth.error;

  const lock = await acquireCronLock(
    "sec-litreleases-sync",
    23 * 60 * 60 * 1000,
    { staleThresholdMs: 360_000 },
  );
  if (!lock.shouldRun) {
    return NextResponse.json({ skipped: true, reason: lock.reason });
  }

  after(async () => {
    try {
      const result = await runSync();
      console.log(
        `[Cron/sec-litreleases-sync] OK — pages=${result.pagesScanned} new=${result.newRows} stopped=${result.stoppedAt}`,
      );
      await releaseCronLock(lock.executionId, "completed");
    } catch (err) {
      console.error("[Cron/sec-litreleases-sync] Failed:", err);
      await releaseCronLock(lock.executionId, "failed");
    }
  });

  return NextResponse.json({
    status: "started",
    executionId: lock.executionId,
  });
}
