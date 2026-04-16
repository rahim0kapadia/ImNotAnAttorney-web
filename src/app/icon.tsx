/**
 * icon.tsx, Dynamic favicon for browser tabs.
 *
 * Generates a 32x32 PNG with the INAA brand mark:
 * Amber "I" on dark background with rounded corners.
 * Replaces the old default favicon.ico.
 */
import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          background: "linear-gradient(135deg, #18181b 0%, #09090b 100%)",
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 8,
        }}
      >
        <span
          style={{
            fontSize: 22,
            fontWeight: 900,
            color: "#f59e0b",
            lineHeight: 1,
          }}
        >
          I
        </span>
      </div>
    ),
    { ...size }
  );
}
