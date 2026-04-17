import { renderOgImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-template";
export const alt = "Criminal Defense Blog, ImNotAnAttorney";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export default async function Image() {
  return renderOgImage({
    title: "What Your Attorney\nWon't Have Time to Explain.",
    subtitle: "Investigations into the information gap — for defendants.",
    category: "Field Report",
  });
}
