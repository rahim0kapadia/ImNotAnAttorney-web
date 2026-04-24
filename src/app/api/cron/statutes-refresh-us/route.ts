/**
 * @file /api/cron/statutes-refresh-us — Weekly USC refresh via hash-diff.
 *
 * Fetches the 15 seeded Cornell LII USC sections, parses, recomputes
 * SHA-256 over (titleText + blank line + bodyText), compares to the stored
 * text_hash. Only rows whose hash changed get UPDATEd — preserves
 * canonical_id, refreshes section_text + text_hash + scraped_at.
 *
 * Source of truth for USC coverage:
 *   `scripts/ingest/seed-statutes-us-cornell.mjs` USC_SECTIONS constant.
 *   This route duplicates the 15 entries intentionally — TS routes can't
 *   import .mjs cleanly across the build boundary, and the list is small
 *   + slow-moving. Drift is caught by the unit test below.
 *
 * Auth: requireCron (Bearer CRON_AUTH_TOKEN).
 * Schedule: Monday 13:00 ET weekly (registered separately via
 *   scripts/register-statutes-refresh-us-cron.mjs).
 * SSRF defense: hostname allowlist on www.law.cornell.edu only.
 *
 * Idempotency: cron-job.org MAY fire duplicate requests on retry. Each run
 * SELECTs current hashes, UPDATEs only rows where hash differs. Multiple
 * concurrent runs converge on the same post-state (no divergence).
 */
