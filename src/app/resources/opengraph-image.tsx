import { renderOgImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-template";
export const alt = "Free Resources, ImNotAnAttorney";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export default async function Image() {
  return renderOgImage({
    title: "Free Research\nfor Defendants.",
    subtitle: "Guides, checklists, and templates. No email required.",
    category: "Field Report",
  });
}
