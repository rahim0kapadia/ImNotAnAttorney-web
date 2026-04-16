import { renderOgImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-template";
export const alt = "IDD Scholarship, ImNotAnAttorney";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export default async function Image() {
  return renderOgImage({ title: "IDD Scholarship Program", subtitle: "Free defense information for defendants who cannot afford it." });
}
