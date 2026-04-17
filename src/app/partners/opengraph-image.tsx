import { renderOgImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-template";
export const alt = "Become a Partner, ImNotAnAttorney";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export default async function Image() {
  return renderOgImage({
    title: "Help Defendants Prepare.\nGet Paid for It.",
    subtitle: "Commission on every referral. No overhead. Transparent terms.",
    category: "Partner Network",
  });
}
