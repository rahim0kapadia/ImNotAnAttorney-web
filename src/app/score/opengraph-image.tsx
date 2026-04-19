import { renderOgImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-template";
export const alt = "Masked Researcher's First Read, ImNotAnAttorney";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export default async function Image() {
  return renderOgImage({
    title: "Masked Researcher's\nFirst Read",
    subtitle: "Ten questions. One memo. Anonymous.",
    category: "Defense Intelligence",
  });
}
