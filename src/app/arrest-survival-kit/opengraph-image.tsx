import { renderOgImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-template";
import { TIER_CORE } from "@/lib/tiers";
export const alt = "Arrest Survival Kit, ImNotAnAttorney";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export default async function Image() {
  return renderOgImage({
    title: "Know Your Rights Before\nThey Read Them.",
    subtitle: "The first 72 hours after an arrest. State-specific.",
    category: "State Briefing",
  });
}
