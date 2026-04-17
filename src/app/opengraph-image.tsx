/**
 * Root Open Graph image — served for the homepage and any page that lacks
 * its own opengraph-image. Uses the shared template so branding stays consistent.
 */
import { renderOgImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-template";

export const alt = "ImNotAnAttorney — Know What They Know";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image() {
  return renderOgImage({
    title: "Know\nWhat They Know.",
    subtitle:
      "The prosecution has a file on you.\nWe help you build one on them.",
    category: "Defense Intelligence",
  });
}
