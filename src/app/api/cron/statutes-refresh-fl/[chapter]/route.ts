/**
 * @file /api/cron/statutes-refresh-fl/[chapter] — Weekly FL per-chapter refresh.
 *
 * One endpoint per FL statute chapter from the seed (316, 775, 784, 810, 812,
 * 893). Fetches the index, discovers section numbers, parallel-fetches each
 * section, recomputes SHA-256 over (titleText + blank + bodyText), compares
 * to stored text_hash, UPDATEs only drifted rows.
 *
 * Parallel fetch (concurrency=5) keeps ch316 (282 sections) inside the
 * maxDuration=300 budget. Rate courtesy to FL Online Sunshine is preserved:
 * 5 concurrent × 0.5-2s random delay ≈ 1 req/100-400ms sustained, same-scale
 * as the seed script that FL already accepted.
 *
 * Source of truth for FL coverage:
 *   scripts/ingest/seed-statutes-fl.mjs FL_CHAPTERS constant.
 *   This route duplicates the 6 chapter→range pairs intentionally (same
 *   scoping decision as statutes-refresh-us — TS routes can't cleanly
 *   import .mjs across the build boundary).
 *
 * Auth: requireCron (Bearer CRON_AUTH_TOKEN).
 * Schedule: Monday 16:00-16:50 UTC staggered (one slot per chapter,
 *   registered by scripts/register-statutes-refresh-fl-cron.mjs).
 * SSRF defense: hostname allowlist on www.leg.state.fl.us only + redirect
 *   manual + re-validate Location.
 * Idempotency: acquireCronLock per-chapter + hash-diff UPDATE is
 *   idempotent-by-construction (concurrent runs converge on same state).
 */
