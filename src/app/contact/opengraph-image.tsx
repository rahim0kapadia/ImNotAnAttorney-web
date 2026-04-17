import { renderOgImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-template";
export const alt = "Contact Us, ImNotAnAttorney";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export default async function Image() {
  return renderOgImage({
    title: "Stuck on a Report?\nWe Read Every Message.",
    subtitle: "No phones. No sales. Defendant-first support.",
    category: "Inside INAA",
  });
}
