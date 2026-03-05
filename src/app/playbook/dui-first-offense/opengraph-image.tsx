import { ImageResponse } from "next/og";
import { TIER_CORE } from "@/lib/tiers";

export const runtime = "edge";
export const alt = `DUI Defense Playbook — ${TIER_CORE["dui-first-offense"].priceDisplay} Instant Download | ImNotAnAttorney`;
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
            fontSize: 24,
            fontWeight: 700,
            color: "#f59e0b",
            textTransform: "uppercase",
            letterSpacing: "0.1em",
          }}
        >
          DUI Defense Playbook
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
          The Breathalyzer Reading Is Not the Case.
        </div>
        <div
          style={{
            fontSize: 28,
            color: "#a1a1aa",
            marginTop: 32,
            textAlign: "center",
          }}
        >
          26 questions your DUI attorney hopes you never ask.
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "16px",
            marginTop: 40,
          }}
        >
          <div
            style={{
              fontSize: 36,
              fontWeight: 800,
              color: "#f59e0b",
            }}
          >
            {TIER_CORE["dui-first-offense"].priceDisplay}
          </div>
          <div
            style={{
              fontSize: 20,
              color: "#71717a",
            }}
          >
            Instant PDF Download
          </div>
        </div>
        <div
          style={{
            fontSize: 16,
            color: "#52525b",
            marginTop: 40,
          }}
        >
          imnotanattorney.com
        </div>
      </div>
    ),
    { ...size }
  );
}
