import { renderOgImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-template";
export const alt = "DUI Checklist, ImNotAnAttorney";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export default async function Image() {
  return renderOgImage({
    title: "10 Days to Save\nYour License.",
    subtitle: "After a DUI, the clock is the case. Here's what to do first.",
    category: "State Briefing",
  });
}
