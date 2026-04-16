/**
 * og-template.tsx — Shared OG image template for all pages.
 *
 * Renders a branded 1200x630 PNG with:
 * - Playfair Display custom font for the title
 * - Bold amber accent bar on the left edge
 * - Brand mark top-left with amber icon
 * - Optional eyebrow (amber, uppercase)
 * - Title + subtitle with auto-sizing
 * - Tagline footer
 *
 * Uses Node runtime (not edge) because custom fonts need fs access.
 * All opengraph-image.tsx files should NOT export runtime = "edge".
 */
import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = "image/png";

interface OgTemplateProps {
  title: string;
  subtitle?: string;
  eyebrow?: string;
}

export async function renderOgImage({ title, subtitle, eyebrow }: OgTemplateProps) {
  let fontData: ArrayBuffer | undefined;
  try {
    fontData = (await readFile(
      join(process.cwd(), "src/assets/fonts/PlayfairDisplay-Variable.ttf")
    )).buffer as ArrayBuffer;
  } catch {
    // Fallback to system serif if file not found
  }

  const titleSize = title.length > 50 ? 38 : title.length > 35 ? 44 : 52;

  return new ImageResponse(
    (
      <div
        style={{
          background: "#09090b",
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
        }}
      >
        {/* Amber accent bar — left edge */}
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: 8,
            height: "100%",
            background: "linear-gradient(180deg, #f59e0b 0%, #d97706 100%)",
          }}
        />

        {/* Subtle amber glow bottom-right */}
        <div
          style={{
            position: "absolute",
            right: 0,
            bottom: 0,
            width: 400,
            height: 300,
            background: "radial-gradient(circle at bottom right, rgba(245,158,11,0.06) 0%, transparent 70%)",
          }}
        />

        {/* Content */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: "56px 64px 56px 48px",
            width: "100%",
            height: "100%",
          }}
        >
          {/* Top: Brand mark */}
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 8,
                background: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <span style={{ fontSize: 22, fontWeight: 900, color: "#09090b" }}>I</span>
            </div>
            <span style={{ fontSize: 22, fontWeight: 700, color: "#a1a1aa", letterSpacing: 1 }}>
              IMNOTANATTORNEY
            </span>
          </div>

          {/* Center: Title block */}
          <div style={{ display: "flex", flexDirection: "column" }}>
            {eyebrow && (
              <div
                style={{
                  fontSize: 18,
                  fontWeight: 700,
                  color: "#f59e0b",
                  textTransform: "uppercase",
                  letterSpacing: 3,
                  marginBottom: 16,
                }}
              >
                {eyebrow}
              </div>
            )}
            <div
              style={{
                fontSize: titleSize,
                fontWeight: 800,
                color: "#ffffff",
                lineHeight: 1.15,
                maxWidth: 950,
                fontFamily: fontData ? "Playfair" : "serif",
              }}
            >
              {title}
            </div>
            {subtitle && (
              <div
                style={{
                  fontSize: 22,
                  color: "#a1a1aa",
                  marginTop: 20,
                  maxWidth: 800,
                  lineHeight: 1.5,
                }}
              >
                {subtitle.length > 120 ? subtitle.slice(0, 120) + "..." : subtitle}
              </div>
            )}
          </div>

          {/* Bottom: Tagline + URL */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 18, color: "#52525b", letterSpacing: 0.5 }}>
              Know What They Know.
            </span>
            <span style={{ fontSize: 16, color: "#3f3f46" }}>
              imnotanattorney.com
            </span>
          </div>
        </div>
      </div>
    ),
    {
      ...OG_SIZE,
      ...(fontData
        ? {
            fonts: [
              {
                name: "Playfair",
                data: fontData,
                style: "normal" as const,
                weight: 800 as const,
              },
            ],
          }
        : {}),
    }
  );
}
