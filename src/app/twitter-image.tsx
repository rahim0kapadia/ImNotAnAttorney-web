/**
 * twitter-image.tsx -- Root-level Twitter card image.
 * Mirrors the OG image implementation for Twitter/X card previews.
 */
import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "ImNotAnAttorney — We Research. You Ask.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          background: "linear-gradient(135deg, #09090b 0%, #18181b 50%, #09090b 100%)",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "60px",
        }}
      >
        <div
          style={{
            fontSize: 72,
            fontWeight: 800,
            color: "#ffffff",
            textAlign: "center",
            lineHeight: 1.2,
          }}
        >
          Im<span style={{ color: "#f59e0b" }}>Not</span>AnAttorney
        </div>
        <div
          style={{
            fontSize: 32,
            color: "#a1a1aa",
            marginTop: 24,
            textAlign: "center",
          }}
        >
          We Research. You Ask.
        </div>
        <div
          style={{
            fontSize: 20,
            color: "#71717a",
            marginTop: 40,
            textAlign: "center",
            maxWidth: 800,
          }}
        >
          Legal research and case analysis for criminal defendants.
          Hold your attorney accountable.
        </div>
      </div>
    ),
    { ...size }
  );
}