import { type NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";
import { acquireCronLock, releaseCronLock } from "@/lib/cron-idempotency";
import crypto from "node:crypto";

export const runtime = "nodejs";
// ch316 has 282 sections. At 5-way parallel + 0.5-2s random delay per
// fetch, worst case is ~60-90s. 300s leaves comfortable headroom.
export const maxDuration = 300;

interface FlChapterMeta {
  range: string;
  description: string;
}

// Mirrors FL_CHAPTERS in scripts/ingest/seed-statutes-fl.mjs. Drift-locked
// by FL_CHAPTERS_COVERAGE_LOCK below + test assertion.
export const FL_CHAPTERS: Record<string, FlChapterMeta> = {
  "316": { range: "0300-0399", description: "Traffic / DUI" },
  "775": { range: "0700-0799", description: "Penalties" },
  "784": { range: "0700-0799", description: "Assault / battery" },
  "810": { range: "0800-0899", description: "Burglary" },
  "812": { range: "0800-0899", description: "Theft / robbery" },
  "893": { range: "0800-0899", description: "Drug abuse prevention" },
};

export const FL_CHAPTERS_COVERAGE_LOCK = "v1:6-chapters";

const ALLOWED_HOSTNAMES = new Set(["www.leg.state.fl.us", "leg.state.fl.us"]);
const FL_BASE = "https://www.leg.state.fl.us/statutes/index.cfm?App_mode=Display_Statute&URL=";

const USER_AGENT = "INAA-legal-research/1.0 (+https://imnotanattorney.com/about)";
const FETCH_CONCURRENCY = 5;

function buildChapterIndexUrl(chapter: string): string {
  const meta = FL_CHAPTERS[chapter];
  if (!meta) throw new Error(`Unknown chapter ${chapter}`);
  const pad = chapter.padStart(4, "0");
  return FL_BASE + meta.range + "/" + pad + "/" + pad + "ContentsIndex.html";
}

function buildSectionUrl(chapter: string, section: string): string {
  const meta = FL_CHAPTERS[chapter];
  if (!meta) throw new Error(`Unknown chapter ${chapter}`);
  const pad = chapter.padStart(4, "0");
  // FL section filenames use padded chapter: 0893.13.html, NOT 893.13.html.
  // Unpadded returns a generic fallback (200 OK with wrong body).
  const dot = section.indexOf(".");
  const rest = dot >= 0 ? section.slice(dot) : "." + section;
  return FL_BASE + meta.range + "/" + pad + "/Sections/" + pad + rest + ".html";
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

// ── Inline parser (scoped to FL refresh only) ───────────────────────────
// Must stay in lockstep with scripts/ingest/lib/fl-html.mjs so the hash
// computed here matches the stored one. Same semantic ports as the Cornell
// parser in statutes-refresh-us: tags-first / decode-second / second-pass
// strip / drop C0+DEL+surrogates.
function decodeNumEntity(code: number): string {
  if (!Number.isInteger(code) || code < 0 || code > 0x10ffff) return "";
  if (code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d) return "";
  if (code === 0x7f) return "";
  if (code >= 0xd800 && code <= 0xdfff) return "";
  return String.fromCodePoint(code);
}

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
  let out = "";
  for (const ch of s) {
    const c = ch.charCodeAt(0);
    if (c === 9 || c === 10 || c === 13) { out += ch; continue; }
    if (c < 32 || c === 127) continue;
    out += ch;
  }
  return out.split(/\s+/).filter(Boolean).join(" ").trim();
}

function isSectionNotFound(html: string): boolean {
  if (!html) return true;
  if (html.length < 200) return true;
  if (html.indexOf("Statute does not exist") >= 0) return true;
  if (html.indexOf("The Statute you requested does not exist") >= 0) return true;
  return false;
}

export function extractSectionNumbers(html: string, chapter: string): string[] {
  if (!html) return [];
  const seen = new Set<string>();
  const pad = chapter.padStart(4, "0");
  const urlRx = new RegExp("/Sections/" + pad + "\\.([\\w]+)\\.html", "gi");
  let m: RegExpExecArray | null;
  while ((m = urlRx.exec(html)) !== null) {
    if (!/^\d+$/.test(m[1])) continue;
    seen.add(chapter + "." + m[1]);
  }
  // W4 fix: free-form fallback if anchor-scoped URL regex finds nothing.
  // Matches fl-html.mjs:96-102 so seed + refresh discovery stay symmetric
  // under non-standard FL chapter-index markup.
  if (seen.size === 0) {
    const sectionRx = new RegExp("\\b" + chapter + "\\.(\\d+)\\b", "g");
    let mm: RegExpExecArray | null;
    while ((mm = sectionRx.exec(html)) !== null) {
      seen.add(chapter + "." + mm[1]);
    }
  }
  return [...seen].sort((a, b) => {
    const as = Number.parseInt(a.split(".")[1] ?? "0", 10);
    const bs = Number.parseInt(b.split(".")[1] ?? "0", 10);
    return as - bs;
  });
}

export interface ParsedSection {
  titleText: string;
  bodyText: string;
  effectiveDate: string | null;
}

export function parseSectionPage(html: string, chapter: string, section: string): ParsedSection | null {
  if (isSectionNotFound(html)) return null;

  const statutesStart = html.indexOf('<div id="statutes"');
  const workHtml = statutesStart >= 0 ? html.slice(statutesStart) : html;

  let titleText: string | null = null;
  const catchMatch = workHtml.match(/<span\b[^>]*class="[^"]*CatchlineText[^"]*"[^>]*>([\s\S]*?)<\/span>/i);
  if (catchMatch) titleText = stripHtml(catchMatch[1]);
  if (!titleText) {
    const titleMatch = html.match(/<title>\s*([^<]*?)\s*<\/title>/i);
    if (titleMatch) {
      let t = titleMatch[1].trim();
      t = t.replace(/^F\.S\.\s+/i, "").trim();
      t = t.replace(new RegExp("^" + chapter + "\\.\\d+\\s*[—\\-–]?\\s*"), "").trim();
      t = t.replace(/\s*[-–—]\s*Florida\s+Statutes?\s*$/i, "").trim();
      if (/Online\s+Sunshine/i.test(t) || /Statutes\s*&\s*Constitution/i.test(t)) titleText = null;
      else titleText = t;
    }
  }
  if (!titleText) titleText = `Section ${section}`;

  let bodyText: string | null = null;
  const bodyStart = workHtml.search(/<span\b[^>]*class="[^"]*SectionBody[^"]*"[^>]*>/i);
  if (bodyStart >= 0) {
    const afterOpen = workHtml.indexOf(">", bodyStart) + 1;
    const closeIdx = workHtml.toLowerCase().indexOf("</body>", afterOpen);
    const slice = closeIdx > 0 ? workHtml.slice(afterOpen, closeIdx) : workHtml.slice(afterOpen);
    bodyText = stripHtml(slice);
  } else {
    bodyText = stripHtml(workHtml);
  }

  const historyMatch = bodyText.match(/History\.\s*[—–-]/);
  if (historyMatch && historyMatch.index !== undefined && historyMatch.index > 20) {
    bodyText = bodyText.slice(0, historyMatch.index).trim();
  }
  if (bodyStart < 0) {
    const sectionIdx = bodyText.indexOf(section);
    if (sectionIdx > 0 && sectionIdx < bodyText.length / 3) bodyText = bodyText.slice(sectionIdx).trim();
  }
  if (bodyText.length > 20000) bodyText = bodyText.slice(0, 20000).trim();
  if (!bodyText || bodyText.length < 20) return null;

  // W3 fix: parse effective_date too so refresh doesn't leave it stale
  // forever after FL amends a statute. Mirrors fl-html.mjs:201-219.
  let effectiveDate: string | null = null;
  let effHaystack = workHtml;
  if (bodyStart >= 0) {
    const afterOpen = workHtml.indexOf(">", bodyStart) + 1;
    const closeIdx = workHtml.toLowerCase().indexOf("</body>", afterOpen);
    effHaystack = closeIdx > 0 ? workHtml.slice(afterOpen, closeIdx) : workHtml.slice(afterOpen);
  }
  const em = effHaystack.match(/Effective\s+(\d{1,2})\/(\d{1,2})\/(\d{4})/i);
  if (em) {
    const mm = String(em[1]).padStart(2, "0");
    const dd = String(em[2]).padStart(2, "0");
    const candidate = em[3] + "-" + mm + "-" + dd;
    const d = new Date(candidate + "T00:00:00Z");
    if (!Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === candidate) {
      effectiveDate = candidate;
    }
  }

  return { titleText, bodyText, effectiveDate };
}

export function computeSectionHash(titleText: string, bodyText: string) {
  const sectionText = (titleText ? `${titleText.trim()}\n\n` : "") + bodyText.trim();
  const textHash = crypto.createHash("sha256").update(sectionText).digest("hex");
  return { sectionText, textHash };
}

// ── Fetch with redirect-manual SSRF defense ──────────────────────────────
async function safeFetch(url: string, fetchImpl: typeof fetch): Promise<{ html?: string; note?: string }> {
  if (!isAllowedHost(url)) return { note: "host_denied" };
  try {
    const r = await fetchImpl(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml" },
      redirect: "manual",
    });
    if (r.status >= 300 && r.status < 400) {
      const loc = r.headers.get("location");
      if (!loc || !isAllowedHost(loc)) return { note: "redirect off-allowlist" };
      const r2 = await fetchImpl(loc, {
        headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml" },
        redirect: "manual",
      });
      if (!r2.ok) return { note: `HTTP ${r2.status} (after redirect)` };
      return { html: await r2.text() };
    }
    if (!r.ok) return { note: `HTTP ${r.status}` };
    return { html: await r.text() };
  } catch (e) {
    return { note: e instanceof Error ? e.message.slice(0, 80) : "err" };
  }
}

