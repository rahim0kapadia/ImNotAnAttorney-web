/**
 * apple-icon.tsx, Apple Touch Icon for iOS home screen bookmarks.
 *
 * 180x180 PNG. Larger canvas allows the full "INAA" mark.
 * Dark gradient background with amber text matching brand.md.
 */
import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          background: "linear-gradient(135deg, #18181b 0%, #09090b 100%)",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 36,
        }}
      >
        <span
          style={{
            fontSize: 52,
            fontWeight: 900,
            color: "#f59e0b",
            lineHeight: 1,
            letterSpacing: -1,
          }}
        >
          INAA
        </span>
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: "#71717a",
            marginTop: 8,
            letterSpacing: 2,
            textTransform: "uppercase",
          }}
        >
          Know What They Know
        </span>
      </div>
    ),
    { ...size }
  );
}
