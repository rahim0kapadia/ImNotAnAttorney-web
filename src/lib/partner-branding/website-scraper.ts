/**
 * Website brand scraper — pulls a logo URL (and optionally a primary
 * color) from a partner's own website so we can onboard a bondsman
 * who only gave us a URL, not a logo upload.
 *
 * Waterfall (highest to lowest fidelity):
 *   1. JSON-LD Organization `logo` — sites with basic SEO tag it.
 *   2. Open Graph image (`<meta property="og:image">`) — ~70% of sites.
 *   3. Apple touch icon (`<link rel="apple-touch-icon">`) — 128-256px,
 *      nearly universal.
 *   4. Standard favicon (`<link rel="icon">`) — fallback.
 *   5. Google's free favicon service — guaranteed last-resort PNG at
 *      64 or 128px.
 *
 * Every candidate is validated through image-probe.ts before we return
 * it — so a 404, HTML-302, or spoofed Content-Type can't slip through.
 *
 * Theme color: picks up `<meta name="theme-color">` when present.
 * Actual palette extraction happens AFTER we download the logo bytes
 * (caller runs Color Thief on the pixel data).
 */

import * as cheerio from "cheerio";
import { probeImageUrl } from "./image-probe";
import { validateWebsiteUrl } from "./url-guard";

const FETCH_TIMEOUT_MS = 5000;
const MAX_HTML_BYTES = 512 * 1024;
const USER_AGENT = "ImNotAnAttorney-PartnerOnboarding/1.0 (+https://imnotanattorney.com)";

export interface ScrapedBrand {
  logoUrl: string;
  themeColor: string | null;
  source: "jsonld" | "og:image" | "apple-touch-icon" | "icon" | "google-s2";
}

async function fetchHtmlBounded(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: { "user-agent": USER_AGENT, accept: "text/html,*/*" },
    });
    if (!res.ok) return null;
    const type = (res.headers.get("content-type") || "").toLowerCase();
    if (!type.startsWith("text/html") && !type.startsWith("application/xhtml")) return null;
    const reader = res.body?.getReader();
    if (!reader) return null;
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (total < MAX_HTML_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      chunks.push(value);
    }
    try { await reader.cancel(); } catch { /* ignore */ }
    const out = new Uint8Array(total);
    let offset = 0;
    for (const c of chunks) { out.set(c, offset); offset += c.byteLength; }
    return new TextDecoder("utf-8").decode(out);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function resolveUrl(candidate: string, base: string): string | null {
  try {
    return new URL(candidate, base).toString();
  } catch {
    return null;
  }
}

function isHex6(s: string | null | undefined): s is string {
  return typeof s === "string" && /^#[0-9A-Fa-f]{6}$/.test(s.trim());
}

interface Candidate {
  url: string;
  source: ScrapedBrand["source"];
}

export function extractCandidates(html: string, baseUrl: string): Candidate[] {
  const $ = cheerio.load(html);
  const out: Candidate[] = [];

  // 1. JSON-LD Organization.logo — sort by specificity (string wins over array).
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).contents().text().trim();
    if (!raw) return;
    try {
      const parsed: unknown = JSON.parse(raw);
      const nodes = Array.isArray(parsed) ? parsed : [parsed];
      for (const node of nodes) {
        if (typeof node !== "object" || node === null) continue;
        const rec = node as Record<string, unknown>;
        const type = rec["@type"];
        const isOrg = type === "Organization" || (Array.isArray(type) && type.includes("Organization"))
          || type === "LegalService" || type === "LocalBusiness";
        if (!isOrg) continue;
        const logoField = rec.logo;
        if (typeof logoField === "string") {
          const abs = resolveUrl(logoField, baseUrl);
          if (abs) out.push({ url: abs, source: "jsonld" });
        } else if (typeof logoField === "object" && logoField !== null) {
          const lf = logoField as Record<string, unknown>;
          if (typeof lf.url === "string") {
            const abs = resolveUrl(lf.url, baseUrl);
            if (abs) out.push({ url: abs, source: "jsonld" });
          }
        }
      }
    } catch { /* ignore bad JSON-LD */ }
  });

  // 2. Open Graph image
  const og = $('meta[property="og:image"]').attr("content")
    || $('meta[name="og:image"]').attr("content")
    || $('meta[property="og:image:url"]').attr("content");
  if (og) {
    const abs = resolveUrl(og, baseUrl);
    if (abs) out.push({ url: abs, source: "og:image" });
  }

  // 3. Apple touch icon
  $('link[rel="apple-touch-icon"], link[rel="apple-touch-icon-precomposed"]').each((_, el) => {
    const href = $(el).attr("href");
    if (href) {
      const abs = resolveUrl(href, baseUrl);
      if (abs) out.push({ url: abs, source: "apple-touch-icon" });
    }
  });

  // 4. Standard <link rel="icon"> (exclude type=image/x-icon .ico by preference, but accept all).
  $('link[rel~="icon"]').each((_, el) => {
    const href = $(el).attr("href");
    if (href) {
      const abs = resolveUrl(href, baseUrl);
      if (abs) out.push({ url: abs, source: "icon" });
    }
  });

  return out;
}

export function extractThemeColor(html: string): string | null {
  const $ = cheerio.load(html);
  const meta = $('meta[name="theme-color"]').attr("content")
    || $('meta[name="msapplication-TileColor"]').attr("content");
  if (!meta) return null;
  const trimmed = meta.trim();
  if (!isHex6(trimmed)) return null;
  return trimmed.toUpperCase();
}

function googleS2FaviconUrl(websiteUrl: string): string | null {
  try {
    const u = new URL(websiteUrl);
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(u.hostname)}&sz=128`;
  } catch {
    return null;
  }
}

/**
 * Main entry — returns the first probe-verified image URL in
 * waterfall priority order, or null when every source fails.
 * Caller is responsible for downloading the bytes + uploading to our
 * Supabase bucket; the returned URL is guaranteed reachable but MUST
 * NOT be persisted directly to partners.logo_url (hosts outside the
 * allowlist are rejected by save/route.ts on purpose).
 */
export async function fetchBrandFromWebsite(websiteUrl: string): Promise<ScrapedBrand | null> {
  const urlCheck = validateWebsiteUrl(websiteUrl);
  if (!urlCheck.ok) return null;

  const html = await fetchHtmlBounded(websiteUrl);
  const themeColor = html ? extractThemeColor(html) : null;
  const candidates: Candidate[] = html ? extractCandidates(html, websiteUrl) : [];

  // Google s2 favicon as last-resort — never dominates higher-fidelity sources.
  const s2 = googleS2FaviconUrl(websiteUrl);
  if (s2) candidates.push({ url: s2, source: "google-s2" });

  // De-dupe while preserving order (first occurrence wins).
  const seen = new Set<string>();
  const deduped: Candidate[] = [];
  for (const c of candidates) {
    if (seen.has(c.url)) continue;
    seen.add(c.url);
    deduped.push(c);
  }

  for (const c of deduped) {
    const probe = await probeImageUrl(c.url);
    if (probe.ok) {
      return { logoUrl: c.url, themeColor, source: c.source };
    }
  }
  return null;
}
