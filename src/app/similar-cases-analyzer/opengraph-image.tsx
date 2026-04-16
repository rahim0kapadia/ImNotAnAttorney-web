import { renderOgImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-template";
import { TIER_CORE } from "@/lib/tiers";
export const alt = "Similar Cases Analyzer — ImNotAnAttorney";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export default function Image() {
  const tier = TIER_CORE["similar-cases-analyzer"];
  return renderOgImage({
    title: "Similar Cases Analyzer",
    subtitle: "Find cases with facts like yours and see what happened.",
    eyebrow: tier?.priceDisplay ?? "$297",
  });
}
