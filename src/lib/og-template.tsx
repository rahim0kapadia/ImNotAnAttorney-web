/**
 * og-template.tsx — Shared OG image template. v3.2.
 *
 * v3.2 (perf): fonts bundled locally in src/lib/og-fonts/ and loaded ONCE at
 * module scope. Eliminates the per-render Google Fonts CSS+TTF fetch
 * (200-400ms cold latency) and removes the external-network dependency from
 * every opengraph-image route. Playfair Display + Lato are SIL OFL 1.1 —
 * bundling is licensed-clean (see src/lib/og-fonts/LICENSE-OFL.txt).
 *
 * v3.1: applied iter1 expert-critique prescriptions (vertical-centered hero,
 * tightened letter-spacing, consolidated gray family, equalized hairline
 * padding, right-sized logo).
 *
 * Principles:
 *   - ONE amber element: the "Not" in the wordmark.
 *   - Hairline rules top + bottom of hero (Stripe/Attio editorial convention).
 *   - Subtle radial canvas gradient.
 *   - Contrast floor: all text ≥ 7.72:1 (WCAG AAA).
 *   - Title: Playfair 700 up to 132px with optical kerning at -1 tracking.
 *   - Subtitle: Lato 400 #d4d4d8, outcome-anchored.
 *
 * Satori notes: every div with 2+ children needs display:flex. Static-weight TTF only.
 */
import fs from "node:fs";
import path from "node:path";
import { ImageResponse } from "next/og";

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = "image/png";

export interface OgTemplateProps {
  /** Hero. Playfair 700. Use "\n" to force an editorial line break (template renders pre-line). */
  title: string;
  /** 2-line outcome copy. Lato 28px #d4d4d8. Sells the page, never the category. */
  subtitle?: string;
  /** Uppercase text label, top-right. Prefer the 6-taxonomy set: DEFENSE INTELLIGENCE / DEFENSE PLAYBOOK / STATE BRIEFING / FIELD REPORT / PARTNER NETWORK / INSIDE INAA. Partner-route extensions: COURT CHECK-IN (flag on) / COURT PREP (flag off). */
  category?: string;
  /** Deprecated — stat lines removed per expert guidance. Accepted to avoid breaking existing callers; value is ignored. */
  stat?: string;
  /**
   * Optional partner branding for /r/[code] OG cards. When set + contrast-verified
   * (partnerBranding.accentHex must be WCAG-safe against the card's dark radial),
   * the amber accent rule becomes the partner color and the partner logo renders
   * alongside the INAA wordmark. Falls back to default if any field is missing.
   */
  partnerBranding?: {
    logoUrl: string | null;
    accentHex: string;
    partnerName?: string | null;
  };
}

// Bundled fonts are read ONCE at module import (serverless cold start),
// not per render. Saves 200-400ms on every opengraph-image response and
// removes the network dependency on fonts.googleapis.com / fonts.gstatic.com.
// Each read is guarded so a missing file cleanly falls back to the system
// font chain (see `fontFamily` guards in the JSX below).
const FONT_DIR = path.join(process.cwd(), "src", "lib", "og-fonts");

function safeReadFont(fileName: string): Buffer | undefined {
  try {
    return fs.readFileSync(path.join(FONT_DIR, fileName));
  } catch (e) {
    console.warn(`[og-template] failed to load bundled font ${fileName}:`, e);
    return undefined;
  }
}

const PLAYFAIR_BOLD = safeReadFont("PlayfairDisplay-Bold.ttf");
const LATO_REGULAR = safeReadFont("Lato-Regular.ttf");
const LATO_BOLD = safeReadFont("Lato-Bold.ttf");

const DEFAULT_ACCENT = "#f59e0b";
const PARTNER_LOGO_FETCH_TIMEOUT_MS = 3000;
const PARTNER_LOGO_MAX_BYTES = 500 * 1024;

function isHex6(v: string | undefined | null): v is string {
  return typeof v === "string" && /^#[0-9A-Fa-f]{6}$/.test(v);
}

