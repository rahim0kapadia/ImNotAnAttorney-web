/**
 * @file /api/cron/refresh-pji — Quarterly pattern jury instructions refresh check.
 *
 * For each cached circuit PDF URL:
 *   1. HEAD check (dead-link monitor — T47)
 *   2. Fetch + compute SHA-256 + compare against stored `source_pdf_sha256`
 *   3. Write per-circuit result to `pji_cron_runs` with HTTP status + SHA + drift flag (T53)
 *   4. SSRF hostname allowlist — reject any URL not under uscourts.gov (T51)
 *   5. SHA algorithm lock — assumes sha256 (T50 enforces at schema level)
 *
 * Drift or dead-link → Telegram alert.
 * Auth: requireCron (Bearer CRON_AUTH_TOKEN).
 * Schedule: quarterly (cron-job.org jobId 7508991).
 */
import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";
import crypto from "node:crypto";

export const runtime = "nodejs";
export const maxDuration = 60;

const ALLOWED_HOST_SUFFIX = ".uscourts.gov";

const CIRCUIT_URLS: { circuit: number; url: string }[] = [
  { circuit: 1, url: "https://www.rid.uscourts.gov/sites/rid/files/documents/juryinstructions/PJI.pdf" },
  { circuit: 6, url: "https://www.ca6.uscourts.gov/sites/ca6/files/documents/pattern_jury/pdf/crmpattjur_full.pdf" },
  { circuit: 7, url: "https://juryinstruction.ca7.uscourts.gov/jury-instructions/instructions/criminal/Bauer_pattern_criminal_jury_instructions_2022updates.pdf" },
  { circuit: 8, url: "https://juryinstructions.ca8.uscourts.gov/instructions/criminal/Criminal-Jury-Instructions.pdf" },
  { circuit: 9, url: "https://www.ce9.uscourts.gov/jury-instructions/sites/default/files/WPD/Criminal_Instructions_2025_03.pdf" },
  { circuit: 10, url: "https://www.ca10.uscourts.gov/sites/ca10/files/documents/downloads/2025%20Criminal%20Pattern%20Jury%20Instructions.pdf" },
];

function isAllowedHost(url: string): boolean {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    return host === "uscourts.gov" || host.endsWith(ALLOWED_HOST_SUFFIX);
  } catch {
    return false;
  }
}

interface FetchResult {
  sha: string | null;
  status: number;
  contentLength: number | null;
  error?: string;
}

async function sha256Pdf(url: string): Promise<FetchResult> {
  if (!isAllowedHost(url)) {
    return { sha: null, status: 0, contentLength: null, error: "SSRF: host not in uscourts.gov allowlist" };
  }
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": "ImNotAnAttorney PJI refresh bot (support@imnotanattorney.com)" },
      redirect: "follow",
    });
    if (!r.ok) {
      return { sha: null, status: r.status, contentLength: null, error: `HTTP ${r.status} ${r.statusText}` };
    }
    const buf = Buffer.from(await r.arrayBuffer());
    const sha = crypto.createHash("sha256").update(buf).digest("hex");
    const lenHeader = r.headers.get("content-length");
    return {
      sha,
      status: r.status,
      contentLength: lenHeader ? Number(lenHeader) : buf.length,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { sha: null, status: 0, contentLength: null, error: msg };
  }
}

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
    /* swallow */
  }
}

export async function GET(req: NextRequest) {
  const authed = requireCron(req);
  if (!authed.authorized) return authed.error;

  const supabase = createAdminClient();
  const { data: storedRows, error: storedErr } = await supabase
    .from("pattern_jury_instructions")
    .select("circuit, source_pdf_sha256")
    .not("source_pdf_sha256", "is", null);
  if (storedErr) return NextResponse.json({ error: storedErr.message }, { status: 500 });

  const storedMap = new Map<number, string>();
  for (const r of storedRows ?? []) {
    if (r.source_pdf_sha256 && !storedMap.has(r.circuit)) storedMap.set(r.circuit, r.source_pdf_sha256);
  }

  const results: {
    circuit: number;
    current_sha: string | null;
    stored_sha: string | null;
    status: number;
    content_length: number | null;
    drifted: boolean;
    dead_link: boolean;
    error: string | null;
  }[] = [];
  let drifted = 0;
  let deadLinks = 0;

  for (const cir of CIRCUIT_URLS) {
    const res = await sha256Pdf(cir.url);
    const stored = storedMap.get(cir.circuit) ?? null;
    const isDrift = Boolean(res.sha && stored && res.sha !== stored);
    const isDead = res.status !== 200 || res.sha === null;
    if (isDrift) drifted++;
    if (isDead) deadLinks++;
    const row = {
      circuit: cir.circuit,
      current_sha: res.sha,
      stored_sha: stored,
      status: res.status,
      content_length: res.contentLength,
      drifted: isDrift,
      dead_link: isDead,
      error: res.error ?? null,
    };
    results.push(row);
    // Persist to pji_cron_runs (T53)
    await supabase.from("pji_cron_runs").insert({
      circuit: cir.circuit,
      url: cir.url,
      http_status: res.status,
      content_length: res.contentLength,
      sha256: res.sha,
      drifted: isDrift,
      error_message: res.error ?? null,
    });
  }

  // Telegram alert on drift OR dead links
  if (drifted > 0 || deadLinks > 0) {
    const parts: string[] = [];
    if (drifted > 0) {
      parts.push(`*PJI drift detected* — ${drifted} circuit(s) updated upstream:`);
      for (const r of results.filter((x) => x.drifted)) {
        parts.push(`  • Circuit ${r.circuit}: ${r.stored_sha?.slice(0, 8)}... → ${r.current_sha?.slice(0, 8)}...`);
      }
    }
    if (deadLinks > 0) {
      parts.push(`\n*PJI dead-link(s) detected* — ${deadLinks} circuit(s) unreachable:`);
      for (const r of results.filter((x) => x.dead_link)) {
        parts.push(`  • Circuit ${r.circuit}: HTTP ${r.status}${r.error ? ` (${r.error})` : ""}`);
      }
    }
    parts.push(`\nRe-run: \`node scripts/ingest/pji-ingest.mjs\``);
    await sendTelegram(parts.join("\n"));
  }

  return NextResponse.json({
    ok: true,
    timestamp: new Date().toISOString(),
    drifted_count: drifted,
    dead_link_count: deadLinks,
    results,
  });
}
