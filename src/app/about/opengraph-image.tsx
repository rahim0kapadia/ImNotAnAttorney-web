import { renderOgImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-template";
export const runtime = "edge";
export const alt = "About — ImNotAnAttorney";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export default function Image() {
  return renderOgImage({ title: "Built by Defendants, for Defendants", subtitle: "We close the information gap between you and everyone else in the courtroom." });
}
