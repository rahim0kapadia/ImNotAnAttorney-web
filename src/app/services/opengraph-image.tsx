import { renderOgImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-template";
import { TIER_CORE } from "@/lib/tiers";
export const alt = "Defense Intelligence Services, ImNotAnAttorney";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export default async function Image() {
  // Copy range: lowest playbook tier (dui-first-offense) → top service tier
  // (situation-room). Pulled from TIER_CORE so this OG stays accurate when
  // any tier price moves.
  const low = TIER_CORE["dui-first-offense"].priceDisplay;
  const high = TIER_CORE["situation-room"].priceDisplay;
  return renderOgImage({
    title: "Know the Case\nBefore They Do.",
    subtitle: `Five tiers of defense intelligence. ${low} to ${high}.`,
    category: "Defense Intelligence",
  });
}