import { type NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";
import { acquireCronLock, releaseCronLock } from "@/lib/cron-idempotency";
import crypto from "node:crypto";

export const runtime = "nodejs";
export const maxDuration = 60;

interface UscTarget {
  title: string;
  section: string;
  label: string;
}

// Duplicated from scripts/ingest/seed-statutes-us-cornell.mjs. Drift-locked
// by the USC_TARGETS_COVERAGE_LOCK const — if anyone edits this list without
// editing the seed script (or vice versa), the drift-lock test fails.
const USC_TARGETS: UscTarget[] = [
  { title: "18", section: "371", label: "Conspiracy to commit offense" },
  { title: "18", section: "922", label: "Firearms - unlawful acts" },
  { title: "18", section: "924", label: "Firearms - penalties" },
  { title: "18", section: "1001", label: "False statements" },
  { title: "18", section: "1028", label: "Identity fraud" },
  { title: "18", section: "1343", label: "Wire fraud" },
  { title: "18", section: "1951", label: "Hobbs Act - robbery / extortion" },
  { title: "18", section: "2113", label: "Bank robbery" },
  { title: "18", section: "3553", label: "Sentencing factors" },
  // v2 expansion (2026-04-24): prompt-reference gaps per audit.
  { title: "18", section: "2",    label: "Aiding and abetting" },
  { title: "18", section: "201",  label: "Bribery of a public official" },
  { title: "18", section: "1201", label: "Federal kidnapping" },
  { title: "18", section: "1341", label: "Mail fraud" },
  { title: "18", section: "1347", label: "Health care fraud" },
  { title: "18", section: "1503", label: "Obstruction of justice" },
  { title: "18", section: "1519", label: "Destruction of records" },
  { title: "18", section: "1546", label: "Immigration document fraud" },
  { title: "18", section: "1621", label: "Perjury" },
  { title: "18", section: "1962", label: "RICO - racketeering" },
  { title: "18", section: "2252", label: "Child pornography possession" },
  { title: "21", section: "841", label: "Controlled substance - manufacture/distribute" },
  { title: "21", section: "844", label: "Controlled substance - simple possession" },
  { title: "21", section: "846", label: "Controlled substance - conspiracy" },
  { title: "21", section: "853", label: "Controlled substance - forfeiture" },
  { title: "26", section: "7201", label: "Tax evasion" },
  { title: "8", section: "1101", label: "Immigration - definitions" },
  { title: "8", section: "1227", label: "Deportable aliens" },
  { title: "8", section: "1325", label: "Illegal entry" },
  { title: "8", section: "1326", label: "Illegal reentry" },
];

// Lock string — exported for the drift-lock unit test to pin against.
// Increment when intentionally changing USC_TARGETS (and update the seed
// script + its test fixture in the same PR).
export const USC_TARGETS_COVERAGE_LOCK = "v2:29-sections";

const ALLOWED_HOSTNAMES = new Set(["www.law.cornell.edu", "law.cornell.edu"]);

function buildSectionUrl(title: string, section: string): string {
  return `https://www.law.cornell.edu/uscode/text/${title}/${section}`;
}

function isAllowedHost(urlStr: string): boolean {
  try {
    const u = new URL(urlStr);
    if (u.protocol !== "https:") return false;
    return ALLOWED_HOSTNAMES.has(u.hostname.toLowerCase());
  } catch {
    return false;
  }
}

// ── Inline parser (scoped to USC refresh only) ──────────────────────────
// Identical semantics to scripts/ingest/lib/cornell-html.mjs — both files
// MUST stay in lockstep so the hash computed here matches the stored one.
export function stripHtml(html: string): string {
  if (!html) return "";
  let s = html;
  s = s.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ");
  s = s.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ");
  s = s.replace(/<!--[\s\S]*?-->/g, " ");
  s = s.replace(/<br\s*\/?\s*>/gi, "\n");
  s = s.replace(/<\/p>/gi, "\n\n");
  s = s.replace(/<\/div>/gi, "\n");
  s = s.replace(/<[^>]+>/g, " ");
  s = s
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#(\d+);/g, (_m, n) => decodeNumEntity(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, n) => decodeNumEntity(Number.parseInt(String(n), 16)));
  s = s.replace(/<[^>]+>/g, " ");
  // Drop C0 (except \t\n\r) + DEL.
  let out = "";
  for (const ch of s) {
    const c = ch.charCodeAt(0);
    if (c === 9 || c === 10 || c === 13) {
      out += ch;
      continue;
    }
    if (c < 32 || c === 127) continue;
    out += ch;
  }
  return out.split(/\s+/).filter(Boolean).join(" ").trim();
}

function decodeNumEntity(code: number): string {
  if (!Number.isInteger(code) || code < 0 || code > 0x10ffff) return "";
  if (code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d) return "";
  if (code === 0x7f) return "";
  if (code >= 0xd800 && code <= 0xdfff) return "";
  return String.fromCodePoint(code);
}

export interface ParsedSection {
  titleText: string;
  bodyText: string;
}

export function parseSectionPage(
  html: string,
  title: string,
  section: string,
): ParsedSection | null {
  if (!html || html.length < 500) return null;
  if (html.indexOf("section you requested does not exist") >= 0) return null;

  let titleText: string | null = null;
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1) {
    const h1Text = stripHtml(h1[1]).trim();
    let splitIdx = -1;
    let splitLen = 0;
    for (const sep of [" - ", " – ", " — "]) {
      const i = h1Text.indexOf(sep);
      if (i > 0 && (splitIdx < 0 || i < splitIdx)) {
        splitIdx = i;
        splitLen = sep.length;
      }
    }
    titleText = splitIdx > 0 ? h1Text.slice(splitIdx + splitLen).trim() : h1Text;
  }
  if (!titleText) titleText = `Section ${section}`;

  const tabStart = html.indexOf('<div class="tab-pane active" id="tab_default_1">');
  if (tabStart < 0) return null;
  const afterOpen = html.indexOf(">", tabStart) + 1;
  const tab2 = html.indexOf('id="tab_default_2"', afterOpen);
  const textClose = html.indexOf("</text>", afterOpen);
  const candidates = [tab2, textClose].filter((n) => n > 0);
  const end = candidates.length ? Math.min(...candidates) : html.length;
  const slice = html.slice(afterOpen, end);
  let bodyText = stripHtml(slice);

  const pubLIdx = bodyText.lastIndexOf("(Pub. L.");
  if (pubLIdx > 0 && pubLIdx > bodyText.length * 0.6) {
    bodyText = bodyText.slice(0, pubLIdx).trim();
  }
  if (bodyText.length > 20000) bodyText = bodyText.slice(0, 20000).trim();
  if (!bodyText || bodyText.length < 20) return null;

  void title; // parameter reserved for symmetry; not used here
  return { titleText, bodyText };
}

export function computeSectionHash(titleText: string, bodyText: string): {
  sectionText: string;
  textHash: string;
} {
  const sectionText =
    (titleText ? `${titleText.trim()}\n\n` : "") + bodyText.trim();
  const textHash = crypto.createHash("sha256").update(sectionText).digest("hex");
  return { sectionText, textHash };
}

// ── Route handler ────────────────────────────────────────────────────────
interface RefreshResult {
  title: string;
  section: string;
  status: "fetch_failed" | "parse_failed" | "unchanged" | "updated" | "missing_row";
  note?: string;
}

export { USC_TARGETS };

