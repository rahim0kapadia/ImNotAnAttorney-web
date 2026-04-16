// src/lib/og-template.tsx
import { ImageResponse } from "next/og";

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = "image/png";

interface OgTemplateProps {
  title: string;
  subtitle?: string;
  eyebrow?: string;
}

export function renderOgImage({ title, subtitle, eyebrow }: OgTemplateProps) {
  return new ImageResponse(
    (
      <div
        style={{
          background: "linear-gradient(135deg, #09090b 0%, #18181b 50%, #09090b 100%)",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "60px",
        }}
      >
        <div style={{ display: "flex", fontSize: 24, fontWeight: 700 }}>
          <span style={{ color: "#ffffff" }}>Im</span>
          <span style={{ color: "#f59e0b" }}>Not</span>
          <span style={{ color: "#ffffff" }}>AnAttorney</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          {eyebrow && (
            <div
              style={{
                fontSize: 22,
                fontWeight: 700,
                color: "#f59e0b",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                marginBottom: 16,
              }}
            >
              {eyebrow}
            </div>
          )}
          <div
            style={{
              fontSize: title.length > 40 ? 42 : 52,
              fontWeight: 800,
              color: "#ffffff",
              lineHeight: 1.2,
              maxWidth: 900,
            }}
          >
            {title}
          </div>
          {subtitle && (
            <div
              style={{
                fontSize: 24,
                color: "#a1a1aa",
                marginTop: 20,
                maxWidth: 800,
                lineHeight: 1.4,
              }}
            >
              {subtitle.length > 100 ? subtitle.slice(0, 100) + "..." : subtitle}
            </div>
          )}
        </div>
        <div style={{ display: "flex", fontSize: 18, color: "#52525b" }}>
          imnotanattorney.com &bull; Know What They Know.
        </div>
      </div>
    ),
    { ...OG_SIZE }
  );
}
