import { renderOgImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-template";
export const alt = "Get Started — ImNotAnAttorney";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export default async function Image() {
  return renderOgImage({
    title: "Get Started",
    subtitle: "You have an attorney. You don't understand your case. That's the gap we close.",
  });
}
