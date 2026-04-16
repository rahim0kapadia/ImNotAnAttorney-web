/**
 * og-template.tsx — Shared OG image template for all pages.
 *
 * Branded 1200x630 PNG: amber accent bar, logo mark, auto-sized title,
 * optional eyebrow/subtitle, tagline footer.
 *
 * satori (next/og) only supports static-weight OpenType fonts, not variable
 * fonts. PlayfairDisplay-Variable.ttf crashes it. Font loading removed;
 * system serif is the safe fallback.
 */
import { ImageResponse } from "next/og";

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = "image/png";

interface OgTemplateProps {
  title: string;
  subtitle?: string;
  eyebrow?: string;
}

export function renderOgImage({ title, subtitle, eyebrow }: OgTemplateProps) {
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
        {/* Amber accent bar, left edge */}
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

        {/* Logo watermark, right side */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="https://imnotanattorney.com/brand/inaa-logo.png"
          alt=""
          width={200}
          height={200}
          style={{
            position: "absolute",
            right: 48,
            bottom: 48,
            opacity: 0.15,
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
          {/* Top: Brand mark with logo */}
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="https://imnotanattorney.com/brand/inaa-logo.png"
              alt=""
              width={44}
              height={44}
              style={{ borderRadius: 8 }}
            />
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
    { ...OG_SIZE }
  );
}
