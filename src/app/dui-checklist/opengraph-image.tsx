import { renderOgImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-template";
export const alt = "DUI Checklist, ImNotAnAttorney";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export default async function Image() {
  return renderOgImage({
    title: "What to Do After a DUI Arrest",
    subtitle: "The 3 things to do in the next 72 hours. Free checklist.",
    eyebrow: "Free 72-Hour Checklist",
  });
}
