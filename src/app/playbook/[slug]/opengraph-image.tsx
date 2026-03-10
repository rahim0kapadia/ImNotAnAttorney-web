import { ImageResponse } from "next/og";
import { getPlaybookConfig } from "@/lib/playbook-configs";
import { TIER_CORE } from "@/lib/tiers";
import type { TierSlug } from "@/lib/tiers";

export const runtime = "edge";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const config = getPlaybookConfig(slug);
  if (!config) {
    return new ImageResponse(
      <div style={{ background: "#09090b", width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 32 }}>
        Not Found
      </div>,
      { ...size }
    );
  }

  const tier = TIER_CORE[config.slug as TierSlug];

  return new ImageResponse(
    (
      <div
        style={{
          background:
            "linear-gradient(135deg, #09090b 0%, #18181b 50%, #09090b 100%)",
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
            fontSize: 24,
            fontWeight: 700,
            color: "#f59e0b",
            textTransform: "uppercase",
            letterSpacing: "0.1em",
          }}
        >
          {config.hero.eyebrow}
        </div>
        <div
          style={{
            fontSize: 56,
            fontWeight: 800,
            color: "#ffffff",
            textAlign: "center",
            lineHeight: 1.2,
            marginTop: 24,
            maxWidth: 900,
          }}
        >
          {config.hero.headline}
        </div>
        <div
          style={{
            fontSize: 28,
            color: "#a1a1aa",
            marginTop: 32,
            textAlign: "center",
          }}
        >
          {config.hero.subheadline.slice(0, 80)}
          {config.hero.subheadline.length > 80 ? "..." : ""}
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "16px",
            marginTop: 40,
          }}
        >
          <div style={{ fontSize: 36, fontWeight: 800, color: "#f59e0b" }}>
            {tier.priceDisplay}
          </div>
          <div style={{ fontSize: 20, color: "#71717a" }}>
            Instant PDF Download
          </div>
        </div>
        <div style={{ fontSize: 16, color: "#52525b", marginTop: 40 }}>
          imnotanattorney.com
        </div>
      </div>
    ),
    { ...size }
  );
}
