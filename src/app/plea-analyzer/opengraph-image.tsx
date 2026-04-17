import { renderOgImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-template";
export const alt = "Plea Deal Analyzer, ImNotAnAttorney";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export default async function Image() {
  return renderOgImage({
    title: "Is Your Plea Deal\nActually a Deal?",
    subtitle: "Before you sign, know what you're signing.",
    category: "Defense Intelligence",
  });
}
