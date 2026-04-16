import { renderOgImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-template";
import { TIER_CORE } from "@/lib/tiers";
export const alt = "Officer Background Check — ImNotAnAttorney";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export default function Image() {
  const tier = TIER_CORE["officer-background-check"];
  return renderOgImage({
    title: "Officer Background Check",
    subtitle:
      "Cross-case officer reliability analysis and discreditation history.",
    eyebrow: tier?.priceDisplay ?? "$97",
  });
}
