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

function isHex6(v: string | undefined | null): v is string {
  return typeof v === "string" && /^#[0-9A-Fa-f]{6}$/.test(v);
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
    ? partnerBranding.logoUrl
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
            {partnerLogoUrl ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={partnerLogoUrl}
                  alt=""
                  width={104}
                  height={104}
                  style={{ borderRadius: 16, objectFit: "contain", background: "#0a0a0a" }}
                />
                <div
                  style={{
                    display: "flex",
                    fontSize: 24,
                    fontWeight: 400,
                    color: "#a1a1aa",
                    letterSpacing: 0.5,
                    fontFamily: latoRegular ? "LatoR" : "system-ui",
                  }}
                >
                  Powered by ImNotAnAttorney
                </div>
              </>
            ) : (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="https://imnotanattorney.com/brand/inaa-logo.png"
                  alt=""
                  width={104}
                  height={104}
                  style={{ borderRadius: 16 }}
                />
                <div
                  style={{
                    display: "flex",
                    fontSize: 84,
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
              </>
            )}
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
