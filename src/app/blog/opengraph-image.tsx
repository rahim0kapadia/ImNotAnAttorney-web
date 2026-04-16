import { renderOgImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-template";
export const alt = "Criminal Defense Blog — ImNotAnAttorney";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export default async function Image() {
  return renderOgImage({
    title: "Criminal Defense Blog",
    subtitle: "In-depth legal information and defense strategies for criminal defendants.",
  });
}
