/**
 * opengraph-image.tsx -- Root-level Open Graph image generated at the edge.
 *
 * Produces a 1200x630 PNG image used as the default OG image for the entire site.
 * This image appears when the homepage or any page WITHOUT its own opengraph-image
 * is shared on social media (Facebook, Twitter/X, LinkedIn, iMessage, etc.).
 *
 * Content: Centered brand name ("ImNotAnAttorney" with amber "Im"), tagline
 * ("Know What They Know."), and description text on a dark gradient background.
 *
 * Runs on the Edge runtime for fast generation. No external fonts or images are loaded.
 *
 * Blog posts have their own dynamic OG image at `src/app/blog/[slug]/opengraph-image.tsx`.
 */
import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "ImNotAnAttorney — Know What They Know.";
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
          Know What They Know.
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
