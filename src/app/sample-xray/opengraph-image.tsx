import { renderOgImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-template";
import { TIER_CORE } from "@/lib/tiers";
export const alt = "Sample X-Ray Report, ImNotAnAttorney";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export default async function Image() {
  return renderOgImage({
    title: `See What ${TIER_CORE["x-ray"].priceDisplay}\nActually Buys.`,
    subtitle: "Real X-Ray discovery analysis. Redacted. Nothing hidden.",
    category: "Defense Intelligence",
  });
}
