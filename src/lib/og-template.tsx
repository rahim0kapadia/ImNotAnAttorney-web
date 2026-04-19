/**
 * og-template.tsx — Shared OG image template. v3.1.
 *
 * Iter2: applied iter1 expert-critique prescriptions (vertical-centered hero,
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
}

async function loadFont(
  family: string,
  weight: number
): Promise<ArrayBuffer | undefined> {
  try {
    const css = await fetch(
      `https://fonts.googleapis.com/css2?family=${family}:wght@${weight}`,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 5.1; rv:8.0) Gecko/20100101 Firefox/8.0",
        },
      }
    ).then((r) => r.text());
    const url = css.match(/src: url\(([^)]+)\)/)?.[1];
    if (!url) return undefined;
    return fetch(url).then((r) => r.arrayBuffer());
  } catch {
    return undefined;
  }
}

export async function renderOgImage({
  title,
  subtitle,
  category,
}: OgTemplateProps) {
  const [playfair, lato, latoRegular] = await Promise.all([
    loadFont("Playfair+Display", 700),
    loadFont("Lato", 700),
    loadFont("Lato", 400),
  ]);

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
              background: "#f59e0b",
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
