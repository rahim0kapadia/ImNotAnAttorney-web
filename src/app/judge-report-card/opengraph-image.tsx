import { renderOgImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-template";
import { TIER_CORE } from "@/lib/tiers";
export const alt = "Judge Report Card, ImNotAnAttorney";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export default async function Image() {
  const tier = TIER_CORE["judge-report-card"];
  return renderOgImage({
    title: "Judge Report Card",
    subtitle:
      "Sentencing patterns, prosecutor pairing data, and bench vs. jury divergence.",
    eyebrow: tier?.priceDisplay ?? "$197",
  });
}
