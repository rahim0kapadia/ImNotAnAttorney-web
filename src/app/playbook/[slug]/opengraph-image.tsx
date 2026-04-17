/**
 * playbook/[slug]/opengraph-image.tsx — Dynamic per-playbook OG image.
 *
 * Pulls the playbook config's hero text and tier price, then renders through
 * the shared OG template so every playbook preview matches site branding.
 */
import { renderOgImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-template";
import { getPlaybookConfig } from "@/lib/playbook-configs";

export const alt = "Defense Playbook — ImNotAnAttorney";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const config = getPlaybookConfig(slug);
  if (!config) {
    return renderOgImage({
      title: "Pick Your Charge.\nGet the Playbook.",
      subtitle: "Instant PDF. Eight charge types.",
      category: "Defense Playbook",
    });
  }
  const raw = config.hero.subheadline;
  const subtitle =
    raw.length > 120
      ? raw.slice(0, raw.lastIndexOf(" ", 118)).replace(/[,;:\s]+$/, "") + "…"
      : raw;
  return renderOgImage({
    title: config.hero.headline,
    subtitle,
    category: "Defense Playbook",
  });
}
