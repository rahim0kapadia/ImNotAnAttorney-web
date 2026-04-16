import { renderOgImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-template";
export const alt = "DUI Defense by State — ImNotAnAttorney";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export default async function Image() {
  return renderOgImage({
    title: "DUI Defense Resources by State",
    subtitle: "BAC limits, penalties, and defense strategies for all 50 states.",
  });
}
