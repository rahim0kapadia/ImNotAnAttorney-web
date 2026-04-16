import { renderOgImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-template";
export const runtime = "edge";
export const alt = "Plea Deal Analyzer — ImNotAnAttorney";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export default function Image() {
  return renderOgImage({
    title: "Is Your Plea Offer Fair?",
    subtitle: "Upload your plea offer details and get an honest analysis in minutes.",
    eyebrow: "Free Tool",
  });
}
