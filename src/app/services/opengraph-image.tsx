import { renderOgImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-template";
export const runtime = "edge";
export const alt = "Defense Intelligence Services — ImNotAnAttorney";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export default function Image() {
  return renderOgImage({
    title: "Defense Intelligence Services",
    subtitle: "Five tiers of defense analysis — from charge decoding to full discovery.",
  });
}
