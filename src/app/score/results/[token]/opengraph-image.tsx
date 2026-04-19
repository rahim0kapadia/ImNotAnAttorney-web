/**
 * Dynamic Open Graph image for shared score results.
 *
 * Shows the score number + band in a color-coded hero, wrapped in the shared
 * template chrome (amber-Not wordmark, hairline rules, DEFENSE INTELLIGENCE
 * category, domain). Matches brand-lockup with other INAA OG cards.
 */
import { ImageResponse } from "next/og";
import { createAdminClient } from "@/lib/supabase/admin";

export const alt = "Masked Researcher's First Read — ImNotAnAttorney";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

function getScoreColor(score: number): string {
  if (score <= 20) return "#ef4444";
  if (score <= 40) return "#f97316";
  if (score <= 60) return "#eab308";
  if (score <= 80) return "#22c55e";
  return "#10b981";
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

export default async function Image({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [playfair, lato] = await Promise.all([
    loadFont("Playfair+Display", 700),
    loadFont("Lato", 700),
  ]);

  let score = 50;
  let band = "Average";

  try {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from("score_results")
      .select("score_value, score_band")
      .eq("token", token)
      .gte("expires_at", new Date().toISOString())
      .single();

    if (data) {
      score = data.score_value;
      band = data.score_band;
    }
  } catch {
    // Fallback to defaults
  }

  const scoreColor = getScoreColor(score);

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
        {/* TOP: logo + wordmark LEFT, category RIGHT */}
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
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="https://imnotanattorney.com/brand/inaa-logo.png"
              alt=""
              width={48}
              height={48}
              style={{ borderRadius: 6 }}
            />
            <div
              style={{
                display: "flex",
                fontSize: 30,
                fontWeight: 700,
                color: "#f5f5f4",
                letterSpacing: -0.3,
                fontFamily: lato ? "Lato" : "system-ui",
              }}
            >
              <span>Im</span>
              <span style={{ color: "#f59e0b" }}>Not</span>
              <span>AnAttorney</span>
            </div>
          </div>
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
            Defense Intelligence
          </span>
        </div>

        {/* HERO: big colored score + band */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            flexGrow: 1,
            gap: 12,
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: 24,
              fontWeight: 700,
              color: "#a1a1aa",
              letterSpacing: 3,
              textTransform: "uppercase",
              fontFamily: lato ? "Lato" : "system-ui",
            }}
          >
            Masked Researcher&apos;s First Read
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 220,
              fontWeight: 700,
              color: scoreColor,
              lineHeight: 0.95,
              letterSpacing: -4,
              fontFamily: playfair ? "Playfair" : "Georgia, serif",
            }}
          >
            {String(score)}
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 40,
              fontWeight: 700,
              color: "#f5f5f4",
              fontFamily: playfair ? "Playfair" : "Georgia, serif",
              letterSpacing: -0.5,
            }}
          >
            {band}
          </div>
        </div>

        {/* FOOTER: domain + hint */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            paddingTop: 32,
            borderTopWidth: 1,
            borderTopStyle: "solid",
            borderTopColor: "#27272a",
          }}
        >
          <span
            style={{
              fontSize: 16,
              fontWeight: 700,
              color: "#a1a1aa",
              letterSpacing: 1.5,
              fontFamily: lato ? "Lato" : "system-ui",
            }}
          >
            Check yours free at /score
          </span>
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
    {
      ...size,
      fonts: [
        ...(playfair
          ? [{ name: "Playfair", data: playfair, style: "normal" as const, weight: 700 as const }]
          : []),
        ...(lato
          ? [{ name: "Lato", data: lato, style: "normal" as const, weight: 700 as const }]
          : []),
      ],
    }
  );
}