export async function refreshOne(
  target: UscTarget,
  supabase: ReturnType<typeof createAdminClient>,
  fetchImpl: typeof fetch,
): Promise<RefreshResult> {
  const url = buildSectionUrl(target.title, target.section);
  if (!isAllowedHost(url)) {
    return { title: target.title, section: target.section, status: "fetch_failed", note: "host_denied" };
  }
  let html: string;
  try {
    // redirect: "manual" — SSRF defense. If Cornell 3xx-redirects off the
    // allowlist (misconfig, DNS rebinding, open-redirect), we reject rather
    // than transparently follow. W1 from 2026-04-24 security audit.
    const r = await fetchImpl(url, {
      headers: {
        "User-Agent": "INAA-legal-research/1.0 (+https://imnotanattorney.com/about)",
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "manual",
    });
    if (r.status >= 300 && r.status < 400) {
      const loc = r.headers.get("location");
      if (!loc || !isAllowedHost(loc)) {
        return { title: target.title, section: target.section, status: "fetch_failed", note: `redirect off-allowlist` };
      }
      // Follow ONE hop to the allowlisted location. Cornell occasionally
      // renders http→https redirects; this stays within the allowlist.
      const r2 = await fetchImpl(loc, {
        headers: {
          "User-Agent": "INAA-legal-research/1.0 (+https://imnotanattorney.com/about)",
          Accept: "text/html,application/xhtml+xml",
        },
        redirect: "manual",
      });
      if (!r2.ok) {
        return { title: target.title, section: target.section, status: "fetch_failed", note: `HTTP ${r2.status} (after redirect)` };
      }
      html = await r2.text();
    } else if (!r.ok) {
      return { title: target.title, section: target.section, status: "fetch_failed", note: `HTTP ${r.status}` };
    } else {
      html = await r.text();
    }
  } catch (e) {
    return {
      title: target.title,
      section: target.section,
      status: "fetch_failed",
      note: e instanceof Error ? e.message.slice(0, 80) : "err",
    };
  }

  const parsed = parseSectionPage(html, target.title, target.section);
  if (!parsed) {
    return { title: target.title, section: target.section, status: "parse_failed" };
  }
  const { sectionText, textHash } = computeSectionHash(parsed.titleText, parsed.bodyText);

  const { data: existing, error: selErr } = await supabase
    .from("entities_statutes")
    .select("canonical_id, text_hash")
    .eq("jurisdiction", "US")
    .eq("title", target.title)
    .eq("section", target.section)
    .eq("is_current", true)
    .maybeSingle();

  if (selErr) {
    return { title: target.title, section: target.section, status: "fetch_failed", note: `select: ${selErr.message.slice(0, 60)}` };
  }
  if (!existing) {
    return { title: target.title, section: target.section, status: "missing_row" };
  }
  if (existing.text_hash === textHash) {
    return { title: target.title, section: target.section, status: "unchanged" };
  }
  const { error: updErr } = await supabase
    .from("entities_statutes")
    .update({
      section_text: sectionText,
      text_hash: textHash,
      scraped_at: new Date().toISOString(),
      source_urls: [url],
    })
    .eq("canonical_id", existing.canonical_id);
  if (updErr) {
    return { title: target.title, section: target.section, status: "fetch_failed", note: `update: ${updErr.message.slice(0, 60)}` };
  }
  return { title: target.title, section: target.section, status: "updated" };
}

export async function GET(req: NextRequest) {
  // SEC-C1 fix: requireCron returns {authorized, error} — not truthy on auth-
  // success. Use the sibling-route pattern.
  const auth = requireCron(req);
  if (!auth.authorized) return auth.error;

  // SEC-W2 fix: prevent concurrent retries from double-fetching Cornell
  // (pattern parity with court-reminders + blog-generate-queue). 23h lock
  // window since schedule is weekly; a failed run releases the lock so the
  // next weekly fire can retry.
  const lock = await acquireCronLock("statutes-refresh-us", 23 * 60 * 60 * 1000);
  if (!lock.shouldRun) {
    return NextResponse.json({ skipped: true, reason: lock.reason });
  }

  const startedAt = Date.now();
  const supabase = createAdminClient();
  const results: RefreshResult[] = [];
  try {
    for (const target of USC_TARGETS) {
      const result = await refreshOne(target, supabase, fetch);
      results.push(result);
      // 0.5-2s random delay between fetches — same rate model as the seed.
      // Math.random is non-cryptographic; that's fine for rate jitter.
      await new Promise((r) => setTimeout(r, 500 + Math.floor(Math.random() * 1500)));
    }
    const summary = {
      updated: results.filter((r) => r.status === "updated").length,
      unchanged: results.filter((r) => r.status === "unchanged").length,
      parse_failed: results.filter((r) => r.status === "parse_failed").length,
      fetch_failed: results.filter((r) => r.status === "fetch_failed").length,
      missing_row: results.filter((r) => r.status === "missing_row").length,
      duration_ms: Date.now() - startedAt,
    };
    await releaseCronLock(lock.executionId, "completed");
    return NextResponse.json({ ok: true, summary, results });
  } catch (e) {
    await releaseCronLock(lock.executionId, "failed");
    throw e;
  }
}
