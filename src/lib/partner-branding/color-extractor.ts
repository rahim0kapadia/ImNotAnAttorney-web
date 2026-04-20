/**
 * Pull a brand palette from a website's HTML + linked stylesheets.
 *
 * Sources (in order):
 *   1. `<meta name="theme-color">` / msapplication-TileColor
 *   2. Hex literals inside `<style>` blocks
 *   3. Hex literals inside `style="..."` attributes
 *   4. Hex literals inside linked `<link rel="stylesheet">` files
 *      (bounded fetch — first 2 stylesheets, 256KB each, 3s timeout)
 *   5. Hex literals inside `data-color` / `data-brand-color` attrs
 *
 * Colors are frequency-ranked, de-duplicated, filtered through the
 * site-contrast guard (primary MUST pass WCAG AA on black — anything
 * too dark is useless for the partner shell). Near-white / near-black
 * is excluded (those are never brand colors).
 *
 * Scope cap: at most 8 candidates returned. The dashboard will pick
 * top 2 as defaults (primary + accent) but show all as swatches so
 * the partner can override.
 */

import * as cheerio from "cheerio";
import { brandPassesSiteContrast, parseHex, relativeLuminance } from "./contrast-guard";

const STYLESHEET_FETCH_LIMIT = 2;
const STYLESHEET_TIMEOUT_MS = 3000;
const STYLESHEET_MAX_BYTES = 256 * 1024;
const MAX_RETURNED = 8;
const USER_AGENT = "ImNotAnAttorney-PartnerOnboarding/1.0 (+https://imnotanattorney.com)";

// Matches 3-digit (#f00) and 6-digit (#ff0000) hex. Word-boundary prefix
// avoids matching inside other tokens (ids, class fragments). The regex
// intentionally allows 3-digit for extraction — we expand them to 6.
const HEX_REGEX = /#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/g;

function expand3To6(short: string): string {
  const [a, b, c] = short;
  return `#${a}${a}${b}${b}${c}${c}`.toUpperCase();
}

function normalizeHex(match: string): string | null {
  const hex = match.replace(/^#/, "");
  if (hex.length === 3) return expand3To6(hex);
  if (hex.length === 6) return `#${hex.toUpperCase()}`;
  return null;
}

function extractHexesFromText(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(HEX_REGEX)) {
    const norm = normalizeHex(m[0]);
    if (norm) out.push(norm);
  }
  return out;
}

/**
 * Reject near-grayscale colors (brand pages use these for body text /
 * backgrounds, not brand identity) and anything too dark for our canvas.
 */
function isUsableBrandColor(hex: string): boolean {
  if (!brandPassesSiteContrast(hex)) return false;
  const rgb = parseHex(hex);
  if (!rgb) return false;
  // Exclude pure neutrals (R≈G≈B) and near-white (luminance > 0.95 is
  // an off-white background, not a brand color).
  const max = Math.max(rgb.r, rgb.g, rgb.b);
  const min = Math.min(rgb.r, rgb.g, rgb.b);
  const saturationProxy = max - min;
  if (saturationProxy < 20) return false;
  const lum = relativeLuminance(hex);
  if (lum > 0.95) return false;
  return true;
}

async function fetchStylesheetBounded(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), STYLESHEET_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: { "user-agent": USER_AGENT, accept: "text/css,*/*" },
    });
    if (!res.ok) return null;
    const type = (res.headers.get("content-type") || "").toLowerCase();
    if (!type.startsWith("text/css") && !type.includes("css")) return null;
    const reader = res.body?.getReader();
    if (!reader) return null;
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (total < STYLESHEET_MAX_BYTES) {
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

/**
 * Rank candidates by frequency + return up to MAX_RETURNED, filtered.
 * Order matters: the first element is the most frequent usable brand
 * color in the page — usually the primary brand color. The second is
 * the accent. Remaining are alternates for the dashboard swatch UI.
 */
export function rankAndFilter(colors: string[]): string[] {
  const freq = new Map<string, number>();
  for (const c of colors) {
    freq.set(c, (freq.get(c) ?? 0) + 1);
  }
  return Array.from(freq.entries())
    .filter(([hex]) => isUsableBrandColor(hex))
    .sort((a, b) => b[1] - a[1])
    .map(([hex]) => hex)
    .slice(0, MAX_RETURNED);
}

export async function extractWebsiteColors(html: string, baseUrl: string): Promise<string[]> {
  const $ = cheerio.load(html);
  const raw: string[] = [];

  // meta theme-color / msapplication-TileColor
  const meta1 = $('meta[name="theme-color"]').attr("content");
  const meta2 = $('meta[name="msapplication-TileColor"]').attr("content");
  for (const m of [meta1, meta2]) {
    if (!m) continue;
    const norm = normalizeHex(m.trim());
    if (norm) raw.push(norm);
  }

  // inline <style> blocks
  $("style").each((_, el) => {
    const txt = $(el).contents().text();
    raw.push(...extractHexesFromText(txt));
  });

  // inline style="..." attrs
  $("[style]").each((_, el) => {
    const s = $(el).attr("style");
    if (s) raw.push(...extractHexesFromText(s));
  });

  // data-color / data-brand-color attrs
  $("[data-color], [data-brand-color], [data-primary-color]").each((_, el) => {
    for (const attr of ["data-color", "data-brand-color", "data-primary-color"]) {
      const v = $(el).attr(attr);
      if (v) raw.push(...extractHexesFromText(v));
    }
  });

  // linked stylesheets — bounded
  const sheetUrls: string[] = [];
  $('link[rel="stylesheet"][href]').each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    try {
      sheetUrls.push(new URL(href, baseUrl).toString());
    } catch { /* ignore bad href */ }
  });
  const sheetsToFetch = sheetUrls.slice(0, STYLESHEET_FETCH_LIMIT);
  const sheets = await Promise.all(sheetsToFetch.map(fetchStylesheetBounded));
  for (const css of sheets) {
    if (!css) continue;
    raw.push(...extractHexesFromText(css));
  }

  return rankAndFilter(raw);
}
