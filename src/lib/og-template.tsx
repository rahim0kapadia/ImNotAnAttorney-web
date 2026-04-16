/**
 * og-template.tsx — Shared OG image template for all pages.
 *
 * Branded 1200x630 PNG: amber accent bar, Playfair Display title,
 * ambient glow, eyebrow badge, logo mark, tagline footer.
 *
 * Font strategy: fetch Playfair Display Bold (700) from Google Fonts at
 * render time using an old UA to force TTF format. satori only supports
 * TTF/OTF — woff2 and variable fonts both crash it.
 */
import { ImageResponse } from "next/og";

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = "image/png";

interface OgTemplateProps {
  title: string;
  subtitle?: string;
  eyebrow?: string;
}

async function loadFont(): Promise<ArrayBuffer | undefined> {
  try {
    // Old UA forces Google Fonts to return TTF instead of woff2
    const css = await fetch(
      "https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700",
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

export async function renderOgImage({ title, subtitle, eyebrow }: OgTemplateProps) {
  const fontData = await loadFont();
  const titleSize =
    title.length > 65 ? 34 :
    title.length > 50 ? 40 :
    title.length > 35 ? 48 : 56;

  return new ImageResponse(
    (
      <div
        style={{
          background: "#09090b",
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Left amber accent bar */}
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: 10,
            height: "100%",
            background: "linear-gradient(180deg, #f59e0b 0%, #b45309 100%)",
          }}
        />

        {/* Ambient glow — top right corner */}
        <div
          style={{
            position: "absolute",
            top: -120,
            right: -120,
            width: 520,
            height: 520,
            borderRadius: "50%",
            background:
              "radial-gradient(circle, rgba(245,158,11,0.09) 0%, transparent 65%)",
          }}
        />

        {/* Logo watermark — bottom right */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="https://imnotanattorney.com/brand/inaa-logo.png"
          alt=""
          width={210}
          height={210}
          style={{
            position: "absolute",
            right: 44,
            bottom: 44,
            opacity: 0.07,
          }}
        />

        {/* Main content column */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: "52px 72px 48px 58px",
            width: "100%",
            height: "100%",
          }}
        >
          {/* Header: brand mark */}
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="https://imnotanattorney.com/brand/inaa-logo.png"
              alt=""
              width={40}
              height={40}
              style={{ borderRadius: 8 }}
            />
            <span
              style={{
                fontSize: 17,
                fontWeight: 700,
                color: "#52525b",
                letterSpacing: 2,
                textTransform: "uppercase",
              }}
            >
              ImNotAnAttorney.com
            </span>
          </div>

          {/* Center: title block */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 18,
            }}
          >
            {eyebrow && (
              <div style={{ display: "flex" }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    background: "rgba(245,158,11,0.12)",
                    borderWidth: 1,
                    borderStyle: "solid",
                    borderColor: "rgba(245,158,11,0.35)",
                    borderRadius: 6,
                    padding: "5px 14px",
                  }}
                >
                  <span
                    style={{
                      fontSize: 14,
                      fontWeight: 700,
                      color: "#f59e0b",
                      letterSpacing: 2,
                      textTransform: "uppercase",
                    }}
                  >
                    {eyebrow}
                  </span>
                </div>
              </div>
            )}

            <div
              style={{
                fontSize: titleSize,
                fontWeight: 700,
                color: "#ffffff",
                lineHeight: 1.2,
                maxWidth: 980,
                fontFamily: fontData ? "Playfair" : "Georgia, serif",
              }}
            >
              {title}
            </div>

            {subtitle && (
              <div
                style={{
                  fontSize: 21,
                  color: "#71717a",
                  lineHeight: 1.55,
                  maxWidth: 840,
                }}
              >
                {subtitle.length > 115
                  ? subtitle.slice(0, 115) + "..."
                  : subtitle}
              </div>
            )}
          </div>

          {/* Footer: tagline + URL with amber dot */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              borderTopWidth: 1,
              borderTopStyle: "solid",
              borderTopColor: "rgba(255,255,255,0.07)",
              paddingTop: 18,
            }}
          >
            <span style={{ fontSize: 17, color: "#3f3f46", letterSpacing: 0.5 }}>
              Know What They Know.
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: "#f59e0b",
                }}
              />
              <span style={{ fontSize: 15, color: "#3f3f46" }}>
                imnotanattorney.com
              </span>
            </div>
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
                weight: 700 as const,
              },
            ],
          }
        : {}),
    }
  );
}
