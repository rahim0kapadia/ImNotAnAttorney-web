import { renderOgImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-template";
export const alt = "Family Support, ImNotAnAttorney";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export default async function Image() {
  return renderOgImage({
    title: "Your Family Member\nWas Arrested.",
    subtitle: "Here's how you can actually help — not just wait.",
    category: "Inside INAA",
  });
}
