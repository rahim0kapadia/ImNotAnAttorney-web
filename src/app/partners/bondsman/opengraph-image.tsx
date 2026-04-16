import { renderOgImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-template";
export const runtime = "edge";
export const alt = "Bail Bond Partner Program — ImNotAnAttorney";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export default function Image() {
  return renderOgImage({ title: "Bail Bond Partner Program", subtitle: "Court reminders, compliance tools, and commission on referrals for your clients." });
}
