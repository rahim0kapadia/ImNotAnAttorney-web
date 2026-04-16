import { renderOgImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-template";
import { TIER_CORE } from "@/lib/tiers";
export const alt = "District Court Intelligence — ImNotAnAttorney";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export default function Image() {
  const tier = TIER_CORE["district-court-intelligence"];
  return renderOgImage({
    title: "District Court Intelligence",
    subtitle:
      "Federal district-level sentencing patterns, conviction rates, and trends.",
    eyebrow: tier?.priceDisplay ?? "$197",
  });
}