// Concurrency-limited parallel map.
async function parallelMap<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let idx = 0;
  async function worker() {
    while (true) {
      const i = idx++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

interface RefreshResult {
  section: string;
  status: "unchanged" | "updated" | "parse_failed" | "fetch_failed" | "missing_row";
  note?: string;
}

export async function refreshChapter(
  chapter: string,
  supabase: ReturnType<typeof createAdminClient>,
  fetchImpl: typeof fetch,
): Promise<{ sections_discovered: number; results: RefreshResult[] }> {
  const indexUrl = buildChapterIndexUrl(chapter);
  const indexFetch = await safeFetch(indexUrl, fetchImpl);
  if (!indexFetch.html) {
    return { sections_discovered: 0, results: [{ section: "INDEX", status: "fetch_failed", note: indexFetch.note }] };
  }
  const sections = extractSectionNumbers(indexFetch.html, chapter);
  if (sections.length === 0) {
    return { sections_discovered: 0, results: [] };
  }

  const results = await parallelMap(sections, FETCH_CONCURRENCY, async (section) => {
    // W2 fix: 0.5-2s rate parity with the seed script. Under 5-way
    // concurrency sustained throughput is ≈4-10 req/s — courtesy-aligned
    // with what FL Online Sunshine accepted during the original seed.
    await new Promise((r) => setTimeout(r, 500 + Math.floor(Math.random() * 1500)));
    const url = buildSectionUrl(chapter, section);
    const f = await safeFetch(url, fetchImpl);
    if (!f.html) return { section, status: "fetch_failed" as const, note: f.note };
    const parsed = parseSectionPage(f.html, chapter, section);
    if (!parsed) return { section, status: "parse_failed" as const };
    const { sectionText, textHash } = computeSectionHash(parsed.titleText, parsed.bodyText);

    const { data: existing, error: selErr } = await supabase
      .from("entities_statutes")
      .select("canonical_id, text_hash")
      .eq("jurisdiction", "FL")
      .eq("title", chapter)
      .eq("section", section)
      .eq("is_current", true)
      .maybeSingle();
    if (selErr) return { section, status: "fetch_failed" as const, note: `select: ${selErr.message.slice(0, 60)}` };
    if (!existing) return { section, status: "missing_row" as const };
    if (existing.text_hash === textHash) return { section, status: "unchanged" as const };

    const updatePatch: Record<string, unknown> = {
      section_text: sectionText,
      text_hash: textHash,
      scraped_at: new Date().toISOString(),
      source_urls: [url],
    };
    // W3 fix: if the page exposes an effective_date, keep the DB column
    // current. When absent (common on older sections) leave the existing
    // value alone rather than NULL-wiping verified seed data.
    if (parsed.effectiveDate) updatePatch.effective_date = parsed.effectiveDate;

    const { error: updErr } = await supabase
      .from("entities_statutes")
      .update(updatePatch)
      .eq("canonical_id", existing.canonical_id);
    if (updErr) return { section, status: "fetch_failed" as const, note: `update: ${updErr.message.slice(0, 60)}` };
    return { section, status: "updated" as const };
  });

  return { sections_discovered: sections.length, results };
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ chapter: string }> }) {
  const auth = requireCron(req);
  if (!auth.authorized) return auth.error;

  const { chapter } = await ctx.params;
  if (!chapter || !FL_CHAPTERS[chapter]) {
    return NextResponse.json(
      { error: `Chapter ${chapter} not recognized. Valid: ${Object.keys(FL_CHAPTERS).join(",")}` },
      { status: 400 },
    );
  }

  // W1 fix from 2026-04-24 code review: staleThresholdMs must exceed
  // maxDuration so a long-running ch316 (~60-90s) isn't prematurely declared
  // stale and steamrolled by a cron-job.org retry.
  const lock = await acquireCronLock(
    `statutes-refresh-fl-${chapter}`,
    23 * 60 * 60 * 1000,
    { staleThresholdMs: 360_000 },
  );
  if (!lock.shouldRun) {
    return NextResponse.json({ skipped: true, reason: lock.reason });
  }

  const startedAt = Date.now();
  const supabase = createAdminClient();
  try {
    const { sections_discovered, results } = await refreshChapter(chapter, supabase, fetch);
    const summary = {
      chapter,
      sections_discovered,
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

// FL_CHAPTERS exported at declaration (line 46).
