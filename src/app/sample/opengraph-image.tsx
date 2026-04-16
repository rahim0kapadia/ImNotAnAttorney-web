import { renderOgImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-template";
export const alt = "Sample Case Decoder, ImNotAnAttorney";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export default async function Image() {
  return renderOgImage({
    title: "Sample Case Decoder Report",
    subtitle: "See what a Case Decoder report actually looks like. Real case, redacted.",
    eyebrow: "Free Preview",
  });
}
