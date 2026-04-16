import { renderOgImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-template";
export const runtime = "edge";
export const alt = "Free Defense Score — ImNotAnAttorney";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export default function Image() {
  return renderOgImage({
    title: "Is Your Defense on Track?",
    subtitle: "Free, anonymous 10-question assessment. See where your defense stands.",
    eyebrow: "Free Tool",
  });
}
