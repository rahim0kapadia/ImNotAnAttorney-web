/**
 * /start layout, metadata for the Covello-compliant crisis entry page.
 *
 * Metadata is in the layout because the page component is a client component
 * (requires useState for interactive document routing).
 */
import type { Metadata } from "next";
import { SITE_URL } from "@/lib/site";
import { TIER_CORE } from "@/lib/tiers";

export function generateMetadata(): Metadata {
  return {
    title: "Get Started",
    description:
      "You have an attorney. You don't understand your case. That's the gap we fill. 40+ elite defense attorneys' methodology applied to your specific charges.",
    alternates: {
      canonical: `${SITE_URL}/start`,
    },
    openGraph: {
      title: "You have an attorney. You don't understand your case. We fill the gap.",
      description: `40+ elite defense attorneys' methodology. Applied to your specific charges. Case Decoder from ${TIER_CORE["case-decoder"].priceDisplay}. The X-Ray from ${TIER_CORE["x-ray"].priceDisplay}.`,
    },
  };
}

export default function StartLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