// Hostname allowlist — defense-in-depth. The DB-level CHECK on partners.logo_url
// (migration 20260420c_partner_branding_hardening) already blocks non-allowlisted
// hosts at write time, but this function may be reused for other callers later;
// enforce locally too so it stays SSRF-safe independent of the caller.
function isAllowlistedLogoHost(url: string): boolean {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  if (/^[a-z0-9-]+\.supabase\.(co|in)$/.test(host)) return true;
  return false;
}

async function fetchWithManualRedirects(
  url: string,
  signal: AbortSignal,
  maxRedirects = 3,
): Promise<Response | null> {
  let current = url;
  // One initial request + up to `maxRedirects` follow-ups.
  for (let i = 0; i <= maxRedirects; i += 1) {
    if (!/^https:\/\//i.test(current)) return null;
    if (!isAllowlistedLogoHost(current)) return null;
    const res = await fetch(current, { redirect: "manual", signal });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      // Drain the redirect response body so it is not retained in memory
      // while we chase the Location header. Some runtimes hold the
      // unread stream open otherwise.
      try { await res.body?.cancel(); } catch { /* ignore */ }
      if (!loc) return null;
      let next: URL;
      try {
        next = new URL(loc, current);
      } catch {
        return null;
      }
      // Reject userinfo injection in the redirect target — initial URL
      // is guarded by validateLogoUrl() but a 3xx Location could smuggle
      // credentials through.
      if (next.username || next.password) return null;
      current = next.toString();
      continue;
    }
    return res;
  }
  return null;
}

async function readBodyWithCap(
  res: Response,
  cap: number,
): Promise<Uint8Array | null> {
  const lenHeader = res.headers.get("content-length");
  if (lenHeader) {
    const len = Number.parseInt(lenHeader, 10);
    if (Number.isFinite(len) && len > cap) return null;
  }
  const reader = res.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      total += value.byteLength;
      if (total > cap) {
        await reader.cancel().catch(() => {});
        return null;
      }
      chunks.push(value);
    }
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

