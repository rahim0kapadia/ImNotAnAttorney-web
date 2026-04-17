import { renderOgImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-template";
export const alt = "Defense Intelligence Services, ImNotAnAttorney";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export default async function Image() {
  return renderOgImage({
    title: "Know the Case\nBefore They Do.",
    subtitle: "Five tiers of defense intelligence. $97 to $9,997.",
    category: "Defense Intelligence",
  });
}
