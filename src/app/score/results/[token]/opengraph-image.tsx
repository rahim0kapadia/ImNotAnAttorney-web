/**
 * Dynamic Open Graph image for shared score results.
 *
 * Generates a 1200x630 PNG showing the score number, band name, and
 * brand colors. Used as the social preview when a /score/results/[token]
 * URL is shared on Facebook, Twitter/X, iMessage, etc.
 *
 * Edge runtime for fast generation. No external fonts loaded.
 */
import { ImageResponse } from "next/og";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "edge";
export const alt = "Defense Milestone Score — ImNotAnAttorney";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

function getScoreColor(score: number): string {
  if (score <= 20) return "#ef4444"; // red
  if (score <= 40) return "#f97316"; // orange
  if (score <= 60) return "#eab308"; // yellow
  if (score <= 80) return "#22c55e"; // green
  return "#10b981"; // emerald
}

export default async function Image({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

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
    // Fallback to defaults if DB unavailable
  }

  const scoreColor = getScoreColor(score);

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
            fontSize: 28,
            color: "#a1a1aa",
            textAlign: "center",
            letterSpacing: "2px",
            textTransform: "uppercase" as const,
          }}
        >
          Defense Milestone Score
        </div>
        <div
          style={{
            fontSize: 140,
            fontWeight: 800,
            color: scoreColor,
            textAlign: "center",
            lineHeight: 1.1,
            marginTop: 20,
          }}
        >
          {score}
        </div>
        <div
          style={{
            fontSize: 36,
            fontWeight: 700,
            color: scoreColor,
            textAlign: "center",
            marginTop: 10,
          }}
        >
          {band}
        </div>
        <div
          style={{
            fontSize: 20,
            color: "#71717a",
            marginTop: 40,
            textAlign: "center",
          }}
        >
          Check yours free at imnotanattorney.com/score
        </div>
        <div
          style={{
            fontSize: 18,
            color: "#52525b",
            marginTop: 16,
            textAlign: "center",
          }}
        >
          ImNotAnAttorney — Know What They Know.
        </div>
      </div>
    ),
    { ...size }
  );
}
