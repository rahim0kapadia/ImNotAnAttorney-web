import { renderOgImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-template";
import { getPartnerByCode } from "@/lib/partner-by-code";
import { truncateName } from "@/lib/truncate-name";
import { TIER_CORE, type TierSlug } from "@/lib/tiers";
import { resolveReferralProduct } from "@/lib/referral-product-map";
import { partnerBrandingEnabled } from "@/lib/partner-branding/feature-flag";

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
// 1h TTL. Longer than /r/[code] (300s) because tier metadata rarely changes
// and logo prefetch is the heaviest op in renderOgImage.
export const revalidate = 3600;

// Dynamic alt per tier + partner. See /r/[code]/opengraph-image.tsx comment
// for the Next.js 15 rationale.
export async function generateImageMetadata({
  params,
}: {
  params: Promise<{ code: string; product: string }>;
}) {
  const { code, product } = await params;
  const partner = await getPartnerByCode(code);
  const tierSlug = resolveReferralProduct(product);
  const tierName = tierSlug ? TIER_CORE[tierSlug].name : "Defense Intelligence";
  const referrer = partner ? truncateName(partner.company || partner.name) : null;
  const alt = referrer
    ? `${tierName} via ${referrer} — ImNotAnAttorney`
    : `${tierName} — ImNotAnAttorney`;
  return [
    {
      id: "main",
      contentType: OG_CONTENT_TYPE,
      size: OG_SIZE,
      alt,
    },
  ];
}

// Tier-specific OG subtitles. UPL-safe, information-framed, no outcome claims.
// Playbook is a self-serve guide, NOT personalized analysis — copy must not
// imply we build questions from the buyer's record (that's Case Decoder+).
// Line breaks (\n) are intentional — og-template renders pre-line.
const TIER_SUBTITLES: Partial<Record<TierSlug, string>> = {
  "case-decoder": "Charge decode + 10-15\nquestions for your attorney.",
  "intelligence-brief": "Judge + prosecutor briefing +\n15-25 targeted questions.",
  "x-ray": "Every discovery doc cross-referenced.\n35-50 questions from your record.",
  "war-room": "Ongoing intelligence operation\nthrough your case.",
  "situation-room": "Full-team defense coordination\nacross every stage.",
  "dui-first-offense": "Charge decode + question\nplaybook for your attorney.",
};

const TIER_CATEGORY: Partial<Record<TierSlug, string>> = {
  "case-decoder": "Defense Intelligence",
  "intelligence-brief": "Defense Intelligence",
  "x-ray": "Defense Intelligence",
  "war-room": "Defense Intelligence",
  "situation-room": "Defense Intelligence",
  "dui-first-offense": "Defense Playbook",
};

export default async function Image({
  params,
}: {
  params: Promise<{ code: string; product: string }>;
}) {
  const { code, product } = await params;
  const partner = await getPartnerByCode(code);
  const tierSlug = resolveReferralProduct(product);

  // Unknown tier but partner is valid: render partner-branded generic card so
  // scrapers hitting /r/ABC123/invalid-slug still show the bondsman's brand.
  if (partner && !tierSlug) {
    const partnerName = truncateName(partner.company || partner.name);
    const brandingOn =
      partnerBrandingEnabled() &&
      partner.brand_contrast_passed === true &&
      (!!partner.logo_url || !!partner.brand_color_primary);
    return renderOgImage({
      title: `Defense research\nvia ${partnerName}`,
      subtitle: "Legal information, not legal advice.",
      category: "Defense Intelligence",
      partnerBranding: brandingOn
        ? {
            logoUrl: partner.logo_url ?? null,
            accentHex: partner.brand_color_primary ?? "#f59e0b",
            partnerName,
          }
        : undefined,
    });
  }

  if (!partner || !tierSlug) {
    return renderOgImage({
      title: "Defense research\nfor your case.",
      subtitle: "Legal information, not legal advice.",
      category: "Defense Intelligence",
    });
  }

  const tier = TIER_CORE[tierSlug];
  const partnerName = truncateName(partner.company || partner.name);
  const brandingOn =
    partnerBrandingEnabled() &&
    partner.brand_contrast_passed === true &&
    (!!partner.logo_url || !!partner.brand_color_primary);

  return renderOgImage({
    title: `${tier.name}\nvia ${partnerName}`,
    subtitle: TIER_SUBTITLES[tierSlug],
    category: TIER_CATEGORY[tierSlug] ?? "Defense Intelligence",
    partnerBranding: brandingOn
      ? {
          logoUrl: partner.logo_url ?? null,
          accentHex: partner.brand_color_primary ?? "#f59e0b",
          partnerName,
        }
      : undefined,
  });
}
