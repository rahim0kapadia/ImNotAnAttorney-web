import { renderOgImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-template";
export const alt = "Free Defense Score, ImNotAnAttorney";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export default async function Image() {
  return renderOgImage({
    title: "Is Your Defense\non Track?",
    subtitle: "Ten questions. Two minutes. Anonymous.",
    category: "Defense Intelligence",
  });
}
