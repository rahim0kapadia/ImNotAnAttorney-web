import { renderOgImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-template";
import { TIER_CORE } from "@/lib/tiers";
export const alt = "Arrest Survival Kit — ImNotAnAttorney";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export default async function Image() {
  const tier = TIER_CORE["arrest-survival-kit"];
  return renderOgImage({
    title: "Arrest Survival Kit",
    subtitle: "Know your rights before they read you yours. State-specific.",
    eyebrow: tier?.priceDisplay ?? "$47",
  });
}
