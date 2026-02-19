import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          background: "#09090b",
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 6,
        }}
      >
        <span
          style={{
            fontSize: 18,
            fontWeight: 800,
            color: "#F59E0B",
            letterSpacing: -1,
          }}
        >
          IA
        </span>
      </div>
    ),
    { ...size }
  );
}
