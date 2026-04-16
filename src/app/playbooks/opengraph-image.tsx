import { renderOgImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-template";
export const runtime = "edge";
export const alt = "Defense Playbooks — ImNotAnAttorney";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export default function Image() {
  return renderOgImage({
    title: "Defense Playbooks",
    subtitle: "Pick your charge type. Get an instant-download defense packet.",
    eyebrow: "Instant PDF Download",
  });
}
