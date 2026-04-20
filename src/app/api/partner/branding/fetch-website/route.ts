/**
 * POST /api/partner/branding/fetch-website — server-side scrape of a
 * partner's own website for a logo + theme color.
 *
 * Accepts: { websiteUrl: string }
 * Returns: { publicUrl, storagePath, themeColor | null, source }
 *
 * Design:
 *   1. Validate the website URL (url-guard blocks private IPs + userinfo).
 *   2. Scrape candidates via website-scraper waterfall (JSON-LD logo,
 *      og:image, apple-touch-icon, favicon, Google s2 fallback).
 *   3. Download the first probe-verified candidate's bytes.
 *   4. Sniff magic bytes — reject anything that isn't PNG/JPEG/WEBP so
 *      an SVG scraped from a random site can't land in our bucket.
 *   5. Upload bytes to partner-logos bucket at `<PROMO>/logo-scraped.<ext>`
 *      (overwriting any prior scraped or uploaded logo for this partner).
 *   6. Return the Supabase public URL so the partner's dashboard can
 *      round-trip it through /save like a manual upload.
 *
 * The returned logo_url is ALWAYS on our Supabase Storage host, never
 * the partner's website or a third-party CDN. That preserves the
 * url-guard allowlist invariant (logo_url host ∈ {partner-logos bucket}).
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePartnerAuth } from "@/lib/partner-helpers";
import { checkRateLimit } from "@/lib/rate-limit";
import { fetchBrandFromWebsite } from "@/lib/partner-branding/website-scraper";
import { sniffImageType, mimeForSniffed, extForSniffed } from "@/lib/partner-branding/file-sniff";

const BUCKET = "partner-logos";
const MAX_BYTES = 2 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 5000;
const USER_AGENT = "ImNotAnAttorney-PartnerOnboarding/1.0 (+https://imnotanattorney.com)";

async function downloadBounded(url: string): Promise<Uint8Array | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: { "user-agent": USER_AGENT },
    });
    if (!res.ok) return null;
    const lenHeader = res.headers.get("content-length");
    if (lenHeader && Number.parseInt(lenHeader, 10) > MAX_BYTES) return null;
    const reader = res.body?.getReader();
    if (!reader) return null;
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > MAX_BYTES) {
        try { await reader.cancel(); } catch { /* ignore */ }
        return null;
      }
      chunks.push(value);
    }
    const out = new Uint8Array(total);
    let offset = 0;
    for (const c of chunks) { out.set(c, offset); offset += c.byteLength; }
    return out;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function POST(req: NextRequest) {
  const { partner, error: authError } = await requirePartnerAuth(req);
  if (authError) return authError;
  if (!partner.promo_code) {
    return NextResponse.json({ error: "Partner missing promo code" }, { status: 400 });
  }

  const supabase = createAdminClient();
  // 20/hr/partner — loose enough for real onboarding (paste URL, try,
  // tweak, re-fetch) but tight enough to block abuse. Each call fans
  // out 4-10 outbound requests (HTML + 2 stylesheets + logo candidates
  // + probe), so the per-call cost is the real ceiling.
  const { limited } = await checkRateLimit(
    supabase,
    `partner-branding-fetch-website:${partner.id}`,
    20,
    60 * 60,
  );
  if (limited) {
    return NextResponse.json({ error: "Too many website-fetch attempts. Try again later." }, { status: 429 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const websiteUrl = body.websiteUrl;
  if (typeof websiteUrl !== "string" || websiteUrl.length === 0 || websiteUrl.length > 500) {
    return NextResponse.json({ error: "websiteUrl required (string, 1-500 chars)" }, { status: 400 });
  }

  const result = await fetchBrandFromWebsite(websiteUrl);
  if (!result.ok) {
    const status = result.failure.kind === "invalid-url" ? 400 : 422;
    const suffix = result.failure.kind === "no-logo" ? " Try uploading one directly." : "";
    return NextResponse.json(
      { error: `${result.failure.reason}${suffix}` },
      { status },
    );
  }
  const scraped = result.brand;

  const bytes = await downloadBounded(scraped.logoUrl);
  if (!bytes || bytes.byteLength === 0) {
    return NextResponse.json(
      { error: "Found a logo reference but could not download it (too large, timed out, or refused)." },
      { status: 502 },
    );
  }
  const sniffed = sniffImageType(bytes);
  if (!sniffed) {
    return NextResponse.json(
      { error: "Found a logo reference but the file is not a supported image (need PNG/JPG/WEBP)." },
      { status: 415 },
    );
  }
  const contentType = mimeForSniffed(sniffed);
  const ext = extForSniffed(sniffed);
  if (!contentType || !ext) {
    return NextResponse.json({ error: "Unsupported image type" }, { status: 415 });
  }

  const path = `${partner.promo_code}/logo-scraped.${ext}`;

  // Clean up any prior logo so extension swaps don't leave orphans.
  const oldStoragePath = partner.logo_storage_path ?? null;
  if (oldStoragePath && oldStoragePath !== path) {
    await supabase.storage.from(BUCKET).remove([oldStoragePath]).catch((e) => {
      console.warn("[fetch-website] prior-logo cleanup failed:", e);
    });
  }

  const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, bytes, {
    contentType,
    upsert: true,
    cacheControl: "300",
  });
  if (upErr) {
    console.error("[fetch-website] upload error:", upErr);
    return NextResponse.json({ error: "Scrape succeeded but upload to storage failed" }, { status: 500 });
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  const publicUrl = `${data.publicUrl}?v=${Date.now()}`;
  return NextResponse.json({
    publicUrl,
    storagePath: path,
    themeColor: scraped.themeColor,
    websiteColors: scraped.websiteColors,
    source: scraped.source,
  });
}
