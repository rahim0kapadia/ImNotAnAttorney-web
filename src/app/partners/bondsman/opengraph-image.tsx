import { renderOgImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-template";
export const alt = "Bail Bond Partner Program, ImNotAnAttorney";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export default async function Image() {
  return renderOgImage({
    title: "Your Bail Clients\nNeed More Than a Bond.",
    subtitle: "Free court reminders. Compliance tools. Commission on referrals.",
    category: "Partner Network",
  });
}
