import { renderOgImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-template";
export const alt = "Sample Case Decoder, ImNotAnAttorney";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export default async function Image() {
  return renderOgImage({
    title: "See What a Case Decoder\nActually Looks Like.",
    subtitle: "Real case. Redacted. Nothing hidden.",
    category: "Defense Intelligence",
  });
}