async function prefetchPartnerLogoAsDataUri(url: string): Promise<string | null> {
  // Late-bound import avoids a circular-module hazard if the sniffer ever
  // reaches back into brand constants.
  const { sniffImageType, mimeForSniffed, ALLOWED_IMAGE_MIMES } = await import("./partner-branding/file-sniff");
  if (!/^https:\/\//i.test(url)) return null;
  if (!isAllowlistedLogoHost(url)) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PARTNER_LOGO_FETCH_TIMEOUT_MS);
  try {
    const res = await fetchWithManualRedirects(url, controller.signal);
    if (!res || !res.ok) return null;
    const type = (res.headers.get("content-type") || "").toLowerCase();
    const typeBase = type.split(";")[0].trim();
    if (!ALLOWED_IMAGE_MIMES.has(typeBase)) return null;
    const bytes = await readBodyWithCap(res, PARTNER_LOGO_MAX_BYTES);
    if (!bytes || bytes.byteLength === 0) return null;
    const sniffed = sniffImageType(bytes);
    if (!sniffed) return null;
    const verifiedType = mimeForSniffed(sniffed);
    if (!verifiedType) return null;
    const b64 = Buffer.from(bytes).toString("base64");
    return `data:${verifiedType};base64,${b64}`;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function renderOgImage({
  title,
  subtitle,
  category,
  partnerBranding,
}: OgTemplateProps) {
  const accentHex = partnerBranding && isHex6(partnerBranding.accentHex)
    ? partnerBranding.accentHex
    : DEFAULT_ACCENT;
  const partnerLogoUrl = partnerBranding && partnerBranding.logoUrl
    ? await prefetchPartnerLogoAsDataUri(partnerBranding.logoUrl)
    : null;
  // Reference module-scope buffers under the same local names the JSX below
  // expects. Keeps the diff tight and the Satori API contract unchanged.
  const playfair = PLAYFAIR_BOLD;
  const lato = LATO_BOLD;
  const latoRegular = LATO_REGULAR;

  // Title sizing — hero dominates. "\n" breaks counted as one line each.
  const longestLine = title
    .split("\n")
    .reduce((a, b) => (a.length > b.length ? a : b)).length;
  const titleSize =
    longestLine > 26 ? 64 :
    longestLine > 19 ? 76 :
    longestLine > 14 ? 96 :
    longestLine > 8 ? 112 : 124;

  const fonts = [
    ...(playfair
      ? [{ name: "Playfair", data: playfair, style: "normal" as const, weight: 700 as const }]
      : []),
    ...(lato
      ? [{ name: "Lato", data: lato, style: "normal" as const, weight: 700 as const }]
      : []),
    ...(latoRegular
      ? [{ name: "LatoR", data: latoRegular, style: "normal" as const, weight: 400 as const }]
      : []),
  ];

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          padding: "64px 80px",
          background:
            "radial-gradient(ellipse at 28% 32%, #18181b 0%, #0a0a0a 70%)",
          color: "#f5f5f4",
        }}
      >
        {/* TOP: logo + wordmark LEFT, category label RIGHT */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            paddingBottom: 32,
            borderBottomWidth: 1,
            borderBottomStyle: "solid",
            borderBottomColor: "#27272a",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
            {/* INAA wordmark is always present. When partnerLogoUrl is set we
                append a co-brand badge to its right ("× {partner logo}") so
                the product seller is identified at equal prominence. FTC
                endorsement-guide alignment. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="https://imnotanattorney.com/brand/inaa-logo.png"
              alt=""
              width={partnerLogoUrl ? 72 : 104}
              height={partnerLogoUrl ? 72 : 104}
              style={{ borderRadius: 16 }}
            />
            <div
              style={{
                display: "flex",
                fontSize: partnerLogoUrl ? 60 : 84,
                fontWeight: 700,
                color: "#f5f5f4",
                letterSpacing: -1.5,
                fontFamily: lato ? "Lato" : "system-ui",
              }}
            >
              <span>Im</span>
              <span style={{ color: "#f59e0b" }}>Not</span>
              <span>AnAttorney</span>
            </div>
            {partnerLogoUrl ? (
              <>
                <span
                  style={{
                    display: "flex",
                    fontSize: 32,
                    color: "#71717a",
                    margin: "0 4px",
                    fontFamily: latoRegular ? "LatoR" : "system-ui",
                  }}
                >
                  ×
                </span>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={partnerLogoUrl}
                  alt=""
                  width={72}
                  height={72}
                  style={{ borderRadius: 12, objectFit: "contain", background: "#0a0a0a" }}
                />
              </>
            ) : null}
          </div>

          {category && (
            <span
              style={{
                fontSize: 15,
                fontWeight: 700,
                color: "#a1a1aa",
                letterSpacing: 2,
                textTransform: "uppercase",
                fontFamily: lato ? "Lato" : "system-ui",
              }}
            >
              {category}
            </span>
          )}
        </div>

        {/* HERO: title (one element) + outcome subtitle, optically centered between rules */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 28,
            maxWidth: 1040,
            flexGrow: 1,
            justifyContent: "center",
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: titleSize,
              fontWeight: 700,
              color: "#f5f5f4",
              lineHeight: 0.98,
              letterSpacing: -1,
              whiteSpace: "pre-line",
              fontFamily: playfair ? "Playfair" : "Georgia, serif",
            }}
          >
            {title}
          </div>

          {/* Amber accent rule between title and subtitle */}
          <div
            style={{
              display: "flex",
              width: "100%",
              height: 5,
              background: accentHex,
              borderRadius: 2,
            }}
          />

          {subtitle && (
            <div
              style={{
                display: "flex",
                fontSize: 54,
                fontWeight: 700,
                color: "#f5f5f4",
                lineHeight: 1.2,
                maxWidth: 1040,
                whiteSpace: "pre-line",
                fontFamily: lato ? "Lato" : "system-ui",
              }}
            >
              {subtitle.length > 140 ? subtitle.slice(0, 140) + "…" : subtitle}
            </div>
          )}
        </div>

        {/* FOOTER: hairline + domain */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            paddingTop: 32,
            borderTopWidth: 1,
            borderTopStyle: "solid",
            borderTopColor: "#27272a",
          }}
        >
          <span
            style={{
              fontSize: 18,
              fontWeight: 700,
              color: "#a1a1aa",
              letterSpacing: 1.2,
              fontFamily: lato ? "Lato" : "system-ui",
            }}
          >
            imnotanattorney.com
          </span>
        </div>
      </div>
    ),
    { ...OG_SIZE, ...(fonts.length ? { fonts } : {}) }
  );
}
