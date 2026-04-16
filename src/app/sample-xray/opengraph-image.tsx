import { renderOgImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-template";
export const alt = "Sample X-Ray Report — ImNotAnAttorney";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export default async function Image() {
  return renderOgImage({
    title: "Sample X-Ray Report",
    subtitle: "See a real X-Ray discovery analysis excerpt. Drug possession case.",
    eyebrow: "Free Preview",
  });
}
