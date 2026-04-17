/**
 * icon.tsx — Dynamic 32×32 favicon for browser tabs and link previews.
 *
 * Renders the INAA logo mark (man + magnifier + dossier on amber disc)
 * rather than the generic "I" — this is what iMessage/iOS show next to
 * the URL in rich link previews.
 */
import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0a0a0a",
          borderRadius: 6,
          overflow: "hidden",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="https://imnotanattorney.com/brand/inaa-logo.png"
          alt=""
          width={32}
          height={32}
        />
      </div>
    ),
    { ...size }
  );
}
