import { renderOgImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-template";
import { TIER_CORE } from "@/lib/tiers";
export const alt = "District Court Intelligence, ImNotAnAttorney";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export default async function Image() {
  return renderOgImage({
    title: "Your District's\nSentencing Map.",
    subtitle: "How federal judges here actually sentence — not the statute, the reality.",
    category: "Defense Intelligence",
  });
}
