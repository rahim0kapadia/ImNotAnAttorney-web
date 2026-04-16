/**
 * blog/[slug]/twitter-image.tsx -- Dynamic per-post Twitter card image.
 * Mirrors the OG image implementation for Twitter/X card previews.
 */
import { ImageResponse } from "next/og";
import { getPostBySlug } from "@/lib/blog";

export const alt = "ImNotAnAttorney, Criminal Defense Research Blog";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  const title = post?.title || "ImNotAnAttorney";

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
        <div
          style={{
            fontSize: 24,
            color: "#f59e0b",
            fontWeight: 700,
          }}
        >
          <span style={{ color: "#ffffff" }}>Im</span>
          <span style={{ color: "#f59e0b" }}>Not</span>
          <span style={{ color: "#ffffff" }}>AnAttorney</span>
        </div>
        <div
          style={{
            fontSize: 48,
            fontWeight: 800,
            color: "#ffffff",
            lineHeight: 1.2,
            maxWidth: 900,
          }}
        >
          {title}
        </div>
        <div
          style={{
            fontSize: 18,
            color: "#71717a",
          }}
        >
          imnotanattorney.com &bull; Know What They Know.
        </div>
      </div>
    ),
    { ...size }
  );
}
